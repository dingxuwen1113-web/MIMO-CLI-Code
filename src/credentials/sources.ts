// ── Credential Sources ──────────────────────────────────────────
// Loads credentials from multiple sources:
// - Environment variables
// - Config files (~/.mimo/credentials.json)
// - OS keychain (platform-specific)
// - Bitwarden CLI integration

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  CredentialSource, CredentialSourceType, CredentialProvider,
  PROVIDER_ENV_MAP,
} from './types';

const execFileAsync = promisify(execFile);

// ── Environment Variables Source ────────────────────────────────

class EnvSource implements CredentialSource {
  readonly type: CredentialSourceType = 'env';

  async load(provider: CredentialProvider): Promise<string[]> {
    const envKeys = PROVIDER_ENV_MAP[provider] || [];
    const results: string[] = [];

    for (const envKey of envKeys) {
      const value = process.env[envKey];
      if (value && value.trim()) {
        results.push(value.trim());
      }
    }

    // Also check generic patterns
    const genericKeys = [
      `MIMO_${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`,
      `${provider.toUpperCase().replace(/-/g, '_')}_KEY`,
    ];

    for (const genKey of genericKeys) {
      const value = process.env[genKey];
      if (value && value.trim() && !results.includes(value.trim())) {
        results.push(value.trim());
      }
    }

    return results;
  }

  async isAvailable(): Promise<boolean> {
    return true; // Env vars are always available
  }
}

// ── Config File Source ─────────────────────────────────────────

interface CredentialsFileData {
  version: number;
  providers: Record<string, string[]>;
  metadata?: Record<string, any>;
}

class ConfigFileSource implements CredentialSource {
  readonly type: CredentialSourceType = 'config-file';
  private filePath: string;

  constructor(configDir: string) {
    this.filePath = path.join(configDir, 'credentials.json');
  }

  async load(provider: CredentialProvider): Promise<string[]> {
    const data = await this.readFile();
    return data.providers[provider] || [];
  }

  async save(provider: CredentialProvider, key: string): Promise<void> {
    const data = await this.readFile();
    if (!data.providers[provider]) {
      data.providers[provider] = [];
    }
    if (!data.providers[provider].includes(key)) {
      data.providers[provider].push(key);
    }
    await this.writeFile(data);
  }

  async remove(provider: CredentialProvider, key?: string): Promise<void> {
    const data = await this.readFile();
    if (!data.providers[provider]) return;

    if (key) {
      data.providers[provider] = data.providers[provider].filter(k => k !== key);
      if (data.providers[provider].length === 0) {
        delete data.providers[provider];
      }
    } else {
      delete data.providers[provider];
    }

    await this.writeFile(data);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const dir = path.dirname(this.filePath);
      await fs.promises.access(dir, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async readFile(): Promise<CredentialsFileData> {
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        version: parsed.version || 1,
        providers: parsed.providers || {},
        metadata: parsed.metadata,
      };
    } catch {
      return { version: 1, providers: {} };
    }
  }

  private async writeFile(data: CredentialsFileData): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });

    // Write with restrictive permissions
    const content = JSON.stringify(data, null, 2);
    await fs.promises.writeFile(this.filePath, content, { mode: 0o600, encoding: 'utf-8' });
  }
}

// ── OS Keychain Source ─────────────────────────────────────────

class KeychainSource implements CredentialSource {
  readonly type: CredentialSourceType = 'keychain';
  private serviceName: string = 'mimo-cli';
  private platform: string;

  constructor() {
    this.platform = os.platform();
  }

  async load(provider: CredentialProvider): Promise<string[]> {
    try {
      const key = `api-key-${provider}`;
      const value = await this.getKeychainEntry(key);
      return value ? [value] : [];
    } catch {
      return [];
    }
  }

  async save(provider: CredentialProvider, key: string): Promise<void> {
    const entryKey = `api-key-${provider}`;
    await this.setKeychainEntry(entryKey, key);
  }

  async remove(provider: CredentialProvider): Promise<void> {
    const entryKey = `api-key-${provider}`;
    await this.deleteKeychainEntry(entryKey);
  }

  async isAvailable(): Promise<boolean> {
    switch (this.platform) {
      case 'darwin':
        return this.isCommandAvailable('security');
      case 'win32':
        return true; // PowerShell is always available on Windows
      case 'linux':
        return this.isCommandAvailable('secret-tool');
      default:
        return false;
    }
  }

  private async getKeychainEntry(key: string): Promise<string | null> {
    switch (this.platform) {
      case 'darwin':
        return this.macosGet(key);
      case 'win32':
        return this.windowsGet(key);
      case 'linux':
        return this.linuxGet(key);
      default:
        return null;
    }
  }

  private async setKeychainEntry(key: string, value: string): Promise<void> {
    switch (this.platform) {
      case 'darwin':
        await this.macosSet(key, value);
        break;
      case 'win32':
        await this.windowsSet(key, value);
        break;
      case 'linux':
        await this.linuxSet(key, value);
        break;
    }
  }

  private async deleteKeychainEntry(key: string): Promise<void> {
    switch (this.platform) {
      case 'darwin':
        await this.macosDelete(key);
        break;
      case 'win32':
        await this.windowsDelete(key);
        break;
      case 'linux':
        await this.linuxDelete(key);
        break;
    }
  }

  // ── macOS Keychain ───────────────────────────────────────

  private async macosGet(key: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('security', [
        'find-generic-password',
        '-s', this.serviceName,
        '-a', key,
        '-w',
      ]);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  private async macosSet(key: string, value: string): Promise<void> {
    // Delete existing entry first (ignore errors)
    await this.macosDelete(key).catch(() => {});

    await execFileAsync('security', [
      'add-generic-password',
      '-s', this.serviceName,
      '-a', key,
      '-w', value,
      '-U', // update if exists
    ]);
  }

  private async macosDelete(key: string): Promise<void> {
    await execFileAsync('security', [
      'delete-generic-password',
      '-s', this.serviceName,
      '-a', key,
    ]);
  }

  // ── Windows Credential Manager ───────────────────────────

  private async windowsGet(key: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('powershell', [
        '-NoProfile', '-Command',
        `try { $cred = Get-StoredCredential -Target "${this.serviceName}:${key}" -ErrorAction Stop; ` +
        `[System.Runtime.InteropServices.Marshal]::PtrToStringAuto($cred.CredentialBlob) } catch { $null }`,
      ]);
      return stdout.trim() || null;
    } catch {
      // Fallback: use cmdkey
      try {
        const { stdout } = await execFileAsync('cmdkey', ['/list:${this.serviceName}:${key}']);
        const match = stdout.match(/Password:\s*(.+)/);
        return match ? match[1].trim() : null;
      } catch {
        return null;
      }
    }
  }

  private async windowsSet(key: string, value: string): Promise<void> {
    const target = `${this.serviceName}:${key}`;
    await execFileAsync('cmdkey', [
      `/generic:${target}`,
      `/user:MIMO`,
      `/pass:${value}`,
    ]);
  }

  private async windowsDelete(key: string): Promise<void> {
    const target = `${this.serviceName}:${key}`;
    await execFileAsync('cmdkey', [`/delete:${target}`]).catch(() => {});
  }

  // ── Linux Secret Service ─────────────────────────────────

  private async linuxGet(key: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('secret-tool', [
        'lookup',
        'service', this.serviceName,
        'key', key,
      ]);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  private async linuxSet(key: string, value: string): Promise<void> {
    await execFileAsync('bash', [
      '-c',
      `echo -n '${value.replace(/'/g, "'\\''")}' | secret-tool store --label="MIMO ${key}" service "${this.serviceName}" key "${key}"`,
    ]);
  }

  private async linuxDelete(key: string): Promise<void> {
    await execFileAsync('secret-tool', [
      'clear',
      'service', this.serviceName,
      'key', key,
    ]).catch(() => {});
  }

  private async isCommandAvailable(cmd: string): Promise<boolean> {
    try {
      const checkCmd = os.platform() === 'win32' ? 'where' : 'which';
      await execFileAsync(checkCmd, [cmd]);
      return true;
    } catch {
      return false;
    }
  }
}

// ── Bitwarden CLI Source ───────────────────────────────────────

class BitwardenSource implements CredentialSource {
  readonly type: CredentialSourceType = 'bitwarden';
  private sessionToken: string = '';
  private cached: Map<string, string[]> = new Map();

  async load(provider: CredentialProvider): Promise<string[]> {
    // Check cache first
    if (this.cached.has(provider)) {
      return this.cached.get(provider)!;
    }

    try {
      // Ensure bw CLI is available
      await execFileAsync('bw', ['--version']);

      // Search for items with the provider tag
      const { stdout } = await execFileAsync('bw', [
        'list', 'items',
        '--search', `mimo-${provider}`,
        ...(this.sessionToken ? ['--session', this.sessionToken] : []),
      ]);

      const items = JSON.parse(stdout);
      const keys: string[] = [];

      for (const item of items) {
        if (item.login?.password) {
          keys.push(item.login.password);
        }
        // Also check custom fields
        if (item.fields) {
          for (const field of item.fields) {
            if (field.name?.toLowerCase().includes('api') && field.value) {
              keys.push(field.value);
            }
          }
        }
      }

      this.cached.set(provider, keys);
      return keys;
    } catch {
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('bw', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set the Bitwarden session token (after login/unlock)
   */
  setSession(token: string): void {
    this.sessionToken = token;
    this.cached.clear(); // Clear cache when session changes
  }

  /**
   * Login to Bitwarden
   */
  async login(email: string, password: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('bw', [
        'login', email, password, '--raw',
      ]);
      this.sessionToken = stdout.trim();
      return !!this.sessionToken;
    } catch {
      return false;
    }
  }

  /**
   * Unlock Bitwarden vault
   */
  async unlock(password: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('bw', [
        'unlock', password, '--raw',
      ]);
      this.sessionToken = stdout.trim();
      return !!this.sessionToken;
    } catch {
      return false;
    }
  }

  /**
   * Clear the session (lock vault)
   */
  clearSession(): void {
    this.sessionToken = '';
    this.cached.clear();
  }
}

// ── Source Factory ─────────────────────────────────────────────

const sourceRegistry = new Map<CredentialSourceType, CredentialSource>();

export function getCredentialSource(type: CredentialSourceType, configDir?: string): CredentialSource {
  if (sourceRegistry.has(type)) {
    return sourceRegistry.get(type)!;
  }

  let source: CredentialSource;

  switch (type) {
    case 'env':
      source = new EnvSource();
      break;
    case 'config-file':
      source = new ConfigFileSource(configDir || path.join(os.homedir(), '.mimo'));
      break;
    case 'keychain':
      source = new KeychainSource();
      break;
    case 'bitwarden':
      source = new BitwardenSource();
      break;
    default:
      throw new Error(`Unknown credential source: ${type}`);
  }

  sourceRegistry.set(type, source);
  return source;
}

/**
 * Get all available credential sources
 */
export async function getAvailableSources(configDir?: string): Promise<CredentialSource[]> {
  const allTypes: CredentialSourceType[] = ['env', 'config-file', 'keychain', 'bitwarden'];
  const available: CredentialSource[] = [];

  for (const type of allTypes) {
    try {
      const source = getCredentialSource(type, configDir);
      if (await source.isAvailable()) {
        available.push(source);
      }
    } catch {
      // Source not available
    }
  }

  return available;
}

/**
 * Load all credentials for a provider from all available sources
 */
export async function loadAllCredentials(
  provider: CredentialProvider,
  sourceTypes: CredentialSourceType[],
  configDir?: string,
): Promise<Array<{ key: string; source: CredentialSourceType }>> {
  const results: Array<{ key: string; source: CredentialSourceType }> = [];
  const seen = new Set<string>();

  for (const type of sourceTypes) {
    try {
      const source = getCredentialSource(type, configDir);
      const keys = await source.load(provider);
      for (const key of keys) {
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ key, source: type });
        }
      }
    } catch {
      // Skip unavailable sources
    }
  }

  return results;
}
