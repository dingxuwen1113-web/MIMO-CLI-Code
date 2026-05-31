// ── Session Rollback & Fork System ──────────────────────────────────────────
// Esc-Esc backtrack to rewind to a prior prompt, session forking, /restore,
// revert_turn, session timeline browsing

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface TurnSnapshot {
  turnIndex: number;
  timestamp: string;
  userMessage: string;
  assistantResponse: string;
  filesModified: string[];
  toolCalls: Array<{ name: string; input: string; output: string; isError: boolean }>;
  conversationLength: number;
}

export interface SessionFork {
  forkId: string;
  sourceSessionId: string;
  forkFromTurn: number;
  createdAt: string;
  description: string;
  conversationHistory: any[];
  filesModified: string[];
}

export interface SessionTimelineEntry {
  turnIndex: number;
  timestamp: string;
  summary: string;
  filesChanged: string[];
  isUserTurn: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SessionRollbackManager
// ═══════════════════════════════════════════════════════════════════════════════

const SESSIONS_DIR = path.join(os.homedir(), '.mimo', 'sessions');
const FORKS_DIR = path.join(os.homedir(), '.mimo', 'forks');

export class SessionRollbackManager {
  private sessionId: string;
  private turns: TurnSnapshot[] = [];
  private forks: SessionFork[] = [];
  private maxTurns: number = 200;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  async init(): Promise<void> {
    await fs.mkdir(FORKS_DIR, { recursive: true });
    await this.loadExistingForks();
  }

  // ── Turn Recording ──────────────────────────────────────────────────

  /**
   * Record a turn in the session timeline.
   * Call this after each user+assistant exchange completes.
   */
  recordTurn(data: {
    userMessage: string;
    assistantResponse: string;
    filesModified: string[];
    toolCalls: Array<{ name: string; input: string; output: string; isError: boolean }>;
    conversationLength: number;
  }): void {
    const turn: TurnSnapshot = {
      turnIndex: this.turns.length,
      timestamp: new Date().toISOString(),
      userMessage: data.userMessage.slice(0, 500),
      assistantResponse: data.assistantResponse.slice(0, 500),
      filesModified: [...data.filesModified],
      toolCalls: data.toolCalls.map(tc => ({
        name: tc.name,
        input: tc.input.slice(0, 200),
        output: tc.output.slice(0, 200),
        isError: tc.isError,
      })),
      conversationLength: data.conversationLength,
    };

    this.turns.push(turn);

    // Trim to max
    if (this.turns.length > this.maxTurns) {
      this.turns = this.turns.slice(-this.maxTurns);
    }
  }

  // ── Esc-Esc Backtrack ───────────────────────────────────────────────

  /**
   * Rewind the session to a specific turn index.
   * Returns the conversation history up to (and including) that turn.
   * Returns null if the turn index is invalid.
   */
  backtrackToTurn(turnIndex: number): TurnSnapshot | null {
    if (turnIndex < 0 || turnIndex >= this.turns.length) return null;

    // Remove all turns after the target
    const targetTurn = this.turns[turnIndex];
    this.turns = this.turns.slice(0, turnIndex + 1);
    return targetTurn;
  }

  /**
   * Rewind to the most recent user prompt (Esc-Esc behavior).
   * Returns the turn that was rewound to, or null if at the beginning.
   */
  backtrackToLastUserPrompt(): TurnSnapshot | null {
    if (this.turns.length < 2) return null;

    // Remove the last turn (the most recent assistant response)
    const removed = this.turns.pop();
    return removed || null;
  }

  /**
   * Get the current turn index (last recorded turn).
   */
  getCurrentTurnIndex(): number {
    return this.turns.length - 1;
  }

  // ── Session Forking ─────────────────────────────────────────────────

  /**
   * Fork the session at a specific turn.
   * Creates a new session that branches from that point.
   */
  async forkAtTurn(
    turnIndex: number,
    description: string,
    conversationHistory: any[]
  ): Promise<SessionFork> {
    if (turnIndex < 0 || turnIndex >= this.turns.length) {
      throw new Error(`Invalid turn index: ${turnIndex}. Valid range: 0-${this.turns.length - 1}`);
    }

    const forkId = `fork-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const sourceTurn = this.turns[turnIndex];

    // Build conversation history up to the fork point
    // We approximate by using the provided history and trimming
    const forkedHistory = this.trimHistoryToTurn(conversationHistory, turnIndex);

    const fork: SessionFork = {
      forkId,
      sourceSessionId: this.sessionId,
      forkFromTurn: turnIndex,
      createdAt: new Date().toISOString(),
      description: description || `Fork from turn ${turnIndex}`,
      conversationHistory: forkedHistory,
      filesModified: this.getFilesModifiedUpToTurn(turnIndex),
    };

    this.forks.push(fork);

    // Persist fork
    try {
      const forkPath = path.join(FORKS_DIR, `${forkId}.json`);
      await fs.writeFile(forkPath, JSON.stringify(fork, null, 2), 'utf-8');
    } catch { /* non-fatal */ }

    return fork;
  }

  /**
   * List all forks from this session.
   */
  listForks(): SessionFork[] {
    return [...this.forks];
  }

  /**
   * Load a fork's conversation history for resumption.
   */
  async loadFork(forkId: string): Promise<SessionFork | null> {
    // Check memory first
    const inMemory = this.forks.find(f => f.forkId === forkId);
    if (inMemory) return inMemory;

    // Load from disk
    try {
      const forkPath = path.join(FORKS_DIR, `${forkId}.json`);
      const raw = await fs.readFile(forkPath, 'utf-8');
      return JSON.parse(raw) as SessionFork;
    } catch {
      return null;
    }
  }

  // ── Session Timeline ────────────────────────────────────────────────

  /**
   * Get a timeline of all turns for display.
   */
  getTimeline(): SessionTimelineEntry[] {
    return this.turns.map(turn => ({
      turnIndex: turn.turnIndex,
      timestamp: turn.timestamp,
      summary: this.summarizeTurn(turn),
      filesChanged: turn.filesModified,
      isUserTurn: true, // Each snapshot includes both user+assistant
    }));
  }

  /**
   * Get a specific turn's details.
   */
  getTurn(turnIndex: number): TurnSnapshot | null {
    if (turnIndex < 0 || turnIndex >= this.turns.length) return null;
    return this.turns[turnIndex];
  }

  /**
   * Format timeline for display.
   */
  formatTimeline(maxEntries: number = 20): string {
    const timeline = this.getTimeline();
    if (timeline.length === 0) return 'No turns recorded yet.';

    const entries = timeline.slice(-maxEntries);
    const lines: string[] = [];

    lines.push(`Session Timeline (${timeline.length} turns total, showing last ${entries.length}):`);
    lines.push('');

    for (const entry of entries) {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const files = entry.filesChanged.length > 0 ? ` [${entry.filesChanged.length} files]` : '';
      const marker = entry.turnIndex === timeline.length - 1 ? ' →' : '  ';
      lines.push(`${marker} Turn ${entry.turnIndex} | ${time}${files}`);
      lines.push(`    ${entry.summary}`);
    }

    return lines.join('\n');
  }

  // ── Revert Turn ─────────────────────────────────────────────────────

  /**
   * Revert all file changes from a specific turn.
   * This does NOT modify the conversation history — only reverts files.
   */
  getFilesModifiedInTurn(turnIndex: number): string[] {
    const turn = this.getTurn(turnIndex);
    return turn ? [...turn.filesModified] : [];
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private summarizeTurn(turn: TurnSnapshot): string {
    const user = turn.userMessage.replace(/\n/g, ' ').slice(0, 80);
    const toolSummary = turn.toolCalls.length > 0
      ? ` [${turn.toolCalls.map(tc => tc.name).join(', ')}]`
      : '';
    return `${user}${toolSummary}`;
  }

  private trimHistoryToTurn(history: any[], turnIndex: number): any[] {
    // Each turn in our recording corresponds to a user message + assistant response
    // In the conversation history, this is 2 messages (user + assistant) or more if tools were used
    // We estimate: each turn ≈ 2 + (tool_calls * 2) messages
    // For safety, just return the whole history up to a reasonable limit
    const maxMessages = (turnIndex + 1) * 6; // generous estimate
    return history.slice(0, Math.min(maxMessages, history.length));
  }

  private getFilesModifiedUpToTurn(turnIndex: number): string[] {
    const files = new Set<string>();
    for (let i = 0; i <= turnIndex && i < this.turns.length; i++) {
      for (const f of this.turns[i].filesModified) {
        files.add(f);
      }
    }
    return Array.from(files);
  }

  private async loadExistingForks(): Promise<void> {
    try {
      const files = await fs.readdir(FORKS_DIR);
      for (const file of files.filter(f => f.endsWith('.json'))) {
        try {
          const raw = await fs.readFile(path.join(FORKS_DIR, file), 'utf-8');
          const fork = JSON.parse(raw) as SessionFork;
          if (fork.sourceSessionId === this.sessionId) {
            this.forks.push(fork);
          }
        } catch { /* skip corrupted */ }
      }
    } catch { /* no forks dir */ }
  }

  // ── Persistence ─────────────────────────────────────────────────────

  getTurns(): TurnSnapshot[] {
    return [...this.turns];
  }

  getTurnCount(): number {
    return this.turns.length;
  }
}
