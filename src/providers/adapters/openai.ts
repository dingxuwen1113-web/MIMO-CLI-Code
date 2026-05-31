// ── OpenAI Provider Adapter ──────────────────────────────────────

import { ProviderProfile, ProviderAdapter, ProviderConfig, ChatResponse, StreamCallbacks, RequestOptions, ModelInfo, ContentBlock } from '../types';

const OPENAI_MODELS: ModelInfo[] = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: 128000, maxOutput: 16384, supportsVision: true, supportsToolUse: true, supportsStreaming: true, pricing: { input: 2.5, output: 10 } },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', contextWindow: 128000, maxOutput: 16384, supportsVision: true, supportsToolUse: true, supportsStreaming: true, pricing: { input: 0.15, output: 0.6 } },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', contextWindow: 128000, maxOutput: 4096, supportsVision: true, supportsToolUse: true, supportsStreaming: true, pricing: { input: 10, output: 30 } },
  { id: 'gpt-4', name: 'GPT-4', provider: 'openai', contextWindow: 8192, maxOutput: 4096, supportsVision: false, supportsToolUse: true, supportsStreaming: true, pricing: { input: 30, output: 60 } },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', contextWindow: 16385, maxOutput: 4096, supportsVision: false, supportsToolUse: true, supportsStreaming: true, pricing: { input: 0.5, output: 1.5 } },
  { id: 'o1', name: 'o1', provider: 'openai', contextWindow: 200000, maxOutput: 100000, supportsVision: true, supportsToolUse: true, supportsStreaming: true },
  { id: 'o1-mini', name: 'o1-mini', provider: 'openai', contextWindow: 128000, maxOutput: 65536, supportsVision: false, supportsToolUse: false, supportsStreaming: true },
  { id: 'o1-pro', name: 'o1-pro', provider: 'openai', contextWindow: 200000, maxOutput: 100000, supportsVision: true, supportsToolUse: true, supportsStreaming: false },
  { id: 'o3', name: 'o3', provider: 'openai', contextWindow: 200000, maxOutput: 100000, supportsVision: true, supportsToolUse: true, supportsStreaming: true },
  { id: 'o3-mini', name: 'o3-mini', provider: 'openai', contextWindow: 200000, maxOutput: 100000, supportsVision: false, supportsToolUse: true, supportsStreaming: true },
  { id: 'o4-mini', name: 'o4-mini', provider: 'openai', contextWindow: 200000, maxOutput: 100000, supportsVision: true, supportsToolUse: true, supportsStreaming: true },
  { id: 'chatgpt-4o-latest', name: 'ChatGPT-4o Latest', provider: 'openai', contextWindow: 128000, maxOutput: 16384, supportsVision: true, supportsToolUse: true, supportsStreaming: true },
];

export const profile: ProviderProfile = {
  name: 'openai',
  displayName: 'OpenAI',
  description: 'OpenAI GPT models',
  apiMode: 'chat_completions',
  aliases: ['gpt', 'chatgpt'],
  authType: 'api_key',
  envVars: ['OPENAI_API_KEY', 'OPENAI_ORG_ID'],
  baseUrl: 'https://api.openai.com/v1',
  models: OPENAI_MODELS,
  fallbackModels: ['gpt-4o-mini'],
  defaultModel: 'gpt-4o',
  defaultHeaders: {},
  maxContextTokens: 200000,
  maxOutputTokens: 100000,
  supportsStreaming: true,
  supportsVision: true,
  supportsToolUse: true,
  supportsThinking: false,
  supportsPromptCaching: true,
  supportsImageGeneration: true,
  supportsVideoGeneration: false,
  supportsTTS: true,
  supportsSTT: true,
};

function convertMessages(messages: RequestOptions['messages']): unknown[] {
  return messages.map(msg => {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content };
    }
    const content = (msg.content as ContentBlock[]).map(block => {
      if (block.type === 'text') return { type: 'text', text: block.text };
      if (block.type === 'image') return { type: 'image_url', image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } };
      if (block.type === 'tool_use') return { type: 'text', text: JSON.stringify(block) };
      if (block.type === 'tool_result') return { type: 'tool_result', tool_call_id: block.tool_use_id, content: block.content };
      return block;
    });
    return { role: msg.role, content };
  });
}

function convertTools(tools?: RequestOptions['tools']): unknown[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

function parseResponse(data: Record<string, unknown>): ChatResponse {
  const choice = (data.choices as Array<Record<string, unknown>>)?.[0];
  const message = choice?.message as Record<string, unknown> | undefined;
  const content: ContentBlock[] = [];

  if (typeof message?.content === 'string' && message.content) {
    content.push({ type: 'text', text: message.content });
  }
  if (Array.isArray(message?.tool_calls)) {
    for (const tc of message.tool_calls as Array<Record<string, unknown>>) {
      content.push({
        type: 'tool_use',
        id: tc.id as string,
        name: (tc.function as Record<string, unknown>).name as string,
        input: JSON.parse((tc.function as Record<string, unknown>).arguments as string || '{}'),
      });
    }
  }

  const usage = data.usage as Record<string, unknown> | undefined;
  return {
    id: data.id as string,
    model: data.model as string,
    content,
    stopReason: (choice?.finish_reason as string) || 'stop',
    usage: {
      inputTokens: (usage?.prompt_tokens as number) || 0,
      outputTokens: (usage?.completion_tokens as number) || 0,
    },
  };
}

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  const baseUrl = config.baseUrl || profile.baseUrl;
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
  const orgId = config.orgId || process.env.OPENAI_ORG_ID || '';

  async function makeRequest(path: string, body: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...profile.defaultHeaders,
      ...(config.headers || {}),
    };
    if (orgId) headers['OpenAI-Organization'] = orgId;

    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: config.timeout ? AbortSignal.timeout(config.timeout) : undefined,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${err}`);
    }
    return response;
  }

  return {
    profile,

    async chat(request: RequestOptions): Promise<ChatResponse> {
      const isOModel = request.model.startsWith('o');
      const body: Record<string, unknown> = {
        model: request.model,
        messages: [
          ...(request.system ? [{ role: 'system', content: request.system }] : []),
          ...convertMessages(request.messages),
        ],
        max_tokens: request.maxTokens || 4096,
        stream: false,
      };
      if (!isOModel && request.temperature !== undefined) body.temperature = request.temperature;
      const tools = convertTools(request.tools);
      if (tools) body.tools = tools;

      const response = await makeRequest('/chat/completions', body);
      return parseResponse(await response.json() as Record<string, unknown>);
    },

    async chatStream(request: RequestOptions, callbacks: StreamCallbacks): Promise<ChatResponse> {
      const isOModel = request.model.startsWith('o');
      const body: Record<string, unknown> = {
        model: request.model,
        messages: [
          ...(request.system ? [{ role: 'system', content: request.system }] : []),
          ...convertMessages(request.messages),
        ],
        max_tokens: request.maxTokens || 4096,
        stream: true,
      };
      if (!isOModel && request.temperature !== undefined) body.temperature = request.temperature;
      const tools = convertTools(request.tools);
      if (tools) body.tools = tools;

      const response = await makeRequest('/chat/completions', body);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
      let responseModel = request.model;
      let responseId = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data) as Record<string, unknown>;
              responseModel = (parsed.model as string) || responseModel;
              responseId = (parsed.id as string) || responseId;
              const choice = (parsed.choices as Array<Record<string, unknown>>)?.[0];
              if (!choice) continue;
              const delta = choice.delta as Record<string, unknown> | undefined;
              if (!delta) continue;

              if (typeof delta.content === 'string' && delta.content) {
                fullText += delta.content;
                callbacks.onText?.(delta.content);
              }

              if (Array.isArray(delta.tool_calls)) {
                for (const tc of delta.tool_calls as Array<Record<string, unknown>>) {
                  const idx = tc.index as number;
                  if (!toolCalls.has(idx)) {
                    toolCalls.set(idx, { id: tc.id as string || '', name: '', arguments: '' });
                  }
                  const existing = toolCalls.get(idx)!;
                  if (tc.id) existing.id = tc.id as string;
                  const fn = tc.function as Record<string, unknown> | undefined;
                  if (fn?.name) existing.name = fn.name as string;
                  if (fn?.arguments) existing.arguments += fn.arguments as string;
                }
              }
            } catch { /* skip malformed chunks */ }
          }
        }
      } finally {
        reader.releaseLock();
      }

      const content: ContentBlock[] = [];
      if (fullText) content.push({ type: 'text', text: fullText });
      for (const [, tc] of toolCalls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: JSON.parse(tc.arguments || '{}'),
        });
        callbacks.onToolUse?.({ id: tc.id, name: tc.name, input: tc.arguments });
      }
      callbacks.onDone?.();

      return {
        id: responseId,
        model: responseModel,
        content,
        stopReason: 'stop',
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    },

    async listModels(): Promise<ModelInfo[]> {
      try {
        const response = await fetch(`${baseUrl}/models`, {
          headers: { 'Authorization': `Bearer ${apiKey}`, ...(orgId ? { 'OpenAI-Organization': orgId } : {}) },
        });
        if (!response.ok) return profile.models;
        const data = await response.json() as { data: Array<{ id: string }> };
        return data.data.map(m => {
          const known = profile.models.find(km => km.id === m.id);
          return known || { id: m.id, name: m.id, provider: 'openai', contextWindow: 128000, maxOutput: 4096, supportsVision: false, supportsToolUse: true, supportsStreaming: true };
        });
      } catch { return profile.models; }
    },

    async validateConnection(): Promise<boolean> {
      try {
        const response = await fetch(`${baseUrl}/models`, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        return response.ok;
      } catch { return false; }
    },

    countTokens(text: string): number {
      return Math.ceil(text.length / 4);
    },
  };
}
