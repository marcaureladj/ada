import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page, BrowserContext } from 'playwright';
import { createAuthModule } from './auth.js';
import { createWorkdir } from '../workdir.js';
import type { AuthConfig } from '../types.js';

interface CallLog {
  fills: Array<{ selector: string; value: string }>;
  clicks: string[];
  navigations: string[];
}

interface MockPageOptions {
  visibleSelectors?: Set<string>;
  presentSelectors?: Map<string, number>;
  urlSequence?: string[];
}

function createMockPage(options: MockPageOptions = {}): { page: Page; calls: CallLog } {
  const calls: CallLog = { fills: [], clicks: [], navigations: [] };
  let urlIdx = 0;
  const urls = options.urlSequence ?? ['https://example.com/login'];
  const visible = options.visibleSelectors ?? new Set<string>();
  const present = options.presentSelectors ?? new Map<string, number>();

  const page = {
    url: () => urls[Math.min(urlIdx, urls.length - 1)] ?? 'https://example.com/',
    locator(selector: string) {
      return {
        first() {
          return {
            async waitFor(opts: { state: string; timeout: number }) {
              void opts;
              if (visible.has(selector)) return;
              throw new Error(`locator ${selector} not visible`);
            },
          };
        },
        async count() {
          return present.get(selector) ?? (visible.has(selector) ? 1 : 0);
        },
      };
    },
    async fill(selector: string, value: string) {
      calls.fills.push({ selector, value });
    },
    async click(selector: string) {
      calls.clicks.push(selector);
      urlIdx += 1;
    },
    async waitForLoadState(_state: string, _opts: { timeout: number }) {
      void _state;
      void _opts;
    },
    async goto(url: string) {
      calls.navigations.push(url);
    },
  } as unknown as Page;

  return { page, calls };
}

function mockContext(): BrowserContext {
  return {
    async storageState() {
      return { cookies: [{ name: 'session', value: 'opaque' }], origins: [] };
    },
  } as unknown as BrowserContext;
}

function withWorkdir<T>(fn: (workdir: ReturnType<typeof createWorkdir>) => Promise<T>): Promise<T> {
  const baseDir = mkdtempSync(join(tmpdir(), 'ada-auth-'));
  const workdir = createWorkdir(baseDir);
  return fn(workdir).finally(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });
}

describe('AuthModule.execute', () => {
  it('returns success: true and skips work for type=none', async () => {
    await withWorkdir(async (workdir) => {
      const { page } = createMockPage();
      const auth: AuthConfig = { type: 'none' };
      const mod = createAuthModule({ timeoutMs: 50 });
      const result = await mod.execute({ page, context: mockContext(), auth, workdir });
      assert.equal(result.success, true);
      assert.equal(result.type, 'none');
      assert.ok(result.auditLog.some((l) => l.includes('skipped')));
    });
  });

  it('fills credentials and clicks submit on success', async () => {
    await withWorkdir(async (workdir) => {
      const visible = new Set<string>([
        'input[type="email"]',
        'input[type="password"]',
        'button[type="submit"]',
      ]);
      const { page, calls } = createMockPage({
        visibleSelectors: visible,
        urlSequence: ['https://example.com/login', 'https://example.com/dashboard'],
      });
      const auth: AuthConfig = {
        type: 'credentials',
        email: 'alice@test.com',
        password: 'hunter2-very-secret',
      };
      const mod = createAuthModule({ timeoutMs: 50 });
      const result = await mod.execute({ page, context: mockContext(), auth, workdir });

      assert.equal(result.success, true);
      assert.equal(calls.fills.length, 2);
      assert.equal(calls.fills[0]?.selector, 'input[type="email"]');
      assert.equal(calls.fills[0]?.value, 'alice@test.com');
      assert.equal(calls.fills[1]?.selector, 'input[type="password"]');
      assert.equal(calls.fills[1]?.value, 'hunter2-very-secret');
      assert.equal(calls.clicks.length, 1);
      assert.equal(calls.clicks[0], 'button[type="submit"]');
      assert.ok(result.storageStatePath, 'storageState path should be set');
      assert.ok(existsSync(workdir.authStatePath));
    });
  });

  it('NEVER leaks the password into auditLog or audit.log on disk', async () => {
    await withWorkdir(async (workdir) => {
      const visible = new Set<string>([
        'input[type="email"]',
        'input[type="password"]',
        'button[type="submit"]',
      ]);
      const { page } = createMockPage({
        visibleSelectors: visible,
        urlSequence: ['https://x.com/login', 'https://x.com/home'],
      });
      const password = 'P@ssw0rd!secret-canary-12345';
      const auth: AuthConfig = {
        type: 'credentials',
        email: 'alice@test.com',
        password,
      };
      const mod = createAuthModule({ timeoutMs: 50 });
      const result = await mod.execute({ page, context: mockContext(), auth, workdir });

      const auditStr = result.auditLog.join('\n');
      assert.ok(!auditStr.includes(password), 'password leaked in auditLog');

      const onDisk = existsSync(workdir.auditLogPath)
        ? readFileSync(workdir.auditLogPath, 'utf8')
        : '';
      assert.ok(!onDisk.includes(password), 'password leaked in audit.log file');
    });
  });

  it('returns success: false when password field is missing', async () => {
    await withWorkdir(async (workdir) => {
      const visible = new Set<string>(['input[type="email"]']);
      const { page } = createMockPage({ visibleSelectors: visible });
      const auth: AuthConfig = {
        type: 'credentials',
        email: 'alice@test.com',
        password: 'secret',
      };
      const mod = createAuthModule({ timeoutMs: 50 });
      const result = await mod.execute({ page, context: mockContext(), auth, workdir });
      assert.equal(result.success, false);
      assert.match(result.error ?? '', /password introuvable/);
    });
  });

  it('returns api_key as not implemented', async () => {
    await withWorkdir(async (workdir) => {
      const { page } = createMockPage();
      const auth: AuthConfig = { type: 'api_key', apiKey: 'sk-test' };
      const mod = createAuthModule({ timeoutMs: 50 });
      const result = await mod.execute({ page, context: mockContext(), auth, workdir });
      assert.equal(result.success, false);
      assert.match(result.error ?? '', /api_key non implémenté/);
    });
  });

  it('detects a CAPTCHA iframe and aborts', async () => {
    await withWorkdir(async (workdir) => {
      const { page } = createMockPage({
        presentSelectors: new Map([['iframe[src*="recaptcha"]', 1]]),
      });
      const auth: AuthConfig = {
        type: 'credentials',
        email: 'a@b.c',
        password: 'pw',
      };
      const mod = createAuthModule({ timeoutMs: 50 });
      const result = await mod.execute({ page, context: mockContext(), auth, workdir });
      assert.equal(result.success, false);
      assert.match(result.error ?? '', /CAPTCHA/);
    });
  });
});
