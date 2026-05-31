// ── Hugging Face Inference Provider Adapter ───────────────────────
// Uses the OpenAI-compatible serverless inference API

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
    name: 'LLaMA 3.1 70B Instruct',
    provider: 'huggingface',
    contextWindow: 128000,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'mistralai/Mistral-7B-Instruct-v0.3',
    name: 'Mistral 7B Instruct v0.3',
    provider: 'huggingface',
    contextWindow: 32768,
    maxOutput: 4096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
  {
    id: 'Qwen/Qwen2.5-72B-Instruct',
    name: 'Qwen 2.5 72B Instruct',
    provider: 'huggingface',
    contextWindow: 128000,
    maxOutput: 8192,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'huggingface',
  displayName: 'Hugging Face',
  description: 'Hugging Face serverless inference API with thousands of open models',
  apiMode: 'chat_completions',
  aliases: ['hf', 'hugging-face'],
  authType: 'api_key',
  envVars: ['HF_TOKEN', 'HUGGING_FACE_HUB_TOKEN'],
  baseUrl: 'api-inference.huggingface.co',
  models: MODELS,
  fallbackModels: ['meta-llama/Meta-Llama-3.1-70B-Instruct'],
  defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
  defaultHeaders: {},
  maxContextTokens: 128000,
  maxOutputTokens: 8192,
  supportsStreaming: true,
  supportsVision: false,
  supportsToolUse: false,
  supportsThinking: false,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
  signupUrl: 'https://huggingface.co/settings/tokens',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({
    profile,
    config,
    transformHeaders(headers) {
      // HF uses "Bearer" like standard, but HF_TOKEN may have "hf_" prefix
      return headers;
    },
  });
}
