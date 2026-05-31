import Anthropic from '@anthropic-ai/sdk';

export interface BudgetInfo {
  used: number;
  remaining: number;
  percentUsed: number;
  mode: string;
}

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  thinkingTokens: number;
  totalCost: number;
}

export interface StreamCallbacks {
  onText?: (text: string) => void;
  onToolUse?: (tool: Anthropic.ToolUseBlock) => void;
  onThinking?: (thinking: string) => void;
}

/**
 * Supported provider identifiers.
 * 'anthropic' covers both 'token-plan' and 'pay-as-you-go' modes.
 */
export type ProviderId = 'anthropic' | 'ollama' | 'openai-compatible';

/**
 * Configuration for the Ollama provider.
 */
export interface OllamaProviderConfig {
  /** Base URL of the local Ollama instance. Default: http://localhost:11434 */
  baseUrl: string;
  /** Default model to use when none is specified. */
  model: string;
}

/**
 * Configuration for any OpenAI-compatible provider (vLLM, LM Studio, Together.ai, etc.).
 */
export interface OpenAICompatibleProviderConfig {
  /** Base URL of the OpenAI-compatible API. */
  baseUrl: string;
  /** API key (may be omitted for local servers that don't require auth). */
  apiKey: string;
  /** Default model to use when none is specified. */
  model: string;
}

/**
 * Full provider configuration, embedded inside the API config.
 */
export interface ProviderConfig {
  /** Which provider backend to use. Defaults to 'anthropic'. */
  provider: ProviderId;
  /** Ollama-specific settings (only used when provider === 'ollama'). */
  ollama: OllamaProviderConfig;
  /** OpenAI-compatible settings (only used when provider === 'openai-compatible'). */
  openaiCompatible: OpenAICompatibleProviderConfig;
}

export interface ApiAdapter {
  chat(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    systemPrompt: string,
    options?: { stream?: boolean; maxTokens?: number; model?: string; thinking?: boolean }
  ): Promise<Anthropic.Message>;

  chatStream(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    systemPrompt: string,
    callbacks: StreamCallbacks,
    options?: { maxTokens?: number; model?: string; thinking?: boolean }
  ): Promise<Anthropic.Message>;

  getBudgetInfo(): BudgetInfo;
  getUsageStats(): UsageStats;
  resolveModel(requestedModel: string): string;

  // Token counting
  countTokens(text: string): number;
  countMessageTokens(messages: Anthropic.MessageParam[]): number;
}
