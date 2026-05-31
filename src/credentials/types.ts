// ── Credential Type Definitions ─────────────────────────────────

export type CredentialProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'stability-ai'
  | 'elevenlabs'
  | 'fal-ai'
  | 'runway'
  | 'luma'
  | 'deepseek'
  | 'openrouter'
  | 'groq'
  | 'together'
  | 'replicate'
  | 'mistral'
  | 'cohere'
  | 'custom';

export type CredentialSourceType = 'env' | 'config-file' | 'keychain' | 'bitwarden';
export type LoadBalancingStrategy = 'round-robin' | 'least-used' | 'random';
export type KeyHealthStatus = 'healthy' | 'degraded' | 'exhausted' | 'invalid' | 'unknown';

export interface CredentialEntry {
  id: string;
  provider: CredentialProvider;
  key: string;                // masked in logs: "sk-...abc123"
  source: CredentialSourceType;
  addedAt: number;            // timestamp
  lastUsedAt?: number;
  usageCount: number;
  errorCount: number;
  lastError?: string;
  lastErrorAt?: number;
  health: KeyHealthStatus;
  rateLimitedUntil?: number;  // timestamp when rate limit expires
  metadata?: Record<string, any>;
}

export interface CredentialPool {
  provider: CredentialProvider;
  entries: CredentialEntry[];
  strategy: LoadBalancingStrategy;
  currentIndex: number;       // for round-robin
  rotationEnabled: boolean;
  maxRetries: number;
  cooldownMs: number;         // cooldown after rate limit
}

export interface CredentialSource {
  type: CredentialSourceType;

  /**
   * Load credentials from this source
   */
  load(provider: CredentialProvider): Promise<string[]>;

  /**
   * Save a credential to this source (optional, not all sources support writes)
   */
  save?(provider: CredentialProvider, key: string): Promise<void>;

  /**
   * Remove a credential from this source
   */
  remove?(provider: CredentialProvider, key?: string): Promise<void>;

  /**
   * Check if this source is available
   */
  isAvailable(): Promise<boolean>;
}

export interface CredentialConfig {
  strategy: LoadBalancingStrategy;
  rotationEnabled: boolean;
  maxRetries: number;
  cooldownMs: number;
  sources: CredentialSourceType[];
  configDir: string;
}

export const DEFAULT_CREDENTIAL_CONFIG: CredentialConfig = {
  strategy: 'round-robin',
  rotationEnabled: true,
  maxRetries: 3,
  cooldownMs: 60000,
  sources: ['env', 'config-file'],
  configDir: '~/.mimo',
};

// ── Provider -> Env Variable Mapping ───────────────────────────

export const PROVIDER_ENV_MAP: Record<CredentialProvider, string[]> = {
  'anthropic':   ['ANTHROPIC_API_KEY'],
  'openai':      ['OPENAI_API_KEY'],
  'google':      ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  'stability-ai':['STABILITY_API_KEY'],
  'elevenlabs':  ['ELEVENLABS_API_KEY'],
  'fal-ai':      ['FAL_KEY'],
  'runway':      ['RUNWAY_API_KEY'],
  'luma':        ['LUMA_API_KEY'],
  'deepseek':    ['DEEPSEEK_API_KEY'],
  'openrouter':  ['OPENROUTER_API_KEY'],
  'groq':        ['GROQ_API_KEY'],
  'together':    ['TOGETHER_API_KEY'],
  'replicate':   ['REPLICATE_API_TOKEN'],
  'mistral':     ['MISTRAL_API_KEY'],
  'cohere':      ['COHERE_API_KEY'],
  'custom':      ['CUSTOM_API_KEY'],
};

/**
 * Mask an API key for safe display (keep first 6 and last 4 chars)
 */
export function maskKey(key: string): string {
  if (key.length <= 12) return '***';
  return `${key.substring(0, 6)}...${key.substring(key.length - 4)}`;
}

/**
 * Generate a unique credential ID
 */
export function generateCredentialId(provider: CredentialProvider, key: string): string {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(key).digest('hex').substring(0, 12);
  return `${provider}-${hash}`;
}
