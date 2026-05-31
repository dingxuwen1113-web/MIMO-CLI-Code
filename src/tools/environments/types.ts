/**
 * Multi-backend Terminal Execution System - Type Definitions
 *
 * Defines the core interfaces for executing commands across different
 * backend environments: local, Docker, SSH, Modal, Daytona, and Singularity.
 */

export interface ExecOptions {
  /** Working directory for the command */
  cwd?: string;
  /** Environment variables to set (merged with existing) */
  env?: Record<string, string>;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Data to pipe to stdin */
  stdin?: string;
  /** Whether to run via shell (default: true) */
  shell?: boolean;
}

export interface ExecResult {
  /** Captured standard output */
  stdout: string;
  /** Captured standard error */
  stderr: string;
  /** Process exit code (-1 if killed by signal) */
  exitCode: number;
  /** Wall-clock duration in milliseconds */
  duration: number;
  /** Whether the command was killed due to timeout */
  timedOut: boolean;
}

export interface ExecutionEnvironment {
  /** Human-readable environment name */
  readonly name: string;
  /** Backend type identifier */
  readonly type: 'local' | 'docker' | 'ssh' | 'modal' | 'daytona' | 'singularity';

  /** Initialize the environment (connect, pull images, etc.) */
  init(): Promise<void>;

  /** Execute a command and return the result */
  execute(command: string, options?: ExecOptions): Promise<ExecResult>;

  /** Write content to a file in the environment */
  writeFile(path: string, content: string): Promise<void>;

  /** Read a file from the environment */
  readFile(path: string): Promise<string>;

  /** List entries in a directory */
  listDir(path: string): Promise<string[]>;

  /** Check whether a path exists */
  exists(path: string): Promise<boolean>;

  /** Create a directory (including parents) */
  mkdir(path: string): Promise<void>;

  /** Remove a file or directory */
  rm(path: string): Promise<void>;

  /** Upload a local file into the environment */
  upload(localPath: string, remotePath: string): Promise<void>;

  /** Download a file from the environment to local disk */
  download(remotePath: string, localPath: string): Promise<void>;

  /** Shut down the environment and release resources */
  dispose(): Promise<void>;

  /** Check if the environment is still responsive */
  isAlive(): Promise<boolean>;
}

export interface EnvironmentConfig {
  /** Which backend to use */
  type: 'local' | 'docker' | 'ssh' | 'modal' | 'daytona' | 'singularity';

  // -- Docker options --
  /** Docker image to use (e.g. 'node:20-alpine') */
  dockerImage?: string;
  /** Volume mounts in 'host:container' format */
  dockerVolumes?: string[];
  /** Docker network name for isolation */
  dockerNetwork?: string;
  /** Extra docker run flags */
  dockerExtraArgs?: string[];

  // -- SSH options --
  /** Remote host address */
  sshHost?: string;
  /** SSH username */
  sshUser?: string;
  /** Path to SSH private key file */
  sshKey?: string;
  /** SSH port (default: 22) */
  sshPort?: number;
  /** SSH password (key-based auth preferred) */
  sshPassword?: string;

  // -- Modal options --
  /** Modal app name */
  modalApp?: string;
  /** Modal image definition */
  modalImage?: string;

  // -- Daytona options --
  /** Daytona target provider */
  daytonaTarget?: string;
  /** Daytona workspace ID to attach to */
  daytonaWorkspaceId?: string;

  // -- Singularity options --
  /** Path to Singularity image file (.sif) */
  singularityImage?: string;
  /** Singularity bind mounts */
  singularityBind?: string[];

  // -- General options --
  /** Display name for this environment */
  name?: string;
  /** Default command timeout in milliseconds */
  defaultTimeout?: number;
}
