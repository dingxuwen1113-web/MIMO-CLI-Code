/**
 * Unified API Manager - 统一API管理器
 *
 * 集成智能限流、请求优化、降级策略
 * 解决共享Key的RPM限制问题
 */

import { MimoConfig } from '../config/schema';
import { SmartRateLimiter } from './smart-rate-limiter';
import { RequestOptimizer } from './request-optimizer';
import { FallbackStrategyManager } from './fallback-strategy';
import { printInfo, printSuccess, printWarning, printError, ORANGE, GRAY, GREEN, YELLOW } from '../tui/output';

interface APIManagerConfig {
  enableRateLimiter: boolean;
  enableOptimizer: boolean;
  enableFallback: boolean;
  maxRPM: number;
  maxConcurrent: number;
  enableSmartModelSelection: boolean;
  enableCache: boolean;
  cacheTTL: number;
  enableQueue: boolean;
  maxQueueSize: number;
  enableOfflineMode: boolean;
}

interface APIManagerStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitedRequests: number;
  cachedRequests: number;
  fallbackRequests: number;
  averageResponseTime: number;
  currentRPM: number;
  queueSize: number;
  cacheSize: number;
}

export class UnifiedAPIManager {
  private config: MimoConfig;
  private managerConfig: APIManagerConfig;
  private rateLimiter: SmartRateLimiter;
  private optimizer: RequestOptimizer;
  private fallbackManager: FallbackStrategyManager;
  private stats: APIManagerStats;
  private responseTimes: number[] = [];

  constructor(config: MimoConfig, managerConfig?: Partial<APIManagerConfig>) {
    this.config = config;

    this.managerConfig = {
      enableRateLimiter: true,
      enableOptimizer: true,
      enableFallback: true,
      maxRPM: 60,
      maxConcurrent: 5,
      enableSmartModelSelection: true,
      enableCache: true,
      cacheTTL: 300000,
      enableQueue: true,
      maxQueueSize: 100,
      enableOfflineMode: true,
      ...managerConfig,
    };

    // 初始化智能限流器
    this.rateLimiter = new SmartRateLimiter({
      maxRPM: this.managerConfig.maxRPM,
      maxConcurrent: this.managerConfig.maxConcurrent,
      queueMaxSize: this.managerConfig.maxQueueSize,
      enableQueue: this.managerConfig.enableQueue,
      enablePriority: true,
      enableDeduplication: true,
    });

    // 初始化请求优化器
    this.optimizer = new RequestOptimizer({
      enableCache: this.managerConfig.enableCache,
      cacheTTL: this.managerConfig.cacheTTL,
      enableCompression: true,
      enableContextTrimming: true,
      enableSmartModelSelection: this.managerConfig.enableSmartModelSelection,
      enableDeduplication: true,
    });

    // 初始化降级策略管理器
    this.fallbackManager = new FallbackStrategyManager({
      enableFallback: this.managerConfig.enableFallback,
      fallbackModels: ['mimo-v2.5', 'mimo-v2.5-fast'],
      enableLocalCache: true,
      enableQueueRetry: true,
      enableGracefulDegradation: true,
      degradationThreshold: 0.8,
      enableOfflineMode: this.managerConfig.enableOfflineMode,
    });

    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitedRequests: 0,
      cachedRequests: 0,
      fallbackRequests: 0,
      averageResponseTime: 0,
      currentRPM: 0,
      queueSize: 0,
      cacheSize: 0,
    };
  }

  /**
   * 执行API请求（完整优化流程）
   */
  async executeRequest<T>(
    request: {
      messages: any[];
      model: string;
      maxTokens: number;
      systemPrompt?: string;
      tools?: any[];
    },
    executeFn: (req: any) => Promise<T>,
    options: {
      priority?: number;
      enableCache?: boolean;
      enableQueue?: boolean;
      enableFallback?: boolean;
      timeout?: number;
    } = {}
  ): Promise<T> {
    const {
      priority = 5,
      enableCache = true,
      enableQueue = true,
      enableFallback = true,
      timeout = 60000,
    } = options;

    this.stats.totalRequests++;
    const startTime = Date.now();

    try {
      // 步骤1: 请求优化
      let optimizedRequest = request;
      if (this.managerConfig.enableOptimizer) {
        optimizedRequest = await this.optimizer.optimizeRequest(
          request,
          async (req) => req  // 只是优化，不执行
        ) as any;
      }

      // 步骤2: 智能限流 + 执行
      let result: T;

      if (this.managerConfig.enableRateLimiter) {
        result = await this.rateLimiter.execute(
          () => this.executeWithFallback(
            optimizedRequest,
            executeFn,
            { enableCache, enableQueue, enableFallback, timeout }
          ),
          {
            priority,
            maxRetries: 3,
            cacheKey: enableCache ? this.generateCacheKey(request) : undefined,
            cacheTTL: this.managerConfig.cacheTTL,
          }
        );
      } else {
        result = await this.executeWithFallback(
          optimizedRequest,
          executeFn,
          { enableCache, enableQueue, enableFallback, timeout }
        );
      }

      // 成功
      this.stats.successfulRequests++;
      this.updateResponseTime(Date.now() - startTime);

      return result;
    } catch (error: any) {
      this.stats.failedRequests++;

      // 记录限流错误
      if (this.isRateLimitError(error)) {
        this.stats.rateLimitedRequests++;
      }

      throw error;
    }
  }

  /**
   * 带降级的执行
   */
  private async executeWithFallback<T>(
    request: any,
    executeFn: (req: any) => Promise<T>,
    options: {
      enableCache: boolean;
      enableQueue: boolean;
      enableFallback: boolean;
      timeout: number;
    }
  ): Promise<T> {
    if (!options.enableFallback || !this.managerConfig.enableFallback) {
      return this.executeWithTimeout(() => executeFn(request), options.timeout);
    }

    return this.fallbackManager.executeWithFallback(
      request,
      executeFn,
      {
        enableCache: options.enableCache,
        enableQueue: options.enableQueue,
        enableModelFallback: true,
        timeout: options.timeout,
      }
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
   * 生成缓存键
   */
  private generateCacheKey(request: any): string {
    const keyParts = [
      request.model,
      request.maxTokens,
      request.messages?.map((m: any) =>
        `${m.role}:${typeof m.content === 'string' ? m.content.substring(0, 100) : ''}`
      ).join('|'),
    ];

    return `api-${this.hashString(keyParts.join('::'))}`;
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
   * 更新响应时间
   */
  private updateResponseTime(time: number): void {
    this.responseTimes.push(time);

    // 保留最近100个响应时间
    if (this.responseTimes.length > 100) {
      this.responseTimes = this.responseTimes.slice(-100);
    }

    // 计算平均响应时间
    this.stats.averageResponseTime =
      this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
  }

  /**
   * 获取综合统计
   */
  getStats(): APIManagerStats & {
    rateLimiter: any;
    optimizer: any;
    fallback: any;
  } {
    const rateLimiterStats = this.rateLimiter.getStats();
    const optimizerStats = this.optimizer.getStats();
    const fallbackStats = this.fallbackManager.getStats();

    return {
      ...this.stats,
      currentRPM: rateLimiterStats.currentRPM,
      queueSize: rateLimiterStats.queueSize,
      cacheSize: optimizerStats.cacheSize,
      rateLimiter: rateLimiterStats,
      optimizer: optimizerStats,
      fallback: fallbackStats,
    };
  }

  /**
   * 生成综合报告
   */
  generateReport(): string {
    const stats = this.getStats();

    let report = `\n  ${ORANGE('🚀 统一API管理器状态')}\n`;
    report += `  ${GRAY('═'.repeat(50))}\n\n`;

    // 总体统计
    report += `  ${GREEN('●')} 总体统计:\n`;
    report += `    总请求数: ${stats.totalRequests}\n`;
    report += `    成功请求: ${stats.successfulRequests}\n`;
    report += `    失败请求: ${stats.failedRequests}\n`;
    report += `    限流请求: ${stats.rateLimitedRequests}\n`;
    report += `    缓存请求: ${stats.cachedRequests}\n`;
    report += `    降级请求: ${stats.fallbackRequests}\n`;
    report += `    成功率: ${stats.totalRequests > 0 ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1) : 0}%\n\n`;

    // 性能指标
    report += `  ${GREEN('●')} 性能指标:\n`;
    report += `    平均响应: ${Math.round(stats.averageResponseTime)}ms\n`;
    report += `    当前RPM: ${stats.currentRPM}\n`;
    report += `    队列大小: ${stats.queueSize}\n`;
    report += `    缓存大小: ${stats.cacheSize}\n\n`;

    // 智能限流器
    report += this.rateLimiter.generateReport();

    // 请求优化器
    report += this.optimizer.generateReport();

    // 降级策略
    report += this.fallbackManager.generateReport();

    return report;
  }

  /**
   * 获取配置
   */
  getConfig(): APIManagerConfig {
    return this.managerConfig;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<APIManagerConfig>): void {
    this.managerConfig = { ...this.managerConfig, ...config };

    // 更新子组件配置
    if (config.maxRPM !== undefined) {
      this.rateLimiter.updateConfig({ maxRPM: config.maxRPM });
    }
    if (config.maxConcurrent !== undefined) {
      this.rateLimiter.updateConfig({ maxConcurrent: config.maxConcurrent });
    }
    if (config.enableCache !== undefined) {
      this.optimizer.updateConfig({ enableCache: config.enableCache });
    }
    if (config.cacheTTL !== undefined) {
      this.optimizer.updateConfig({ cacheTTL: config.cacheTTL });
    }
  }

  /**
   * 清空所有队列和缓存
   */
  clearAll(): void {
    this.rateLimiter.clearQueue();
    this.optimizer.clearCache();
    this.fallbackManager.clearQueue();
    this.fallbackManager.clearCache();
    printSuccess('所有队列和缓存已清空');
  }

  /**
   * 获取队列状态
   */
  getQueueStatus(): {
    rateLimiterQueue: number;
    fallbackQueue: number;
    totalQueue: number;
    maxQueueSize: number;
  } {
    const rateLimiterStatus = this.rateLimiter.getQueueStatus();
    const fallbackStats = this.fallbackManager.getStats();

    return {
      rateLimiterQueue: rateLimiterStatus.size,
      fallbackQueue: fallbackStats.queueSize,
      totalQueue: rateLimiterStatus.size + fallbackStats.queueSize,
      maxQueueSize: this.managerConfig.maxQueueSize,
    };
  }

  /**
   * 更新RPM状态
   */
  updateRPM(current: number, max: number): void {
    this.fallbackManager.updateRPM(current, max);
  }

  /**
   * 检查是否需要降级
   */
  shouldDegrade(): boolean {
    const stats = this.getStats();
    const rpmUsage = stats.currentRPM / this.managerConfig.maxRPM;
    return rpmUsage >= 0.8;
  }

  /**
   * 获取健康状态
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'critical';
    rpmUsage: number;
    queueUsage: number;
    successRate: number;
    recommendations: string[];
  } {
    const stats = this.getStats();
    const queueStatus = this.getQueueStatus();

    const rpmUsage = stats.currentRPM / this.managerConfig.maxRPM;
    const queueUsage = queueStatus.totalQueue / this.managerConfig.maxQueueSize;
    const successRate = stats.totalRequests > 0
      ? stats.successfulRequests / stats.totalRequests
      : 1;

    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    const recommendations: string[] = [];

    if (rpmUsage >= 0.9 || queueUsage >= 0.9 || successRate < 0.5) {
      status = 'critical';
      recommendations.push('API服务严重受限，请等待几分钟后重试');
      recommendations.push('考虑使用 /clear 清空对话减少请求');
    } else if (rpmUsage >= 0.7 || queueUsage >= 0.7 || successRate < 0.8) {
      status = 'degraded';
      recommendations.push('API服务部分受限，响应可能较慢');
      recommendations.push('建议简化请求或等待片刻');
    }

    if (stats.rateLimitedRequests > stats.totalRequests * 0.1) {
      recommendations.push('频繁遇到限流，建议减少请求频率');
    }

    return {
      status,
      rpmUsage,
      queueUsage,
      successRate,
      recommendations,
    };
  }

  /**
   * 生成健康报告
   */
  generateHealthReport(): string {
    const health = this.getHealthStatus();

    let report = `\n  ${ORANGE('🏥 API健康状态')}\n`;
    report += `  ${GRAY('─'.repeat(40))}\n\n`;

    const statusIcon = {
      healthy: '🟢',
      degraded: '🟡',
      critical: '🔴',
    }[health.status];

    const statusText = {
      healthy: '健康',
      degraded: '降级',
      critical: '严重',
    }[health.status];

    report += `  ${statusIcon} 状态: ${statusText}\n`;
    report += `  📊 RPM使用率: ${(health.rpmUsage * 100).toFixed(1)}%\n`;
    report += `  📊 队列使用率: ${(health.queueUsage * 100).toFixed(1)}%\n`;
    report += `  📊 成功率: ${(health.successRate * 100).toFixed(1)}%\n\n`;

    if (health.recommendations.length > 0) {
      report += `  ${YELLOW('建议:')}\n`;
      for (const rec of health.recommendations) {
        report += `    • ${rec}\n`;
      }
    }

    return report;
  }
}
