// ── Baichuan AI Provider Adapter ─────────────────────────────────
// OpenAI-compatible adapter for Baichuan AI models.

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'Baichuan4',
    name: 'Baichuan 4',
    provider: 'baichuan',
    contextWindow: 32_000,
    maxOutput: 4_096,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'Baichuan3-Turbo',
    name: 'Baichuan 3 Turbo',
    provider: 'baichuan',
    contextWindow: 32_000,
    maxOutput: 4_096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'Baichuan2-Turbo',
    name: 'Baichuan 2 Turbo',
    provider: 'baichuan',
    contextWindow: 32_000,
    maxOutput: 4_096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'baichuan',
  displayName: 'Baichuan AI',
  description: 'Baichuan AI models optimized for Chinese language understanding and generation',
  apiMode: 'chat_completions',
  aliases: ['bc', 'baichuan-ai'],
  authType: 'api_key',
  envVars: ['BAICHUAN_API_KEY'],
  baseUrl: 'api.baichuan-ai.com/v1',
  models: MODELS,
  fallbackModels: ['Baichuan4', 'Baichuan3-Turbo'],
  defaultModel: 'Baichuan4',
  defaultAuxModel: 'Baichuan3-Turbo',
  defaultHeaders: {},
  maxContextTokens: 32_000,
  maxOutputTokens: 4_096,
  supportsStreaming: true,
  supportsVision: false,
  supportsToolUse: true,
  supportsThinking: false,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
  signupUrl: 'https://platform.baichuan-ai.com/console/apikey',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({ profile, config });
}
