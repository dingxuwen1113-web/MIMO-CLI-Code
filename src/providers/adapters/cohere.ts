// ── Cohere Provider Adapter ───────────────────────────────────────
// Note: Cohere has its own native API, but also exposes an OpenAI-compatible endpoint.

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'command-r-plus',
    name: 'Command R+',
    provider: 'cohere',
    contextWindow: 128000,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'command-r',
    name: 'Command R',
    provider: 'cohere',
    contextWindow: 128000,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'command',
    name: 'Command',
    provider: 'cohere',
    contextWindow: 4096,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'cohere',
  displayName: 'Cohere',
  description: 'Cohere Command models for enterprise AI',
  apiMode: 'chat_completions',
  aliases: ['cohere-ai'],
  authType: 'api_key',
  envVars: ['COHERE_API_KEY'],
  baseUrl: 'api.cohere.com',
  models: MODELS,
  fallbackModels: ['command-r-plus', 'command-r'],
  defaultModel: 'command-r-plus',
  defaultHeaders: {},
  maxContextTokens: 128000,
  maxOutputTokens: 4096,
  supportsStreaming: true,
  supportsVision: false,
  supportsToolUse: true,
  supportsThinking: false,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
  signupUrl: 'https://dashboard.cohere.com',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({
    profile,
    config,
    transformHeaders(headers) {
      // Cohere OpenAI-compatible endpoint uses Bearer auth like normal
      return headers;
    },
  });
}
