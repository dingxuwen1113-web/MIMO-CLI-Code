// ── SiliconFlow Provider Adapter ─────────────────────────────────
// OpenAI-compatible adapter for SiliconFlow serverless inference.

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'deepseek-ai/DeepSeek-V3',
    name: 'DeepSeek V3',
    provider: 'siliconflow',
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'Qwen/Qwen2.5-72B-Instruct',
    name: 'Qwen 2.5 72B Instruct',
    provider: 'siliconflow',
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
    name: 'Llama 3.1 70B Instruct',
    provider: 'siliconflow',
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'siliconflow',
  displayName: 'SiliconFlow',
  description: 'SiliconFlow serverless AI inference — access top open-source models',
  apiMode: 'chat_completions',
  aliases: ['sf', 'silicon-flow'],
  authType: 'api_key',
  envVars: ['SILICONFLOW_API_KEY'],
  baseUrl: 'api.siliconflow.cn/v1',
  models: MODELS,
  fallbackModels: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'],
  defaultModel: 'deepseek-ai/DeepSeek-V3',
  defaultAuxModel: 'Qwen/Qwen2.5-72B-Instruct',
  defaultHeaders: {},
  maxContextTokens: 128_000,
  maxOutputTokens: 8_192,
  supportsStreaming: true,
  supportsVision: false,
  supportsToolUse: true,
  supportsThinking: false,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
  signupUrl: 'https://cloud.siliconflow.com/account/ak',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({ profile, config });
}
