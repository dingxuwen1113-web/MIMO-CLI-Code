/**
 * Fallback Strategy Manager - 降级策略管理器
 *
 * 在API限流时提供降级方案
 * 确保用户始终能得到响应
 */

import { printInfo, printSuccess, printWarning, ORANGE, GRAY, GREEN, YELLOW, RED } from '../tui/output';

interface FallbackConfig {
  enableFallback: boolean;
  fallbackModels: string[];
  enableLocalCache: boolean;
  localCacheTTL: number;
  enableQueueRetry: boolean;
  maxQueueWait: number;
  enableGracefulDegradation: boolean;
  degradationThreshold: number;  // RPM使用率阈值
  enableOfflineMode: boolean;
  offlineResponses: Map<string, string>;
}

interface FallbackStats {
  fallbackActivations: number;
  cacheFallbacks: number;
  queueFallbacks: number;
  modelFallbacks: number;
  offlineFallbacks: number;
  degradationEvents: number;
  totalFallbacks: number;
}

interface QueuedFallback {
  id: string;
  request: any;
  timestamp: number;
  resolve: Function;
  reject: Function;
}

export class FallbackStrategyManager {
  private config: FallbackConfig;
  private stats: FallbackStats;
  private fallbackQueue: QueuedFallback[] = [];
  private localCache: Map<string, { response: any; timestamp: number }> = new Map();
  private currentRPM: number = 0;
  private maxRPM: number = 60;
  private isDegraded: boolean = false;

  constructor(config?: Partial<FallbackConfig>) {
    this.config = {
      enableFallback: true,
      fallbackModels: ['mimo-v2.5', 'mimo-v2.5-fast'],
      enableLocalCache: true,
      localCacheTTL: 600000,  // 10分钟
      enableQueueRetry: true,
      maxQueueWait: 30000,  // 30秒
      enableGracefulDegradation: true,
      degradationThreshold: 0.8,  // 80% RPM使用率时降级
      enableOfflineMode: true,
      offlineResponses: new Map([
        ['greeting', '你好！我是MIMO AI助手。由于当前API访问受限，我暂时无法处理复杂请求。请稍后再试。'],
        ['error', '抱歉，当前服务暂时不可用。请稍后再试或检查网络连接。'],
        ['timeout', '请求超时。这可能是因为API限流。请稍后再试。'],
      ]),
      ...config,
    };

    this.stats = {
      fallbackActivations: 0,
      cacheFallbacks: 0,
      queueFallbacks: 0,
      modelFallbacks: 0,
      offlineFallbacks: 0,
      degradationEvents: 0,
      totalFallbacks: 0,
    };
  }

  /**
   * 执行带降级的请求
   */
  async executeWithFallback<T>(
    request: {
      messages: any[];
      model: string;
      maxTokens: number;
      systemPrompt?: string;
    },
    executeFn: (req: any) => Promise<T>,
    options: {
      enableCache?: boolean;
      enableQueue?: boolean;
      enableModelFallback?: boolean;
      timeout?: number;
    } = {}
  ): Promise<T> {
    const {
      enableCache = true,
      enableQueue = true,
      enableModelFallback = true,
      timeout = 30000,
    } = options;

    // 1. 尝试本地缓存
    if (enableCache && this.config.enableLocalCache) {
      const cached = this.tryLocalCache(request);
      if (cached) {
        this.stats.cacheFallbacks++;
        this.stats.totalFallbacks++;
        printInfo('📦 使用本地缓存响应');
        return cached;
      }
    }

    // 2. 检查是否需要降级
    if (this.config.enableGracefulDegradation && this.shouldDegrade()) {
      return this.executeDegradedRequest(request, executeFn);
    }

    // 3. 尝试主请求（带超时）
    try {
      const result = await this.executeWithTimeout(
        () => executeFn(request),
        timeout
      );

      // 成功，缓存响应
      if (enableCache && this.config.enableLocalCache) {
        this.cacheResponse(request, result);
      }

      return result;
    } catch (error: any) {
      // 4. 处理429错误
      if (this.isRateLimitError(error)) {
        return this.handleRateLimit(request, executeFn, {
          enableCache,
          enableQueue,
          enableModelFallback,
        });
      }

      // 5. 处理其他错误
      throw error;
    }
  }

  /**
   * 处理限流错误
   */
  private async handleRateLimit<T>(
    request: any,
    executeFn: (req: any) => Promise<T>,
    options: {
      enableCache: boolean;
      enableQueue: boolean;
      enableModelFallback: boolean;
    }
  ): Promise<T> {
    this.stats.fallbackActivations++;
    printWarning('⚠️ API限流，启用降级策略...');

    // 策略1: 尝试备用模型
    if (options.enableModelFallback && this.config.fallbackModels.length > 0) {
      const result = await this.tryFallbackModels(request, executeFn);
      if (result) {
        this.stats.modelFallbacks++;
        this.stats.totalFallbacks++;
        return result;
      }
    }

    // 策略2: 加入队列等待重试
    if (options.enableQueue && this.config.enableQueueRetry) {
      const result = await this.queueAndWait(request, executeFn);
      if (result) {
        this.stats.queueFallbacks++;
        this.stats.totalFallbacks++;
        return result;
      }
    }

    // 策略3: 使用缓存（即使是过期的）
    if (options.enableCache && this.config.enableLocalCache) {
      const cached = this.getExpiredCache(request);
      if (cached) {
        this.stats.cacheFallbacks++;
        this.stats.totalFallbacks++;
        printInfo('📦 使用过期缓存响应');
        return cached;
      }
    }

    // 策略4: 离线模式响应
    if (this.config.enableOfflineMode) {
      const offlineResponse = this.getOfflineResponse(request);
      if (offlineResponse) {
        this.stats.offlineFallbacks++;
        this.stats.totalFallbacks++;
        return offlineResponse;
      }
    }

    // 所有策略都失败
    throw new Error('所有降级策略都已尝试，请稍后再试');
  }

  /**
   * 尝试备用模型
   */
  private async tryFallbackModels<T>(
    request: any,
    executeFn: (req: any) => Promise<T>
  ): Promise<T | null> {
    for (const fallbackModel of this.config.fallbackModels) {
      try {
        printInfo(`🤖 尝试备用模型: ${fallbackModel}`);

        const fallbackRequest = {
          ...request,
          model: fallbackModel,
          maxTokens: Math.min(request.maxTokens, 16384),  // 减少token
        };

        const result = await this.executeWithTimeout(
          () => executeFn(fallbackRequest),
          15000  // 15秒超时
        );

        printSuccess(`✓ 使用备用模型成功: ${fallbackModel}`);
        return result;
      } catch (error) {
        printWarning(`备用模型 ${fallbackModel} 失败: ${error}`);
        continue;
      }
    }

    return null;
  }

  /**
   * 加入队列等待重试
   */
  private async queueAndWait<T>(
    request: any,
    executeFn: (req: any) => Promise<T>
  ): Promise<T | null> {
    return new Promise<T | null>((resolve, reject) => {
      const queueItem: QueuedFallback = {
        id: `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        request,
        timestamp: Date.now(),
        resolve,
        reject,
      };

      this.fallbackQueue.push(queueItem);
      printInfo(`⏳ 加入等待队列 (队列长度: ${this.fallbackQueue.length})`);

      // 设置超时
      setTimeout(() => {
        const index = this.fallbackQueue.findIndex(item => item.id === queueItem.id);
        if (index !== -1) {
          this.fallbackQueue.splice(index, 1);
          printWarning('等待超时，尝试其他策略');
          resolve(null);
        }
      }, this.config.maxQueueWait);

      // 定期尝试执行队列中的请求
      this.processFallbackQueue(executeFn);
    });
  }

  /**
   * 处理降级队列
   */
  private async processFallbackQueue<T>(
    executeFn: (req: any) => Promise<T>
  ): Promise<void> {
    if (this.fallbackQueue.length === 0) return;

    // 等待一段时间后尝试
    await this.sleep(5000);

    const item = this.fallbackQueue.shift();
    if (!item) return;

    try {
      const result = await this.executeWithTimeout(
        () => executeFn(item.request),
        10000
      );
      item.resolve(result);
      printSuccess('✓ 队列请求执行成功');
    } catch (error) {
      // 重新加入队列
      if (Date.now() - item.timestamp < this.config.maxQueueWait) {
        this.fallbackQueue.push(item);
        this.processFallbackQueue(executeFn);
      } else {
        item.reject(error);
      }
    }
  }

  /**
   * 执行降级请求
   */
  private async executeDegradedRequest<T>(
    request: any,
    executeFn: (req: any) => Promise<T>
  ): Promise<T> {
    this.stats.degradationEvents++;
    this.isDegraded = true;

    printWarning('⚡ 服务降级模式：使用简化配置');

    // 降级配置
    const degradedRequest = {
      ...request,
      model: this.config.fallbackModels[0] || 'mimo-v2.5',
      maxTokens: Math.min(request.maxTokens, 8192),
      messages: this.simplifyMessages(request.messages),
    };

    try {
      const result = await executeFn(degradedRequest);
      this.isDegraded = false;
      return result;
    } catch (error) {
      this.isDegraded = false;
      throw error;
    }
  }

  /**
   * 简化消息
   */
  private simplifyMessages(messages: any[]): any[] {
    // 只保留最后几条消息
    const maxMessages = 5;
    if (messages.length <= maxMessages) {
      return messages;
    }

    return messages.slice(-maxMessages);
  }

  /**
   * 尝试本地缓存
   */
  private tryLocalCache(request: any): any | null {
    const cacheKey = this.generateCacheKey(request);
    const cached = this.localCache.get(cacheKey);

    if (!cached) return null;

    // 检查TTL
    if (Date.now() - cached.timestamp > this.config.localCacheTTL) {
      this.localCache.delete(cacheKey);
      return null;
    }

    return cached.response;
  }

  /**
   * 获取过期缓存
   */
  private getExpiredCache(request: any): any | null {
    const cacheKey = this.generateCacheKey(request);
    const cached = this.localCache.get(cacheKey);

    if (!cached) return null;

    // 允许使用过期24小时内的缓存
    const maxExpiredTime = 24 * 60 * 60 * 1000;
    if (Date.now() - cached.timestamp > maxExpiredTime) {
      return null;
    }

    return cached.response;
  }

  /**
   * 缓存响应
   */
  private cacheResponse(request: any, response: any): void {
    const cacheKey = this.generateCacheKey(request);
    this.localCache.set(cacheKey, {
      response,
      timestamp: Date.now(),
    });

    // 清理旧缓存
    if (this.localCache.size > 1000) {
      this.cleanupCache();
    }
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(request: any): string {
    const keyParts = [
      request.model,
      request.messages?.map((m: any) =>
        `${m.role}:${typeof m.content === 'string' ? m.content.substring(0, 50) : ''}`
      ).join('|'),
    ];

    return `local-${this.hashString(keyParts.join('::'))}`;
  }

  /**
   * 简单哈希
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 清理缓存
   */
  private cleanupCache(): void {
    const entries = Array.from(this.localCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    // 删除前30%
    const toDelete = Math.ceil(entries.length * 0.3);
    for (let i = 0; i < toDelete; i++) {
      this.localCache.delete(entries[i][0]);
    }
  }

  /**
   * 获取离线响应
   */
  private getOfflineResponse(request: any): any | null {
    if (!this.config.enableOfflineMode) return null;

    // 分析请求类型
    const lastMessage = request.messages?.[request.messages.length - 1];
    if (!lastMessage) return null;

    const content = typeof lastMessage.content === 'string'
      ? lastMessage.content.toLowerCase()
      : '';

    // 简单的关键词匹配
    if (content.includes('你好') || content.includes('hello')) {
      return this.createOfflineResponse(this.config.offlineResponses.get('greeting') || '');
    }

    if (content.includes('错误') || content.includes('error')) {
      return this.createOfflineResponse(this.config.offlineResponses.get('error') || '');
    }

    // 默认响应
    return this.createOfflineResponse(
      '抱歉，由于API限流，我暂时无法处理您的请求。请稍后再试。\n\n' +
      '您可以尝试：\n' +
      '1. 等待几分钟后重试\n' +
      '2. 简化您的问题\n' +
      '3. 使用 /stats 查看API使用情况'
    );
  }

  /**
   * 创建离线响应
   */
  private createOfflineResponse(text: string): any {
    return {
      id: `offline-${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text }],
      model: 'offline',
      stop_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }

  /**
   * 判断是否应该降级
   */
  private shouldDegrade(): boolean {
    if (!this.config.enableGracefulDegradation) return false;

    const rpmUsage = this.currentRPM / this.maxRPM;
    return rpmUsage >= this.config.degradationThreshold;
  }

  /**
   * 判断是否是限流错误
   */
  private isRateLimitError(error: any): boolean {
    return (
      error.status === 429 ||
      error.message?.includes('429') ||
      error.message?.includes('rate limit') ||
      error.message?.includes('Rate limit')
    );
  }

  /**
   * 带超时执行
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('请求超时')), timeout)
      ),
    ]);
  }

  /**
   * 更新RPM状态
   */
  updateRPM(current: number, max: number): void {
    this.currentRPM = current;
    this.maxRPM = max;
  }

  /**
   * 睡眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取统计
   */
  getStats(): FallbackStats & {
    queueSize: number;
    cacheSize: number;
    isDegraded: boolean;
    rpmUsage: number;
  } {
    return {
      ...this.stats,
      queueSize: this.fallbackQueue.length,
      cacheSize: this.localCache.size,
      isDegraded: this.isDegraded,
      rpmUsage: this.maxRPM > 0 ? (this.currentRPM / this.maxRPM) * 100 : 0,
    };
  }

  /**
   * 生成报告
   */
  generateReport(): string {
    const stats = this.getStats();

    let report = `\n  ${ORANGE('🛡️ 降级策略状态')}\n`;
    report += `  ${GRAY('─'.repeat(40))}\n\n`;

    report += `  ${GREEN('●')} 当前状态:\n`;
    report += `    降级模式: ${stats.isDegraded ? '🔴 激活' : '🟢 正常'}\n`;
    report += `    RPM使用率: ${stats.rpmUsage.toFixed(1)}%\n`;
    report += `    等待队列: ${stats.queueSize}\n`;
    report += `    本地缓存: ${stats.cacheSize}\n\n`;

    report += `  ${GREEN('●')} 降级统计:\n`;
    report += `    总计降级: ${stats.totalFallbacks}\n`;
    report += `    缓存降级: ${stats.cacheFallbacks}\n`;
    report += `    队列降级: ${stats.queueFallbacks}\n`;
    report += `    模型降级: ${stats.modelFallbacks}\n`;
    report += `    离线降级: ${stats.offlineFallbacks}\n`;
    report += `    降级事件: ${stats.degradationEvents}\n`;

    return report;
  }

  /**
   * 清空队列
   */
  clearQueue(): void {
    this.fallbackQueue.forEach(item =>
      item.reject(new Error('队列已清空'))
    );
    this.fallbackQueue = [];
    printInfo('降级队列已清空');
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.localCache.clear();
    printSuccess('本地缓存已清空');
  }

  /**
   * 获取配置
   */
  getConfig(): FallbackConfig {
    return this.config;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<FallbackConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
