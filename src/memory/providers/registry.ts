import { MemoryProvider } from './types.js';
import { FileMemoryProvider } from './file-provider.js';
import { SQLiteMemoryProvider } from './sqlite-provider.js';

export interface ProviderConfig {
  type: 'file' | 'sqlite' | string;
  options?: Record<string, any>;
}

export class MemoryProviderRegistry {
  private providers: Map<string, MemoryProvider> = new Map();
  private activeProvider: MemoryProvider | null = null;
  private fallbackChain: string[] = [];

  constructor() {
    this.registerDefaultProviders();
  }

  private registerDefaultProviders(): void {
    this.register('file', () => new FileMemoryProvider());
    this.register('sqlite', () => new SQLiteMemoryProvider());
  }

  register(name: string, factory: () => MemoryProvider): void {
    const provider = factory();
    this.providers.set(name, provider);
    if (!this.fallbackChain.includes(name)) {
      this.fallbackChain.push(name);
    }
  }

  async getProvider(name?: string): Promise<MemoryProvider> {
    if (name) {
      const provider = this.providers.get(name);
      if (!provider) {
        throw new Error(`Provider not found: ${name}`);
      }
      await provider.init();
      this.activeProvider = provider;
      return provider;
    }

    if (this.activeProvider) {
      return this.activeProvider;
    }

    return this.getProviderWithFallback();
  }

  private async getProviderWithFallback(): Promise<MemoryProvider> {
    for (const name of this.fallbackChain) {
      try {
        const provider = this.providers.get(name);
        if (provider) {
          await provider.init();
          this.activeProvider = provider;
          return provider;
        }
      } catch (err) {
        console.warn(`Provider ${name} failed to init:`, err);
        continue;
      }
    }
    throw new Error('No memory providers available');
  }

  async switchProvider(name: string): Promise<MemoryProvider> {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider not found: ${name}`);
    }

    await provider.init();
    this.activeProvider = provider;
    return provider;
  }

  getActiveProvider(): MemoryProvider | null {
    return this.activeProvider;
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  setFallbackChain(chain: string[]): void {
    this.fallbackChain = chain.filter(name => this.providers.has(name));
  }

  getFallbackChain(): string[] {
    return [...this.fallbackChain];
  }
}

let globalRegistry: MemoryProviderRegistry | null = null;

export function getMemoryRegistry(): MemoryProviderRegistry {
  if (!globalRegistry) {
    globalRegistry = new MemoryProviderRegistry();
  }
  return globalRegistry;
}

export async function getMemoryProvider(config?: ProviderConfig): Promise<MemoryProvider> {
  const registry = getMemoryRegistry();

  if (config?.type) {
    return registry.getProvider(config.type);
  }

  return registry.getProvider();
}
