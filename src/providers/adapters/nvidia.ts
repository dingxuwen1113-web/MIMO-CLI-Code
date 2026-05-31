// ── NVIDIA NIM Provider Adapter ───────────────────────────────────
// NVIDIA Inference Microservices (NIM) - OpenAI-compatible endpoints

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'meta/llama-3.1-405b-instruct',
    name: 'LLaMA 3.1 405B Instruct',
    provider: 'nvidia',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'meta/llama-3.1-70b-instruct',
    name: 'LLaMA 3.1 70B Instruct',
    provider: 'nvidia',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'mistralai/mistral-large-2-instruct',
    name: 'Mistral Large 2 Instruct',
    provider: 'nvidia',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'nvidia/nemotron-4-340b-instruct',
    name: 'Nemotron 4 340B Instruct',
    provider: 'nvidia',
    contextWindow: 4096,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'nvidia',
  displayName: 'NVIDIA NIM',
  description: 'NVIDIA NIM inference microservices for high-performance model serving',
  apiMode: 'chat_completions',
  aliases: ['nim', 'nvidia-nim'],
  authType: 'api_key',
  envVars: ['NVIDIA_API_KEY', 'NIM_API_KEY'],
  baseUrl: 'integrate.api.nvidia.com',
  models: MODELS,
  fallbackModels: ['meta/llama-3.1-70b-instruct'],
  defaultModel: 'meta/llama-3.1-70b-instruct',
  defaultHeaders: {},
  maxContextTokens: 128000,
  maxOutputTokens: 16384,
  supportsStreaming: true,
  supportsVision: false,
  supportsToolUse: false,
  supportsThinking: false,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
  signupUrl: 'https://build.nvidia.com',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({ profile, config });
}
