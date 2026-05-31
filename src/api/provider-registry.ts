import createDebug from 'debug';
import Anthropic from '@anthropic-ai/sdk';

const debug = createDebug('mimo:provider');

// ─── Provider Types ────────────────────────────────────────────────

export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'bedrock'
  | 'groq'
  | 'deepseek'
  | 'mistral'
  | 'together'
  | 'cerebras'
  | 'xai'
  | 'ollama'
  | 'openai-compatible';

export interface ModelDefinition {
  id: string;
  name: string;
  provider: ProviderId;
  contextWindow: number;
  maxOutput: number;
  supportsThinking: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  pricing: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
  aliases: string[];
}

export interface AuthConfig {
  apiKey?: string;
  oauth?: { clientId: string; clientSecret: string; tokenUrl: string };
  envVar?: string;
  baseUrl?: string;
  region?: string;  // for Bedrock
}

export interface StreamCallbacks {
  onText?: (text: string) => void;
  onThinking?: (thinking: string) => void;
  onToolUse?: (tool: any) => void;
  onContentBlock?: (block: any) => void;
}

export type StreamFn = (
  messages: any[],
  tools: any[],
  system: any[],
  options: {
    model: string;
    maxTokens: number;
    thinking?: boolean;
    temperature?: number;
    stopSequences?: string[];
  },
  callbacks: StreamCallbacks,
) => Promise<any>;

export interface ProviderPlugin {
  id: ProviderId;
  name: string;
  auth: {
    methods: ('api_key' | 'oauth' | 'env')[];
    validate(config: AuthConfig): Promise<boolean>;
    getClient(config: AuthConfig): any;
  };
  catalog: {
    models: ModelDefinition[];
    aliases: Record<string, string>;
  };
  createStreamFn(config: AuthConfig): StreamFn;
  resolveModel(requested: string): string;
  supportsFeature(model: string, feature: 'thinking' | 'vision' | 'tools'): boolean;
}

// ─── Built-in Model Catalog ────────────────────────────────────────

export const MODEL_CATALOG: ModelDefinition[] = [
  // Anthropic
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', contextWindow: 200000, maxOutput: 64000, supportsThinking: true, supportsVision: true, supportsTools: true, pricing: { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75 }, aliases: ['claude-sonnet', 'sonnet'] },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic', contextWindow: 200000, maxOutput: 64000, supportsThinking: false, supportsVision: true, supportsTools: true, pricing: { input: 0.80, output: 4, cacheRead: 0.08, cacheWrite: 1 }, aliases: ['claude-haiku', 'haiku'] },
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic', contextWindow: 200000, maxOutput: 64000, supportsThinking: true, supportsVision: true, supportsTools: true, pricing: { input: 15, output: 75, cacheRead: 1.50, cacheWrite: 18.75 }, aliases: ['claude-opus', 'opus'] },
  // OpenAI
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: 128000, maxOutput: 16384, supportsThinking: false, supportsVision: true, supportsTools: true, pricing: { input: 2.50, output: 10 }, aliases: ['gpt4o'] },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', contextWindow: 128000, maxOutput: 16384, supportsThinking: false, supportsVision: true, supportsTools: true, pricing: { input: 0.15, output: 0.60 }, aliases: ['gpt4o-mini'] },
  { id: 'o3', name: 'o3', provider: 'openai', contextWindow: 200000, maxOutput: 100000, supportsThinking: true, supportsVision: true, supportsTools: true, pricing: { input: 10, output: 40 }, aliases: [] },
  { id: 'o4-mini', name: 'o4-mini', provider: 'openai', contextWindow: 200000, maxOutput: 100000, supportsThinking: true, supportsVision: true, supportsTools: true, pricing: { input: 1.10, output: 4.40 }, aliases: [] },
  // Google
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', contextWindow: 1000000, maxOutput: 65536, supportsThinking: true, supportsVision: true, supportsTools: true, pricing: { input: 1.25, output: 10 }, aliases: ['gemini-pro'] },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', contextWindow: 1000000, maxOutput: 65536, supportsThinking: true, supportsVision: true, supportsTools: true, pricing: { input: 0.15, output: 0.60 }, aliases: ['gemini-flash'] },
  // Groq
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', provider: 'groq', contextWindow: 128000, maxOutput: 32768, supportsThinking: false, supportsVision: false, supportsTools: true, pricing: { input: 0.59, output: 0.79 }, aliases: ['llama-70b'] },
  // DeepSeek
  { id: 'deepseek-chat', name: 'DeepSeek V3', provider: 'deepseek', contextWindow: 64000, maxOutput: 8192, supportsThinking: false, supportsVision: false, supportsTools: true, pricing: { input: 0.27, output: 1.10 }, aliases: ['deepseek'] },
  { id: 'deepseek-reasoner', name: 'DeepSeek R1', provider: 'deepseek', contextWindow: 64000, maxOutput: 8192, supportsThinking: true, supportsVision: false, supportsTools: false, pricing: { input: 0.55, output: 2.19 }, aliases: ['deepseek-r1'] },
  // Mistral
  { id: 'mistral-large-latest', name: 'Mistral Large', provider: 'mistral', contextWindow: 128000, maxOutput: 32768, supportsThinking: false, supportsVision: false, supportsTools: true, pricing: { input: 2, output: 6 }, aliases: ['mistral-large'] },
  // xAI
  { id: 'grok-3', name: 'Grok 3', provider: 'xai', contextWindow: 131072, maxOutput: 131072, supportsThinking: true, supportsVision: false, supportsTools: true, pricing: { input: 3, output: 15 }, aliases: ['grok'] },
  // Ollama (local, free)
  { id: 'llama3.1', name: 'Llama 3.1 (Local)', provider: 'ollama', contextWindow: 128000, maxOutput: 32768, supportsThinking: false, supportsVision: false, supportsTools: true, pricing: { input: 0, output: 0 }, aliases: [] },
];

// ─── Provider Registry ─────────────────────────────────────────────

export class ProviderRegistry {
  private providers: Map<ProviderId, ProviderPlugin> = new Map();
  private configs: Map<ProviderId, AuthConfig> = new Map();
  private modelIndex: Map<string, ModelDefinition> = new Map();
  private aliasIndex: Map<string, string> = new Map();

  constructor() {
    // Build model index
    for (const model of MODEL_CATALOG) {
      this.modelIndex.set(model.id, model);
      for (const alias of model.aliases) {
        this.aliasIndex.set(alias, model.id);
      }
    }
  }

  registerProvider(plugin: ProviderPlugin): void {
    this.providers.set(plugin.id, plugin);
    for (const model of plugin.catalog.models) {
      this.modelIndex.set(model.id, model);
      for (const alias of model.aliases) {
        this.aliasIndex.set(alias, model.id);
      }
    }
    debug('Registered provider: %s (%d models)', plugin.id, plugin.catalog.models.length);
  }

  setConfig(providerId: ProviderId, config: AuthConfig): void {
    this.configs.set(providerId, config);
  }

  getProvider(id: ProviderId): ProviderPlugin | undefined {
    return this.providers.get(id);
  }

  resolveModel(identifier: string): ModelDefinition | undefined {
    const resolved = this.aliasIndex.get(identifier) || identifier;
    return this.modelIndex.get(resolved);
  }

  getModel(modelId: string): ModelDefinition | undefined {
    return this.modelIndex.get(modelId);
  }

  listModels(providerId?: ProviderId): ModelDefinition[] {
    if (providerId) {
      return MODEL_CATALOG.filter(m => m.provider === providerId);
    }
    return [...this.modelIndex.values()];
  }

  listProviders(): ProviderId[] {
    return Array.from(this.providers.keys());
  }

  supportsFeature(modelId: string, feature: 'thinking' | 'vision' | 'tools'): boolean {
    const model = this.resolveModel(modelId);
    if (!model) return false;
    switch (feature) {
      case 'thinking': return model.supportsThinking;
      case 'vision': return model.supportsVision;
      case 'tools': return model.supportsTools;
    }
  }

  estimateCost(modelId: string, inputTokens: number, outputTokens: number, cacheReadTokens = 0): number {
    const model = this.resolveModel(modelId);
    if (!model) return 0;
    return (
      (inputTokens / 1_000_000) * model.pricing.input +
      (outputTokens / 1_000_000) * model.pricing.output +
      (cacheReadTokens / 1_000_000) * (model.pricing.cacheRead || 0)
    );
  }
}

// ─── Failover Chain ────────────────────────────────────────────────

export interface FailoverEntry {
  provider: ProviderId;
  model: string;
  weight: number;
}

export class FailoverChain {
  private chain: FailoverEntry[];
  private currentIndex = 0;
  private failureCounts: Map<string, number> = new Map();

  constructor(chain: FailoverEntry[]) {
    this.chain = chain.sort((a, b) => a.weight - b.weight);
  }

  async execute<T>(
    fn: (provider: ProviderId, model: string) => Promise<T>,
    isRetryable: (err: any) => boolean = defaultIsRetryable,
  ): Promise<T> {
    const errors: Array<{ provider: string; model: string; error: Error }> = [];

    for (const entry of this.chain) {
      const key = `${entry.provider}/${entry.model}`;
      const failures = this.failureCounts.get(key) || 0;

      // Skip entries with too many recent failures
      if (failures >= 3) {
        debug('Skipping %s (too many failures: %d)', key, failures);
        continue;
      }

      try {
        debug('Trying %s (weight=%d)', key, entry.weight);
        const result = await fn(entry.provider, entry.model);
        // Success - reset failure count
        this.failureCounts.set(key, 0);
        return result;
      } catch (err: any) {
        this.failureCounts.set(key, failures + 1);
        errors.push({ provider: entry.provider, model: entry.model, error: err });

        if (!isRetryable(err)) {
          debug('Non-retryable error from %s: %s', key, err.message);
          throw err;
        }

        debug('Retryable error from %s: %s, trying next', key, err.message);
      }
    }

    const summary = errors.map(e => `${e.provider}/${e.model}: ${e.error.message}`).join('; ');
    throw new Error(`All providers in failover chain exhausted. Errors: ${summary}`);
  }

  reset(): void {
    this.currentIndex = 0;
    this.failureCounts.clear();
  }

  getChain(): FailoverEntry[] {
    return [...this.chain];
  }

  getStatus(): Array<{ provider: string; model: string; failures: number }> {
    return this.chain.map(e => ({
      provider: e.provider,
      model: e.model,
      failures: this.failureCounts.get(`${e.provider}/${e.model}`) || 0,
    }));
  }
}

function defaultIsRetryable(err: any): boolean {
  const status = err?.status || err?.statusCode;
  if (status === 429 || status === 529 || status === 503) return true;
  if (status >= 500 && status < 600) return true;
  const msg = err?.message || '';
  if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND')) return true;
  if (msg.includes('overloaded') || msg.includes('rate limit')) return true;
  return false;
}

// ─── Global singleton ──────────────────────────────────────────────

let globalRegistry: ProviderRegistry | null = null;

export function getGlobalProviderRegistry(): ProviderRegistry {
  if (!globalRegistry) globalRegistry = new ProviderRegistry();
  return globalRegistry;
}
