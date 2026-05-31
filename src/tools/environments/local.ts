/**
 * Local Execution Environment
 *
 * Executes commands directly on the host machine using child_process.
 * This is the default environment and requires no external dependencies.
 */

import { spawn, exec, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { ExecutionEnvironment, ExecOptions, ExecResult } from './types';

const execAsync = promisify(exec);

const isWindows = os.platform() === 'win32';

export class LocalEnvironment implements ExecutionEnvironment {
  readonly name: string;
  readonly type = 'local' as const;

  private defaultCwd: string;
  private defaultTimeout: number;
  private disposed = false;

  constructor(name?: string, defaultCwd?: string, defaultTimeout?: number) {
    this.name = name ?? 'local';
    this.defaultCwd = defaultCwd ?? process.cwd();
    this.defaultTimeout = defaultTimeout ?? 60000;
  }

  async init(): Promise<void> {
    if (this.disposed) {
      throw new Error('LocalEnvironment has been disposed');
    }
    // Verify the default working directory exists
    try {
      await fs.access(this.defaultCwd, fsConstants.F_OK);
    } catch {
      throw new Error(`Default working directory does not exist: ${this.defaultCwd}`);
    }
  }

  async execute(command: string, options?: ExecOptions): Promise<ExecResult> {
    if (this.disposed) {
      throw new Error('LocalEnvironment has been disposed');
    }

    const cwd = options?.cwd ?? this.defaultCwd;
    const timeout = options?.timeout ?? this.defaultTimeout;
    const env = options?.env ? { ...process.env, ...options.env } : process.env;
    const useShell = options?.shell !== false;

    const startTime = Date.now();

    return new Promise<ExecResult>((resolve) => {
      const shell = useShell
        ? (isWindows ? 'powershell.exe' : '/bin/bash')
        : undefined;

      const args = useShell ? ['-c', command] : command.split(/\s+/);

      const child = spawn(useShell ? shell! : args[0], useShell ? args : args.slice(1), {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        ...(useShell ? {} : { shell: false }),
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // Set up timeout
      if (timeout > 0) {
        killTimer = setTimeout(() => {
          timedOut = true;
          child.kill(isWindows ? 'SIGTERM' : 'SIGKILL');
        }, timeout);
      }

      // Write stdin if provided
      if (options?.stdin && child.stdin) {
        child.stdin.write(options.stdin);
        child.stdin.end();
      }

      child.on('close', (code, signal) => {
        if (killTimer) clearTimeout(killTimer);

        const exitCode = code !== null ? code : (signal ? -1 : 1);
        const duration = Date.now() - startTime;

        resolve({
          stdout: this.truncateOutput(stdout),
          stderr: this.truncateOutput(stderr),
          exitCode,
          duration,
          timedOut,
        });
      });

      child.on('error', (err) => {
        if (killTimer) clearTimeout(killTimer);

        const duration = Date.now() - startTime;
        resolve({
          stdout,
          stderr: `Failed to start process: ${err.message}`,
          exitCode: -1,
          duration,
          timedOut: false,
        });
      });
    });
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    if (this.disposed) throw new Error('LocalEnvironment has been disposed');
    const resolvedPath = this.resolvePath(filePath);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, content, 'utf-8');
  }

  async readFile(filePath: string): Promise<string> {
    if (this.disposed) throw new Error('LocalEnvironment has been disposed');
    const resolvedPath = this.resolvePath(filePath);
    return fs.readFile(resolvedPath, 'utf-8');
  }

  async listDir(dirPath: string): Promise<string[]> {
    if (this.disposed) throw new Error('LocalEnvironment has been disposed');
    const resolvedPath = this.resolvePath(dirPath);
    return fs.readdir(resolvedPath);
  }

  async exists(filePath: string): Promise<boolean> {
    if (this.disposed) throw new Error('LocalEnvironment has been disposed');
    const resolvedPath = this.resolvePath(filePath);
    try {
      await fs.access(resolvedPath, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    if (this.disposed) throw new Error('LocalEnvironment has been disposed');
    const resolvedPath = this.resolvePath(dirPath);
    await fs.mkdir(resolvedPath, { recursive: true });
  }

  async rm(targetPath: string): Promise<void> {
    if (this.disposed) throw new Error('LocalEnvironment has been disposed');
    const resolvedPath = this.resolvePath(targetPath);
    await fs.rm(resolvedPath, { recursive: true, force: true });
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    if (this.disposed) throw new Error('LocalEnvironment has been disposed');
    // For local env, upload is just a file copy
    const content = await fs.readFile(localPath);
    const destPath = this.resolvePath(remotePath);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, content);
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    if (this.disposed) throw new Error('LocalEnvironment has been disposed');
    const content = await fs.readFile(this.resolvePath(remotePath));
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, content);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }

  async isAlive(): Promise<boolean> {
    if (this.disposed) return false;
    try {
      await fs.access(this.defaultCwd, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  // -- Helpers --

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.resolve(this.defaultCwd, filePath);
  }

  /**
   * Truncate output to prevent memory exhaustion.
   * Returns the first 200KB of output, with a note if truncated.
   */
  private truncateOutput(output: string, maxChars: number = 200_000): string {
    if (output.length <= maxChars) return output;
    const truncated = output.slice(0, maxChars);
    const remaining = output.length - maxChars;
    return truncated + `\n\n... [Output truncated: ${remaining} characters omitted]`;
  }
}
