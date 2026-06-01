import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as toml from 'toml';
import {
  MimoConfig,
  DEFAULT_CONFIG,
  AgentMode,
  ModelId,
  LocaleType,
  FeatureMaturity,
  validateConfig,
  CONFIG_KEY_MAP,
  getConfigValue,
  setConfigValue,
  parseConfigValue,
} from './schema';

const CONFIG_DIR = path.join(os.homedir(), '.mimo');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.toml');
const PROJECT_CONFIG_FILE = '.mimo/config.toml';

// ── Config Loading ─────────────────────────────────────────────────

/**
 * Load the full merged configuration from all sources.
 *
 * Precedence (lowest to highest):
 *   defaults < global TOML < project TOML < settings.json layers < CLI options < env vars
 */
export async function loadConfig(cliOptions: any = {}): Promise<MimoConfig> {
  const homeDir = os.homedir();
  const cwd = process.cwd();

  // 1. Load global TOML config
  let fileConfig: Partial<MimoConfig> = {};
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    try {
      fileConfig = toml.parse(raw);
    } catch (parseErr: any) {
      console.error(`Warning: Malformed TOML in ${CONFIG_FILE}: ${parseErr.message}`);
      console.error('Falling back to default config. Run "mimo init" to re-configure.');
    }
  } catch {
    // config file does not exist -- this is fine
  }

  // 2. Load project-level TOML config (.mimo/config.toml in project root)
  let projectConfig: Partial<MimoConfig> = {};
  const projectConfigPath = path.join(cwd, PROJECT_CONFIG_FILE);
  try {
    const raw = await fs.readFile(projectConfigPath, 'utf-8');
    try {
      projectConfig = toml.parse(raw);
    } catch (parseErr: any) {
      console.error(`Warning: Malformed TOML in ${projectConfigPath}: ${parseErr.message}`);
    }
  } catch {
    // project config does not exist -- this is fine
  }

  // 3. Load settings.json layers (Claude Code compatible)
  let settingsConfig: Record<string, any> = {};
  const settingsPaths = [
    path.join(homeDir, '.claude', 'settings.json'),
    path.join(homeDir, '.claude', 'settings.local.json'),
    path.join(homeDir, '.mimo', 'settings.json'),
    path.join(cwd, '.claude', 'settings.json'),
    path.join(cwd, '.claude', 'settings.local.json'),
    path.join(cwd, '.mimo', 'settings.json'),
  ];

  for (const p of settingsPaths) {
    try {
      const raw = await fs.readFile(p, 'utf-8');
      try {
        settingsConfig = deepMerge(settingsConfig, JSON.parse(raw));
      } catch {
        // skip malformed JSON
      }
    } catch {
      // file does not exist -- skip
    }
  }

  // 4. Merge: defaults < TOML < project TOML < settings.json < CLI < env vars
  let config = deepMerge(DEFAULT_CONFIG, fileConfig);
  config = deepMerge(config, projectConfig);

  // Map settings.json fields to MimoConfig
  if (settingsConfig.api?.model) config.api.model = settingsConfig.api.model;
  if (settingsConfig.agent?.mode) config.agent.mode = settingsConfig.agent.mode;
  if (settingsConfig.agent?.maxTurns) config.agent.maxTurns = settingsConfig.agent.maxTurns;
  if (settingsConfig.tools?.shellTimeout) config.tools.shellTimeout = settingsConfig.tools.shellTimeout;
  if (settingsConfig.promptCaching) {
    if (settingsConfig.promptCaching.enabled !== undefined) config.promptCaching.enabled = settingsConfig.promptCaching.enabled;
    if (settingsConfig.promptCaching.cacheTtl) config.promptCaching.cacheTtl = settingsConfig.promptCaching.cacheTtl;
  }
  if (settingsConfig.i18n?.locale) config.i18n.locale = settingsConfig.i18n.locale;
  if (settingsConfig.debug?.enabled !== undefined) config.debug.enabled = settingsConfig.debug.enabled;
  if (settingsConfig.features?.maturity) config.features.maturity = settingsConfig.features.maturity;

  // CLI option overrides
  if (cliOptions.model) config.api.model = cliOptions.model as ModelId;
  if (cliOptions.mode) config.agent.mode = cliOptions.mode as AgentMode;
  if (cliOptions.maxTurns) config.agent.maxTurns = parseInt(cliOptions.maxTurns, 10);
  if (cliOptions.stream === false) config.api.stream = false;
  if (cliOptions.locale) config.i18n.locale = cliOptions.locale as LocaleType;

  // Environment variable overrides
  if (process.env.MIMO_MODEL) config.api.model = process.env.MIMO_MODEL as ModelId;
  if (process.env.MIMO_MODE) config.agent.mode = process.env.MIMO_MODE as AgentMode;
  if (process.env.MIMO_LOCALE) config.i18n.locale = process.env.MIMO_LOCALE as LocaleType;
  if (process.env.MIMO_DEBUG === '1' || process.env.MIMO_DEBUG === 'true') {
    config.debug.enabled = true;
  }

  // Validate the merged config and warn about issues
  const errors = validateConfig(config);
  if (errors.length > 0) {
    for (const err of errors) {
      console.error(`Config warning [${err.path}]: ${err.message}`);
    }
  }

  return config;
}

// Settings Loading

/** Get the full merged settings (for hooks and other subsystems). */
export async function loadMergedSettings(): Promise<Record<string, any>> {
  const homeDir = os.homedir();
  const cwd = process.cwd();

  const paths = [
    path.join(homeDir, '.claude', 'settings.json'),
    path.join(homeDir, '.claude', 'settings.local.json'),
    path.join(homeDir, '.mimo', 'settings.json'),
    path.join(cwd, '.claude', 'settings.json'),
    path.join(cwd, '.claude', 'settings.local.json'),
    path.join(cwd, '.mimo', 'settings.json'),
  ];

  let merged: Record<string, any> = {};
  for (const p of paths) {
    try {
      const raw = await fs.readFile(p, 'utf-8');
      try {
        merged = deepMerge(merged, JSON.parse(raw));
      } catch {
        // skip malformed JSON
      }
    } catch {
      // file does not exist -- skip
    }
  }

  return merged;
}

// ── Config Save ────────────────────────────────────────────────────

export async function saveConfig(config: Partial<MimoConfig>): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  const content = serializeToml(config);
  await fs.writeFile(CONFIG_FILE, content, 'utf-8');
}

// ── Config Migration (v1 -> v2) ────────────────────────────────────

/**
 * Migrate a v1 config to v2 format.
 *
 * Adds the new fields with their defaults while preserving all existing values.
 * The migrated config is saved and the original is backed up.
 */
export async function migrateConfig(): Promise<{ migrated: boolean; message: string }> {
  let rawConfig: Record<string, any>;

  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    rawConfig = toml.parse(raw);
  } catch {
    return { migrated: false, message: 'No config file found to migrate.' };
  }

  // Check if already v2
  if (rawConfig.version && rawConfig.version >= 2) {
    return { migrated: false, message: 'Config is already v2. No migration needed.' };
  }

  // Back up the v1 config
  const backupPath = CONFIG_FILE + '.v1.bak';
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    await fs.writeFile(backupPath, raw, 'utf-8');
  } catch {
    // If backup fails, proceed anyway
  }

  // Build config by merging raw data with defaults
  const rawConfigPartial = rawConfig as Partial<MimoConfig>;

  // Ensure nested objects exist before merging
  const configAdditions: Partial<MimoConfig> = {
    version: 2,
    i18n: {
      locale: 'zh-CN' as LocaleType,
    },
    debug: {
      enabled: false,
    },
    features: {
      ...(rawConfigPartial.features || { enabled: true, disabledFeatures: [] }),
      maturity: 'stable' as FeatureMaturity,
    },
  };

  const migrated = deepMerge(DEFAULT_CONFIG, deepMerge(rawConfigPartial, configAdditions));

  // Save the migrated config
  await saveConfig(migrated);

  return {
    migrated: true,
    message: `Config migrated from v1 to v2. Backup saved to ${backupPath}`,
  };
}

// ── Config Get/Set Commands ────────────────────────────────────────

/**
 * Get a config value by dot-separated key path.
 * Returns the value and its description.
 */
export async function configGet(keyPath: string): Promise<{ value: unknown; description: string }> {
  const keyInfo = CONFIG_KEY_MAP[keyPath];
  if (!keyInfo) {
    const available = Object.keys(CONFIG_KEY_MAP).join(', ');
    throw new Error(`Unknown config key: "${keyPath}".\nAvailable keys: ${available}`);
  }

  const config = await loadConfig();
  const value = getConfigValue(config, keyPath);

  return { value, description: keyInfo.description };
}

/**
 * Set a config value by dot-separated key path.
 * Validates the key and value, merges into existing config, and saves.
 */
export async function configSet(keyPath: string, rawValue: string): Promise<{ key: string; value: unknown; description: string }> {
  const keyInfo = CONFIG_KEY_MAP[keyPath];
  if (!keyInfo) {
    const available = Object.keys(CONFIG_KEY_MAP).join(', ');
    throw new Error(`Unknown config key: "${keyPath}".\nAvailable keys: ${available}`);
  }

  const value = parseConfigValue(keyPath, rawValue);

  // Load current config, set the value, validate, then save
  const config = await loadConfig();
  const updated = setConfigValue(config, keyPath, value);

  // Validate the updated config
  const errors = validateConfig(updated);
  if (errors.length > 0) {
    const errorMessages = errors.map(e => `  [${e.path}] ${e.message}`).join('\n');
    throw new Error(`Validation failed:\n${errorMessages}`);
  }

  await saveConfig(updated);

  return { key: keyPath, value, description: keyInfo.description };
}

/**
 * List all available config keys with their current values and descriptions.
 */
export async function configList(): Promise<Array<{ key: string; value: unknown; description: string; type: string }>> {
  const config = await loadConfig();
  const results: Array<{ key: string; value: unknown; description: string; type: string }> = [];

  for (const [key, info] of Object.entries(CONFIG_KEY_MAP)) {
    const value = getConfigValue(config, key);
    results.push({ key, value, description: info.description, type: info.type });
  }

  return results;
}

// ── TOML Serialization ─────────────────────────────────────────────

function serializeToml(obj: any, prefix = ''): string {
  const lines: string[] = [];
  const sections: Array<{ key: string; value: any }> = [];

  // First: emit primitive values
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      // Skip empty objects
      if (Object.keys(value).length === 0) continue;
      sections.push({ key, value });
    } else {
      const line = serializeValue(key, value);
      if (line) lines.push(line);
    }
  }

  // Then: emit nested objects as [table] sections
  for (const { key, value } of sections) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const nested = serializeToml(value, fullKey);
    if (nested.trim()) {
      lines.push('');
      lines.push(`[${fullKey}]`);
      lines.push(nested);
    }
  }

  return lines.join('\n');
}

function serializeTomlString(value: string): string {
  const hasNewline = value.includes('\n');
  const hasTab = value.includes('\t');
  const hasControlChars = /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);

  if (hasNewline || hasTab || hasControlChars) {
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t')
      .replace(/\r/g, '\\r')
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, (ch) => {
        const hex = ch.charCodeAt(0).toString(16).padStart(2, '0');
        return `\\u00${hex}`;
      });
    return `"${escaped}"`;
  }

  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function serializeValue(key: string, value: any): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') {
    return `${key} = ${serializeTomlString(value)}`;
  }
  if (typeof value === 'boolean') {
    return `${key} = ${value}`;
  }
  if (typeof value === 'number') {
    if (!isFinite(value)) return '';
    return `${key} = ${value}`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return `${key} = []`;
    const items = value.map((v) => {
      if (v === undefined || v === null) return null;
      if (typeof v === 'string') return serializeTomlString(v);
      if (typeof v === 'boolean' || typeof v === 'number') {
        return isFinite(v as number) ? String(v) : null;
      }
      return null;
    }).filter((v): v is string => v !== null);
    return `${key} = [${items.join(', ')}]`;
  }
  return '';
}

// ── Deep Merge ─────────────────────────────────────────────────────

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source || {})) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      (!target[key] || typeof target[key] !== 'object')
    ) {
      result[key] = deepMerge({}, source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}
