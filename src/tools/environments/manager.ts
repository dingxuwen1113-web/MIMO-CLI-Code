/**
 * Environment Manager
 *
 * Central manager for creating, switching, monitoring, and disposing of
 * execution environments. Provides:
 * - Factory method to create environments from configuration
 * - Named environment registry with switchable active environment
 * - Health checking with automatic failover
 * - Resource monitoring (CPU, memory, disk)
 * - Graceful lifecycle management
 */

import { ExecutionEnvironment, ExecOptions, ExecResult, EnvironmentConfig } from './types';
import { LocalEnvironment } from './local';
import { DockerEnvironment } from './docker';
import { SSHEnvironment } from './ssh';
import { ModalEnvironment } from './modal';
import { DaytonaEnvironment } from './daytona';
import { SingularityEnvironment } from './singularity';

export interface HealthStatus {
  /** Whether the environment is responsive */
  healthy: boolean;
  /** Last successful health check timestamp */
  lastCheck: Date;
  /** Error message if unhealthy */
  error?: string;
  /** Response time in ms */
  responseTime: number;
}

export interface ResourceUsage {
  /** CPU usage percentage (0-100) */
  cpu: number;
  /** Memory usage in bytes */
  memoryUsed: number;
  /** Total memory in bytes */
  memoryTotal: number;
  /** Memory usage percentage (0-100) */
  memoryPercent: number;
  /** Disk usage of working directory in bytes */
  diskUsed: number;
  /** Total disk space in bytes */
  diskTotal: number;
  /** Disk usage percentage (0-100) */
  diskPercent: number;
}

export interface EnvironmentInfo {
  /** Environment name */
  name: string;
  /** Environment type */
  type: string;
  /** Whether this is the active environment */
  isActive: boolean;
  /** Current health status */
  health: HealthStatus;
  /** Last known resource usage (null if never checked) */
  resources: ResourceUsage | null;
}

export class EnvironmentManager {
  private environments: Map<string, ExecutionEnvironment> = new Map();
  private healthStatuses: Map<string, HealthStatus> = new Map();
  private resourceSnapshots: Map<string, ResourceUsage> = new Map();
  private activeEnvName: string | undefined;
  private healthCheckTimer: ReturnType<typeof setInterval> | undefined;
  private healthCheckInterval: number;
  private onHealthChange?: (name: string, status: HealthStatus) => void;

  constructor(options?: {
    healthCheckIntervalMs?: number;
    onHealthChange?: (name: string, status: HealthStatus) => void;
  }) {
    this.healthCheckInterval = options?.healthCheckIntervalMs ?? 30000;
    this.onHealthChange = options?.onHealthChange;
  }

  // -- Factory --

  /**
   * Create an environment from a configuration object.
   */
  createEnvironment(config: EnvironmentConfig): ExecutionEnvironment {
    const name = config.name ?? `${config.type}-${Date.now()}`;
    let env: ExecutionEnvironment;

    switch (config.type) {
      case 'local':
        env = new LocalEnvironment(name, undefined, config.defaultTimeout);
        break;
      case 'docker':
        env = new DockerEnvironment(config, name);
        break;
      case 'ssh':
        env = new SSHEnvironment(config, name);
        break;
      case 'modal':
        env = new ModalEnvironment(config, name);
        break;
      case 'daytona':
        env = new DaytonaEnvironment(config, name);
        break;
      case 'singularity':
        env = new SingularityEnvironment(config, name);
        break;
      default:
        throw new Error(`Unknown environment type: ${(config as any).type}`);
    }

    return env;
  }

  // -- Registry --

  /**
   * Register an environment under a name.
   * If the name already exists, the old environment is disposed.
   */
  async register(name: string, env: ExecutionEnvironment): Promise<void> {
    const existing = this.environments.get(name);
    if (existing) {
      await existing.dispose().catch(() => {});
      this.environments.delete(name);
      this.healthStatuses.delete(name);
      this.resourceSnapshots.delete(name);
    }

    this.environments.set(name, env);
    this.healthStatuses.set(name, {
      healthy: false,
      lastCheck: new Date(),
      responseTime: 0,
    });
  }

  /**
   * Create, initialize, and register an environment from config.
   * Optionally set it as the active environment.
   */
  async addFromConfig(config: EnvironmentConfig, setActive = false): Promise<string> {
    const env = this.createEnvironment(config);
    await env.init();
    await this.register(env.name, env);

    if (setActive || !this.activeEnvName) {
      this.activeEnvName = env.name;
    }

    // Run initial health check
    await this.checkHealth(env.name);

    return env.name;
  }

  /**
   * Remove an environment from the registry and dispose it.
   */
  async remove(name: string): Promise<void> {
    const env = this.environments.get(name);
    if (!env) return;

    await env.dispose().catch(() => {});
    this.environments.delete(name);
    this.healthStatuses.delete(name);
    this.resourceSnapshots.delete(name);

    if (this.activeEnvName === name) {
      // Switch to another environment if available
      const remaining = Array.from(this.environments.keys());
      this.activeEnvName = remaining.length > 0 ? remaining[0] : undefined;
    }
  }

  /**
   * Get an environment by name.
   */
  get(name: string): ExecutionEnvironment | undefined {
    return this.environments.get(name);
  }

  /**
   * Get the currently active environment.
   */
  getActive(): ExecutionEnvironment | undefined {
    if (!this.activeEnvName) return undefined;
    return this.environments.get(this.activeEnvName);
  }

  /**
   * Get the name of the active environment.
   */
  getActiveName(): string | undefined {
    return this.activeEnvName;
  }

  /**
   * Switch the active environment by name.
   */
  setActive(name: string): void {
    if (!this.environments.has(name)) {
      throw new Error(`Environment '${name}' not found. Available: ${this.listNames().join(', ')}`);
    }
    this.activeEnvName = name;
  }

  /**
   * List all registered environment names.
   */
  listNames(): string[] {
    return Array.from(this.environments.keys());
  }

  /**
   * Get detailed info about all registered environments.
   */
  listEnvironments(): EnvironmentInfo[] {
    const infos: EnvironmentInfo[] = [];
    for (const [name, env] of this.environments) {
      infos.push({
        name,
        type: env.type,
        isActive: name === this.activeEnvName,
        health: this.healthStatuses.get(name) ?? {
          healthy: false,
          lastCheck: new Date(),
          responseTime: 0,
        },
        resources: this.resourceSnapshots.get(name) ?? null,
      });
    }
    return infos;
  }

  // -- Health checking --

  /**
   * Run a health check on a specific environment.
   */
  async checkHealth(name: string): Promise<HealthStatus> {
    const env = this.environments.get(name);
    if (!env) {
      throw new Error(`Environment '${name}' not found`);
    }

    const startTime = Date.now();
    let status: HealthStatus;

    try {
      const alive = await env.isAlive();
      const responseTime = Date.now() - startTime;

      status = {
        healthy: alive,
        lastCheck: new Date(),
        responseTime,
        error: alive ? undefined : 'Environment reported as not alive',
      };
    } catch (err: any) {
      status = {
        healthy: false,
        lastCheck: new Date(),
        error: err.message || String(err),
        responseTime: Date.now() - startTime,
      };
    }

    const previous = this.healthStatuses.get(name);
    this.healthStatuses.set(name, status);

    // Notify on health state change
    if (previous && previous.healthy !== status.healthy && this.onHealthChange) {
      this.onHealthChange(name, status);
    }

    return status;
  }

  /**
   * Run health checks on all registered environments.
   */
  async checkAllHealth(): Promise<Map<string, HealthStatus>> {
    const results = new Map<string, HealthStatus>();
    const checks = Array.from(this.environments.entries()).map(async ([name]) => {
      const status = await this.checkHealth(name);
      results.set(name, status);
    });
    await Promise.allSettled(checks);
    return results;
  }

  /**
   * Start periodic health checks.
   */
  startHealthChecks(): void {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(async () => {
      await this.checkAllHealth();
    }, this.healthCheckInterval);
  }

  /**
   * Stop periodic health checks.
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  // -- Resource monitoring --

  /**
   * Gather resource usage for a specific environment.
   * Runs `top`, `free`, and `df` inside the environment to collect metrics.
   */
  async checkResources(name: string): Promise<ResourceUsage> {
    const env = this.environments.get(name);
    if (!env) throw new Error(`Environment '${name}' not found`);

    const defaults: ResourceUsage = {
      cpu: 0,
      memoryUsed: 0,
      memoryTotal: 0,
      memoryPercent: 0,
      diskUsed: 0,
      diskTotal: 0,
      diskPercent: 0,
    };

    try {
      // CPU: read load average from /proc/loadavg or `uptime`
      const cpuResult = await env.execute('cat /proc/loadavg 2>/dev/null || uptime');
      if (cpuResult.exitCode === 0) {
        const loadMatch = cpuResult.stdout.match(/([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
        if (loadMatch) {
          // Use 1-min load average, rough estimate of CPU %
          defaults.cpu = Math.min(100, parseFloat(loadMatch[1]) * 100);
        }
      }

      // Memory: parse /proc/meminfo or `free`
      const memResult = await env.execute(
        'cat /proc/meminfo 2>/dev/null || free -b'
      );
      if (memResult.exitCode === 0) {
        const parsed = this.parseMemory(memResult.stdout);
        if (parsed) {
          defaults.memoryUsed = parsed.used;
          defaults.memoryTotal = parsed.total;
          defaults.memoryPercent = parsed.total > 0
            ? Math.round((parsed.used / parsed.total) * 100)
            : 0;
        }
      }

      // Disk: parse `df` output for the working directory
      const diskResult = await env.execute('df -B1 . | tail -1');
      if (diskResult.exitCode === 0) {
        const parts = diskResult.stdout.trim().split(/\s+/);
        if (parts.length >= 4) {
          defaults.diskTotal = parseInt(parts[1], 10) || 0;
          defaults.diskUsed = parseInt(parts[2], 10) || 0;
          defaults.diskPercent = defaults.diskTotal > 0
            ? Math.round((defaults.diskUsed / defaults.diskTotal) * 100)
            : 0;
        }
      }
    } catch {
      // Resource gathering is best-effort; return what we have
    }

    this.resourceSnapshots.set(name, defaults);
    return defaults;
  }

  /**
   * Gather resource usage for all environments.
   */
  async checkAllResources(): Promise<Map<string, ResourceUsage>> {
    const results = new Map<string, ResourceUsage>();
    const checks = Array.from(this.environments.keys()).map(async (name) => {
      const usage = await this.checkResources(name);
      results.set(name, usage);
    });
    await Promise.allSettled(checks);
    return results;
  }

  // -- Execution (delegate to active environment) --

  /**
   * Execute a command in the active environment.
   */
  async execute(command: string, options?: ExecOptions): Promise<ExecResult> {
    const env = this.getActive();
    if (!env) {
      throw new Error('No active environment. Call addFromConfig() or setActive() first.');
    }
    return env.execute(command, options);
  }

  /**
   * Execute a command in a specific named environment.
   */
  async executeIn(name: string, command: string, options?: ExecOptions): Promise<ExecResult> {
    const env = this.environments.get(name);
    if (!env) {
      throw new Error(`Environment '${name}' not found`);
    }
    return env.execute(command, options);
  }

  // -- Failover --

  /**
   * Execute with automatic failover. If the active environment fails,
   * try the next healthy one.
   */
  async executeWithFailover(
    command: string,
    options?: ExecOptions,
  ): Promise<ExecResult & { environment: string }> {
    // Build ordered list: active first, then others by health
    const envNames = this.getFailoverOrder();

    let lastError: Error | undefined;

    for (const name of envNames) {
      const env = this.environments.get(name)!;
      const health = this.healthStatuses.get(name);

      // Skip known-unhealthy environments
      if (health && !health.healthy) continue;

      try {
        const result = await env.execute(command, options);
        return { ...result, environment: name };
      } catch (err: any) {
        lastError = err;
        // Mark as unhealthy
        this.healthStatuses.set(name, {
          healthy: false,
          lastCheck: new Date(),
          error: err.message,
          responseTime: 0,
        });
      }
    }

    throw new Error(
      `All environments failed for command: ${command}. ` +
      `Last error: ${lastError?.message ?? 'unknown'}`
    );
  }

  // -- Cleanup --

  /**
   * Dispose all environments and stop health checks.
   */
  async disposeAll(): Promise<void> {
    this.stopHealthChecks();

    const disposes = Array.from(this.environments.values()).map((env) =>
      env.dispose().catch(() => {})
    );
    await Promise.allSettled(disposes);

    this.environments.clear();
    this.healthStatuses.clear();
    this.resourceSnapshots.clear();
    this.activeEnvName = undefined;
  }

  // -- Private helpers --

  private getFailoverOrder(): string[] {
    const names: string[] = [];

    // Active environment first
    if (this.activeEnvName && this.environments.has(this.activeEnvName)) {
      names.push(this.activeEnvName);
    }

    // Then others
    for (const name of this.environments.keys()) {
      if (name !== this.activeEnvName) {
        names.push(name);
      }
    }

    return names;
  }

  private parseMemory(output: string): { total: number; used: number } | null {
    // Try /proc/meminfo format
    const memTotalMatch = output.match(/MemTotal:\s+(\d+)\s+kB/);
    const memAvailMatch = output.match(/MemAvailable:\s+(\d+)\s+kB/);

    if (memTotalMatch && memAvailMatch) {
      const total = parseInt(memTotalMatch[1], 10) * 1024;
      const available = parseInt(memAvailMatch[1], 10) * 1024;
      return { total, used: total - available };
    }

    // Try `free -b` format: "Mem:  total  used  free  shared  buff/cache  available"
    const freeMatch = output.match(/Mem:\s+(\d+)\s+(\d+)/);
    if (freeMatch) {
      return {
        total: parseInt(freeMatch[1], 10),
        used: parseInt(freeMatch[2], 10),
      };
    }

    return null;
  }
}

// -- Singleton for convenience --

let defaultManager: EnvironmentManager | undefined;

/**
 * Get the global singleton EnvironmentManager.
 */
export function getEnvironmentManager(): EnvironmentManager {
  if (!defaultManager) {
    defaultManager = new EnvironmentManager();
  }
  return defaultManager;
}

/**
 * Reset the global singleton (mainly for testing).
 */
export function resetEnvironmentManager(): void {
  if (defaultManager) {
    defaultManager.disposeAll().catch(() => {});
    defaultManager = undefined;
  }
}
