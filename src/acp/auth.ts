// ── ACP Authentication ───────────────────────────────

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Permission, PermissionAction, PermissionScope } from './types';

const AUTH_DIR = path.join(os.homedir(), '.mimo', 'acp');
const TOKENS_FILE = path.join(AUTH_DIR, 'tokens.json');
const PAIRINGS_FILE = path.join(AUTH_DIR, 'pairings.json');

interface StoredToken {
  tokenHash: string;
  deviceId: string;
  deviceName: string;
  permissions: Permission[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revoked: boolean;
}

interface DevicePairing {
  pairingCode: string;
  deviceId: string;
  deviceName: string;
  status: 'pending' | 'completed' | 'expired';
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string;
}

export interface AuthResult {
  valid: boolean;
  deviceId?: string;
  permissions?: Permission[];
  error?: string;
}

export interface PairingResult {
  success: boolean;
  token?: string;
  deviceId?: string;
  error?: string;
}

export class ACPAuthProvider {
  private tokens: Map<string, StoredToken> = new Map();
  private pairings: Map<string, DevicePairing> = new Map();
  private initialized = false;

  // ── Initialization ────────────────────────────────

  async init(): Promise<void> {
    if (this.initialized) return;

    await fs.mkdir(AUTH_DIR, { recursive: true });
    await this.loadTokens();
    await this.loadPairings();
    this.initialized = true;
  }

  private async loadTokens(): Promise<void> {
    try {
      const raw = await fs.readFile(TOKENS_FILE, 'utf-8');
      const tokens: StoredToken[] = JSON.parse(raw);
      for (const token of tokens) {
        this.tokens.set(token.tokenHash, token);
      }
    } catch {
      // File doesn't exist yet
    }
  }

  private async saveTokens(): Promise<void> {
    const tokens = Array.from(this.tokens.values());
    await fs.writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf-8');
  }

  private async loadPairings(): Promise<void> {
    try {
      const raw = await fs.readFile(PAIRINGS_FILE, 'utf-8');
      const pairings: DevicePairing[] = JSON.parse(raw);
      for (const pairing of pairings) {
        this.pairings.set(pairing.pairingCode, pairing);
      }
    } catch {
      // File doesn't exist yet
    }
  }

  private async savePairings(): Promise<void> {
    const pairings = Array.from(this.pairings.values());
    await fs.writeFile(PAIRINGS_FILE, JSON.stringify(pairings, null, 2), 'utf-8');
  }

  // ── Token-Based Auth ──────────────────────────────

  async validateToken(token: string): Promise<AuthResult> {
    const tokenHash = this.hashToken(token);
    const stored = this.tokens.get(tokenHash);

    if (!stored) {
      return { valid: false, error: 'Token not found' };
    }

    if (stored.revoked) {
      return { valid: false, error: 'Token has been revoked' };
    }

    if (stored.expiresAt && new Date(stored.expiresAt) < new Date()) {
      return { valid: false, error: 'Token has expired' };
    }

    // Update last used
    stored.lastUsedAt = new Date().toISOString();
    await this.saveTokens();

    return {
      valid: true,
      deviceId: stored.deviceId,
      permissions: stored.permissions,
    };
  }

  async createToken(
    deviceId: string,
    deviceName: string,
    permissions: Permission[],
    expiresIn?: number
  ): Promise<string> {
    const token = this.generateToken();
    const tokenHash = this.hashToken(token);

    const stored: StoredToken = {
      tokenHash,
      deviceId,
      deviceName,
      permissions,
      createdAt: new Date().toISOString(),
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      lastUsedAt: null,
      revoked: false,
    };

    this.tokens.set(tokenHash, stored);
    await this.saveTokens();

    return token;
  }

  async revokeToken(token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token);
    const stored = this.tokens.get(tokenHash);

    if (!stored) return false;

    stored.revoked = true;
    await this.saveTokens();
    return true;
  }

  async revokeAllTokensForDevice(deviceId: string): Promise<number> {
    let count = 0;
    for (const stored of this.tokens.values()) {
      if (stored.deviceId === deviceId && !stored.revoked) {
        stored.revoked = true;
        count++;
      }
    }
    if (count > 0) await this.saveTokens();
    return count;
  }

  // ── Device Pairing Flow ───────────────────────────

  async initiatePairing(deviceName: string): Promise<{ pairingCode: string; expiresAt: string }> {
    const pairingCode = this.generatePairingCode();
    const deviceId = this.generateDeviceId();

    const pairing: DevicePairing = {
      pairingCode,
      deviceId,
      deviceName,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      completedAt: null,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
    };

    this.pairings.set(pairingCode, pairing);
    await this.savePairings();

    return {
      pairingCode,
      expiresAt: pairing.expiresAt,
    };
  }

  async completePairing(pairingCode: string): Promise<PairingResult> {
    const pairing = this.pairings.get(pairingCode);

    if (!pairing) {
      return { success: false, error: 'Invalid pairing code' };
    }

    if (pairing.status !== 'pending') {
      return { success: false, error: `Pairing already ${pairing.status}` };
    }

    if (new Date(pairing.expiresAt) < new Date()) {
      pairing.status = 'expired';
      await this.savePairings();
      return { success: false, error: 'Pairing code has expired' };
    }

    // Create token with default permissions
    const defaultPermissions = await this.getDefaultPermissions();
    const token = await this.createToken(
      pairing.deviceId,
      pairing.deviceName,
      defaultPermissions,
      30 * 24 * 60 * 60 // 30 days
    );

    pairing.status = 'completed';
    pairing.completedAt = new Date().toISOString();
    await this.savePairings();

    return {
      success: true,
      token,
      deviceId: pairing.deviceId,
    };
  }

  getPendingPairing(pairingCode: string): DevicePairing | undefined {
    return this.pairings.get(pairingCode);
  }

  cleanupExpiredPairings(): number {
    let cleaned = 0;
    const now = new Date();
    for (const [code, pairing] of this.pairings) {
      if (pairing.status === 'pending' && new Date(pairing.expiresAt) < now) {
        pairing.status = 'expired';
        cleaned++;
      }
    }
    return cleaned;
  }

  // ── Permission Scoping ────────────────────────────

  async getDefaultPermissions(): Promise<Permission[]> {
    return [
      {
        id: this.generateId(),
        resource: '*',
        actions: ['read'],
        scope: 'session',
        granted: true,
        expiresAt: null,
      },
      {
        id: this.generateId(),
        resource: '*',
        actions: ['execute'],
        scope: 'session',
        granted: true,
        expiresAt: null,
      },
    ];
  }

  async getAdminPermissions(): Promise<Permission[]> {
    return [
      {
        id: this.generateId(),
        resource: '*',
        actions: ['read', 'write', 'execute', 'approve', 'admin'],
        scope: 'global',
        granted: true,
        expiresAt: null,
      },
    ];
  }

  async setPermission(
    deviceId: string,
    permission: Permission
  ): Promise<void> {
    // Update all tokens for this device with the new permission
    for (const stored of this.tokens.values()) {
      if (stored.deviceId === deviceId && !stored.revoked) {
        const existingIdx = stored.permissions.findIndex(p => p.resource === permission.resource);
        if (existingIdx >= 0) {
          stored.permissions[existingIdx] = permission;
        } else {
          stored.permissions.push(permission);
        }
      }
    }
    await this.saveTokens();
  }

  async getDevicePermissions(deviceId: string): Promise<Permission[]> {
    for (const stored of this.tokens.values()) {
      if (stored.deviceId === deviceId && !stored.revoked) {
        return stored.permissions;
      }
    }
    return [];
  }

  // ── Device Management ─────────────────────────────

  listDevices(): Array<{ deviceId: string; deviceName: string; lastUsedAt: string | null; revoked: boolean }> {
    const seen = new Set<string>();
    const devices: Array<{ deviceId: string; deviceName: string; lastUsedAt: string | null; revoked: boolean }> = [];

    for (const stored of this.tokens.values()) {
      if (!seen.has(stored.deviceId)) {
        seen.add(stored.deviceId);
        devices.push({
          deviceId: stored.deviceId,
          deviceName: stored.deviceName,
          lastUsedAt: stored.lastUsedAt,
          revoked: stored.revoked,
        });
      }
    }

    return devices;
  }

  // ── Crypto Helpers ────────────────────────────────

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private generateToken(): string {
    return `mimo_acp_${crypto.randomBytes(32).toString('hex')}`;
  }

  private generatePairingCode(): string {
    // Generate a 6-digit numeric code
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private generateDeviceId(): string {
    return `dev-${crypto.randomBytes(8).toString('hex')}`;
  }

  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }
}
