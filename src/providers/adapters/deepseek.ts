// ── DeepSeek Provider Adapter ───────────────────────────────────
// OpenAI-compatible adapter with deepseek-reasoner thinking support.

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 0.14, output: 0.28 },
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek Reasoner',
    provider: 'deepseek',
    contextWindow: 128_000,
    maxOutput: 16_384,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
    pricing: { input: 0.55, output: 2.19 },
  },
  {
    id: 'deepseek-coder',
    name: 'DeepSeek Coder',
    provider: 'deepseek',
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 0.14, output: 0.28 },
  },
];

export const profile: ProviderProfile = {
  name: 'deepseek',
  displayName: 'DeepSeek',
  description: 'DeepSeek models via OpenAI-compatible API, with reasoning model support',
  apiMode: 'chat_completions',
  aliases: ['ds', 'deep-seek'],
  authType: 'api_key',
  envVars: ['DEEPSEEK_API_KEY'],
  baseUrl: 'api.deepseek.com',
  models: MODELS,
  fallbackModels: ['deepseek-chat'],
  defaultModel: 'deepseek-chat',
  defaultAuxModel: 'deepseek-chat',
  defaultHeaders: {},
  maxContextTokens: 128_000,
  maxOutputTokens: 8_192,
  supportsStreaming: true,
  supportsVision: false,
  supportsToolUse: true,
  supportsThinking: true,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
  signupUrl: 'https://platform.deepseek.com/api_keys',
  icon: 'deepseek',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({
    profile,
    config,
    // Strip tools for deepseek-reasoner (it doesn't support tool use)
    transformRequest: (body, _headers) => {
      const model = (body.model as string) || profile.defaultModel;
      if (model === 'deepseek-reasoner') {
        delete body.tools;
        delete body.temperature;
      }
      return body;
    },
  });
}
