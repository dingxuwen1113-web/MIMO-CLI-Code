// ── Multi-Provider Registry: Auto-discovery & Lazy Loading ──────

import { ProviderProfile, ProviderAdapter, ProviderConfig, ProviderPlugin, ModelInfo } from './types';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

interface RegisteredProvider {
  profile: ProviderProfile;
  factory: (config: ProviderConfig) => ProviderAdapter;
  plugin?: ProviderPlugin;
}

export class ProviderRegistry {
  private providers = new Map<string, RegisteredProvider>();
  private adapterCache = new Map<string, ProviderAdapter>();
  private pluginDirs: string[] = [];

  constructor() {
    this.registerBuiltInProviders();
    this.pluginDirs = [
      path.join(os.homedir(), '.mimo', 'plugins', 'providers'),
      path.join(process.cwd(), '.mimo', 'plugins', 'providers'),
    ];
  }

  private registerBuiltInProviders(): void {
    // Lazy imports to avoid circular deps and reduce startup time
    const providers: Array<{ name: string; factory: () => { profile: ProviderProfile; createAdapter: (c: ProviderConfig) => ProviderAdapter } }> = [
      { name: 'anthropic', factory: () => require('./adapters/anthropic') },
      { name: 'openai', factory: () => require('./adapters/openai') },
      { name: 'google', factory: () => require('./adapters/google') },
      { name: 'deepseek', factory: () => require('./adapters/deepseek') },
      { name: 'openrouter', factory: () => require('./adapters/openrouter') },
      { name: 'ollama', factory: () => require('./adapters/ollama') },
      { name: 'azure', factory: () => require('./adapters/azure') },
      { name: 'bedrock', factory: () => require('./adapters/bedrock') },
      { name: 'xai', factory: () => require('./adapters/xai') },
      { name: 'groq', factory: () => require('./adapters/groq') },
      { name: 'mistral', factory: () => require('./adapters/mistral') },
      { name: 'cohere', factory: () => require('./adapters/cohere') },
      { name: 'huggingface', factory: () => require('./adapters/huggingface') },
      { name: 'moonshot', factory: () => require('./adapters/moonshot') },
      { name: 'minimax', factory: () => require('./adapters/minimax') },
      { name: 'nvidia', factory: () => require('./adapters/nvidia') },
      { name: 'qwen', factory: () => require('./adapters/qwen') },
      { name: 'stepfun', factory: () => require('./adapters/stepfun') },
      { name: 'zhipu', factory: () => require('./adapters/zhipu') },
      { name: 'together', factory: () => require('./adapters/together') },
      { name: 'fireworks', factory: () => require('./adapters/fireworks') },
      { name: 'replicate', factory: () => require('./adapters/replicate') },
      { name: 'perplexity', factory: () => require('./adapters/perplexity') },
      { name: 'volcengine', factory: () => require('./adapters/volcengine') },
      { name: 'baichuan', factory: () => require('./adapters/baichuan') },
      { name: 'yi', factory: () => require('./adapters/yi') },
      { name: 'siliconflow', factory: () => require('./adapters/siliconflow') },
      { name: 'lmstudio', factory: () => require('./adapters/lmstudio') },
      { name: 'vllm', factory: () => require('./adapters/vllm') },
      { name: 'custom', factory: () => require('./adapters/custom') },
    ];

    for (const p of providers) {
      try {
        const mod = p.factory();
        this.register(mod.profile, mod.createAdapter);
      } catch {
        // Provider adapter not yet implemented — register placeholder
        this.registerPlaceholder(p.name);
      }
    }
  }

  private registerPlaceholder(name: string): void {
    this.providers.set(name, {
      profile: {
        name,
        displayName: name,
        description: `${name} provider (placeholder)`,
        apiMode: 'chat_completions',
        aliases: [],
        authType: 'api_key',
        envVars: [],
        baseUrl: '',
        models: [],
        fallbackModels: [],
        defaultModel: '',
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
      },
      factory: () => { throw new Error(`Provider "${name}" adapter not yet implemented`); },
    });
  }

  register(profile: ProviderProfile, factory: (config: ProviderConfig) => ProviderAdapter): void {
    this.providers.set(profile.name, { profile, factory });
    for (const alias of profile.aliases) {
      this.providers.set(alias, { profile, factory });
    }
  }

  async discoverPlugins(): Promise<void> {
    for (const dir of this.pluginDirs) {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(dir, entry.name, 'plugin.yaml');
        if (!fs.existsSync(manifestPath)) continue;
        try {
          const yaml = require('yaml');
          const manifest = yaml.parse(fs.readFileSync(manifestPath, 'utf-8'));
          const indexPath = path.join(dir, entry.name, 'index.js');
          if (fs.existsSync(indexPath)) {
            const mod = require(indexPath);
            if (mod.profile && mod.createAdapter) {
              this.register(mod.profile, mod.createAdapter);
            }
          }
        } catch { /* skip broken plugins */ }
      }
    }
  }

  getAdapter(providerName: string, config: ProviderConfig): ProviderAdapter {
    const cacheKey = `${providerName}:${config.apiKey?.slice(-8) || 'default'}`;
    if (this.adapterCache.has(cacheKey)) {
      return this.adapterCache.get(cacheKey)!;
    }
    const reg = this.providers.get(providerName);
    if (!reg) throw new Error(`Unknown provider: "${providerName}". Available: ${this.listProviderNames().join(', ')}`);
    const adapter = reg.factory(config);
    this.adapterCache.set(cacheKey, adapter);
    return adapter;
  }

  getProfile(providerName: string): ProviderProfile | undefined {
    return this.providers.get(providerName)?.profile;
  }

  listProviders(): ProviderProfile[] {
    const seen = new Set<string>();
    const result: ProviderProfile[] = [];
    for (const [, reg] of this.providers) {
      if (!seen.has(reg.profile.name)) {
        seen.add(reg.profile.name);
        result.push(reg.profile);
      }
    }
    return result;
  }

  listProviderNames(): string[] {
    return [...new Set([...this.providers.keys()])];
  }

  findProvider(query: string): ProviderProfile | undefined {
    const lower = query.toLowerCase();
    // Direct name match
    const reg = this.providers.get(lower);
    if (reg) return reg.profile;
    // Search by display name or alias
    for (const [, r] of this.providers) {
      if (r.profile.displayName.toLowerCase().includes(lower) ||
          r.profile.aliases.some(a => a.toLowerCase() === lower)) {
        return r.profile;
      }
    }
    return undefined;
  }

  resolveModel(modelId: string): { provider: string; model: string } | undefined {
    // Format: "provider/model" e.g. "openai/gpt-4o", "anthropic/claude-sonnet-4-20250514"
    if (modelId.includes('/')) {
      const [provider, model] = modelId.split('/', 2);
      if (this.providers.has(provider)) return { provider, model };
    }
    // Auto-detect by model name patterns
    if (modelId.startsWith('claude')) return { provider: 'anthropic', model: modelId };
    if (modelId.startsWith('gpt-') || modelId.startsWith('o1') || modelId.startsWith('o3')) return { provider: 'openai', model: modelId };
    if (modelId.startsWith('gemini')) return { provider: 'google', model: modelId };
    if (modelId.startsWith('deepseek')) return { provider: 'deepseek', model: modelId };
    if (modelId.startsWith('mistral') || modelId.startsWith('codestral')) return { provider: 'mistral', model: modelId };
    if (modelId.startsWith('command')) return { provider: 'cohere', model: modelId };
    if (modelId.startsWith('grok')) return { provider: 'xai', model: modelId };
    if (modelId.startsWith('llama') || modelId.startsWith('mixtral')) return { provider: 'groq', model: modelId };
    if (modelId.startsWith('moonshot') || modelId.startsWith('kimi')) return { provider: 'moonshot', model: modelId };
    if (modelId.startsWith('qwen')) return { provider: 'qwen', model: modelId };
    if (modelId.startsWith('glm') || modelId.startsWith('chatglm')) return { provider: 'zhipu', model: modelId };
    if (modelId.startsWith('yi-')) return { provider: 'yi', model: modelId };
    if (modelId.startsWith('Baichuan')) return { provider: 'baichuan', model: modelId };
    if (modelId.startsWith('abab')) return { provider: 'minimax', model: modelId };
    if (modelId.startsWith('step-')) return { provider: 'stepfun', model: modelId };
    return undefined;
  }

  getApiKeyForProvider(profile: ProviderProfile): string | undefined {
    for (const envVar of profile.envVars) {
      const val = process.env[envVar];
      if (val) return val;
    }
    return undefined;
  }
}

export const providerRegistry = new ProviderRegistry();
