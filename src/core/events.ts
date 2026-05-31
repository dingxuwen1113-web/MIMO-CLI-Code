import { EventEmitter } from 'events';
import createDebug from 'debug';

const debug = createDebug('mimo:events');

// ─── Event Types ───────────────────────────────────────────────────

export type AgentEvent =
  | 'agent_start'
  | 'agent_end'
  | 'message_start'
  | 'message_update'
  | 'message_end'
  | 'tool_execution_start'
  | 'tool_execution_end'
  | 'turn_start'
  | 'turn_end'
  | 'thinking_start'
  | 'thinking_update'
  | 'thinking_end'
  | 'error'
  | 'compression'
  | 'memory_extracted'
  | 'permission_request'
  | 'permission_resolved'
  | 'model_switch'
  | 'subagent_spawn'
  | 'subagent_complete'
  | 'session_saved'
  | 'session_restored';

export interface AgentStartData { sessionId: string; model: string; mode: string; }
export interface AgentEndData { sessionId: string; turnCount: number; durationMs: number; }
export interface MessageStartData { role: 'user' | 'assistant'; contentLength: number; }
export interface MessageUpdateData { delta: string; fullText: string; }
export interface MessageEndData { content: string; toolCalls: number; }
export interface ToolExecutionStartData { toolName: string; toolInput: Record<string, any>; }
export interface ToolExecutionEndData { toolName: string; success: boolean; durationMs: number; output?: string; }
export interface TurnStartData { turnNumber: number; }
export interface TurnEndData { turnNumber: number; tokensUsed: number; }
export interface ThinkingStartData { }
export interface ThinkingUpdateData { delta: string; }
export interface ThinkingEndData { fullThinking: string; }
export interface ErrorData { error: Error; context?: string; recoverable: boolean; }
export interface CompressionData { originalCount: number; compressedCount: number; savedTokens: number; }
export interface MemoryExtractedData { count: number; types: string[]; }
export interface PermissionRequestData { toolName: string; toolInput: Record<string, any>; mode: string; }
export interface PermissionResolvedData { toolName: string; decision: 'allow' | 'deny' | 'skip'; reason?: string; }
export interface ModelSwitchData { from: string; to: string; reason: string; }
export interface SubagentSpawnData { agentId: string; agentType: string; prompt: string; }
export interface SubagentCompleteData { agentId: string; success: boolean; turnsUsed: number; }
export interface SessionSavedData { sessionId: string; turnCount: number; }

// ─── Event Data Map ────────────────────────────────────────────────

export interface AgentEventDataMap {
  agent_start: AgentStartData;
  agent_end: AgentEndData;
  message_start: MessageStartData;
  message_update: MessageUpdateData;
  message_end: MessageEndData;
  tool_execution_start: ToolExecutionStartData;
  tool_execution_end: ToolExecutionEndData;
  turn_start: TurnStartData;
  turn_end: TurnEndData;
  thinking_start: ThinkingStartData;
  thinking_update: ThinkingUpdateData;
  thinking_end: ThinkingEndData;
  error: ErrorData;
  compression: CompressionData;
  memory_extracted: MemoryExtractedData;
  permission_request: PermissionRequestData;
  permission_resolved: PermissionResolvedData;
  model_switch: ModelSwitchData;
  subagent_spawn: SubagentSpawnData;
  subagent_complete: SubagentCompleteData;
  session_saved: SessionSavedData;
  session_restored: SessionSavedData;
}

// ─── Typed EventBus ────────────────────────────────────────────────

export class AgentEventBus extends EventEmitter {
  private handlerCounts: Map<string, number> = new Map();
  private eventHistory: Array<{ event: AgentEvent; data: any; timestamp: number }> = [];
  private maxHistorySize = 500;

  emit<T extends AgentEvent>(event: T, data: AgentEventDataMap[T]): boolean {
    debug('Event: %s %O', event, data);

    this.eventHistory.push({ event, data, timestamp: Date.now() });
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    return super.emit(event, data);
  }

  on<T extends AgentEvent>(event: T, handler: (data: AgentEventDataMap[T]) => void): this {
    this.handlerCounts.set(event, (this.handlerCounts.get(event) || 0) + 1);
    return super.on(event, handler);
  }

  off<T extends AgentEvent>(event: T, handler: (data: AgentEventDataMap[T]) => void): this {
    const count = this.handlerCounts.get(event) || 0;
    if (count > 0) this.handlerCounts.set(event, count - 1);
    return super.off(event, handler);
  }

  once<T extends AgentEvent>(event: T, handler: (data: AgentEventDataMap[T]) => void): this {
    return super.once(event, handler);
  }

  getEventHistory(limit = 50): Array<{ event: AgentEvent; data: any; timestamp: number }> {
    return this.eventHistory.slice(-limit);
  }

  getHandlerCounts(): Record<string, number> {
    return Object.fromEntries(this.handlerCounts);
  }

  clearHistory(): void {
    this.eventHistory = [];
  }
}

// ─── Lifecycle Hooks ───────────────────────────────────────────────

export interface LifecycleHooks {
  beforeAgentStart?(ctx: { sessionId: string; model: string }): Promise<void>;
  afterAgentEnd?(ctx: { sessionId: string; turnCount: number }): Promise<void>;
  beforeToolCall?(tool: string, input: any): Promise<{ allowed: boolean; modifiedInput?: any } | void>;
  afterToolCall?(tool: string, input: any, output: any, success: boolean): Promise<void>;
  beforeTurn?(turnNumber: number): Promise<void>;
  afterTurn?(turnNumber: number, tokensUsed: number): Promise<void>;
  prepareNextTurn?(): Promise<void>;
  onMessage?(role: string, content: string): Promise<void>;
  onError?(error: Error): Promise<boolean | void>;  // return true to suppress
  onCompaction?(originalCount: number, compressedCount: number): Promise<void>;
}

export class LifecycleHookManager {
  private hooks: LifecycleHooks[] = [];

  register(hooks: LifecycleHooks): void {
    this.hooks.push(hooks);
  }

  unregister(hooks: LifecycleHooks): void {
    const idx = this.hooks.indexOf(hooks);
    if (idx >= 0) this.hooks.splice(idx, 1);
  }

  async runBeforeAgentStart(ctx: { sessionId: string; model: string }): Promise<void> {
    for (const h of this.hooks) {
      if (h.beforeAgentStart) await h.beforeAgentStart(ctx);
    }
  }

  async runAfterAgentEnd(ctx: { sessionId: string; turnCount: number }): Promise<void> {
    for (const h of this.hooks) {
      if (h.afterAgentEnd) await h.afterAgentEnd(ctx);
    }
  }

  async runBeforeToolCall(tool: string, input: any): Promise<{ allowed: boolean; modifiedInput?: any }> {
    let modifiedInput = input;
    for (const h of this.hooks) {
      if (h.beforeToolCall) {
        const result = await h.beforeToolCall(tool, modifiedInput);
        if (result && !result.allowed) return { allowed: false };
        if (result?.modifiedInput) modifiedInput = result.modifiedInput;
      }
    }
    return { allowed: true, modifiedInput };
  }

  async runAfterToolCall(tool: string, input: any, output: any, success: boolean): Promise<void> {
    for (const h of this.hooks) {
      if (h.afterToolCall) await h.afterToolCall(tool, input, output, success);
    }
  }

  async runBeforeTurn(turnNumber: number): Promise<void> {
    for (const h of this.hooks) {
      if (h.beforeTurn) await h.beforeTurn(turnNumber);
    }
  }

  async runAfterTurn(turnNumber: number, tokensUsed: number): Promise<void> {
    for (const h of this.hooks) {
      if (h.afterTurn) await h.afterTurn(turnNumber, tokensUsed);
    }
  }

  async runPrepareNextTurn(): Promise<void> {
    for (const h of this.hooks) {
      if (h.prepareNextTurn) await h.prepareNextTurn();
    }
  }

  async runOnError(error: Error): Promise<boolean> {
    let suppressed = false;
    for (const h of this.hooks) {
      if (h.onError) {
        const result = await h.onError(error);
        if (result === true) suppressed = true;
      }
    }
    return suppressed;
  }

  getHookCount(): number {
    return this.hooks.length;
  }
}

// ─── Global singletons ─────────────────────────────────────────────

let globalEventBus: AgentEventBus | null = null;
let globalHookManager: LifecycleHookManager | null = null;

export function getGlobalEventBus(): AgentEventBus {
  if (!globalEventBus) globalEventBus = new AgentEventBus();
  return globalEventBus;
}

export function getGlobalHookManager(): LifecycleHookManager {
  if (!globalHookManager) globalHookManager = new LifecycleHookManager();
  return globalHookManager;
}
