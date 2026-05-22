import { appendFileSync, writeFileSync } from 'node:fs';
import type { Page, BrowserContext } from 'playwright';
import { ModuleError } from '../errors.js';
import type { AuthConfig, AuthReport } from '../types.js';
import type { Workdir } from '../workdir.js';

// Heuristic selectors tried in order. First match wins.
const EMAIL_SELECTORS = [
  'input[type="email"]',
  'input[autocomplete="username"]',
  'input[autocomplete="email"]',
  'input[name*="email" i]',
  'input[name*="user" i]',
  'input[id*="email" i]',
  'input[id*="user" i]',
];

const PASSWORD_SELECTORS = ['input[type="password"]'];

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("Sign in")',
  'button:has-text("Log in")',
  'button:has-text("Login")',
  'button:has-text("Connexion")',
  'button:has-text("Se connecter")',
];

const SIGNUP_LINK_SELECTORS = [
  'a:has-text("Sign up")',
  'a:has-text("Sign Up")',
  'a:has-text("Inscription")',
  'a:has-text("Créer un compte")',
  'a[href*="signup" i]',
  'a[href*="register" i]',
];

const CONFIRM_PASSWORD_SELECTORS = [
  'input[name*="confirm" i]',
  'input[name*="repeat" i]',
  'input[id*="confirm" i]',
  'input[id*="repeat" i]',
];

const CAPTCHA_INDICATORS = [
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  'iframe[title*="captcha" i]',
];

export interface AuthOptions {
  emailSelectors?: string[];
  passwordSelectors?: string[];
  submitSelectors?: string[];
  signupLinkSelectors?: string[];
  timeoutMs?: number;
}

export interface AuthModuleInput {
  page: Page;
  context: BrowserContext;
  auth: AuthConfig;
  workdir: Workdir;
}

export interface AuthModule {
  execute(input: AuthModuleInput): Promise<AuthReport>;
}

function appendAudit(workdir: Workdir, line: string): void {
  // Audit log is append-only and never contains secrets.
  const stamp = new Date().toISOString();
  appendFileSync(workdir.auditLogPath, `${stamp} ${line}\n`, 'utf8');
}

async function findFirstVisible(
  page: Page,
  selectors: string[],
  timeoutMs: number,
): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const locator = page.locator(sel).first();
      await locator.waitFor({ state: 'visible', timeout: timeoutMs });
      return sel;
    } catch {
      // try next selector
    }
  }
  return null;
}

async function detectCaptcha(page: Page): Promise<boolean> {
  for (const sel of CAPTCHA_INDICATORS) {
    if ((await page.locator(sel).count()) > 0) return true;
  }
  return false;
}

export function createAuthModule(options: AuthOptions = {}): AuthModule {
  const emailSels = options.emailSelectors ?? [
    ...(process.env['ADA_AUTH_EMAIL_SELECTOR']
      ? [process.env['ADA_AUTH_EMAIL_SELECTOR']]
      : []),
    ...EMAIL_SELECTORS,
  ];
  const passwordSels = options.passwordSelectors ?? [
    ...(process.env['ADA_AUTH_PASSWORD_SELECTOR']
      ? [process.env['ADA_AUTH_PASSWORD_SELECTOR']]
      : []),
    ...PASSWORD_SELECTORS,
  ];
  const submitSels = options.submitSelectors ?? [
    ...(process.env['ADA_AUTH_SUBMIT_SELECTOR']
      ? [process.env['ADA_AUTH_SUBMIT_SELECTOR']]
      : []),
    ...SUBMIT_SELECTORS,
  ];
  const signupSels = options.signupLinkSelectors ?? SIGNUP_LINK_SELECTORS;
  const timeoutMs = options.timeoutMs ?? 5000;

  async function fillCredentials(
    page: Page,
    audit: string[],
    auth: AuthConfig,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const emailSel = await findFirstVisible(page, emailSels, timeoutMs);
    if (!emailSel) return { ok: false, error: 'champ email/identifiant introuvable' };
    audit.push(`found email field: ${emailSel}`);

    const passwordSel = await findFirstVisible(page, passwordSels, timeoutMs);
    if (!passwordSel) return { ok: false, error: 'champ password introuvable' };
    audit.push(`found password field: ${passwordSel}`);

    if (!auth.email || !auth.password) {
      return { ok: false, error: 'email ou password absent dans auth config' };
    }
    await page.fill(emailSel, auth.email);
    audit.push(`filled email field (value redacted, length=${auth.email.length})`);
    await page.fill(passwordSel, auth.password);
    audit.push(`filled password field (value redacted, length=${auth.password.length})`);
    return { ok: true };
  }

  async function clickSubmit(
    page: Page,
    audit: string[],
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const submitSel = await findFirstVisible(page, submitSels, timeoutMs);
    if (!submitSel) return { ok: false, error: 'bouton submit introuvable' };
    audit.push(`clicking submit: ${submitSel}`);
    const initialUrl = page.url();
    await page.click(submitSel);
    try {
      await page.waitForLoadState('networkidle', { timeout: 10_000 });
    } catch {
      audit.push('networkidle timeout (continuing)');
    }
    const finalUrl = page.url();
    audit.push(`url before=${initialUrl} after=${finalUrl}`);
    return { ok: true };
  }

  async function persistStorageState(
    context: BrowserContext,
    workdir: Workdir,
    audit: string[],
  ): Promise<string> {
    const state = await context.storageState();
    writeFileSync(workdir.authStatePath, JSON.stringify(state, null, 2), 'utf8');
    audit.push(`storage state persisted (cookies=${state.cookies.length})`);
    return workdir.authStatePath;
  }

  return {
    async execute(input: AuthModuleInput): Promise<AuthReport> {
      const { page, context, auth, workdir } = input;
      const start = Date.now();
      const audit: string[] = [];
      audit.push(`auth start type=${auth.type} url=${page.url()}`);
      appendAudit(workdir, `auth start type=${auth.type}`);

      const baseReport = (
        partial: Pick<AuthReport, 'success' | 'storageStatePath' | 'error'>,
      ): AuthReport => ({
        type: auth.type,
        durationSec: (Date.now() - start) / 1000,
        auditLog: audit,
        ...partial,
      });

      if (auth.type === 'none') {
        audit.push('auth skipped (type=none)');
        return baseReport({ success: true });
      }

      if (await detectCaptcha(page)) {
        audit.push('CAPTCHA detected — aborting auth');
        return baseReport({ success: false, error: 'CAPTCHA détecté sur la page' });
      }

      try {
        if (auth.type === 'credentials') {
          const filled = await fillCredentials(page, audit, auth);
          if (!filled.ok) return baseReport({ success: false, error: filled.error });
          const submitted = await clickSubmit(page, audit);
          if (!submitted.ok) return baseReport({ success: false, error: submitted.error });
          const storageStatePath = await persistStorageState(context, workdir, audit);
          appendAudit(workdir, 'auth succeeded (credentials)');
          return baseReport({ success: true, storageStatePath });
        }

        if (auth.type === 'signup') {
          // Try to follow a signup link if we're on a login page.
          const signupSel = await findFirstVisible(page, signupSels, 1500).catch(() => null);
          if (signupSel) {
            audit.push(`following signup link: ${signupSel}`);
            await page.click(signupSel);
            await page
              .waitForLoadState('networkidle', { timeout: 10_000 })
              .catch(() => undefined);
          }

          const filled = await fillCredentials(page, audit, auth);
          if (!filled.ok) return baseReport({ success: false, error: filled.error });

          // Optional confirm-password field
          for (const sel of CONFIRM_PASSWORD_SELECTORS) {
            const count = await page.locator(sel).count();
            if (count > 0) {
              audit.push(`filling confirm password field: ${sel}`);
              await page.fill(sel, auth.password ?? '');
              break;
            }
          }

          const submitted = await clickSubmit(page, audit);
          if (!submitted.ok) return baseReport({ success: false, error: submitted.error });

          const storageStatePath = await persistStorageState(context, workdir, audit);
          appendAudit(workdir, 'auth succeeded (signup)');
          audit.push(
            'signup completed; email verification may still be pending (v1 limitation)',
          );
          return baseReport({ success: true, storageStatePath });
        }

        if (auth.type === 'api_key') {
          throw new ModuleError(
            'AuthModule',
            'type=api_key non implémenté en v1 (rarement saisi dans l\'UI). Utilisez auth.type=credentials.',
          );
        }

        return baseReport({ success: false, error: `auth.type inconnu: ${String(auth.type)}` });
      } catch (err) {
        const message = err instanceof ModuleError ? err.message : (err as Error).message;
        appendAudit(workdir, `auth failed: ${message}`);
        audit.push(`auth failed: ${message}`);
        return baseReport({ success: false, error: message });
      }
    },
  };
}
