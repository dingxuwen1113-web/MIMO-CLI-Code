/**
 * Modal Cloud Sandbox Environment
 *
 * Uses the Modal platform for serverless sandboxed code execution.
 * Provides persistent sandboxes across multiple calls with file sync
 * capabilities.
 *
 * Prerequisites: `modal` Python package must be installed and configured
 * (`pip install modal && modal setup`).
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { ExecutionEnvironment, ExecOptions, ExecResult, EnvironmentConfig } from './types';

/**
 * Python helper script that Modal runs inside its sandbox.
 * This gets written to a temp file and executed via `modal run`.
 */
const MODAL_HELPER = `
import modal
import sys
import json
import os

app_name = sys.argv[1] if len(sys.argv) > 1 else "mimo-sandbox"

app = modal.App(app_name)

@app.function(timeout=int(sys.argv[2]) if len(sys.argv) > 2 else 60)
def run_command(command: str, cwd: str = "/", env_json: str = "{}"):
    import subprocess
    import time
    env = json.loads(env_json)
    merged_env = {**os.environ, **env}
    start = time.time()
    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=cwd,
            capture_output=True,
            text=True,
            env=merged_env,
            timeout=int(sys.argv[2]) if len(sys.argv) > 2 else 60,
        )
        return json.dumps({
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exitCode": result.returncode,
            "duration": int((time.time() - start) * 1000),
            "timedOut": False,
        })
    except subprocess.TimeoutExpired:
        return json.dumps({
            "stdout": "",
            "stderr": "Command timed out",
            "exitCode": -1,
            "duration": int((time.time() - start) * 1000),
            "timedOut": True,
        })
`;

export class ModalEnvironment implements ExecutionEnvironment {
  readonly name: string;
  readonly type = 'modal' as const;

  private appName: string;
  private defaultTimeout: number;

  private initialized = false;
  private disposed = false;
  private sandboxId: string | undefined;
  private helperScript: string | undefined;

  constructor(config: EnvironmentConfig, name?: string) {
    this.name = name ?? config.name ?? 'modal';
    this.appName = config.modalApp ?? 'mimo-sandbox';
    this.defaultTimeout = config.defaultTimeout ?? 60000;
  }

  async init(): Promise<void> {
    if (this.disposed) throw new Error('ModalEnvironment has been disposed');

    // Verify Modal CLI is available
    try {
      await this.execLocal('modal', ['--version'], 10000);
    } catch {
      throw new Error(
        'Modal CLI is not installed. Install with: pip install modal && modal setup'
      );
    }

    // Verify Modal authentication
    try {
      await this.execLocal('modal', ['profile', 'list'], 10000);
    } catch {
      throw new Error('Modal is not authenticated. Run: modal setup');
    }

    // Write the helper script to a temp file
    const scriptPath = path.join(os.tmpdir(), `mimo-modal-helper-${Date.now()}.py`);
    await fs.writeFile(scriptPath, MODAL_HELPER, 'utf-8');
    this.helperScript = scriptPath;

    // Create a persistent sandbox
    await this.createSandbox();

    this.initialized = true;
  }

  async execute(command: string, options?: ExecOptions): Promise<ExecResult> {
    this.ensureInitialized();

    const timeout = options?.timeout ?? this.defaultTimeout;
    const cwd = options?.cwd ?? '/';
    const envJson = JSON.stringify(options?.env ?? {});
    const startTime = Date.now();

    if (!this.helperScript) {
      throw new Error('Modal helper script not available');
    }

    try {
      const result = await this.modalExec(
        [
          'run', this.helperScript,
          '--', this.appName, String(Math.ceil(timeout / 1000)),
        ],
        JSON.stringify({ command, cwd, env_json: envJson }),
        timeout,
      );

      const parsed = JSON.parse(result.stdout.trim());
      return {
        stdout: this.truncateOutput(parsed.stdout || ''),
        stderr: this.truncateOutput(parsed.stderr || ''),
        exitCode: parsed.exitCode ?? -1,
        duration: parsed.duration ?? (Date.now() - startTime),
        timedOut: parsed.timedOut ?? false,
      };
    } catch (err: any) {
      return {
        stdout: '',
        stderr: `Modal execution error: ${err.message}`,
        exitCode: -1,
        duration: Date.now() - startTime,
        timedOut: false,
      };
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    this.ensureInitialized();

    // Write locally and upload
    const tmpFile = path.join(os.tmpdir(), `mimo-modal-write-${Date.now()}`);
    try {
      await fs.writeFile(tmpFile, content, 'utf-8');
      await this.upload(tmpFile, filePath);
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }

  async readFile(filePath: string): Promise<string> {
    this.ensureInitialized();

    const tmpFile = path.join(os.tmpdir(), `mimo-modal-read-${Date.now()}`);
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

    // Modal volume upload: create a tmp volume, push file, copy into sandbox
    const absLocal = path.resolve(localPath);
    const volumeName = `mimo-upload-${crypto.randomBytes(4).toString('hex')}`;

    await this.execLocal('modal', ['volume', 'create', volumeName], 30000);
    await this.execLocal(
      'modal', ['volume', 'put', volumeName, absLocal, path.posix.basename(remotePath)],
      60000
    );

    // Copy from volume into sandbox
    const remoteDir = path.posix.dirname(remotePath);
    await this.execute(`mkdir -p ${this.shellEscape(remoteDir)}`);
    await this.execute(
      `cp /mnt/modal-volumes/${volumeName}/${path.posix.basename(remotePath)} ${this.shellEscape(remotePath)}`
    );

    // Cleanup volume
    await this.execLocal('modal', ['volume', 'delete', volumeName, '--yes'], 15000).catch(() => {});
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    this.ensureInitialized();

    const absLocal = path.resolve(localPath);
    await fs.mkdir(path.dirname(absLocal), { recursive: true });

    const volumeName = `mimo-download-${crypto.randomBytes(4).toString('hex')}`;

    // Copy from sandbox to volume
    await this.execLocal('modal', ['volume', 'create', volumeName], 30000);
    await this.execute(
      `cp ${this.shellEscape(remotePath)} /mnt/modal-volumes/${volumeName}/${path.posix.basename(remotePath)}`
    );

    // Download from volume
    await this.execLocal(
      'modal', ['volume', 'get', volumeName, path.posix.basename(remotePath), absLocal],
      60000
    );

    // Cleanup
    await this.execLocal('modal', ['volume', 'delete', volumeName, '--yes'], 15000).catch(() => {});
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    if (this.sandboxId) {
      await this.execLocal('modal', ['sandbox', 'stop', this.sandboxId], 15000).catch(() => {});
      this.sandboxId = undefined;
    }

    if (this.helperScript) {
      await fs.unlink(this.helperScript).catch(() => {});
      this.helperScript = undefined;
    }
  }

  async isAlive(): Promise<boolean> {
    if (this.disposed || !this.sandboxId) return false;
    try {
      const result = await this.execLocal(
        'modal', ['sandbox', 'list', '--json'], 10000
      );
      const sandboxes = JSON.parse(result.stdout);
      return sandboxes.some((s: any) => s.sandbox_id === this.sandboxId && s.status === 'running');
    } catch {
      return false;
    }
  }

  // -- Private helpers --

  private ensureInitialized(): void {
    if (this.disposed) throw new Error('ModalEnvironment has been disposed');
    if (!this.initialized) throw new Error('ModalEnvironment not initialized; call init() first');
  }

  private async createSandbox(): Promise<void> {
    try {
      const result = await this.execLocal(
        'modal', ['sandbox', 'create', '--app', this.appName, '--timeout', '3600'],
        30000
      );
      // Parse sandbox ID from output
      const match = result.stdout.match(/sandbox[_-]?id[:\s]+(\S+)/i);
      this.sandboxId = match ? match[1] : result.stdout.trim();
    } catch (err: any) {
      // Fall back to non-sandbox mode (ephemeral function calls)
      this.sandboxId = undefined;
    }
  }

  private async modalExec(
    args: string[],
    stdinData: string,
    timeout: number,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const child = spawn('modal', args, { stdio: ['pipe', 'pipe', 'pipe'] });

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Modal command timed out after ${timeout}ms`));
      }, timeout + 10000);

      child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      if (child.stdin) {
        child.stdin.write(stdinData);
        child.stdin.end();
      }

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(`Modal exited with code ${code}: ${stderr || stdout}`));
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`Modal spawn error: ${err.message}`));
      });
    });
  }

  private execLocal(
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
