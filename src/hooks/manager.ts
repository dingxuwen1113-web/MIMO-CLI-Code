// ── Hooks 系统：pre/post tool 执行钩子 ────────────

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export type HookEvent = 'pre_tool' | 'post_tool' | 'pre_session' | 'post_session' | 'on_error';

export interface Hook {
  event: HookEvent;
  command: string;
  description?: string;
  timeout?: number;
}

export interface HookContext {
  toolName?: string;
  toolInput?: Record<string, any>;
  toolOutput?: string;
  isError?: boolean;
  sessionId?: string;
  projectDir?: string;
}

export interface HookResult {
  allowed: boolean;
  modifiedInput?: Record<string, any>;
  message?: string;
}

export class HookManager {
  private hooks: Map<HookEvent, Hook[]> = new Map();

  // 从配置文件自动加载 hooks
  async loadFromConfig(): Promise<void> {
    const homeDir = os.homedir();
    const configPaths = [
      path.join(process.cwd(), '.claude', 'settings.json'),
      path.join(process.cwd(), '.claude', 'settings.local.json'),
      path.join(process.cwd(), '.mimo', 'settings.json'),
      path.join(homeDir, '.claude', 'settings.json'),
      path.join(homeDir, '.mimo', 'settings.json'),
    ];

    for (const configPath of configPaths) {
      try {
        const raw = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(raw);

        if (config.hooks && typeof config.hooks === 'object') {
          for (const [event, hookDefs] of Object.entries(config.hooks)) {
            if (!this.isValidEvent(event)) continue;
            const hookArray = Array.isArray(hookDefs) ? hookDefs : [hookDefs];
            for (const def of hookArray) {
              if (typeof def === 'string') {
                this.register({ event: event as HookEvent, command: def });
              } else if (typeof def === 'object' && def.command) {
                this.register({
                  event: event as HookEvent,
                  command: def.command,
                  description: def.description,
                  timeout: def.timeout,
                });
              }
            }
          }
        }
      } catch {
        // 文件不存在或解析失败，跳过
      }
    }
  }

  private isValidEvent(event: string): boolean {
    return ['pre_tool', 'post_tool', 'pre_session', 'post_session', 'on_error'].includes(event);
  }

  // 注册钩子
  register(hook: Hook): void {
    const existing = this.hooks.get(hook.event) || [];
    existing.push(hook);
    this.hooks.set(hook.event, existing);
  }

  // 批量注册
  registerAll(hooks: Hook[]): void {
    for (const hook of hooks) {
      this.register(hook);
    }
  }

  // 执行钩子
  async execute(event: HookEvent, context: HookContext): Promise<HookResult> {
    const hooks = this.hooks.get(event) || [];
    if (hooks.length === 0) return { allowed: true };

    let result: HookResult = { allowed: true };

    for (const hook of hooks) {
      try {
        const env = {
          MIMO_TOOL_NAME: context.toolName || '',
          MIMO_TOOL_INPUT: context.toolInput ? JSON.stringify(context.toolInput) : '',
          MIMO_TOOL_OUTPUT: context.toolOutput || '',
          MIMO_IS_ERROR: String(context.isError || false),
          MIMO_SESSION_ID: context.sessionId || '',
          MIMO_PROJECT_DIR: context.projectDir || process.cwd(),
        };

        const timeout = hook.timeout || 10000;
        const { stdout, stderr } = await execAsync(hook.command, {
          env: { ...process.env, ...env },
          timeout,
          maxBuffer: 1024 * 1024,
        });

        const output = (stdout + stderr).trim();

        // 解析钩子输出
        if (output) {
          try {
            const parsed = JSON.parse(output);
            if (parsed.allowed === false) {
              result = { allowed: false, message: parsed.message || '被 Hook 拒绝' };
              break;
            }
            if (parsed.modifiedInput) {
              result.modifiedInput = parsed.modifiedInput;
              context = { ...context, toolInput: parsed.modifiedInput };
            }
          } catch {
            // 非 JSON 输出，检查是否有 BLOCK 关键词
            if (output.toUpperCase().includes('BLOCK') || output.toUpperCase().includes('DENY')) {
              result = { allowed: false, message: output };
              break;
            }
          }
        }
      } catch (err: any) {
        // 钩子执行失败
        if (event === 'pre_tool') {
          result = { allowed: false, message: `Hook 执行失败: ${err.message}` };
          break;
        }
        // post_tool / on_error 失败不阻断
      }
    }

    return result;
  }

  // 获取已注册的钩子
  list(): Array<{ event: HookEvent; command: string; description?: string }> {
    const result: Array<{ event: HookEvent; command: string; description?: string }> = [];
    for (const [event, hooks] of this.hooks) {
      for (const hook of hooks) {
        result.push({ event, command: hook.command, description: hook.description });
      }
    }
    return result;
  }
}
