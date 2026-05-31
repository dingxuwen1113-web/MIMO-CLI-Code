// ── Zhipu / GLM Provider Adapter ──────────────────────────────────

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'glm-4',
    name: 'GLM-4',
    provider: 'zhipu',
    contextWindow: 128000,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'glm-4-flash',
    name: 'GLM-4 Flash',
    provider: 'zhipu',
    contextWindow: 128000,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'glm-4v',
    name: 'GLM-4V',
    provider: 'zhipu',
    contextWindow: 2048,
    maxOutput: 1024,
    supportsVision: true,
    supportsToolUse: false,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'zhipu',
  displayName: 'Zhipu (GLM)',
  description: 'Zhipu AI GLM models - strong Chinese language capability',
  apiMode: 'chat_completions',
  aliases: ['glm', 'chatglm', 'zhipu-ai'],
  authType: 'api_key',
  envVars: ['ZHIPU_API_KEY', 'GLM_API_KEY'],
  baseUrl: 'open.bigmodel.cn',
  models: MODELS,
  fallbackModels: ['glm-4', 'glm-4-flash'],
  defaultModel: 'glm-4',
  defaultHeaders: {},
  maxContextTokens: 128000,
  maxOutputTokens: 4096,
  supportsStreaming: true,
  supportsVision: true,
  supportsToolUse: true,
  supportsThinking: false,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
  signupUrl: 'https://open.bigmodel.cn',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({ profile, config });
}
