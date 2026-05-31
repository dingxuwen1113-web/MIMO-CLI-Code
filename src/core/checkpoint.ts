// ── Checkpoint 系统：文件快照与回滚 ──────────────

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// Common binary file extensions that should not be read as UTF-8
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flac',
  '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.exe', '.dll', '.so', '.dylib', '.o', '.a',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pyc', '.pyo', '.class', '.jar',
  '.sqlite', '.db',
  '.lockb',
]);

function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export interface Checkpoint {
  id: string;
  timestamp: string;
  description: string;
  files: Array<{
    path: string;
    content: string;
    existed: boolean;
    binary: boolean;
  }>;
}

export class CheckpointManager {
  private checkpoints: Checkpoint[] = [];
  private basePath: string;
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.basePath = path.join(os.homedir(), '.mimo', 'checkpoints', sessionId);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });

    // Auto-load existing checkpoints and prune old ones
    try {
      const files = await fs.readdir(this.basePath);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
      for (const file of jsonFiles) {
        try {
          const raw = await fs.readFile(path.join(this.basePath, file), 'utf-8');
          const cp = JSON.parse(raw) as Checkpoint;
          this.checkpoints.push(cp);
        } catch { /* skip corrupted checkpoint */ }
      }
      // Prune to prevent disk bloat (keep last 100)
      await this.cleanup(100);
    } catch { /* no existing checkpoints */ }
  }

  // 创建快照（编辑文件前调用）
  async snapshot(filePath: string, description: string = ''): Promise<string> {
    const absPath = path.resolve(filePath);
    let content = '';
    let existed = true;
    const binary = isBinaryFile(absPath);

    try {
      if (binary) {
        const buffer = await fs.readFile(absPath);
        content = buffer.toString('base64');
      } else {
        content = await fs.readFile(absPath, 'utf-8');
      }
    } catch {
      existed = false;
    }

    const id = crypto.randomBytes(6).toString('hex');
    const checkpoint: Checkpoint = {
      id,
      timestamp: new Date().toISOString(),
      description: description || `Edit: ${path.basename(filePath)}`,
      files: [{ path: absPath, content, existed, binary }],
    };

    this.checkpoints.push(checkpoint);
    await this.saveCheckpoint(checkpoint);
    return id;
  }

  // 创建批量快照（多文件编辑前）
  async snapshotBatch(filePaths: string[], description: string): Promise<string> {
    const files: Checkpoint['files'] = [];

    for (const fp of filePaths) {
      const absPath = path.resolve(fp);
      let content = '';
      let existed = true;
      const binary = isBinaryFile(absPath);
      try {
        if (binary) {
          const buffer = await fs.readFile(absPath);
          content = buffer.toString('base64');
        } else {
          content = await fs.readFile(absPath, 'utf-8');
        }
      } catch {
        existed = false;
      }
      files.push({ path: absPath, content, existed, binary });
    }

    const id = crypto.randomBytes(6).toString('hex');
    const checkpoint: Checkpoint = {
      id,
      timestamp: new Date().toISOString(),
      description,
      files,
    };

    this.checkpoints.push(checkpoint);
    await this.saveCheckpoint(checkpoint);
    return id;
  }

  // 回滚到指定快照
  async revert(checkpointId: string): Promise<string[]> {
    const cp = this.checkpoints.find((c) => c.id === checkpointId);
    if (!cp) throw new Error(`Checkpoint ${checkpointId} 不存在 / does not exist`);

    const reverted: string[] = [];

    for (const file of cp.files) {
      try {
        if (file.existed) {
          // 文件在快照前存在 → 恢复原始内容
          if (file.binary) {
            const buffer = Buffer.from(file.content, 'base64');
            await fs.writeFile(file.path, buffer);
          } else {
            await fs.writeFile(file.path, file.content, 'utf-8');
          }
          reverted.push(file.path);
        } else {
          // 文件在快照前不存在 → 只删除从未被修改过的新文件
          try {
            let current: string;
            if (file.binary) {
              const buffer = await fs.readFile(file.path);
              current = buffer.toString('base64');
            } else {
              current = await fs.readFile(file.path, 'utf-8');
            }
            if (current === file.content) {
              await fs.unlink(file.path);
              reverted.push(file.path);
            }
            // else: 文件已被其他人修改，保留
          } catch {
            // 文件已不存在，无需操作
          }
        }
      } catch (err: any) {
        // Per-file error: log but continue reverting other files
        throw new Error(`回滚文件 ${file.path} 失败 / Failed to revert ${file.path}: ${err.message}`);
      }
    }

    return reverted;
  }

  // 回滚到上一个快照
  async revertLast(): Promise<string[]> {
    if (this.checkpoints.length === 0) throw new Error('没有可回滚的快照');
    const last = this.checkpoints[this.checkpoints.length - 1];
    return this.revert(last.id);
  }

  // 列出所有快照
  list(): Checkpoint[] {
    return [...this.checkpoints];
  }

  // 获取最近 N 个快照
  recent(n: number = 10): Checkpoint[] {
    return this.checkpoints.slice(-n);
  }

  // 清理旧快照
  async cleanup(keepLast: number = 50): Promise<void> {
    if (this.checkpoints.length <= keepLast) return;

    const toRemove = this.checkpoints.slice(0, this.checkpoints.length - keepLast);
    for (const cp of toRemove) {
      try {
        await fs.unlink(path.join(this.basePath, `${cp.id}.json`));
      } catch { /* already gone */ }
    }
    this.checkpoints = this.checkpoints.slice(-keepLast);
  }

  private async saveCheckpoint(cp: Checkpoint): Promise<void> {
    const filePath = path.join(this.basePath, `${cp.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(cp, null, 2), 'utf-8');
  }
}
