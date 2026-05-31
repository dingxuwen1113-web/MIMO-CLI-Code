import Anthropic from '@anthropic-ai/sdk';
import createDebug from 'debug';
import { MimoConfig } from '../config/schema';
import { ApiAdapter, BudgetInfo, UsageStats, StreamCallbacks } from './types';
import { getGlobalRateLimiter } from './rate-limiter';
import { getSharedHttpAgents } from './http-client';

const debug = createDebug('mimo:api');

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

  constructor(config: MimoConfig) {
    this.config = config;
    const baseUrl = config.api.payAsYouGo.baseUrl;

    const { httpAgent, httpsAgent } = getSharedHttpAgents();
    const clientOpts: Record<string, any> = {
      apiKey: config.api.payAsYouGo.apiKey,
      maxRetries: 0,
      timeout: 120_000,
      httpAgent,
      httpsAgent,
    };
    if (baseUrl) {
      clientOpts.baseURL = baseUrl;
    }
    this.client = new Anthropic(clientOpts as any);
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

    const limiter = getGlobalRateLimiter();
    try {
      const response = await limiter.enqueue(
        () => this.client.messages.create(createParams),
      );
      this.trackUsage(model, response.usage);
      return response;
    } catch (err: any) {
      if (err?.status === 429 && model === 'mimo-v2.5-pro') {
        debug('mimo-v2.5-pro got 429, downgrading to mimo-v2.5');
        createParams.model = 'mimo-v2.5';
        try {
          const response = await limiter.enqueue(
            () => this.client.messages.create(createParams),
          );
          this.trackUsage('mimo-v2.5', response.usage);
          return response;
        } catch (retryErr: any) {
          throw this.wrapApiError(retryErr, model);
        }
      }
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

    const limiter = getGlobalRateLimiter();
    try {
      const finalMessage = await limiter.enqueue(async () => {
        let textEmitted = false;
        const stream = this.client.messages.stream(streamParams);

        // Buffer thinking output — render once at block end, not per-delta
        let thinkingBuffer = '';

        stream.on('text', (text) => {
          textEmitted = true;
          callbacks.onText?.(text);
        });

        stream.on('thinking', (thinkingDelta: string) => {
          thinkingBuffer += thinkingDelta;
        });

        stream.on('contentBlock', (block) => {
          if (block.type === 'tool_use') {
            callbacks.onToolUse?.(block as Anthropic.ToolUseBlock);
          }
          // Flush accumulated thinking when the block ends
          if (block.type === 'thinking' && thinkingBuffer) {
            callbacks.onThinking?.(thinkingBuffer);
            thinkingBuffer = '';
          }
        });

        try {
          return await stream.finalMessage();
        } catch (innerErr: any) {
          if (textEmitted && innerErr?.status === 429) {
            const err = new Error('429_rate_limit: Rate limit during streaming (partial response already sent).');
            (err as any).__noRetry = true;
            throw err;
          }
          throw innerErr;
        }
      }, {
        onRetry: (attempt, delayMs) => {
          const sec = Math.round(delayMs / 1000);
          process.stdout.write(`\r\x1b[K  rate limited, retry ${attempt}/5, waiting ${sec}s...\r`);
        },
      });

      this.trackUsage(model, finalMessage.usage);
      return finalMessage;
    } catch (err: any) {
      if (err?.status === 429) {
        debug('Streaming got 429, falling back to non-streaming (with auto model downgrade)');
        return this.chat(messages, tools, systemPrompt, options);
      }
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
    debug('API error → status: %d, model: %s, message: %s', status, model ?? 'unknown', message.slice(0, 100));

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
      return new Error('429_rate_limit: Rate limit exceeded after retries. Please wait a moment and try again.');
    }
    if (status === 529 || message.includes('529')) {
      return new Error('529_overloaded: API is temporarily overloaded.');
    }
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      return new Error(`Cannot reach API at ${this.config.api.payAsYouGo.baseUrl}. Check your network and base URL.`);
    }
    return new Error(`API error: ${message}`);
  }
}
