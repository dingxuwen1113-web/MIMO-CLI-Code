// ── Moonshot / Kimi Provider Adapter ──────────────────────────────

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'moonshot-v1-128k',
    name: 'Moonshot V1 128K',
    provider: 'moonshot',
    contextWindow: 128000,
    maxOutput: 8192,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'moonshot-v1-32k',
    name: 'Moonshot V1 32K',
    provider: 'moonshot',
    contextWindow: 32768,
    maxOutput: 8192,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'kimi-latest',
    name: 'Kimi Latest',
    provider: 'moonshot',
    contextWindow: 128000,
    maxOutput: 8192,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'moonshot',
  displayName: 'Moonshot (Kimi)',
  description: 'Moonshot AI / Kimi - long-context Chinese language models',
  apiMode: 'chat_completions',
  aliases: ['kimi', 'moonshot-ai'],
  authType: 'api_key',
  envVars: ['MOONSHOT_API_KEY'],
  baseUrl: 'api.moonshot.cn',
  models: MODELS,
  fallbackModels: ['moonshot-v1-128k', 'moonshot-v1-32k'],
  defaultModel: 'moonshot-v1-128k',
  defaultHeaders: {},
  maxContextTokens: 128000,
  maxOutputTokens: 8192,
  supportsStreaming: true,
  supportsVision: false,
  supportsToolUse: false,
  supportsThinking: false,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
  signupUrl: 'https://platform.moonshot.cn',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({ profile, config });
}
