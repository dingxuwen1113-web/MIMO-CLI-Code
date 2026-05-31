import { MemoryEntry, MemorySearchResult, MemoryProvider } from './types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class FileMemoryProvider implements MemoryProvider {
  readonly name = 'file';
  private basePath: string;
  private index: Map<string, MemoryEntry> = new Map();

  constructor(basePath?: string) {
    this.basePath = basePath || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.mimo', 'memory');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    await this.loadIndex();
  }

  async list(types?: string[]): Promise<MemoryEntry[]> {
    const entries = Array.from(this.index.values());
    if (types && types.length > 0) {
      return entries.filter(e => types.includes(e.type));
    }
    return entries;
  }

  async read(id: string): Promise<MemoryEntry | null> {
    const entry = this.index.get(id);
    if (!entry) return null;

    try {
      const filePath = this.getFilePath(id);
      const raw = await fs.readFile(filePath, 'utf-8');
      const { content } = this.parseMarkdown(raw);
      return { ...entry, content };
    } catch {
      return null;
    }
  }

  async save(entry: Omit<MemoryEntry, 'createdAt' | 'updatedAt'>): Promise<MemoryEntry> {
    const now = new Date();
    const fullEntry: MemoryEntry = {
      ...entry,
      createdAt: now,
      updatedAt: now
    };

    const filePath = this.getFilePath(entry.id);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const sanitized = this.sanitizeContent(entry.content);
    const markdown = this.toMarkdown(fullEntry, sanitized);
    await fs.writeFile(filePath, markdown, 'utf-8');

    this.index.set(entry.id, fullEntry);
    await this.writeIndex();

    return fullEntry;
  }

  async update(id: string, updates: Partial<MemoryEntry>): Promise<MemoryEntry> {
    const existing = await this.read(id);
    if (!existing) {
      throw new Error(`Memory not found: ${id}`);
    }

    const updated: MemoryEntry = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };

    const filePath = this.getFilePath(id);
    const sanitized = this.sanitizeContent(updated.content);
    const markdown = this.toMarkdown(updated, sanitized);
    await fs.writeFile(filePath, markdown, 'utf-8');

    this.index.set(id, updated);
    await this.writeIndex();

    return updated;
  }

  async remove(id: string): Promise<boolean> {
    const filePath = this.getFilePath(id);

    try {
      await fs.unlink(filePath);
      this.index.delete(id);
      await this.writeIndex();
      return true;
    } catch {
      return false;
    }
  }

  async search(query: string, options?: { types?: string[]; limit?: number }): Promise<MemorySearchResult[]> {
    const limit = options?.limit || 10;
    const types = options?.types;
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/).filter(k => k.length > 1);

    const results: MemorySearchResult[] = [];

    for (const entry of this.index.values()) {
      if (types && !types.includes(entry.type)) continue;

      const fullEntry = await this.read(entry.id);
      if (!fullEntry) continue;

      const searchable = `${fullEntry.name} ${fullEntry.description} ${fullEntry.content}`.toLowerCase();
      let score = 0;
      const highlights: string[] = [];

      for (const keyword of keywords) {
        if (searchable.includes(keyword)) {
          score += 1;
          const idx = searchable.indexOf(keyword);
          const start = Math.max(0, idx - 30);
          const end = Math.min(searchable.length, idx + keyword.length + 30);
          highlights.push(`...${searchable.slice(start, end)}...`);
        }
      }

      if (score > 0) {
        results.push({ entry: fullEntry, score, highlights });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async exportAll(): Promise<MemoryEntry[]> {
    const entries: MemoryEntry[] = [];
    for (const id of this.index.keys()) {
      const entry = await this.read(id);
      if (entry) entries.push(entry);
    }
    return entries;
  }

  async importAll(entries: MemoryEntry[]): Promise<number> {
    let count = 0;
    for (const entry of entries) {
      try {
        await this.save(entry);
        count++;
      } catch (err) {
        console.error(`Failed to import ${entry.id}:`, err);
      }
    }
    return count;
  }

  async cleanup(): Promise<void> {
    await this.writeIndex();
  }

  private getFilePath(id: string): string {
    const safeId = id.replace(/[^a-z0-9-]/g, '-').toLowerCase();
    return path.join(this.basePath, `${safeId}.md`);
  }

  private async loadIndex(): Promise<void> {
    try {
      const indexPath = path.join(this.basePath, 'MEMORY.md');
      const raw = await fs.readFile(indexPath, 'utf-8');
      this.index = this.parseIndex(raw);
    } catch {
      this.index = new Map();
    }
  }

  private async writeIndex(): Promise<void> {
    const indexPath = path.join(this.basePath, 'MEMORY.md');
    const lines = ['# MIMO Memory Index', ''];

    for (const entry of this.index.values()) {
      lines.push(`## ${entry.name}`);
      lines.push(`- **ID**: ${entry.id}`);
      lines.push(`- **Type**: ${entry.type}`);
      lines.push(`- **Updated**: ${entry.updatedAt.toISOString()}`);
      lines.push('');
    }

    await fs.writeFile(indexPath, lines.join('\n'), 'utf-8');
  }

  private parseIndex(raw: string): Map<string, MemoryEntry> {
    const map = new Map<string, MemoryEntry>();
    const sections = raw.split(/^## /m).slice(1);

    for (const section of sections) {
      const lines = section.split('\n');
      const name = lines[0]?.trim() || '';
      const idLine = lines.find(l => l.startsWith('- **ID**:'));
      const typeLine = lines.find(l => l.startsWith('- **Type**:'));
      const updatedLine = lines.find(l => l.startsWith('- **Updated**:'));

      if (idLine && typeLine) {
        const id = idLine.split(':')[1]?.trim() || '';
        const type = typeLine.split(':')[1]?.trim() as MemoryEntry['type'];
        const updatedAt = updatedLine ? new Date(updatedLine.split(':').slice(1).join(':').trim()) : new Date();

        map.set(id, {
          id,
          type,
          name,
          description: '',
          content: '',
          createdAt: updatedAt,
          updatedAt
        });
      }
    }

    return map;
  }

  private parseMarkdown(raw: string): { content: string; frontmatter: Record<string, any> } {
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
            const value = line.slice(colonIdx + 1).trim();
            frontmatter[key] = value;
          }
        }
      }
    }

    return { content, frontmatter };
  }

  private toMarkdown(entry: MemoryEntry, content: string): string {
    const frontmatter = [
      '---',
      `id: ${entry.id}`,
      `type: ${entry.type}`,
      `name: ${entry.name}`,
      `description: ${entry.description}`,
      `created: ${entry.createdAt.toISOString()}`,
      `updated: ${entry.updatedAt.toISOString()}`,
      '---'
    ].join('\n');

    return `${frontmatter}\n\n${content}`;
  }

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
}
