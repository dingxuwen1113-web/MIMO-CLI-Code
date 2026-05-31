import Anthropic from '@anthropic-ai/sdk';
import { MimoConfig } from '../config/schema';
import { ApiAdapter, BudgetInfo, UsageStats, StreamCallbacks } from './types';
import { RateLimiter } from './rate-limiter';

const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'mimo-v2.5-pro': { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75 },
  'mimo-v2.5': { input: 0.25, output: 1.25, cacheRead: 0.03, cacheWrite: 0.30 },
};

export class PayAsYouGoAdapter implements ApiAdapter {
  private client: Anthropic;
  private config: MimoConfig;
  private usage: UsageStats = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    thinkingTokens: 0,
    totalCost: 0,
  };
  private rateLimiter: RateLimiter;

  constructor(config: MimoConfig) {
    this.config = config;
    const clientOpts: Record<string, any> = {
      apiKey: config.api.payAsYouGo.apiKey,
      timeout: 120_000,
    };
    if (config.api.payAsYouGo.baseUrl) {
      clientOpts.baseURL = config.api.payAsYouGo.baseUrl;
    }
    this.client = new Anthropic(clientOpts as any);
    this.rateLimiter = new RateLimiter({
      requestsPerMinute: 500000000000,
      minIntervalMs: 800,
      cooldownBaseMs: 5000,
      cooldownMaxMs: 60000,
    });
  }

  resolveModel(requestedModel: string): string {
    if (requestedModel === 'auto') {
      if (this.config.api.payAsYouGo.baseUrl?.includes('mimo')) return 'mimo-v2.5-pro';
      return 'mimo-v2.5-pro';
    }
    return requestedModel;
  }

  async chat(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    systemPrompt: string,
    options: { stream?: boolean; maxTokens?: number; model?: string; thinking?: boolean } = {}
  ): Promise<Anthropic.Message> {
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
      await this.rateLimiter.wait();
      const response = await this.client.messages.create(createParams);
      this.rateLimiter.onSuccess();
      this.trackUsage(model, response.usage);
      return response;
    } catch (err: any) {
      throw this.wrapApiError(err, model);
    }
  }

  async chatStream(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    systemPrompt: string,
    callbacks: StreamCallbacks,
    options: { maxTokens?: number; model?: string; thinking?: boolean } = {}
  ): Promise<Anthropic.Message> {
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
      this.trackUsage(model, finalMessage.usage);
      return finalMessage;
    } catch (err: any) {
      throw this.wrapApiError(err, model);
    }
  }

  getBudgetInfo(): BudgetInfo {
    return {
      used: this.usage.totalCost,
      remaining: Infinity,
      percentUsed: 0,
      mode: 'pay-as-you-go',
    };
  }

  getUsageStats(): UsageStats {
    return { ...this.usage };
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

    return [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' } as any,
      },
    ];
  }

  private trackUsage(model: string, usage: Anthropic.Usage): void {
    this.usage.inputTokens += usage.input_tokens;
    this.usage.outputTokens += usage.output_tokens;
    this.usage.cacheCreationTokens += (usage as any).cache_creation_input_tokens || 0;
    this.usage.cacheReadTokens += (usage as any).cache_read_input_tokens || 0;

    const pricing = PRICING[model] || PRICING['mimo-v2.5-pro'];
    const cost =
      (usage.input_tokens / 1_000_000) * pricing.input +
      (usage.output_tokens / 1_000_000) * pricing.output +
      ((usage as any).cache_read_input_tokens / 1_000_000 || 0) * pricing.cacheRead +
      ((usage as any).cache_creation_input_tokens / 1_000_000 || 0) * pricing.cacheWrite;
    this.usage.totalCost += cost;
  }

  private wrapApiError(err: any, model?: string): Error {
    const status = err?.status || err?.statusCode || err?.error?.status;
    const message = err?.message || String(err);

    if (status === 401 || message.includes('401')) {
      return new Error('API key is invalid or expired. Run "mimo init" to reconfigure.');
    }
    if (status === 403 || message.includes('403')) {
      return new Error('API key does not have permission for this operation.');
    }
    if (status === 404 || message.includes('404')) {
      const modelHint = model ? ` Model "${model}" may not be available.` : '';
      return new Error(`API endpoint or model not found.${modelHint}`);
    }
    if (status === 429 || message.includes('429')) {
      const retryAfter = err?.headers?.['retry-after'];
      const retryAfterSec = retryAfter ? parseInt(retryAfter, 10) : undefined;
      this.rateLimiter.backoff(retryAfterSec && retryAfterSec > 0 ? retryAfterSec : undefined);
      const waitMsg = retryAfterSec ? ` Retry after ${retryAfterSec} seconds.` : '';
      return new Error(`429_rate_limit:${waitMsg}`);
    }
    if (status === 529 || message.includes('529')) {
      this.rateLimiter.backoff();
      return new Error('529_overloaded: API is temporarily overloaded.');
    }
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      return new Error(`Cannot reach API at ${this.config.api.payAsYouGo.baseUrl}. Check your network and base URL.`);
    }
    return new Error(`API error: ${message}`);
  }
}
