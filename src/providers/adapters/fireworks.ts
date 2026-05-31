// ── Fireworks AI Provider Adapter ─────────────────────────────────
// High-performance inference for open models

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
    name: 'LLaMA 3.1 70B Instruct',
    provider: 'fireworks',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'accounts/fireworks/models/mixtral-8x7b-instruct',
    name: 'Mixtral 8x7B Instruct',
    provider: 'fireworks',
    contextWindow: 32768,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'accounts/fireworks/models/qwen2p5-72b-instruct',
    name: 'Qwen 2.5 72B Instruct',
    provider: 'fireworks',
    contextWindow: 128000,
    maxOutput: 8192,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'accounts/fireworks/models/deepseek-v3',
    name: 'DeepSeek V3',
    provider: 'fireworks',
    contextWindow: 128000,
    maxOutput: 8192,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'fireworks',
  displayName: 'Fireworks AI',
  description: 'Fireworks AI - fast, cost-effective inference for open models',
  apiMode: 'chat_completions',
  aliases: ['fireworks-ai'],
  authType: 'api_key',
  envVars: ['FIREWORKS_API_KEY'],
  baseUrl: 'api.fireworks.ai',
  models: MODELS,
  fallbackModels: ['accounts/fireworks/models/llama-v3p1-70b-instruct'],
  defaultModel: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
  defaultHeaders: {},
  maxContextTokens: 128000,
  maxOutputTokens: 16384,
  supportsStreaming: true,
  supportsVision: false,
  supportsToolUse: false,
  supportsThinking: false,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
  signupUrl: 'https://fireworks.ai',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({ profile, config });
}
