// ── Rate Limiter: Proactive request pacing ───────────
// Prevents 429s by tracking requests per minute and enforcing
// minimum intervals. After a 429, enters a cooldown period.

export interface RateLimiterConfig {
  /** Maximum requests per minute (default: 30 for standard plans) */
  requestsPerMinute: number;
  /** Minimum interval between requests in ms (default: 1000) */
  minIntervalMs: number;
  /** Initial cooldown after a 429 in ms (default: 5000) */
  cooldownBaseMs: number;
  /** Max cooldown in ms (default: 60000) */
  cooldownMaxMs: number;
  /** Cooldown multiplier on repeated 429s (default: 2) */
  cooldownMultiplier: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  requestsPerMinute: 30,
  minIntervalMs: 1000,
  cooldownBaseMs: 5000,
  cooldownMaxMs: 60000,
  cooldownMultiplier: 2,
};

export class RateLimiter {
  private config: RateLimiterConfig;
  private requestTimestamps: number[] = [];
  private lastRequestTime: number = 0;
  private cooldownUntil: number = 0;
  private cooldownLevel: number = 0;
  private totalWaits: number = 0;
  private totalWaitMs: number = 0;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Call this BEFORE making an API request.
   * Resolves when it's safe to proceed.
   */
  async wait(): Promise<void> {
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
      const waitMs = oldestInWindow + 60_000 - Date.now() + 500; // +500ms buffer
      if (waitMs > 0) {
        this.totalWaits++;
        this.totalWaitMs += waitMs;
        await this.sleep(waitMs);
      }
    }

    // Record this request
    this.lastRequestTime = Date.now();
    this.requestTimestamps.push(this.lastRequestTime);
  }

  /**
   * Call this when a 429 is received.
   * Enters cooldown mode. If `retryAfterSeconds` is provided from
   * the Retry-After header, uses that; otherwise escalates exponentially.
   */
  backoff(retryAfterSeconds?: number): void {
    const now = Date.now();
    this.cooldownLevel++;

    let cooldownMs: number;
    if (retryAfterSeconds && retryAfterSeconds > 0) {
      // Use server-specified wait time + buffer
      cooldownMs = retryAfterSeconds * 1000 + 1000;
    } else {
      // Exponential escalation
      cooldownMs = Math.min(
        this.config.cooldownBaseMs * Math.pow(this.config.cooldownMultiplier, this.cooldownLevel - 1),
        this.config.cooldownMaxMs
      );
    }

    this.cooldownUntil = now + cooldownMs;
  }

  /**
   * Call this on a successful (non-429) response.
   * Gradually reduces cooldown level.
   */
  onSuccess(): void {
    if (this.cooldownLevel > 0) {
      this.cooldownLevel = Math.max(0, this.cooldownLevel - 1);
    }
  }

  /**
   * Get current stats for display.
   */
  getStats(): {
    requestsInWindow: number;
    cooldownActive: boolean;
    cooldownRemainingMs: number;
    totalWaits: number;
    totalWaitMs: number;
    cooldownLevel: number;
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
    };
  }

  /**
   * Get current rate limit config for display.
   */
  getConfig(): RateLimiterConfig {
    return { ...this.config };
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
