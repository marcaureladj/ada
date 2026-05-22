/// <reference lib="dom" />
import { appendFileSync } from 'node:fs';
import type { Page } from 'playwright';
import type { Workdir } from '../workdir.js';

// Selectors that always trigger redaction. Customize via constructor option
// or the ADA_MASK_SELECTORS env var.
const DEFAULT_MASK_SELECTORS = ['input[type="password"]', '[data-ada-mask]'];

export interface RedactorOptions {
  /** Additional selectors to redact, merged with defaults + env. */
  extraSelectors?: string[];
  workdir?: Workdir;
}

export interface CaptureOptions {
  fullPage?: boolean;
  /** Path on disk to also write the redacted PNG (passed to page.screenshot). */
  path?: string;
  /** Tag included in the audit log line, e.g. "scene=home step=2". */
  auditTag?: string;
}

export interface ScreenshotRedactor {
  capture(page: Page, options?: CaptureOptions): Promise<Buffer>;
  readonly selectors: string[];
}

function envSelectors(): string[] {
  const raw = process.env['ADA_MASK_SELECTORS'];
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function createScreenshotRedactor(options: RedactorOptions = {}): ScreenshotRedactor {
  const selectors = [
    ...DEFAULT_MASK_SELECTORS,
    ...envSelectors(),
    ...(options.extraSelectors ?? []),
  ];

  const workdir = options.workdir;

  function audit(line: string): void {
    if (!workdir) return;
    appendFileSync(workdir.auditLogPath, `${new Date().toISOString()} ${line}\n`, 'utf8');
  }

  return {
    selectors,
    async capture(page: Page, captureOptions: CaptureOptions = {}): Promise<Buffer> {
      // Inject overlays for each matching element, then wait one paint frame.
      const overlayId = await page.evaluate((sels) => {
        const ADA_OVERLAY_ID = `ada-mask-${Math.random().toString(36).slice(2)}`;
        const container = document.createElement('div');
        container.id = ADA_OVERLAY_ID;
        container.style.cssText =
          'position:fixed;inset:0;pointer-events:none;z-index:2147483646;';
        let matchedCount = 0;
        for (const sel of sels) {
          try {
            const nodes = document.querySelectorAll(sel);
            for (const node of Array.from(nodes)) {
              const rect = (node as HTMLElement).getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) continue;
              const mask = document.createElement('div');
              mask.style.cssText = [
                'position:fixed',
                `top:${Math.floor(rect.top)}px`,
                `left:${Math.floor(rect.left)}px`,
                `width:${Math.ceil(rect.width)}px`,
                `height:${Math.ceil(rect.height)}px`,
                'background:#000',
                'border:2px solid #f44',
                'pointer-events:none',
              ].join(';');
              container.appendChild(mask);
              matchedCount += 1;
            }
          } catch {
            // Invalid selector — skip.
          }
        }
        document.body.appendChild(container);
        // Encode the count in the id so we can read it back without a second eval.
        container.dataset['adaCount'] = String(matchedCount);
        return ADA_OVERLAY_ID;
      }, selectors);

      const matchedCount = await page.evaluate(
        (id) => Number(document.getElementById(id)?.dataset['adaCount'] ?? 0),
        overlayId,
      );

      if (matchedCount > 0) {
        audit(`redactor masked=${matchedCount} ${captureOptions.auditTag ?? ''}`.trim());
      }

      // One animation frame so the overlays paint.
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      );

      const screenshot = await page.screenshot({
        fullPage: captureOptions.fullPage ?? false,
        ...(captureOptions.path !== undefined ? { path: captureOptions.path } : {}),
      });

      // Remove overlay container.
      await page.evaluate((id) => {
        const node = document.getElementById(id);
        node?.remove();
      }, overlayId);

      return screenshot;
    },
  };
}
