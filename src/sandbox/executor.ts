// ── 沙箱执行器 ──────────────────────────────────

import { exec, ExecOptions } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export interface SandboxOptions {
  tmpDir: string;
  timeout: number;
  maxOutput: number;
  allowedCommands: string[];
  blockedCommands: string[];
}

const DEFAULT_OPTIONS: SandboxOptions = {
  tmpDir: path.join(os.tmpdir(), 'mimo-sandbox'),
  timeout: 30000,
  maxOutput: 1024 * 1024, // 1MB
  allowedCommands: [],
  blockedCommands: ['rm -rf /', 'sudo rm -rf', 'mkfs', 'dd if=', ':(){', 'chmod -R 777 /'],
};

export class Sandbox {
  private options: SandboxOptions;

  constructor(options: Partial<SandboxOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async init(): Promise<void> {
    await fs.mkdir(this.options.tmpDir, { recursive: true });
  }

  // 检查命令是否安全
  isCommandSafe(command: string): { safe: boolean; reason?: string } {
    for (const blocked of this.options.blockedCommands) {
      if (command.includes(blocked)) {
        return { safe: false, reason: `命令包含被禁止的模式: "${blocked}"` };
      }
    }

    if (this.options.allowedCommands.length > 0) {
      const cmdBase = command.split(/\s+/)[0];
      if (!this.options.allowedCommands.includes(cmdBase)) {
        return { safe: false, reason: `命令 "${cmdBase}" 不在白名单中` };
      }
    }

    return { safe: true };
  }

  async execute(command: string, cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
    const safety = this.isCommandSafe(command);
    if (!safety.safe) {
      throw new Error(`安全拒绝: ${safety.reason}`);
    }

    const execOptions: ExecOptions = {
      timeout: this.options.timeout,
      cwd: cwd || this.options.tmpDir,
      maxBuffer: this.options.maxOutput,
    };

    try {
      const result = await execAsync(command, execOptions);
      return {
        stdout: String(result.stdout),
        stderr: String(result.stderr),
        code: 0,
      };
    } catch (err: any) {
      return {
        stdout: String(err.stdout || ''),
        stderr: String(err.stderr || ''),
        code: err.code || 1,
      };
    }
  }

  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.options.tmpDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  }
}
