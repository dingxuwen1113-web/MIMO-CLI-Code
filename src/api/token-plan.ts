import Anthropic from '@anthropic-ai/sdk';
import { MimoConfig } from '../config/schema';
import { ApiAdapter, BudgetInfo, UsageStats, StreamCallbacks } from './types';
import { RateLimiter } from './rate-limiter';

export class TokenPlanAdapter implements ApiAdapter {
  private client: Anthropic;
  private config: MimoConfig;
  private usedTokens: number = 0;
  private monthlyBudget: number;
  private usage: UsageStats = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    thinkingTokens: 0,
    totalCost: 0,
  };

  // Prompt caching TTL 管理
  private cacheTimestamps: Map<string, number> = new Map();
  private cacheTtl: number;

  // Rate limiter
  private rateLimiter: RateLimiter;

  constructor(config: MimoConfig) {
    this.config = config;
    this.monthlyBudget = config.api.tokenPlan.monthlyBudget;
    this.cacheTtl = (config.promptCaching.cacheTtl || 300) * 1000; // 转为毫秒

    const clientOpts: Record<string, any> = {
      apiKey: config.api.tokenPlan.apiKey,
      timeout: 120_000, // 2 分钟超时，避免 AI 推理请求被过早中断
    };
    const baseUrl = config.api.tokenPlan.baseUrl || process.env.ANTHROPIC_BASE_URL;
    if (baseUrl) {
      clientOpts.baseURL = baseUrl;
    }
    this.client = new Anthropic(clientOpts as any);

    this.rateLimiter = new RateLimiter({
      requestsPerMinute: 30,
      minIntervalMs: 1200,
      cooldownBaseMs: 5000,
      cooldownMaxMs: 60000,
    });
  }

  resolveModel(requestedModel: string): string {
    if (requestedModel === 'auto') return 'mimo-v2.5-pro';
    return requestedModel;
  }

  async chat(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    systemPrompt: string,
    options: { stream?: boolean; maxTokens?: number; model?: string; thinking?: boolean } = {}
  ): Promise<Anthropic.Message> {
    this.checkBudget();

    const model = this.resolveModel(options.model || this.config.api.model);
    const maxTokens = options.maxTokens || 32768;

    const systemBlocks = this.buildSystemBlocks(systemPrompt);

    const createParams: any = {
      model,
      max_tokens: maxTokens,
      system: systemBlocks,
      messages,
      tools,
    };

    // Thinking 模式
    if (options.thinking) {
      createParams.thinking = {
        type: 'enabled',
        budget_tokens: Math.min(maxTokens * 2, 128000),
      };
      // Thinking 模式需要 higher max_tokens
      createParams.max_tokens = Math.max(maxTokens, 64000);
    }

    try {
      await this.rateLimiter.wait();
      const response = await this.client.messages.create(createParams);
      this.rateLimiter.onSuccess();
      this.trackUsage(response.usage);
      return response;
    } catch (err: any) {
      throw this.wrapApiError(err);
    }
  }

  async chatStream(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    systemPrompt: string,
    callbacks: StreamCallbacks,
    options: { maxTokens?: number; model?: string; thinking?: boolean } = {}
  ): Promise<Anthropic.Message> {
    this.checkBudget();

    const model = this.resolveModel(options.model || this.config.api.model);
    const maxTokens = options.maxTokens || 32768;

    const systemBlocks = this.buildSystemBlocks(systemPrompt);

    const streamParams: any = {
      model,
      max_tokens: maxTokens,
      system: systemBlocks,
      messages,
      tools,
    };

    if (options.thinking) {
      streamParams.thinking = {
        type: 'enabled',
        budget_tokens: Math.min(maxTokens * 2, 128000),
      };
      streamParams.max_tokens = Math.max(maxTokens, 64000);
    }

    const stream = this.client.messages.stream(streamParams);

    stream.on('text', (text) => callbacks.onText?.(text));

    // Extended thinking streaming
    stream.on('thinking', (thinkingDelta: string, _snapshot: string) => {
      callbacks.onThinking?.(thinkingDelta);
    });

    stream.on('contentBlock', (block) => {
      if (block.type === 'tool_use') {
        callbacks.onToolUse?.(block as Anthropic.ToolUseBlock);
      }
      if (block.type === 'thinking') {
        callbacks.onThinking?.((block as any).thinking || '');
      }
    });

    try {
      await this.rateLimiter.wait();
      const finalMessage = await stream.finalMessage();
      this.rateLimiter.onSuccess();
      this.trackUsage(finalMessage.usage);
      return finalMessage;
    } catch (err: any) {
      throw this.wrapApiError(err);
    }
  }

  getBudgetInfo(): BudgetInfo {
    return {
      used: this.usedTokens,
      remaining: Math.max(0, this.monthlyBudget - this.usedTokens),
      percentUsed: (this.usedTokens / this.monthlyBudget) * 100,
      mode: 'token-plan',
    };
  }

  getUsageStats(): UsageStats {
    const stats = { ...this.usage };
    stats.totalCost = this.calculateCost(stats);
    return stats;
  }

  // Token counting (approximation)
  countTokens(text: string): number {
    // 中文约 1.5 字/token，英文约 4 字符/token
    const chineseChars = (text.match(/[一-鿿]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  countMessageTokens(messages: Anthropic.MessageParam[]): number {
    let total = 0;
    for (const msg of messages) {
      const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      total += this.countTokens(text) + 4; // role overhead
    }
    return total;
  }

  private buildSystemBlocks(systemPrompt: string): Anthropic.ContentBlockParam[] {
    if (!this.config.promptCaching.enabled) {
      return [{ type: 'text', text: systemPrompt }];
    }

    // 检查缓存是否过期
    const cacheKey = 'system-prompt';
    const lastCached = this.cacheTimestamps.get(cacheKey) || 0;
    const now = Date.now();
    const isCacheValid = (now - lastCached) < this.cacheTtl;

    if (!isCacheValid) {
      this.cacheTimestamps.set(cacheKey, now);
    }

    return [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' } as any,
      },
    ];
  }

  private checkBudget(): void {
    // 无限制模式，不做预算检查
  }

  private trackUsage(usage: Anthropic.Usage): void {
    this.usage.inputTokens += usage.input_tokens;
    this.usage.outputTokens += usage.output_tokens;
    this.usage.cacheCreationTokens += (usage as any).cache_creation_input_tokens || 0;
    this.usage.cacheReadTokens += (usage as any).cache_read_input_tokens || 0;
    this.usedTokens += usage.input_tokens + usage.output_tokens;
  }

  private calculateCost(stats: UsageStats): number {
    // Claude Sonnet 4 pricing (per 1M tokens)
    const inputCost = (stats.inputTokens / 1_000_000) * 3;
    const outputCost = (stats.outputTokens / 1_000_000) * 15;
    const cacheReadCost = (stats.cacheReadTokens / 1_000_000) * 0.30;
    const cacheWriteCost = (stats.cacheCreationTokens / 1_000_000) * 3.75;
    return inputCost + outputCost + cacheReadCost + cacheWriteCost;
  }

  private wrapApiError(err: any): Error {
    const status = err?.status || err?.statusCode || err?.error?.status;
    const message = err?.message || String(err);

    if (status === 401 || message.includes('401')) {
      return new Error('Token Plan API key is invalid or expired. Run "mimo init" to reconfigure.');
    }
    if (status === 403 || message.includes('403')) {
      return new Error('Token Plan API key does not have permission for this operation. Check your plan limits.');
    }
    if (status === 429 || message.includes('429')) {
      // Extract Retry-After header and tell rate limiter
      const retryAfter = err?.headers?.['retry-after'];
      const retryAfterSec = retryAfter ? parseInt(retryAfter, 10) : undefined;
      this.rateLimiter.backoff(retryAfterSec && retryAfterSec > 0 ? retryAfterSec : undefined);
      const waitMsg = retryAfterSec ? ` Retry after ${retryAfterSec} seconds.` : '';
      return new Error(`429_rate_limit:${waitMsg}`);
    }
    if (status === 529 || message.includes('529')) {
      this.rateLimiter.backoff(); // Also back off on 529
      return new Error('529_overloaded: API is temporarily overloaded.');
    }
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      return new Error(`Cannot reach Token Plan API at ${this.config.api.tokenPlan.baseUrl}. Check your network and base URL.`);
    }
    return new Error(`Token Plan API error: ${message}`);
  }
}
