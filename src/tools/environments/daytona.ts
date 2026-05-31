/**
 * Daytona Sandbox Environment
 *
 * Uses the Daytona SDK for cloud-based sandbox execution with
 * built-in git workspace integration. Daytona provides fast
 * provisioning of development environments.
 *
 * Prerequisites: `daytona` CLI must be installed and configured.
 * See: https://daytona.io
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { ExecutionEnvironment, ExecOptions, ExecResult, EnvironmentConfig } from './types';

export class DaytonaEnvironment implements ExecutionEnvironment {
  readonly name: string;
  readonly type = 'daytona' as const;

  private target: string;
  private workspaceId: string | undefined;
  private defaultTimeout: number;

  private initialized = false;
  private disposed = false;

  constructor(config: EnvironmentConfig, name?: string) {
    this.name = name ?? config.name ?? 'daytona';
    this.target = config.daytonaTarget ?? 'local';
    this.workspaceId = config.daytonaWorkspaceId;
    this.defaultTimeout = config.defaultTimeout ?? 60000;
  }

  async init(): Promise<void> {
    if (this.disposed) throw new Error('DaytonaEnvironment has been disposed');

    // Verify Daytona CLI is available
    try {
      await this.execDaytona(['--version'], 10000);
    } catch {
      throw new Error(
        'Daytona CLI is not installed. Install from: https://daytona.io/install'
      );
    }

    // If no workspace ID provided, create a new sandbox
    if (!this.workspaceId) {
      await this.createSandbox();
    } else {
      // Verify the existing workspace is reachable
      const alive = await this.isAlive();
      if (!alive) {
        throw new Error(`Daytona workspace ${this.workspaceId} is not running`);
      }
    }

    this.initialized = true;
  }

  async execute(command: string, options?: ExecOptions): Promise<ExecResult> {
    this.ensureInitialized();

    const timeout = options?.timeout ?? this.defaultTimeout;
    const startTime = Date.now();

    // Build the command with environment variables and cwd
    const wrappedCommand = this.wrapCommand(command, options?.cwd, options?.env);

    try {
      const result = await this.execDaytona(
        ['exec', this.workspaceId!, '--', '/bin/sh', '-c', wrappedCommand],
        timeout,
      );

      return {
        stdout: this.truncateOutput(result.stdout),
        stderr: this.truncateOutput(result.stderr),
        exitCode: 0,
        duration: Date.now() - startTime,
        timedOut: false,
      };
    } catch (err: any) {
      const duration = Date.now() - startTime;
      const message = err.message || String(err);
      const timedOut = message.includes('timed out');

      return {
        stdout: '',
        stderr: `Daytona execution error: ${message}`,
        exitCode: -1,
        duration,
        timedOut,
      };
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.ensureInitialized();

    // Write to temp file, then use daytona cp to push
    const tmpFile = path.join(os.tmpdir(), `mimo-daytona-write-${Date.now()}`);
    try {
      await fs.writeFile(tmpFile, content, 'utf-8');
      await this.upload(tmpFile, filePath);
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }

  async readFile(filePath: string): Promise<string> {
    this.ensureInitialized();

    const tmpFile = path.join(os.tmpdir(), `mimo-daytona-read-${Date.now()}`);
    try {
      await this.download(filePath, tmpFile);
      return await fs.readFile(tmpFile, 'utf-8');
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
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
    // Ensure remote parent directory exists
    const remoteDir = path.posix.dirname(remotePath);
    await this.execute(`mkdir -p ${this.shellEscape(remoteDir)}`);

    await this.execDaytona(
      ['cp', this.workspaceId!, absLocal, remotePath],
      60000,
    );
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    this.ensureInitialized();

    const absLocal = path.resolve(localPath);
    await fs.mkdir(path.dirname(absLocal), { recursive: true });

    await this.execDaytona(
      ['cp', this.workspaceId!, remotePath, absLocal],
      60000,
    );
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    if (this.workspaceId) {
      await this.execDaytona(['delete', this.workspaceId, '--yes'], 30000).catch(() => {});
      this.workspaceId = undefined;
    }
  }

  async isAlive(): Promise<boolean> {
    if (this.disposed || !this.workspaceId) return false;
    try {
      const result = await this.execDaytona(
        ['info', this.workspaceId, '--json'],
        10000,
      );
      const info = JSON.parse(result.stdout);
      return info.state === 'started' || info.status === 'running';
    } catch {
      return false;
    }
  }

  // -- Git workspace integration --

  /**
   * Clone a git repository into the workspace.
   */
  async gitClone(repoUrl: string, targetDir?: string): Promise<void> {
    this.ensureInitialized();
    const cmd = targetDir
      ? `git clone ${this.shellEscape(repoUrl)} ${this.shellEscape(targetDir)}`
      : `git clone ${this.shellEscape(repoUrl)}`;
    const result = await this.execute(cmd, { timeout: 120000 });
    if (result.exitCode !== 0) {
      throw new Error(`git clone failed: ${result.stderr}`);
    }
  }

  /**
   * Get the workspace's git status.
   */
  async gitStatus(repoDir?: string): Promise<string> {
    const cwd = repoDir ?? '/';
    const result = await this.execute('git status', { cwd });
    return result.stdout;
  }

  // -- Private helpers --

  private ensureInitialized(): void {
    if (this.disposed) throw new Error('DaytonaEnvironment has been disposed');
    if (!this.initialized) throw new Error('DaytonaEnvironment not initialized; call init() first');
  }

  private async createSandbox(): Promise<void> {
    const args = ['create', '--target', this.target];
    const result = await this.execDaytona(args, 120000);

    // Parse workspace ID from output
    // Daytona typically outputs: "Workspace <id> created" or JSON
    try {
      const json = JSON.parse(result.stdout);
      this.workspaceId = json.id || json.workspace_id || json.name;
    } catch {
      // Fallback: extract from text output
      const match = result.stdout.match(/(?:workspace|id)[:\s]+(\S+)/i);
      if (match) {
        this.workspaceId = match[1];
      } else {
        this.workspaceId = result.stdout.trim().split(/\s+/).pop();
      }
    }

    if (!this.workspaceId) {
      throw new Error(`Failed to parse Daytona workspace ID from: ${result.stdout}`);
    }

    // Wait for the workspace to be ready
    await this.waitForReady(120000);
  }

  private async waitForReady(timeoutMs: number): Promise<void> {
    const start = Date.now();
    const pollInterval = 3000;

    while (Date.now() - start < timeoutMs) {
      try {
        const result = await this.execDaytona(
          ['info', this.workspaceId!, '--json'],
          10000,
        );
        const info = JSON.parse(result.stdout);
        if (info.state === 'started' || info.status === 'running') return;
      } catch {
        // Workspace may still be provisioning
      }
      await this.sleep(pollInterval);
    }

    throw new Error(`Daytona workspace did not become ready within ${timeoutMs}ms`);
  }

  private wrapCommand(
    command: string,
    cwd?: string,
    env?: Record<string, string>,
  ): string {
    const parts: string[] = [];

    if (env) {
      for (const [key, value] of Object.entries(env)) {
        parts.push(`export ${key}=${this.shellEscape(value)}`);
      }
    }

    if (cwd) {
      parts.push(`cd ${this.shellEscape(cwd)}`);
    }

    parts.push(command);
    return parts.join(' && ');
  }

  private execDaytona(
    args: string[],
    timeout: number,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const child = spawn('daytona', args, { stdio: ['ignore', 'pipe', 'pipe'] });

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Daytona command timed out after ${timeout}ms: daytona ${args.join(' ')}`));
      }, timeout);

      child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(`Daytona exited with code ${code}: ${stderr || stdout}`));
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`Daytona spawn error: ${err.message}`));
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
