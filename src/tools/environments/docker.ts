/**
 * Docker Execution Environment
 *
 * Runs commands inside Docker containers. Supports:
 * - Persistent containers via `docker exec`
 * - Ephemeral containers via `docker run`
 * - File operations via `docker cp`
 * - Volume mounting and network isolation
 * - Full container lifecycle management
 */

import { spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ExecutionEnvironment, ExecOptions, ExecResult, EnvironmentConfig } from './types';

export class DockerEnvironment implements ExecutionEnvironment {
  readonly name: string;
  readonly type = 'docker' as const;

  private image: string;
  private volumes: string[];
  private network: string | undefined;
  private extraArgs: string[];
  private defaultTimeout: number;

  private containerId: string | undefined;
  private containerName: string;
  private initialized = false;
  private disposed = false;
  private persistent: boolean;

  constructor(config: EnvironmentConfig, name?: string) {
    this.name = name ?? config.name ?? 'docker';
    this.image = config.dockerImage ?? 'ubuntu:22.04';
    this.volumes = config.dockerVolumes ?? [];
    this.network = config.dockerNetwork;
    this.extraArgs = config.dockerExtraArgs ?? [];
    this.defaultTimeout = config.defaultTimeout ?? 60000;
    this.containerName = `mimo-env-${this.name}-${Date.now()}`;
    // Use persistent container for repeated commands (avoids startup overhead)
    this.persistent = true;
  }

  async init(): Promise<void> {
    if (this.disposed) throw new Error('DockerEnvironment has been disposed');

    // Verify Docker is available
    await this.docker(['info'], 10000);

    // Pull image if not available locally
    try {
      await this.docker(['image', 'inspect', this.image], 10000);
    } catch {
      await this.docker(['pull', this.image], 300000);
    }

    if (this.persistent) {
      // Create a persistent container that stays running
      await this.createPersistentContainer();
    }

    this.initialized = true;
  }

  async execute(command: string, options?: ExecOptions): Promise<ExecResult> {
    this.ensureInitialized();

    const timeout = options?.timeout ?? this.defaultTimeout;
    const startTime = Date.now();

    if (this.persistent && this.containerId) {
      return this.execInContainer(command, options, timeout, startTime);
    }

    return this.runEphemeral(command, options, timeout, startTime);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.ensureInitialized();

    // Write content to a temp file, then docker cp into container
    const tmpFile = path.join(os.tmpdir(), `mimo-docker-${Date.now()}`);
    try {
      await fs.writeFile(tmpFile, content, 'utf-8');
      await this.copyToContainer(tmpFile, filePath);
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }

  async readFile(filePath: string): Promise<string> {
    this.ensureInitialized();

    const tmpFile = path.join(os.tmpdir(), `mimo-docker-read-${Date.now()}`);
    try {
      await this.copyFromContainer(filePath, tmpFile);
      return await fs.readFile(tmpFile, 'utf-8');
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }

  async listDir(dirPath: string): Promise<string[]> {
    this.ensureInitialized();
    const result = await this.execute(`ls -1 ${this.shellEscape(dirPath)}`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to list directory: ${result.stderr}`);
    }
    return result.stdout.split('\n').filter((line) => line.length > 0);
  }

  async exists(filePath: string): Promise<boolean> {
    this.ensureInitialized();
    const result = await this.execute(
      `test -e ${this.shellEscape(filePath)} && echo "yes" || echo "no"`
    );
    return result.stdout.trim() === 'yes';
  }

  async mkdir(dirPath: string): Promise<void> {
    this.ensureInitialized();
    const result = await this.execute(`mkdir -p ${this.shellEscape(dirPath)}`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create directory: ${result.stderr}`);
    }
  }

  async rm(targetPath: string): Promise<void> {
    this.ensureInitialized();
    const result = await this.execute(`rm -rf ${this.shellEscape(targetPath)}`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to remove: ${result.stderr}`);
    }
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    this.ensureInitialized();
    await this.copyToContainer(localPath, remotePath);
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    this.ensureInitialized();
    await this.copyFromContainer(remotePath, localPath);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    if (this.containerId) {
      try {
        await this.docker(['rm', '-f', this.containerId], 15000);
      } catch {
        // Best-effort cleanup
      }
      this.containerId = undefined;
    }
  }

  async isAlive(): Promise<boolean> {
    if (this.disposed || !this.containerId) return false;
    try {
      const result = await this.docker(
        ['inspect', '-f', '{{.State.Running}}', this.containerId],
        5000
      );
      return result.stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  // -- Container Management --

  /** Get the container ID (for external inspection) */
  getContainerId(): string | undefined {
    return this.containerId;
  }

  /** Stop and remove the container, then create a fresh one */
  async restart(): Promise<void> {
    if (this.containerId) {
      await this.docker(['rm', '-f', this.containerId], 15000).catch(() => {});
      this.containerId = undefined;
    }
    await this.createPersistentContainer();
  }

  // -- Private helpers --

  private ensureInitialized(): void {
    if (this.disposed) throw new Error('DockerEnvironment has been disposed');
    if (!this.initialized) throw new Error('DockerEnvironment not initialized; call init() first');
  }

  private async createPersistentContainer(): Promise<void> {
    const args = ['run', '-d', '--name', this.containerName];

    // Add volume mounts
    for (const vol of this.volumes) {
      args.push('-v', vol);
    }

    // Add network
    if (this.network) {
      args.push('--network', this.network);
    }

    // Add extra args
    args.push(...this.extraArgs);

    // Keep container alive with tail -f /dev/null
    args.push(this.image, 'tail', '-f', '/dev/null');

    const result = await this.docker(args, 60000);
    this.containerId = result.stdout.trim();
  }

  private async execInContainer(
    command: string,
    options: ExecOptions | undefined,
    timeout: number,
    startTime: number,
  ): Promise<ExecResult> {
    const args = ['exec', '-i'];

    // Set working directory
    const cwd = options?.cwd ?? '/';
    args.push('-w', cwd);

    // Set environment variables
    if (options?.env) {
      for (const [key, value] of Object.entries(options.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    args.push(this.containerId!, '/bin/sh', '-c', command);

    return this.dockerCapture(args, timeout, startTime, options?.stdin);
  }

  private async runEphemeral(
    command: string,
    options: ExecOptions | undefined,
    timeout: number,
    startTime: number,
  ): Promise<ExecResult> {
    const args = ['run', '--rm', '-i'];

    // Set working directory
    const cwd = options?.cwd ?? '/';
    args.push('-w', cwd);

    // Set environment variables
    if (options?.env) {
      for (const [key, value] of Object.entries(options.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    // Add volume mounts
    for (const vol of this.volumes) {
      args.push('-v', vol);
    }

    // Add network
    if (this.network) {
      args.push('--network', this.network);
    }

    // Add extra args
    args.push(...this.extraArgs);

    args.push(this.image, '/bin/sh', '-c', command);

    return this.dockerCapture(args, timeout, startTime, options?.stdin);
  }

  private async copyToContainer(localPath: string, containerPath: string): Promise<void> {
    const absLocal = path.resolve(localPath);
    // Ensure parent directory exists in container
    const containerDir = path.posix.dirname(containerPath);
    await this.execute(`mkdir -p ${this.shellEscape(containerDir)}`);
    await this.docker(['cp', absLocal, `${this.containerId}:${containerPath}`], 30000);
  }

  private async copyFromContainer(containerPath: string, localPath: string): Promise<void> {
    const absLocal = path.resolve(localPath);
    await fs.mkdir(path.dirname(absLocal), { recursive: true });
    await this.docker(['cp', `${this.containerId}:${containerPath}`, absLocal], 30000);
  }

  /**
   * Run a docker CLI command and capture output.
   */
  private async docker(args: string[], timeout: number): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Docker command timed out after ${timeout}ms: docker ${args.join(' ')}`));
      }, timeout);

      child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Docker exited with code ${code}: ${stderr || stdout}`));
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to run docker: ${err.message}`));
      });
    });
  }

  /**
   * Run a docker CLI command, capturing output as an ExecResult.
   */
  private async dockerCapture(
    args: string[],
    timeout: number,
    startTime: number,
    stdin?: string,
  ): Promise<ExecResult> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeout);

      child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      // Write stdin if provided
      if (stdin && child.stdin) {
        child.stdin.write(stdin);
        child.stdin.end();
      }

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          stdout: this.truncateOutput(stdout),
          stderr: this.truncateOutput(stderr),
          exitCode: code ?? -1,
          duration: Date.now() - startTime,
          timedOut,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr: `Docker spawn error: ${err.message}`,
          exitCode: -1,
          duration: Date.now() - startTime,
          timedOut: false,
        });
      });
    });
  }

  private shellEscape(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
  }

  private truncateOutput(output: string, maxChars: number = 200_000): string {
    if (output.length <= maxChars) return output;
    return output.slice(0, maxChars) + `\n\n... [Output truncated: ${output.length - maxChars} characters omitted]`;
  }
}
