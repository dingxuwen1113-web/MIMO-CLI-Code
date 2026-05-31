/**
 * MIMO CLI Code - Plugin Loader
 * Scans plugin directories, reads manifests, dynamically imports modules,
 * validates schemas, and supports hot-reload via fs.watch.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'yaml';
import { PluginManifest, PluginModule, LoadedPlugin } from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_PLUGIN_TYPES = [
  'provider', 'tool', 'search', 'memory', 'browser', 'media', 'platform', 'composite',
] as const;

const MANIFEST_FILE = 'plugin.yaml';

// ─── Error Types ─────────────────────────────────────────────────────────────

export class PluginLoadError extends Error {
  constructor(
    public readonly pluginPath: string,
    message: string,
    public readonly cause?: Error,
  ) {
    super(`Failed to load plugin at "${pluginPath}": ${message}`);
    this.name = 'PluginLoadError';
  }
}

export class ManifestValidationError extends Error {
  constructor(
    public readonly pluginPath: string,
    public readonly field: string,
    message: string,
  ) {
    super(`Invalid manifest in "${pluginPath}": field "${field}" ${message}`);
    this.name = 'ManifestValidationError';
  }
}

// ─── Plugin Scan Result ─────────────────────────────────────────────────────

export interface PluginScanResult {
  loaded: LoadedPlugin[];
  errors: Array<{ pluginPath: string; error: Error }>;
}

// ─── Core Loader Class ──────────────────────────────────────────────────────

export class PluginLoader {
  private globalPluginsDir: string;
  private localPluginsDir: string;
  private watchHandlers: Map<string, fs.FSWatcher> = new Map();
  private reloadCallbacks: Array<(plugin: LoadedPlugin) => void> = [];
  private configProvider: (pluginName: string) => Record<string, unknown>;

  constructor(
    projectRoot: string,
    configProvider?: (pluginName: string) => Record<string, unknown>,
  ) {
    this.globalPluginsDir = path.join(os.homedir(), '.mimo', 'plugins');
    this.localPluginsDir = path.join(projectRoot, '.mimo', 'plugins');
    this.configProvider = configProvider ?? (() => ({}));
  }

  /**
   * Returns the two plugin directories that are scanned.
   */
  get scanDirectories(): string[] {
    return [this.globalPluginsDir, this.localPluginsDir];
  }

  /**
   * Register a callback that fires whenever a watched plugin is reloaded.
   */
  onReload(callback: (plugin: LoadedPlugin) => void): void {
    this.reloadCallbacks.push(callback);
  }

  /**
   * Scan both plugin directories, load all valid plugins, and return results.
   */
  async scanAll(): Promise<PluginScanResult> {
    const result: PluginScanResult = { loaded: [], errors: [] };

    for (const dir of this.scanDirectories) {
      const dirResult = await this.scanDirectory(dir);
      result.loaded.push(...dirResult.loaded);
      result.errors.push(...dirResult.errors);
    }

    return result;
  }

  /**
   * Scan a single directory for plugin sub-folders.
   * Each sub-folder must contain a plugin.yaml manifest.
   */
  async scanDirectory(dirPath: string): Promise<PluginScanResult> {
    const result: PluginScanResult = { loaded: [], errors: [] };

    let entries: string[];
    try {
      entries = await fs.promises.readdir(dirPath, { withFileTypes: false }) as string[];
    } catch (err: unknown) {
      // Directory does not exist or is not readable — not an error, just skip.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return result;
      }
      result.errors.push({
        pluginPath: dirPath,
        error: new PluginLoadError(dirPath, 'Cannot read directory', err as Error),
      });
      return result;
    }

    // Re-read with Dirent to filter directories only.
    let dirents: fs.Dirent[];
    try {
      dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
    } catch {
      return result;
    }

    const loadPromises = dirents
      .filter(d => d.isDirectory())
      .map(d => this.loadPlugin(path.join(dirPath, d.name)));

    const outcomes = await Promise.allSettled(loadPromises);

    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled') {
        result.loaded.push(outcome.value);
      } else {
        result.errors.push({
          pluginPath: dirPath,
          error: outcome.reason instanceof Error ? outcome.reason : new Error(String(outcome.reason)),
        });
      }
    }

    return result;
  }

  /**
   * Load a single plugin from its directory path.
   * Reads plugin.yaml, validates it, dynamically imports the entry module,
   * and returns a LoadedPlugin descriptor.
   */
  async loadPlugin(pluginDir: string): Promise<LoadedPlugin> {
    // 1. Read and parse manifest
    const manifestPath = path.join(pluginDir, MANIFEST_FILE);
    let manifestRaw: string;
    try {
      manifestRaw = await fs.promises.readFile(manifestPath, 'utf-8');
    } catch (err: unknown) {
      throw new PluginLoadError(
        pluginDir,
        `Cannot read ${MANIFEST_FILE}`,
        err as Error,
      );
    }

    let manifestData: unknown;
    try {
      manifestData = yaml.parse(manifestRaw);
    } catch (err: unknown) {
      throw new PluginLoadError(
        pluginDir,
        `Malformed YAML in ${MANIFEST_FILE}`,
        err as Error,
      );
    }

    // 2. Validate manifest
    const manifest = this.validateManifest(pluginDir, manifestData as Record<string, unknown>);

    // 3. Resolve and import entry module
    const entryPath = path.resolve(pluginDir, manifest.entry);
    let moduleExports: Record<string, unknown>;
    try {
      moduleExports = await import(entryPath);
    } catch (err: unknown) {
      throw new PluginLoadError(
        pluginDir,
        `Cannot import entry module "${manifest.entry}"`,
        err as Error,
      );
    }

    // 4. Build PluginModule from the exported interface
    const pluginModule: PluginModule = {
      manifest,
      init: typeof moduleExports['init'] === 'function'
        ? (moduleExports['init'] as PluginModule['init'])
        : undefined,
      getTools: typeof moduleExports['getTools'] === 'function'
        ? (moduleExports['getTools'] as PluginModule['getTools'])
        : undefined,
      getSkills: typeof moduleExports['getSkills'] === 'function'
        ? (moduleExports['getSkills'] as PluginModule['getSkills'])
        : undefined,
      cleanup: typeof moduleExports['cleanup'] === 'function'
        ? (moduleExports['cleanup'] as PluginModule['cleanup'])
        : undefined,
    };

    const loaded: LoadedPlugin = {
      manifest,
      module: pluginModule,
      path: pluginDir,
      enabled: true,
      loadedAt: new Date(),
    };

    return loaded;
  }

  /**
   * Enable hot-reload for a loaded plugin directory.
   * Watches the plugin.yaml and entry file for changes and re-loads on modification.
   */
  watchPlugin(pluginDir: string): void {
    if (this.watchHandlers.has(pluginDir)) {
      return; // Already watching
    }

    try {
      const watcher = fs.watch(pluginDir, { recursive: false }, async (eventType, filename) => {
        if (!filename) return;

        // Only react to changes in manifest or entry files
        const relevantFiles = [MANIFEST_FILE, 'index.ts', 'index.js', 'index.mjs'];
        if (!relevantFiles.includes(filename)) {
          return;
        }

        try {
          const reloaded = await this.loadPlugin(pluginDir);
          for (const cb of this.reloadCallbacks) {
            cb(reloaded);
          }
        } catch (err: unknown) {
          // On reload failure, notify via callbacks with error info
          const errorPlugin: LoadedPlugin = {
            manifest: { name: path.basename(pluginDir), version: '0.0.0', description: '', type: 'tool', entry: '' },
            module: { manifest: { name: path.basename(pluginDir), version: '0.0.0', description: '', type: 'tool', entry: '' } },
            path: pluginDir,
            enabled: false,
            loadedAt: new Date(),
            error: err instanceof Error ? err.message : String(err),
          };
          for (const cb of this.reloadCallbacks) {
            cb(errorPlugin);
          }
        }
      });

      this.watchHandlers.set(pluginDir, watcher);
    } catch (err: unknown) {
      // fs.watch may fail on some platforms — degrade gracefully
      console.warn(`[PluginLoader] Cannot watch "${pluginDir}":`, err);
    }
  }

  /**
   * Stop watching a plugin directory.
   */
  unwatchPlugin(pluginDir: string): void {
    const watcher = this.watchHandlers.get(pluginDir);
    if (watcher) {
      watcher.close();
      this.watchHandlers.delete(pluginDir);
    }
  }

  /**
   * Stop all file watchers.
   */
  unwatchAll(): void {
    for (const [dir, watcher] of this.watchHandlers) {
      watcher.close();
    }
    this.watchHandlers.clear();
  }

  // ─── Manifest Validation ─────────────────────────────────────────────────

  /**
   * Validate a parsed manifest object against the PluginManifest schema.
   * Returns a fully typed PluginManifest or throws ManifestValidationError.
   */
  validateManifest(pluginPath: string, raw: Record<string, unknown>): PluginManifest {
    if (typeof raw !== 'object' || raw === null) {
      throw new ManifestValidationError(pluginPath, '(root)', 'must be a YAML object');
    }

    // Required fields
    const name = raw['name'];
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new ManifestValidationError(pluginPath, 'name', 'must be a non-empty string');
    }

    const version = raw['version'];
    if (typeof version !== 'string' || !this.isValidSemver(version)) {
      throw new ManifestValidationError(pluginPath, 'version', 'must be a valid semver string (e.g. "1.0.0")');
    }

    const description = raw['description'];
    if (typeof description !== 'string') {
      throw new ManifestValidationError(pluginPath, 'description', 'must be a string');
    }

    const type = raw['type'];
    if (!VALID_PLUGIN_TYPES.includes(type as typeof VALID_PLUGIN_TYPES[number])) {
      throw new ManifestValidationError(
        pluginPath,
        'type',
        `must be one of: ${VALID_PLUGIN_TYPES.join(', ')}`,
      );
    }

    const entry = raw['entry'];
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new ManifestValidationError(pluginPath, 'entry', 'must be a non-empty string');
    }

    // Optional fields with validation
    if (raw['author'] !== undefined && typeof raw['author'] !== 'string') {
      throw new ManifestValidationError(pluginPath, 'author', 'must be a string if provided');
    }

    if (raw['tools'] !== undefined) {
      if (!Array.isArray(raw['tools'])) {
        throw new ManifestValidationError(pluginPath, 'tools', 'must be an array');
      }
      for (let i = 0; i < raw['tools'].length; i++) {
        const tool = raw['tools'][i] as Record<string, unknown>;
        if (typeof tool['name'] !== 'string') {
          throw new ManifestValidationError(pluginPath, `tools[${i}].name`, 'must be a string');
        }
        if (typeof tool['description'] !== 'string') {
          throw new ManifestValidationError(pluginPath, `tools[${i}].description`, 'must be a string');
        }
      }
    }

    if (raw['skills'] !== undefined) {
      if (!Array.isArray(raw['skills'])) {
        throw new ManifestValidationError(pluginPath, 'skills', 'must be an array');
      }
      for (let i = 0; i < raw['skills'].length; i++) {
        const skill = raw['skills'][i] as Record<string, unknown>;
        if (typeof skill['id'] !== 'string') {
          throw new ManifestValidationError(pluginPath, `skills[${i}].id`, 'must be a string');
        }
        if (!Array.isArray(skill['triggers'])) {
          throw new ManifestValidationError(pluginPath, `skills[${i}].triggers`, 'must be an array');
        }
      }
    }

    if (raw['dependencies'] !== undefined) {
      if (!Array.isArray(raw['dependencies'])) {
        throw new ManifestValidationError(pluginPath, 'dependencies', 'must be an array');
      }
    }

    if (raw['minVersion'] !== undefined && typeof raw['minVersion'] !== 'string') {
      throw new ManifestValidationError(pluginPath, 'minVersion', 'must be a string');
    }

    // Build the typed manifest
    const manifest: PluginManifest = {
      name: name as string,
      version: version as string,
      description: description as string,
      author: raw['author'] as string | undefined,
      type: type as PluginManifest['type'],
      entry: entry as string,
      tools: raw['tools'] as PluginManifest['tools'],
      skills: raw['skills'] as PluginManifest['skills'],
      config: raw['config'] as PluginManifest['config'],
      dependencies: raw['dependencies'] as string[] | undefined,
      minVersion: raw['minVersion'] as string | undefined,
    };

    return manifest;
  }

  /**
   * Loose semver check — accepts "x.y.z" with optional pre-release suffix.
   */
  private isValidSemver(v: string): boolean {
    return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(v);
  }
}
