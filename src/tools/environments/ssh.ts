/**
 * SSH Execution Environment
 *
 * Connects to remote hosts via SSH and executes commands remotely.
 * Supports key-based and password authentication, connection pooling,
 * keepalive, and file transfer via SCP/SFTP.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as net from 'net';
import * as crypto from 'crypto';
import { ExecutionEnvironment, ExecOptions, ExecResult, EnvironmentConfig } from './types';

const execAsync = promisify(exec);

export class SSHEnvironment implements ExecutionEnvironment {
  readonly name: string;
  readonly type = 'ssh' as const;

  private host: string;
  private user: string;
  private keyPath: string | undefined;
  private password: string | undefined;
  private port: number;
  private defaultTimeout: number;
  private defaultCwd: string;

  private initialized = false;
  private disposed = false;
  private keepAliveInterval: ReturnType<typeof setInterval> | undefined;
  private controlSocket: string | undefined;

  constructor(config: EnvironmentConfig, name?: string) {
    this.name = name ?? config.name ?? 'ssh';
    this.host = config.sshHost ?? 'localhost';
    this.user = config.sshUser ?? os.userInfo().username;
    this.keyPath = config.sshKey;
    this.password = config.sshPassword;
    this.port = config.sshPort ?? 22;
    this.defaultTimeout = config.defaultTimeout ?? 60000;
    this.defaultCwd = '/tmp';
  }

  async init(): Promise<void> {
    if (this.disposed) throw new Error('SSHEnvironment has been disposed');

    // Verify SSH client is available
    try {
      await execAsync('ssh -V');
    } catch {
      throw new Error('SSH client is not installed or not in PATH');
    }

    // Test connectivity
    const alive = await this.checkConnection();
    if (!alive) {
      throw new Error(
        `Cannot connect to ${this.user}@${this.host}:${this.port}. ` +
        `Verify the host is reachable and credentials are correct.`
      );
    }

    // Set up a control socket for connection multiplexing
    this.controlSocket = path.join(
      os.tmpdir(),
      `mimo-ssh-${this.name}-${crypto.randomBytes(4).toString('hex')}.sock`
    );

    // Open a master connection
    await this.openMasterConnection();

    // Start keepalive to prevent idle disconnects
    this.keepAliveInterval = setInterval(() => {
      this.sendKeepAlive().catch(() => {});
    }, 30000);

    this.initialized = true;
  }

  async execute(command: string, options?: ExecOptions): Promise<ExecResult> {
    this.ensureInitialized();

    const cwd = options?.cwd ?? this.defaultCwd;
    const timeout = options?.timeout ?? this.defaultTimeout;
    const startTime = Date.now();

    // Wrap the command to set cwd and environment
    const wrappedCommand = this.wrapCommand(command, cwd, options?.env);

    return new Promise<ExecResult>((resolve) => {
      const sshArgs = this.buildSSHArgs(timeout);

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const child = spawn('ssh', [...sshArgs, wrappedCommand], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeout);

      child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      if (options?.stdin && child.stdin) {
        child.stdin.write(options.stdin);
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
          stderr: `SSH spawn error: ${err.message}`,
          exitCode: -1,
          duration: Date.now() - startTime,
          timedOut: false,
        });
      });
    });
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.ensureInitialized();

    const tmpFile = path.join(os.tmpdir(), `mimo-ssh-write-${Date.now()}`);
    try {
      await fs.writeFile(tmpFile, content, 'utf-8');
      await this.scpToRemote(tmpFile, filePath);
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }

  async readFile(filePath: string): Promise<string> {
    this.ensureInitialized();

    const tmpFile = path.join(os.tmpdir(), `mimo-ssh-read-${Date.now()}`);
    try {
      await this.scpFromRemote(filePath, tmpFile);
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
    await this.scpToRemote(path.resolve(localPath), remotePath);
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    this.ensureInitialized();
    await this.scpFromRemote(remotePath, path.resolve(localPath));
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = undefined;
    }

    // Close the control master connection
    if (this.controlSocket) {
      const args = [
        '-o', `ControlPath=${this.controlSocket}`,
        '-O', 'exit',
        `${this.user}@${this.host}`,
      ];
      await new Promise<void>((resolve) => {
        const child = spawn('ssh', args, { stdio: 'ignore' });
        child.on('close', () => resolve());
        child.on('error', () => resolve());
        setTimeout(() => { child.kill(); resolve(); }, 3000);
      });
      this.controlSocket = undefined;
    }
  }

  async isAlive(): Promise<boolean> {
    if (this.disposed) return false;
    return this.checkConnection();
  }

  // -- Private helpers --

  private ensureInitialized(): void {
    if (this.disposed) throw new Error('SSHEnvironment has been disposed');
    if (!this.initialized) throw new Error('SSHEnvironment not initialized; call init() first');
  }

  private async checkConnection(): Promise<boolean> {
    const args = this.buildSSHArgs(10000);
    return new Promise((resolve) => {
      const child = spawn('ssh', [...args, 'echo ok'], { stdio: ['ignore', 'pipe', 'ignore'] });
      let output = '';
      child.stdout?.on('data', (data: Buffer) => { output += data.toString(); });
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(false); }, 10000);
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code === 0 && output.trim() === 'ok');
      });
      child.on('error', () => { clearTimeout(timer); resolve(false); });
    });
  }

  private async openMasterConnection(): Promise<void> {
    const args = [
      '-f', '-N',
      '-o', `ControlPath=${this.controlSocket}`,
      '-o', 'ControlMaster=yes',
      '-o', 'ControlPersist=600',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ConnectTimeout=10',
      '-p', String(this.port),
    ];

    if (this.keyPath) {
      args.push('-i', this.keyPath);
    }

    args.push(`${this.user}@${this.host}`);

    return new Promise((resolve, reject) => {
      const child = spawn('ssh', args, { stdio: 'ignore' });
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('SSH master connection timed out'));
      }, 15000);

      child.on('close', (code) => {
        clearTimeout(timer);
        // ssh -f sends to background, so close(0) is expected
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`SSH master connection failed with code ${code}`));
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`SSH master connection error: ${err.message}`));
      });
    });
  }

  private buildSSHArgs(timeout: number): string[] {
    const args: string[] = [
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', `ConnectTimeout=${Math.min(Math.floor(timeout / 1000), 30)}`,
      '-p', String(this.port),
    ];

    if (this.controlSocket) {
      args.push('-o', `ControlPath=${this.controlSocket}`);
    }

    if (this.keyPath) {
      args.push('-i', this.keyPath);
    }

    args.push(`${this.user}@${this.host}`);
    return args;
  }

  private wrapCommand(
    command: string,
    cwd: string,
    env?: Record<string, string>,
  ): string {
    const parts: string[] = [];

    // Set environment variables
    if (env) {
      for (const [key, value] of Object.entries(env)) {
        parts.push(`export ${key}=${this.shellEscape(value)}`);
      }
    }

    // Change to working directory
    parts.push(`cd ${this.shellEscape(cwd)}`);

    // Execute the actual command
    parts.push(command);

    return parts.join(' && ');
  }

  private async scpToRemote(localPath: string, remotePath: string): Promise<void> {
    // Ensure remote parent directory exists
    const remoteDir = path.posix.dirname(remotePath);
    await this.execute(`mkdir -p ${this.shellEscape(remoteDir)}`);

    const args = [
      '-P', String(this.port),
      '-o', 'StrictHostKeyChecking=accept-new',
    ];

    if (this.controlSocket) {
      args.push('-o', `ControlPath=${this.controlSocket}`);
    }

    if (this.keyPath) {
      args.push('-i', this.keyPath);
    }

    args.push(localPath, `${this.user}@${this.host}:${remotePath}`);

    await this.spawnAndCapture('scp', args, 60000);
  }

  private async scpFromRemote(remotePath: string, localPath: string): Promise<void> {
    await fs.mkdir(path.dirname(localPath), { recursive: true });

    const args = [
      '-P', String(this.port),
      '-o', 'StrictHostKeyChecking=accept-new',
    ];

    if (this.controlSocket) {
      args.push('-o', `ControlPath=${this.controlSocket}`);
    }

    if (this.keyPath) {
      args.push('-i', this.keyPath);
    }

    args.push(`${this.user}@${this.host}:${remotePath}`, localPath);

    await this.spawnAndCapture('scp', args, 60000);
  }

  private async sendKeepAlive(): Promise<void> {
    const args = this.buildSSHArgs(5000);
    return new Promise((resolve) => {
      const child = spawn('ssh', [...args, 'echo pong'], { stdio: 'ignore' });
      const timer = setTimeout(() => { child.kill(); resolve(); }, 5000);
      child.on('close', () => { clearTimeout(timer); resolve(); });
      child.on('error', () => { clearTimeout(timer); resolve(); });
    });
  }

  private spawnAndCapture(
    cmd: string,
    args: string[],
    timeout: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let stderr = '';
      const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`${cmd} timed out after ${timeout}ms`));
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`${cmd} exited with code ${code}: ${stderr}`));
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
