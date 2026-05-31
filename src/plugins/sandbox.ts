import createDebug from 'debug';
import { PluginManifest } from './manager';

const debug = createDebug('mimo:plugin:sandbox');

/**
 * Plugin sandbox that restricts what plugins can do.
 * Enforces permission boundaries for tools, files, network, and shell access.
 */
export class PluginSandbox {
  private allowedTools: Set<string>;
  private allowedPaths: string[];
  private allowNetwork: boolean;
  private allowShell: boolean;
  private callCounts: Map<string, number> = new Map();
  private maxCallsPerMinute = 60;

  constructor(manifest: PluginManifest) {
    this.allowedTools = new Set(manifest.permissions.tools);
    this.allowedPaths = manifest.permissions.files;
    this.allowNetwork = manifest.permissions.network;
    this.allowShell = manifest.permissions.shell;
  }

  /**
   * Check if a plugin is allowed to call a specific tool
   */
  canCallTool(toolName: string): boolean {
    // Wildcard permission
    if (this.allowedTools.has('*')) return true;

    // Exact match
    if (this.allowedTools.has(toolName)) return true;

    // Prefix match (e.g., 'file_*' allows file_read, file_write, etc.)
    for (const pattern of this.allowedTools) {
      if (pattern.endsWith('*') && toolName.startsWith(pattern.slice(0, -1))) {
        return true;
      }
    }

    debug('Tool %s denied for plugin', toolName);
    return false;
  }

  /**
   * Check if a plugin is allowed to access a file path
   */
  canAccessPath(filePath: string): boolean {
    // Wildcard permission
    if (this.allowedPaths.includes('*')) return true;

    for (const pattern of this.allowedPaths) {
      if (pattern === '*') return true;
      if (pattern.endsWith('**') && filePath.startsWith(pattern.slice(0, -2))) return true;
      if (filePath.startsWith(pattern)) return true;
    }

    debug('Path %s denied for plugin', filePath);
    return false;
  }

  /**
   * Check if network access is allowed
   */
  canAccessNetwork(): boolean {
    return this.allowNetwork;
  }

  /**
   * Check if shell execution is allowed
   */
  canExecuteShell(): boolean {
    return this.allowShell;
  }

  /**
   * Rate limit check - returns true if call is allowed
   */
  checkRateLimit(toolName: string): boolean {
    const count = this.callCounts.get(toolName) || 0;
    if (count >= this.maxCallsPerMinute) {
      debug('Rate limit exceeded for tool %s (%d calls)', toolName, count);
      return false;
    }
    this.callCounts.set(toolName, count + 1);
    return true;
  }

  /**
   * Reset rate limit counters (call every minute)
   */
  resetRateLimits(): void {
    this.callCounts.clear();
  }

  /**
   * Get sandbox status
   */
  getStatus(): {
    tools: string[];
    paths: string[];
    network: boolean;
    shell: boolean;
    rateLimits: Record<string, number>;
  } {
    return {
      tools: Array.from(this.allowedTools),
      paths: this.allowedPaths,
      network: this.allowNetwork,
      shell: this.allowShell,
      rateLimits: Object.fromEntries(this.callCounts),
    };
  }
}
