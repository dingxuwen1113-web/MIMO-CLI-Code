// ── Session Compression Engine ───────────────────────────────────────────────
// Summarizes old conversation turns using the LLM, replaces them with a compact
// summary message, and preserves all tool call records. Integrates with the
// SQLite session store for persistent compression state.

import { SQLiteSessionStore, StoredMessage, StoredToolCall } from './sqlite-store';
import { ApiAdapter } from '../api/types';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface CompressionConfig {
  /** Number of recent messages to preserve unchanged */
  keepLast: number;
  /** Minimum number of messages before compression is triggered */
  minMessagesForCompression: number;
  /** Maximum tokens the summary should target */
  maxSummaryTokens: number;
  /** Model to use for generating summaries (defaults to a fast model) */
  summaryModel: string;
  /** Whether to include tool call details in the summary */
  includeToolCalls: boolean;
  /** Maximum characters per message content fed into summarization */
  maxContentCharsPerMessage: number;
}

export interface CompressionResult {
  /** Number of messages that were compressed */
  messagesCompressed: number;
  /** The generated summary text */
  summary: string;
  /** Messages that were removed (for audit/logging) */
  removedMessageIds: string[];
  /** Tool call count preserved */
  toolCallsPreserved: number;
  /** Whether the LLM was used or a fallback summary was generated */
  usedLLM: boolean;
}

export interface CompressionTrigger {
  /** Whether compression is needed */
  needed: boolean;
  /** Reason why compression was triggered */
  reason: string;
  /** Estimated number of messages to compress */
  estimatedCompressCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Config
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: CompressionConfig = {
  keepLast: 20,
  minMessagesForCompression: 40,
  maxSummaryTokens: 1500,
  summaryModel: 'mimo-v2.5',
  includeToolCalls: true,
  maxContentCharsPerMessage: 2000,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SessionCompressor
// ═══════════════════════════════════════════════════════════════════════════════

export class SessionCompressor {
  private store: SQLiteSessionStore;
  private apiClient: ApiAdapter;
  private config: CompressionConfig;

  constructor(
    store: SQLiteSessionStore,
    apiClient: ApiAdapter,
    config: Partial<CompressionConfig> = {},
  ) {
    this.store = store;
    this.apiClient = apiClient;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Compression Check ─────────────────────────────────────────────────

  /**
   * Check whether a session needs compression.
   */
  checkCompressionNeeded(sessionId: string): CompressionTrigger {
    const messageCount = this.store.getSessionMessageCount(sessionId);

    if (messageCount < this.config.minMessagesForCompression) {
      return {
        needed: false,
        reason: `Only ${messageCount} messages (threshold: ${this.config.minMessagesForCompression})`,
        estimatedCompressCount: 0,
      };
    }

    const compressCount = messageCount - this.config.keepLast;
    if (compressCount <= 0) {
      return {
        needed: false,
        reason: 'Already within keepLast range',
        estimatedCompressCount: 0,
      };
    }

    return {
      needed: true,
      reason: `${messageCount} messages exceeds threshold of ${this.config.minMessagesForCompression}; ${compressCount} messages eligible for compression`,
      estimatedCompressCount: compressCount,
    };
  }

  // ── Core Compression ──────────────────────────────────────────────────

  /**
   * Compress a session's old messages into a summary.
   * This is the main entry point for compression.
   */
  async compressSession(sessionId: string): Promise<CompressionResult> {
    const trigger = this.checkCompressionNeeded(sessionId);
    if (!trigger.needed) {
      return {
        messagesCompressed: 0,
        summary: '',
        removedMessageIds: [],
        toolCallsPreserved: 0,
        usedLLM: false,
      };
    }

    const allMessages = this.store.getMessages(sessionId);
    const splitIndex = allMessages.length - this.config.keepLast;

    // Messages to compress
    const oldMessages = allMessages.slice(0, splitIndex);

    // Gather tool calls for old messages
    const oldMessageIds = new Set(oldMessages.map(m => m.id));
    const allToolCalls = this.store.getToolCalls(sessionId);
    const oldToolCalls = allToolCalls.filter(tc => oldMessageIds.has(tc.message_id));

    // Build conversation context for summarization
    const conversationContext = this.buildConversationContext(oldMessages, oldToolCalls);

    // Generate summary via LLM
    let summary: string;
    let usedLLM = true;

    try {
      summary = await this.generateSummary(conversationContext);
    } catch {
      // Fallback to rule-based summary if LLM fails
      summary = this.generateFallbackSummary(oldMessages, oldToolCalls);
      usedLLM = false;
    }

    // Perform the actual compression in the store
    const removedCount = this.store.compressSession(
      sessionId,
      `[Session Compression Summary]\n\n${summary}\n\n[Compressed ${oldMessages.length} messages. ${oldToolCalls.length} tool calls preserved in records.]`,
      this.config.keepLast,
    );

    return {
      messagesCompressed: removedCount,
      summary,
      removedMessageIds: oldMessages.slice(0, removedCount).map(m => m.id),
      toolCallsPreserved: oldToolCalls.length,
      usedLLM,
    };
  }

  // ── Context Building ──────────────────────────────────────────────────

  /**
   * Build a conversation context string for the LLM summarization prompt.
   */
  private buildConversationContext(messages: StoredMessage[], toolCalls: StoredToolCall[]): string {
    const parts: string[] = [];

    // Group tool calls by message ID for easy lookup
    const toolCallsByMessage = new Map<string, StoredToolCall[]>();
    for (const tc of toolCalls) {
      const existing = toolCallsByMessage.get(tc.message_id) || [];
      existing.push(tc);
      toolCallsByMessage.set(tc.message_id, existing);
    }

    for (const msg of messages) {
      const truncated = this.truncateContent(msg.content);
      const roleLabel = this.formatRole(msg.role);

      let line = `[${roleLabel}]: ${truncated}`;

      // Attach tool call details if configured
      if (this.config.includeToolCalls) {
        const msgToolCalls = toolCallsByMessage.get(msg.id);
        if (msgToolCalls && msgToolCalls.length > 0) {
          const tcLines = msgToolCalls.map(tc => {
            const inputPreview = this.truncateContent(tc.input_json, 200);
            const outputPreview = this.truncateContent(tc.output_json, 200);
            return `  -> Tool: ${tc.tool_name}(${inputPreview}) => [${tc.status}] ${outputPreview} (${tc.duration_ms}ms)`;
          });
          line += '\n' + tcLines.join('\n');
        }
      }

      // Append token usage if available
      if (msg.tokens_in > 0 || msg.tokens_out > 0) {
        line += ` [tokens: ${msg.tokens_in}in/${msg.tokens_out}out]`;
      }

      parts.push(line);
    }

    return parts.join('\n\n');
  }

  private formatRole(role: string): string {
    switch (role) {
      case 'user': return 'User';
      case 'assistant': return 'Assistant';
      case 'system': return 'System';
      case 'summary': return 'Summary';
      default: return role;
    }
  }

  private truncateContent(content: string, maxChars?: number): string {
    const limit = maxChars || this.config.maxContentCharsPerMessage;
    if (content.length <= limit) return content;
    return content.slice(0, limit) + `... [${content.length - limit} chars omitted]`;
  }

  // ── Summary Generation ────────────────────────────────────────────────

  /**
   * Generate a summary using the LLM via the API adapter.
   */
  private async generateSummary(conversationContext: string): Promise<string> {
    const systemPrompt = `You are a precise conversation summarizer for a coding agent session.
Your goal is to produce a compact, structured summary that preserves ALL technical details.

The summary MUST include:
1. USER GOALS: What the user was trying to accomplish, current progress
2. COMPLETED ACTIONS: Key operations performed (file modifications, commands, code changes)
3. FILE CHANGES: List of files created/modified/deleted with brief descriptions
4. DECISIONS: Technical decisions made and their rationale
5. ERRORS & ISSUES: Errors encountered and how they were resolved (or not)
6. PENDING WORK: Unfinished tasks, TODOs, next steps
7. CONTEXT: Current file, function, line number being worked on

Rules:
- Preserve ALL file paths, function names, line numbers, error messages
- Preserve user preferences and constraints mentioned in conversation
- Keep it under 1000 words
- Use structured markdown
- Do NOT include conversational pleasantries
- If tool calls were made, summarize what they did and their outcomes`;

    const userPrompt = `Summarize the following old conversation turns from a coding session.
This summary will replace these messages to save context space.
The most recent messages are preserved separately.

CONVERSATION TO SUMMARIZE:
${conversationContext}`;

    const response = await this.apiClient.chat(
      [{ role: 'user', content: userPrompt }],
      [],
      systemPrompt,
      { model: this.config.summaryModel, maxTokens: this.config.maxSummaryTokens },
    );

    // Extract text from response
    for (const block of response.content) {
      if (block.type === 'text') {
        return (block as any).text;
      }
    }

    throw new Error('No text content in summary response');
  }

  /**
   * Generate a fallback summary without using the LLM.
   * Extracts structured information using heuristics.
   */
  private generateFallbackSummary(messages: StoredMessage[], toolCalls: StoredToolCall[]): string {
    const parts: string[] = [];

    // Extract user goals from the first user message
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (firstUserMsg) {
      const goalText = firstUserMsg.content.slice(0, 300).replace(/\n/g, ' ');
      parts.push(`## User Goals\n${goalText}`);
    }

    // Extract file operations from tool calls
    const fileOps: string[] = [];
    const executedCommands: string[] = [];
    for (const tc of toolCalls) {
      if (tc.tool_name === 'file_write' || tc.tool_name === 'file_edit') {
        try {
          const input = JSON.parse(tc.input_json);
          fileOps.push(`- ${tc.tool_name}: ${input.path || '(unknown)'} [${tc.status}]`);
        } catch {
          fileOps.push(`- ${tc.tool_name}: [${tc.status}]`);
        }
      } else if (tc.tool_name === 'shell_exec' || tc.tool_name === 'bash') {
        try {
          const input = JSON.parse(tc.input_json);
          const cmd = (input.command || input.cmd || '').slice(0, 100);
          executedCommands.push(`- $ ${cmd} [${tc.status}]`);
        } catch {
          executedCommands.push(`- [${tc.tool_name}] [${tc.status}]`);
        }
      }
    }

    if (fileOps.length > 0) {
      parts.push(`## File Changes\n${fileOps.join('\n')}`);
    }

    if (executedCommands.length > 0) {
      parts.push(`## Commands Executed\n${executedCommands.slice(0, 15).join('\n')}`);
    }

    // Extract errors
    const errors: string[] = [];
    for (const msg of messages) {
      if (msg.role === 'user' && msg.content.toLowerCase().includes('error')) {
        const errorSnippet = msg.content.slice(0, 200).replace(/\n/g, ' ');
        errors.push(`- ${errorSnippet}`);
      }
    }
    // Also check failed tool calls
    for (const tc of toolCalls) {
      if (tc.status === 'error' || tc.status === 'failure') {
        const outputPreview = tc.output_json.slice(0, 150).replace(/\n/g, ' ');
        errors.push(`- ${tc.tool_name} failed: ${outputPreview}`);
      }
    }

    if (errors.length > 0) {
      parts.push(`## Errors Encountered\n${errors.slice(0, 5).join('\n')}`);
    }

    // Recent assistant messages for context
    const recentAssistant = messages
      .filter(m => m.role === 'assistant')
      .slice(-3);
    if (recentAssistant.length > 0) {
      const contextText = recentAssistant
        .map(m => `- ${m.content.slice(0, 150).replace(/\n/g, ' ')}`)
        .join('\n');
      parts.push(`## Recent Context\n${contextText}`);
    }

    // Stats
    const totalTokensIn = messages.reduce((sum, m) => sum + m.tokens_in, 0);
    const totalTokensOut = messages.reduce((sum, m) => sum + m.tokens_out, 0);
    parts.push(`## Session Stats\n- Messages compressed: ${messages.length}\n- Tool calls: ${toolCalls.length}\n- Tokens used: ${totalTokensIn} in / ${totalTokensOut} out`);

    return parts.join('\n\n') || `Session with ${messages.length} messages and ${toolCalls.length} tool calls (auto-generated summary).`;
  }

  // ── Configuration ─────────────────────────────────────────────────────

  /**
   * Update compression configuration.
   */
  updateConfig(config: Partial<CompressionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): CompressionConfig {
    return { ...this.config };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Auto-Compression Helper
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convenience function: check and auto-compress a session if needed.
 * Returns the compression result, or null if no compression was triggered.
 */
export async function autoCompressIfNeeded(
  store: SQLiteSessionStore,
  apiClient: ApiAdapter,
  sessionId: string,
  config?: Partial<CompressionConfig>,
): Promise<CompressionResult | null> {
  const compressor = new SessionCompressor(store, apiClient, config);
  const trigger = compressor.checkCompressionNeeded(sessionId);

  if (!trigger.needed) return null;

  return compressor.compressSession(sessionId);
}
