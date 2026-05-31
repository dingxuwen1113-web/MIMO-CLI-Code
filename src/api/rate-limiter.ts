// ── Rate Limiter: Passive-by-default request queue ───────────
// Does NOT proactively throttle. Only activates AFTER a real 429.
// First request always goes through immediately with zero delay.
//
// Strategy: "reactive only"
// - No forced intervals between requests (minIntervalMs=0 by default)
// - No sliding window cap (requestsPerMinute=9999 by default)
// - Only backs off when the server actually returns 429
// - Backoff is short: 1s → 2s → 4s, max 10s, max 3 retries
// - After retries exhausted: throws immediately, no more waiting
//
// Thread safety: wait() uses a promise-chain mutex so concurrent
// enqueue() calls are serialized.

export interface RateLimiterConfig {
  requestsPerMinute: number;
  minIntervalMs: number;
  cooldownBaseMs: number;
  cooldownMaxMs: number;
  cooldownMultiplier: number;
  maxRetries: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  requestsPerMinute: 9999,   // No proactive cap — proxy handles its own limits
  minIntervalMs: 0,          // No forced delay between requests
  cooldownBaseMs: 1000,      // Start backoff at 1s (not 5s)
  cooldownMaxMs: 10000,      // Cap backoff at 10s (not 2min)
  cooldownMultiplier: 2,
  maxRetries: 3,             // 3 retries max (1s+2s+4s = 7s total worst case)
};

export class RateLimiter {
  private config: RateLimiterConfig;
  private requestTimestamps: number[] = [];
  private lastRequestTime: number = 0;
  private cooldownUntil: number = 0;
  private cooldownLevel: number = 0;
  private totalWaits: number = 0;
  private totalWaitMs: number = 0;
  private totalRetries: number = 0;
  private totalRequests: number = 0;
  private total429s: number = 0;

  // ── Mutex: serialize concurrent wait() calls ──
  private queueChain: Promise<void> = Promise.resolve();

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Enqueue an API request. Handles waiting, retrying 429s, and backoff.
   * First attempt always goes through immediately — no forced delays.
   */
  async enqueue<T>(
    fn: () => Promise<T>,
    options?: { onRetry?: (attempt: number, delayMs: number) => void }
  ): Promise<T> {
    let lastError: any = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      // Only wait if there's an active cooldown from a previous 429.
      // First request: cooldownUntil=0, so wait() returns immediately.
      await this.wait();
      this.totalRequests++;

      try {
        const result = await fn();
        this.onSuccess();
        return result;
      } catch (err: any) {
        lastError = err;

        // __noRetry: caller explicitly says not to retry (e.g., partial stream)
        if (err.__noRetry || !this.is429(err)) {
          throw err;
        }

        this.total429s++;

        // Extract Retry-After header from the 429 response
        const retryAfterSec = this.extractRetryAfter(err);
        this.backoff(retryAfterSec && retryAfterSec > 0 ? retryAfterSec : undefined);

        if (attempt < this.config.maxRetries) {
          const waitMs = Math.max(0, this.cooldownUntil - Date.now());
          options?.onRetry?.(attempt + 1, waitMs);
        }
      }
    }

    // All retries exhausted — throw the last 429 error
    throw lastError;
  }

  /**
   * Wait until it's safe to make a request.
   * If no cooldown is active, returns immediately (no forced delay).
   */
  async wait(): Promise<void> {
    const myTurn = this.queueChain.then(() => this.doWait());
    this.queueChain = myTurn.catch(() => {});
    await myTurn;
  }

  /**
   * Internal wait logic — runs serialized via the mutex.
   */
  private async doWait(): Promise<void> {
    const now = Date.now();

    // 1. Respect cooldown from previous 429 (only active after a real 429)
    if (now < this.cooldownUntil) {
      const waitMs = this.cooldownUntil - now;
      this.totalWaits++;
      this.totalWaitMs += waitMs;
      await this.sleep(waitMs);
    }

    // 2. Minimum interval (default 0 — no forced delay)
    if (this.config.minIntervalMs > 0) {
      const sinceLastRequest = Date.now() - this.lastRequestTime;
      if (sinceLastRequest < this.config.minIntervalMs) {
        const waitMs = this.config.minIntervalMs - sinceLastRequest;
        this.totalWaits++;
        this.totalWaitMs += waitMs;
        await this.sleep(waitMs);
      }
    }

    // 3. Sliding window (default 9999 — effectively disabled)
    if (this.config.requestsPerMinute < 9999) {
      this.trimOldTimestamps();
      if (this.requestTimestamps.length >= this.config.requestsPerMinute) {
        const oldestInWindow = this.requestTimestamps[0];
        const waitMs = oldestInWindow + 60_000 - Date.now() + 500;
        if (waitMs > 0) {
          this.totalWaits++;
          this.totalWaitMs += waitMs;
          await this.sleep(waitMs);
        }
      }
    }

    // Record this request
    this.lastRequestTime = Date.now();
    this.requestTimestamps.push(this.lastRequestTime);
  }

  backoff(retryAfterSeconds?: number): void {
    this.cooldownLevel++;

    let cooldownMs: number;
    if (retryAfterSeconds && retryAfterSeconds > 0) {
      cooldownMs = retryAfterSeconds * 1000 + 1000;
    } else {
      cooldownMs = Math.min(
        this.config.cooldownBaseMs * Math.pow(this.config.cooldownMultiplier, this.cooldownLevel - 1),
        this.config.cooldownMaxMs
      );
    }

    this.cooldownUntil = Date.now() + cooldownMs;
  }

  onSuccess(): void {
    if (this.cooldownLevel > 0) {
      this.cooldownLevel = Math.max(0, this.cooldownLevel - 1);
    }
    // Clear any remaining cooldown on success
    if (this.cooldownLevel === 0) {
      this.cooldownUntil = 0;
    }
  }

  getStats(): {
    requestsInWindow: number;
    cooldownActive: boolean;
    cooldownRemainingMs: number;
    totalWaits: number;
    totalWaitMs: number;
    cooldownLevel: number;
    totalRetries: number;
    totalRequests: number;
    total429s: number;
    successRate: number;
  } {
    this.trimOldTimestamps();
    const now = Date.now();
    return {
      requestsInWindow: this.requestTimestamps.length,
      cooldownActive: now < this.cooldownUntil,
      cooldownRemainingMs: Math.max(0, this.cooldownUntil - now),
      totalWaits: this.totalWaits,
      totalWaitMs: this.totalWaitMs,
      cooldownLevel: this.cooldownLevel,
      totalRetries: this.totalRetries,
      totalRequests: this.totalRequests,
      total429s: this.total429s,
      successRate: this.totalRequests > 0
        ? Math.round(((this.totalRequests - this.total429s) / this.totalRequests) * 100)
        : 100,
    };
  }

  getConfig(): RateLimiterConfig {
    return { ...this.config };
  }

  private is429(err: any): boolean {
    const status = err?.status || err?.statusCode || err?.error?.status;
    if (status === 429) return true;
    // Only match raw 429 messages, NOT our wrapped "429_rate_limit:" errors
    const message = err?.message || '';
    return message === '429' || message.includes('Too many requests');
  }

  private extractRetryAfter(err: any): number | undefined {
    const retryAfter = err?.headers?.['retry-after'];
    if (retryAfter) {
      const sec = parseInt(retryAfter, 10);
      return sec > 0 ? sec : undefined;
    }
    return undefined;
  }

  private trimOldTimestamps(): void {
    const cutoff = Date.now() - 60_000;
    while (this.requestTimestamps.length > 0 && this.requestTimestamps[0] < cutoff) {
      this.requestTimestamps.shift();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ── Singleton: all API calls share one limiter ──────────────

let globalLimiter: RateLimiter | null = null;

export function getGlobalRateLimiter(config?: Partial<RateLimiterConfig>): RateLimiter {
  if (!globalLimiter) {
    globalLimiter = new RateLimiter(config ?? DEFAULT_CONFIG);
  }
  return globalLimiter;
}

export function resetGlobalRateLimiter(): void {
  globalLimiter = null;
}
