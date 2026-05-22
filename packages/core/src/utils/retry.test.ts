import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractRetryAfterMs,
  isTransient,
  withRetry,
  type RetryOptions,
} from './retry.js';

const fastSleep: RetryOptions['sleep'] = async () => undefined;

describe('isTransient', () => {
  it('classifies 429 / 5xx as transient', () => {
    assert.equal(isTransient({ status: 429 }), true);
    assert.equal(isTransient({ status: 500 }), true);
    assert.equal(isTransient({ status: 502 }), true);
    assert.equal(isTransient({ status: 503 }), true);
    assert.equal(isTransient({ statusCode: 504 }), true);
  });

  it('classifies 4xx (non-429/408/425) as permanent', () => {
    assert.equal(isTransient({ status: 400 }), false);
    assert.equal(isTransient({ status: 401 }), false);
    assert.equal(isTransient({ status: 403 }), false);
    assert.equal(isTransient({ status: 404 }), false);
  });

  it('classifies Node network codes as transient', () => {
    assert.equal(isTransient({ code: 'ECONNRESET' }), true);
    assert.equal(isTransient({ code: 'ETIMEDOUT' }), true);
    assert.equal(isTransient({ code: 'ENOTFOUND' }), true);
    assert.equal(isTransient({ code: 'EAI_AGAIN' }), true);
  });

  it('returns false for plain JS errors and non-objects', () => {
    assert.equal(isTransient(new Error('boom')), false);
    assert.equal(isTransient(null), false);
    assert.equal(isTransient('string'), false);
  });
});

describe('extractRetryAfterMs', () => {
  it('parses integer seconds', () => {
    const err = { headers: { 'retry-after': '5' } };
    assert.equal(extractRetryAfterMs(err), 5000);
  });

  it('parses HTTP-date header', () => {
    const future = new Date(Date.now() + 4000).toUTCString();
    const err = { headers: { 'retry-after': future } };
    const got = extractRetryAfterMs(err);
    assert.ok(got !== undefined && got > 2000 && got < 6000, `got ${got}`);
  });

  it('handles capitalized header', () => {
    const err = { headers: { 'Retry-After': '2' } };
    assert.equal(extractRetryAfterMs(err), 2000);
  });

  it('returns undefined when missing', () => {
    assert.equal(extractRetryAfterMs({}), undefined);
    assert.equal(extractRetryAfterMs({ headers: {} }), undefined);
  });
});

describe('withRetry', () => {
  it('succeeds on first attempt without sleeping', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const { result, stats } = await withRetry(
      async () => {
        calls += 1;
        return 'ok';
      },
      { sleep: async (ms) => void sleeps.push(ms) },
    );
    assert.equal(result, 'ok');
    assert.equal(calls, 1);
    assert.equal(stats.attempts, 1);
    assert.equal(sleeps.length, 0);
  });

  it('retries on transient errors then succeeds', async () => {
    let calls = 0;
    const attempts: number[] = [];
    const { result, stats } = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw { status: 503, message: 'service unavailable' };
        return 42;
      },
      {
        sleep: fastSleep,
        onAttempt: (attempt) => attempts.push(attempt),
        jitter: false,
        baseDelayMs: 100,
      },
    );
    assert.equal(result, 42);
    assert.equal(calls, 3);
    assert.equal(stats.attempts, 3);
    assert.deepEqual(attempts, [1, 2]);
    // 100ms + 200ms with jitter=false
    assert.equal(stats.totalDelayMs, 300);
  });

  it('throws immediately on non-retryable errors', async () => {
    let calls = 0;
    class HttpError extends Error {
      status = 401;
      constructor() {
        super('unauthorized');
      }
    }
    await assert.rejects(
      withRetry(
        async () => {
          calls += 1;
          throw new HttpError();
        },
        { sleep: fastSleep },
      ),
      /unauthorized/,
    );
    assert.equal(calls, 1);
  });

  it('throws after exhausting retries', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(
        async () => {
          calls += 1;
          throw { status: 503 };
        },
        { sleep: fastSleep, maxAttempts: 3 },
      ),
    );
    assert.equal(calls, 3);
  });

  it('honors Retry-After hint from the error', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    await withRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw { status: 429, headers: { 'retry-after': '7' } };
        return 'ok';
      },
      { sleep: async (ms) => void sleeps.push(ms), jitter: false, baseDelayMs: 100 },
    );
    assert.equal(sleeps.length, 1);
    assert.equal(sleeps[0], 7000);
  });

  it('aborts immediately when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      withRetry(async () => 'never', { signal: controller.signal, sleep: fastSleep }),
      /aborted/,
    );
  });
});
