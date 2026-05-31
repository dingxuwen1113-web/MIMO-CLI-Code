// ── Git Worktree 隔离系统 ─────────────────────────

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
}

export class WorktreeManager {
  private worktrees: Map<string, WorktreeInfo> = new Map();

  // 创建 worktree
  async create(name: string, baseRef = 'HEAD'): Promise<WorktreeInfo> {
    const baseDir = path.join(process.cwd(), '.claude', 'worktrees');
    const worktreePath = path.join(baseDir, name);
    const branchName = `mimo/${name}`;

    try {
      await execAsync(`git worktree add -b ${branchName} "${worktreePath}" ${baseRef}`, {
        cwd: process.cwd(),
        timeout: 10000,
      });
    } catch (err: any) {
      // 分支可能已存在
      await execAsync(`git worktree add "${worktreePath}" ${branchName}`, {
        cwd: process.cwd(),
        timeout: 10000,
      });
    }

    const info: WorktreeInfo = {
      path: worktreePath,
      branch: branchName,
      head: baseRef,
    };

    this.worktrees.set(name, info);
    return info;
  }

  // 移除 worktree
  async remove(name: string, force = false): Promise<void> {
    const info = this.worktrees.get(name);
    if (!info) return;

    const flag = force ? ' --force' : '';
    await execAsync(`git worktree remove${flag} "${info.path}"`, {
      cwd: process.cwd(),
      timeout: 10000,
    });

    this.worktrees.delete(name);
  }

  // 列出 worktree
  async list(): Promise<WorktreeInfo[]> {
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', {
        cwd: process.cwd(),
        timeout: 5000,
      });

      const worktrees: WorktreeInfo[] = [];
      let current: Partial<WorktreeInfo> = {};

      for (const line of stdout.split('\n')) {
        if (line.startsWith('worktree ')) {
          if (current.path) worktrees.push(current as WorktreeInfo);
          current = { path: line.slice(9) };
        } else if (line.startsWith('HEAD ')) {
          current.head = line.slice(5);
        } else if (line.startsWith('branch ')) {
          current.branch = line.slice(7);
        }
      }
      if (current.path) worktrees.push(current as WorktreeInfo);

      return worktrees;
    } catch {
      return [];
    }
  }

  // 清理已合并的 worktree
  async prune(): Promise<string[]> {
    const before = await this.list();
    await execAsync('git worktree prune', { cwd: process.cwd(), timeout: 5000 });
    const after = await this.list();
    const removed = before.filter((b) => !after.some((a) => a.path === b.path));
    return removed.map((w) => w.path);
  }

  getInfo(name: string): WorktreeInfo | undefined {
    return this.worktrees.get(name);
  }
}
