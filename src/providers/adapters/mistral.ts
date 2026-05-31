// ── Mistral AI Provider Adapter ───────────────────────────────────

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large',
    provider: 'mistral',
    contextWindow: 128000,
    maxOutput: 32768,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'mistral-small-latest',
    name: 'Mistral Small',
    provider: 'mistral',
    contextWindow: 128000,
    maxOutput: 32768,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'codestral-latest',
    name: 'Codestral',
    provider: 'mistral',
    contextWindow: 32768,
    maxOutput: 32768,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'pixtral-large-latest',
    name: 'Pixtral Large',
    provider: 'mistral',
    contextWindow: 128000,
    maxOutput: 32768,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'mistral',
  displayName: 'Mistral AI',
  description: 'Mistral AI models including Large, Small, Codestral, and Pixtral',
  apiMode: 'chat_completions',
  aliases: ['mistral-ai'],
  authType: 'api_key',
  envVars: ['MISTRAL_API_KEY'],
  baseUrl: 'api.mistral.ai',
  models: MODELS,
  fallbackModels: ['mistral-large-latest', 'mistral-small-latest'],
  defaultModel: 'mistral-large-latest',
  defaultHeaders: {},
  maxContextTokens: 128000,
  maxOutputTokens: 32768,
  supportsStreaming: true,
  supportsVision: true,
  supportsToolUse: true,
  supportsThinking: false,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
  signupUrl: 'https://console.mistral.ai',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({ profile, config });
}
