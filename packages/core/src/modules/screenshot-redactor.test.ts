import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { createScreenshotRedactor } from './screenshot-redactor.js';
import { createWorkdir } from '../workdir.js';

interface EvalCall {
  fn: string;
  arg: unknown;
}

interface MockPageState {
  evalCalls: EvalCall[];
  screenshotCalls: number;
  // The mock returns this for any page.evaluate that asks for the overlay count.
  matchedCount: number;
  overlayId: string;
}

function createMockPage(state: MockPageState): Page {
  return {
    async evaluate(fn: unknown, arg: unknown) {
      const fnSource = String(fn);
      state.evalCalls.push({ fn: fnSource, arg });
      // First evaluate: injects the overlay container; should return an id.
      if (fnSource.includes('ada-mask-') || fnSource.includes('createElement')) {
        return state.overlayId;
      }
      // Reads the matched count from the overlay's data attribute.
      if (fnSource.includes('adaCount')) return state.matchedCount;
      // Requests an animation frame.
      if (fnSource.includes('requestAnimationFrame')) return undefined;
      // Removes the overlay.
      if (fnSource.includes('remove()')) return undefined;
      return undefined;
    },
    async screenshot() {
      state.screenshotCalls += 1;
      return Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic header, fake content
    },
  } as unknown as Page;
}

describe('ScreenshotRedactor.capture', () => {
  it('returns a Buffer and invokes page.screenshot once', async () => {
    const state: MockPageState = {
      evalCalls: [],
      screenshotCalls: 0,
      matchedCount: 0,
      overlayId: 'ada-mask-test-id',
    };
    const page = createMockPage(state);
    const redactor = createScreenshotRedactor();
    const buf = await redactor.capture(page);
    assert.ok(Buffer.isBuffer(buf));
    assert.equal(state.screenshotCalls, 1);
    // Expect: inject overlay, read count, raf, remove overlay → 4 eval calls minimum.
    assert.ok(state.evalCalls.length >= 3, `got ${state.evalCalls.length}`);
  });

  it('appends an audit line when sensitive selectors were masked', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'ada-redactor-'));
    try {
      const workdir = createWorkdir(baseDir);
      const state: MockPageState = {
        evalCalls: [],
        screenshotCalls: 0,
        matchedCount: 2,
        overlayId: 'ada-mask-test-id',
      };
      const page = createMockPage(state);
      const redactor = createScreenshotRedactor({ workdir });
      await redactor.capture(page, { auditTag: 'scene=login step=3' });
      assert.ok(existsSync(workdir.auditLogPath));
      const content = readFileSync(workdir.auditLogPath, 'utf8');
      assert.match(content, /redactor masked=2 scene=login step=3/);
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it('merges defaults + extraSelectors + env into the selectors list', () => {
    const prev = process.env['ADA_MASK_SELECTORS'];
    process.env['ADA_MASK_SELECTORS'] = '.env-mask-a, .env-mask-b';
    try {
      const redactor = createScreenshotRedactor({ extraSelectors: ['.extra-mask'] });
      assert.ok(redactor.selectors.includes('input[type="password"]'));
      assert.ok(redactor.selectors.includes('[data-ada-mask]'));
      assert.ok(redactor.selectors.includes('.env-mask-a'));
      assert.ok(redactor.selectors.includes('.env-mask-b'));
      assert.ok(redactor.selectors.includes('.extra-mask'));
    } finally {
      if (prev === undefined) delete process.env['ADA_MASK_SELECTORS'];
      else process.env['ADA_MASK_SELECTORS'] = prev;
    }
  });
});
