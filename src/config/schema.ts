// ── Configuration Type Definitions & Zod Schemas ──────────────────

import { z } from 'zod';

// ── Enums / Literal Types ──────────────────────────────────────────

export type AgentMode = 'plan' | 'agent' | 'custom' | 'yolo';
export type ModelId = 'mimo-v2.5-pro' | 'mimo-v2.5' | 'auto';
export type LocaleType = 'zh-CN' | 'en-US';
export type FeatureMaturity = 'stable' | 'beta' | 'experimental';

const VALID_AGENT_MODES: AgentMode[] = ['plan', 'agent', 'custom', 'yolo'];
const VALID_MODEL_IDS: ModelId[] = ['mimo-v2.5-pro', 'mimo-v2.5', 'auto'];
const VALID_LOCALES: LocaleType[] = ['zh-CN', 'en-US'];
const VALID_MATURITY_LEVELS: FeatureMaturity[] = ['stable', 'beta', 'experimental'];

// ── Zod Schemas ────────────────────────────────────────────────────

export const LocaleSchema = z.enum(['zh-CN', 'en-US']);
export const FeatureMaturitySchema = z.enum(['stable', 'beta', 'experimental']);
export const AgentModeSchema = z.enum(['plan', 'agent', 'custom', 'yolo']);
export const ModelIdSchema = z.enum(['mimo-v2.5-pro', 'mimo-v2.5', 'auto']);

export const ApiConfigSchema = z.object({
  model: ModelIdSchema.default('auto'),
  stream: z.boolean().default(true),
  maxTokens: z.number().int().min(1).default(200000),  // 最大200K tokens
  maxContextTokens: z.number().int().min(1).default(200000),  // 最大上下文窗口
}).strict();

export const AgentConfigSchema = z.object({
  mode: AgentModeSchema.default('agent'),
  maxTurns: z.number().int().min(1).default(1000),  // 最大1000轮
  maxToolCalls: z.number().int().min(1).default(1000),  // 最大1000次工具调用
  autoApproveReads: z.boolean().default(true),
}).strict();

export const ToolConfigSchema = z.object({
  shellTimeout: z.number().min(0).finite().default(30000),
  allowedCommands: z.array(z.string()).default([]),
  blockedCommands: z.array(z.string()).default(['rm -rf /', 'sudo rm -rf']),
}).strict();

export const SandboxConfigSchema = z.object({
  enabled: z.boolean().default(true),
  tmpDir: z.string().default('/tmp/mimo-sandbox'),
}).strict();

export const PromptCachingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  cacheTtl: z.number().min(0).finite().default(300),
}).strict();

export const FeaturesConfigSchema = z.object({
  enabled: z.boolean().default(true),
  disabledFeatures: z.array(z.string()).default([]),
  maturity: FeatureMaturitySchema.default('stable'),
}).strict();

export const I18nConfigSchema = z.object({
  locale: LocaleSchema.default('zh-CN'),
}).strict();

export const DebugConfigSchema = z.object({
  enabled: z.boolean().default(false),
}).strict();

export const MimoConfigSchema = z.object({
  version: z.number().int().min(1).default(2),
  api: ApiConfigSchema.default({}),
  agent: AgentConfigSchema.default({}),
  tools: ToolConfigSchema.default({}),
  sandbox: SandboxConfigSchema.default({}),
  promptCaching: PromptCachingConfigSchema.default({}),
  features: FeaturesConfigSchema.default({}),
  i18n: I18nConfigSchema.default({}),
  debug: DebugConfigSchema.default({}),
}).strict();

// ── TypeScript Interfaces (derived from zod schemas) ──────────────

export type ApiConfig = z.infer<typeof ApiConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type ToolConfig = z.infer<typeof ToolConfigSchema>;
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;
export type PromptCachingConfig = z.infer<typeof PromptCachingConfigSchema>;
export type FeaturesConfig = z.infer<typeof FeaturesConfigSchema>;
export type I18nConfig = z.infer<typeof I18nConfigSchema>;
export type DebugConfig = z.infer<typeof DebugConfigSchema>;
export type MimoConfig = z.infer<typeof MimoConfigSchema>;

// ── Default Config (built from zod schema defaults) ───────────────

export const DEFAULT_CONFIG: MimoConfig = MimoConfigSchema.parse({});

// ── Validation helpers (zod-based) ────────────────────────────────

export interface ValidationError {
  path: string;
  message: string;
}

/**
 * Validate the full MimoConfig, returning an array of errors.
 */
export function validateConfig(config: Partial<MimoConfig>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (config.api) {
    errors.push(...validateApiConfig(config.api));
  }
  if (config.agent) {
    errors.push(...validateAgentConfig(config.agent));
  }
  if (config.tools) {
    errors.push(...validateToolConfig(config.tools));
  }
  if (config.sandbox) {
    errors.push(...validateSandboxConfig(config.sandbox));
  }
  if (config.promptCaching) {
    errors.push(...validatePromptCachingConfig(config.promptCaching));
  }
  if (config.features) {
    errors.push(...validateFeaturesConfig(config.features));
  }
  if (config.i18n) {
    errors.push(...validateI18nConfig(config.i18n));
  }
  if (config.debug) {
    errors.push(...validateDebugConfig(config.debug));
  }

  return errors;
}

export function validateApiConfig(api: Partial<ApiConfig>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (api.model !== undefined && !VALID_MODEL_IDS.includes(api.model)) {
    errors.push({ path: 'api.model', message: `Invalid model "${api.model}". Must be one of: ${VALID_MODEL_IDS.join(', ')}` });
  }
  if (api.stream !== undefined && typeof api.stream !== 'boolean') {
    errors.push({ path: 'api.stream', message: 'Must be a boolean' });
  }

  return errors;
}

export function validateAgentConfig(agent: Partial<AgentConfig>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (agent.mode !== undefined && !VALID_AGENT_MODES.includes(agent.mode)) {
    errors.push({ path: 'agent.mode', message: `Invalid agent mode "${agent.mode}". Must be one of: ${VALID_AGENT_MODES.join(', ')}` });
  }
  if (agent.maxTurns !== undefined) {
    if (typeof agent.maxTurns !== 'number' || !Number.isInteger(agent.maxTurns) || agent.maxTurns < 1) {
      errors.push({ path: 'agent.maxTurns', message: 'Must be a positive integer' });
    }
  }
  if (agent.autoApproveReads !== undefined && typeof agent.autoApproveReads !== 'boolean') {
    errors.push({ path: 'agent.autoApproveReads', message: 'Must be a boolean' });
  }

  return errors;
}

export function validateToolConfig(tools: Partial<ToolConfig>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (tools.shellTimeout !== undefined) {
    if (typeof tools.shellTimeout !== 'number' || !isFinite(tools.shellTimeout) || tools.shellTimeout < 0) {
      errors.push({ path: 'tools.shellTimeout', message: 'Must be a non-negative finite number' });
    }
  }
  if (tools.allowedCommands !== undefined && !Array.isArray(tools.allowedCommands)) {
    errors.push({ path: 'tools.allowedCommands', message: 'Must be an array of strings' });
  }
  if (tools.blockedCommands !== undefined && !Array.isArray(tools.blockedCommands)) {
    errors.push({ path: 'tools.blockedCommands', message: 'Must be an array of strings' });
  }

  return errors;
}

export function validateSandboxConfig(sandbox: Partial<SandboxConfig>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (sandbox.enabled !== undefined && typeof sandbox.enabled !== 'boolean') {
    errors.push({ path: 'sandbox.enabled', message: 'Must be a boolean' });
  }
  if (sandbox.tmpDir !== undefined && typeof sandbox.tmpDir !== 'string') {
    errors.push({ path: 'sandbox.tmpDir', message: 'Must be a string' });
  }

  return errors;
}

export function validatePromptCachingConfig(pc: Partial<PromptCachingConfig>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (pc.enabled !== undefined && typeof pc.enabled !== 'boolean') {
    errors.push({ path: 'promptCaching.enabled', message: 'Must be a boolean' });
  }
  if (pc.cacheTtl !== undefined) {
    if (typeof pc.cacheTtl !== 'number' || !isFinite(pc.cacheTtl) || pc.cacheTtl < 0) {
      errors.push({ path: 'promptCaching.cacheTtl', message: 'Must be a non-negative finite number' });
    }
  }

  return errors;
}

export function validateFeaturesConfig(features: Partial<FeaturesConfig>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (features.enabled !== undefined && typeof features.enabled !== 'boolean') {
    errors.push({ path: 'features.enabled', message: 'Must be a boolean' });
  }
  if (features.disabledFeatures !== undefined && !Array.isArray(features.disabledFeatures)) {
    errors.push({ path: 'features.disabledFeatures', message: 'Must be an array of strings' });
  }
  if (features.maturity !== undefined && !VALID_MATURITY_LEVELS.includes(features.maturity)) {
    errors.push({ path: 'features.maturity', message: `Invalid maturity level "${features.maturity}". Must be one of: ${VALID_MATURITY_LEVELS.join(', ')}` });
  }

  return errors;
}

export function validateI18nConfig(i18n: Partial<I18nConfig>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (i18n.locale !== undefined && !VALID_LOCALES.includes(i18n.locale)) {
    errors.push({ path: 'i18n.locale', message: `Invalid locale "${i18n.locale}". Must be one of: ${VALID_LOCALES.join(', ')}` });
  }

  return errors;
}

export function validateDebugConfig(debug: Partial<DebugConfig>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (debug.enabled !== undefined && typeof debug.enabled !== 'boolean') {
    errors.push({ path: 'debug.enabled', message: 'Must be a boolean' });
  }

  return errors;
}

// ── Flat-key accessors for config get/set ─────────────────────────

export const CONFIG_KEY_MAP: Record<string, { description: string; type: 'string' | 'number' | 'boolean' }> = {
  // API section
  'api.model':           { description: 'Default model (mimo-v2.5-pro | mimo-v2.5 | auto)', type: 'string' },
  'api.stream':          { description: 'Enable streaming responses', type: 'boolean' },
  // Agent section
  'agent.mode':             { description: 'Agent mode (plan | agent | yolo)', type: 'string' },
  'agent.maxTurns':         { description: 'Max agent turns', type: 'number' },
  'agent.autoApproveReads': { description: 'Auto-approve read operations', type: 'boolean' },
  // Tools section
  'tools.shellTimeout':     { description: 'Shell command timeout (ms)', type: 'number' },
  // Sandbox section
  'sandbox.enabled':        { description: 'Enable sandbox mode', type: 'boolean' },
  'sandbox.tmpDir':         { description: 'Sandbox temp directory', type: 'string' },
  // Prompt caching section
  'promptCaching.enabled':  { description: 'Enable prompt caching', type: 'boolean' },
  'promptCaching.cacheTtl': { description: 'Cache TTL in seconds', type: 'number' },
  // Features section
  'features.enabled':        { description: 'Enable features system', type: 'boolean' },
  'features.maturity':       { description: 'Feature maturity filter (stable | beta | experimental)', type: 'string' },
  // i18n section
  'i18n.locale':            { description: 'UI locale (zh-CN | en-US)', type: 'string' },
  // Debug section
  'debug.enabled':          { description: 'Enable debug logging', type: 'boolean' },
};

/**
 * Get a nested value from a config object by dot-separated key path.
 */
export function getConfigValue(config: MimoConfig, keyPath: string): unknown {
  const parts = keyPath.split('.');
  let current: any = config;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Set a nested value in a config object by dot-separated key path.
 * Returns a new config object (immutable).
 */
export function setConfigValue(config: MimoConfig, keyPath: string, value: unknown): MimoConfig {
  const parts = keyPath.split('.');
  const result = JSON.parse(JSON.stringify(config)); // deep clone
  let current: any = result;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === undefined || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
  return result;
}

/**
 * Parse a string value to the appropriate type for a config key.
 */
export function parseConfigValue(keyPath: string, rawValue: string): unknown {
  const keyInfo = CONFIG_KEY_MAP[keyPath];
  if (!keyInfo) {
    throw new Error(`Unknown config key: ${keyPath}. Use "mimo config list" to see available keys.`);
  }

  switch (keyInfo.type) {
    case 'boolean': {
      const lower = rawValue.toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 'yes') return true;
      if (lower === 'false' || lower === '0' || lower === 'no') return false;
      throw new Error(`Invalid boolean value "${rawValue}" for key "${keyPath}". Use true/false.`);
    }
    case 'number': {
      const num = Number(rawValue);
      if (!isFinite(num)) throw new Error(`Invalid number value "${rawValue}" for key "${keyPath}".`);
      return num;
    }
    case 'string':
    default:
      return rawValue;
  }
}
