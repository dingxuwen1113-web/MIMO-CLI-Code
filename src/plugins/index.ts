/**
 * MIMO CLI Code - Plugin Architecture
 *
 * Public API surface for the plugin system.
 *
 * Usage:
 *   import { PluginLoader, PluginRegistry } from './plugins';
 *
 *   const loader = new PluginLoader(process.cwd());
 *   const registry = new PluginRegistry(loader);
 *   await registry.discoverAndLoad();
 *   await registry.initializeAll();
 *
 *   // Use aggregated tools / skills
 *   const tools  = registry.getTools();
 *   const skills = registry.getSkills();
 *
 *   // Shutdown
 *   await registry.cleanupAll();
 */

// ─── Type Re-exports ────────────────────────────────────────────────────────

export type {
  PluginManifest,
  PluginModule,
  PluginTool,
  PluginSkill,
  LoadedPlugin,
} from './types';

// ─── Loader ─────────────────────────────────────────────────────────────────

export {
  PluginLoader,
  PluginLoadError,
  ManifestValidationError,
} from './loader';

export type {
  PluginScanResult,
} from './loader';

// ─── Registry ───────────────────────────────────────────────────────────────

export {
  PluginRegistry,
} from './registry';

export type {
  PluginEventType,
  PluginEvent,
  ConflictReport,
} from './registry';
