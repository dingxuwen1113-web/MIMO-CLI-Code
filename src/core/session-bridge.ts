import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import createDebug from 'debug';
import { AgentState, SessionData, ConversationMessage } from './types';
import { printInfo, printSuccess, printWarning } from '../tui/output';

const debug = createDebug('mimo:session');
const SESSIONS_DIR = path.join(os.homedir(), '.mimo', 'sessions');

/**
 * Manages session persistence, recovery, and lifecycle.
 * Extracted from agent.ts to reduce its size.
 */
export class SessionBridge {
  private state: AgentState;

  constructor(state: AgentState) {
    this.state = state;
  }

  /**
   * Initialize the sessions directory.
   */
  async init(): Promise<void> {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
    debug('Sessions directory: %s', SESSIONS_DIR);
  }

  /**
   * Save current session to disk.
   */
  async save(): Promise<void> {
    try {
      const sessionData: SessionData = {
        id: this.state.sessionId,
        startedAt: this.state.sessionStartTime,
        projectDir: process.cwd(),
        conversationHistory: this.state.conversationHistory,
        turnCount: this.state.turnCount,
        modifiedFiles: Array.from(this.state.modifiedFiles),
      };
      await fs.writeFile(
        this.state.sessionFile,
        JSON.stringify(sessionData, null, 2),
        'utf-8',
      );
      debug('Session saved: %s', this.state.sessionId);
    } catch (err: any) {
      debug('Session save failed: %s', err.message);
    }
  }

  /**
   * Check for a recoverable session.
   */
  async checkRecovery(): Promise<void> {
    try {
      const files = await fs.readdir(SESSIONS_DIR);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort();

      if (jsonFiles.length === 0) return;

      const latestFile = jsonFiles[jsonFiles.length - 1];
      const raw = await fs.readFile(path.join(SESSIONS_DIR, latestFile), 'utf-8');
      const session = JSON.parse(raw) as SessionData;

      const sessionAge = Date.now() - new Date(session.startedAt).getTime();
      if (sessionAge > 24 * 60 * 60 * 1000) return;
      if (session.projectDir !== process.cwd()) return;
      if (session.conversationHistory.length === 0) return;

      printInfo(`发现最近会话 (${session.turnCount} 轮, ${Math.round(sessionAge / 60000)} 分钟前)`);
      printInfo('输入 /resume 恢复，或继续新对话');
      this.state._recoverableSession = session;
    } catch {
      // No recoverable session
    }
  }

  /**
   * Resume a previously saved session.
   */
  async resume(): Promise<void> {
    if (!this.state._recoverableSession) {
      printWarning('没有可恢复的会话');
      return;
    }

    const session = this.state._recoverableSession;
    this.state.conversationHistory = session.conversationHistory;
    this.state.turnCount = session.turnCount;
    this.state.modifiedFiles = new Set(session.modifiedFiles);
    this.state.sessionId = session.id;

    printSuccess(`已恢复会话 ${session.id} (${session.turnCount} 轮, ${session.modifiedFiles.length} 个文件被修改)`);

    const lastFew = this.state.conversationHistory.slice(-4);
    for (const msg of lastFew) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      const preview = content.slice(0, 200);
      printInfo(`[${msg.role}] ${preview}${content.length > 200 ? '...' : ''}`);
    }
  }

  /**
   * List recent sessions.
   */
  async list(): Promise<SessionData[]> {
    try {
      const files = await fs.readdir(SESSIONS_DIR);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse().slice(0, 10);
      const sessions: SessionData[] = [];

      for (const file of jsonFiles) {
        try {
          const raw = await fs.readFile(path.join(SESSIONS_DIR, file), 'utf-8');
          sessions.push(JSON.parse(raw) as SessionData);
        } catch { /* skip corrupt files */ }
      }

      return sessions;
    } catch {
      return [];
    }
  }

  /**
   * Handle session end - save state, flush logs, show stats.
   */
  async onEnd(): Promise<void> {
    try { await this.save(); } catch {}
    try { await this.state.auditLogger.close(); } catch {}
    try { await this.state.diagnosticsManager.stopAll(); } catch {}
    try { await this.state.rlmManager.closeAll(); } catch {}

    if (this.state.turnCount > 0) {
      // Save session summary
      try {
        const projectSlug = process.cwd().split(/[/\\]/).pop();
        await this.state.memory.saveSessionSummary(this.state.sessionId, {
          projectSlug,
          startedAt: this.state.sessionStartTime,
          turnCount: this.state.turnCount,
          filesModified: Array.from(this.state.modifiedFiles),
          decisions: [],
          unresolved: [],
        });
      } catch {}

      // Show usage stats
      try {
        const stats = this.state.apiClient.getUsageStats();
        const budget = this.state.apiClient.getBudgetInfo();
        debug('Session stats: %O', { stats, budget });
      } catch {}
    }
  }
}
