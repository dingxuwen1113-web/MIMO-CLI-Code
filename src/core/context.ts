// ── 上下文管理：消息裁剪 + token 计数 + prompt caching 优化 ────

import Anthropic from '@anthropic-ai/sdk';

interface ContextConfig {
  maxHistoryTurns: number;
  maxTokens: number;
  enableCaching: boolean;
  cacheTtlMs: number;
  autoCompactThreshold: number;
}

const DEFAULT_CONFIG: ContextConfig = {
  maxHistoryTurns: 20,
  maxTokens: 200000,
  enableCaching: true,
  cacheTtlMs: 300000, // 5 分钟
  autoCompactThreshold: 150000,
};

export class ContextManager {
  private config: ContextConfig;
  private lastCacheTime: number = 0;

  constructor(config: Partial<ContextConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // 裁剪对话历史
  trimHistory(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
    if (messages.length <= this.config.maxHistoryTurns * 2) {
      return messages;
    }

    const keepCount = this.config.maxHistoryTurns * 2;
    const trimmed = messages.slice(-keepCount);
    const droppedCount = messages.length - keepCount;

    if (droppedCount > 0) {
      return [
        {
          role: 'user',
          content: `[上下文裁剪：省略了 ${droppedCount} 条历史消息]`,
        },
        {
          role: 'assistant',
          content: '已了解，继续对话。',
        },
        ...trimmed,
      ];
    }

    return trimmed;
  }

  // Token 估算（增强版）
  estimateTokens(text: string): number {
    const chineseChars = (text.match(/[一-鿿]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  // 消息级 token 估算
  estimateMessageTokens(messages: Anthropic.MessageParam[]): number {
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += this.estimateTokens(msg.content) + 4;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            total += this.estimateTokens((block as any).text || '') + 4;
          } else if (block.type === 'tool_use') {
            total += this.estimateTokens(JSON.stringify((block as any).input || {})) + 20;
          } else if (block.type === 'tool_result') {
            const content = typeof (block as any).content === 'string'
              ? (block as any).content
              : JSON.stringify((block as any).content || '');
            total += this.estimateTokens(content) + 10;
          }
        }
      }
    }
    return total;
  }

  // 检查是否接近限制
  isNearLimit(messages: Anthropic.MessageParam[]): boolean {
    const estimatedTokens = this.estimateMessageTokens(messages);
    return estimatedTokens > this.config.maxTokens * 0.8;
  }

  // 检查是否需要自动压缩
  needsAutoCompact(messages: Anthropic.MessageParam[]): boolean {
    const estimatedTokens = this.estimateMessageTokens(messages);
    return estimatedTokens > this.config.autoCompactThreshold;
  }

  // 检查 prompt cache 是否有效
  isCacheValid(): boolean {
    return (Date.now() - this.lastCacheTime) < this.config.cacheTtlMs;
  }

  refreshCache(): void {
    this.lastCacheTime = Date.now();
  }

  // 获取上下文统计
  getStats(messages: Anthropic.MessageParam[]): {
    messageCount: number;
    estimatedTokens: number;
    maxTokens: number;
    percentUsed: number;
    nearLimit: boolean;
    needsCompact: boolean;
  } {
    const estimatedTokens = this.estimateMessageTokens(messages);
    const percentUsed = (estimatedTokens / this.config.maxTokens) * 100;

    return {
      messageCount: messages.length,
      estimatedTokens,
      maxTokens: this.config.maxTokens,
      percentUsed,
      nearLimit: percentUsed > 80,
      needsCompact: estimatedTokens > this.config.autoCompactThreshold,
    };
  }
}
