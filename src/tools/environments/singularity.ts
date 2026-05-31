/**
 * Singularity/Apptainer Container Environment
 *
 * Executes commands inside Singularity (now Apptainer) containers.
 * Singularity is widely used in HPC environments and provides:
 * - Unprivileged container execution
 * - Native integration with HPC job schedulers (SLURM, PBS, etc.)
 * - OCI compatibility
 * - Read-only base images with writable overlays
 *
 * Prerequisites: `singularity` or `apptainer` CLI must be installed.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { ExecutionEnvironment, ExecOptions, ExecResult, EnvironmentConfig } from './types';

export class SingularityEnvironment implements ExecutionEnvironment {
  readonly name: string;
  readonly type = 'singularity' as const;

  private imagePath: string;
  private bindMounts: string[];
  private defaultTimeout: number;
  private defaultCwd: string;

  private cliCommand: 'singularity' | 'apptainer';
  private initialized = false;
  private disposed = false;

  constructor(config: EnvironmentConfig, name?: string) {
    this.name = name ?? config.name ?? 'singularity';
    this.imagePath = config.singularityImage ?? '';
    this.bindMounts = config.singularityBind ?? [];
    this.defaultTimeout = config.defaultTimeout ?? 60000;
    this.defaultCwd = '/tmp';
    this.cliCommand = 'singularity'; // Will be determined during init
  }

  async init(): Promise<void> {
    if (this.disposed) throw new Error('SingularityEnvironment has been disposed');

    // Determine which CLI is available (prefer apptainer, fall back to singularity)
    this.cliCommand = await this.detectCLI();

    // Validate the image exists
    if (!this.imagePath) {
      throw new Error('No Singularity image specified. Set singularityImage in config.');
    }

    // If the image path is a URI (library://, docker://, etc.), pull it first
    if (this.isRemoteUri(this.imagePath)) {
      this.imagePath = await this.pullImage(this.imagePath);
    } else {
      // Verify local image file exists
      try {
        await fs.access(this.imagePath);
      } catch {
        throw new Error(`Singularity image not found: ${this.imagePath}`);
      }
    }

    // Run a quick test to verify the container works
    const testResult = await this.executeRaw('echo "ok"', 10000);
    if (testResult.stdout.trim() !== 'ok') {
      throw new Error(
        `Singularity container test failed. stderr: ${testResult.stderr}`
      );
    }

    this.initialized = true;
  }

  async execute(command: string, options?: ExecOptions): Promise<ExecResult> {
    this.ensureInitialized();

    const timeout = options?.timeout ?? this.defaultTimeout;
    const cwd = options?.cwd ?? this.defaultCwd;
    const startTime = Date.now();

    // Build environment variable flags
    const envArgs: string[] = [];
    if (options?.env) {
      for (const [key, value] of Object.entries(options.env)) {
        envArgs.push('--env', `${key}=${value}`);
      }
    }

    // Wrap command with cd
    const wrappedCommand = `cd ${this.shellEscape(cwd)} && ${command}`;

    const args = [
      'exec',
      ...this.buildBindArgs(),
      ...envArgs,
      this.imagePath,
      '/bin/sh', '-c', wrappedCommand,
    ];

    return this.execCapture(args, timeout, startTime, options?.stdin);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.ensureInitialized();

    // Use --writable-tmpfs for the exec, write via the command
    const base64Content = Buffer.from(content).toString('base64');
    const remoteDir = path.posix.dirname(filePath);

    const command = `mkdir -p ${this.shellEscape(remoteDir)} && echo '${base64Content}' | base64 -d > ${this.shellEscape(filePath)}`;

    const args = [
      'exec',
      '--writable-tmpfs',
      ...this.buildBindArgs(),
      this.imagePath,
      '/bin/sh', '-c', command,
    ];

    const result = await this.execCapture(args, 30000, Date.now());
    if (result.exitCode !== 0) {
      throw new Error(`Failed to write file: ${result.stderr}`);
    }
  }

  async readFile(filePath: string): Promise<string> {
    this.ensureInitialized();

    const command = `cat ${this.shellEscape(filePath)}`;
    const args = [
      'exec',
      ...this.buildBindArgs(),
      this.imagePath,
      '/bin/sh', '-c', command,
    ];

    const result = await this.execCapture(args, 30000, Date.now());
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file: ${result.stderr}`);
    }
    return result.stdout;
  }

  async listDir(dirPath: string): Promise<string[]> {
    const result = await this.execute(`ls -1 ${this.shellEscape(dirPath)}`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to list directory: ${result.stderr}`);
    }
    return result.stdout.split('\n').filter((line) => line.length > 0);
  }

  async exists(filePath: string): Promise<boolean> {
    const result = await this.execute(
      `test -e ${this.shellEscape(filePath)} && echo "yes" || echo "no"`
    );
    return result.stdout.trim() === 'yes';
  }

  async mkdir(dirPath: string): Promise<void> {
    const result = await this.execute(`mkdir -p ${this.shellEscape(dirPath)}`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create directory: ${result.stderr}`);
    }
  }

  async rm(targetPath: string): Promise<void> {
    const result = await this.execute(`rm -rf ${this.shellEscape(targetPath)}`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to remove: ${result.stderr}`);
    }
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    this.ensureInitialized();

    const absLocal = path.resolve(localPath);

    // For Singularity, the simplest approach is to bind-mount the source
    // directory and copy inside the container.
    const sourceDir = path.dirname(absLocal);
    const sourceFile = path.basename(absLocal);
    const remoteDir = path.posix.dirname(remotePath);

    const command = `mkdir -p ${this.shellEscape(remoteDir)} && cp ${this.shellEscape('/mnt/source/' + sourceFile)} ${this.shellEscape(remotePath)}`;

    const args = [
      'exec',
      '--writable-tmpfs',
      `-B`, `${sourceDir}:/mnt/source:ro`,
      ...this.buildBindArgs(),
      this.imagePath,
      '/bin/sh', '-c', command,
    ];

    const result = await this.execCapture(args, 60000, Date.now());
    if (result.exitCode !== 0) {
      throw new Error(`Failed to upload file: ${result.stderr}`);
    }
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    this.ensureInitialized();

    const absLocal = path.resolve(localPath);
    const destDir = path.dirname(absLocal);
    const destFile = path.basename(absLocal);

    await fs.mkdir(destDir, { recursive: true });

    const command = `cp ${this.shellEscape(remotePath)} ${this.shellEscape('/mnt/dest/' + destFile)}`;

    const args = [
      'exec',
      `-B`, `${destDir}:/mnt/dest`,
      ...this.buildBindArgs(),
      this.imagePath,
      '/bin/sh', '-c', command,
    ];

    const result = await this.execCapture(args, 60000, Date.now());
    if (result.exitCode !== 0) {
      throw new Error(`Failed to download file: ${result.stderr}`);
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    // Singularity doesn't maintain running daemons, nothing to clean up
  }

  async isAlive(): Promise<boolean> {
    if (this.disposed) return false;
    try {
      const test = await this.executeRaw('echo "alive"', 5000);
      return test.stdout.trim() === 'alive';
    } catch {
      return false;
    }
  }

  // -- Private helpers --

  private ensureInitialized(): void {
    if (this.disposed) throw new Error('SingularityEnvironment has been disposed');
    if (!this.initialized) throw new Error('SingularityEnvironment not initialized; call init() first');
  }

  /**
   * Detect whether `apptainer` or `singularity` CLI is available.
   * Prefers apptainer (the newer name).
   */
  private async detectCLI(): Promise<'singularity' | 'apptainer'> {
    try {
      await this.execCLI('apptainer', ['version'], 5000);
      return 'apptainer';
    } catch {
      // Fall back to singularity
    }

    try {
      await this.execCLI('singularity', ['version'], 5000);
      return 'singularity';
    } catch {
      throw new Error(
        'Neither apptainer nor singularity CLI found. ' +
        'Install from: https://apptainer.org/docs/admin/main/installation.html'
      );
    }
  }

  /**
   * Check if a path is a remote URI (library://, docker://, shub://, etc.)
   */
  private isRemoteUri(imagePath: string): boolean {
    return /^(library|docker|shub|oras|https?|ftp):\/\//.test(imagePath);
  }

  /**
   * Pull a remote image to a local cache.
   */
  private async pullImage(uri: string): Promise<string> {
    const cacheDir = path.join(os.homedir(), '.mimo', 'singularity-cache');
    await fs.mkdir(cacheDir, { recursive: true });

    // Generate a local filename from the URI
    const sanitized = uri.replace(/[^a-zA-Z0-9._-]/g, '_');
    const localPath = path.join(cacheDir, `${sanitized}.sif`);

    // Check if already cached
    try {
      await fs.access(localPath);
      return localPath;
    } catch {
      // Not cached, need to pull
    }

    await this.execCLI(this.cliCommand, ['pull', '--force', localPath, uri], 600000);
    return localPath;
  }

  /**
   * Build --bind arguments from configured mounts.
   */
  private buildBindArgs(): string[] {
    const args: string[] = [];
    for (const mount of this.bindMounts) {
      args.push('--bind', mount);
    }
    return args;
  }

  private async executeRaw(command: string, timeout: number): Promise<ExecResult> {
    const args = [
      'exec',
      ...this.buildBindArgs(),
      this.imagePath,
      '/bin/sh', '-c', command,
    ];
    return this.execCapture(args, timeout, Date.now());
  }

  private execCapture(
    args: string[],
    timeout: number,
    startTime: number,
    stdin?: string,
  ): Promise<ExecResult> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const child = spawn(this.cliCommand, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeout);

      child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

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
          stderr: `Singularity spawn error: ${err.message}`,
          exitCode: -1,
          duration: Date.now() - startTime,
          timedOut: false,
        });
      });
    });
  }

  private execCLI(
    cmd: string,
    args: string[],
    timeout: number,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`${cmd} timed out after ${timeout}ms`));
      }, timeout);

      child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(`${cmd} exited with code ${code}: ${stderr || stdout}`));
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`${cmd} error: ${err.message}`));
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
