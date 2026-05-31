// ── Rate Limiter: Transparent pass-through ───────────────────
// Default mode: NO throttling, NO retries. Requests go straight
// to the API. If the proxy returns 429, the error propagates
// immediately so the user sees the real problem.
//
// To enable retries, pass config with maxRetries > 0.

export interface RateLimiterConfig {
  requestsPerMinute: number;
  minIntervalMs: number;
  cooldownBaseMs: number;
  cooldownMaxMs: number;
  cooldownMultiplier: number;
  maxRetries: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  requestsPerMinute: 9999,
  minIntervalMs: 0,
  cooldownBaseMs: 1000,
  cooldownMaxMs: 10000,
  cooldownMultiplier: 2,
  maxRetries: 0,  // NO retries — let errors propagate immediately
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
          options?.onRetry?.(attempt + 1, waitMs);
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

  getConfig(): RateLimiterConfig {
    return { ...this.config };
  }

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

// ── Singleton ────────────────────────────────────────────────

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
