// ── 配置类型定义 ──────────────────────────────────

export type ApiMode = 'token-plan' | 'pay-as-you-go';
export type AgentMode = 'plan' | 'agent' | 'yolo';
export type ModelId = 'mimo-v2.5-pro' | 'mimo-v2.5' | 'auto';

const VALID_API_MODES: ApiMode[] = ['token-plan', 'pay-as-you-go'];
const VALID_AGENT_MODES: AgentMode[] = ['plan', 'agent', 'yolo'];
const VALID_MODEL_IDS: ModelId[] = ['mimo-v2.5-pro', 'mimo-v2.5', 'auto'];

export interface TokenPlanConfig {
  apiKey: string;
  baseUrl: string;
  monthlyBudget: number;
}

export interface PayAsYouGoConfig {
  apiKey: string;
  baseUrl: string;
  maxTokensPerTurn: number;
}

export interface ApiConfig {
  mode: ApiMode;
  model: ModelId;
  tokenPlan: TokenPlanConfig;
  payAsYouGo: PayAsYouGoConfig;
  stream: boolean;
}

export interface AgentConfig {
  mode: AgentMode;
  maxTurns: number;
  autoApproveReads: boolean;
}

export interface ToolConfig {
  shellTimeout: number;
  allowedCommands: string[];
  blockedCommands: string[];
}

export interface SandboxConfig {
  enabled: boolean;
  tmpDir: string;
}

export interface PromptCachingConfig {
  enabled: boolean;
  cacheTtl: number;
}

export interface FeaturesConfig {
  enabled: boolean;
  disabledFeatures: string[];
}

export interface MimoConfig {
  api: ApiConfig;
  agent: AgentConfig;
  tools: ToolConfig;
  sandbox: SandboxConfig;
  promptCaching: PromptCachingConfig;
  features: FeaturesConfig;
}

export const DEFAULT_CONFIG: MimoConfig = {
  api: {
    mode: 'token-plan',
    model: 'auto',
    tokenPlan: {
      apiKey: '',
      baseUrl: '',
      monthlyBudget: 999_999_999_999,
    },
    payAsYouGo: {
      apiKey: '',
      baseUrl: '',
      maxTokensPerTurn: 32768,
    },
    stream: true,
  },
  agent: {
    mode: 'agent',
    maxTurns: 50,
    autoApproveReads: true,
  },
  tools: {
    shellTimeout: 30000,
    allowedCommands: [],
    blockedCommands: ['rm -rf /', 'sudo rm -rf'],
  },
  sandbox: {
    enabled: true,
    tmpDir: '/tmp/mimo-sandbox',
  },
  promptCaching: {
    enabled: true,
    cacheTtl: 300,
  },
  features: {
    enabled: true,
    disabledFeatures: [],
  },
};

// ── Validation helpers ──────────────────────────────

export interface ValidationError {
  path: string;
  message: string;
}

/**
 * Validate the full MimoConfig, returning an array of errors.
 * An empty array means the config is valid.
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

  return errors;
}

export function validateApiConfig(api: Partial<ApiConfig>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (api.mode !== undefined && !VALID_API_MODES.includes(api.mode)) {
    errors.push({ path: 'api.mode', message: `Invalid API mode "${api.mode}". Must be one of: ${VALID_API_MODES.join(', ')}` });
  }
  if (api.model !== undefined && !VALID_MODEL_IDS.includes(api.model)) {
    errors.push({ path: 'api.model', message: `Invalid model "${api.model}". Must be one of: ${VALID_MODEL_IDS.join(', ')}` });
  }
  if (api.stream !== undefined && typeof api.stream !== 'boolean') {
    errors.push({ path: 'api.stream', message: 'Must be a boolean' });
  }

  if (api.tokenPlan) {
    errors.push(...validateTokenPlanConfig(api.tokenPlan));
  }
  if (api.payAsYouGo) {
    errors.push(...validatePayAsYouGoConfig(api.payAsYouGo));
  }

  return errors;
}

export function validateTokenPlanConfig(tp: Partial<TokenPlanConfig>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (tp.apiKey !== undefined && typeof tp.apiKey !== 'string') {
    errors.push({ path: 'api.tokenPlan.apiKey', message: 'Must be a string' });
  }
  if (tp.baseUrl !== undefined && typeof tp.baseUrl !== 'string') {
    errors.push({ path: 'api.tokenPlan.baseUrl', message: 'Must be a string' });
  }
  if (tp.monthlyBudget !== undefined) {
    if (typeof tp.monthlyBudget !== 'number' || !isFinite(tp.monthlyBudget) || tp.monthlyBudget < 0) {
      errors.push({ path: 'api.tokenPlan.monthlyBudget', message: 'Must be a non-negative finite number' });
    }
  }

  return errors;
}

export function validatePayAsYouGoConfig(payg: Partial<PayAsYouGoConfig>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (payg.apiKey !== undefined && typeof payg.apiKey !== 'string') {
    errors.push({ path: 'api.payAsYouGo.apiKey', message: 'Must be a string' });
  }
  if (payg.baseUrl !== undefined && typeof payg.baseUrl !== 'string') {
    errors.push({ path: 'api.payAsYouGo.baseUrl', message: 'Must be a string' });
  }
  if (payg.maxTokensPerTurn !== undefined) {
    if (typeof payg.maxTokensPerTurn !== 'number' || !isFinite(payg.maxTokensPerTurn) || payg.maxTokensPerTurn < 1) {
      errors.push({ path: 'api.payAsYouGo.maxTokensPerTurn', message: 'Must be a positive finite number' });
    }
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
