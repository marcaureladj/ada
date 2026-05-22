export interface RetryOptions {
  /** Maximum number of attempts including the first call. Default 3. */
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  isRetryable?: (err: unknown) => boolean;
  onAttempt?: (attempt: number, error: unknown, delayMs: number) => void;
  /** Injectable for tests — replaces setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

export interface RetryStats {
  attempts: number;
  totalDelayMs: number;
}

const TRANSIENT_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const TRANSIENT_NODE_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'EHOSTUNREACH',
]);

function getStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const e = err as { status?: number; statusCode?: number; response?: { status?: number } };
  return e.status ?? e.statusCode ?? e.response?.status;
}

function getCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  return (err as { code?: string }).code;
}

export function isTransient(err: unknown): boolean {
  const status = getStatus(err);
  if (status !== undefined && TRANSIENT_HTTP_STATUS.has(status)) return true;
  const code = getCode(err);
  if (code && TRANSIENT_NODE_CODES.has(code)) return true;
  // Errors thrown by fetch on network failures often only carry a name.
  if (typeof err === 'object' && err !== null) {
    const name = (err as { name?: string }).name;
    if (name === 'FetchError' || name === 'AbortError') return false; // abort is intentional
  }
  return false;
}

export function extractRetryAfterMs(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const headers = (err as { headers?: Record<string, string | string[] | undefined> }).headers;
  if (!headers) return undefined;
  const raw = headers['retry-after'] ?? headers['Retry-After'];
  if (!raw) return undefined;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  // Header is either seconds (integer) or an HTTP-date.
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return Math.max(0, asNumber * 1000);
  const asDate = Date.parse(value);
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
  return undefined;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitter: boolean,
): number {
  const expDelay = baseDelayMs * 2 ** (attempt - 1);
  const capped = Math.min(maxDelayMs, expDelay);
  if (!jitter) return capped;
  const jitterRange = capped * 0.3;
  const offset = (Math.random() * 2 - 1) * jitterRange;
  return Math.max(0, Math.round(capped + offset));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<{ result: T; stats: RetryStats }> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const jitter = options.jitter ?? true;
  const isRetryable = options.isRetryable ?? isTransient;
  const sleep = options.sleep ?? defaultSleep;

  let attempt = 0;
  let totalDelayMs = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    attempt += 1;
    if (options.signal?.aborted) {
      throw new Error('aborted');
    }
    try {
      const result = await fn();
      return { result, stats: { attempts: attempt, totalDelayMs } };
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt >= maxAttempts) {
        throw err;
      }
      const hinted = extractRetryAfterMs(err);
      const delay = hinted ?? computeDelay(attempt, baseDelayMs, maxDelayMs, jitter);
      const cappedDelay = Math.min(delay, maxDelayMs);
      options.onAttempt?.(attempt, err, cappedDelay);
      totalDelayMs += cappedDelay;
      if (cappedDelay > 0) await sleep(cappedDelay);
    }
  }

  // Unreachable but TypeScript needs it.
  throw lastError;
}
