import Anthropic from '@anthropic-ai/sdk';
import createDebug from 'debug';
import { MimoConfig } from '../config/schema';
import { ApiAdapter, BudgetInfo, UsageStats, StreamCallbacks } from './types';
import { withRetry } from './withRetry';
import { rawChat, rawStream } from './rawClient';

const debug = createDebug('mimo:api');

export class TokenPlanAdapter implements ApiAdapter {
  private baseUrl: string;
  private apiKey: string;
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
    this.apiKey = config.api.tokenPlan.apiKey;
    this.baseUrl = (config.api.tokenPlan.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    this.monthlyBudget = config.api.tokenPlan.monthlyBudget;
    this.cacheTtl = (config.promptCaching.cacheTtl || 300) * 1000;

    debug('TokenPlanAdapter: baseUrl=%s (raw fetch, no SDK)', this.baseUrl);
  }

  resolveModel(requestedModel: string): string {
    if (requestedModel === 'auto') return 'mimo-v2.5-pro';
    return requestedModel;
  }

  private buildParams(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    systemPrompt: string,
    options: { maxTokens?: number; model?: string; thinking?: boolean } = {}
  ): Record<string, any> {
    const model = this.resolveModel(options.model || this.config.api.model);
    const maxTokens = options.maxTokens || 32768;
    const systemBlocks = this.buildSystemBlocks(systemPrompt);

    const params: any = {
      model,
      max_tokens: maxTokens,
      system: systemBlocks,
      messages,
      tools,
    };

    if (options.thinking) {
      params.thinking = {
        type: 'enabled',
        budget_tokens: Math.min(maxTokens * 2, 128000),
      };
      params.max_tokens = Math.max(maxTokens, 64000);
    }

    return params;
  }

  async chat(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    systemPrompt: string,
    options: { stream?: boolean; maxTokens?: number; model?: string; thinking?: boolean } = {}
  ): Promise<Anthropic.Message> {
    this.checkBudget();
    const params = this.buildParams(messages, tools, systemPrompt, options);
    const model = params.model;

    return withRetry(
      async () => {
        const raw = await rawChat(this.baseUrl, this.apiKey, params);
        this.trackUsage(raw.usage);
        return raw as unknown as Anthropic.Message;
      },
      {
        label: `chat(${model})`,
        maxRetries: 3,
        onRetry: ({ attempt, delayMs, status }) => {
          const sec = Math.round(delayMs / 1000);
          process.stderr.write(`\r\x1b[K  ⏳ ${status || 'error'}, waiting ${sec}s... (retry ${attempt}/3)\r`);
        },
      }
    );
  }

  async chatStream(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    systemPrompt: string,
    callbacks: StreamCallbacks,
    options: { maxTokens?: number; model?: string; thinking?: boolean } = {}
  ): Promise<Anthropic.Message> {
    this.checkBudget();
    const params = this.buildParams(messages, tools, systemPrompt, options);
    const model = params.model;

    return withRetry(
      async () => {
        const raw = await rawStream(this.baseUrl, this.apiKey, params, callbacks);
        this.trackUsage(raw.usage);
        return raw as unknown as Anthropic.Message;
      },
      {
        label: `stream(${model})`,
        maxRetries: 3,
        onRetry: ({ attempt, delayMs, status }) => {
          const sec = Math.round(delayMs / 1000);
          process.stderr.write(`\r\x1b[K  ⏳ stream ${status || 'error'}, waiting ${sec}s... (retry ${attempt}/3)\r`);
        },
      }
    );
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
    if ((now - lastCached) >= this.cacheTtl) {
      this.cacheTimestamps.set(cacheKey, now);
    }
    return [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } as any }];
  }

  private checkBudget(): void {
    if (this.monthlyBudget <= 0) return;
    const pct = (this.usedTokens / this.monthlyBudget) * 100;
    if (pct >= 100) {
      throw new Error(`Budget exhausted: ${this.usedTokens.toLocaleString()}/${this.monthlyBudget.toLocaleString()} tokens.`);
    }
  }

  private trackUsage(usage: any): void {
    this.usage.inputTokens += usage.input_tokens || 0;
    this.usage.outputTokens += usage.output_tokens || 0;
    this.usage.cacheCreationTokens += usage.cache_creation_input_tokens || 0;
    this.usage.cacheReadTokens += usage.cache_read_input_tokens || 0;
    this.usedTokens += (usage.input_tokens || 0) + (usage.output_tokens || 0);
  }

  private calculateCost(stats: UsageStats): number {
    return (stats.inputTokens / 1_000_000) * 3
      + (stats.outputTokens / 1_000_000) * 15
      + (stats.cacheReadTokens / 1_000_000) * 0.30
      + (stats.cacheCreationTokens / 1_000_000) * 3.75;
  }
}
