import Anthropic from '@anthropic-ai/sdk';
import createDebug from 'debug';
import { MimoConfig } from '../config/schema';
import { ApiAdapter, BudgetInfo, UsageStats, StreamCallbacks } from './types';

const debug = createDebug('mimo:api');

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

  private cacheTimestamps: Map<string, number> = new Map();
  private cacheTtl: number;

  constructor(config: MimoConfig) {
    this.config = config;
    this.monthlyBudget = config.api.tokenPlan.monthlyBudget;
    this.cacheTtl = (config.promptCaching.cacheTtl || 300) * 1000;

    // Use SDK's built-in retry logic (like Claude Code/Codex)
    const clientOpts: Record<string, any> = {
      apiKey: config.api.tokenPlan.apiKey,
      maxRetries: 2,        // SDK handles 429 retries automatically
      timeout: 120_000,
    };
    if (config.api.tokenPlan.baseUrl) {
      clientOpts.baseURL = config.api.tokenPlan.baseUrl;
    }
    this.client = new Anthropic(clientOpts as any);
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

    if (options.thinking) {
      createParams.thinking = {
        type: 'enabled',
        budget_tokens: Math.min(maxTokens * 2, 128000),
      };
      createParams.max_tokens = Math.max(maxTokens, 64000);
    }

    try {
      const response = await this.client.messages.create(createParams);
      this.trackUsage(response.usage);
      return response;
    } catch (err: any) {
      if (err?.status === 429 && model === 'mimo-v2.5-pro') {
        debug('mimo-v2.5-pro got 429, downgrading to mimo-v2.5');
        createParams.model = 'mimo-v2.5';
        try {
          const response = await this.client.messages.create(createParams);
          this.trackUsage(response.usage);
          return response;
        } catch (retryErr: any) {
          throw this.wrapApiError(retryErr);
        }
      }
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

    try {
      let textEmitted = false;
      const stream = this.client.messages.stream(streamParams);

      // Stream thinking in real-time for smooth display
      let thinkingBuffer = '';
      let thinkingFlushTimer: NodeJS.Timeout | null = null;
      const FLUSH_INTERVAL = 50;

      const flushThinking = () => {
        if (thinkingBuffer) {
          callbacks.onThinking?.(thinkingBuffer);
          thinkingBuffer = '';
        }
        thinkingFlushTimer = null;
      };

      stream.on('text', (text) => {
        textEmitted = true;
        flushThinking();
        callbacks.onText?.(text);
      });

      stream.on('thinking', (thinkingDelta: string) => {
        thinkingBuffer += thinkingDelta;
        if (!thinkingFlushTimer) {
          thinkingFlushTimer = setTimeout(flushThinking, FLUSH_INTERVAL);
        }
      });

      stream.on('contentBlock', (block) => {
        if (block.type === 'tool_use') {
          callbacks.onToolUse?.(block as Anthropic.ToolUseBlock);
        }
        if (thinkingFlushTimer) {
          clearTimeout(thinkingFlushTimer);
          thinkingFlushTimer = null;
        }
        flushThinking();
      });

      try {
        const finalMessage = await stream.finalMessage();
        this.trackUsage(finalMessage.usage);
        return finalMessage;
      } catch (innerErr: any) {
        if (textEmitted && innerErr?.status === 429) {
          const err = new Error('429_rate_limit: Partial response already sent.');
          (err as any).__noRetry = true;
          throw err;
        }
        throw innerErr;
      }
    } catch (err: any) {
      if (err?.status === 429) {
        debug('Streaming got 429, falling back to non-streaming');
        return this.chat(messages, tools, systemPrompt, options);
      }
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

  countTokens(text: string): number {
    const chineseChars = (text.match(/[一-鿿]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  countMessageTokens(messages: Anthropic.MessageParam[]): number {
    let total = 0;
    for (const msg of messages) {
      const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      total += this.countTokens(text) + 4;
    }
    return total;
  }

  private buildSystemBlocks(systemPrompt: string): Anthropic.ContentBlockParam[] {
    if (!this.config.promptCaching.enabled) {
      return [{ type: 'text', text: systemPrompt }];
    }

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
    if (this.monthlyBudget <= 0) return;
    const pct = (this.usedTokens / this.monthlyBudget) * 100;
    if (pct >= 100) {
      throw new Error(`Budget exhausted: ${this.usedTokens.toLocaleString()}/${this.monthlyBudget.toLocaleString()} tokens used this period. Upgrade your plan or wait for reset.`);
    }
    if (pct >= 90) {
      console.error(`\x1b[31m[budget] WARNING: ${pct.toFixed(0)}% of monthly budget used (${this.usedTokens.toLocaleString()}/${this.monthlyBudget.toLocaleString()} tokens)\x1b[0m`);
    } else if (pct >= 80) {
      console.warn(`\x1b[33m[budget] ${pct.toFixed(0)}% of monthly budget used (${this.usedTokens.toLocaleString()}/${this.monthlyBudget.toLocaleString()} tokens)\x1b[0m`);
    }
  }

  private trackUsage(usage: Anthropic.Usage): void {
    this.usage.inputTokens += usage.input_tokens;
    this.usage.outputTokens += usage.output_tokens;
    this.usage.cacheCreationTokens += (usage as any).cache_creation_input_tokens || 0;
    this.usage.cacheReadTokens += (usage as any).cache_read_input_tokens || 0;
    this.usedTokens += usage.input_tokens + usage.output_tokens;
  }

  private calculateCost(stats: UsageStats): number {
    const inputCost = (stats.inputTokens / 1_000_000) * 3;
    const outputCost = (stats.outputTokens / 1_000_000) * 15;
    const cacheReadCost = (stats.cacheReadTokens / 1_000_000) * 0.30;
    const cacheWriteCost = (stats.cacheCreationTokens / 1_000_000) * 3.75;
    return inputCost + outputCost + cacheReadCost + cacheWriteCost;
  }

  private wrapApiError(err: any): Error {
    const status = err?.status || err?.statusCode || err?.error?.status;
    const message = err?.message || String(err);
    debug('API error → status: %d, message: %s', status, message.slice(0, 100));

    if (status === 401 || message.includes('401')) {
      return new Error('Token Plan API key is invalid or expired. Run "mimo init" to reconfigure.');
    }
    if (status === 403 || message.includes('403')) {
      return new Error('Token Plan API key does not have permission for this operation. Check your plan limits.');
    }
    if (status === 429 || message.includes('429')) {
      return new Error('429_rate_limit: Rate limit exceeded after retries. Please wait a moment and try again.');
    }
    if (status === 529 || message.includes('529')) {
      return new Error('529_overloaded: API is temporarily overloaded.');
    }
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      return new Error(`Cannot reach Token Plan API at ${this.config.api.tokenPlan.baseUrl}. Check your network and base URL.`);
    }
    return new Error(`Token Plan API error: ${message}`);
  }
}
