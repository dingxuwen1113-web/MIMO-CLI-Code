// ── Stepfun Provider Adapter ──────────────────────────────────────

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'step-1-8k',
    name: 'Step 1 8K',
    provider: 'stepfun',
    contextWindow: 8192,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'step-1-32k',
    name: 'Step 1 32K',
    provider: 'stepfun',
    contextWindow: 32768,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'step-1-128k',
    name: 'Step 1 128K',
    provider: 'stepfun',
    contextWindow: 128000,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'stepfun',
  displayName: 'Stepfun',
  description: 'Stepfun AI models with multi-tier context windows',
  apiMode: 'chat_completions',
  aliases: ['step-fun'],
  authType: 'api_key',
  envVars: ['STEPFUN_API_KEY'],
  baseUrl: 'api.stepfun.com',
  models: MODELS,
  fallbackModels: ['step-1-128k', 'step-1-32k'],
  defaultModel: 'step-1-128k',
  defaultHeaders: {},
  maxContextTokens: 128000,
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
  signupUrl: 'https://platform.stepfun.com',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({ profile, config });
}
