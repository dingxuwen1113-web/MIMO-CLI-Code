// ── xAI / Grok Adapter ──────────────────────────────────────────

import type {
  ProviderProfile,
  ProviderAdapter,
  ProviderConfig,
  ModelInfo,
  RequestOptions,
  ChatResponse,
  StreamCallbacks,
  MessageParam,
  ContentBlock,
  ToolDefinition,
} from '../types';

// ── xAI model definitions ───────────────────────────────────────

const XAI_MODELS: ModelInfo[] = [
  {
    id: 'grok-3',
    name: 'Grok 3',
    provider: 'xai',
    contextWindow: 131072,
    maxOutput: 16384,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 3.0, output: 15.0 },
  },
  {
    id: 'grok-3-mini',
    name: 'Grok 3 Mini',
    provider: 'xai',
    contextWindow: 131072,
    maxOutput: 16384,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 0.30, output: 0.50 },
  },
  {
    id: 'grok-2',
    name: 'Grok 2',
    provider: 'xai',
    contextWindow: 131072,
    maxOutput: 16384,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 2.0, output: 10.0 },
  },
  {
    id: 'grok-2-vision',
    name: 'Grok 2 Vision',
    provider: 'xai',
    contextWindow: 32768,
    maxOutput: 4096,
    supportsVision: true,
    supportsToolUse: false,
    supportsStreaming: true,
    pricing: { input: 2.0, output: 10.0 },
  },
];

// ── Profile ─────────────────────────────────────────────────────

export const profile: ProviderProfile = {
  name: 'xai',
  displayName: 'xAI',
  description: 'xAI Grok models. OpenAI-compatible API with real-time knowledge and reasoning capabilities.',
  apiMode: 'chat_completions',
  aliases: ['grok', 'x-ai'],
  authType: 'api_key',
  envVars: ['XAI_API_KEY'],
  baseUrl: 'https://api.x.ai',
  models: XAI_MODELS,
  fallbackModels: ['grok-3', 'grok-3-mini', 'grok-2'],
  defaultModel: 'grok-3',
  defaultAuxModel: 'grok-3-mini',
  defaultHeaders: {
    'Content-Type': 'application/json',
  },
  maxContextTokens: 131072,
  maxOutputTokens: 16384,
  supportsStreaming: true,
  supportsVision: true,
  supportsToolUse: true,
  supportsThinking: true,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
};

// ── Token estimation ────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Convert messages to OpenAI-compatible format ────────────────

function convertMessages(messages: MessageParam[]): Array<Record<string, unknown>> {
  return messages.map((msg) => {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content };
    }

    const contentArray: Array<Record<string, unknown>> = [];

    for (const block of msg.content) {
      if (block.type === 'text') {
        contentArray.push({ type: 'text', text: block.text });
      } else if (block.type === 'image') {
        contentArray.push({
          type: 'image_url',
          image_url: {
            url: `data:${block.source.media_type};base64,${block.source.data}`,
          },
        });
      } else if (block.type === 'tool_result') {
        contentArray.push({
          type: 'tool_result',
          tool_call_id: block.tool_use_id,
          content: block.content,
        });
      } else if (block.type === 'tool_use') {
        return {
          role: 'assistant',
          tool_calls: [
            {
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input),
              },
            },
          ],
        };
      }
    }

    return { role: msg.role, content: contentArray };
  });
}

// ── Convert tools to OpenAI format ──────────────────────────────

function convertTools(
  tools?: ToolDefinition[]
): Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> | undefined {
  if (!tools || tools.length === 0) return undefined;

  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

// ── Build auth headers ──────────────────────────────────────────

function buildAuthHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

// ── Adapter factory ─────────────────────────────────────────────

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  const baseUrl = (config.baseUrl || process.env.XAI_BASE_URL || profile.baseUrl).replace(/\/+$/, '');
  const apiKey = config.apiKey || process.env.XAI_API_KEY || '';
  const timeout = config.timeout ?? 120000;

  return {
    profile,

    async chat(request: RequestOptions): Promise<ChatResponse> {
      if (!apiKey) {
        throw new Error('xAI API key is required. Set XAI_API_KEY environment variable.');
      }

      const model = request.model || profile.defaultModel;
      const messages = convertMessages(request.messages);

      if (request.system) {
        messages.unshift({ role: 'system', content: request.system });
      }

      const body: Record<string, unknown> = {
        model,
        messages,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7,
        stream: false,
      };

      const tools = convertTools(request.tools);
      if (tools) {
        body.tools = tools;
        body.tool_choice = 'auto';
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: buildAuthHeaders(apiKey),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        let parsed: { error?: { message?: string; code?: string; type?: string } } | null = null;
        try { parsed = JSON.parse(errorText); } catch { /* not json */ }
        const errMsg = parsed?.error?.message || errorText;
        const errCode = parsed?.error?.code || response.status;
        throw new Error(`xAI error [${errCode}]: ${errMsg}`);
      }

      const data = await response.json() as {
        id: string;
        model: string;
        choices: Array<{
          message: {
            role: string;
            content: string | null;
            tool_calls?: Array<{
              id: string;
              type: 'function';
              function: { name: string; arguments: string };
            }>;
          };
          finish_reason: string;
        }>;
        usage: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
          prompt_tokens_details?: { cached_tokens?: number };
        };
      };

      const choice = data.choices[0];
      const content: ContentBlock[] = [];

      if (choice.message.tool_calls) {
        for (const tc of choice.message.tool_calls) {
          let parsedInput: Record<string, unknown> = {};
          try { parsedInput = JSON.parse(tc.function.arguments); } catch { parsedInput = { raw: tc.function.arguments }; }
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: parsedInput,
          });
        }
      }

      if (choice.message.content) {
        content.push({ type: 'text', text: choice.message.content });
      }

      return {
        id: data.id,
        model: data.model,
        content,
        stopReason: mapFinishReason(choice.finish_reason),
        usage: {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          cacheRead: data.usage.prompt_tokens_details?.cached_tokens,
        },
      };
    },

    async chatStream(request: RequestOptions, callbacks: StreamCallbacks): Promise<ChatResponse> {
      if (!apiKey) {
        throw new Error('xAI API key is required. Set XAI_API_KEY environment variable.');
      }

      const model = request.model || profile.defaultModel;
      const messages = convertMessages(request.messages);

      if (request.system) {
        messages.unshift({ role: 'system', content: request.system });
      }

      const body: Record<string, unknown> = {
        model,
        messages,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7,
        stream: true,
      };

      const tools = convertTools(request.tools);
      if (tools) {
        body.tools = tools;
        body.tool_choice = 'auto';
      }

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: buildAuthHeaders(apiKey),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`xAI stream error ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        throw new Error('xAI stream returned no body');
      }

      const content: ContentBlock[] = [];
      let fullText = '';
      let finishReason = 'stop';
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheReadTokens = 0;
      const decoder = new TextDecoder();
      let buffer = '';

      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') continue;

            try {
              const chunk = JSON.parse(payload) as {
                id?: string;
                choices?: Array<{
                  delta?: {
                    content?: string;
                    tool_calls?: Array<{
                      index: number;
                      id?: string;
                      type?: 'function';
                      function?: { name?: string; arguments?: string };
                    }>;
                  };
                  finish_reason?: string;
                }>;
                usage?: {
                  prompt_tokens?: number;
                  completion_tokens?: number;
                  prompt_tokens_details?: { cached_tokens?: number };
                };
              };

              const delta = chunk.choices?.[0]?.delta;
              if (!delta) continue;

              // Handle tool call deltas
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  if (tc.id && tc.function?.name) {
                    // New tool call beginning
                    const toolBlock: ContentBlock = {
                      type: 'tool_use',
                      id: tc.id,
                      name: tc.function.name,
                      input: {},
                    };
                    content.push(toolBlock);
                    callbacks.onToolUse?.({
                      id: tc.id,
                      name: tc.function.name,
                      input: tc.function.arguments || '',
                    });
                  } else if (tc.function?.arguments) {
                    // Continuing tool call argument stream
                    const lastTool = content.filter((c) => c.type === 'tool_use').pop();
                    if (lastTool && lastTool.type === 'tool_use') {
                      const rawArgsKey = '_rawArgs';
                      const existing = (lastTool as Record<string, unknown>)[rawArgsKey] as string || '';
                      (lastTool as Record<string, unknown>)[rawArgsKey] = existing + tc.function.arguments;

                      // Try to parse accumulated args
                      try {
                        lastTool.input = JSON.parse((lastTool as Record<string, unknown>)[rawArgsKey] as string);
                      } catch {
                        // Still accumulating
                      }
                    }
                  }
                }
              }

              if (delta.content) {
                fullText += delta.content;
                callbacks.onText?.(delta.content);
              }

              if (chunk.choices?.[0]?.finish_reason) {
                finishReason = chunk.choices[0].finish_reason;
              }

              if (chunk.usage) {
                inputTokens = chunk.usage.prompt_tokens || 0;
                outputTokens = chunk.usage.completion_tokens || 0;
                cacheReadTokens = chunk.usage.prompt_tokens_details?.cached_tokens || 0;
              }
            } catch {
              // Skip malformed SSE chunks
            }
          }
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Stream read error';
        callbacks.onError?.(errorMsg);
      }

      if (fullText) {
        content.push({ type: 'text', text: fullText });
      }

      callbacks.onDone?.();

      return {
        id: `chatcmpl-xai-${Date.now()}`,
        model: request.model || profile.defaultModel,
        content,
        stopReason: mapFinishReason(finishReason),
        usage: {
          inputTokens: inputTokens || estimateTokens(JSON.stringify(messages)),
          outputTokens: outputTokens || estimateTokens(fullText),
          cacheRead: cacheReadTokens || undefined,
        },
      };
    },

    async listModels(): Promise<ModelInfo[]> {
      // xAI does not yet have a public /v1/models endpoint, return known models
      return XAI_MODELS;
    },

    async validateConnection(): Promise<boolean> {
      if (!apiKey) return false;
      try {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: buildAuthHeaders(apiKey),
          body: JSON.stringify({
            model: profile.defaultModel,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
          }),
          signal: AbortSignal.timeout(10000),
        });
        return response.ok || response.status === 429;
      } catch {
        return false;
      }
    },

    countTokens(text: string): number {
      return estimateTokens(text);
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────

function mapFinishReason(reason: string): string {
  switch (reason) {
    case 'stop': return 'stop';
    case 'length': return 'length';
    case 'tool_calls': return 'tool_use';
    case 'content_filter': return 'stop';
    default: return reason || 'stop';
  }
}
