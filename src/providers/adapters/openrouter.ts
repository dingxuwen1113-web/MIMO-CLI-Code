// ── OpenRouter Provider Adapter ─────────────────────────────────
// OpenAI-compatible adapter with per-request model routing.

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'auto',
    name: 'Auto (OpenRouter best pick)',
    provider: 'openrouter',
    contextWindow: 200_000,
    maxOutput: 16_384,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'anthropic/claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'openrouter',
    contextWindow: 200_000,
    maxOutput: 16_384,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 3.00, output: 15.00 },
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'openrouter',
    contextWindow: 128_000,
    maxOutput: 16_384,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 2.50, output: 10.00 },
  },
  {
    id: 'google/gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'openrouter',
    contextWindow: 1_048_576,
    maxOutput: 8_192,
    supportsVision: true,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 0.075, output: 0.30 },
  },
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'openrouter',
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 0.14, output: 0.28 },
  },
  {
    id: 'meta-llama/llama-3.1-405b-instruct',
    name: 'Llama 3.1 405B',
    provider: 'openrouter',
    contextWindow: 131_072,
    maxOutput: 16_384,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 2.75, output: 2.75 },
  },
  {
    id: 'mistralai/mistral-large-latest',
    name: 'Mistral Large',
    provider: 'openrouter',
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
    pricing: { input: 2.00, output: 6.00 },
  },
];

export const profile: ProviderProfile = {
  name: 'openrouter',
  displayName: 'OpenRouter',
  description: 'OpenRouter unified API — access hundreds of models from every provider',
  apiMode: 'chat_completions',
  aliases: ['or', 'open-router'],
  authType: 'api_key',
  envVars: ['OPENROUTER_API_KEY'],
  baseUrl: 'openrouter.ai',
  models: MODELS,
  fallbackModels: ['auto', 'openai/gpt-4o'],
  defaultModel: 'auto',
  defaultAuxModel: 'openai/gpt-4o',
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/dingxuwen1113/mimo-cli',
    'X-Title': 'MIMO CLI',
  },
  maxContextTokens: 200_000,
  maxOutputTokens: 16_384,
  supportsStreaming: true,
  supportsVision: true,
  supportsToolUse: true,
  supportsThinking: true,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
  signupUrl: 'https://openrouter.ai/keys',
  icon: 'openrouter',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({
    profile,
    config,
    fetchModelsImpl: async () => {
      const apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
      if (!apiKey) return profile.models;

      try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(config.timeout ?? 120_000),
        });
        if (!response.ok) return profile.models;

        const data = (await response.json()) as { data?: Array<{ id: string; name?: string; context_length?: number; top_provider?: { max_completion_tokens?: number }; architecture?: { modality?: string }; pricing?: { prompt?: string; completion?: string } }> };
        if (!data.data) return profile.models;

        return data.data.map((m) => {
          const known = profile.models.find((k) => k.id === m.id);
          if (known) return known;

          const modality = m.architecture?.modality ?? '';
          const supportsVision = modality.includes('image');

          return {
            id: m.id,
            name: m.name || m.id,
            provider: 'openrouter',
            contextWindow: m.context_length ?? 128_000,
            maxOutput: m.top_provider?.max_completion_tokens ?? 4_096,
            supportsVision,
            supportsToolUse: true,
            supportsStreaming: true,
            pricing: m.pricing
              ? {
                  input: parseFloat(m.pricing.prompt ?? '0') * 1_000_000,
                  output: parseFloat(m.pricing.completion ?? '0') * 1_000_000,
                }
              : undefined,
          };
        });
      } catch {
        return profile.models;
      }
    },
  });
}
