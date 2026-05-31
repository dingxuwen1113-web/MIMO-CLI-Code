// ── Custom Generic Provider Adapter ──────────────────────────────
// User-configurable OpenAI-compatible endpoint for any provider.

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'default',
    name: 'Default (provider-specified)',
    provider: 'custom',
    contextWindow: 128_000,
    maxOutput: 4_096,
    supportsVision: false,
    supportsToolUse: false,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'custom',
  displayName: 'Custom',
  description: 'Generic OpenAI-compatible provider — connect to any compatible API endpoint',
  apiMode: 'chat_completions',
  aliases: ['generic', 'openai-compatible'],
  authType: 'api_key',
  envVars: ['CUSTOM_API_KEY', 'CUSTOM_BASE_URL'],
  baseUrl: 'http://localhost:8080/v1',
  models: MODELS,
  fallbackModels: ['default'],
  defaultModel: 'default',
  defaultHeaders: {},
  maxContextTokens: 128_000,
  maxOutputTokens: 4_096,
  supportsStreaming: true,
  supportsVision: false,
  supportsToolUse: false,
  supportsThinking: false,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
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
        context_length?: number;
        max_model_len?: number;
      }>;
    };

    if (!data.data || data.data.length === 0) {
      return MODELS;
    }

    return data.data.map((m) => ({
      id: m.id,
      name: m.id,
      provider: 'custom',
      contextWindow: m.context_length || m.max_model_len || 128_000,
      maxOutput: 4_096,
      supportsVision: false,
      supportsToolUse: false,
      supportsStreaming: true,
    }));
  } catch {
    return MODELS;
  }
}

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  const baseUrl = config.baseUrl || process.env.CUSTOM_BASE_URL;

  if (!baseUrl) {
    throw new Error(
      'Custom provider requires a base URL. Set CUSTOM_BASE_URL environment variable or provide baseUrl in config.'
    );
  }

  const normalizedUrl = baseUrl.replace(/\/+$/, '');

  return createOpenAICompatibleAdapter({
    profile: {
      ...profile,
      baseUrl: normalizedUrl,
    },
    config: {
      ...config,
      apiKey: config.apiKey || process.env.CUSTOM_API_KEY,
      baseUrl: normalizedUrl,
    },
    fetchModelsImpl: () => fetchAvailableModels(normalizedUrl),
  });
}
