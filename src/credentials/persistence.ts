// ── Encrypted Credential Persistence ────────────────────────────
// AES-256-GCM encryption, machine-specific key derivation,
// and secure file permissions for credential storage.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;     // 256 bits
const IV_LENGTH = 12;      // 96 bits (recommended for GCM)
const TAG_LENGTH = 16;     // 128 bits
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

interface EncryptedPayload {
  version: number;
  algorithm: string;
  salt: string;     // hex
  iv: string;       // hex
  tag: string;      // hex (authentication tag)
  data: string;     // hex (encrypted data)
  machineId: string; // for validation
  createdAt: number;
}

interface StoredCredentials {
  version: number;
  providers: Record<string, EncryptedPayload[]>;
  metadata: {
    createdAt: number;
    updatedAt: number;
    machineId: string;
  };
}

// ── Machine ID ─────────────────────────────────────────────────

/**
 * Generate a machine-specific identifier for key derivation.
 * Combines hostname, username, and platform info.
 */
function getMachineId(): string {
  const components = [
    os.hostname(),
    os.userInfo().username,
    os.platform(),
    os.arch(),
    // CPU info for additional entropy (first core only)
    os.cpus()[0]?.model || 'unknown',
  ];

  const hash = crypto.createHash('sha256');
  hash.update(components.join('|'));
  return hash.digest('hex').substring(0, 32);
}

/**
 * Derive an encryption key from a password + machine-specific salt
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
}

/**
 * Get the master password for encryption.
 * Derives from machine ID + a fixed application secret.
 */
function getMasterPassword(): string {
  const machineId = getMachineId();
  const appSecret = 'mimo-cli-credential-store-v1';
  const hash = crypto.createHash('sha256');
  hash.update(`${machineId}:${appSecret}`);
  return hash.digest('hex');
}

// ── Encryption / Decryption ────────────────────────────────────

/**
 * Encrypt data using AES-256-GCM
 */
export function encrypt(plaintext: string, password?: string): EncryptedPayload {
  const masterPassword = password || getMasterPassword();
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(masterPassword, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return {
    version: 1,
    algorithm: ALGORITHM,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
    machineId: getMachineId(),
    createdAt: Date.now(),
  };
}

/**
 * Decrypt data using AES-256-GCM
 */
export function decrypt(payload: EncryptedPayload, password?: string): string {
  const masterPassword = password || getMasterPassword();

  // Validate machine ID
  const currentMachineId = getMachineId();
  if (payload.machineId !== currentMachineId) {
    throw new Error('Credential file was created on a different machine. Cannot decrypt.');
  }

  const salt = Buffer.from(payload.salt, 'hex');
  const iv = Buffer.from(payload.iv, 'hex');
  const tag = Buffer.from(payload.tag, 'hex');
  const encrypted = Buffer.from(payload.data, 'hex');
  const key = deriveKey(masterPassword, salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf-8');
}

// ── Credential File Operations ─────────────────────────────────

export class CredentialPersistence {
  private filePath: string;
  private machineId: string;

  constructor(configDir?: string) {
    const dir = configDir || path.join(os.homedir(), '.mimo');
    this.filePath = path.join(dir, 'credentials.enc');
    this.machineId = getMachineId();
  }

  /**
   * Store encrypted credentials for a provider
   */
  async storeCredentials(provider: string, keys: string[]): Promise<void> {
    let stored = await this.readStored();

    // Encrypt each key individually for better security
    const encryptedKeys: EncryptedPayload[] = keys.map(key => encrypt(key));

    stored.providers[provider] = encryptedKeys;
    stored.metadata.updatedAt = Date.now();
    stored.metadata.machineId = this.machineId;

    await this.writeStored(stored);
  }

  /**
   * Retrieve decrypted credentials for a provider
   */
  async loadCredentials(provider: string): Promise<string[]> {
    const stored = await this.readStored();
    const encryptedKeys = stored.providers[provider];

    if (!encryptedKeys || encryptedKeys.length === 0) {
      return [];
    }

    const results: string[] = [];
    for (const payload of encryptedKeys) {
      try {
        const decrypted = decrypt(payload);
        results.push(decrypted);
      } catch (err: any) {
        // Skip keys that can't be decrypted (wrong machine, corrupted, etc.)
        process.stderr?.write(`Warning: Could not decrypt credential for ${provider}: ${err.message}\n`);
      }
    }

    return results;
  }

  /**
   * Add a single credential for a provider
   */
  async addCredential(provider: string, key: string): Promise<void> {
    const existing = await this.loadCredentials(provider);
    if (!existing.includes(key)) {
      existing.push(key);
      await this.storeCredentials(provider, existing);
    }
  }

  /**
   * Remove a specific credential or all for a provider
   */
  async removeCredential(provider: string, key?: string): Promise<void> {
    const stored = await this.readStored();

    if (!key) {
      delete stored.providers[provider];
    } else if (stored.providers[provider]) {
      // Decrypt all, filter, re-encrypt
      const decrypted = await this.loadCredentials(provider);
      const filtered = decrypted.filter(k => k !== key);
      if (filtered.length > 0) {
        stored.providers[provider] = filtered.map(k => encrypt(k));
      } else {
        delete stored.providers[provider];
      }
    }

    stored.metadata.updatedAt = Date.now();
    await this.writeStored(stored);
  }

  /**
   * List all providers with stored credentials
   */
  async listProviders(): Promise<string[]> {
    const stored = await this.readStored();
    return Object.keys(stored.providers);
  }

  /**
   * Check if credentials exist for a provider
   */
  async hasCredentials(provider: string): Promise<boolean> {
    const stored = await this.readStored();
    return !!(stored.providers[provider]?.length);
  }

  /**
   * Check if the credential file exists
   */
  async exists(): Promise<boolean> {
    try {
      await fs.promises.access(this.filePath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate that the stored credentials can be decrypted on this machine
   */
  async validate(): Promise<{ valid: boolean; error?: string }> {
    try {
      const stored = await this.readStored();
      if (stored.metadata.machineId !== this.machineId) {
        return { valid: false, error: 'Credential file was created on a different machine' };
      }

      // Try decrypting a sample from each provider
      for (const [provider, keys] of Object.entries(stored.providers)) {
        if (keys.length > 0) {
          try {
            decrypt(keys[0]);
          } catch (err: any) {
            return { valid: false, error: `Cannot decrypt ${provider} credentials: ${err.message}` };
          }
        }
      }

      return { valid: true };
    } catch (err: any) {
      return { valid: false, error: err.message };
    }
  }

  /**
   * Export credentials (unencrypted) for backup
   * WARNING: This produces plaintext credentials
   */
  async exportAll(): Promise<Record<string, string[]>> {
    const stored = await this.readStored();
    const result: Record<string, string[]> = {};

    for (const provider of Object.keys(stored.providers)) {
      result[provider] = await this.loadCredentials(provider);
    }

    return result;
  }

  /**
   * Import credentials from a backup
   */
  async importAll(data: Record<string, string[]>): Promise<void> {
    for (const [provider, keys] of Object.entries(data)) {
      await this.storeCredentials(provider, keys);
    }
  }

  // ── Internal ─────────────────────────────────────────────

  private async readStored(): Promise<StoredCredentials> {
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        version: parsed.version || 1,
        providers: parsed.providers || {},
        metadata: {
          createdAt: parsed.metadata?.createdAt || Date.now(),
          updatedAt: parsed.metadata?.updatedAt || Date.now(),
          machineId: parsed.metadata?.machineId || this.machineId,
        },
      };
    } catch {
      return {
        version: 1,
        providers: {},
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          machineId: this.machineId,
        },
      };
    }
  }

  private async writeStored(stored: StoredCredentials): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });

    const content = JSON.stringify(stored, null, 2);

    // Write with restrictive permissions (owner read/write only)
    await fs.promises.writeFile(this.filePath, content, {
      mode: 0o600,
      encoding: 'utf-8',
    });

    // Ensure the directory also has secure permissions
    try {
      await fs.promises.chmod(dir, 0o700);
    } catch {
      // May not be supported on all platforms (e.g., Windows)
    }
  }
}

// ── Utility Functions ──────────────────────────────────────────

/**
 * Create a CredentialPersistence instance
 */
export function createCredentialPersistence(configDir?: string): CredentialPersistence {
  return new CredentialPersistence(configDir);
}

/**
 * Quick encrypt helper
 */
export function encryptCredentials(plaintext: string): EncryptedPayload {
  return encrypt(plaintext);
}

/**
 * Quick decrypt helper
 */
export function decryptCredentials(payload: EncryptedPayload): string {
  return decrypt(payload);
}

/**
 * Get the current machine ID
 */
export function getMachineIdentifier(): string {
  return getMachineId();
}
