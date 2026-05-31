// ── Enhanced Session Manager ─────────────────────────────────────────────────
// Wraps the SQLite session store with high-level session lifecycle management:
// auto-save on each turn, session branching (fork at any point), timeline
// visualization, export/import, and comprehensive statistics and analytics.

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ApiAdapter } from '../api/types';
import {
  SQLiteSessionStore,
  StoredSession,
  StoredMessage,
  StoredToolCall,
  SessionWithMessages,
  SessionStats,
  AddMessageOptions,
  AddToolCallOptions,
} from './sqlite-store';
import { SessionCompressor, CompressionConfig, CompressionResult } from './compression';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface SessionManagerConfig {
  /** Path to the SQLite database file */
  dbPath: string;
  /** Auto-compression configuration */
  compression?: Partial<CompressionConfig>;
  /** Enable auto-save after each turn */
  autoSave: boolean;
  /** Maximum sessions to list by default */
  defaultListLimit: number;
  /** Default model used in this session context */
  defaultModel: string;
  /** Default mode for new sessions */
  defaultMode: string;
}

export interface TurnData {
  /** User message content */
  userMessage: string;
  /** Assistant response content */
  assistantResponse: string;
  /** Token usage for this turn */
  tokensIn?: number;
  tokensOut?: number;
  /** Model used for this turn */
  model?: string;
  /** Tool calls made during this turn */
  toolCalls?: TurnToolCall[];
}

export interface TurnToolCall {
  toolName: string;
  inputJson: string;
  outputJson: string;
  durationMs?: number;
  status?: string;
}

export interface TimelineEntry {
  index: number;
  messageId: string;
  role: string;
  timestamp: string;
  contentPreview: string;
  toolCalls: Array<{
    toolName: string;
    status: string;
    durationMs: number;
  }>;
  tokensIn: number;
  tokensOut: number;
}

export interface SessionTimeline {
  sessionId: string;
  title: string;
  totalMessages: number;
  totalToolCalls: number;
  entries: TimelineEntry[];
  duration: {
    firstMessage: string;
    lastMessage: string;
    elapsedMs: number;
  } | null;
}

export interface ExportedSession {
  version: string;
  exportedAt: string;
  session: StoredSession;
  messages: StoredMessage[];
  toolCalls: StoredToolCall[];
}

export interface MarkdownExport {
  title: string;
  sessionId: string;
  createdAt: string;
  content: string;
}

export interface BranchResult {
  newSessionId: string;
  title: string;
  messagesCloned: number;
  toolCallsCloned: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Config
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_MANAGER_CONFIG: SessionManagerConfig = {
  dbPath: '',
  autoSave: true,
  defaultListLimit: 50,
  defaultModel: 'mimo-v2.5',
  defaultMode: 'code',
};

// ═══════════════════════════════════════════════════════════════════════════════
// SessionManager
// ═══════════════════════════════════════════════════════════════════════════════

export class SessionManager {
  private store: SQLiteSessionStore;
  private compressor: SessionCompressor;
  private config: SessionManagerConfig;
  private activeSessionId: string | null = null;

  constructor(config: Partial<SessionManagerConfig> & { dbPath: string }, apiClient: ApiAdapter) {
    this.config = { ...DEFAULT_MANAGER_CONFIG, ...config };
    this.store = new SQLiteSessionStore(this.config.dbPath);
    this.compressor = new SessionCompressor(this.store, apiClient, this.config.compression);
  }

  // ── Session Lifecycle ─────────────────────────────────────────────────

  /**
   * Create a new session and set it as the active session.
   */
  createSession(title?: string, model?: string, mode?: string): string {
    const sessionId = this.store.createSession(
      title || `Session ${new Date().toLocaleString()}`,
      model || this.config.defaultModel,
      mode || this.config.defaultMode,
    );
    this.activeSessionId = sessionId;
    return sessionId;
  }

  /**
   * Set the active session for turn-based operations.
   */
  setActiveSession(sessionId: string): void {
    const session = this.store.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    this.activeSessionId = sessionId;
  }

  /**
   * Get the active session ID.
   */
  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  /**
   * Get the active session with all messages.
   */
  getActiveSession(): SessionWithMessages | null {
    if (!this.activeSessionId) return null;
    return this.store.getSession(this.activeSessionId);
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): SessionWithMessages | null {
    return this.store.getSession(sessionId);
  }

  /**
   * List all sessions.
   */
  listSessions(limit?: number, offset?: number): StoredSession[] {
    return this.store.listSessions(
      limit || this.config.defaultListLimit,
      offset || 0,
    );
  }

  /**
   * Update session title or metadata.
   */
  updateSession(sessionId: string, updates: { title?: string; metadata?: Record<string, any> }): void {
    this.store.updateSession(sessionId, updates);
  }

  /**
   * Delete a session and all its data.
   */
  deleteSession(sessionId: string): boolean {
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }
    return this.store.deleteSession(sessionId);
  }

  // ── Turn-Based Auto-Save ──────────────────────────────────────────────

  /**
   * Record a complete turn (user message + assistant response + tool calls).
   * This is the primary method for saving conversation data.
   * Automatically checks for compression if autoSave is enabled.
   */
  async recordTurn(turn: TurnData, sessionId?: string): Promise<{ userMsgId: string; assistantMsgId: string; compressed: boolean }> {
    const sid = sessionId || this.activeSessionId;
    if (!sid) {
      throw new Error('No active session. Call createSession() or setActiveSession() first.');
    }

    // Add user message
    const userMsgId = this.store.addMessage(sid, {
      role: 'user',
      content: turn.userMessage,
      tokensIn: turn.tokensIn || 0,
      tokensOut: 0,
    });

    // Add assistant message
    const assistantMsgId = this.store.addMessage(sid, {
      role: 'assistant',
      content: turn.assistantResponse,
      model: turn.model,
      tokensIn: 0,
      tokensOut: turn.tokensOut || 0,
    });

    // Record tool calls
    if (turn.toolCalls && turn.toolCalls.length > 0) {
      for (const tc of turn.toolCalls) {
        this.store.addToolCall(sid, assistantMsgId, {
          toolName: tc.toolName,
          inputJson: tc.inputJson,
          outputJson: tc.outputJson,
          durationMs: tc.durationMs,
          status: tc.status || 'success',
        });
      }
    }

    // Auto-compress if configured
    let compressed = false;
    if (this.config.autoSave) {
      const trigger = this.compressor.checkCompressionNeeded(sid);
      if (trigger.needed) {
        try {
          const result = await this.compressor.compressSession(sid);
          compressed = result.messagesCompressed > 0;
        } catch {
          // Compression failure is non-fatal
        }
      }
    }

    return { userMsgId, assistantMsgId, compressed };
  }

  /**
   * Add a single message to the active session.
   */
  addMessage(options: AddMessageOptions, sessionId?: string): string {
    const sid = sessionId || this.activeSessionId;
    if (!sid) {
      throw new Error('No active session.');
    }
    return this.store.addMessage(sid, options);
  }

  /**
   * Add a tool call record.
   */
  addToolCall(messageId: string, options: AddToolCallOptions, sessionId?: string): string {
    const sid = sessionId || this.activeSessionId;
    if (!sid) {
      throw new Error('No active session.');
    }
    return this.store.addToolCall(sid, messageId, options);
  }

  // ── Session Branching ─────────────────────────────────────────────────

  /**
   * Fork (branch) a session at a specific message.
   * Creates a new session that includes all messages up to and including the
   * specified message index, plus all subsequent messages are dropped.
   */
  branchAtMessage(sourceSessionId: string, messageIndex: number, newTitle?: string): BranchResult {
    const source = this.store.getSession(sourceSessionId);
    if (!source) {
      throw new Error(`Source session not found: ${sourceSessionId}`);
    }

    if (messageIndex < 0 || messageIndex >= source.messages.length) {
      throw new Error(`Message index ${messageIndex} out of range (0-${source.messages.length - 1})`);
    }

    // Create a full clone first
    const newSessionId = this.store.cloneSession(sourceSessionId, newTitle);

    // Then trim messages after the branch point
    const targetMessage = source.messages[messageIndex];
    const deletedCount = this.store.deleteMessagesAfter(newSessionId, targetMessage.id);

    // Update the title to indicate it's a branch
    const branchTitle = newTitle || `${source.title} (branch @ msg ${messageIndex})`;
    this.store.updateSession(newSessionId, { title: branchTitle });

    // Count what was preserved
    const newMessages = this.store.getMessages(newSessionId);
    const newToolCalls = this.store.getToolCalls(newSessionId);

    return {
      newSessionId,
      title: branchTitle,
      messagesCloned: newMessages.length,
      toolCallsCloned: newToolCalls.length,
    };
  }

  /**
   * Fork a session completely (all messages preserved).
   */
  forkSession(sourceSessionId: string, newTitle?: string): BranchResult {
    const newSessionId = this.store.cloneSession(sourceSessionId, newTitle);
    const source = this.store.getSession(sourceSessionId);
    const toolCalls = this.store.getToolCalls(sourceSessionId);

    return {
      newSessionId,
      title: newTitle || `${source?.title || 'Session'} (fork)`,
      messagesCloned: source?.messages.length || 0,
      toolCallsCloned: toolCalls.length,
    };
  }

  // ── Timeline Visualization ────────────────────────────────────────────

  /**
   * Generate timeline visualization data for a session.
   */
  getSessionTimeline(sessionId: string): SessionTimeline {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const toolCalls = this.store.getToolCalls(sessionId);
    const toolCallsByMessage = new Map<string, StoredToolCall[]>();
    for (const tc of toolCalls) {
      const existing = toolCallsByMessage.get(tc.message_id) || [];
      existing.push(tc);
      toolCallsByMessage.set(tc.message_id, existing);
    }

    const entries: TimelineEntry[] = session.messages.map((msg, index) => {
      const msgToolCalls = toolCallsByMessage.get(msg.id) || [];
      return {
        index,
        messageId: msg.id,
        role: msg.role,
        timestamp: msg.created_at,
        contentPreview: msg.content.slice(0, 120).replace(/\n/g, ' '),
        toolCalls: msgToolCalls.map(tc => ({
          toolName: tc.tool_name,
          status: tc.status,
          durationMs: tc.duration_ms,
        })),
        tokensIn: msg.tokens_in,
        tokensOut: msg.tokens_out,
      };
    });

    // Calculate duration
    let duration: SessionTimeline['duration'] = null;
    if (session.messages.length >= 2) {
      const first = new Date(session.messages[0].created_at).getTime();
      const last = new Date(session.messages[session.messages.length - 1].created_at).getTime();
      duration = {
        firstMessage: session.messages[0].created_at,
        lastMessage: session.messages[session.messages.length - 1].created_at,
        elapsedMs: last - first,
      };
    }

    return {
      sessionId,
      title: session.title,
      totalMessages: session.messages.length,
      totalToolCalls: toolCalls.length,
      entries,
      duration,
    };
  }

  /**
   * Format a session timeline as a human-readable string for terminal display.
   */
  formatTimeline(sessionId: string, maxEntries: number = 30): string {
    const timeline = this.getSessionTimeline(sessionId);
    const lines: string[] = [];

    lines.push(`=== Session: ${timeline.title} ===`);
    lines.push(`ID: ${timeline.sessionId}`);
    lines.push(`Messages: ${timeline.totalMessages} | Tool Calls: ${timeline.totalToolCalls}`);

    if (timeline.duration) {
      const elapsedMin = Math.round(timeline.duration.elapsedMs / 60000);
      lines.push(`Duration: ${elapsedMin} minutes`);
    }
    lines.push('');

    const entries = timeline.entries.slice(-maxEntries);
    const startIndex = Math.max(0, timeline.entries.length - maxEntries);

    for (const entry of entries) {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const roleIcon = entry.role === 'user' ? '>' : entry.role === 'assistant' ? '<' : '#';
      const tcInfo = entry.toolCalls.length > 0
        ? ` [${entry.toolCalls.map(tc => tc.toolName).join(', ')}]`
        : '';
      const tokenInfo = (entry.tokensIn > 0 || entry.tokensOut > 0)
        ? ` (${entry.tokensIn + entry.tokensOut} tok)`
        : '';

      lines.push(`${roleIcon} [${startIndex + entry.index}] ${time}${tcInfo}${tokenInfo}`);
      lines.push(`  ${entry.contentPreview}`);
    }

    return lines.join('\n');
  }

  // ── Search ────────────────────────────────────────────────────────────

  /**
   * Search sessions by title.
   */
  searchSessions(query: string, limit?: number): StoredSession[] {
    return this.store.searchSessions(query, limit);
  }

  /**
   * Search messages by content.
   */
  searchMessages(query: string, sessionId?: string, limit?: number): StoredMessage[] {
    return this.store.searchMessages(query, sessionId, limit);
  }

  /**
   * Search tool calls.
   */
  searchToolCalls(query: string, sessionId?: string, limit?: number): StoredToolCall[] {
    return this.store.searchToolCalls(query, sessionId, limit);
  }

  // ── Export / Import ───────────────────────────────────────────────────

  /**
   * Export a session to JSON format.
   */
  async exportSessionToJSON(sessionId: string, outputPath?: string): Promise<ExportedSession> {
    const data = this.store.exportSessionJSON(sessionId);
    if (!data) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const exported: ExportedSession = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      session: {
        id: data.id,
        title: data.title,
        model: data.model,
        mode: data.mode,
        created_at: data.created_at,
        updated_at: data.updated_at,
        metadata_json: data.metadata_json,
      },
      messages: data.messages,
      toolCalls: data.tool_calls,
    };

    if (outputPath) {
      const dir = path.dirname(outputPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(exported, null, 2), 'utf-8');
    }

    return exported;
  }

  /**
   * Export a session to Markdown format.
   */
  async exportSessionToMarkdown(sessionId: string, outputPath?: string): Promise<MarkdownExport> {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const toolCalls = this.store.getToolCalls(sessionId);
    const toolCallsByMessage = new Map<string, StoredToolCall[]>();
    for (const tc of toolCalls) {
      const existing = toolCallsByMessage.get(tc.message_id) || [];
      existing.push(tc);
      toolCallsByMessage.set(tc.message_id, existing);
    }

    const parts: string[] = [];

    parts.push(`# ${session.title}`);
    parts.push('');
    parts.push(`**Session ID:** \`${session.id}\``);
    parts.push(`**Model:** ${session.model || 'N/A'}`);
    parts.push(`**Mode:** ${session.mode}`);
    parts.push(`**Created:** ${session.created_at}`);
    parts.push(`**Messages:** ${session.messages.length}`);
    parts.push(`**Tool Calls:** ${toolCalls.length}`);
    parts.push('');
    parts.push('---');
    parts.push('');

    for (let i = 0; i < session.messages.length; i++) {
      const msg = session.messages[i];
      const roleLabel = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);

      parts.push(`### [${i}] ${roleLabel}`);
      parts.push(`*${msg.created_at}*`);
      if (msg.model) parts.push(`*Model: ${msg.model}*`);
      if (msg.tokens_in > 0 || msg.tokens_out > 0) {
        parts.push(`*Tokens: ${msg.tokens_in} in / ${msg.tokens_out} out*`);
      }
      parts.push('');
      parts.push(msg.content);
      parts.push('');

      // Tool calls for this message
      const msgToolCalls = toolCallsByMessage.get(msg.id);
      if (msgToolCalls && msgToolCalls.length > 0) {
        parts.push('<details>');
        parts.push(`<summary>Tool Calls (${msgToolCalls.length})</summary>`);
        parts.push('');
        for (const tc of msgToolCalls) {
          parts.push(`#### ${tc.tool_name}`);
          parts.push(`- **Status:** ${tc.status}`);
          parts.push(`- **Duration:** ${tc.duration_ms}ms`);
          parts.push('```json');
          parts.push(`Input: ${tc.input_json.slice(0, 500)}`);
          parts.push('```');
          if (tc.output_json) {
            parts.push('```');
            parts.push(`Output: ${tc.output_json.slice(0, 500)}`);
            parts.push('```');
          }
          parts.push('');
        }
        parts.push('</details>');
        parts.push('');
      }

      parts.push('---');
      parts.push('');
    }

    const content = parts.join('\n');
    const result: MarkdownExport = {
      title: session.title,
      sessionId: session.id,
      createdAt: session.created_at,
      content,
    };

    if (outputPath) {
      const dir = path.dirname(outputPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(outputPath, content, 'utf-8');
    }

    return result;
  }

  /**
   * Import a session from a JSON export file.
   * Returns the new session ID.
   */
  async importSessionFromJSON(inputPath: string): Promise<string> {
    const raw = await fs.readFile(inputPath, 'utf-8');
    return this.importSessionFromData(raw);
  }

  /**
   * Import a session from a JSON string.
   */
  importSessionFromData(jsonString: string): string {
    const data = JSON.parse(jsonString) as ExportedSession;

    if (!data.session || !data.messages) {
      throw new Error('Invalid session export format: missing session or messages');
    }

    // Create the session
    const newSessionId = this.store.createSession(
      data.session.title,
      data.session.model,
      data.session.mode,
    );

    // Import messages with their original timestamps
    const oldToNewMsgId = new Map<string, string>();
    for (const msg of data.messages) {
      // We create the message with the store, then update the timestamp
      const newMsgId = this.store.addMessage(newSessionId, {
        role: msg.role,
        content: msg.content,
        model: msg.model || undefined,
        tokensIn: msg.tokens_in,
        tokensOut: msg.tokens_out,
      });
      oldToNewMsgId.set(msg.id, newMsgId);

      // Update the created_at to the original
      this.store.getRawDatabase().prepare(`
        UPDATE messages SET created_at = ? WHERE id = ?
      `).run(msg.created_at, newMsgId);
    }

    // Import tool calls
    if (data.toolCalls) {
      for (const tc of data.toolCalls) {
        const newMsgId = oldToNewMsgId.get(tc.message_id) || tc.message_id;
        this.store.addToolCall(newSessionId, newMsgId, {
          toolName: tc.tool_name,
          inputJson: tc.input_json,
          outputJson: tc.output_json,
          durationMs: tc.duration_ms,
          status: tc.status,
        });
      }
    }

    // Update session metadata
    this.store.updateSession(newSessionId, {
      metadata: {
        imported: true,
        originalId: data.session.id,
        importedAt: new Date().toISOString(),
      },
    });

    return newSessionId;
  }

  // ── Compression ───────────────────────────────────────────────────────

  /**
   * Manually trigger compression on a session.
   */
  async compressSession(sessionId: string): Promise<CompressionResult> {
    return this.compressor.compressSession(sessionId);
  }

  /**
   * Check if a session needs compression.
   */
  checkCompressionNeeded(sessionId: string) {
    return this.compressor.checkCompressionNeeded(sessionId);
  }

  /**
   * Update compression configuration.
   */
  updateCompressionConfig(config: Partial<CompressionConfig>): void {
    this.compressor.updateConfig(config);
  }

  // ── Statistics & Analytics ────────────────────────────────────────────

  /**
   * Get global session statistics.
   */
  getStats(): SessionStats {
    return this.store.getSessionStats();
  }

  /**
   * Get statistics for a specific session.
   */
  getSessionAnalytics(sessionId: string): {
    session: StoredSession;
    messageCount: number;
    toolCallCount: number;
    toolCallsByTool: Record<string, number>;
    tokensIn: number;
    tokensOut: number;
    averageResponseLength: number;
    failedToolCalls: number;
    durationMs: number | null;
  } {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const toolCalls = this.store.getToolCalls(sessionId);
    const assistantMessages = session.messages.filter(m => m.role === 'assistant');

    // Tool call breakdown
    const toolCallsByTool: Record<string, number> = {};
    let failedToolCalls = 0;
    for (const tc of toolCalls) {
      toolCallsByTool[tc.tool_name] = (toolCallsByTool[tc.tool_name] || 0) + 1;
      if (tc.status === 'error' || tc.status === 'failure') {
        failedToolCalls++;
      }
    }

    // Token totals
    const tokensIn = session.messages.reduce((sum, m) => sum + m.tokens_in, 0);
    const tokensOut = session.messages.reduce((sum, m) => sum + m.tokens_out, 0);

    // Average assistant response length
    const totalResponseLength = assistantMessages.reduce((sum, m) => sum + m.content.length, 0);
    const averageResponseLength = assistantMessages.length > 0
      ? Math.round(totalResponseLength / assistantMessages.length)
      : 0;

    // Duration
    let durationMs: number | null = null;
    if (session.messages.length >= 2) {
      const first = new Date(session.messages[0].created_at).getTime();
      const last = new Date(session.messages[session.messages.length - 1].created_at).getTime();
      durationMs = last - first;
    }

    return {
      session: {
        id: session.id,
        title: session.title,
        model: session.model,
        mode: session.mode,
        created_at: session.created_at,
        updated_at: session.updated_at,
        metadata_json: session.metadata_json,
      },
      messageCount: session.messages.length,
      toolCallCount: toolCalls.length,
      toolCallsByTool,
      tokensIn,
      tokensOut,
      averageResponseLength,
      failedToolCalls,
      durationMs,
    };
  }

  /**
   * Format global statistics for terminal display.
   */
  formatStats(): string {
    const stats = this.getStats();
    const lines: string[] = [];

    lines.push('=== MIMO Session Statistics ===');
    lines.push('');
    lines.push(`Sessions:    ${stats.totalSessions}`);
    lines.push(`Messages:    ${stats.totalMessages}`);
    lines.push(`Tool Calls:  ${stats.totalToolCalls}`);
    lines.push(`Tokens In:   ${stats.totalTokensIn.toLocaleString()}`);
    lines.push(`Tokens Out:  ${stats.totalTokensOut.toLocaleString()}`);
    lines.push('');

    if (stats.oldestSession) {
      lines.push(`Oldest: ${new Date(stats.oldestSession).toLocaleString()}`);
    }
    if (stats.newestSession) {
      lines.push(`Newest: ${new Date(stats.newestSession).toLocaleString()}`);
    }

    if (Object.keys(stats.messagesByRole).length > 0) {
      lines.push('');
      lines.push('Messages by Role:');
      for (const [role, count] of Object.entries(stats.messagesByRole)) {
        lines.push(`  ${role}: ${count}`);
      }
    }

    if (stats.topTools.length > 0) {
      lines.push('');
      lines.push('Top Tools:');
      for (const tool of stats.topTools) {
        lines.push(`  ${tool.tool_name}: ${tool.count}`);
      }
    }

    return lines.join('\n');
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  /**
   * Close the database and release resources.
   */
  close(): void {
    this.store.close();
  }

  /**
   * Run VACUUM to reclaim database space.
   */
  vacuum(): void {
    this.store.vacuum();
  }

  /**
   * Get the underlying store for advanced operations.
   */
  getStore(): SQLiteSessionStore {
    return this.store;
  }
}
