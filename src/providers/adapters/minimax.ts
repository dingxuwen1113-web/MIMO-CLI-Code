// ── MiniMax Provider Adapter ──────────────────────────────────────

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'abab6.5-chat',
    name: 'Abab 6.5 Chat',
    provider: 'minimax',
    contextWindow: 32768,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'abab6.5s-chat',
    name: 'Abab 6.5s Chat',
    provider: 'minimax',
    contextWindow: 32768,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'minimax',
  displayName: 'MiniMax',
  description: 'MiniMax Abab series models',
  apiMode: 'chat_completions',
  aliases: ['minimax-ai'],
  authType: 'api_key',
  envVars: ['MINIMAX_API_KEY'],
  baseUrl: 'api.minimax.chat',
  models: MODELS,
  fallbackModels: ['abab6.5-chat', 'abab6.5s-chat'],
  defaultModel: 'abab6.5-chat',
  defaultHeaders: {},
  maxContextTokens: 32768,
  maxOutputTokens: 4096,
  supportsStreaming: true,
  supportsVision: false,
  supportsToolUse: false,
  supportsThinking: false,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
  signupUrl: 'https://platform.minimaxi.com',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({ profile, config });
}
