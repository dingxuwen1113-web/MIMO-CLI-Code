// ── OpenAI-Compatible Base Helper ────────────────────────────────
// Shared implementation for all OpenAI-compatible provider adapters.
// Each adapter calls createOpenAICompatibleAdapter() with its profile
// and customizations.

import {
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

// ── Token Estimation ─────────────────────────────────────────────
// Simple heuristic: ~4 chars per token (works reasonably for English/Chinese mixed)
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// ── SSE Stream Parser ─────────────────────────────────────────────
interface ParsedSSEEvent {
  data: string;
  event?: string;
}

function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: { decode(input?: any, options?: { stream?: boolean }): string },
  callbacks: StreamCallbacks,
  controller: AbortController
): Promise<{ content: ContentBlock[]; usage: { inputTokens: number; outputTokens: number } }> {
  return new Promise((resolve, reject) => {
    const content: ContentBlock[] = [{ type: 'text', text: '' }];
    const usage = { inputTokens: 0, outputTokens: 0 };
    let buffer = '';
    let currentToolId = '';
    let currentToolName = '';
    let currentToolArgs = '';

    async function pump(): Promise<void> {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Split by double-newline to get SSE events
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const lines = part.split('\n');
            let data = '';
            let eventName = '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventName = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                data = line.slice(6);
              } else if (line === 'data: [DONE]') {
                // Stream complete
                if (currentToolArgs) {
                  callbacks.onToolUse?.({
                    id: currentToolId,
                    name: currentToolName,
                    input: currentToolArgs,
                  });
                  content.push({
                    type: 'tool_use',
                    id: currentToolId,
                    name: currentToolName,
                    input: JSON.parse(currentToolArgs || '{}'),
                  });
                  currentToolId = '';
                  currentToolName = '';
                  currentToolArgs = '';
                }
                callbacks.onDone?.();
                resolve({ content, usage });
                return;
              }
            }

            if (!data || data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              // Extract usage if present
              if (parsed.usage) {
                usage.inputTokens = parsed.usage.prompt_tokens || 0;
                usage.outputTokens = parsed.usage.completion_tokens || 0;
              }

              const choices = parsed.choices || [];
              for (const choice of choices) {
                const delta = choice.delta || {};

                // Text content
                if (delta.content) {
                  (content[0] as { type: 'text'; text: string }).text += delta.content;
                  callbacks.onText?.(delta.content);
                }

                // Tool calls
                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    if (tc.id) {
                      // New tool call
                      if (currentToolArgs) {
                        callbacks.onToolUse?.({
                          id: currentToolId,
                          name: currentToolName,
                          input: currentToolArgs,
                        });
                        content.push({
                          type: 'tool_use',
                          id: currentToolId,
                          name: currentToolName,
                          input: JSON.parse(currentToolArgs || '{}'),
                        });
                      }
                      currentToolId = tc.id;
                      currentToolName = tc.function?.name || '';
                      currentToolArgs = '';
                    }
                    if (tc.function?.arguments) {
                      currentToolArgs += tc.function.arguments;
                    }
                  }
                }

                // Reasoning content (for models that support it)
                if (delta.reasoning_content || delta.thinking) {
                  const thinkingText = delta.reasoning_content || delta.thinking;
                  callbacks.onThinking?.(thinkingText);
                }

                // Finish reason
                if (choice.finish_reason) {
                  if (currentToolArgs) {
                    callbacks.onToolUse?.({
                      id: currentToolId,
                      name: currentToolName,
                      input: currentToolArgs,
                    });
                    content.push({
                      type: 'tool_use',
                      id: currentToolId,
                      name: currentToolName,
                      input: JSON.parse(currentToolArgs || '{}'),
                    });
                    currentToolId = '';
                    currentToolName = '';
                    currentToolArgs = '';
                  }
                }
              }
            } catch {
              // Ignore unparseable SSE data
            }
          }
        }

        // Stream ended without [DONE]
        if (currentToolArgs) {
          callbacks.onToolUse?.({
            id: currentToolId,
            name: currentToolName,
            input: currentToolArgs,
          });
          content.push({
            type: 'tool_use',
            id: currentToolId,
            name: currentToolName,
            input: JSON.parse(currentToolArgs || '{}'),
          });
        }
        callbacks.onDone?.();
        resolve({ content, usage });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        callbacks.onError?.(msg);
        reject(err);
      }
    }

    pump();
  });
}

// ── Build OpenAI Request Body ─────────────────────────────────────
function buildRequestBody(
  request: RequestOptions,
  profile: ProviderProfile,
  stream: boolean
): Record<string, unknown> {
  const messages: Array<Record<string, unknown>> = [];

  // System message
  if (request.system) {
    messages.push({ role: 'system', content: request.system });
  }

  // Convert MessageParam[] to OpenAI format
  for (const msg of request.messages) {
    if (typeof msg.content === 'string') {
      messages.push({ role: msg.role, content: msg.content });
    } else {
      // Convert content blocks to OpenAI format
      const openaiContent: Array<Record<string, unknown>> = [];
      for (const block of msg.content) {
        if (block.type === 'text') {
          openaiContent.push({ type: 'text', text: block.text });
        } else if (block.type === 'image') {
          openaiContent.push({
            type: 'image_url',
            image_url: {
              url: `data:${block.source.media_type};base64,${block.source.data}`,
            },
          });
        } else if (block.type === 'tool_use') {
          openaiContent.push({
            type: 'function',
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          });
        } else if (block.type === 'tool_result') {
          messages.push({
            role: 'tool',
            tool_call_id: block.tool_use_id,
            content: block.content,
          });
          continue;
        }
      }
      if (openaiContent.length > 0) {
        messages.push({ role: msg.role, content: openaiContent });
      }
    }
  }

  const maxTokens = request.maxTokens ?? profile.maxOutputTokens;
  const body: Record<string, unknown> = {
    model: request.model,
    messages,
    max_tokens: maxTokens,
    stream,
  };

  // Temperature (some providers require or omit it)
  if (profile.omitTemperature !== true) {
    body.temperature = request.temperature ?? 0.7;
    if (profile.fixedTemperature !== undefined) {
      body.temperature = profile.fixedTemperature;
    }
  }

  // Tools
  if (request.tools && request.tools.length > 0 && profile.supportsToolUse) {
    body.tools = request.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }

  return body;
}

// ── Parse Non-Streaming Response ──────────────────────────────────
function parseChatResponse(data: Record<string, unknown>): { content: ContentBlock[]; stopReason: string; usage: { inputTokens: number; outputTokens: number } } {
  const content: ContentBlock[] = [];
  const choices = (data.choices as Array<Record<string, unknown>>) || [];
  let stopReason = 'end_turn';

  for (const choice of choices) {
    const message = choice.message as Record<string, unknown> | undefined;
    if (!message) continue;

    // Text content
    if (message.content && typeof message.content === 'string') {
      content.push({ type: 'text', text: message.content });
    }

    // Tool calls
    if (Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        const fn = tc.function as Record<string, unknown>;
        let parsedInput: Record<string, unknown> = {};
        try {
          parsedInput = JSON.parse(fn.arguments as string || '{}');
        } catch {
          parsedInput = { raw: fn.arguments };
        }
        content.push({
          type: 'tool_use',
          id: tc.id as string,
          name: fn.name as string,
          input: parsedInput,
        });
      }
      stopReason = 'tool_use';
    }

    if (choice.finish_reason === 'tool_calls') {
      stopReason = 'tool_use';
    } else if (choice.finish_reason === 'length') {
      stopReason = 'max_tokens';
    }
  }

  const rawUsage = data.usage as Record<string, number> | undefined;
  const usage = {
    inputTokens: rawUsage?.prompt_tokens ?? 0,
    outputTokens: rawUsage?.completion_tokens ?? 0,
  };

  return { content, stopReason, usage };
}

// ── Main Factory ──────────────────────────────────────────────────
export interface OpenAICompatibleConfig {
  profile: ProviderProfile;
  config: ProviderConfig;
  /** Hook to modify the fetch request before sending */
  transformRequest?: (body: Record<string, unknown>, headers: Record<string, string>) => Record<string, unknown>;
  /** Hook to modify headers before sending */
  transformHeaders?: (headers: Record<string, string>) => Record<string, string>;
  /** Custom model fetching logic (default: GET /v1/models) */
  fetchModelsImpl?: () => Promise<ModelInfo[]>;
}

export function createOpenAICompatibleAdapter(cfg: OpenAICompatibleConfig): ProviderAdapter {
  const { profile, config: providerConfig } = cfg;

  function getApiKey(): string {
    const key = providerConfig.apiKey || profile.envVars.map((e) => process.env[e]).find(Boolean);
    if (!key) {
      throw new Error(
        `No API key found for ${profile.displayName}. Set one of: ${profile.envVars.join(', ')}`
      );
    }
    return key;
  }

  function getBaseUrl(): string {
    return providerConfig.baseUrl || profile.baseUrl;
  }

  function buildHeaders(): Record<string, string> {
    const apiKey = getApiKey();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...profile.defaultHeaders,
      ...(providerConfig.headers || {}),
    };
    return cfg.transformHeaders ? cfg.transformHeaders(headers) : headers;
  }

  async function makeRequest(
    path: string,
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<Response> {
    const baseUrl = getBaseUrl();
    const url = `https://${baseUrl}${path}`;
    const headers = buildHeaders();
    const finalBody = cfg.transformRequest ? cfg.transformRequest(body, headers) : body;
    const timeout = providerConfig.timeout ?? 120_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(finalBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error');
        throw new Error(
          `${profile.displayName} API error ${response.status}: ${errorText}`
        );
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function chat(request: RequestOptions): Promise<ChatResponse> {
    const body = buildRequestBody(request, profile, false);
    const response = await makeRequest('/v1/chat/completions', body);
    const data = (await response.json()) as Record<string, unknown>;
    const { content, stopReason, usage } = parseChatResponse(data);

    return {
      id: (data.id as string) || `chatcmpl-${Date.now()}`,
      model: (data.model as string) || request.model,
      content,
      stopReason,
      usage,
    };
  }

  async function chatStream(
    request: RequestOptions,
    callbacks: StreamCallbacks
  ): Promise<ChatResponse> {
    const body = buildRequestBody(request, profile, true);
    const baseUrl = getBaseUrl();
    const url = `https://${baseUrl}/v1/chat/completions`;
    const headers = buildHeaders();
    const finalBody = cfg.transformRequest ? cfg.transformRequest(body, headers) : body;
    const timeout = providerConfig.timeout ?? 120_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(finalBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error');
        throw new Error(
          `${profile.displayName} API error ${response.status}: ${errorText}`
        );
      }

      if (!response.body) {
        throw new Error(`${profile.displayName}: No response body for streaming`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const { content, usage } = await parseSSEStream(reader, decoder, callbacks, controller);

      return {
        id: `chatcmpl-${Date.now()}`,
        model: request.model,
        content,
        stopReason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
        usage,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function listModels(): Promise<ModelInfo[]> {
    if (cfg.fetchModelsImpl) {
      return cfg.fetchModelsImpl();
    }

    try {
      const apiKey = getApiKey();
      const baseUrl = getBaseUrl();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        ...profile.defaultHeaders,
      };
      const response = await fetch(`https://${baseUrl}/v1/models`, { headers });
      if (!response.ok) return profile.models;

      const data = (await response.json()) as Record<string, unknown>;
      const models = (data.data || data.models || []) as Array<Record<string, unknown>>;

      if (!Array.isArray(models) || models.length === 0) {
        return profile.models;
      }

      return models.map((m) => ({
        id: (m.id as string) || (m.name as string) || 'unknown',
        name: (m.id as string) || (m.name as string) || 'unknown',
        provider: profile.name,
        contextWindow: (m.context_length as number) || profile.maxContextTokens,
        maxOutput: profile.maxOutputTokens,
        supportsVision: profile.supportsVision,
        supportsToolUse: profile.supportsToolUse,
        supportsStreaming: true,
      }));
    } catch {
      return profile.models;
    }
  }

  async function validateConnection(): Promise<boolean> {
    try {
      const apiKey = getApiKey();
      const baseUrl = getBaseUrl();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        ...profile.defaultHeaders,
      };
      const response = await fetch(`https://${baseUrl}/v1/models`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  function countTokens(text: string): number {
    return estimateTokens(text);
  }

  return { profile, chat, chatStream, listModels, validateConnection, countTokens };
}
