import createDebug from 'debug';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const debug = createDebug('mimo:plugin');

// ─── Plugin Types ───────────────────────────────────────────────────

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  main: string;
  tools?: PluginToolDef[];
  skills?: PluginSkillDef[];
  agents?: PluginAgentDef[];
  commands?: PluginCommandDef[];
  permissions: {
    tools: string[];
    files: string[];
    network: boolean;
    shell: boolean;
  };
}

export interface PluginToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: string;
}

export interface PluginSkillDef {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  systemPrompt: string;
}

export interface PluginAgentDef {
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
}

export interface PluginCommandDef {
  name: string;
  description: string;
  prompt: string;
  category?: string;
}

export interface PluginContext {
  registerTool(def: PluginToolDef, handler: (input: any) => Promise<any>): void;
  registerSkill(def: PluginSkillDef): void;
  registerAgent(def: PluginAgentDef): void;
  registerCommand(def: PluginCommandDef): void;
  getConfig(): Record<string, any>;
  log(message: string): void;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  path: string;
  enabled: boolean;
  registeredTools: string[];
  registeredSkills: string[];
  registeredCommands: string[];
}

// ─── Plugin Manager ─────────────────────────────────────────────────

export class PluginManager {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private pluginDirs: string[] = [];
  private toolHandlers: Map<string, (input: any) => Promise<any>> = new Map();
  private skills: Map<string, PluginSkillDef> = new Map();
  private agents: Map<string, PluginAgentDef> = new Map();
  private commands: Map<string, PluginCommandDef> = new Map();

  constructor(projectDir?: string) {
    const homeDir = os.homedir();
    this.pluginDirs = [
      path.join(homeDir, '.mimo', 'plugins'),
      ...(projectDir ? [path.join(projectDir, '.mimo', 'plugins')] : []),
    ];
  }

  /**
   * Initialize: discover and load all plugins
   */
  async init(): Promise<void> {
    debug('Initializing plugin manager, scanning dirs: %O', this.pluginDirs);

    for (const dir of this.pluginDirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const pluginPath = path.join(dir, entry.name);
            try {
              await this.loadPlugin(pluginPath);
            } catch (err: any) {
              debug('Failed to load plugin %s: %s', entry.name, err.message);
            }
          }
        }
      } catch {
        // Plugin dir doesn't exist, skip
      }
    }

    debug('Loaded %d plugins', this.plugins.size);
  }

  /**
   * Load a single plugin from its directory
   */
  async loadPlugin(pluginPath: string): Promise<LoadedPlugin> {
    const manifestPath = path.join(pluginPath, 'plugin.toml');
    const pkgPath = path.join(pluginPath, 'package.json');

    let manifest: PluginManifest;

    // Try plugin.toml first, then package.json
    try {
      const tomlContent = await fs.readFile(manifestPath, 'utf-8');
      manifest = this.parseTomlManifest(tomlContent);
    } catch {
      try {
        const pkgContent = await fs.readFile(pkgPath, 'utf-8');
        const pkg = JSON.parse(pkgContent);
        manifest = this.parsePackageManifest(pkg);
      } catch {
        throw new Error(`No plugin.toml or package.json found in ${pluginPath}`);
      }
    }

    // Validate manifest
    this.validateManifest(manifest);

    const plugin: LoadedPlugin = {
      manifest,
      path: pluginPath,
      enabled: true,
      registeredTools: [],
      registeredSkills: [],
      registeredCommands: [],
    };

    // Load plugin module
    try {
      const mainPath = path.join(pluginPath, manifest.main);
      const pluginModule = require(mainPath);

      if (typeof pluginModule.activate === 'function') {
        const ctx = this.createPluginContext(plugin);
        await pluginModule.activate(ctx);
      }

      // Register tools, skills, commands from manifest
      if (manifest.tools) {
        for (const tool of manifest.tools) {
          plugin.registeredTools.push(tool.name);
        }
      }
      if (manifest.skills) {
        for (const skill of manifest.skills) {
          this.skills.set(skill.id, skill);
          plugin.registeredSkills.push(skill.id);
        }
      }
      if (manifest.commands) {
        for (const cmd of manifest.commands) {
          this.commands.set(cmd.name, cmd);
          plugin.registeredCommands.push(cmd.name);
        }
      }
      if (manifest.agents) {
        for (const agent of manifest.agents) {
          this.agents.set(agent.name, agent);
        }
      }

      this.plugins.set(manifest.name, plugin);
      debug('Loaded plugin: %s v%s', manifest.name, manifest.version);
    } catch (err: any) {
      debug('Plugin %s activation failed: %s', manifest.name, err.message);
      // Still register the plugin but disabled
      plugin.enabled = false;
      this.plugins.set(manifest.name, plugin);
    }

    return plugin;
  }

  /**
   * List all loaded plugins
   */
  listPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get a plugin by name
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Enable/disable a plugin
   */
  setEnabled(name: string, enabled: boolean): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;
    plugin.enabled = enabled;
    return true;
  }

  /**
   * Get all registered tool handlers from plugins
   */
  getToolHandlers(): Map<string, (input: any) => Promise<any>> {
    return new Map(this.toolHandlers);
  }

  /**
   * Get all registered skills from plugins
   */
  getSkills(): PluginSkillDef[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get all registered agents from plugins
   */
  getAgents(): PluginAgentDef[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get all registered commands from plugins
   */
  getCommands(): PluginCommandDef[] {
    return Array.from(this.commands.values());
  }

  /**
   * Install a plugin from npm or local path
   */
  async install(source: string): Promise<LoadedPlugin> {
    const targetDir = this.pluginDirs[0]; // Install to user-level
    await fs.mkdir(targetDir, { recursive: true });

    if (source.startsWith('.') || source.startsWith('/')) {
      // Local path - copy
      const pluginName = path.basename(source);
      const dest = path.join(targetDir, pluginName);
      await this.copyDir(source, dest);
      return this.loadPlugin(dest);
    } else {
      // npm package - use npm install
      const { execSync } = require('child_process');
      const dest = path.join(targetDir, source.replace('/', '-'));
      await fs.mkdir(dest, { recursive: true });
      execSync(`npm install ${source} --prefix ${dest}`, { stdio: 'pipe' });
      return this.loadPlugin(dest);
    }
  }

  /**
   * Remove a plugin
   */
  async remove(name: string): Promise<boolean> {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;

    try {
      await fs.rm(plugin.path, { recursive: true, force: true });
      this.plugins.delete(name);
      // Clean up registered resources
      for (const tool of plugin.registeredTools) {
        this.toolHandlers.delete(tool);
      }
      for (const skill of plugin.registeredSkills) {
        this.skills.delete(skill);
      }
      for (const cmd of plugin.registeredCommands) {
        this.commands.delete(cmd);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get plugin status summary
   */
  getStatus(): { total: number; enabled: number; tools: number; skills: number; commands: number } {
    const all = Array.from(this.plugins.values());
    return {
      total: all.length,
      enabled: all.filter(p => p.enabled).length,
      tools: this.toolHandlers.size,
      skills: this.skills.size,
      commands: this.commands.size,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  private createPluginContext(plugin: LoadedPlugin): PluginContext {
    return {
      registerTool: (def, handler) => {
        this.toolHandlers.set(def.name, handler);
        plugin.registeredTools.push(def.name);
      },
      registerSkill: (def) => {
        this.skills.set(def.id, def);
        plugin.registeredSkills.push(def.id);
      },
      registerAgent: (def) => {
        this.agents.set(def.name, def);
      },
      registerCommand: (def) => {
        this.commands.set(def.name, def);
        plugin.registeredCommands.push(def.name);
      },
      getConfig: () => ({}),
      log: (msg) => debug('[%s] %s', plugin.manifest.name, msg),
    };
  }

  private parseTomlManifest(content: string): PluginManifest {
    const toml = require('toml');
    return toml.parse(content) as PluginManifest;
  }

  private parsePackageManifest(pkg: any): PluginManifest {
    return {
      name: pkg.name,
      version: pkg.version || '1.0.0',
      description: pkg.description || '',
      author: pkg.author,
      main: pkg.main || 'index.js',
      permissions: pkg.mimo?.permissions || { tools: [], files: ['*'], network: false, shell: false },
      tools: pkg.mimo?.tools,
      skills: pkg.mimo?.skills,
      agents: pkg.mimo?.agents,
      commands: pkg.mimo?.commands,
    };
  }

  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.name) throw new Error('Plugin manifest missing "name"');
    if (!manifest.version) throw new Error('Plugin manifest missing "version"');
    if (!manifest.main) throw new Error('Plugin manifest missing "main" entry point');
    if (!manifest.permissions) throw new Error('Plugin manifest missing "permissions"');
  }

  private async copyDir(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}
