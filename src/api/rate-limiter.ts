// ── Rate Limiter: Configurable, transparent pass-through ────
// Default mode: light throttling with retries. Requests go
// straight to the API. If the proxy returns 429, the limiter
// backs off and retries up to maxRetries times.
//
// Call updateConfig() at runtime to change behaviour without
// recreating the singleton.

export interface RateLimiterConfig {
  requestsPerMinute: number;
  minIntervalMs: number;
  cooldownBaseMs: number;
  cooldownMaxMs: number;
  cooldownMultiplier: number;
  maxRetries: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  requestsPerMinute: 60,      // 60 RPM — standard API tier
  minIntervalMs: 0,           // no artificial delay between requests
  cooldownBaseMs: 1000,       // 429 -> wait 1s first (fast retry)
  cooldownMaxMs: 10000,       // max wait 10s (reduced from 30s)
  cooldownMultiplier: 2,      // 1s -> 2s -> 4s -> 8s -> 10s
  maxRetries: 3,              // retry up to 3 times (reduced from 5)
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

  private queueChain: Promise<void> = Promise.resolve();

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Runtime configuration ─────────────────────────────────

  /**
   * Apply partial configuration changes at runtime.
   * Merges the provided patch into the current config.
   * @example limiter.updateConfig({ minIntervalMs: 5000, maxRetries: 5 });
   */
  updateConfig(patch: Partial<RateLimiterConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  /**
   * Return a shallow copy of the current configuration.
   * Safe for logging / diffing without mutating internal state.
   */
  getConfig(): RateLimiterConfig {
    return { ...this.config };
  }

  // ── Core enqueue / wait logic ─────────────────────────────

  async enqueue<T>(
    fn: () => Promise<T>,
    options?: { onRetry?: (attempt: number, delayMs: number) => void }
  ): Promise<T> {
    let lastError: any = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      await this.wait();
      this.totalRequests++;

      try {
        const result = await fn();
        this.onSuccess();
        return result;
      } catch (err: any) {
        lastError = err;

        if (err.__noRetry || !this.is429(err)) {
          throw err;
        }

        this.total429s++;

        const retryAfterSec = this.extractRetryAfter(err);
        this.backoff(retryAfterSec && retryAfterSec > 0 ? retryAfterSec : undefined);

        if (attempt < this.config.maxRetries) {
          const waitMs = Math.max(0, this.cooldownUntil - Date.now());
          const waitSec = Math.round(waitMs / 1000);
          options?.onRetry?.(attempt + 1, waitMs);
          // Show wait message if caller didn't provide onRetry
          if (!options?.onRetry) {
            process.stderr.write(`\r\x1b[K  ⏳ rate limited, waiting ${waitSec}s... (retry ${attempt + 1}/${this.config.maxRetries})\r`);
          }
        }
      }
    }

    throw lastError;
  }

  async wait(): Promise<void> {
    const myTurn = this.queueChain.then(() => this.doWait());
    this.queueChain = myTurn.catch(() => {});
    await myTurn;
  }

  private async doWait(): Promise<void> {
    const now = Date.now();

    if (now < this.cooldownUntil) {
      const waitMs = this.cooldownUntil - now;
      this.totalWaits++;
      this.totalWaitMs += waitMs;
      await this.sleep(waitMs);
    }

    if (this.config.minIntervalMs > 0) {
      const sinceLastRequest = Date.now() - this.lastRequestTime;
      if (sinceLastRequest < this.config.minIntervalMs) {
        const waitMs = this.config.minIntervalMs - sinceLastRequest;
        this.totalWaits++;
        this.totalWaitMs += waitMs;
        await this.sleep(waitMs);
      }
    }

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

  // ── Private helpers ───────────────────────────────────────

  private is429(err: any): boolean {
    const status = err?.status || err?.statusCode || err?.error?.status;
    return status === 429;
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

// ── Singleton ────────────────────────────────────────────

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
