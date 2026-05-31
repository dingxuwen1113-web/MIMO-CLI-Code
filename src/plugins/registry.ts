/**
 * MIMO CLI Code - Plugin Registry
 * Central registry that stores loaded plugins, manages their lifecycle,
 * aggregates tools and skills, and detects conflicts.
 */

import { LoadedPlugin, PluginModule, PluginTool, PluginSkill } from './types';
import { PluginLoader, PluginScanResult } from './loader';

// ─── Events ─────────────────────────────────────────────────────────────────

export type PluginEventType =
  | 'plugin-loaded'
  | 'plugin-unloaded'
  | 'plugin-enabled'
  | 'plugin-disabled'
  | 'plugin-error'
  | 'conflict-detected';

export interface PluginEvent {
  type: PluginEventType;
  pluginName: string;
  timestamp: Date;
  detail?: string;
}

type PluginEventCallback = (event: PluginEvent) => void;

// ─── Conflict Report ────────────────────────────────────────────────────────

export interface ConflictReport {
  toolName: string;
  plugins: string[]; // plugin names that register the same tool
}

// ─── Registry ───────────────────────────────────────────────────────────────

export class PluginRegistry {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private loader: PluginLoader;
  private eventCallbacks: PluginEventCallback[] = [];

  constructor(loader: PluginLoader) {
    this.loader = loader;

    // Wire up hot-reload callback from loader
    this.loader.onReload((reloaded) => {
      this.handleReload(reloaded);
    });
  }

  // ─── Event System ───────────────────────────────────────────────────────

  /**
   * Subscribe to plugin lifecycle events.
   */
  onEvent(callback: PluginEventCallback): void {
    this.eventCallbacks.push(callback);
  }

  private emit(type: PluginEventType, pluginName: string, detail?: string): void {
    const event: PluginEvent = { type, pluginName, timestamp: new Date(), detail };
    for (const cb of this.eventCallbacks) {
      try {
        cb(event);
      } catch {
        // Never let a subscriber crash the registry
      }
    }
  }

  // ─── Loading ────────────────────────────────────────────────────────────

  /**
   * Scan all plugin directories, load discovered plugins, and register them.
   * Returns the scan result with loaded plugins and any errors.
   */
  async discoverAndLoad(): Promise<PluginScanResult> {
    const result = await this.loader.scanAll();

    for (const plugin of result.loaded) {
      this.register(plugin);
    }

    // Enable hot-reload for all successfully loaded plugins
    for (const plugin of result.loaded) {
      this.loader.watchPlugin(plugin.path);
    }

    return result;
  }

  /**
   * Register a single already-loaded plugin into the registry.
   * Detects conflicts with previously registered plugins.
   */
  register(plugin: LoadedPlugin): void {
    const name = plugin.manifest.name;

    if (this.plugins.has(name)) {
      // Overwrite existing — log a warning via event
      this.emit('plugin-loaded', name, `Replaced existing registration for "${name}"`);
    }

    this.plugins.set(name, plugin);
    this.emit('plugin-loaded', name);

    // Check for conflicts immediately
    const conflicts = this.detectConflicts();
    const relevant = conflicts.filter(c => c.plugins.includes(name));
    for (const conflict of relevant) {
      this.emit('conflict-detected', name, `Duplicate tool: "${conflict.toolName}" in [${conflict.plugins.join(', ')}]`);
    }
  }

  /**
   * Unregister a plugin by name. Calls cleanup before removing.
   */
  async unregister(pluginName: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return false;

    // Stop watching
    this.loader.unwatchPlugin(plugin.path);

    // Call cleanup if available
    try {
      if (plugin.module.cleanup) {
        await plugin.module.cleanup();
      }
    } catch (err: unknown) {
      this.emit('plugin-error', pluginName, `Cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    this.plugins.delete(pluginName);
    this.emit('plugin-unloaded', pluginName);
    return true;
  }

  // ─── Enable / Disable ───────────────────────────────────────────────────

  /**
   * Enable a plugin by name. Calls init() if the plugin has not been initialized yet.
   * Returns true if the plugin was found and enabled.
   */
  async enable(pluginName: string, config?: Record<string, unknown>): Promise<boolean> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return false;

    if (plugin.enabled) return true; // Already enabled

    plugin.enabled = true;

    // Run init if provided
    try {
      if (plugin.module.init) {
        const initConfig = config ?? this.loader['configProvider']?.(pluginName) ?? {};
        await plugin.module.init(initConfig);
      }
    } catch (err: unknown) {
      plugin.enabled = false;
      plugin.error = err instanceof Error ? err.message : String(err);
      this.emit('plugin-error', pluginName, `Init failed: ${plugin.error}`);
      return false;
    }

    this.emit('plugin-enabled', pluginName);
    return true;
  }

  /**
   * Disable a plugin by name. Does NOT call cleanup — use unregister() for full teardown.
   * Returns true if the plugin was found.
   */
  disable(pluginName: string): boolean {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return false;

    plugin.enabled = false;
    this.emit('plugin-disabled', pluginName);
    return true;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Initialize all registered plugins that have an init() method.
   * Plugins that fail to init are disabled and reported.
   */
  async initializeAll(): Promise<void> {
    const initPromises: Promise<void>[] = [];

    for (const [name, plugin] of this.plugins) {
      if (!plugin.enabled || !plugin.module.init) continue;

      const initPromise = (async () => {
        try {
          const config = this.loader['configProvider']?.(name) ?? {};
          await plugin.module.init!(config);
        } catch (err: unknown) {
          plugin.enabled = false;
          plugin.error = err instanceof Error ? err.message : String(err);
          this.emit('plugin-error', name, `Init failed: ${plugin.error}`);
        }
      })();

      initPromises.push(initPromise);
    }

    await Promise.allSettled(initPromises);
  }

  /**
   * Cleanup all registered plugins and stop all watchers.
   * Should be called on application shutdown.
   */
  async cleanupAll(): Promise<void> {
    const cleanupPromises: Promise<void>[] = [];

    for (const [name, plugin] of this.plugins) {
      if (!plugin.module.cleanup) continue;

      cleanupPromises.push(
        plugin.module.cleanup().catch((err: unknown) => {
          this.emit('plugin-error', name, `Cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
        }),
      );
    }

    await Promise.allSettled(cleanupPromises);
    this.loader.unwatchAll();
    this.plugins.clear();
  }

  // ─── Aggregation ────────────────────────────────────────────────────────

  /**
   * Returns all tools from all enabled plugins.
   * If a plugin does not expose getTools(), falls back to manifest-declared tools
   * (without an execute function — consumers must handle this).
   */
  getTools(): PluginTool[] {
    const tools: PluginTool[] = [];

    for (const [name, plugin] of this.plugins) {
      if (!plugin.enabled) continue;

      try {
        if (plugin.module.getTools) {
          tools.push(...plugin.module.getTools());
        } else if (plugin.manifest.tools) {
          // Fallback: create stub tools from manifest declarations
          for (const declared of plugin.manifest.tools) {
            tools.push({
              name: declared.name,
              description: declared.description,
              parameters: declared.parameters,
              execute: async () => {
                throw new Error(`Tool "${declared.name}" from plugin "${name}" has no runtime implementation — declared in manifest only.`);
              },
            });
          }
        }
      } catch (err: unknown) {
        this.emit('plugin-error', name, `getTools() failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return tools;
  }

  /**
   * Returns all skills from all enabled plugins.
   * Falls back to manifest-declared skills when getSkills() is not provided.
   */
  getSkills(): PluginSkill[] {
    const skills: PluginSkill[] = [];

    for (const [name, plugin] of this.plugins) {
      if (!plugin.enabled) continue;

      try {
        if (plugin.module.getSkills) {
          skills.push(...plugin.module.getSkills());
        } else if (plugin.manifest.skills) {
          // Fallback: create stub skills from manifest declarations
          for (const declared of plugin.manifest.skills) {
            skills.push({
              id: declared.id,
              name: declared.name,
              description: declared.description,
              category: plugin.manifest.type,
              triggers: declared.triggers,
              systemPrompt: '',
            });
          }
        }
      } catch (err: unknown) {
        this.emit('plugin-error', name, `getSkills() failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return skills;
  }

  /**
   * Get a tool by name. Returns undefined if not found.
   */
  getTool(name: string): PluginTool | undefined {
    return this.getTools().find(t => t.name === name);
  }

  /**
   * Get a skill by id. Returns undefined if not found.
   */
  getSkill(id: string): PluginSkill | undefined {
    return this.getSkills().find(s => s.id === id);
  }

  // ─── Conflict Detection ────────────────────────────────────────────────

  /**
   * Detect duplicate tool names across all enabled plugins.
   * Returns a list of ConflictReports for tools registered by more than one plugin.
   */
  detectConflicts(): ConflictReport[] {
    const toolToPlugins = new Map<string, string[]>();

    for (const [name, plugin] of this.plugins) {
      if (!plugin.enabled) continue;

      // Collect tool names from module or manifest
      const toolNames: string[] = [];

      if (plugin.module.getTools) {
        try {
          toolNames.push(...plugin.module.getTools().map(t => t.name));
        } catch {
          // Skip plugin if getTools() throws
        }
      } else if (plugin.manifest.tools) {
        toolNames.push(...plugin.manifest.tools.map(t => t.name));
      }

      for (const toolName of toolNames) {
        const existing = toolToPlugins.get(toolName) ?? [];
        existing.push(name);
        toolToPlugins.set(toolName, existing);
      }
    }

    const conflicts: ConflictReport[] = [];
    for (const [toolName, plugins] of toolToPlugins) {
      if (plugins.length > 1) {
        conflicts.push({ toolName, plugins });
      }
    }

    return conflicts;
  }

  // ─── Queries ────────────────────────────────────────────────────────────

  /**
   * Get a registered plugin by name.
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all registered plugin names.
   */
  getPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get all loaded plugins (including disabled ones).
   */
  getAllPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get only enabled plugins.
   */
  getEnabledPlugins(): LoadedPlugin[] {
    return this.getAllPlugins().filter(p => p.enabled);
  }

  /**
   * Check if a plugin is registered and enabled.
   */
  isEnabled(pluginName: string): boolean {
    const plugin = this.plugins.get(pluginName);
    return plugin !== undefined && plugin.enabled;
  }

  /**
   * Total count of registered plugins.
   */
  get size(): number {
    return this.plugins.size;
  }

  // ─── Hot-Reload Handler ────────────────────────────────────────────────

  private handleReload(reloaded: LoadedPlugin): void {
    const name = reloaded.manifest.name;
    const existing = this.plugins.get(name);

    if (existing) {
      // Preserve enabled state from previous registration
      reloaded.enabled = existing.enabled;
    }

    this.register(reloaded);

    if (reloaded.error) {
      this.emit('plugin-error', name, `Hot-reload error: ${reloaded.error}`);
    } else {
      this.emit('plugin-loaded', name, 'Hot-reloaded successfully');
    }
  }
}
