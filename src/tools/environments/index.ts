/**
 * Multi-backend Terminal Execution System
 *
 * Provides a unified interface for executing commands across different
 * backend environments: local, Docker, SSH, Modal, Daytona, and Singularity.
 *
 * Usage:
 * ```typescript
 * import { EnvironmentManager, EnvironmentConfig } from './tools/environments';
 *
 * const manager = new EnvironmentManager();
 *
 * // Create a Docker environment
 * await manager.addFromConfig({
 *   type: 'docker',
 *   dockerImage: 'node:20-alpine',
 *   dockerVolumes: ['/tmp/workspace:/workspace'],
 * }, true);
 *
 * // Execute commands
 * const result = await manager.execute('npm install');
 * console.log(result.stdout);
 *
 * // Or use failover across multiple environments
 * const result = await manager.executeWithFailover('npm test');
 * ```
 */

// Core types
export type {
  ExecOptions,
  ExecResult,
  ExecutionEnvironment,
  EnvironmentConfig,
} from './types';

// Environment implementations
export { LocalEnvironment } from './local';
export { DockerEnvironment } from './docker';
export { SSHEnvironment } from './ssh';
export { ModalEnvironment } from './modal';
export { DaytonaEnvironment } from './daytona';
export { SingularityEnvironment } from './singularity';

// Manager
export {
  EnvironmentManager,
  getEnvironmentManager,
  resetEnvironmentManager,
} from './manager';

export type {
  HealthStatus,
  ResourceUsage,
  EnvironmentInfo,
} from './manager';
