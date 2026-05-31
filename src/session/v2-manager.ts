import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import createDebug from 'debug';

const debug = createDebug('mimo:session-v2');

// ─── Session Types ─────────────────────────────────────────────────

export interface SessionV2 {
  id: string;
  name?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  projectDir: string;
  agentMode: string;
  model: string;
  turnCount: number;
  messageCount: number;
  tokenUsage: { input: number; output: number; cache: number };
  modifiedFiles: string[];
  tags: string[];
  status: 'active' | 'idle' | 'archived' | 'error';
  transcript: TranscriptEntry[];
  compactionHistory: CompactionCheckpoint[];
  metadata: Record<string, any>;
}

export interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  turnIndex: number;
  toolCalls?: Array<{ name: string; input: any; output: any; success: boolean }>;
  thinking?: string;
  tokensUsed?: number;
}

export interface CompactionCheckpoint {
  id: string;
  timestamp: string;
  messagesRemoved: number;
  tokensSaved: number;
  summary: string;
  preservedCritical: number;
}

export interface SessionSearchResult {
  session: SessionV2;
  matches: Array<{ entry: TranscriptEntry; snippet: string; score: number }>;
}

// ─── Session Manager ───────────────────────────────────────────────

export class SessionManagerV2 {
  private sessionsDir: string;
  private sessions: Map<string, SessionV2> = new Map();

  constructor(sessionsDir?: string) {
    this.sessionsDir = sessionsDir || path.join(os.homedir(), '.mimo', 'sessions');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
    await this.loadAll();
    debug('Session manager initialized: %d sessions loaded', this.sessions.size);
  }

  // ─── CRUD Operations ──────────────────────────────────────────

  async create(params: {
    projectDir?: string;
    agentMode?: string;
    model?: string;
    name?: string;
    tags?: string[];
  }): Promise<SessionV2> {
    const id = `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const session: SessionV2 = {
      id,
      name: params.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projectDir: params.projectDir || process.cwd(),
      agentMode: params.agentMode || 'agent',
      model: params.model || 'auto',
      turnCount: 0,
      messageCount: 0,
      tokenUsage: { input: 0, output: 0, cache: 0 },
      modifiedFiles: [],
      tags: params.tags || [],
      status: 'active',
      transcript: [],
      compactionHistory: [],
      metadata: {},
    };

    this.sessions.set(id, session);
    await this.save(session);
    debug('Created session: %s', id);
    return session;
  }

  get(id: string): SessionV2 | undefined {
    return this.sessions.get(id);
  }

  list(filter?: {
    projectDir?: string;
    status?: SessionV2['status'];
    tags?: string[];
    limit?: number;
  }): SessionV2[] {
    let sessions = Array.from(this.sessions.values());

    if (filter?.projectDir) {
      sessions = sessions.filter(s => s.projectDir === filter.projectDir);
    }
    if (filter?.status) {
      sessions = sessions.filter(s => s.status === filter.status);
    }
    if (filter?.tags?.length) {
      sessions = sessions.filter(s => filter.tags!.some(t => s.tags.includes(t)));
    }

    sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    if (filter?.limit) {
      sessions = sessions.slice(0, filter.limit);
    }

    return sessions;
  }

  async update(id: string, patch: Partial<SessionV2>): Promise<SessionV2 | null> {
    const session = this.sessions.get(id);
    if (!session) return null;

    Object.assign(session, patch, { updatedAt: new Date().toISOString() });
    await this.save(session);
    return session;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = this.sessions.delete(id);
    if (deleted) {
      try {
        await fs.unlink(path.join(this.sessionsDir, `${id}.json`));
      } catch {}
    }
    return deleted;
  }

  async archive(id: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.status = 'archived';
    session.updatedAt = new Date().toISOString();
    await this.save(session);
    return true;
  }

  // ─── Transcript Management ─────────────────────────────────────

  async addEntry(sessionId: string, entry: Omit<TranscriptEntry, 'id'>): Promise<TranscriptEntry> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const fullEntry: TranscriptEntry = {
      ...entry,
      id: `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    };

    session.transcript.push(fullEntry);
    session.messageCount = session.transcript.length;
    session.turnCount = entry.role === 'user' ? session.turnCount + 1 : session.turnCount;
    session.updatedAt = new Date().toISOString();

    // Auto-save periodically
    if (session.transcript.length % 10 === 0) {
      await this.save(session);
    }

    return fullEntry;
  }

  async addTokenUsage(sessionId: string, input: number, output: number, cache = 0): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.tokenUsage.input += input;
    session.tokenUsage.output += output;
    session.tokenUsage.cache += cache;
  }

  async addModifiedFile(sessionId: string, filePath: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (!session.modifiedFiles.includes(filePath)) {
      session.modifiedFiles.push(filePath);
    }
  }

  // ─── Compaction ────────────────────────────────────────────────

  async addCompactionCheckpoint(sessionId: string, checkpoint: Omit<CompactionCheckpoint, 'id'>): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.compactionHistory.push({
      ...checkpoint,
      id: `compact-${Date.now().toString(36)}`,
    });

    await this.save(session);
  }

  // ─── Search ────────────────────────────────────────────────────

  async searchTranscript(query: string, sessionIds?: string[]): Promise<SessionSearchResult[]> {
    const results: SessionSearchResult[] = [];
    const queryLower = query.toLowerCase();
    const words = queryLower.split(/\s+/).filter(w => w.length > 2);

    const sessions = sessionIds
      ? sessionIds.map(id => this.sessions.get(id)).filter(Boolean) as SessionV2[]
      : Array.from(this.sessions.values());

    for (const session of sessions) {
      const matches: SessionSearchResult['matches'] = [];

      for (const entry of session.transcript) {
        const contentLower = entry.content.toLowerCase();
        let score = 0;

        for (const word of words) {
          if (contentLower.includes(word)) score += 2;
        }
        if (contentLower.includes(queryLower)) score += 5;

        if (score > 0) {
          const snippetStart = Math.max(0, contentLower.indexOf(words[0]) - 50);
          const snippet = entry.content.slice(snippetStart, snippetStart + 200);
          matches.push({ entry, snippet, score });
        }
      }

      if (matches.length > 0) {
        matches.sort((a, b) => b.score - a.score);
        results.push({ session, matches: matches.slice(0, 5) });
      }
    }

    results.sort((a, b) =>
      Math.max(...b.matches.map(m => m.score)) - Math.max(...a.matches.map(m => m.score)),
    );

    return results.slice(0, 20);
  }

  // ─── Reset ─────────────────────────────────────────────────────

  async reset(id: string): Promise<SessionV2 | null> {
    const session = this.sessions.get(id);
    if (!session) return null;

    session.transcript = [];
    session.compactionHistory = [];
    session.turnCount = 0;
    session.messageCount = 0;
    session.tokenUsage = { input: 0, output: 0, cache: 0 };
    session.modifiedFiles = [];
    session.status = 'active';
    session.updatedAt = new Date().toISOString();

    await this.save(session);
    return session;
  }

  // ─── Descriptions ──────────────────────────────────────────────

  async describe(id: string): Promise<string> {
    const session = this.sessions.get(id);
    if (!session) return 'Session not found';

    const lines: string[] = [];
    lines.push(`Session: ${session.name || session.id}`);
    lines.push(`Status: ${session.status} | Mode: ${session.agentMode} | Model: ${session.model}`);
    lines.push(`Created: ${new Date(session.createdAt).toLocaleString()}`);
    lines.push(`Turns: ${session.turnCount} | Messages: ${session.messageCount}`);
    lines.push(`Tokens: ${session.tokenUsage.input} in / ${session.tokenUsage.output} out / ${session.tokenUsage.cache} cache`);
    lines.push(`Files modified: ${session.modifiedFiles.length}`);
    if (session.tags.length) lines.push(`Tags: ${session.tags.join(', ')}`);
    if (session.compactionHistory.length) lines.push(`Compactions: ${session.compactionHistory.length}`);
    return lines.join('\n');
  }

  // ─── Persistence ───────────────────────────────────────────────

  private async save(session: SessionV2): Promise<void> {
    try {
      const filePath = path.join(this.sessionsDir, `${session.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(session, null, 2));
    } catch (err: any) {
      debug('Save session %s failed: %s', session.id, err.message);
    }
  }

  private async loadAll(): Promise<void> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        try {
          const data = await fs.readFile(path.join(this.sessionsDir, file), 'utf-8');
          const session = JSON.parse(data) as SessionV2;
          this.sessions.set(session.id, session);
        } catch {}
      }
    } catch {}
  }

  getStats(): { total: number; active: number; archived: number; totalTokens: number; totalMessages: number } {
    const all = Array.from(this.sessions.values());
    return {
      total: all.length,
      active: all.filter(s => s.status === 'active').length,
      archived: all.filter(s => s.status === 'archived').length,
      totalTokens: all.reduce((sum, s) => sum + s.tokenUsage.input + s.tokenUsage.output, 0),
      totalMessages: all.reduce((sum, s) => sum + s.messageCount, 0),
    };
  }
}
