// ── Groq Provider Adapter ────────────────────────────────────────
// Ultra-fast inference via Groq LPU hardware

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'llama-3.3-70b-versatile',
    name: 'LLaMA 3.3 70B Versatile',
    provider: 'groq',
    contextWindow: 128000,
    maxOutput: 32768,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B Instruct',
    provider: 'groq',
    contextWindow: 32768,
    maxOutput: 32768,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'gemma2-9b-it',
    name: 'Gemma 2 9B Instruct',
    provider: 'groq',
    contextWindow: 8192,
    maxOutput: 8192,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'groq',
  displayName: 'Groq',
  description: 'Ultra-fast LLM inference powered by Groq LPU hardware',
  apiMode: 'chat_completions',
  aliases: ['groq-cloud', 'groq-inference'],
  authType: 'api_key',
  envVars: ['GROQ_API_KEY'],
  baseUrl: 'api.groq.com/openai',
  models: MODELS,
  fallbackModels: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
  defaultModel: 'llama-3.3-70b-versatile',
  defaultHeaders: {},
  maxContextTokens: 128000,
  maxOutputTokens: 32768,
  supportsStreaming: true,
  supportsVision: false,
  supportsToolUse: true,
  supportsThinking: false,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
  signupUrl: 'https://console.groq.com',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({ profile, config });
}
