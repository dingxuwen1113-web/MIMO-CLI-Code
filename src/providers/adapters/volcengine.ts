// ── Volcengine / Doubao Provider Adapter ─────────────────────────
// OpenAI-compatible adapter for ByteDance Volcengine Doubao models.

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'doubao-pro-128k',
    name: 'Doubao Pro 128K',
    provider: 'volcengine',
    contextWindow: 128_000,
    maxOutput: 4_096,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'doubao-pro-32k',
    name: 'Doubao Pro 32K',
    provider: 'volcengine',
    contextWindow: 32_000,
    maxOutput: 4_096,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'doubao-lite-128k',
    name: 'Doubao Lite 128K',
    provider: 'volcengine',
    contextWindow: 128_000,
    maxOutput: 4_096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'volcengine',
  displayName: 'Volcengine',
  description: 'ByteDance Volcengine Doubao models — high-performance Chinese LLM',
  apiMode: 'chat_completions',
  aliases: ['doubao', 'bytedance', 'volc'],
  authType: 'api_key',
  envVars: ['VOLCENGINE_API_KEY'],
  baseUrl: 'ark.cn-beijing.volces.com/api/v3',
  models: MODELS,
  fallbackModels: ['doubao-pro-128k', 'doubao-pro-32k'],
  defaultModel: 'doubao-pro-128k',
  defaultAuxModel: 'doubao-pro-32k',
  defaultHeaders: {},
  maxContextTokens: 128_000,
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
  signupUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({ profile, config });
}
