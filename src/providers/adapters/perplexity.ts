// ── Perplexity AI Provider Adapter ───────────────────────────────
// OpenAI-compatible adapter for Perplexity's search-augmented models.

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'sonar-pro',
    name: 'Sonar Pro',
    provider: 'perplexity',
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'sonar',
    name: 'Sonar',
    provider: 'perplexity',
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'sonar-small',
    name: 'Sonar Small',
    provider: 'perplexity',
    contextWindow: 32_000,
    maxOutput: 4_096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'perplexity',
  displayName: 'Perplexity AI',
  description: 'Search-augmented AI models with real-time internet access',
  apiMode: 'chat_completions',
  aliases: ['pplx', 'perplexity-ai'],
  authType: 'api_key',
  envVars: ['PERPLEXITY_API_KEY'],
  baseUrl: 'api.perplexity.ai',
  models: MODELS,
  fallbackModels: ['sonar-pro', 'sonar'],
  defaultModel: 'sonar-pro',
  defaultAuxModel: 'sonar',
  defaultHeaders: {},
  maxContextTokens: 128_000,
  maxOutputTokens: 8_192,
  supportsStreaming: true,
  supportsVision: false,
  supportsToolUse: false,
  supportsThinking: false,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
  signupUrl: 'https://www.perplexity.ai/settings/api',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({ profile, config });
}
