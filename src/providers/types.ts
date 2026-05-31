// ── Multi-Provider System: Base Types & Interfaces ──────────────

export type ApiMode = 'chat_completions' | 'responses' | 'anthropic_messages' | 'google_gemini';
export type AuthType = 'api_key' | 'oauth_device_code' | 'oauth_external' | 'aws_sdk';

export interface ProviderProfile {
  name: string;
  displayName: string;
  description: string;
  apiMode: ApiMode;
  aliases: string[];
  authType: AuthType;
  envVars: string[];
  baseUrl: string;
  models: ModelInfo[];
  fallbackModels: string[];
  defaultModel: string;
  defaultAuxModel?: string;
  defaultHeaders: Record<string, string>;
  maxContextTokens: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsToolUse: boolean;
  supportsThinking: boolean;
  supportsPromptCaching: boolean;
  supportsImageGeneration: boolean;
  supportsVideoGeneration: boolean;
  supportsTTS: boolean;
  supportsSTT: boolean;
  fixedTemperature?: number;
  omitTemperature?: boolean;
  signupUrl?: string;
  icon?: string;

  // Lifecycle hooks
  prepareMessages?(messages: MessageParam[]): MessageParam[];
  buildExtraBody?(options: RequestOptions): Record<string, unknown>;
  getMaxTokens?(requested?: number): number;
  fetchModels?(): Promise<ModelInfo[]>;
  validateAuth?(): Promise<boolean>;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxOutput: number;
  supportsVision: boolean;
  supportsToolUse: boolean;
  supportsStreaming: boolean;
  pricing?: { input: number; output: number };
  deprecated?: boolean;
}

export interface MessageParam {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface RequestOptions {
  model: string;
  messages: MessageParam[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
  thinking?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ChatResponse {
  id: string;
  model: string;
  content: ContentBlock[];
  stopReason: string;
  usage: { inputTokens: number; outputTokens: number; cacheCreation?: number; cacheRead?: number };
}

export interface StreamEvent {
  type: 'text' | 'tool_use' | 'thinking' | 'error' | 'done';
  text?: string;
  tool?: { id: string; name: string; input: string };
  thinking?: string;
  error?: string;
}

export interface ProviderAdapter {
  readonly profile: ProviderProfile;
  chat(request: RequestOptions): Promise<ChatResponse>;
  chatStream(request: RequestOptions, callbacks: StreamCallbacks): Promise<ChatResponse>;
  listModels(): Promise<ModelInfo[]>;
  validateConnection(): Promise<boolean>;
  countTokens(text: string): number;
}

export interface StreamCallbacks {
  onText?: (text: string) => void;
  onToolUse?: (tool: { id: string; name: string; input: string }) => void;
  onThinking?: (thinking: string) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
}

export interface ProviderPlugin {
  name: string;
  version: string;
  description: string;
  createAdapter(config: ProviderConfig): ProviderAdapter;
  getProfile(): ProviderProfile;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  orgId?: string;
  region?: string;
  headers?: Record<string, string>;
  models?: string[];
  defaultModel?: string;
  timeout?: number;
  maxRetries?: number;
}
