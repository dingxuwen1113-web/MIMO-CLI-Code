// ── Qwen / Alibaba DashScope Provider Adapter ────────────────────

import { ProviderProfile, ProviderAdapter, ProviderConfig, ModelInfo } from '../types';
import { createOpenAICompatibleAdapter } from './openai-compatible-base';

const MODELS: ModelInfo[] = [
  {
    id: 'qwen-max',
    name: 'Qwen Max',
    provider: 'qwen',
    contextWindow: 32768,
    maxOutput: 8192,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'qwen-plus',
    name: 'Qwen Plus',
    provider: 'qwen',
    contextWindow: 131072,
    maxOutput: 8192,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
  {
    id: 'qwen-turbo',
    name: 'Qwen Turbo',
    provider: 'qwen',
    contextWindow: 131072,
    maxOutput: 8192,
    supportsVision: false,
    supportsToolUse: true,
    supportsStreaming: true,
  },
];

export const profile: ProviderProfile = {
  name: 'qwen',
  displayName: 'Qwen (Alibaba)',
  description: 'Alibaba Cloud Qwen models via DashScope API',
  apiMode: 'chat_completions',
  aliases: ['dashscope', 'alibaba', 'qwen-cloud'],
  authType: 'api_key',
  envVars: ['DASHSCOPE_API_KEY', 'QWEN_API_KEY'],
  baseUrl: 'dashscope.aliyuncs.com/compatible-mode',
  models: MODELS,
  fallbackModels: ['qwen-max', 'qwen-plus'],
  defaultModel: 'qwen-max',
  defaultHeaders: {},
  maxContextTokens: 131072,
  maxOutputTokens: 8192,
  supportsStreaming: true,
  supportsVision: false,
  supportsToolUse: true,
  supportsThinking: false,
  supportsPromptCaching: false,
  supportsImageGeneration: false,
  supportsVideoGeneration: false,
  supportsTTS: false,
  supportsSTT: false,
  signupUrl: 'https://dashscope.console.aliyun.com',
};

export function createAdapter(config: ProviderConfig): ProviderAdapter {
  return createOpenAICompatibleAdapter({ profile, config });
}
