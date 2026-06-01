/**
 * Request Optimizer - 请求优化器
 *
 * 通过智能优化减少API调用次数
 * 包括：缓存、合并、压缩、降级
 */

import { printInfo, printSuccess, printWarning, ORANGE, GRAY, GREEN } from '../tui/output';

interface OptimizationConfig {
  enableCache: boolean;
  cacheTTL: number;
  enableCompression: boolean;
  enableBatching: boolean;
  batchSize: number;
  batchDelay: number;
  enableDeduplication: boolean;
  enableFallback: boolean;
  fallbackModel: string;
  maxContextLength: number;
  enableContextTrimming: boolean;
  enableSmartModelSelection: boolean;
}

interface CacheEntry {
  key: string;
  value: any;
  timestamp: number;
  hits: number;
  size: number;
}

interface OptimizationStats {
  cacheHits: number;
  cacheMisses: number;
  compressionSaved: number;
  batchesSent: number;
  requestsSaved: number;
  contextTrimmed: number;
  modelDowngrades: number;
  totalSaved: number;
}

export class RequestOptimizer {
  private config: OptimizationConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private pendingBatch: Array<{ request: any; resolve: Function; reject: Function }> = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private stats: OptimizationStats;

  constructor(config?: Partial<OptimizationConfig>) {
    this.config = {
      enableCache: true,
      cacheTTL: 300000,  // 5分钟
      enableCompression: true,
      enableBatching: false,  // 默认关闭，需要配合后端支持
      batchSize: 5,
      batchDelay: 100,
      enableDeduplication: true,
      enableFallback: true,
      fallbackModel: 'mimo-v2.5',  // 使用较小的模型作为降级
      maxContextLength: 100000,  // 100K tokens
      enableContextTrimming: true,
      enableSmartModelSelection: true,
      ...config,
    };

    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      compressionSaved: 0,
      batchesSent: 0,
      requestsSaved: 0,
      contextTrimmed: 0,
      modelDowngrades: 0,
      totalSaved: 0,
    };
  }

  /**
   * 优化请求
   */
  async optimizeRequest<T>(
    request: {
      messages: any[];
      model: string;
      maxTokens: number;
      systemPrompt?: string;
    },
    executeFn: (optimizedRequest: any) => Promise<T>
  ): Promise<T> {
    let optimizedRequest = { ...request };

    // 1. 检查缓存
    if (this.config.enableCache) {
      const cacheKey = this.generateCacheKey(request);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        this.stats.requestsSaved++;
        return cached;
      }
      this.stats.cacheMisses++;
    }

    // 2. 压缩上下文
    if (this.config.enableCompression) {
      optimizedRequest = this.compressContext(optimizedRequest);
    }

    // 3. 修剪上下文
    if (this.config.enableContextTrimming) {
      optimizedRequest = this.trimContext(optimizedRequest);
    }

    // 4. 智能模型选择
    if (this.config.enableSmartModelSelection) {
      optimizedRequest = this.selectOptimalModel(optimizedRequest);
    }

    // 5. 执行请求
    const result = await executeFn(optimizedRequest);

    // 6. 缓存结果
    if (this.config.enableCache) {
      const cacheKey = this.generateCacheKey(request);
      this.addToCache(cacheKey, result);
    }

    return result;
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(request: any): string {
    const keyParts = [
      request.model,
      request.maxTokens,
      request.systemPrompt?.substring(0, 100),
      request.messages.map((m: any) =>
        `${m.role}:${typeof m.content === 'string' ? m.content.substring(0, 100) : 'tool_result'}`
      ).join('|'),
    ];

    return this.hashString(keyParts.join('::'));
  }

  /**
   * 简单的字符串哈希
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `cache-${Math.abs(hash).toString(36)}`;
  }

  /**
   * 从缓存获取
   */
  private getFromCache(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 检查TTL
    if (Date.now() - entry.timestamp > this.config.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    entry.hits++;
    return entry.value;
  }

  /**
   * 添加到缓存
   */
  private addToCache(key: string, value: any): void {
    // 检查缓存大小
    if (this.cache.size > 1000) {
      this.evictCache();
    }

    this.cache.set(key, {
      key,
      value,
      timestamp: Date.now(),
      hits: 0,
      size: JSON.stringify(value).length,
    });
  }

  /**
   * 清理缓存
   */
  private evictCache(): void {
    const entries = Array.from(this.cache.entries());

    // 按最后使用时间排序，删除最旧的
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    // 删除前20%
    const toDelete = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < toDelete; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * 压缩上下文
   */
  private compressContext(request: any): any {
    if (!request.messages || request.messages.length === 0) {
      return request;
    }

    const compressedMessages = [];
    let savedChars = 0;

    for (const message of request.messages) {
      if (typeof message.content === 'string') {
        // 压缩长文本
        const originalLength = message.content.length;
        const compressed = this.compressText(message.content);
        savedChars += originalLength - compressed.length;

        compressedMessages.push({
          ...message,
          content: compressed,
        });
      } else {
        compressedMessages.push(message);
      }
    }

    this.stats.compressionSaved += savedChars;

    return {
      ...request,
      messages: compressedMessages,
    };
  }

  /**
   * 压缩文本
   */
  private compressText(text: string): string {
    // 移除多余的空白
    let compressed = text.replace(/\s+/g, ' ').trim();

    // 移除重复的换行
    compressed = compressed.replace(/\n{3,}/g, '\n\n');

    // 如果仍然很长，截断
    if (compressed.length > 10000) {
      compressed = compressed.substring(0, 10000) + '\n... [内容已压缩]';
      this.stats.compressionSaved += text.length - 10000;
    }

    return compressed;
  }

  /**
   * 修剪上下文
   */
  private trimContext(request: any): any {
    if (!request.messages || request.messages.length <= 2) {
      return request;
    }

    // 估算token数（粗略：1 token ≈ 4 字符）
    const estimateTokens = (text: string) => Math.ceil(text.length / 4);

    let totalTokens = 0;
    const messagesWithTokens = request.messages.map((m: any) => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      const tokens = estimateTokens(content);
      totalTokens += tokens;
      return { ...m, tokens };
    });

    // 如果超过限制，从前面删除旧消息
    if (totalTokens > this.config.maxContextLength) {
      const trimmedMessages = [];
      let currentTokens = 0;

      // 保留最后几条消息
      const keepLast = Math.min(5, messagesWithTokens.length);

      for (let i = messagesWithTokens.length - 1; i >= 0; i--) {
        const msg = messagesWithTokens[i];
        if (currentTokens + msg.tokens <= this.config.maxContextLength ||
            trimmedMessages.length < keepLast) {
          trimmedMessages.unshift(msg);
          currentTokens += msg.tokens;
        } else {
          break;
        }
      }

      if (trimmedMessages.length < messagesWithTokens.length) {
        this.stats.contextTrimmed++;
        printInfo(`📝 上下文已修剪: ${messagesWithTokens.length} → ${trimmedMessages.length} 条消息`);

        return {
          ...request,
          messages: trimmedMessages,
        };
      }
    }

    return request;
  }

  /**
   * 智能模型选择
   */
  private selectOptimalModel(request: any): any {
    if (!this.config.enableSmartModelSelection) {
      return request;
    }

    // 分析任务复杂度
    const taskComplexity = this.analyzeTaskComplexity(request);

    // 如果任务简单，使用较小的模型
    if (taskComplexity < 0.3 && request.model === 'mimo-v2.5-pro') {
      this.stats.modelDowngrades++;
      printInfo(`🤖 智能模型选择: 使用 mimo-v2.5 (任务复杂度: ${Math.round(taskComplexity * 100)}%)`);

      return {
        ...request,
        model: this.config.fallbackModel,
      };
    }

    return request;
  }

  /**
   * 分析任务复杂度
   */
  private analyzeTaskComplexity(request: any): number {
    let complexity = 0.5;  // 默认中等复杂度

    // 分析最后一条用户消息
    const lastUserMessage = [...request.messages]
      .reverse()
      .find((m: any) => m.role === 'user');

    if (lastUserMessage) {
      const content = typeof lastUserMessage.content === 'string'
        ? lastUserMessage.content
        : JSON.stringify(lastUserMessage.content);

      // 长消息通常更复杂
      if (content.length > 1000) complexity += 0.1;
      if (content.length > 5000) complexity += 0.1;

      // 包含代码通常更复杂
      if (content.includes('```')) complexity += 0.2;

      // 包含"复杂"、"详细"等关键词
      const complexKeywords = ['复杂', '详细', '优化', '重构', '架构', '设计'];
      for (const keyword of complexKeywords) {
        if (content.includes(keyword)) {
          complexity += 0.05;
        }
      }
    }

    // 系统提示词复杂度
    if (request.systemPrompt) {
      if (request.systemPrompt.length > 5000) complexity += 0.1;
    }

    // 工具调用复杂度
    if (request.tools && request.tools.length > 5) {
      complexity += 0.1;
    }

    return Math.min(1.0, complexity);
  }

  /**
   * 去重请求
   */
  async deduplicateRequest<T>(
    requestHash: string,
    executeFn: () => Promise<T>
  ): Promise<T> {
    if (!this.config.enableDeduplication) {
      return executeFn();
    }

    // 检查是否有相同的请求正在处理
    const cached = this.cache.get(`pending-${requestHash}`);
    if (cached) {
      this.stats.requestsSaved++;
      return cached.value;
    }

    // 执行请求并缓存
    const result = await executeFn();
    this.cache.set(`pending-${requestHash}`, {
      key: `pending-${requestHash}`,
      value: result,
      timestamp: Date.now(),
      hits: 0,
      size: 0,
    });

    // 短暂缓存后删除
    setTimeout(() => {
      this.cache.delete(`pending-${requestHash}`);
    }, 1000);

    return result;
  }

  /**
   * 获取统计信息
   */
  getStats(): OptimizationStats & { cacheSize: number; cacheHitRate: number } {
    const totalCacheRequests = this.stats.cacheHits + this.stats.cacheMisses;
    const cacheHitRate = totalCacheRequests > 0
      ? (this.stats.cacheHits / totalCacheRequests) * 100
      : 0;

    return {
      ...this.stats,
      cacheSize: this.cache.size,
      cacheHitRate,
      totalSaved: this.stats.cacheHits + this.stats.requestsSaved,
    };
  }

  /**
   * 生成报告
   */
  generateReport(): string {
    const stats = this.getStats();

    let report = `\n  ${ORANGE('📊 请求优化器状态')}\n`;
    report += `  ${GRAY('─'.repeat(40))}\n\n`;

    report += `  ${GREEN('●')} 缓存统计:\n`;
    report += `    缓存命中: ${stats.cacheHits}\n`;
    report += `    缓存未命中: ${stats.cacheMisses}\n`;
    report += `    命中率: ${stats.cacheHitRate.toFixed(1)}%\n`;
    report += `    缓存大小: ${stats.cacheSize}\n\n`;

    report += `  ${GREEN('●')} 优化效果:\n`;
    report += `    压缩节省: ${this.formatBytes(stats.compressionSaved)}\n`;
    report += `    上下文修剪: ${stats.contextTrimmed} 次\n`;
    report += `    模型降级: ${stats.modelDowngrades} 次\n`;
    report += `    总计节省: ${stats.totalSaved} 次请求\n`;

    return report;
  }

  /**
   * 格式化字节数
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.clear();
    printSuccess('缓存已清空');
  }

  /**
   * 获取配置
   */
  getConfig(): OptimizationConfig {
    return this.config;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
