// ── Yi / 01.AI Provider Adapter ──────────────────────────────────
// OpenAI-compatible adapter for 01.AI Yi models.

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'yi-large',
    name: 'Yi Large',
    provider: 'yi',
    contextWindow: 32_000,
    maxOutput: 4_096,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'yi-medium',
    name: 'Yi Medium',
    provider: 'yi',
    contextWindow: 16_000,
    maxOutput: 4_096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'yi-spark',
    name: 'Yi Spark',
    provider: 'yi',
    contextWindow: 16_000,
    maxOutput: 4_096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'yi-large-turbo',
    name: 'Yi Large Turbo',
    provider: 'yi',
    contextWindow: 32_000,
    maxOutput: 4_096,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'yi',
  displayName: 'Yi',
  description: '01.AI Yi models — high-performance bilingual Chinese/English LLMs',
  apiMode: 'chat_completions',
  aliases: ['01-ai', 'lingyiwanwu', 'wanwu'],
  authType: 'api_key',
  envVars: ['YI_API_KEY'],
  baseUrl: 'api.lingyiwanwu.com/v1',
  models: MODELS,
  fallbackModels: ['yi-large', 'yi-large-turbo'],
  defaultModel: 'yi-large',
  defaultAuxModel: 'yi-large-turbo',
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
  signupUrl: 'https://platform.lingyiwanwu.com/apikeys',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({ profile, config });
}
