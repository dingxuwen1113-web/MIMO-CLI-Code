import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as toml from 'toml';
import { MimoConfig, DEFAULT_CONFIG, ApiMode, AgentMode, ModelId, validateConfig } from './schema';

const CONFIG_DIR = path.join(os.homedir(), '.mimo');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.toml');

export async function loadConfig(cliOptions: any = {}): Promise<MimoConfig> {
  const homeDir = os.homedir();
  const cwd = process.cwd();

  // 1. 加载 TOML 配置（传统）
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
    // 配置文件不存在 — this is fine
  }

  // 2. 加载 settings.json 层级（Claude Code 兼容）
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
      // file doesn't exist — skip
    }
  }

  // 3. 合并：默认 < TOML < settings.json < CLI < 环境变量
  let config = deepMerge(DEFAULT_CONFIG, fileConfig);

  // 从 settings.json 映射到 MimoConfig
  if (settingsConfig.api?.model) config.api.model = settingsConfig.api.model;
  if (settingsConfig.agent?.mode) config.agent.mode = settingsConfig.agent.mode;
  if (settingsConfig.agent?.maxTurns) config.agent.maxTurns = settingsConfig.agent.maxTurns;
  if (settingsConfig.tools?.shellTimeout) config.tools.shellTimeout = settingsConfig.tools.shellTimeout;
  if (settingsConfig.promptCaching) {
    if (settingsConfig.promptCaching.enabled !== undefined) config.promptCaching.enabled = settingsConfig.promptCaching.enabled;
    if (settingsConfig.promptCaching.cacheTtl) config.promptCaching.cacheTtl = settingsConfig.promptCaching.cacheTtl;
  }

  // CLI 参数覆盖
  if (cliOptions.model) config.api.model = cliOptions.model as ModelId;
  if (cliOptions.mode) config.agent.mode = cliOptions.mode as AgentMode;
  if (cliOptions.apiMode) config.api.mode = cliOptions.apiMode as ApiMode;
  if (cliOptions.maxTurns) config.agent.maxTurns = parseInt(cliOptions.maxTurns, 10);
  if (cliOptions.stream === false) config.api.stream = false;

  // 环境变量覆盖（仅非空值）
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim()) {
    if (config.api.mode === 'token-plan') {
      config.api.tokenPlan.apiKey = process.env.ANTHROPIC_API_KEY;
    } else {
      config.api.payAsYouGo.apiKey = process.env.ANTHROPIC_API_KEY;
    }
  }
  if (process.env.MIMO_MODEL) config.api.model = process.env.MIMO_MODEL as ModelId;
  if (process.env.MIMO_MODE) config.agent.mode = process.env.MIMO_MODE as AgentMode;
  if (process.env.ANTHROPIC_BASE_URL && process.env.ANTHROPIC_BASE_URL.trim()) {
    config.api.payAsYouGo.baseUrl = process.env.ANTHROPIC_BASE_URL;
    config.api.tokenPlan.baseUrl = process.env.ANTHROPIC_BASE_URL;
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

// 获取完整的合并 settings（供 hooks 等子系统使用）
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
      // file doesn't exist — skip
    }
  }

  return merged;
}

export async function saveConfig(config: Partial<MimoConfig>): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  const content = serializeToml(config);
  await fs.writeFile(CONFIG_FILE, content, 'utf-8');
}

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

  // Then: emit nested objects as [table] sections at the same level
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
  // Check if we need a basic string or literal string
  const hasNewline = value.includes('\n');
  const hasTab = value.includes('\t');
  const hasBackslash = value.includes('\\');
  const hasDoubleQuote = value.includes('"');
  const hasControlChars = /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);

  if (hasNewline || hasTab || hasControlChars) {
    // Use multi-line basic string for values with newlines/tabs/control chars
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

  // Simple escaping for regular strings
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
      // Source is an object but target is missing or not an object —
      // merge with empty object to preserve nested structure
      result[key] = deepMerge({}, source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}
