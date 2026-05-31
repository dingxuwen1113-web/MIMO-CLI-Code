// ── vLLM Local Provider Adapter ───────────────────────────────────
// OpenAI-compatible adapter for vLLM local inference server.
// Models are dynamically detected from the running vLLM instance.

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'auto',
    name: 'Auto (dynamically detected)',
    provider: 'vllm',
    contextWindow: 32_000,
    maxOutput: 4_096,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'vllm',
  displayName: 'vLLM',
  description: 'Local LLM inference via vLLM high-performance serving engine.',
  apiMode: 'chat_completions',
  aliases: ['v-llm', 'vllm-local'],
  authType: 'api_key',
  envVars: ['VLLM_HOST'],
  baseUrl: 'http://localhost:8000/v1',
  models: MODELS,
  fallbackModels: ['auto'],
  defaultModel: 'auto',
  defaultHeaders: { 'Content-Type': 'application/json' },
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
  omitTemperature: false,
};

async function fetchAvailableModels(baseUrl: string): Promise<ModelInfo[]> {
  try {
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return MODELS;
    }

    const data = (await response.json()) as {
      data?: Array<{
        id: string;
        object?: string;
        owned_by?: string;
        max_model_len?: number;
      }>;
    };

    if (!data.data || data.data.length === 0) {
      return MODELS;
    }

    return data.data.map((m) => ({
      id: m.id,
      name: m.id,
      provider: 'vllm',
      contextWindow: m.max_model_len || 32_000,
      maxOutput: Math.min(m.max_model_len || 4_096, 8_192),
      supportsVision: false,
      supportsToolUse: true,
      supportsStreaming: true,
    }));
  } catch {
    return MODELS;
  }
}

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  const host = process.env.VLLM_HOST || config.baseUrl || 'http://localhost:8000/v1';
  const baseUrl = host.replace(/\/+$/, '');

  return createOpenAICompatibleAdapter({
    profile: {
      ...profile,
      baseUrl,
    },
    config: {
      ...config,
      baseUrl,
    },
    fetchModelsImpl: () => fetchAvailableModels(baseUrl),
  });
}
