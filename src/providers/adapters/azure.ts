// ── Azure OpenAI Adapter ─────────────────────────────────────────

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

// ── Azure deployment model definitions ──────────────────────────

const AZURE_MODELS: ModelInfo[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o (Azure)',
    provider: 'azure',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 2.5, output: 10.0 },
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini (Azure)',
    provider: 'azure',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 0.15, output: 0.6 },
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo (Azure)',
    provider: 'azure',
    contextWindow: 128000,
    maxOutput: 4096,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 10.0, output: 30.0 },
  },
  {
    id: 'gpt-4',
    name: 'GPT-4 (Azure)',
    provider: 'azure',
    contextWindow: 8192,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 30.0, output: 60.0 },
  },
  {
    id: 'gpt-35-turbo',
    name: 'GPT-3.5 Turbo (Azure)',
    provider: 'azure',
    contextWindow: 16385,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 0.5, output: 1.5 },
  },
  {
    id: 'o1',
    name: 'o1 (Azure)',
    provider: 'azure',
    contextWindow: 200000,
    maxOutput: 100000,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 15.0, output: 60.0 },
  },
  {
    id: 'o1-mini',
    name: 'o1-mini (Azure)',
    provider: 'azure',
    contextWindow: 128000,
    maxOutput: 65536,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 3.0, output: 12.0 },
  },
];

// ── Profile ─────────────────────────────────────────────────────

export const profile: ProviderProfile = {
  name: 'azure',
  displayName: 'Azure OpenAI',
  description: 'Microsoft Azure OpenAI Service. Enterprise-grade OpenAI models with Azure compliance and SLAs.',
  apiMode: 'chat_completions',
  aliases: ['azure-openai', 'ms-azure'],
  authType: 'api_key',
  envVars: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT'],
  baseUrl: '',
  models: AZURE_MODELS,
  fallbackModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  defaultModel: 'gpt-4o',
  defaultAuxModel: 'gpt-4o-mini',
  defaultHeaders: {
    'Content-Type': 'application/json',
  },
  maxContextTokens: 128000,
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

  prepareMessages: (messages: MessageParam[]): MessageParam[] => {
    // Azure OpenAI expects system messages as a separate parameter,
    // but also supports them as messages. We pass them through directly.
    return messages;
  },

  buildExtraBody: (options: RequestOptions): Record<string, unknown> => {
    const extra: Record<string, unknown> = {};
    // o1/o3 models do not support temperature or system messages
    if (options.model.startsWith('o1') || options.model.startsWith('o3')) {
      extra.reasoning_effort = 'medium';
    }
    return extra;
  },
};

// ── Azure URL builder ───────────────────────────────────────────

function buildAzureUrl(endpoint: string, model: string, apiVersion: string): string {
  // Azure path: {endpoint}/openai/deployments/{deployment-id}/chat/completions?api-version={version}
  const cleanEndpoint = endpoint.replace(/\/+$/, '');
  return `${cleanEndpoint}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=${apiVersion}`;
}

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
    'api-key': apiKey,
    'Content-Type': 'application/json',
  };
}

// ── Adapter factory ─────────────────────────────────────────────

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  const endpoint = config.baseUrl || process.env.AZURE_OPENAI_ENDPOINT || '';
  const apiKey = config.apiKey || process.env.AZURE_OPENAI_API_KEY || '';
  const apiVersion = (config as Record<string, unknown>).apiVersion as string || '2024-12-01-preview';
  const timeout = config.timeout ?? 120000;

  if (!endpoint) {
    throw new Error('Azure OpenAI endpoint is required. Set AZURE_OPENAI_ENDPOINT or pass baseUrl in config.');
  }

  return {
    profile,

    async chat(request: RequestOptions): Promise<ChatResponse> {
      if (!apiKey) {
        throw new Error('Azure OpenAI API key is required. Set AZURE_OPENAI_API_KEY.');
      }

      const model = request.model || profile.defaultModel;
      const url = buildAzureUrl(endpoint, model, apiVersion);
      const messages = convertMessages(request.messages);

      if (request.system) {
        messages.unshift({ role: 'system', content: request.system });
      }

      const body: Record<string, unknown> = {
        messages,
        max_tokens: request.maxTokens ?? 4096,
        stream: false,
      };

      // o1/o3 models don't support temperature
      if (!model.startsWith('o1') && !model.startsWith('o3')) {
        body.temperature = request.temperature ?? 0.7;
      }

      const tools = convertTools(request.tools);
      if (tools) {
        body.tools = tools;
      }

      // Merge any extra body from profile hooks
      const extraBody = profile.buildExtraBody?.(request) || {};
      Object.assign(body, extraBody);

      const response = await fetch(url, {
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
        throw new Error(`Azure OpenAI error [${errCode}]: ${errMsg}`);
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
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
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
        },
      };
    },

    async chatStream(request: RequestOptions, callbacks: StreamCallbacks): Promise<ChatResponse> {
      if (!apiKey) {
        throw new Error('Azure OpenAI API key is required. Set AZURE_OPENAI_API_KEY.');
      }

      const model = request.model || profile.defaultModel;
      const url = buildAzureUrl(endpoint, model, apiVersion);
      const messages = convertMessages(request.messages);

      if (request.system) {
        messages.unshift({ role: 'system', content: request.system });
      }

      const body: Record<string, unknown> = {
        messages,
        max_tokens: request.maxTokens ?? 4096,
        stream: true,
      };

      if (!model.startsWith('o1') && !model.startsWith('o3')) {
        body.temperature = request.temperature ?? 0.7;
      }

      const tools = convertTools(request.tools);
      if (tools) {
        body.tools = tools;
      }

      const extraBody = profile.buildExtraBody?.(request) || {};
      Object.assign(body, extraBody);

      const response = await fetch(url, {
        method: 'POST',
        headers: buildAuthHeaders(apiKey),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Azure OpenAI stream error ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Azure OpenAI stream returned no body');
      }

      const content: ContentBlock[] = [];
      let fullText = '';
      let finishReason = 'stop';
      let inputTokens = 0;
      let outputTokens = 0;
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
                usage?: { prompt_tokens?: number; completion_tokens?: number };
              };

              const delta = chunk.choices?.[0]?.delta;
              if (!delta) continue;

              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  if (tc.id && tc.function?.name) {
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
                    // Accumulate arguments for existing tool call
                    const lastTool = content.filter((c) => c.type === 'tool_use').pop();
                    if (lastTool && lastTool.type === 'tool_use') {
                      try {
                        lastTool.input = JSON.parse(
                          JSON.stringify(lastTool.input) === '{}' ? tc.function.arguments :
                          (JSON.stringify(lastTool.input).slice(0, -1) + tc.function.arguments + '}')
                        );
                      } catch {
                        // Arguments arrive incrementally; store raw
                        (lastTool as { _rawArgs?: string })._rawArgs =
                          ((lastTool as { _rawArgs?: string })._rawArgs || '') + tc.function.arguments;
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
        id: `chatcmpl-azure-${Date.now()}`,
        model: request.model || profile.defaultModel,
        content,
        stopReason: mapFinishReason(finishReason),
        usage: {
          inputTokens: inputTokens || estimateTokens(JSON.stringify(messages)),
          outputTokens: outputTokens || estimateTokens(fullText),
        },
      };
    },

    async listModels(): Promise<ModelInfo[]> {
      return AZURE_MODELS;
    },

    async validateConnection(): Promise<boolean> {
      if (!apiKey || !endpoint) return false;
      try {
        // Attempt a lightweight request to verify credentials
        const url = buildAzureUrl(endpoint, profile.defaultModel, apiVersion);
        const response = await fetch(url, {
          method: 'POST',
          headers: buildAuthHeaders(apiKey),
          body: JSON.stringify({
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
