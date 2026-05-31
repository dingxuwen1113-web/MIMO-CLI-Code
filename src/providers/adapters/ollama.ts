// ── Ollama Local LLM Adapter ─────────────────────────────────────

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
} from '../types';

// ── Model definitions for local Ollama ──────────────────────────

const OLLAMA_MODELS: ModelInfo[] = [
  {
    id: 'llama3.3',
    name: 'Llama 3.3 70B',
    provider: 'ollama',
    contextWindow: 131072,
    maxOutput: 32768,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'llama3.2',
    name: 'Llama 3.2',
    provider: 'ollama',
    contextWindow: 131072,
    maxOutput: 8192,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'llama3.2-vision',
    name: 'Llama 3.2 Vision',
    provider: 'ollama',
    contextWindow: 131072,
    maxOutput: 8192,
    supportsVision: true,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'qwen2.5',
    name: 'Qwen 2.5',
    provider: 'ollama',
    contextWindow: 131072,
    maxOutput: 8192,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'mistral',
    name: 'Mistral',
    provider: 'ollama',
    contextWindow: 32768,
    maxOutput: 8192,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'codellama',
    name: 'Code Llama',
    provider: 'ollama',
    contextWindow: 16384,
    maxOutput: 8192,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'phi3',
    name: 'Phi-3',
    provider: 'ollama',
    contextWindow: 131072,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'gemma2',
    name: 'Gemma 2',
    provider: 'ollama',
    contextWindow: 8192,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
];

// ── Profile ─────────────────────────────────────────────────────

export const profile: ProviderProfile = {
  name: 'ollama',
  displayName: 'Ollama',
  description: 'Local LLM inference via Ollama. Run models locally with no API key required.',
  apiMode: 'chat_completions',
  aliases: ['ollama-local', 'local'],
  authType: 'api_key',
  envVars: ['OLLAMA_HOST'],
  baseUrl: 'http://localhost:11434',
  models: OLLAMA_MODELS,
  fallbackModels: ['llama3.3', 'llama3.2', 'qwen2.5', 'mistral'],
  defaultModel: 'llama3.3',
  defaultHeaders: { 'Content-Type': 'application/json' },
  maxContextTokens: 131072,
  maxOutputTokens: 32768,
  supportsStreaming: true,
  supportsVision: true,
  supportsToolUse: true,
  supportsThinking: false,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
  omitTemperature: false,

  fetchModels: async () => {
    return fetchAvailableModels();
  },
};

// ── Fetch available models from Ollama instance ─────────────────

async function fetchAvailableModels(): Promise<ModelInfo[]> {
  const baseUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return OLLAMA_MODELS;
    }

    const data = await response.json() as {
      models?: Array<{
        name: string;
        size: number;
        details?: {
          parameter_size?: string;
          family?: string;
          families?: string[];
          quantization_level?: string;
        };
      }>;
    };

    if (!data.models || data.models.length === 0) {
      return OLLAMA_MODELS;
    }

    return data.models.map((m) => {
      const baseId = m.name.includes(':') ? m.name.split(':')[0] : m.name;
      const isVision = (m.details?.families || []).some(
        (f) => f.toLowerCase().includes('clip') || f.toLowerCase().includes('vision')
      );
      const known = OLLAMA_MODELS.find((k) => k.id === baseId);

      return {
        id: m.name,
        name: `${m.name}${m.details?.parameter_size ? ` (${m.details.parameter_size})` : ''}`,
        provider: 'ollama',
        contextWindow: known?.contextWindow || 8192,
        maxOutput: known?.maxOutput || 4096,
        supportsVision: isVision || (known?.supportsVision ?? false),
        supportsToolUse: known?.supportsToolUse ?? false,
        supportsStreaming: true,
      };
    });
  } catch {
    return OLLAMA_MODELS;
  }
}

// ── Token estimation (rough: ~4 chars per token) ────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Convert messages to Ollama format ───────────────────────────

function convertMessages(messages: MessageParam[]): Array<{
  role: string;
  content: string;
  images?: string[];
}> {
  return messages.map((msg) => {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content };
    }

    const parts = msg.content;
    let textContent = '';
    const images: string[] = [];

    for (const block of parts) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'image') {
        images.push(block.source.data);
      } else if (block.type === 'tool_result') {
        textContent += `[Tool Result]\n${block.content}`;
      }
    }

    const result: { role: string; content: string; images?: string[] } = {
      role: msg.role,
      content: textContent,
    };

    if (images.length > 0) {
      result.images = images;
    }

    return result;
  });
}

// ── Convert tools to Ollama format ──────────────────────────────

function convertTools(
  tools?: RequestOptions['tools']
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

// ── Adapter factory ─────────────────────────────────────────────

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  const baseUrl = config.baseUrl || process.env.OLLAMA_HOST || 'http://localhost:11434';
  const timeout = config.timeout ?? 120000;

  return {
    profile,

    async chat(request: RequestOptions): Promise<ChatResponse> {
      const messages = convertMessages(request.messages);
      if (request.system) {
        messages.unshift({ role: 'system', content: request.system });
      }

      const body: Record<string, unknown> = {
        model: request.model || profile.defaultModel,
        messages,
        stream: false,
        options: {
          num_predict: request.maxTokens ?? 4096,
          temperature: request.temperature ?? 0.7,
        },
      };

      const tools = convertTools(request.tools);
      if (tools) {
        body.tools = tools;
      }

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Ollama API error ${response.status}: ${errorText}`);
      }

      const data = await response.json() as {
        model: string;
        message: {
          role: string;
          content: string;
          tool_calls?: Array<{
            function: { name: string; arguments: Record<string, unknown> };
          }>;
        };
        done: boolean;
        total_duration?: number;
        eval_count?: number;
        prompt_eval_count?: number;
      };

      const content: ContentBlock[] = [];

      if (data.message.tool_calls && data.message.tool_calls.length > 0) {
        for (const tc of data.message.tool_calls) {
          content.push({
            type: 'tool_use',
            id: `toolu_ollama_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: tc.function.name,
            input: tc.function.arguments,
          });
        }
      }

      if (data.message.content) {
        content.push({ type: 'text', text: data.message.content });
      }

      const inputTokens = data.prompt_eval_count || estimateTokens(JSON.stringify(messages));
      const outputTokens = data.eval_count || estimateTokens(data.message.content || '');

      return {
        id: `chatcmpl-ollama-${Date.now()}`,
        model: data.model,
        content,
        stopReason: data.done ? 'stop' : 'length',
        usage: { inputTokens, outputTokens },
      };
    },

    async chatStream(request: RequestOptions, callbacks: StreamCallbacks): Promise<ChatResponse> {
      const messages = convertMessages(request.messages);
      if (request.system) {
        messages.unshift({ role: 'system', content: request.system });
      }

      const body: Record<string, unknown> = {
        model: request.model || profile.defaultModel,
        messages,
        stream: true,
        options: {
          num_predict: request.maxTokens ?? 4096,
          temperature: request.temperature ?? 0.7,
        },
      };

      const tools = convertTools(request.tools);
      if (tools) {
        body.tools = tools;
      }

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Ollama API error ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Ollama stream returned no body');
      }

      const content: ContentBlock[] = [];
      let fullText = '';
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
            if (!line.trim()) continue;

            try {
              const chunk = JSON.parse(line) as {
                model?: string;
                message?: {
                  role: string;
                  content: string;
                  tool_calls?: Array<{
                    function: { name: string; arguments: Record<string, unknown> };
                  }>;
                };
                done: boolean;
                prompt_eval_count?: number;
                eval_count?: number;
              };

              if (chunk.message?.tool_calls) {
                for (const tc of chunk.message.tool_calls) {
                  const toolBlock: ContentBlock = {
                    type: 'tool_use',
                    id: `toolu_ollama_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    name: tc.function.name,
                    input: tc.function.arguments,
                  };
                  content.push(toolBlock);
                  callbacks.onToolUse?.({
                    id: toolBlock.id,
                    name: toolBlock.name,
                    input: JSON.stringify(toolBlock.input),
                  });
                }
              }

              if (chunk.message?.content) {
                fullText += chunk.message.content;
                callbacks.onText?.(chunk.message.content);
              }

              if (chunk.done) {
                inputTokens = chunk.prompt_eval_count || 0;
                outputTokens = chunk.eval_count || 0;
              }
            } catch {
              // Skip malformed JSON chunks
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
        id: `chatcmpl-ollama-${Date.now()}`,
        model: request.model || profile.defaultModel,
        content,
        stopReason: 'stop',
        usage: {
          inputTokens: inputTokens || estimateTokens(JSON.stringify(messages)),
          outputTokens: outputTokens || estimateTokens(fullText),
        },
      };
    },

    async listModels(): Promise<ModelInfo[]> {
      return fetchAvailableModels();
    },

    async validateConnection(): Promise<boolean> {
      try {
        const response = await fetch(`${baseUrl}/api/tags`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        return response.ok;
      } catch {
        return false;
      }
    },

    countTokens(text: string): number {
      return estimateTokens(text);
    },
  };
}
