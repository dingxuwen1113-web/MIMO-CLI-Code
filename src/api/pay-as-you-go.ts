import Anthropic from '@anthropic-ai/sdk';
import createDebug from 'debug';
import { MimoConfig } from '../config/schema';
import { ApiAdapter, BudgetInfo, UsageStats, StreamCallbacks } from './types';
import { withRetry } from './withRetry';
import { preconnectApi } from './preconnect';

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

    // Claude Code pattern: SDK does 0 retries, withRetry handles everything
    const clientOpts: Record<string, any> = {
      apiKey: config.api.payAsYouGo.apiKey,
      maxRetries: 0,
      timeout: 600_000,  // 10 minutes
    };
    if (config.api.payAsYouGo.baseUrl) {
      clientOpts.baseURL = config.api.payAsYouGo.baseUrl.replace(/\/+$/, '');
    }
    this.client = new Anthropic(clientOpts as any);

    // Preconnect: warm TCP+TLS (fire-and-forget, like Claude Code)
    if (clientOpts.baseURL) preconnectApi(clientOpts.baseURL);
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

    // Try with original model, fall back to mimo-v2.5 on consecutive 429s
    try {
      return await withRetry(
        async () => {
          const response = await this.client.messages.create(createParams);
          this.trackUsage(model, response.usage);
          return response;
        },
        {
          label: `chat(${model})`,
          onRetry: ({ attempt, delayMs, status }) => {
            const sec = Math.round(delayMs / 1000);
            process.stderr.write(`\r\x1b[K  ⏳ ${status || 'error'}, waiting ${sec}s... (retry ${attempt}/3)\r`);
          },
        }
      );
    } catch (err: any) {
      if (err?.__fallbackTriggered && model === 'mimo-v2.5-pro') {
        debug('3x 429 on %s, falling back to mimo-v2.5', model);
        process.stderr.write(`\r\x1b[K  ⚠ ${model} rate limited, falling back to mimo-v2.5\r\n`);
        createParams.model = 'mimo-v2.5';
        const response = await this.client.messages.create(createParams);
        this.trackUsage('mimo-v2.5', response.usage);
        return response;
      }
      throw err;
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

    return withRetry(
      async () => {
        let textEmitted = false;
        const stream = this.client.messages.stream(streamParams);

        let thinkingBuffer = '';
        let thinkingFlushLen = 0;
        let thinkingFlushTimer: NodeJS.Timeout | null = null;
        const FLUSH_INTERVAL = 100;

        const flushThinking = () => {
          if (thinkingBuffer.length > thinkingFlushLen) {
            const delta = thinkingBuffer.slice(thinkingFlushLen);
            thinkingFlushLen = thinkingBuffer.length;
            callbacks.onThinking?.(delta);
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
          this.trackUsage(model, finalMessage.usage);
          return finalMessage;
        } catch (innerErr: any) {
          if (textEmitted && innerErr?.status === 429) {
            const err = new Error('429_rate_limit: Partial response already sent.');
            (err as any).__noRetry = true;
            throw err;
          }
          throw innerErr;
        }
      },
      {
        label: `stream(${model})`,
        onRetry: ({ attempt, delayMs, status }) => {
          const sec = Math.round(delayMs / 1000);
          process.stderr.write(`\r\x1b[K  ⏳ stream ${status || 'error'}, waiting ${sec}s... (retry ${attempt}/10)\r`);
        },
      }
    );
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
}
