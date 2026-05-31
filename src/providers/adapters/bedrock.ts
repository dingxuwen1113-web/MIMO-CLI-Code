// ── AWS Bedrock Adapter ──────────────────────────────────────────

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
import { createHash, createHmac } from 'crypto';

// ── Bedrock model definitions ───────────────────────────────────

const BEDROCK_MODELS: ModelInfo[] = [
  // Anthropic Claude models on Bedrock
  {
    id: 'anthropic.claude-sonnet-4-20250514-v1:0',
    name: 'Claude Sonnet 4 (Bedrock)',
    provider: 'bedrock',
    contextWindow: 200000,
    maxOutput: 64000,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 3.0, output: 15.0 },
  },
  {
    id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    name: 'Claude 3.5 Sonnet v2 (Bedrock)',
    provider: 'bedrock',
    contextWindow: 200000,
    maxOutput: 8192,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 3.0, output: 15.0 },
  },
  {
    id: 'anthropic.claude-3-5-haiku-20241022-v1:0',
    name: 'Claude 3.5 Haiku (Bedrock)',
    provider: 'bedrock',
    contextWindow: 200000,
    maxOutput: 8192,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 0.8, output: 4.0 },
  },
  {
    id: 'anthropic.claude-3-opus-20240229-v1:0',
    name: 'Claude 3 Opus (Bedrock)',
    provider: 'bedrock',
    contextWindow: 200000,
    maxOutput: 4096,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 15.0, output: 75.0 },
  },
  // Meta Llama models on Bedrock
  {
    id: 'meta.llama3-3-70b-instruct-v1:0',
    name: 'Llama 3.3 70B Instruct (Bedrock)',
    provider: 'bedrock',
    contextWindow: 131072,
    maxOutput: 8192,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
    pricing: { input: 0.72, output: 0.72 },
  },
  {
    id: 'meta.llama3-2-90b-instruct-v1:0',
    name: 'Llama 3.2 90B Instruct (Bedrock)',
    provider: 'bedrock',
    contextWindow: 131072,
    maxOutput: 8192,
    supportsVision: true,
    supportsToolUse: false,
    supportsStreaming: true,
    pricing: { input: 0.72, output: 0.72 },
  },
  {
    id: 'meta.llama3-2-11b-instruct-v1:0',
    name: 'Llama 3.2 11B Instruct (Bedrock)',
    provider: 'bedrock',
    contextWindow: 131072,
    maxOutput: 8192,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
    pricing: { input: 0.16, output: 0.16 },
  },
  {
    id: 'meta.llama3-1-70b-instruct-v1:0',
    name: 'Llama 3.1 70B Instruct (Bedrock)',
    provider: 'bedrock',
    contextWindow: 131072,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
    pricing: { input: 0.72, output: 0.72 },
  },
];

// ── Profile ─────────────────────────────────────────────────────

export const profile: ProviderProfile = {
  name: 'bedrock',
  displayName: 'AWS Bedrock',
  description: 'Amazon Bedrock managed AI service. Access Claude, Llama, and other models via AWS infrastructure.',
  apiMode: 'chat_completions',
  aliases: ['aws-bedrock', 'amazon-bedrock'],
  authType: 'aws_sdk',
  envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
  baseUrl: '',
  models: BEDROCK_MODELS,
  fallbackModels: [
    'anthropic.claude-sonnet-4-20250514-v1:0',
    'anthropic.claude-3-5-sonnet-20241022-v2:0',
    'meta.llama3-3-70b-instruct-v1:0',
  ],
  defaultModel: 'anthropic.claude-sonnet-4-20250514-v1:0',
  defaultAuxModel: 'anthropic.claude-3-5-haiku-20241022-v1:0',
  defaultHeaders: { 'Content-Type': 'application/json' },
  maxContextTokens: 200000,
  maxOutputTokens: 64000,
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

// ── AWS Signature V4 signing ────────────────────────────────────

interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  sessionToken?: string;
}

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function getSignatureKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  return kSigning;
}

function signRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string,
  credentials: AwsCredentials,
  service: string = 'bedrock'
): Record<string, string> {
  const parsedUrl = new URL(url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  const signedHeaders = 'content-type;host;x-amz-date;x-amz-target';
  let canonicalHeaders = '';
  canonicalHeaders += `content-type:${headers['content-type'] || 'application/json'}\n`;
  canonicalHeaders += `host:${parsedUrl.host}\n`;
  canonicalHeaders += `x-amz-date:${amzDate}\n`;
  canonicalHeaders += `x-amz-target:${headers['x-amz-target'] || ''}\n`;

  const canonicalQueryString = parsedUrl.search ? parsedUrl.search.substring(1) : '';

  const canonicalRequest = [
    method,
    parsedUrl.pathname,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    sha256(body),
  ].join('\n');

  const credentialScope = `${dateStamp}/${credentials.region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');

  const signingKey = getSignatureKey(credentials.secretAccessKey, dateStamp, credentials.region, service);
  const signature = hmacSha256(signingKey, stringToSign).toString('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const signedHeadersObj: Record<string, string> = {
    'content-type': headers['content-type'] || 'application/json',
    'host': parsedUrl.host,
    'x-amz-date': amzDate,
    'x-amz-target': headers['x-amz-target'],
    'authorization': authorization,
  };

  if (credentials.sessionToken) {
    signedHeadersObj['x-amz-security-token'] = credentials.sessionToken;
  }

  return signedHeadersObj;
}

// ── Detect model family (Claude vs Llama) ───────────────────────

type ModelFamily = 'anthropic' | 'meta' | 'unknown';

function detectFamily(modelId: string): ModelFamily {
  if (modelId.startsWith('anthropic.') || modelId.startsWith('us.anthropic.')) return 'anthropic';
  if (modelId.startsWith('meta.') || modelId.startsWith('us.meta.')) return 'meta';
  return 'unknown';
}

// ── Token estimation ────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Build Bedrock API URL ───────────────────────────────────────

function buildBedrockUrl(region: string, modelId: string, streaming: boolean): string {
  const action = streaming ? 'invoke-with-response-stream' : 'invoke';
  return `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/${action}`;
}

// ── Convert messages for Anthropic Claude on Bedrock ────────────

function convertClaudeMessages(messages: MessageParam[]): { system?: string; messages: Array<Record<string, unknown>> } {
  let system: string | undefined;
  const converted: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = typeof msg.content === 'string' ? msg.content : msg.content.filter((b) => b.type === 'text').map((b) => (b as { type: string; text: string }).text).join('\n');
      continue;
    }

    if (typeof msg.content === 'string') {
      converted.push({ role: msg.role, content: msg.content });
      continue;
    }

    const contentArray: Array<Record<string, unknown>> = [];
    for (const block of msg.content) {
      if (block.type === 'text') {
        contentArray.push({ type: 'text', text: block.text });
      } else if (block.type === 'image') {
        contentArray.push({
          type: 'image',
          source: { type: 'base64', media_type: block.source.media_type, data: block.source.data },
        });
      } else if (block.type === 'tool_use') {
        contentArray.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input,
        });
      } else if (block.type === 'tool_result') {
        contentArray.push({
          type: 'tool_result',
          tool_use_id: block.tool_use_id,
          content: block.content,
        });
      }
    }
    converted.push({ role: msg.role, content: contentArray });
  }

  return { system, messages: converted };
}

// ── Convert messages for Llama on Bedrock ───────────────────────

function convertLlamaMessages(messages: MessageParam[]): string {
  let prompt = '';

  for (const msg of messages) {
    const text = typeof msg.content === 'string'
      ? msg.content
      : msg.content.filter((b) => b.type === 'text').map((b) => (b as { type: string; text: string }).text).join('\n');

    if (msg.role === 'system') {
      prompt += `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${text}<|eot_id|>`;
    } else if (msg.role === 'user') {
      prompt += `<|start_header_id|>user<|end_header_id|>\n\n${text}<|eot_id|>`;
    } else if (msg.role === 'assistant') {
      prompt += `<|start_header_id|>assistant<|end_header_id|>\n\n${text}<|eot_id|>`;
    }
  }

  prompt += `<|start_header_id|>assistant<|end_header_id|>\n\n`;
  return prompt;
}

// ── Convert tools to Anthropic format ───────────────────────────

function convertClaudeTools(tools?: ToolDefinition[]): Array<Record<string, unknown>> | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}

// ── Adapter factory ─────────────────────────────────────────────

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  const region = config.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  const accessKeyId = config.apiKey || process.env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
  const sessionToken = process.env.AWS_SESSION_TOKEN || process.env.AWS_BEARER_TOKEN_BEDROCK || '';
  const timeout = config.timeout ?? 120000;

  const credentials: AwsCredentials = {
    accessKeyId,
    secretAccessKey,
    region,
    sessionToken: sessionToken || undefined,
  };

  return {
    profile,

    async chat(request: RequestOptions): Promise<ChatResponse> {
      const modelId = request.model || profile.defaultModel;
      const family = detectFamily(modelId);
      const url = buildBedrockUrl(region, modelId, false);

      let body: string;
      let target: string;

      if (family === 'anthropic') {
        target = 'bedrock-runtime.InvokeModel';
        const { system, messages } = convertClaudeMessages(request.messages);
        const anthropicBody: Record<string, unknown> = {
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: request.maxTokens ?? 4096,
          messages,
        };
        if (system) anthropicBody.system = system;
        if (request.temperature !== undefined) anthropicBody.temperature = request.temperature;
        const tools = convertClaudeTools(request.tools);
        if (tools) anthropicBody.tools = tools;
        body = JSON.stringify(anthropicBody);
      } else {
        // Meta Llama and other text-completion style models
        target = 'bedrock-runtime.InvokeModel';
        const prompt = convertLlamaMessages(request.messages);
        body = JSON.stringify({
          prompt,
          max_gen_len: request.maxTokens ?? 2048,
          temperature: request.temperature ?? 0.7,
          top_p: 0.9,
        });
      }

      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-amz-target': target,
      };

      const signedHeaders = signRequest('POST', url, headers, body, credentials);

      const response = await fetch(url, {
        method: 'POST',
        headers: signedHeaders,
        body,
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        let parsed: { message?: string } | null = null;
        try { parsed = JSON.parse(errorText); } catch { /* not json */ }
        throw new Error(`AWS Bedrock error ${response.status}: ${parsed?.message || errorText}`);
      }

      const data = await response.json() as Record<string, unknown>;

      return parseBedrockResponse(data, modelId, family, request.messages);
    },

    async chatStream(request: RequestOptions, callbacks: StreamCallbacks): Promise<ChatResponse> {
      const modelId = request.model || profile.defaultModel;
      const family = detectFamily(modelId);
      const url = buildBedrockUrl(region, modelId, true);

      let body: string;
      let target: string;

      if (family === 'anthropic') {
        target = 'bedrock-runtime.InvokeModelWithResponseStream';
        const { system, messages } = convertClaudeMessages(request.messages);
        const anthropicBody: Record<string, unknown> = {
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: request.maxTokens ?? 4096,
          messages,
        };
        if (system) anthropicBody.system = system;
        if (request.temperature !== undefined) anthropicBody.temperature = request.temperature;
        const tools = convertClaudeTools(request.tools);
        if (tools) anthropicBody.tools = tools;
        body = JSON.stringify(anthropicBody);
      } else {
        target = 'bedrock-runtime.InvokeModelWithResponseStream';
        const prompt = convertLlamaMessages(request.messages);
        body = JSON.stringify({
          prompt,
          max_gen_len: request.maxTokens ?? 2048,
          temperature: request.temperature ?? 0.7,
          top_p: 0.9,
        });
      }

      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-amz-target': target,
      };

      const signedHeaders = signRequest('POST', url, headers, body, credentials);

      const response = await fetch(url, {
        method: 'POST',
        headers: signedHeaders,
        body,
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`AWS Bedrock stream error ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        throw new Error('AWS Bedrock stream returned no body');
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

          // Bedrock uses a binary framing protocol:
          // 4 bytes total length, 4 bytes headers length, 1 byte prelude CRC,
          // headers, payload, 1 byte message CRC
          // But with fetch() we receive decoded text chunks that may contain
          // multiple concatenated JSON fragments. We attempt to parse them.
          const fragments = splitBedrockChunks(buffer);
          buffer = fragments.remaining;

          for (const fragment of fragments.parsed) {
            try {
              if (family === 'anthropic') {
                // Anthropic streaming events on Bedrock
                const event = JSON.parse(fragment) as {
                  type?: string;
                  delta?: { type?: string; text?: string; thinking?: string };
                  message?: {
                    usage?: { input_tokens?: number; output_tokens?: number };
                  };
                  usage?: { input_tokens?: number; output_tokens?: number };
                };

                if (event.type === 'content_block_delta' && event.delta) {
                  if (event.delta.type === 'text_delta' && event.delta.text) {
                    fullText += event.delta.text;
                    callbacks.onText?.(event.delta.text);
                  } else if (event.delta.type === 'thinking_delta' && event.delta.thinking) {
                    callbacks.onThinking?.(event.delta.thinking);
                  }
                }

                if (event.type === 'message_delta' && event.usage) {
                  outputTokens = event.usage.output_tokens || 0;
                }

                if (event.type === 'message_start' && event.message?.usage) {
                  inputTokens = event.message.usage.input_tokens || 0;
                }
              } else {
                // Llama streaming: each chunk is { generation: string, stop: boolean, ... }
                const event = JSON.parse(fragment) as {
                  generation?: string;
                  stop?: boolean;
                  prompt_token_count?: number;
                  generation_token_count?: number;
                };

                if (event.generation) {
                  fullText += event.generation;
                  callbacks.onText?.(event.generation);
                }

                if (event.prompt_token_count) inputTokens = event.prompt_token_count;
                if (event.generation_token_count) outputTokens = event.generation_token_count;
              }
            } catch {
              // Skip unparseable fragments
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
        id: `bedrock-${Date.now()}`,
        model: modelId,
        content,
        stopReason: 'stop',
        usage: {
          inputTokens: inputTokens || estimateTokens(JSON.stringify(request.messages)),
          outputTokens: outputTokens || estimateTokens(fullText),
        },
      };
    },

    async listModels(): Promise<ModelInfo[]> {
      return BEDROCK_MODELS;
    },

    async validateConnection(): Promise<boolean> {
      if (!accessKeyId || !secretAccessKey) return false;
      try {
        // Attempt a lightweight invocation to verify credentials
        const modelId = profile.defaultModel;
        const url = buildBedrockUrl(region, modelId, false);
        const body = JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        });

        const headers: Record<string, string> = {
          'content-type': 'application/json',
          'x-amz-target': 'bedrock-runtime.InvokeModel',
        };

        const signedHeaders = signRequest('POST', url, headers, body, credentials);

        const response = await fetch(url, {
          method: 'POST',
          headers: signedHeaders,
          body,
          signal: AbortSignal.timeout(15000),
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

// ── Parse Bedrock synchronous response ──────────────────────────

function parseBedrockResponse(
  data: Record<string, unknown>,
  modelId: string,
  family: ModelFamily,
  _messages: MessageParam[]
): ChatResponse {
  const content: ContentBlock[] = [];

  if (family === 'anthropic') {
    const anthropicData = data as {
      id?: string;
      content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
      stop_reason?: string;
      usage?: { input_tokens: number; output_tokens: number };
    };

    if (anthropicData.content) {
      for (const block of anthropicData.content) {
        if (block.type === 'text' && block.text) {
          content.push({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use' && block.id && block.name) {
          content.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input || {},
          });
        }
      }
    }

    return {
      id: anthropicData.id || `bedrock-${Date.now()}`,
      model: modelId,
      content,
      stopReason: anthropicData.stop_reason || 'stop',
      usage: {
        inputTokens: anthropicData.usage?.input_tokens || 0,
        outputTokens: anthropicData.usage?.output_tokens || 0,
      },
    };
  } else {
    // Llama / other models
    const llamaData = data as {
      generation?: string;
      stop_reason?: string;
      prompt_token_count?: number;
      generation_token_count?: number;
    };

    if (llamaData.generation) {
      content.push({ type: 'text', text: llamaData.generation });
    }

    return {
      id: `bedrock-${Date.now()}`,
      model: modelId,
      content,
      stopReason: llamaData.stop_reason === 'stop' ? 'stop' : llamaData.stop_reason || 'stop',
      usage: {
        inputTokens: llamaData.prompt_token_count || 0,
        outputTokens: llamaData.generation_token_count || 0,
      },
    };
  }
}

// ── Split concatenated Bedrock binary-framed chunks ─────────────

function splitBedrockChunks(buffer: string): { parsed: string[]; remaining: string } {
  // Bedrock event stream uses a length-prefixed binary frame format.
  // When received through fetch() in a browser or Node context,
  // the data arrives as decoded text. We try to find JSON boundaries.
  const parsed: string[] = [];
  let remaining = buffer;

  // Try to find complete JSON objects by brace matching
  let depth = 0;
  let start = -1;

  for (let i = 0; i < remaining.length; i++) {
    const ch = remaining[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        parsed.push(remaining.substring(start, i + 1));
        start = -1;
      }
    }
  }

  // Keep any incomplete trailing data
  if (depth > 0 && start >= 0) {
    remaining = remaining.substring(start);
  } else {
    remaining = '';
  }

  return { parsed, remaining };
}
