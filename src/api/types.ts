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
