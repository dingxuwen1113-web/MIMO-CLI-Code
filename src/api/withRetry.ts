// ── API Retry Engine (modeled after Claude Code) ─────────────
// SDK does 0 retries → this engine handles everything:
// - Exponential backoff with jitter
// - Retry-After header respect
// - Consecutive 429 tracking → model fallback (like Claude Code's 529 fallback)
// - 529/overloaded detection

import createDebug from 'debug';

const debug = createDebug('mimo:retry');

const BASE_DELAY_MS = 500;
const MAX_BACKOFF_MS = 32_000;
const JITTER_FACTOR = 0.25;
const DEFAULT_MAX_RETRIES = 3;  // Claude Code: don't retry forever
const MAX_CONSECUTIVE_429 = 3;  // Claude Code: after 3 consecutive, trigger fallback

export interface RetryResult<T> {
  result?: T;
  fallbackTriggered: boolean;
  consecutive429: number;
}

export function getRetryDelay(attempt: number, retryAfterHeader?: string | null): number {
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds) && seconds > 0) return seconds * 1000;
  }
  const baseDelay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_BACKOFF_MS);
  const jitter = Math.random() * JITTER_FACTOR * baseDelay;
  return baseDelay + jitter;
}

function getRetryAfter(err: any): string | null {
  const raw = err?.headers?.['retry-after'] || err?.response?.headers?.['retry-after'];
  if (raw) return raw;
  try {
    if (err?.headers?.get) return err.headers.get('retry-after');
    if (err?.response?.headers?.get) return err.response.headers.get('retry-after');
  } catch {}
  return null;
}

function isRetryable(err: any): boolean {
  const status = err?.status || err?.statusCode;
  const msg = err?.message || '';
  if (status === 529 || msg.includes('overloaded_error') || msg.includes('"type":"overloaded_error"')) return true;
  if (status === 429) return true;
  if (status === 408 || status === 409) return true;
  if (status >= 500) return true;
  if (err?.code === 'ECONNRESET' || err?.code === 'ECONNREFUSED' || err?.code === 'ETIMEDOUT' || err?.code === 'EPIPE') return true;
  if (msg.includes('socket hang up') || msg.includes('ECONNRESET') || msg.includes('ECONNREFUSED')) return true;
  return false;
}

function is429(err: any): boolean {
  const status = err?.status || err?.statusCode;
  return status === 429;
}

/**
 * withRetry: retry with exponential backoff.
 * Returns { fallbackTriggered: true } when consecutive 429 hits MAX_CONSECUTIVE_429,
 * signaling the caller to try a different model.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    label?: string;
    consecutive429Count?: number;
    onRetry?: (info: { attempt: number; delayMs: number; status?: number }) => void;
    onFallback?: (info: { consecutive429: number }) => void;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const label = options.label || 'API';
  let consecutive429 = options.consecutive429Count ?? 0;

  for (let attempt = 0; ; attempt++) {
    try {
      const result = await fn();
      // Success: reset consecutive 429 counter
      return result;
    } catch (err: any) {
      if (err?.__noRetry || !isRetryable(err) || attempt >= maxRetries) {
        throw err;
      }

      // Track consecutive 429s (like Claude Code tracks consecutive 529s)
      if (is429(err)) {
        consecutive429++;
        if (consecutive429 >= MAX_CONSECUTIVE_429) {
          debug('%s %d consecutive 429s — triggering model fallback', label, consecutive429);
          options.onFallback?.({ consecutive429 });
          const fallbackErr: any = new Error('FALLBACK_TRIGGERED: 3 consecutive 429s, switch model');
          fallbackErr.__fallbackTriggered = true;
          fallbackErr.__consecutive429 = consecutive429;
          throw fallbackErr;
        }
      } else {
        consecutive429 = 0; // Reset on non-429 errors
      }

      const status = err?.status || err?.statusCode;
      const retryAfter = getRetryAfter(err);
      const delayMs = getRetryDelay(attempt + 1, retryAfter);
      const delaySec = Math.round(delayMs / 1000);

      debug('%s %s attempt %d/%d, waiting %ds (consecutive429: %d)',
        label, status || 'error', attempt + 1, maxRetries, delaySec, consecutive429);

      options.onRetry?.({ attempt: attempt + 1, delayMs, status });

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}
