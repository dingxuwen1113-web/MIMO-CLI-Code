// ── SQLite Session Store ─────────────────────────────────────────────────────
// Persistent session storage using better-sqlite3 with FTS5 full-text search,
// WAL mode, and comprehensive session/message/tool-call management.

import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface StoredSession {
  id: string;
  title: string;
  model: string;
  mode: string;
  created_at: string;
  updated_at: string;
  metadata_json: string;
}

export interface StoredMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  model: string | null;
  tokens_in: number;
  tokens_out: number;
  created_at: string;
}

export interface StoredToolCall {
  id: string;
  message_id: string;
  session_id: string;
  tool_name: string;
  input_json: string;
  output_json: string;
  duration_ms: number;
  status: string;
  created_at: string;
}

export interface SessionWithMessages extends StoredSession {
  messages: StoredMessage[];
}

export interface SessionStats {
  totalSessions: number;
  totalMessages: number;
  totalToolCalls: number;
  oldestSession: string | null;
  newestSession: string | null;
  messagesByRole: Record<string, number>;
  topTools: Array<{ tool_name: string; count: number }>;
  totalTokensIn: number;
  totalTokensOut: number;
}

export interface AddMessageOptions {
  role: string;
  content: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
}

export interface AddToolCallOptions {
  toolName: string;
  inputJson: string;
  outputJson: string;
  durationMs?: number;
  status?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SQLiteSessionStore
// ═══════════════════════════════════════════════════════════════════════════════

export class SQLiteSessionStore {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;

    // Ensure parent directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');

    this.initializeSchema();
  }

  // ── Schema Initialization ─────────────────────────────────────────────

  private initializeSchema(): void {
    this.db.exec(`
      -- Core tables
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        model TEXT,
        tokens_in INTEGER NOT NULL DEFAULT 0,
        tokens_out INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        input_json TEXT NOT NULL DEFAULT '{}',
        output_json TEXT NOT NULL DEFAULT '',
        duration_ms INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'success',
        created_at TEXT NOT NULL,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_session_id ON tool_calls(session_id);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_message_id ON tool_calls(message_id);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_tool_name ON tool_calls(tool_name);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_status ON tool_calls(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
    `);

    // FTS5 virtual tables — created separately so we can handle IF NOT EXISTS gracefully
    this.createFTSTables();
  }

  private createFTSTables(): void {
    const existingTables = new Set(
      this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((row: any) => row.name)
    );

    if (!existingTables.has('sessions_fts')) {
      this.db.exec(`
        CREATE VIRTUAL TABLE sessions_fts USING fts5(
          title,
          content='sessions',
          content_rowid='rowid'
        );
      `);
      // Populate from existing data
      this.db.exec(`
        INSERT INTO sessions_fts(rowid, title)
        SELECT rowid, title FROM sessions;
      `);
      // Triggers to keep FTS in sync
      this.createSessionFTSTriggers();
    }

    if (!existingTables.has('messages_fts')) {
      this.db.exec(`
        CREATE VIRTUAL TABLE messages_fts USING fts5(
          content,
          content='messages',
          content_rowid='rowid'
        );
      `);
      this.db.exec(`
        INSERT INTO messages_fts(rowid, content)
        SELECT rowid, content FROM messages;
      `);
      this.createMessageFTSTriggers();
    }

    if (!existingTables.has('tool_calls_fts')) {
      this.db.exec(`
        CREATE VIRTUAL TABLE tool_calls_fts USING fts5(
          tool_name,
          input_json,
          output_json,
          content='tool_calls',
          content_rowid='rowid'
        );
      `);
      this.db.exec(`
        INSERT INTO tool_calls_fts(rowid, tool_name, input_json, output_json)
        SELECT rowid, tool_name, input_json, output_json FROM tool_calls;
      `);
      this.createToolCallFTSTriggers();
    }
  }

  private createSessionFTSTriggers(): void {
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS sessions_ai AFTER INSERT ON sessions BEGIN
        INSERT INTO sessions_fts(rowid, title) VALUES (new.rowid, new.title);
      END;

      CREATE TRIGGER IF NOT EXISTS sessions_ad AFTER DELETE ON sessions BEGIN
        INSERT INTO sessions_fts(sessions_fts, rowid, title) VALUES('delete', old.rowid, old.title);
      END;

      CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
        INSERT INTO sessions_fts(sessions_fts, rowid, title) VALUES('delete', old.rowid, old.title);
        INSERT INTO sessions_fts(rowid, title) VALUES (new.rowid, new.title);
      END;
    `);
  }

  private createMessageFTSTriggers(): void {
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
      END;

      CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
        INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.rowid, old.content);
        INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
      END;
    `);
  }

  private createToolCallFTSTriggers(): void {
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS tool_calls_ai AFTER INSERT ON tool_calls BEGIN
        INSERT INTO tool_calls_fts(rowid, tool_name, input_json, output_json)
        VALUES (new.rowid, new.tool_name, new.input_json, new.output_json);
      END;

      CREATE TRIGGER IF NOT EXISTS tool_calls_ad AFTER DELETE ON tool_calls BEGIN
        INSERT INTO tool_calls_fts(tool_calls_fts, rowid, tool_name, input_json, output_json)
        VALUES('delete', old.rowid, old.tool_name, old.input_json, old.output_json);
      END;

      CREATE TRIGGER IF NOT EXISTS tool_calls_au AFTER UPDATE ON tool_calls BEGIN
        INSERT INTO tool_calls_fts(tool_calls_fts, rowid, tool_name, input_json, output_json)
        VALUES('delete', old.rowid, old.tool_name, old.input_json, old.output_json);
        INSERT INTO tool_calls_fts(rowid, tool_name, input_json, output_json)
        VALUES (new.rowid, new.tool_name, new.input_json, new.output_json);
      END;
    `);
  }

  // ── Session CRUD ──────────────────────────────────────────────────────

  /**
   * Create a new session and return its ID.
   */
  createSession(title: string, model: string = '', mode: string = 'code'): string {
    const id = generateId('session');
    const now = nowISO();

    this.db.prepare(`
      INSERT INTO sessions (id, title, model, mode, created_at, updated_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, model, mode, now, now, '{}');

    return id;
  }

  /**
   * Get a single session by ID (without messages).
   */
  getSessionById(sessionId: string): StoredSession | null {
    return this.db.prepare(`
      SELECT * FROM sessions WHERE id = ?
    `).get(sessionId) as StoredSession | null;
  }

  /**
   * Get a session with all its messages and tool calls.
   */
  getSession(sessionId: string): SessionWithMessages | null {
    const session = this.getSessionById(sessionId);
    if (!session) return null;

    const messages = this.db.prepare(`
      SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC
    `).all(sessionId) as StoredMessage[];

    return { ...session, messages };
  }

  /**
   * List sessions with pagination, newest first.
   */
  listSessions(limit: number = 50, offset: number = 0): StoredSession[] {
    return this.db.prepare(`
      SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset) as StoredSession[];
  }

  /**
   * Update session title or metadata.
   */
  updateSession(sessionId: string, updates: { title?: string; metadata?: Record<string, any> }): void {
    const parts: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
      parts.push('title = ?');
      values.push(updates.title);
    }
    if (updates.metadata !== undefined) {
      parts.push('metadata_json = ?');
      values.push(JSON.stringify(updates.metadata));
    }

    if (parts.length === 0) return;

    parts.push('updated_at = ?');
    values.push(nowISO());
    values.push(sessionId);

    this.db.prepare(`
      UPDATE sessions SET ${parts.join(', ')} WHERE id = ?
    `).run(...values);
  }

  // ── Message CRUD ──────────────────────────────────────────────────────

  /**
   * Add a message to a session. Returns the new message ID.
   */
  addMessage(sessionId: string, options: AddMessageOptions): string {
    const id = generateId('msg');
    const now = nowISO();

    // Verify session exists
    const session = this.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const txn = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO messages (id, session_id, role, content, model, tokens_in, tokens_out, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        sessionId,
        options.role,
        options.content,
        options.model || null,
        options.tokensIn || 0,
        options.tokensOut || 0,
        now,
      );

      // Touch session updated_at
      this.db.prepare(`
        UPDATE sessions SET updated_at = ? WHERE id = ?
      `).run(now, sessionId);
    });

    txn();
    return id;
  }

  /**
   * Get messages for a session, optionally filtered by role.
   */
  getMessages(sessionId: string, role?: string): StoredMessage[] {
    if (role) {
      return this.db.prepare(`
        SELECT * FROM messages WHERE session_id = ? AND role = ? ORDER BY created_at ASC
      `).all(sessionId, role) as StoredMessage[];
    }
    return this.db.prepare(`
      SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC
    `).all(sessionId) as StoredMessage[];
  }

  /**
   * Delete messages after a certain message ID (inclusive).
   * Used for rollback operations.
   */
  deleteMessagesAfter(sessionId: string, messageId: string): number {
    // Find the target message's created_at timestamp
    const target = this.db.prepare(`
      SELECT created_at FROM messages WHERE id = ? AND session_id = ?
    `).get(messageId, sessionId) as { created_at: string } | null;

    if (!target) return 0;

    const result = this.db.prepare(`
      DELETE FROM messages WHERE session_id = ? AND created_at >= ?
    `).run(sessionId, target.created_at);

    return result.changes;
  }

  // ── Tool Call CRUD ────────────────────────────────────────────────────

  /**
   * Add a tool call record. Returns the new tool call ID.
   */
  addToolCall(sessionId: string, messageId: string, options: AddToolCallOptions): string {
    const id = generateId('tc');
    const now = nowISO();

    this.db.prepare(`
      INSERT INTO tool_calls (id, message_id, session_id, tool_name, input_json, output_json, duration_ms, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      messageId,
      sessionId,
      options.toolName,
      options.inputJson,
      options.outputJson,
      options.durationMs || 0,
      options.status || 'success',
      now,
    );

    return id;
  }

  /**
   * Get tool calls for a session.
   */
  getToolCalls(sessionId: string): StoredToolCall[] {
    return this.db.prepare(`
      SELECT * FROM tool_calls WHERE session_id = ? ORDER BY created_at ASC
    `).all(sessionId) as StoredToolCall[];
  }

  /**
   * Get tool calls for a specific message.
   */
  getToolCallsForMessage(messageId: string): StoredToolCall[] {
    return this.db.prepare(`
      SELECT * FROM tool_calls WHERE message_id = ? ORDER BY created_at ASC
    `).all(messageId) as StoredToolCall[];
  }

  // ── Full-Text Search ──────────────────────────────────────────────────

  /**
   * Search sessions by title using FTS5.
   */
  searchSessions(query: string, limit: number = 20): StoredSession[] {
    if (!query || query.trim().length === 0) return [];

    // Escape FTS5 special characters and build a safe query
    const sanitized = query.replace(/['"]/g, ' ').trim();
    if (sanitized.length === 0) return [];

    // Use prefix matching for better recall
    const ftsQuery = sanitized
      .split(/\s+/)
      .filter(w => w.length > 0)
      .map(w => `"${w}"*`)
      .join(' ');

    try {
      return this.db.prepare(`
        SELECT s.* FROM sessions s
        INNER JOIN sessions_fts fts ON s.rowid = fts.rowid
        WHERE sessions_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(ftsQuery, limit) as StoredSession[];
    } catch {
      // Fallback to LIKE search if FTS query is malformed
      const likePattern = `%${sanitized}%`;
      return this.db.prepare(`
        SELECT * FROM sessions WHERE title LIKE ? ORDER BY updated_at DESC LIMIT ?
      `).all(likePattern, limit) as StoredSession[];
    }
  }

  /**
   * Search messages by content using FTS5.
   * Optionally filter by session ID.
   */
  searchMessages(query: string, sessionId?: string, limit: number = 50): StoredMessage[] {
    if (!query || query.trim().length === 0) return [];

    const sanitized = query.replace(/['"]/g, ' ').trim();
    if (sanitized.length === 0) return [];

    const ftsQuery = sanitized
      .split(/\s+/)
      .filter(w => w.length > 0)
      .map(w => `"${w}"*`)
      .join(' ');

    try {
      if (sessionId) {
        return this.db.prepare(`
          SELECT m.* FROM messages m
          INNER JOIN messages_fts fts ON m.rowid = fts.rowid
          WHERE messages_fts MATCH ? AND m.session_id = ?
          ORDER BY rank
          LIMIT ?
        `).all(ftsQuery, sessionId, limit) as StoredMessage[];
      }
      return this.db.prepare(`
        SELECT m.* FROM messages m
        INNER JOIN messages_fts fts ON m.rowid = fts.rowid
        WHERE messages_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(ftsQuery, limit) as StoredMessage[];
    } catch {
      // Fallback to LIKE
      const likePattern = `%${sanitized}%`;
      if (sessionId) {
        return this.db.prepare(`
          SELECT * FROM messages WHERE content LIKE ? AND session_id = ? ORDER BY created_at DESC LIMIT ?
        `).all(likePattern, sessionId, limit) as StoredMessage[];
      }
      return this.db.prepare(`
        SELECT * FROM messages WHERE content LIKE ? ORDER BY created_at DESC LIMIT ?
      `).all(likePattern, limit) as StoredMessage[];
    }
  }

  /**
   * Search tool calls by tool name, input, or output using FTS5.
   */
  searchToolCalls(query: string, sessionId?: string, limit: number = 50): StoredToolCall[] {
    if (!query || query.trim().length === 0) return [];

    const sanitized = query.replace(/['"]/g, ' ').trim();
    if (sanitized.length === 0) return [];

    const ftsQuery = sanitized
      .split(/\s+/)
      .filter(w => w.length > 0)
      .map(w => `"${w}"*`)
      .join(' ');

    try {
      if (sessionId) {
        return this.db.prepare(`
          SELECT tc.* FROM tool_calls tc
          INNER JOIN tool_calls_fts fts ON tc.rowid = fts.rowid
          WHERE tool_calls_fts MATCH ? AND tc.session_id = ?
          ORDER BY rank
          LIMIT ?
        `).all(ftsQuery, sessionId, limit) as StoredToolCall[];
      }
      return this.db.prepare(`
        SELECT tc.* FROM tool_calls tc
        INNER JOIN tool_calls_fts fts ON tc.rowid = fts.rowid
        WHERE tool_calls_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(ftsQuery, limit) as StoredToolCall[];
    } catch {
      const likePattern = `%${sanitized}%`;
      if (sessionId) {
        return this.db.prepare(`
          SELECT * FROM tool_calls
          WHERE (tool_name LIKE ? OR input_json LIKE ? OR output_json LIKE ?) AND session_id = ?
          ORDER BY created_at DESC LIMIT ?
        `).all(likePattern, likePattern, likePattern, sessionId, limit) as StoredToolCall[];
      }
      return this.db.prepare(`
        SELECT * FROM tool_calls
        WHERE tool_name LIKE ? OR input_json LIKE ? OR output_json LIKE ?
        ORDER BY created_at DESC LIMIT ?
      `).all(likePattern, likePattern, likePattern, limit) as StoredToolCall[];
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────

  /**
   * Delete a session and all associated messages and tool calls (cascaded).
   */
  deleteSession(sessionId: string): boolean {
    const result = this.db.prepare(`
      DELETE FROM sessions WHERE id = ?
    `).run(sessionId);

    return result.changes > 0;
  }

  /**
   * Delete all sessions.
   */
  deleteAllSessions(): number {
    const result = this.db.prepare('DELETE FROM sessions').run();
    return result.changes;
  }

  // ── Statistics ────────────────────────────────────────────────────────

  /**
   * Get aggregate statistics about all sessions.
   */
  getSessionStats(): SessionStats {
    const sessionCount = this.db.prepare(
      'SELECT COUNT(*) as count FROM sessions'
    ).get() as { count: number };

    const messageCount = this.db.prepare(
      'SELECT COUNT(*) as count FROM messages'
    ).get() as { count: number };

    const toolCallCount = this.db.prepare(
      'SELECT COUNT(*) as count FROM tool_calls'
    ).get() as { count: number };

    const oldestSession = this.db.prepare(
      'SELECT created_at FROM sessions ORDER BY created_at ASC LIMIT 1'
    ).get() as { created_at: string } | null;

    const newestSession = this.db.prepare(
      'SELECT created_at FROM sessions ORDER BY created_at DESC LIMIT 1'
    ).get() as { created_at: string } | null;

    const messagesByRole = this.db.prepare(
      'SELECT role, COUNT(*) as count FROM messages GROUP BY role'
    ).all() as Array<{ role: string; count: number }>;

    const topTools = this.db.prepare(
      'SELECT tool_name, COUNT(*) as count FROM tool_calls GROUP BY tool_name ORDER BY count DESC LIMIT 10'
    ).all() as Array<{ tool_name: string; count: number }>;

    const tokenSums = this.db.prepare(
      'SELECT COALESCE(SUM(tokens_in), 0) as totalIn, COALESCE(SUM(tokens_out), 0) as totalOut FROM messages'
    ).get() as { totalIn: number; totalOut: number };

    const roleMap: Record<string, number> = {};
    for (const row of messagesByRole) {
      roleMap[row.role] = row.count;
    }

    return {
      totalSessions: sessionCount.count,
      totalMessages: messageCount.count,
      totalToolCalls: toolCallCount.count,
      oldestSession: oldestSession?.created_at || null,
      newestSession: newestSession?.created_at || null,
      messagesByRole: roleMap,
      topTools,
      totalTokensIn: tokenSums.totalIn,
      totalTokensOut: tokenSums.totalOut,
    };
  }

  // ── Session Compression ───────────────────────────────────────────────

  /**
   * Compress a session by removing old messages and replacing them with a summary.
   * Keeps the most recent `keepLast` messages intact.
   * Preserves all tool call records.
   * Returns the number of messages removed.
   */
  compressSession(sessionId: string, summary: string, keepLast: number = 10): number {
    const session = this.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const messages = this.getMessages(sessionId);
    if (messages.length <= keepLast) {
      return 0; // Nothing to compress
    }

    const cutoffIndex = messages.length - keepLast;
    const messagesToRemove = messages.slice(0, cutoffIndex);
    const summaryMessageId = messagesToRemove[0]?.id;

    if (!summaryMessageId) return 0;

    const txn = this.db.transaction(() => {
      // Delete old messages (tool_calls cascade will preserve them via FK, but we need to
      // detach them from the deleted messages by updating their message_id)
      const idsToRemove = messagesToRemove.map(m => m.id);

      // Re-attach orphaned tool calls to the summary message
      for (const id of idsToRemove) {
        this.db.prepare(`
          UPDATE tool_calls SET message_id = ? WHERE message_id = ?
        `).run(summaryMessageId, id);
      }

      // Delete old messages
      const placeholders = idsToRemove.map(() => '?').join(', ');
      this.db.prepare(`
        DELETE FROM messages WHERE id IN (${placeholders})
      `).run(...idsToRemove);

      // Insert the summary message at the position of the first removed message
      const now = nowISO();
      this.db.prepare(`
        INSERT INTO messages (id, session_id, role, content, model, tokens_in, tokens_out, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        summaryMessageId,
        sessionId,
        'user',
        summary,
        null,
        0,
        0,
        messagesToRemove[0].created_at,
      );

      // Touch session
      this.db.prepare(`
        UPDATE sessions SET updated_at = ? WHERE id = ?
      `).run(now, sessionId);
    });

    txn();
    return messagesToRemove.length;
  }

  // ── Utility ───────────────────────────────────────────────────────────

  /**
   * Get the total number of messages in a session.
   */
  getSessionMessageCount(sessionId: string): number {
    const result = this.db.prepare(
      'SELECT COUNT(*) as count FROM messages WHERE session_id = ?'
    ).get(sessionId) as { count: number };
    return result.count;
  }

  /**
   * Get the total number of tool calls in a session.
   */
  getSessionToolCallCount(sessionId: string): number {
    const result = this.db.prepare(
      'SELECT COUNT(*) as count FROM tool_calls WHERE session_id = ?'
    ).get(sessionId) as { count: number };
    return result.count;
  }

  /**
   * Duplicate a session and all its messages/tool calls (used for branching).
   * Returns the new session ID.
   */
  cloneSession(sourceSessionId: string, newTitle?: string): string {
    const source = this.getSession(sourceSessionId);
    if (!source) {
      throw new Error(`Session not found: ${sourceSessionId}`);
    }

    const newSessionId = generateId('session');
    const now = nowISO();

    const txn = this.db.transaction(() => {
      // Create the new session
      this.db.prepare(`
        INSERT INTO sessions (id, title, model, mode, created_at, updated_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        newSessionId,
        newTitle || `${source.title} (branch)`,
        source.model,
        source.mode,
        now,
        now,
        source.metadata_json,
      );

      // Clone messages
      const oldToNewMsgId = new Map<string, string>();
      for (const msg of source.messages) {
        const newMsgId = generateId('msg');
        oldToNewMsgId.set(msg.id, newMsgId);

        this.db.prepare(`
          INSERT INTO messages (id, session_id, role, content, model, tokens_in, tokens_out, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newMsgId,
          newSessionId,
          msg.role,
          msg.content,
          msg.model,
          msg.tokens_in,
          msg.tokens_out,
          msg.created_at,
        );
      }

      // Clone tool calls with remapped message IDs
      const toolCalls = this.getToolCalls(sourceSessionId);
      for (const tc of toolCalls) {
        const newMsgId = oldToNewMsgId.get(tc.message_id) || tc.message_id;
        this.db.prepare(`
          INSERT INTO tool_calls (id, message_id, session_id, tool_name, input_json, output_json, duration_ms, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          generateId('tc'),
          newMsgId,
          newSessionId,
          tc.tool_name,
          tc.input_json,
          tc.output_json,
          tc.duration_ms,
          tc.status,
          tc.created_at,
        );
      }
    });

    txn();
    return newSessionId;
  }

  /**
   * Export a full session (messages + tool calls) as a plain JSON object.
   */
  exportSessionJSON(sessionId: string): SessionWithMessages & { tool_calls: StoredToolCall[] } | null {
    const session = this.getSession(sessionId);
    if (!session) return null;

    const toolCalls = this.getToolCalls(sessionId);

    return {
      ...session,
      tool_calls: toolCalls,
    };
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }

  /**
   * Run VACUUM to reclaim space and defragment the database.
   */
  vacuum(): void {
    this.db.exec('VACUUM');
  }

  /**
   * Get raw database instance for advanced operations.
   */
  getRawDatabase(): Database.Database {
    return this.db;
  }
}
