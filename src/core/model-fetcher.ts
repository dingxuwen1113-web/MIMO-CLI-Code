// ── 实时模型列表获取 ──────────────────────────────

import Anthropic from '@anthropic-ai/sdk';

export interface ModelInfo {
  id: string;
  name: string;
  displayName: string;
  description: string;
  maxTokens: number;
  isDefault: boolean;
}

// 默认模型列表（API 不可用时的回退）
const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: 'mimo-v2.5-pro',
    name: 'mimo-v2.5-pro',
    displayName: 'pro',
    description: 'High performance reasoning',
    maxTokens: 8192,
    isDefault: true,
  },
  {
    id: 'mimo-v2.5',
    name: 'mimo-v2.5',
    displayName: 'std',
    description: 'Fast lightweight',
    maxTokens: 8192,
    isDefault: false,
  },
];

// 从 API 实时获取可用模型列表
export async function fetchAvailableModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
  try {
    const clientOpts: Record<string, any> = { apiKey };
    if (baseUrl) clientOpts.baseURL = baseUrl;

    const client = new Anthropic(clientOpts as any);

    // 尝试获取模型列表（Anthropic API）
    const response = await fetch(`${baseUrl || 'https://api.anthropic.com'}/v1/models`, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok) {
      const data = await response.json() as any;
      const models = (data.data || data.models || []).map((m: any) => {
        const id = m.id || m.name || '';
        return {
          id,
          name: id,
          displayName: id.replace('mimo-', '').replace('claude-', ''),
          description: m.description || '',
          maxTokens: m.max_output_tokens || 8192,
          isDefault: id.includes('pro') || id === FALLBACK_MODELS[0].id,
        };
      });

      if (models.length > 0) return models;
    }

    // API 不支持 /v1/models，尝试 mimo 代理
    if (baseUrl?.includes('mimo')) {
      const mimoResponse = await fetch(`${baseUrl}/v1/models`, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);

      if (mimoResponse?.ok) {
        const data = await mimoResponse.json() as any;
        const models = (data.data || []).map((m: any) => ({
          id: m.id,
          name: m.id,
          displayName: m.id.replace('mimo-', ''),
          description: '',
          maxTokens: 8192,
          isDefault: m.id.includes('pro'),
        }));
        if (models.length > 0) return models;
      }
    }

    return FALLBACK_MODELS;
  } catch {
    return FALLBACK_MODELS;
  }
}

// 缓存模型列表（避免每次启动都请求）
let cachedModels: ModelInfo[] | null = null;
let cacheTime: number = 0;
const CACHE_TTL = 300_000; // 5 分钟

export async function getModels(apiKey: string, baseUrl?: string): Promise<ModelInfo[]> {
  if (cachedModels && Date.now() - cacheTime < CACHE_TTL) {
    return cachedModels;
  }
  cachedModels = await fetchAvailableModels(apiKey, baseUrl);
  cacheTime = Date.now();
  return cachedModels;
}

// 获取当前模型的 displayName
export function getModelDisplayName(modelId: string, models: ModelInfo[]): string {
  const found = models.find((m) => m.id === modelId);
  return found?.displayName || modelId.replace('mimo-', '').replace('claude-', '');
}

// 切换到下一个模型
export function getNextModel(currentId: string, models: ModelInfo[]): string {
  const idx = models.findIndex((m) => m.id === currentId);
  if (idx === -1) return models[0]?.id || currentId;
  return models[(idx + 1) % models.length].id;
}

// 切换到上一个模型
export function getPrevModel(currentId: string, models: ModelInfo[]): string {
  const idx = models.findIndex((m) => m.id === currentId);
  if (idx === -1) return models[models.length - 1]?.id || currentId;
  return models[(idx - 1 + models.length) % models.length].id;
}
