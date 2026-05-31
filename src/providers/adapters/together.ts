// ── Together AI Provider Adapter ──────────────────────────────────
// Wide selection of open-weight models hosted on Together infrastructure

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    name: 'LLaMA 3.1 70B Instruct Turbo',
    provider: 'together',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
    name: 'Mixtral 8x7B Instruct',
    provider: 'together',
    contextWindow: 32768,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
    name: 'Qwen 2.5 72B Instruct Turbo',
    provider: 'together',
    contextWindow: 128000,
    maxOutput: 8192,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'deepseek-ai/DeepSeek-V3',
    name: 'DeepSeek V3',
    provider: 'together',
    contextWindow: 128000,
    maxOutput: 8192,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'together',
  displayName: 'Together AI',
  description: 'Together AI - fast inference for 100+ open models',
  apiMode: 'chat_completions',
  aliases: ['together-ai'],
  authType: 'api_key',
  envVars: ['TOGETHER_API_KEY'],
  baseUrl: 'api.together.xyz',
  models: MODELS,
  fallbackModels: ['meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo'],
  defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
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
  signupUrl: 'https://api.together.xyz',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({ profile, config });
}
