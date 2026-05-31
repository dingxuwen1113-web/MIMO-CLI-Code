// ── Subagent System: Parallel, Isolated, Communicating Agents ──────────

import Anthropic from '@anthropic-ai/sdk';
import { ApiAdapter } from '../api/types';
import { ToolRegistry } from '../tools/registry';
import { Charter } from '../core/charter';
import { DynamicAgentLoader, AgentDefinition } from '../dynamic-agents/loader';

// ────────────────────────────────────────────────────────────────────────
// Agent Types: define tool access per agent type
// ────────────────────────────────────────────────────────────────────────

export type AgentType = 'explore' | 'plan' | 'general-purpose';

/** Tools allowed for read-only agent types. */
const READ_ONLY_TOOL_NAMES = new Set([
  'file_read',
  'grep_search',
  'glob_match',
  'browser_navigate',
  'browser_read',
  'browser_find',
  'browser_screenshot',
  'browser_network',
  'browser_console',
  'web_search',
  'web_fetch',
  'git_status',
  'git_diff',
  'git_log',
  'git_blame',
  'git_branch', // branch listing is read-only
  'git_stash',  // stash list/show is read-only
  'task_list',
  'task_get',
  'notebook_read',
  'image_read',
]);

function isReadOnlyMcpTool(toolName: string): boolean {
  if (!toolName.startsWith('mcp__')) return false;
  const parts = toolName.split('__');
  const realName = parts.slice(2).join('__').toLowerCase();
  const readOnlyPatterns = [
    /read/, /list/, /get/, /search/, /find/, /query/,
    /status/, /log/, /info/, /describe/, /fetch/,
    /view/, /show/, /check/, /verify/, /inspect/,
  ];
  return readOnlyPatterns.some((p) => p.test(realName));
}

/**
 * Filter tool definitions based on agent type.
 * - explore / plan: only read-only tools
 * - general-purpose: all tools
 */
function filterToolsForAgentType(
  tools: Anthropic.Tool[],
  agentType: AgentType
): Anthropic.Tool[] {
  if (agentType === 'general-purpose') return tools;
  // explore and plan are read-only
  return tools.filter((t) => READ_ONLY_TOOL_NAMES.has(t.name) || isReadOnlyMcpTool(t.name));
}

// ────────────────────────────────────────────────────────────────────────
// Budget Control
// ────────────────────────────────────────────────────────────────────────

export interface BudgetControl {
  /** Maximum total tokens allowed. */
  total: number;
  /** Tokens consumed so far. */
  spent(): number;
  /** Remaining tokens before budget is exhausted. */
  remaining(): number;
  /** Whether the budget has been exceeded. */
  isExhausted(): boolean;
}

class AgentBudget implements BudgetControl {
  total: number;
  private _spent: number = 0;

  constructor(total: number) {
    this.total = total;
  }

  spent(): number {
    return this._spent;
  }

  remaining(): number {
    return Math.max(0, this.total - this._spent);
  }

  isExhausted(): boolean {
    return this._spent >= this.total;
  }

  /** Consume tokens. Throws if budget would be exceeded. */
  consume(inputTokens: number, outputTokens: number): void {
    const needed = inputTokens + outputTokens;
    if (this._spent + needed > this.total) {
      throw new BudgetExceededError(
        `Budget exceeded: tried to consume ${needed} tokens but only ${this.remaining()} remaining (total=${this.total}, spent=${this._spent})`
      );
    }
    this._spent += needed;
  }

  reset(): void {
    this._spent = 0;
  }
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

// ────────────────────────────────────────────────────────────────────────
// Options & Result interfaces
// ────────────────────────────────────────────────────────────────────────

export interface SubagentOptions {
  label?: string;
  model?: string;
  maxTurns?: number;
  systemPrompt?: string;
  isolation?: boolean;
  agentName?: string;        // Use a named dynamic agent definition
  worktree?: boolean;        // Isolate execution in a git worktree
  agentType?: AgentType;     // 'explore' | 'plan' | 'general-purpose' (default: 'general-purpose')
  budget?: number;           // Token budget for this agent
  onText?: (text: string) => void;  // Streaming callback: fires on each text chunk
  name?: string;             // Addressable name for inter-agent messaging
  cwd?: string;              // Working directory override for the agent
}

export interface SubagentResult {
  output: string;
  turnsUsed: number;
  toolsCalled: number;
  tokensUsed: { input: number; output: number };
}

export interface SubagentMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: string;
  read: boolean;
}

// ────────────────────────────────────────────────────────────────────────
// Agent Registry: discoverable agents with capabilities
// ────────────────────────────────────────────────────────────────────────

export interface AgentRegistryEntry {
  id: string;
  name: string;
  label: string;
  agentType: AgentType;
  status: AgentStatus;
  capabilities: string[];
  model?: string;
  worktreePath?: string;
  registeredAt: string;
  lastActiveAt: string;
}

export type AgentStatus = 'initializing' | 'running' | 'idle' | 'completed' | 'failed' | 'shutdown';

const VALID_AGENT_TRANSITIONS: Record<AgentStatus, AgentStatus[]> = {
  initializing: ['running', 'failed', 'shutdown'],
  running: ['idle', 'completed', 'failed', 'shutdown'],
  idle: ['running', 'completed', 'failed', 'shutdown'],
  completed: [],
  failed: [],
  shutdown: [],
};

// ────────────────────────────────────────────────────────────────────────
// Internal Agent Handle: tracks all state for a live agent
// ────────────────────────────────────────────────────────────────────────

interface AgentHandle {
  id: string;
  name: string;
  label: string;
  agentType: AgentType;
  status: AgentStatus;
  model?: string;
  worktreePath?: string;
  budget?: AgentBudget;
  abortController: AbortController;
  conversationHistory: Anthropic.MessageParam[];
  turnsUsed: number;
  toolsCalled: number;
  totalInput: number;
  totalOutput: number;
  registeredAt: string;
  lastActiveAt: string;
  /** Pending messages to be consumed by the agent. */
  inbox: SubagentMessage[];
  /** Delivery callbacks: fires when a message arrives for this agent. */
  onMessageCallbacks: Array<(msg: SubagentMessage) => void>;
}

// ────────────────────────────────────────────────────────────────────────
// Worktree Manager (git worktree creation/cleanup)
// ────────────────────────────────────────────────────────────────────────

interface WorktreeInfo {
  path: string;
  branch: string;
}

async function createWorktree(agentId: string): Promise<WorktreeInfo | null> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const wtDir = `.claude/worktrees/${agentId}`;
    const branchName = `mimo/subagent/${agentId}`;

    try {
      await execAsync(`git worktree add -b ${branchName} "${wtDir}" HEAD`, {
        cwd: process.cwd(),
        timeout: 10000,
      });
    } catch {
      // Branch may already exist; try adding worktree on existing branch
      await execAsync(`git worktree add "${wtDir}" ${branchName}`, {
        cwd: process.cwd(),
        timeout: 10000,
      });
    }

    return { path: wtDir, branch: branchName };
  } catch {
    return null;
  }
}

async function removeWorktree(worktreePath: string): Promise<void> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    await execAsync(`git worktree remove --force "${worktreePath}"`, {
      cwd: process.cwd(),
      timeout: 10000,
    });
  } catch {
    // Swallow cleanup errors to avoid masking the real result
  }
}

// ────────────────────────────────────────────────────────────────────────
// SubagentManager
// ────────────────────────────────────────────────────────────────────────

export class SubagentManager {
  private apiClient: ApiAdapter;
  private tools: ToolRegistry;
  private charter: Charter;
  private dynamicAgents?: DynamicAgentLoader;

  /** All agents keyed by id. */
  private agents: Map<string, AgentHandle> = new Map();

  /** Index: addressable name -> agent id. */
  private nameIndex: Map<string, string> = new Map();

  /** Global message queue (persists even after agent shutdown for audit). */
  private messageLog: SubagentMessage[] = [];

  /** Global budget across all agents (optional). */
  private globalBudget?: AgentBudget;

  /** Whether the manager has been shut down. */
  private _shutdown: boolean = false;

  constructor(apiClient: ApiAdapter, tools: ToolRegistry, charter: Charter) {
    this.apiClient = apiClient;
    this.tools = tools;
    this.charter = charter;
  }

  // ── Configuration ─────────────────────────────────────────────────────

  setDynamicAgents(loader: DynamicAgentLoader): void {
    this.dynamicAgents = loader;
  }

  /**
   * Set a global token budget shared across all agents.
   * Individual agent budgets (via SubagentOptions.budget) are also enforced
   * independently on top of this.
   */
  setGlobalBudget(totalTokens: number): void {
    this.globalBudget = new AgentBudget(totalTokens);
  }

  // ── Spawning ──────────────────────────────────────────────────────────

  /**
   * Spawn a single subagent. Returns when the agent completes its task
   * (or exhausts turns / budget).
   */
  async spawn(
    prompt: string,
    options: SubagentOptions = {}
  ): Promise<SubagentResult> {
    if (this._shutdown) {
      throw new Error('SubagentManager has been shut down');
    }

    const agentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const agentName = options.name || options.label || agentId;
    const agentType: AgentType = options.agentType || 'general-purpose';
    const maxTurns = options.maxTurns ?? 15;

    // Resolve model and system prompt from dynamic agents or options
    let model = options.model;
    let systemPrompt = options.systemPrompt;
    let dynamicAgentDef: AgentDefinition | undefined;

    if (options.agentName && this.dynamicAgents) {
      dynamicAgentDef = this.dynamicAgents.getAgent(options.agentName);
      if (dynamicAgentDef) {
        if (!model) model = dynamicAgentDef.model;
        if (!systemPrompt) systemPrompt = dynamicAgentDef.systemPrompt;
      }
    }

    if (!systemPrompt) {
      systemPrompt = this.buildSubagentPrompt(prompt, agentType);
    }

    // Worktree isolation
    let worktreePath: string | undefined;
    if (options.worktree) {
      const wt = await createWorktree(agentId);
      if (wt) {
        worktreePath = wt.path;
      }
    }

    // Budget setup
    let budget: AgentBudget | undefined;
    if (options.budget) {
      budget = new AgentBudget(options.budget);
    }

    // Register agent handle
    const handle: AgentHandle = {
      id: agentId,
      name: agentName,
      label: options.label || agentName,
      agentType,
      status: 'initializing',
      model,
      worktreePath,
      budget,
      abortController: new AbortController(),
      conversationHistory: [{ role: 'user', content: prompt }],
      turnsUsed: 0,
      toolsCalled: 0,
      totalInput: 0,
      totalOutput: 0,
      registeredAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      inbox: [],
      onMessageCallbacks: [],
    };

    this.agents.set(agentId, handle);
    this.nameIndex.set(agentName, agentId);

    this.setAgentStatus(handle, 'running');

    try {
      const result = await this.executeAgentLoop(handle, maxTurns, systemPrompt, options.onText);
      this.setAgentStatus(handle, 'completed');
      return result;
    } catch (err: any) {
      this.setAgentStatus(handle, 'failed');
      if (err instanceof BudgetExceededError) {
        // Return a result with the budget message instead of crashing
        return {
          output: `Agent "${handle.name}" stopped: ${err.message}`,
          turnsUsed: handle.turnsUsed,
          toolsCalled: handle.toolsCalled,
          tokensUsed: { input: handle.totalInput, output: handle.totalOutput },
        };
      }
      throw err;
    } finally {
      handle.lastActiveAt = new Date().toISOString();
      // Auto-cleanup worktree after a delay
      if (worktreePath) {
        setTimeout(() => {
          removeWorktree(worktreePath!).catch(() => {});
        }, 30000);
      }
    }
  }

  /**
   * Spawn multiple agents in parallel. All agents run concurrently via
   * Promise.allSettled so one failure does not cancel the rest.
   *
   * Returns an array of SubagentResult in the same order as the prompts.
   * If an agent fails, the result output will contain the error message.
   */
  async spawnParallel(
    prompts: Array<{ prompt: string; options?: SubagentOptions }>,
    sharedOptions?: Partial<SubagentOptions>
  ): Promise<SubagentResult[]> {
    if (this._shutdown) {
      throw new Error('SubagentManager has been shut down');
    }

    const settled = await Promise.allSettled(
      prompts.map(({ prompt, options }) =>
        this.spawn(prompt, { ...sharedOptions, ...options })
      )
    );

    return settled.map((result, i) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        output: `Agent failed: ${result.reason?.message || String(result.reason)}`,
        turnsUsed: 0,
        toolsCalled: 0,
        tokensUsed: { input: 0, output: 0 },
      };
    });
  }

  // ── Agent Execution Loop ──────────────────────────────────────────────

  private async executeAgentLoop(
    handle: AgentHandle,
    maxTurns: number,
    systemPrompt: string,
    onText?: (text: string) => void
  ): Promise<SubagentResult> {
    const agentType = handle.agentType;

    // Get tool definitions filtered by agent type
    const allToolDefs = this.tools.getDefinitions();
    const agentToolDefs = filterToolsForAgentType(allToolDefs, agentType);

    while (handle.turnsUsed < maxTurns) {
      // Check abort
      if (handle.abortController.signal.aborted) {
        break;
      }

      // Check budget before API call
      if (handle.budget?.isExhausted()) {
        throw new BudgetExceededError(
          `Agent "${handle.name}" exhausted its token budget (${handle.budget.total})`
        );
      }
      if (this.globalBudget?.isExhausted()) {
        throw new BudgetExceededError(
          `Global token budget exhausted (${this.globalBudget.total})`
        );
      }

      // Check for pending messages and inject them as context
      this.injectPendingMessages(handle);

      // Call the API
      let response: Anthropic.Message;
      if (onText) {
        // Use streaming for real-time text output
        response = await this.apiClient.chatStream(
          handle.conversationHistory,
          agentToolDefs,
          systemPrompt,
          {
            onText: (text: string) => {
              handle.lastActiveAt = new Date().toISOString();
              onText(text);
            },
          },
          { model: handle.model, maxTokens: 8192 }
        );
      } else {
        response = await this.apiClient.chat(
          handle.conversationHistory,
          agentToolDefs,
          systemPrompt,
          { model: handle.model, maxTokens: 8192 }
        );
      }

      // Track usage
      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;
      handle.totalInput += inputTokens;
      handle.totalOutput += outputTokens;
      handle.lastActiveAt = new Date().toISOString();

      // Check budget consumption
      if (handle.budget) {
        handle.budget.consume(inputTokens, outputTokens);
      }
      if (this.globalBudget) {
        this.globalBudget.consume(inputTokens, outputTokens);
      }

      // Append assistant response to history
      handle.conversationHistory.push({ role: 'assistant', content: response.content });

      // Check for tool use blocks
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0) {
        // No tool use: agent is done. Extract final text.
        const textBlocks = response.content.filter((b) => b.type === 'text');
        const finalText = textBlocks
          .map((b) => (b.type === 'text' ? b.text : ''))
          .join('\n');

        // Fire onText one last time for the final output
        if (onText && finalText) {
          onText(finalText);
        }

        return {
          output: finalText,
          turnsUsed: handle.turnsUsed,
          toolsCalled: handle.toolsCalled,
          tokensUsed: { input: handle.totalInput, output: handle.totalOutput },
        };
      }

      // Execute tool calls (sequentially within a turn, matching Claude CLI behavior)
      const toolResults: Anthropic.ContentBlockParam[] = [];
      for (const toolCall of toolUseBlocks) {
        if (handle.abortController.signal.aborted) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: 'Agent was aborted',
            is_error: true,
          });
          continue;
        }

        try {
          const result = await this.tools.execute(
            toolCall.name,
            toolCall.input as Record<string, any>
          );
          handle.toolsCalled++;
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: result.output,
            is_error: result.isError,
          });
        } catch (err: any) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: `Tool execution error: ${err.message}`,
            is_error: true,
          });
        }
      }

      handle.conversationHistory.push({ role: 'user', content: toolResults });
      handle.turnsUsed++;
    }

    // If we exited the loop due to max turns or abort, extract whatever text we have
    const lastAssistant = [...handle.conversationHistory]
      .reverse()
      .find((m) => m.role === 'assistant');
    let finalText = '';
    if (lastAssistant && Array.isArray(lastAssistant.content)) {
      const textBlock = lastAssistant.content.find((b) => b.type === 'text');
      if (textBlock && textBlock.type === 'text') {
        finalText = textBlock.text;
      }
    } else if (lastAssistant && typeof lastAssistant.content === 'string') {
      finalText = lastAssistant.content;
    }

    return {
      output: finalText,
      turnsUsed: handle.turnsUsed,
      toolsCalled: handle.toolsCalled,
      tokensUsed: { input: handle.totalInput, output: handle.totalOutput },
    };
  }

  // ── Inter-Agent Messaging ─────────────────────────────────────────────

  /**
   * Send a message from one agent to another by addressable name.
   * The message is queued in the recipient's inbox and persisted in the log.
   * If the recipient has registered a delivery callback, it fires immediately.
   */
  sendMessage(from: string, to: string, content: string): void {
    const msg: SubagentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from,
      to,
      content,
      timestamp: new Date().toISOString(),
      read: false,
    };

    this.messageLog.push(msg);

    // Deliver to recipient's inbox if the agent is registered
    const recipientId = this.nameIndex.get(to);
    if (recipientId) {
      const handle = this.agents.get(recipientId);
      if (handle) {
        handle.inbox.push(msg);
        // Fire delivery callbacks
        for (const cb of handle.onMessageCallbacks) {
          try {
            cb(msg);
          } catch {
            // Swallow callback errors
          }
        }
      }
    }
  }

  /**
   * Receive (and mark as read) all unread messages for a named agent.
   * Messages are consumed: once returned here they will not appear again.
   */
  receiveMessages(agentName: string): SubagentMessage[] {
    const agentId = this.nameIndex.get(agentName);
    if (!agentId) return [];

    const handle = this.agents.get(agentId);
    if (!handle) return [];

    const unread = handle.inbox.filter((m) => !m.read);
    for (const msg of unread) {
      msg.read = true;
    }
    return unread;
  }

  /**
   * Register a callback that fires whenever a message is delivered to the
   * named agent. Useful for real-time event-driven agent communication.
   */
  onMessage(agentName: string, callback: (msg: SubagentMessage) => void): void {
    const agentId = this.nameIndex.get(agentName);
    if (agentId) {
      const handle = this.agents.get(agentId);
      if (handle) {
        handle.onMessageCallbacks.push(callback);
      }
    }
  }

  /**
   * Get all messages from the global log, optionally filtered.
   */
  getMessageLog(filter?: { from?: string; to?: string; limit?: number }): SubagentMessage[] {
    let msgs = [...this.messageLog];
    if (filter?.from) msgs = msgs.filter((m) => m.from === filter.from);
    if (filter?.to) msgs = msgs.filter((m) => m.to === filter.to);
    if (filter?.limit) msgs = msgs.slice(-filter.limit);
    return msgs;
  }

  /** Backward-compatible: get messages for a named agent from its inbox. */
  getMessages(agentName: string): SubagentMessage[] {
    const agentId = this.nameIndex.get(agentName);
    if (!agentId) return [];
    const handle = this.agents.get(agentId);
    if (!handle) return [];
    return [...handle.inbox];
  }

  /** Backward-compatible: clear messages for a named agent. */
  clearMessages(agentName: string): void {
    const agentId = this.nameIndex.get(agentName);
    if (!agentId) return;
    const handle = this.agents.get(agentId);
    if (handle) {
      handle.inbox = [];
    }
  }

  // ── Agent Registry & Discovery ────────────────────────────────────────

  /**
   * Get all currently registered agents with their capabilities.
   * Agents are discoverable by other agents through this registry.
   */
  getAgentRegistry(): AgentRegistryEntry[] {
    return Array.from(this.agents.values()).map((h) => ({
      id: h.id,
      name: h.name,
      label: h.label,
      agentType: h.agentType,
      status: h.status,
      capabilities: this.getCapabilitiesForType(h.agentType),
      model: h.model,
      worktreePath: h.worktreePath,
      registeredAt: h.registeredAt,
      lastActiveAt: h.lastActiveAt,
    }));
  }

  /**
   * Find agents by capability string (e.g., 'read-files', 'write-code', 'web-search').
   */
  findAgentsByCapability(capability: string): AgentRegistryEntry[] {
    return this.getAgentRegistry().filter((entry) =>
      entry.capabilities.includes(capability)
    );
  }

  /**
   * Find agent by addressable name.
   */
  findAgentByName(name: string): AgentRegistryEntry | undefined {
    const id = this.nameIndex.get(name);
    if (!id) return undefined;
    const handle = this.agents.get(id);
    if (!handle) return undefined;
    return this.getAgentRegistry().find((e) => e.id === id);
  }

  // ── Lifecycle Management ──────────────────────────────────────────────

  /**
   * Get all active (non-completed, non-failed, non-shutdown) agents.
   * Backward-compatible with the original getActiveAgents() interface.
   */
  getActiveAgents(): Array<{ id: string; status: string; label: string; worktreePath?: string }> {
    return Array.from(this.agents.values())
      .filter((h) => h.status === 'running' || h.status === 'initializing' || h.status === 'idle')
      .map((h) => ({
        id: h.id,
        status: h.status,
        label: h.label,
        worktreePath: h.worktreePath,
      }));
  }

  /**
   * Get the status of a specific agent by id.
   */
  getAgentStatus(agentId: string): AgentStatus | undefined {
    return this.agents.get(agentId)?.status;
  }

  /** Backward-compatible: count of active agents. */
  getAgentCount(): number {
    return this.getActiveAgents().length;
  }

  /**
   * Gracefully shut down a single agent. Aborts any in-flight API call.
   * Cleans up worktree if present.
   */
  async shutdown(agentId: string): Promise<void> {
    const handle = this.agents.get(agentId);
    if (!handle) return;

    this.setAgentStatus(handle, 'shutdown');
    handle.abortController.abort();

    // Clean up worktree
    if (handle.worktreePath) {
      await removeWorktree(handle.worktreePath);
      handle.worktreePath = undefined;
    }

    // Remove from name index
    this.nameIndex.delete(handle.name);
  }

  /**
   * Shut down ALL agents and clean up resources.
   */
  async shutdownAll(): Promise<void> {
    this._shutdown = true;

    const shutdownPromises: Promise<void>[] = [];
    const allHandles = Array.from(this.agents.values());
    for (const handle of allHandles) {
      this.setAgentStatus(handle, 'shutdown');
      handle.abortController.abort();

      if (handle.worktreePath) {
        shutdownPromises.push(removeWorktree(handle.worktreePath));
      }
    }

    await Promise.allSettled(shutdownPromises);

    this.agents.clear();
    this.nameIndex.clear();
  }

  // ── Budget Info ───────────────────────────────────────────────────────

  /**
   * Get budget information for the global budget and/or a specific agent.
   */
  getBudgetInfo(agentName?: string): {
    global: { total: number; spent: number; remaining: number } | null;
    agent: { total: number; spent: number; remaining: number } | null;
  } {
    const globalInfo = this.globalBudget
      ? {
          total: this.globalBudget.total,
          spent: this.globalBudget.spent(),
          remaining: this.globalBudget.remaining(),
        }
      : null;

    let agentInfo: { total: number; spent: number; remaining: number } | null = null;
    if (agentName) {
      const id = this.nameIndex.get(agentName);
      if (id) {
        const handle = this.agents.get(id);
        if (handle?.budget) {
          agentInfo = {
            total: handle.budget.total,
            spent: handle.budget.spent(),
            remaining: handle.budget.remaining(),
          };
        }
      }
    }

    return { global: globalInfo, agent: agentInfo };
  }

  /**
   * Get aggregate token usage across all agents (active and completed).
   */
  getTotalUsage(): { input: number; output: number; total: number } {
    let totalInput = 0;
    let totalOutput = 0;
    const allHandles = Array.from(this.agents.values());
    for (const handle of allHandles) {
      totalInput += handle.totalInput;
      totalOutput += handle.totalOutput;
    }
    return { input: totalInput, output: totalOutput, total: totalInput + totalOutput };
  }

  // ── Private Helpers ───────────────────────────────────────────────────

  /**
   * Inject unread messages into the agent's conversation as a synthetic
   * user message, so the agent can see and react to inter-agent messages
   * during its next API call.
   */
  private injectPendingMessages(handle: AgentHandle): void {
    const unread = handle.inbox.filter((m) => !m.read);
    if (unread.length === 0) return;

    const messageText = unread
      .map((m) => {
        m.read = true;
        return `[Message from ${m.from} at ${m.timestamp}]: ${m.content}`;
      })
      .join('\n\n');

    handle.conversationHistory.push({
      role: 'user',
      content: `[Inter-agent messages received]\n\n${messageText}`,
    });
  }

  /**
   * Build the system prompt for a subagent based on its type.
   */
  private buildSubagentPrompt(task: string, agentType: AgentType): string {
    const baseCharter = this.charter.getContent();

    let typeInstructions: string;
    switch (agentType) {
      case 'explore':
        typeInstructions = `You are a READ-ONLY exploration agent. You can only read files, search code, browse the web, and inspect git history. You MUST NOT write files, edit code, execute shell commands, or modify anything. Your job is to gather information and report findings.`;
        break;
      case 'plan':
        typeInstructions = `You are a READ-ONLY planning agent. You can only read files, search code, and inspect the codebase. You MUST NOT write files, edit code, execute shell commands, or modify anything. Your job is to analyze and produce a detailed plan.`;
        break;
      case 'general-purpose':
      default:
        typeInstructions = `You are a general-purpose subagent with full tool access. You can read, write, edit files, execute commands, and use all available tools.`;
        break;
    }

    return `${baseCharter}

# Subagent Task

${typeInstructions}

## Your Assignment
${task}

## Rules
- Execute only the task assigned to you
- Use tools to complete the task
- Output a concise plain-text result (this is returned to the orchestrator, not shown to the user)
- If you receive inter-agent messages, incorporate their information into your work
- Stay focused: do not expand scope beyond the assigned task
- If you encounter errors, report them clearly rather than silently failing`;
  }

  /**
   * Map agent type to a list of capability strings for the registry.
   */
  private getCapabilitiesForType(agentType: AgentType): string[] {
    switch (agentType) {
      case 'explore':
        return [
          'read-files',
          'search-code',
          'glob-match',
          'git-read',
          'web-search',
          'web-fetch',
          'browser-read',
        ];
      case 'plan':
        return [
          'read-files',
          'search-code',
          'glob-match',
          'git-read',
          'web-search',
          'web-fetch',
        ];
      case 'general-purpose':
      default:
        return [
          'read-files',
          'write-files',
          'edit-files',
          'shell-exec',
          'search-code',
          'glob-match',
          'git-read',
          'git-write',
          'web-search',
          'web-fetch',
          'browser-full',
          'task-management',
        ];
    }
  }

  /**
   * Set agent status with transition validation.
   */
  private setAgentStatus(handle: AgentHandle, newStatus: AgentStatus): void {
    const allowed = VALID_AGENT_TRANSITIONS[handle.status] || [];
    if (!allowed.includes(newStatus)) {
      // Log warning but allow the transition — don't crash on status issues
      console.error(
        `Warning: Invalid agent status transition: ${handle.status} -> ${newStatus} (agent="${handle.name}")`
      );
    }
    handle.status = newStatus;
    handle.lastActiveAt = new Date().toISOString();
  }
}
