// ── Google Gemini Provider Adapter ──────────────────────────────

import {
  ProviderProfile,
  ProviderAdapter,
  ProviderConfig,
  ModelInfo,
  ChatResponse,
  StreamCallbacks,
  ContentBlock,
  MessageParam,
  RequestOptions,
  ToolDefinition,
} from '../types';

// ── Model Definitions ───────────────────────────────────────────

const MODELS: ModelInfo[] = [
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    contextWindow: 1_048_576,
    maxOutput: 8_192,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 0.075, output: 0.30 },
  },
  {
    id: 'gemini-2.0-flash-lite',
    name: 'Gemini 2.0 Flash Lite',
    provider: 'google',
    contextWindow: 1_048_576,
    maxOutput: 8_192,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 0.0375, output: 0.15 },
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    contextWindow: 2_097_152,
    maxOutput: 8_192,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 1.25, output: 5.00 },
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    provider: 'google',
    contextWindow: 1_048_576,
    maxOutput: 8_192,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 0.075, output: 0.30 },
  },
];

// ── Profile ─────────────────────────────────────────────────────

export const profile: ProviderProfile = {
  name: 'google',
  displayName: 'Google Gemini',
  description: 'Google Gemini models via the generateContent REST API',
  apiMode: 'google_gemini',
  aliases: ['gemini', 'google-gemini', 'googlegenai'],
  authType: 'api_key',
  envVars: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  models: MODELS,
  fallbackModels: ['gemini-2.0-flash-lite', 'gemini-1.5-flash'],
  defaultModel: 'gemini-2.0-flash',
  defaultAuxModel: 'gemini-2.0-flash-lite',
  defaultHeaders: {},
  maxContextTokens: 2_097_152,
  maxOutputTokens: 8_192,
  supportsStreaming: true,
  supportsVision: true,
  supportsToolUse: true,
  supportsThinking: false,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
  signupUrl: 'https://aistudio.google.com/apikey',
  icon: 'google',
};

// ── Helpers ─────────────────────────────────────────────────────

function resolveApiKey(config: ProviderConfig): string {
  if (config.apiKey) return config.apiKey;
  for (const envVar of profile.envVars) {
    const val = process.env[envVar];
    if (val) return val;
  }
  throw new Error(
    `Google Gemini API key not found. Set GOOGLE_API_KEY or GEMINI_API_KEY environment variable, or pass apiKey in config.`
  );
}

function buildBaseUrl(config: ProviderConfig): string {
  return config.baseUrl || profile.baseUrl;
}

/** Convert MIMO messages to Gemini "contents" format */
function toGeminiContents(messages: MessageParam[]): GeminiContent[] {
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue; // handled separately

    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts: GeminiPart[] = [];

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else {
      for (const block of msg.content) {
        if (block.type === 'text') {
          parts.push({ text: block.text });
        } else if (block.type === 'image') {
          parts.push({
            inlineData: {
              mimeType: block.source.media_type,
              data: block.source.data,
            },
          });
        } else if (block.type === 'tool_use') {
          parts.push({
            functionCall: {
              name: block.name,
              args: block.input as Record<string, unknown>,
            },
          });
        } else if (block.type === 'tool_result') {
          parts.push({
            functionResponse: {
              name: block.tool_use_id,
              response: { content: block.content },
            },
          });
        }
      }
    }

    contents.push({ role, parts });
  }

  return contents;
}

/** Extract system instruction from messages */
function extractSystemInstruction(messages: MessageParam[]): string | undefined {
  const systemMessages = messages.filter((m) => m.role === 'system');
  if (systemMessages.length === 0) return undefined;
  return systemMessages
    .map((m) => (typeof m.content === 'string' ? m.content : m.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n')))
    .join('\n');
}

/** Convert MIMO tools to Gemini function declarations */
function toGeminiTools(tools?: ToolDefinition[]): GeminiTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      })),
    },
  ];
}

/** Parse a Gemini API response into a ChatResponse */
function parseGeminiResponse(data: GeminiGenerateResponse, model: string): ChatResponse {
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const content: ContentBlock[] = [];

  for (const part of parts) {
    if (part.text) {
      content.push({ type: 'text', text: part.text });
    }
    if (part.functionCall) {
      content.push({
        type: 'tool_use',
        id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        name: part.functionCall.name,
        input: (part.functionCall.args ?? {}) as Record<string, unknown>,
      });
    }
  }

  const usageMeta = data.usageMetadata ?? {};
  const stopReason = mapFinishReason(candidate?.finishReason);

  return {
    id: data.responseId ?? `gemini_${Date.now()}`,
    model,
    content,
    stopReason,
    usage: {
      inputTokens: usageMeta.promptTokenCount ?? 0,
      outputTokens: usageMeta.candidatesTokenCount ?? 0,
    },
  };
}

function mapFinishReason(reason?: string): string {
  switch (reason) {
    case 'STOP':
      return 'end_turn';
    case 'MAX_TOKENS':
      return 'max_tokens';
    case 'SAFETY':
      return 'content_filter';
    case 'RECITATION':
      return 'content_filter';
    default:
      return reason || 'end_turn';
  }
}

/** Rough token estimator: ~4 chars per token for English */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Gemini API Types ────────────────────────────────────────────

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiTool {
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

interface GeminiGenerateRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiPart[] };
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    stopSequences?: string[];
  };
  tools?: GeminiTool[];
}

interface GeminiGenerateResponse {
  responseId?: string;
  candidates?: Array<{
    content?: { parts: GeminiPart[]; role?: string };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: { parts: GeminiPart[]; role?: string };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

// ── Adapter Implementation ──────────────────────────────────────

class GoogleGeminiAdapter implements ProviderAdapter {
  readonly profile: ProviderProfile;
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor(config: ProviderConfig) {
    this.profile = profile;
    this.apiKey = resolveApiKey(config);
    this.baseUrl = buildBaseUrl(config);
    this.timeout = config.timeout ?? 120_000;
  }

  async chat(request: RequestOptions): Promise<ChatResponse> {
    const model = request.model || profile.defaultModel;
    const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;

    const body: GeminiGenerateRequest = {
      contents: toGeminiContents(request.messages),
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? profile.maxOutputTokens,
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      },
    };

    const systemInstruction = extractSystemInstruction(request.messages);
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const tools = toGeminiTools(request.tools);
    if (tools) {
      body.tools = tools;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error');
      throw new Error(`Google Gemini API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as GeminiGenerateResponse;
    return parseGeminiResponse(data, model);
  }

  async chatStream(request: RequestOptions, callbacks: StreamCallbacks): Promise<ChatResponse> {
    const model = request.model || profile.defaultModel;
    const url = `${this.baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    const body: GeminiGenerateRequest = {
      contents: toGeminiContents(request.messages),
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? profile.maxOutputTokens,
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      },
    };

    const systemInstruction = extractSystemInstruction(request.messages);
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const tools = toGeminiTools(request.tools);
    if (tools) {
      body.tools = tools;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error');
      const errorMsg = `Google Gemini API error ${response.status}: ${errorText}`;
      callbacks.onError?.(errorMsg);
      throw new Error(errorMsg);
    }

    if (!response.body) {
      throw new Error('No response body received from Gemini streaming endpoint');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const collectedText: string[] = [];
    const toolCalls: Array<{ id: string; name: string; input: string }> = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6);
          if (jsonStr === '[DONE]') continue;

          try {
            const chunk = JSON.parse(jsonStr) as GeminiStreamChunk;
            const candidate = chunk.candidates?.[0];
            const parts = candidate?.content?.parts ?? [];

            for (const part of parts) {
              if (part.text) {
                collectedText.push(part.text);
                callbacks.onText?.(part.text);
              }
              if (part.functionCall) {
                const toolId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
                const toolInfo = {
                  id: toolId,
                  name: part.functionCall.name,
                  input: JSON.stringify(part.functionCall.args ?? {}),
                };
                toolCalls.push(toolInfo);
                callbacks.onToolUse?.(toolInfo);
              }
            }

            if (chunk.usageMetadata) {
              totalInputTokens = chunk.usageMetadata.promptTokenCount ?? totalInputTokens;
              totalOutputTokens = chunk.usageMetadata.candidatesTokenCount ?? totalOutputTokens;
            }
          } catch {
            // skip malformed SSE chunks
          }
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Stream read error';
      callbacks.onError?.(errorMsg);
      throw err;
    } finally {
      reader.releaseLock();
    }

    callbacks.onDone?.();

    const content: ContentBlock[] = [];
    if (collectedText.length > 0) {
      content.push({ type: 'text', text: collectedText.join('') });
    }
    for (const tc of toolCalls) {
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.name,
        input: JSON.parse(tc.input),
      });
    }

    return {
      id: `gemini_${Date.now()}`,
      model,
      content,
      stopReason: 'end_turn',
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      },
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    const url = `${this.baseUrl}/models?key=${this.apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) return profile.models;

      const data = (await response.json()) as { models?: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }> };
      if (!data.models) return profile.models;

      return data.models
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => {
          const modelId = m.name.replace('models/', '');
          const known = profile.models.find((k) => k.id === modelId);
          return known ?? {
            id: modelId,
            name: m.displayName || modelId,
            provider: 'google',
            contextWindow: 1_048_576,
            maxOutput: 8_192,
            supportsVision: true,
            supportsToolUse: true,
            supportsStreaming: true,
          };
        });
    } catch {
      return profile.models;
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/models?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(10_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  countTokens(text: string): number {
    return estimateTokens(text);
  }
}

// ── Factory Export ───────────────────────────────────────────────

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return new GoogleGeminiAdapter(config);
}
