// ── Rate Limiter: Global request queue with 429 retry ───────
// All API calls go through enqueue() — it waits for cooldown,
// enforces intervals, and retries 429s automatically.
//
// Thread safety: wait() uses a promise-chain mutex so concurrent
// enqueue() calls are serialized and never exceed the rate limit.

export interface RateLimiterConfig {
  requestsPerMinute: number;
  minIntervalMs: number;
  cooldownBaseMs: number;
  cooldownMaxMs: number;
  cooldownMultiplier: number;
  maxRetries: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  requestsPerMinute: 12,
  minIntervalMs: 2000,
  cooldownBaseMs: 5000,
  cooldownMaxMs: 120000,
  cooldownMultiplier: 2,
  maxRetries: 5,
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

  // ── Mutex: serialize concurrent wait() calls ──
  private queueChain: Promise<void> = Promise.resolve();

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Enqueue an API request. Handles waiting, retrying 429s, and backoff.
   * This is the ONLY method callers should use.
   */
  async enqueue<T>(
    fn: () => Promise<T>,
    options?: { onRetry?: (attempt: number, delayMs: number) => void }
  ): Promise<T> {
    let lastError: any = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      // wait() is mutex-serialized — no two calls can pass the rate limit check simultaneously
      await this.wait();

      try {
        const result = await fn();
        this.onSuccess();
        return result;
      } catch (err: any) {
        lastError = err;

        // __noRetry flag: caller explicitly says not to retry (e.g., partial stream already sent)
        if (err.__noRetry || !this.is429(err)) {
          throw err;
        }

        // Extract Retry-After header from the 429 response
        const retryAfterSec = this.extractRetryAfter(err);
        this.backoff(retryAfterSec && retryAfterSec > 0 ? retryAfterSec : undefined);
        this.totalRetries++;

        if (attempt < this.config.maxRetries) {
          // Notify caller about the retry
          const cooldownMs = this.getRetryDelay(retryAfterSec);
          options?.onRetry?.(attempt + 1, cooldownMs);
          // The cooldown is already set by backoff() above.
          // The next loop iteration's wait() will respect cooldownUntil — no extra sleep needed.
        }
      }
    }

    // All retries exhausted — throw the last 429 error
    throw lastError;
  }

  /**
   * Wait until it's safe to make a request.
   * Uses a promise-chain mutex to prevent concurrent calls from
   * both passing the rate limit check before either records its timestamp.
   */
  async wait(): Promise<void> {
    // Chain onto the previous wait — each call runs sequentially
    const myTurn = this.queueChain.then(() => this.doWait());
    // Keep the chain alive even if this call throws
    this.queueChain = myTurn.catch(() => {});
    await myTurn;
  }

  /**
   * Internal wait logic — runs serialized via the mutex.
   */
  private async doWait(): Promise<void> {
    const now = Date.now();

    // 1. Respect cooldown from previous 429
    if (now < this.cooldownUntil) {
      const waitMs = this.cooldownUntil - now;
      this.totalWaits++;
      this.totalWaitMs += waitMs;
      await this.sleep(waitMs);
    }

    // 2. Enforce minimum interval between requests
    const sinceLastRequest = Date.now() - this.lastRequestTime;
    if (sinceLastRequest < this.config.minIntervalMs) {
      const waitMs = this.config.minIntervalMs - sinceLastRequest;
      this.totalWaits++;
      this.totalWaitMs += waitMs;
      await this.sleep(waitMs);
    }

    // 3. Sliding window: ensure we don't exceed requestsPerMinute
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

    // Record this request (after mutex ensures we're the only one checking)
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
  }

  getStats(): {
    requestsInWindow: number;
    cooldownActive: boolean;
    cooldownRemainingMs: number;
    totalWaits: number;
    totalWaitMs: number;
    cooldownLevel: number;
    totalRetries: number;
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
    };
  }

  getConfig(): RateLimiterConfig {
    return { ...this.config };
  }

  private is429(err: any): boolean {
    const status = err?.status || err?.statusCode || err?.error?.status;
    const message = err?.message || String(err);
    return status === 429 || message.includes('429') || message.includes('rate_limit') || message.includes('rate limit');
  }

  private extractRetryAfter(err: any): number | undefined {
    const retryAfter = err?.headers?.['retry-after'];
    if (retryAfter) {
      const sec = parseInt(retryAfter, 10);
      return sec > 0 ? sec : undefined;
    }
    return undefined;
  }

  private getRetryDelay(retryAfterSec?: number): number {
    if (retryAfterSec && retryAfterSec > 0) {
      return retryAfterSec * 1000 + 1000;
    }
    return Math.min(
      this.config.cooldownBaseMs * Math.pow(this.config.cooldownMultiplier, this.cooldownLevel - 1),
      this.config.cooldownMaxMs
    );
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

/**
 * Get or create the global rate limiter singleton.
 * Config is only applied on first creation. To change config,
 * call resetGlobalRateLimiter() first.
 */
export function getGlobalRateLimiter(config?: Partial<RateLimiterConfig>): RateLimiter {
  if (!globalLimiter) {
    globalLimiter = new RateLimiter(config ?? DEFAULT_CONFIG);
  }
  return globalLimiter;
}

/**
 * Reset the global rate limiter (for testing or config changes).
 */
export function resetGlobalRateLimiter(): void {
  globalLimiter = null;
}
