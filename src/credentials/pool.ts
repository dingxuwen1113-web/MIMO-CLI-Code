// ── Credential Pool ─────────────────────────────────────────────
// Manages multiple API keys per provider with automatic rotation,
// health tracking, rate limit handling, and load balancing.

import {
  CredentialPool, CredentialEntry, CredentialProvider,
  CredentialConfig, CredentialSourceType,
  LoadBalancingStrategy, KeyHealthStatus,
  DEFAULT_CREDENTIAL_CONFIG, maskKey, generateCredentialId,
} from './types';

export class CredentialPoolManager {
  private pools: Map<CredentialProvider, CredentialPool> = new Map();
  private config: CredentialConfig;

  constructor(config?: Partial<CredentialConfig>) {
    this.config = { ...DEFAULT_CREDENTIAL_CONFIG, ...config };
  }

  // ── Pool Management ────────────────────────────────────────

  /**
   * Get or create a pool for a provider
   */
  getPool(provider: CredentialProvider): CredentialPool {
    if (!this.pools.has(provider)) {
      this.pools.set(provider, {
        provider,
        entries: [],
        strategy: this.config.strategy,
        currentIndex: 0,
        rotationEnabled: this.config.rotationEnabled,
        maxRetries: this.config.maxRetries,
        cooldownMs: this.config.cooldownMs,
      });
    }
    return this.pools.get(provider)!;
  }

  /**
   * Add a key to a provider's pool
   */
  addKey(
    provider: CredentialProvider,
    key: string,
    source: CredentialSourceType,
  ): CredentialEntry {
    const pool = this.getPool(provider);
    const id = generateCredentialId(provider, key);

    // Check for duplicate
    const existing = pool.entries.find(e => e.id === id);
    if (existing) {
      // Update source if new source is higher priority
      const sourcePriority: CredentialSourceType[] = ['keychain', 'config-file', 'env', 'bitwarden'];
      const existingPriority = sourcePriority.indexOf(existing.source);
      const newPriority = sourcePriority.indexOf(source);
      if (newPriority < existingPriority) {
        existing.source = source;
      }
      return existing;
    }

    const entry: CredentialEntry = {
      id,
      provider,
      key,
      source,
      addedAt: Date.now(),
      usageCount: 0,
      errorCount: 0,
      health: 'unknown',
    };

    pool.entries.push(entry);
    return entry;
  }

  /**
   * Add multiple keys for a provider
   */
  addKeys(
    provider: CredentialProvider,
    keys: string[],
    source: CredentialSourceType,
  ): CredentialEntry[] {
    return keys.map(key => this.addKey(provider, key, source));
  }

  /**
   * Remove a specific key
   */
  removeKey(provider: CredentialProvider, keyId: string): boolean {
    const pool = this.getPool(provider);
    const index = pool.entries.findIndex(e => e.id === keyId);
    if (index >= 0) {
      pool.entries.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get the count of available keys for a provider
   */
  getKeyCount(provider: CredentialProvider): number {
    const pool = this.getPool(provider);
    return pool.entries.filter(e => e.health !== 'invalid').length;
  }

  // ── Key Selection ──────────────────────────────────────────

  /**
   * Get the next available key for a provider (main entry point)
   */
  getKey(provider: CredentialProvider): CredentialEntry | null {
    const pool = this.getPool(provider);

    if (pool.entries.length === 0) {
      return null;
    }

    // Filter available keys (not rate-limited, not invalid)
    const now = Date.now();
    const available = pool.entries.filter(e => {
      if (e.health === 'invalid') return false;
      if (e.rateLimitedUntil && e.rateLimitedUntil > now) return false;
      return true;
    });

    if (available.length === 0) {
      // All keys are rate-limited or invalid; try the least-recently rate-limited one
      const leastRecent = pool.entries
        .filter(e => e.health !== 'invalid')
        .sort((a, b) => (a.rateLimitedUntil || 0) - (b.rateLimitedUntil || 0));
      if (leastRecent.length > 0) {
        return this.markUsed(leastRecent[0]);
      }
      return null;
    }

    let selected: CredentialEntry;

    switch (pool.strategy) {
      case 'round-robin':
        selected = this.selectRoundRobin(pool, available);
        break;
      case 'least-used':
        selected = this.selectLeastUsed(available);
        break;
      case 'random':
        selected = this.selectRandom(available);
        break;
      default:
        selected = available[0];
    }

    return this.markUsed(selected);
  }

  /**
   * Get a specific key by ID
   */
  getKeyById(provider: CredentialProvider, keyId: string): CredentialEntry | null {
    const pool = this.getPool(provider);
    return pool.entries.find(e => e.id === keyId) || null;
  }

  private selectRoundRobin(pool: CredentialPool, available: CredentialEntry[]): CredentialEntry {
    const selected = available[pool.currentIndex % available.length];
    pool.currentIndex = (pool.currentIndex + 1) % available.length;
    return selected;
  }

  private selectLeastUsed(available: CredentialEntry[]): CredentialEntry {
    return available.reduce((min, entry) =>
      entry.usageCount < min.usageCount ? entry : min
    );
  }

  private selectRandom(available: CredentialEntry[]): CredentialEntry {
    return available[Math.floor(Math.random() * available.length)];
  }

  private markUsed(entry: CredentialEntry): CredentialEntry {
    entry.usageCount++;
    entry.lastUsedAt = Date.now();
    return entry;
  }

  // ── Health & Rate Limit Management ─────────────────────────

  /**
   * Report a successful use of a key
   */
  reportSuccess(provider: CredentialProvider, keyId: string): void {
    const entry = this.getKeyById(provider, keyId);
    if (!entry) return;

    entry.health = 'healthy';
    entry.errorCount = Math.max(0, entry.errorCount - 1); // Decrease error count on success
    delete entry.rateLimitedUntil;
  }

  /**
   * Report a rate limit error for a key
   */
  reportRateLimit(
    provider: CredentialProvider,
    keyId: string,
    retryAfterMs?: number,
  ): void {
    const entry = this.getKeyById(provider, keyId);
    if (!entry) return;

    entry.health = 'degraded';
    entry.rateLimitedUntil = Date.now() + (retryAfterMs || this.config.cooldownMs);
    entry.lastError = 'Rate limited';
    entry.lastErrorAt = Date.now();
  }

  /**
   * Report an auth error (invalid key)
   */
  reportAuthError(provider: CredentialProvider, keyId: string, error: string): void {
    const entry = this.getKeyById(provider, keyId);
    if (!entry) return;

    entry.errorCount++;
    entry.lastError = error;
    entry.lastErrorAt = Date.now();

    // Mark as invalid after 3 consecutive auth errors
    if (entry.errorCount >= 3) {
      entry.health = 'invalid';
    } else {
      entry.health = 'degraded';
    }
  }

  /**
   * Report a general error for a key
   */
  reportError(provider: CredentialProvider, keyId: string, error: string): void {
    const entry = this.getKeyById(provider, keyId);
    if (!entry) return;

    entry.errorCount++;
    entry.lastError = error;
    entry.lastErrorAt = Date.now();

    if (entry.errorCount >= 5) {
      entry.health = 'exhausted';
    } else if (entry.errorCount >= 2) {
      entry.health = 'degraded';
    }
  }

  /**
   * Reset health status for a key
   */
  resetHealth(provider: CredentialProvider, keyId: string): void {
    const entry = this.getKeyById(provider, keyId);
    if (!entry) return;

    entry.health = 'unknown';
    entry.errorCount = 0;
    delete entry.lastError;
    delete entry.lastErrorAt;
    delete entry.rateLimitedUntil;
  }

  // ── Configuration ─────────────────────────────────────────

  /**
   * Set the load balancing strategy for a provider
   */
  setStrategy(provider: CredentialProvider, strategy: LoadBalancingStrategy): void {
    const pool = this.getPool(provider);
    pool.strategy = strategy;
  }

  /**
   * Get pool statistics
   */
  getStats(provider: CredentialProvider): {
    total: number;
    healthy: number;
    degraded: number;
    rateLimited: number;
    invalid: number;
    totalUsage: number;
  } {
    const pool = this.getPool(provider);
    const now = Date.now();

    return {
      total: pool.entries.length,
      healthy: pool.entries.filter(e => e.health === 'healthy').length,
      degraded: pool.entries.filter(e => e.health === 'degraded').length,
      rateLimited: pool.entries.filter(e => e.rateLimitedUntil && e.rateLimitedUntil > now).length,
      invalid: pool.entries.filter(e => e.health === 'invalid').length,
      totalUsage: pool.entries.reduce((sum, e) => sum + e.usageCount, 0),
    };
  }

  /**
   * Get all providers with keys
   */
  getProviders(): CredentialProvider[] {
    const providers: CredentialProvider[] = [];
    this.pools.forEach((pool, provider) => {
      if (pool.entries.length > 0) {
        providers.push(provider);
      }
    });
    return providers;
  }

  /**
   * Get all entries for a provider
   */
  getEntries(provider: CredentialProvider): CredentialEntry[] {
    return [...this.getPool(provider).entries];
  }

  /**
   * Clear all keys for a provider
   */
  clearPool(provider: CredentialProvider): void {
    this.pools.delete(provider);
  }

  /**
   * Clear all pools
   */
  clearAll(): void {
    this.pools.clear();
  }

  /**
   * Export pool state (for persistence, excludes actual keys)
   */
  exportState(): Record<string, any> {
    const state: Record<string, any> = {};
    this.pools.forEach((pool, provider) => {
      state[provider] = {
        strategy: pool.strategy,
        currentIndex: pool.currentIndex,
        entries: pool.entries.map(e => ({
          ...e,
          key: `***${e.key.slice(-4)}`, // mask key in export
        })),
      };
    });
    return state;
  }

  /**
   * Get the config
   */
  getConfig(): CredentialConfig {
    return { ...this.config };
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<CredentialConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Create a CredentialPoolManager with default configuration
 */
export function createCredentialPool(config?: Partial<CredentialConfig>): CredentialPoolManager {
  return new CredentialPoolManager(config);
}
