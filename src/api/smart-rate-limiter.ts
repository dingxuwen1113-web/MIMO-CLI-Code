/**
 * Smart Rate Limiter - 智能限流器
 *
 * 解决共享Key的RPM限制问题
 * 实现请求队列、优先级、降级策略
 */

import { printInfo, printWarning, printSuccess, ORANGE, GRAY, GREEN, YELLOW } from '../tui/output';

interface QueuedRequest {
  id: string;
  priority: number;  // 1-10, 10最高
  timestamp: number;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  execute: () => Promise<any>;
  retries: number;
  maxRetries: number;
}

interface RateLimitConfig {
  maxRPM: number;                    // 每分钟最大请求数
  maxConcurrent: number;             // 最大并发数
  queueMaxSize: number;              // 队列最大大小
  retryDelay: number;                // 重试延迟（ms）
  maxRetries: number;                // 最大重试次数
  priorityBoostForRetry: number;     // 重试优先级提升
  enableQueue: boolean;              // 启用队列
  enablePriority: boolean;           // 启用优先级
  enableDeduplication: boolean;      // 启用去重
  cooldownPeriod: number;            // 冷却期（ms）
}

interface RateLimitStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  queuedRequests: number;
  droppedRequests: number;
  averageWaitTime: number;
  currentRPM: number;
  peakRPM: number;
  queueSize: number;
  deduplicatedRequests: number;
}

export class SmartRateLimiter {
  private config: RateLimitConfig;
  private queue: QueuedRequest[] = [];
  private activeRequests: Set<string> = new Set();
  private requestTimestamps: number[] = [];
  private stats: RateLimitStats;
  private isProcessing: boolean = false;
  private requestCache: Map<string, { result: any; timestamp: number }> = new Map();
  private lastRequestTime: number = 0;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      maxRPM: 60,                      // 默认60 RPM
      maxConcurrent: 5,                // 最大5并发
      queueMaxSize: 100,               // 队列最多100个请求
      retryDelay: 2000,                // 2秒重试延迟
      maxRetries: 3,                   // 最多重试3次
      priorityBoostForRetry: 2,        // 重试提升2优先级
      enableQueue: true,               // 启用队列
      enablePriority: true,            // 启用优先级
      enableDeduplication: true,       // 启用去重
      cooldownPeriod: 1000,            // 1秒冷却期
      ...config,
    };

    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      queuedRequests: 0,
      droppedRequests: 0,
      averageWaitTime: 0,
      currentRPM: 0,
      peakRPM: 0,
      queueSize: 0,
      deduplicatedRequests: 0,
    };
  }

  /**
   * 执行请求（带限流和队列）
   */
  async execute<T>(
    requestFn: () => Promise<T>,
    options: {
      priority?: number;
      maxRetries?: number;
      cacheKey?: string;
      cacheTTL?: number;
      bypassQueue?: boolean;
    } = {}
  ): Promise<T> {
    const {
      priority = 5,
      maxRetries = this.config.maxRetries,
      cacheKey,
      cacheTTL = 60000,  // 1分钟缓存
      bypassQueue = false,
    } = options;

    this.stats.totalRequests++;

    // 检查缓存
    if (cacheKey && this.config.enableDeduplication) {
      const cached = this.requestCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < cacheTTL) {
        this.stats.deduplicatedRequests++;
        return cached.result;
      }
    }

    // 如果不使用队列或队列已满，直接执行
    if (bypassQueue || !this.config.enableQueue) {
      return this.executeDirectly(requestFn, maxRetries);
    }

    // 检查队列大小
    if (this.queue.length >= this.config.queueMaxSize) {
      this.stats.droppedRequests++;
      throw new Error(`请求队列已满 (${this.config.queueMaxSize})，请稍后重试`);
    }

    // 加入队列
    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest = {
        id: this.generateId(),
        priority: this.config.enablePriority ? priority : 5,
        timestamp: Date.now(),
        resolve,
        reject,
        execute: requestFn,
        retries: 0,
        maxRetries,
      };

      this.queue.push(request);
      this.stats.queuedRequests++;

      // 按优先级排序
      if (this.config.enablePriority) {
        this.queue.sort((a, b) => b.priority - a.priority);
      }

      // 开始处理队列
      this.processQueue();
    });
  }

  /**
   * 直接执行请求
   */
  private async executeDirectly<T>(
    requestFn: () => Promise<T>,
    maxRetries: number
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 检查RPM限制
        await this.waitForRateLimit();

        // 执行请求
        const result = await requestFn();
        this.stats.successfulRequests++;
        this.updateRPM();

        return result;
      } catch (error: any) {
        lastError = error;

        // 如果是429错误，等待更长时间
        if (error.status === 429 || error.message?.includes('429')) {
          const waitTime = this.calculateBackoff(attempt);
          printWarning(`⏳ 请求被限流，等待 ${Math.round(waitTime / 1000)}秒... (尝试 ${attempt + 1}/${maxRetries + 1})`);
          await this.sleep(waitTime);
        } else if (attempt < maxRetries) {
          await this.sleep(this.config.retryDelay);
        }
      }
    }

    this.stats.failedRequests++;
    throw lastError || new Error('请求失败');
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      // 检查并发限制
      if (this.activeRequests.size >= this.config.maxConcurrent) {
        await this.sleep(100);
        continue;
      }

      // 检查RPM限制
      if (!this.canMakeRequest()) {
        await this.sleep(this.calculateWaitTime());
        continue;
      }

      // 取出最高优先级的请求
      const request = this.queue.shift();
      if (!request) break;

      // 执行请求
      this.executeQueuedRequest(request);
    }

    this.isProcessing = false;
  }

  /**
   * 执行队列中的请求
   */
  private async executeQueuedRequest(request: QueuedRequest): Promise<void> {
    this.activeRequests.add(request.id);
    const startTime = Date.now();

    try {
      // 等待RPM限制
      await this.waitForRateLimit();

      // 执行请求
      const result = await request.execute();
      this.stats.successfulRequests++;
      this.updateRPM();

      // 缓存结果（如果有缓存键）
      // 这里需要从外部传入cacheKey，简化处理

      request.resolve(result);
    } catch (error: any) {
      // 检查是否需要重试
      if (request.retries < request.maxRetries && this.shouldRetry(error)) {
        request.retries++;
        request.priority = Math.min(10, request.priority + this.config.priorityBoostForRetry);

        // 重新加入队列
        this.queue.push(request);
        this.queue.sort((a, b) => b.priority - a.priority);
      } else {
        this.stats.failedRequests++;
        request.reject(error);
      }
    } finally {
      this.activeRequests.delete(request.id);

      // 更新等待时间统计
      const waitTime = Date.now() - request.timestamp;
      this.stats.averageWaitTime =
        (this.stats.averageWaitTime * (this.stats.successfulRequests + this.stats.failedRequests - 1) + waitTime) /
        (this.stats.successfulRequests + this.stats.failedRequests);
    }
  }

  /**
   * 检查是否可以发送请求
   */
  private canMakeRequest(): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // 清理过期的时间戳
    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneMinuteAgo);

    // 检查RPM
    return this.requestTimestamps.length < this.config.maxRPM;
  }

  /**
   * 等待直到可以发送请求
   */
  private async waitForRateLimit(): Promise<void> {
    while (!this.canMakeRequest()) {
      const waitTime = this.calculateWaitTime();
      await this.sleep(waitTime);
    }

    // 记录请求时间
    this.requestTimestamps.push(Date.now());
    this.lastRequestTime = Date.now();
  }

  /**
   * 计算需要等待的时间
   */
  private calculateWaitTime(): number {
    if (this.requestTimestamps.length === 0) return 0;

    const now = Date.now();
    const oldestTimestamp = this.requestTimestamps[0];
    const timeUntilExpire = oldestTimestamp + 60000 - now;

    return Math.max(100, timeUntilExpire + 100);  // 额外100ms缓冲
  }

  /**
   * 计算退避时间
   */
  private calculateBackoff(attempt: number): number {
    const baseDelay = this.config.retryDelay;
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 1000;  // 随机抖动

    return Math.min(exponentialDelay + jitter, 60000);  // 最大60秒
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(error: any): boolean {
    // 429错误应该重试
    if (error.status === 429) return true;

    // 5xx服务器错误应该重试
    if (error.status >= 500 && error.status < 600) return true;

    // 网络错误应该重试
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true;

    return false;
  }

  /**
   * 更新RPM统计
   */
  private updateRPM(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneMinuteAgo);
    this.stats.currentRPM = this.requestTimestamps.length;
    this.stats.peakRPM = Math.max(this.stats.peakRPM, this.stats.currentRPM);
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取统计信息
   */
  getStats(): RateLimitStats & { queueSize: number } {
    return {
      ...this.stats,
      queueSize: this.queue.length,
    };
  }

  /**
   * 获取配置
   */
  getConfig(): RateLimitConfig {
    return this.config;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 清空队列
   */
  clearQueue(): void {
    const dropped = this.queue.length;
    this.queue.forEach(req => req.reject(new Error('队列已清空')));
    this.queue = [];
    this.stats.droppedRequests += dropped;
    printInfo(`已清空队列 (${dropped} 个请求)`);
  }

  /**
   * 获取队列状态
   */
  getQueueStatus(): {
    size: number;
    maxSize: number;
    activeRequests: number;
    maxConcurrent: number;
    currentRPM: number;
    maxRPM: number;
  } {
    return {
      size: this.queue.length,
      maxSize: this.config.queueMaxSize,
      activeRequests: this.activeRequests.size,
      maxConcurrent: this.config.maxConcurrent,
      currentRPM: this.stats.currentRPM,
      maxRPM: this.config.maxRPM,
    };
  }

  /**
   * 生成状态报告
   */
  generateReport(): string {
    const stats = this.getStats();
    const queueStatus = this.getQueueStatus();

    let report = `\n  ${ORANGE('📊 智能限流器状态')}\n`;
    report += `  ${GRAY('─'.repeat(40))}\n\n`;

    report += `  ${GREEN('●')} 请求数量:\n`;
    report += `    总计: ${stats.totalRequests}\n`;
    report += `    成功: ${stats.successfulRequests}\n`;
    report += `    失败: ${stats.failedRequests}\n`;
    report += `    去重: ${stats.deduplicatedRequests}\n\n`;

    report += `  ${GREEN('●')} 队列状态:\n`;
    report += `    队列大小: ${queueStatus.size}/${queueStatus.maxSize}\n`;
    report += `    活跃请求: ${queueStatus.activeRequests}/${queueStatus.maxConcurrent}\n`;
    report += `    当前RPM: ${queueStatus.currentRPM}/${queueStatus.maxRPM}\n\n`;

    report += `  ${GREEN('●')} 性能指标:\n`;
    report += `    平均等待: ${Math.round(stats.averageWaitTime)}ms\n`;
    report += `    峰值RPM: ${stats.peakRPM}\n`;
    report += `    丢弃请求: ${stats.droppedRequests}\n`;

    return report;
  }
}
