import * as fs from 'fs/promises';
import * as path from 'path';

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

export interface Memory {
  id: string;
  type: MemoryType;
  name: string;
  description: string;
  content: string;
  tags: string[];
  links: string[];
  createdAt: string;
  updatedAt: string;
  projectSlug?: string;
}

export interface MemoryIndexEntry {
  id: string;
  type: MemoryType;
  name: string;
  description: string;
  filePath: string;
  updatedAt: string;
}

export class MemoryStore {
  private basePath: string;
  private index: MemoryIndexEntry[] = [];

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async init(): Promise<void> {
    for (const dir of ['user', 'project', 'reference', 'sessions']) {
      await fs.mkdir(path.join(this.basePath, dir), { recursive: true });
    }
    await this.loadIndex();
  }

  // ── 列出记忆 ──────────────────────────────────
  async list(types?: MemoryType[]): Promise<MemoryIndexEntry[]> {
    if (types) {
      return this.index.filter((m) => types.includes(m.type));
    }
    return [...this.index];
  }

  // ── 读取记忆内容 ──────────────────────────────
  async read(id: string): Promise<string | null> {
    const entry = this.index.find((m) => m.id === id);
    if (!entry) return null;

    try {
      const filePath = path.join(this.basePath, entry.filePath);
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  // ── 搜索记忆 ──────────────────────────────────
  async search(query: string, types?: MemoryType[]): Promise<Memory[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const results: Array<{ memory: Memory; score: number }> = [];

    for (const entry of this.index) {
      if (types && !types.includes(entry.type)) continue;

      try {
        const filePath = path.join(this.basePath, entry.filePath);
        const raw = await fs.readFile(filePath, 'utf-8');
        const { content, frontmatter } = this.parseMarkdown(raw);

        const searchable = (content + ' ' + entry.description + ' ' + entry.name).toLowerCase();
        const score = query
          .toLowerCase()
          .split(/\s+/)
          .filter((word) => word.length > 1 && searchable.includes(word)).length;

        if (score > 0) {
          results.push({
            memory: {
              id: entry.id,
              type: entry.type,
              name: entry.name,
              description: entry.description,
              content,
              tags: frontmatter.tags || [],
              links: frontmatter.links || [],
              createdAt: frontmatter.created || '',
              updatedAt: entry.updatedAt,
              projectSlug: frontmatter.projectSlug,
            },
            score,
          });
        }
      } catch {
        // 文件不存在，跳过
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((r) => r.memory);
  }

  // ── 保存记忆 ──────────────────────────────────
  async save(memory: Partial<Memory> & { id: string; type: MemoryType }): Promise<void> {
    const dirMap: Record<MemoryType, string> = {
      user: 'user',
      feedback: 'user',
      project: 'project',
      reference: 'reference',
    };
    const dir = dirMap[memory.type];
    const safeId = memory.id.replace(/[^a-z0-9-]/g, '-').toLowerCase();
    const filePath = path.join(this.basePath, dir, `${safeId}.md`);

    const now = new Date().toISOString().split('T')[0];
    const frontmatter = [
      '---',
      `name: ${memory.id}`,
      `description: ${memory.description || memory.name || memory.id}`,
      `type: ${memory.type}`,
      `tags: [${(memory.tags || []).join(', ')}]`,
      `links: [${(memory.links || []).join(', ')}]`,
      `updated: ${now}`,
      memory.projectSlug ? `projectSlug: ${memory.projectSlug}` : '',
      '---',
    ]
      .filter(Boolean)
      .join('\n');

    const newContent = this.sanitizeContent(memory.content || '');
    const fullContent = `${frontmatter}\n\n${newContent}`;

    await fs.writeFile(filePath, fullContent, 'utf-8');

    // 更新索引
    const relPath = path.relative(this.basePath, filePath).replace(/\\/g, '/');
    const existingIdx = this.index.findIndex((m) => m.id === memory.id);
    const entry: MemoryIndexEntry = {
      id: memory.id,
      type: memory.type,
      name: memory.name || memory.id,
      description: memory.description || '',
      filePath: relPath,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      this.index[existingIdx] = entry;
    } else {
      this.index.push(entry);
    }

    await this.writeIndex();
  }

  // ── 删除记忆 ──────────────────────────────────
  async remove(id: string): Promise<void> {
    const entry = this.index.find((m) => m.id === id);
    if (!entry) return;

    const filePath = path.join(this.basePath, entry.filePath);
    try {
      await fs.unlink(filePath);
    } catch {
      // 文件已不存在
    }

    this.index = this.index.filter((m) => m.id !== id);
    await this.writeIndex();
  }

  // ── 导出所有记忆 ──────────────────────────────
  async exportAll(outputPath: string): Promise<void> {
    const allMemories: Record<string, string> = {};

    for (const entry of this.index) {
      try {
        const filePath = path.join(this.basePath, entry.filePath);
        allMemories[entry.id] = await fs.readFile(filePath, 'utf-8');
      } catch {
        // 文件读取失败
      }
    }

    await fs.writeFile(outputPath, JSON.stringify(allMemories, null, 2), 'utf-8');
  }

  // ── 导入记忆 ──────────────────────────────────
  async importAll(importPath: string): Promise<number> {
    const raw = await fs.readFile(importPath, 'utf-8');
    const memories = JSON.parse(raw);
    let count = 0;

    for (const [id, content] of Object.entries(memories)) {
      try {
        const { frontmatter } = this.parseMarkdown(content as string);
        await this.save({
          id,
          type: frontmatter.type || 'user',
          name: frontmatter.name || id,
          description: frontmatter.description || '',
          content: (content as string).split('---').slice(2).join('---').trim(),
          tags: frontmatter.tags || [],
          links: frontmatter.links || [],
        });
        count++;
      } catch {
        // 导入失败，跳过
      }
    }

    return count;
  }

  // ── 构建记忆上下文（注入系统 prompt）──────────
  async buildMemoryContext(projectSlug?: string): Promise<string> {
    const parts: string[] = [];

    // 1. 始终加载用户画像 + 反馈
    for (const entry of this.index) {
      if (entry.type === 'user' || entry.type === 'feedback') {
        const content = await this.readContent(entry);
        if (content) parts.push(content);
      }
    }

    // 2. 加载当前项目记忆
    if (projectSlug) {
      for (const entry of this.index) {
        if (entry.type === 'project' && entry.id.includes(projectSlug)) {
          const content = await this.readContent(entry);
          if (content) parts.push(content);
        }
      }
    }

    // 3. 截断
    const full = parts.join('\n---\n');
    return this.truncateToTokenLimit(full, 2000);
  }

  // ── 会话快照 ──────────────────────────────────
  async saveSessionSummary(sessionId: string, summary: any): Promise<void> {
    const filePath = path.join(this.basePath, 'sessions', `${sessionId}.json`);
    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          id: sessionId,
          project: summary.projectSlug,
          startedAt: summary.startedAt,
          endedAt: new Date().toISOString(),
          turns: summary.turnCount,
          filesModified: summary.filesModified,
          keyDecisions: summary.decisions,
          unresolved: summary.unresolved,
        },
        null,
        2
      ),
      'utf-8'
    );
  }

  // ── 索引加载 ──────────────────────────────────
  private async loadIndex(): Promise<void> {
    const indexPath = path.join(this.basePath, 'MEMORY.md');

    try {
      const raw = await fs.readFile(indexPath, 'utf-8');
      this.index = this.parseIndexTable(raw);
    } catch {
      this.index = [];
      await this.writeIndex();
    }
  }

  private parseIndexTable(raw: string): MemoryIndexEntry[] {
    const lines = raw.split('\n').filter((l) => l.startsWith('|') && !l.startsWith('|--'));
    // 跳过表头
    return lines.slice(1).map((line) => {
      const cols = line
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      return {
        id: cols[0] || '',
        type: (cols[1] || 'user') as MemoryType,
        name: cols[2] || '',
        description: cols[3] || '',
        filePath: cols[4] || '',
        updatedAt: cols[5] || '',
      };
    });
  }

  private async writeIndex(): Promise<void> {
    const lines = [
      '# MIMO Memory Index',
      '',
      '| ID | Type | Name | Description | File | Updated |',
      '|---|---|---|---|---|---|',
      ...this.index.map(
        (m) =>
          `| ${m.id} | ${m.type} | ${m.name} | ${m.description} | ${m.filePath} | ${m.updatedAt} |`
      ),
    ];
    await fs.writeFile(path.join(this.basePath, 'MEMORY.md'), lines.join('\n'), 'utf-8');
  }

  // ── 工具方法 ──────────────────────────────────
  private parseMarkdown(raw: string): {
    content: string;
    frontmatter: Record<string, any>;
  } {
    const frontmatter: Record<string, any> = {};
    let content = raw;

    if (raw.startsWith('---')) {
      const endIdx = raw.indexOf('---', 3);
      if (endIdx !== -1) {
        const fmBlock = raw.slice(3, endIdx).trim();
        content = raw.slice(endIdx + 3).trim();

        for (const line of fmBlock.split('\n')) {
          const colonIdx = line.indexOf(':');
          if (colonIdx !== -1) {
            const key = line.slice(0, colonIdx).trim();
            let value: any = line.slice(colonIdx + 1).trim();
            if (value.startsWith('[') && value.endsWith(']')) {
              value = value
                .slice(1, -1)
                .split(',')
                .map((s: string) => s.trim())
                .filter(Boolean);
            }
            frontmatter[key] = value;
          }
        }
      }
    }

    return { content, frontmatter };
  }

  private async readContent(entry: MemoryIndexEntry): Promise<string | null> {
    try {
      const filePath = path.join(this.basePath, entry.filePath);
      const raw = await fs.readFile(filePath, 'utf-8');
      const { content } = this.parseMarkdown(raw);
      return content.trim();
    } catch {
      return null;
    }
  }

  // 安全过滤：脱敏 API Key、密码、私钥
  private sanitizeContent(content: string): string {
    return content
      .replace(/sk-ant-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_API_KEY]')
      .replace(/ghp_[a-zA-Z0-9]{30,}/g, '[REDACTED_GITHUB_TOKEN]')
      .replace(/glpat-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_GITLAB_TOKEN]')
      .replace(/xoxb-[a-zA-Z0-9-]+/g, '[REDACTED_SLACK_TOKEN]')
      .replace(/-----BEGIN[A\s\S]*?PRIVATE KEY-----[\s\S]*?-----END[A\s\S]*?PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
      .replace(/password\s*[:=]\s*["']?[^\s,;"'}{]+/gi, 'password=[REDACTED]')
      .replace(/secret\s*[:=]\s*["']?[^\s,;"'}{]+/gi, 'secret=[REDACTED]');
  }

  private truncateToTokenLimit(text: string, maxTokens: number): string {
    const charLimit = maxTokens * 3;
    return text.length > charLimit ? text.slice(0, charLimit) + '\n...(记忆已截断)' : text;
  }
}
