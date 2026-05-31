import Database from 'better-sqlite3';
import { MemoryEntry, MemorySearchResult, MemoryProvider } from './types.js';
import * as path from 'path';
import * as fs from 'fs';

export class SQLiteMemoryProvider implements MemoryProvider {
  readonly name = 'sqlite';
  private db!: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.mimo', 'memory.db');
  }

  async init(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.createTables();
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('user', 'feedback', 'project', 'reference')),
        name TEXT NOT NULL,
        description TEXT,
        content TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_updated ON memories(updated_at);

      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        name,
        description,
        content,
        content='memories',
        content_rowid='rowid',
        tokenize='porter unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, name, description, content)
        VALUES (new.rowid, new.name, new.description, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, name, description, content)
        VALUES ('delete', old.rowid, old.name, old.description, old.content);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, name, description, content)
        VALUES ('delete', old.rowid, old.name, old.description, old.content);
        INSERT INTO memories_fts(rowid, name, description, content)
        VALUES (new.rowid, new.name, new.description, new.content);
      END;
    `);
  }

  async list(types?: string[]): Promise<MemoryEntry[]> {
    let stmt;
    if (types && types.length > 0) {
      const placeholders = types.map(() => '?').join(',');
      stmt = this.db.prepare(`SELECT * FROM memories WHERE type IN (${placeholders}) ORDER BY updated_at DESC`);
      return stmt.all(...types).map(this.rowToEntry);
    }
    stmt = this.db.prepare('SELECT * FROM memories ORDER BY updated_at DESC');
    return stmt.all().map(this.rowToEntry);
  }

  async read(id: string): Promise<MemoryEntry | null> {
    const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.rowToEntry(row) : null;
  }

  async save(entry: Omit<MemoryEntry, 'createdAt' | 'updatedAt'>): Promise<MemoryEntry> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memories (id, type, name, description, content, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.id,
      entry.type,
      entry.name,
      entry.description,
      this.sanitizeContent(entry.content),
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      now,
      now
    );

    return this.read(entry.id) as Promise<MemoryEntry>;
  }

  async update(id: string, updates: Partial<MemoryEntry>): Promise<MemoryEntry> {
    const existing = await this.read(id);
    if (!existing) {
      throw new Error(`Memory not found: ${id}`);
    }

    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE memories
      SET type = ?, name = ?, description = ?, content = ?, metadata_json = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      updates.type || existing.type,
      updates.name || existing.name,
      updates.description || existing.description,
      updates.content ? this.sanitizeContent(updates.content) : existing.content,
      updates.metadata ? JSON.stringify(updates.metadata) : existing.metadata ? JSON.stringify(existing.metadata) : null,
      now,
      id
    );

    return this.read(id) as Promise<MemoryEntry>;
  }

  async remove(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async search(query: string, options?: { types?: string[]; limit?: number }): Promise<MemorySearchResult[]> {
    const limit = options?.limit || 10;
    const types = options?.types;

    let sql = `
      SELECT m.*, rank
      FROM memories_fts fts
      JOIN memories m ON m.rowid = fts.rowid
      WHERE memories_fts MATCH ?
    `;
    const params: any[] = [query];

    if (types && types.length > 0) {
      const placeholders = types.map(() => '?').join(',');
      sql += ` AND m.type IN (${placeholders})`;
      params.push(...types);
    }

    sql += ` ORDER BY rank LIMIT ?`;
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      entry: this.rowToEntry(row),
      score: Math.abs(row.rank),
      highlights: this.extractHighlights(query, row.content)
    }));
  }

  async exportAll(): Promise<MemoryEntry[]> {
    const stmt = this.db.prepare('SELECT * FROM memories ORDER BY updated_at DESC');
    return (stmt.all() as any[]).map(this.rowToEntry);
  }

  async importAll(entries: MemoryEntry[]): Promise<number> {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO memories (id, type, name, description, content, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((items: MemoryEntry[]) => {
      let count = 0;
      for (const entry of items) {
        try {
          insert.run(
            entry.id,
            entry.type,
            entry.name,
            entry.description,
            this.sanitizeContent(entry.content),
            entry.metadata ? JSON.stringify(entry.metadata) : null,
            entry.createdAt.toISOString(),
            entry.updatedAt.toISOString()
          );
          count++;
        } catch (err) {
          console.error(`Failed to import ${entry.id}:`, err);
        }
      }
      return count;
    });

    return transaction(entries);
  }

  async cleanup(): Promise<void> {
    this.db.exec('VACUUM');
  }

  private rowToEntry(row: any): MemoryEntry {
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      description: row.description,
      content: row.content,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
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

  private extractHighlights(query: string, content: string): string[] {
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 1);
    const contentLower = content.toLowerCase();
    const highlights: string[] = [];

    for (const keyword of keywords) {
      const idx = contentLower.indexOf(keyword);
      if (idx !== -1) {
        const start = Math.max(0, idx - 40);
        const end = Math.min(content.length, idx + keyword.length + 40);
        highlights.push(`...${content.slice(start, end)}...`);
      }
    }

    return highlights.slice(0, 3);
  }
}
