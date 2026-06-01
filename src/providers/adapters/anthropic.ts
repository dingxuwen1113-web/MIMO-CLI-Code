// ── Anthropic Claude Provider Adapter ─────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import type {
  ProviderProfile,
  ProviderAdapter,
  ProviderConfig,
  ModelInfo,
  RequestOptions,
  ChatResponse,
  ContentBlock,
  MessageParam,
  StreamCallbacks,
  ToolDefinition,
} from '../types';

// Re-export the ClientOptions type from the SDK for internal use
type ClientOptions = ConstructorParameters<typeof Anthropic>[0];

// ── Model Definitions ────────────────────────────────────────────

const MODELS: ModelInfo[] = [
  {
    id: 'claude-opus-4-20250514',
    name: 'Claude Opus 4',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 32_000,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 15, output: 75 },
  },
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 16_000,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 3, output: 15 },
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 8_192,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 0.80, output: 4 },
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 8_192,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 3, output: 15 },
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 8_192,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 0.80, output: 4 },
  },
  {
    id: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 4_096,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    deprecated: true,
    pricing: { input: 15, output: 75 },
  },
];

// ── Provider Profile ─────────────────────────────────────────────

export const profile: ProviderProfile = {
  name: 'anthropic',
  displayName: 'Anthropic',
  description: 'Anthropic Claude models via the Messages API',
  apiMode: 'anthropic_messages',
  aliases: ['claude'],
  authType: 'api_key',
  envVars: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
  baseUrl: 'https://api.anthropic.com',
  models: MODELS,
  fallbackModels: [
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
  ],
  defaultModel: 'claude-sonnet-4-20250514',
  defaultAuxModel: 'claude-3-5-haiku-20241022',
  defaultHeaders: {},
  maxContextTokens: 200_000,
  maxOutputTokens: 32_000,
  supportsStreaming: true,
  supportsVision: true,
  supportsToolUse: true,
  supportsThinking: true,
  supportsPromptCaching: true,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,

  getMaxTokens(requested?: number): number {
    return requested ?? 8_192;
  },

  buildExtraBody(options: RequestOptions): Record<string, unknown> {
    const extra: Record<string, unknown> = {};
    if (options.thinking) {
      extra.thinking = { type: 'enabled', budget_tokens: 10_000 };
    }
    return extra;
  },
};

// ── Adapter Implementation ───────────────────────────────────────

class AnthropicAdapter implements ProviderAdapter {
  readonly profile: ProviderProfile;
  private client: Anthropic;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.profile = profile;
    this.config = config;

    const apiKey =
      config.apiKey ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.CLAUDE_API_KEY ||
      '';

    const options: ClientOptions = { apiKey, maxRetries: 3, timeout: 120_000 };

    if (config.baseUrl) {
      options.baseURL = config.baseUrl.replace(/\/+$/, '');
    }
    if (config.timeout) {
      options.timeout = config.timeout;
    }
    if (config.maxRetries !== undefined) {
      options.maxRetries = config.maxRetries;
    }
    if (config.headers) {
      options.defaultHeaders = config.headers;
    }

    this.client = new Anthropic(options);
  }

  // ── Build system prompt from request ──────────────────────────

  private buildSystem(
    request: RequestOptions
  ): Anthropic.MessageCreateParams['system'] {
    if (!request.system) return undefined;

    // Anthropic Messages API accepts system as a string or content blocks
    // Use content blocks with cache_control for prompt caching support
    if (this.profile.supportsPromptCaching) {
      return [
        {
          type: 'text' as const,
          text: request.system,
          cache_control: { type: 'ephemeral' },
        },
      ];
    }

    return request.system;
  }

  // ── Convert our MessageParam[] to Anthropic format ────────────

  private convertMessages(messages: MessageParam[]): Anthropic.MessageParam[] {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        const role = m.role as 'user' | 'assistant';

        if (typeof m.content === 'string') {
          return { role, content: m.content };
        }

        const content = m.content.map((block) => {
          switch (block.type) {
            case 'text':
              return { type: 'text' as const, text: block.text };

            case 'image':
              return {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: block.source.media_type as
                    | 'image/jpeg'
                    | 'image/png'
                    | 'image/gif'
                    | 'image/webp',
                  data: block.source.data,
                },
              };

            case 'tool_use':
              return {
                type: 'tool_use' as const,
                id: block.id,
                name: block.name,
                input: block.input,
              };

            case 'tool_result':
              return {
                type: 'tool_result' as const,
                tool_use_id: block.tool_use_id,
                content: block.content,
              };

            default:
              return { type: 'text' as const, text: JSON.stringify(block) };
          }
        });

        return { role, content };
      });
  }

  // ── Convert tools to Anthropic format ─────────────────────────

  private convertTools(
    tools?: ToolDefinition[]
  ): Anthropic.Tool[] | undefined {
    if (!tools || tools.length === 0) return undefined;

    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
    }));
  }

  // ── Extract text from content blocks ──────────────────────────

  private extractContentBlocks(
    content: Anthropic.ContentBlock[]
  ): ContentBlock[] {
    return content.map((block) => {
      if (block.type === 'text') {
        return { type: 'text', text: block.text };
      }
      if (block.type === 'tool_use') {
        return {
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        };
      }
      // Thinking or other block types
      if (block.type === 'thinking') {
        return { type: 'text', text: block.thinking };
      }
      return { type: 'text', text: JSON.stringify(block) };
    });
  }

  // ── Resolve model ID from config or request ───────────────────

  private resolveModel(requestedModel: string): string {
    if (requestedModel) return requestedModel;
    if (this.config.defaultModel) return this.config.defaultModel;
    return profile.defaultModel;
  }

  // ── chat() ────────────────────────────────────────────────────

  async chat(request: RequestOptions): Promise<ChatResponse> {
    const model = this.resolveModel(request.model);
    const maxTokens = (profile.getMaxTokens ?? ((r?: number) => r ?? 8_192))(request.maxTokens);

    const params: Anthropic.MessageCreateParams = {
      model,
      max_tokens: maxTokens,
      messages: this.convertMessages(request.messages),
      system: this.buildSystem(request),
    };

    if (request.temperature !== undefined) {
      params.temperature = request.temperature;
    }

    const tools = this.convertTools(request.tools);
    if (tools) {
      params.tools = tools;
    }

    // Apply extra body (e.g. thinking)
    if (request.thinking) {
      (params as unknown as Record<string, unknown>).thinking = {
        type: 'enabled',
        budget_tokens: 10_000,
      };
    }

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create(params);
    } catch (err: any) {
      if (err?.status === 429) {
        // Respect Retry-After header
        const retryAfter = err?.headers?.['retry-after'];
        if (retryAfter) {
          const waitMs = Math.min(parseInt(retryAfter, 10) * 1000, 15000);
          await new Promise(r => setTimeout(r, waitMs));
          try {
            response = await this.client.messages.create(params);
          } catch (retryErr: any) {
            throw this.wrapApiError(retryErr);
          }
        } else {
          throw this.wrapApiError(err);
        }
      } else {
        throw this.wrapApiError(err);
      }
    }

    const content = this.extractContentBlocks(
      response.content as Anthropic.ContentBlock[]
    );

    return {
      id: response.id,
      model: response.model,
      content,
      stopReason: response.stop_reason ?? 'end_turn',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheCreation: response.usage.cache_creation_input_tokens ?? undefined,
        cacheRead: response.usage.cache_read_input_tokens ?? undefined,
      },
    };
  }

  // ── chatStream() ──────────────────────────────────────────────

  async chatStream(
    request: RequestOptions,
    callbacks: StreamCallbacks
  ): Promise<ChatResponse> {
    const model = this.resolveModel(request.model);
    const maxTokens = (profile.getMaxTokens ?? ((r?: number) => r ?? 8_192))(request.maxTokens);

    const params: Anthropic.MessageStreamParams = {
      model,
      max_tokens: maxTokens,
      messages: this.convertMessages(request.messages),
      system: this.buildSystem(request),
    };

    if (request.temperature !== undefined) {
      params.temperature = request.temperature;
    }

    const tools = this.convertTools(request.tools);
    if (tools) {
      params.tools = tools;
    }

    // Apply extra body (e.g. thinking)
    if (request.thinking) {
      (params as unknown as Record<string, unknown>).thinking = {
        type: 'enabled',
        budget_tokens: 10_000,
      };
    }

    const stream = this.client.messages.stream(params);

    // Accumulators for building the final response
    const contentBlocks: ContentBlock[] = [];
    let responseId = '';
    let responseModel = model;
    let stopReason = 'end_turn';
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheCreation: number | undefined;
    let cacheRead: number | undefined;

    // Track current tool use being built
    let currentToolId = '';
    let currentToolName = '';
    let currentToolInput = '';

    try {
      stream.on('text', (text) => {
        callbacks.onText?.(text);
      });

      stream.on('contentBlock', (block) => {
        // When a content block starts, track tool_use blocks
        if (block.type === 'tool_use') {
          currentToolId = block.id;
          currentToolName = block.name;
          currentToolInput = '';
        }
      });

      stream.on('inputJson', (partialJson) => {
        // Accumulate partial JSON for tool input
        if (currentToolName) {
          currentToolInput += partialJson ?? '';
        }
      });

      stream.on('thinking', (thinkingDelta) => {
        callbacks.onThinking?.(thinkingDelta);
      });

      // Wait for the stream to complete
      let finalMessage: Anthropic.Message;
      try {
        finalMessage = await stream.finalMessage();
      } catch (innerErr: any) {
        if (innerErr?.status === 429) {
          // Respect Retry-After header before giving up
          const retryAfter = innerErr?.headers?.['retry-after'];
          if (retryAfter) {
            const waitMs = Math.min(parseInt(retryAfter, 10) * 1000, 15000);
            await new Promise(r => setTimeout(r, waitMs));
          }
          throw this.wrapApiError(innerErr);
        }
        throw innerErr;
      }

      responseId = finalMessage.id;
      responseModel = finalMessage.model;
      if (finalMessage.stop_reason) {
        stopReason = finalMessage.stop_reason;
      }
      inputTokens = finalMessage.usage.input_tokens;
      outputTokens = finalMessage.usage.output_tokens;
      if (finalMessage.usage.cache_creation_input_tokens) {
        cacheCreation =
          finalMessage.usage.cache_creation_input_tokens ?? undefined;
      }
      if (finalMessage.usage.cache_read_input_tokens) {
        cacheRead =
          finalMessage.usage.cache_read_input_tokens ?? undefined;
      }

      // Process final content blocks
      for (const block of finalMessage.content) {
        if (block.type === 'text') {
          contentBlocks.push({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use') {
          const toolInfo = {
            id: block.id,
            name: block.name,
            input: JSON.stringify(block.input),
          };
          contentBlocks.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
          callbacks.onToolUse?.(toolInfo);
        } else if (block.type === 'thinking') {
          contentBlocks.push({ type: 'text', text: block.thinking });
          callbacks.onThinking?.(block.thinking);
        }
      }

      callbacks.onDone?.();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      callbacks.onError?.(errorMessage);
      if (error instanceof Error && (error as any).status === 429) {
        throw this.wrapApiError(error);
      }
      throw error;
    }

    return {
      id: responseId,
      model: responseModel,
      content: contentBlocks,
      stopReason,
      usage: {
        inputTokens,
        outputTokens,
        cacheCreation,
        cacheRead,
      },
    };
  }

  // ── Error wrapping ────────────────────────────────────────────

  private wrapApiError(err: any): Error {
    const status = err?.status || err?.statusCode || err?.error?.status;
    const message = err?.message || String(err);

    if (status === 401 || message.includes('401')) {
      return new Error('Anthropic API key is invalid or expired. Run "mimo init" to reconfigure.');
    }
    if (status === 403 || message.includes('403')) {
      return new Error('Anthropic API key does not have permission. Check your plan limits.');
    }
    if (status === 429 || message.includes('429')) {
      return new Error('429_rate_limit: Rate limit exceeded after retries. Please wait and try again.');
    }
    if (status === 529 || message.includes('529')) {
      return new Error('529_overloaded: API is temporarily overloaded. Please wait and retry.');
    }
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      return new Error(`Cannot reach Anthropic API at ${this.config.baseUrl || 'default endpoint'}. Check your network and base URL.`);
    }
    return new Error(`Anthropic API error: ${message}`);
  }

  // ── listModels() ──────────────────────────────────────────────

  async listModels(): Promise<ModelInfo[]> {
    // If custom models are configured, filter to only those
    if (this.config.models && this.config.models.length > 0) {
      return MODELS.filter((m) => this.config.models!.includes(m.id));
    }
    return [...MODELS];
  }

  // ── validateConnection() ──────────────────────────────────────

  async validateConnection(): Promise<boolean> {
    const apiKey =
      this.config.apiKey ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.CLAUDE_API_KEY;

    if (!apiKey) return false;

    try {
      // Use a minimal request to verify the API key is valid
      await this.client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });
      return true;
    } catch (error) {
      // If the error is auth-related, return false
      // If it is a different error (rate limit, etc.), the connection is valid
      if (error instanceof Anthropic.AuthenticationError) {
        return false;
      }
      if (error instanceof Anthropic.PermissionDeniedError) {
        return false;
      }
      // Any other error (rate limit, server error, etc.) means the key works
      return true;
    }
  }

  // ── countTokens() ─────────────────────────────────────────────

  countTokens(text: string): number {
    // Rough approximation: ~4 characters per token for English text.
    // Anthropic does not expose a public tokenizer endpoint, so this
    // uses a well-tested heuristic that matches the tiktoken cl100k
    // family closely enough for budgeting purposes.
    //
    // For CJK / multi-byte text the ratio is closer to ~1.5 chars/token;
    // we detect that via the Unicode range and adjust.
    const cjkRe = /[一-鿿㐀-䶿豈-﫿]/g;
    const cjkMatches = text.match(cjkRe);
    const cjkCount = cjkMatches ? cjkMatches.length : 0;
    const nonCjkLength = text.length - cjkCount;

    // ~4 chars/token for Latin, ~1.5 chars/token for CJK
    return Math.ceil(nonCjkLength / 4 + cjkCount / 1.5);
  }
}

// ── Factory ──────────────────────────────────────────────────────

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return new AnthropicAdapter(config);
}
