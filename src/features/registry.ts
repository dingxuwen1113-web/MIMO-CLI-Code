// ── Feature Plugin Registry ─────────────────────────
// Unified system for registering and managing all 55 innovation features

export type FeatureCategory =
  | 'perception'
  | 'quality'
  | 'devex'
  | 'devops'
  | 'collaboration'
  | 'performance'
  | 'security'
  | 'ai'
  | 'terminal';

export interface FeatureMeta {
  id: string;
  name: string;
  description: string;
  category: FeatureCategory;
  enabled: boolean;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  dependencies?: string[];
}

export interface FeatureModule {
  meta: FeatureMeta;
  init?(context: FeatureContext): Promise<void>;
  onEvent?(event: string, data: any): Promise<void>;
  getTools?(): Array<{ name: string; definition: any; execute: (input: any) => Promise<any> }>;
  getCommands?(): Array<{ name: string; description: string; handler: (args: string) => Promise<void> }>;
  getStatus?(): Record<string, any>;
  cleanup?(): Promise<void>;
}

export interface FeatureContext {
  projectDir: string;
  homeDir: string;
  memoryDir: string;
  config: Record<string, any>;
  emit: (event: string, data: any) => void;
}

export class FeatureRegistry {
  private features: Map<string, FeatureModule> = new Map();
  private context!: FeatureContext;
  private eventListeners: Map<string, Set<string>> = new Map();

  async init(context: FeatureContext): Promise<void> {
    this.context = context;
    for (const [id, feature] of this.features) {
      if (feature.meta.enabled && feature.init) {
        try {
          await feature.init(context);
        } catch (err: any) {
          console.error(`Feature ${id} init failed: ${err.message}`);
        }
      }
    }
  }

  register(feature: FeatureModule): void {
    this.features.set(feature.meta.id, feature);
  }

  registerAll(features: FeatureModule[]): void {
    for (const f of features) this.register(f);
  }

  get(id: string): FeatureModule | undefined {
    return this.features.get(id);
  }

  isEnabled(id: string): boolean {
    return this.features.get(id)?.meta.enabled ?? false;
  }

  setEnabled(id: string, enabled: boolean): void {
    const f = this.features.get(id);
    if (f) f.meta.enabled = enabled;
  }

  listByCategory(category: FeatureCategory): FeatureModule[] {
    return Array.from(this.features.values()).filter(f => f.meta.category === category);
  }

  getAll(): FeatureModule[] {
    return Array.from(this.features.values());
  }

  getEnabled(): FeatureModule[] {
    return Array.from(this.features.values()).filter(f => f.meta.enabled);
  }

  getAllTools(): Array<{ name: string; definition: any; execute: (input: any) => Promise<any> }> {
    const tools: Array<{ name: string; definition: any; execute: (input: any) => Promise<any> }> = [];
    for (const f of this.features.values()) {
      if (f.meta.enabled && f.getTools) {
        tools.push(...f.getTools());
      }
    }
    return tools;
  }

  getAllCommands(): Array<{ name: string; description: string; handler: (args: string) => Promise<void> }> {
    const cmds: Array<{ name: string; description: string; handler: (args: string) => Promise<void> }> = [];
    for (const f of this.features.values()) {
      if (f.meta.enabled && f.getCommands) {
        cmds.push(...f.getCommands());
      }
    }
    return cmds;
  }

  async emitEvent(event: string, data: any): Promise<void> {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;
    for (const id of listeners) {
      const f = this.features.get(id);
      if (f?.meta.enabled && f.onEvent) {
        try {
          await f.onEvent(event, data);
        } catch { /* don't let one feature crash others */ }
      }
    }
  }

  subscribe(featureId: string, events: string[]): void {
    for (const event of events) {
      if (!this.eventListeners.has(event)) this.eventListeners.set(event, new Set());
      this.eventListeners.get(event)!.add(featureId);
    }
  }

  getStatusSummary(): Record<string, { enabled: boolean; status?: Record<string, any> }> {
    const summary: Record<string, { enabled: boolean; status?: Record<string, any> }> = {};
    for (const [id, f] of this.features) {
      summary[id] = {
        enabled: f.meta.enabled,
        status: f.getStatus ? f.getStatus() : undefined,
      };
    }
    return summary;
  }

  async cleanup(): Promise<void> {
    for (const f of this.features.values()) {
      if (f.cleanup) {
        try { await f.cleanup(); } catch { /* ignore */ }
      }
    }
  }
}
