/**
 * MIMO CLI Code - Plugin Architecture Types
 * Defines all interfaces for the plugin system.
 */

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  type: 'provider' | 'tool' | 'search' | 'memory' | 'browser' | 'media' | 'platform' | 'composite';
  entry: string;
  tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  skills?: Array<{ id: string; name: string; description: string; triggers: string[] }>;
  config?: Array<{ key: string; required: boolean; default?: unknown; description?: string }>;
  dependencies?: string[];
  minVersion?: string;
}

export interface PluginModule {
  manifest: PluginManifest;
  init?(config: Record<string, unknown>): Promise<void>;
  getTools?(): PluginTool[];
  getSkills?(): PluginSkill[];
  cleanup?(): Promise<void>;
}

export interface PluginTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(input: Record<string, unknown>): Promise<unknown>;
}

export interface PluginSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  triggers: string[];
  systemPrompt: string;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  module: PluginModule;
  path: string;
  enabled: boolean;
  loadedAt: Date;
  error?: string;
}
