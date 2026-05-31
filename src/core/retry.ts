// ── 错误自动重试 + 降级策略 ──────────────────────

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;       // 毫秒
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    '429',           // rate limit
    '529',           // overloaded
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'timeout',
    'socket hang up',
    'ECONNRESET',
  ],
};

export class RetryManager {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async execute<T>(
    fn: () => Promise<T>,
    options: { onRetry?: (attempt: number, error: Error, delay: number) => void } = {}
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;

        // 检查是否可重试
        if (!this.isRetryable(err) || attempt >= this.config.maxRetries) {
          throw err;
        }

        // 计算延迟（指数退避 + 抖动）
        const delay = this.calculateDelay(attempt);

        if (options.onRetry) {
          options.onRetry(attempt + 1, err, delay);
        }

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private isRetryable(err: Error): boolean {
    const message = err.message || '';
    return this.config.retryableErrors.some((pattern) => message.includes(pattern));
  }

  private calculateDelay(attempt: number): number {
    const delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt);
    const jitter = delay * 0.2 * Math.random();
    return Math.min(delay + jitter, this.config.maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 降级策略
export class FallbackManager {
  private strategies: Array<{ name: string; fn: () => Promise<any> }> = [];

  addStrategy(name: string, fn: () => Promise<any>): this {
    this.strategies.push({ name, fn });
    return this;
  }

  async execute<T>(): Promise<{ result: T; strategy: string }> {
    const errors: string[] = [];

    for (const strategy of this.strategies) {
      try {
        const result = await strategy.fn();
        return { result, strategy: strategy.name };
      } catch (err: any) {
        errors.push(`${strategy.name}: ${err.message}`);
      }
    }

    throw new Error(`所有降级策略均失败:\n${errors.join('\n')}`);
  }
}
