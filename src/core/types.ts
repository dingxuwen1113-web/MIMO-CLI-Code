import Anthropic from '@anthropic-ai/sdk';
import { MimoConfig } from '../config/schema';
import { ApiAdapter } from '../api/auth';
import { MemoryStore } from '../memory/store';
import { MemoryExtractor } from '../memory/extractor';
import { ToolRegistry, ExternalTool } from '../tools/registry';
import { SkillRegistry } from '../skills/registry';
import { DynamicAgentLoader } from '../dynamic-agents/loader';
import { SlashCommandLoader } from '../slash-commands/loader';
import { HookManager } from '../hooks/manager';
import { MCPClient } from '../mcp/client';
import { ModelRouter } from './router';
import { Charter } from './charter';
import { ContextCompressor } from './compressor';
import { SubagentManager } from '../subagent/manager';
import { TaskManager } from '../task/manager';
import { CheckpointManager } from './checkpoint';
import { Constitution } from './constitution';
import { DiagnosticsManager } from '../tools/lsp/diagnostics';
import { EnhancedSandbox } from '../sandbox/enhanced';
import { SessionRollbackManager } from '../session/rollback';
import { RLMManager } from '../rlm/manager';
import { AuditLogger } from '../audit/logger';
import { EnvironmentInfo } from './environment';
import { PlanFile } from './plan-manager';
import { BottomBarState } from '../tui/output';

export interface AgentDeps {
  config: MimoConfig;
  apiClient: ApiAdapter;
  memory: MemoryStore;
  extractor: MemoryExtractor;
  tools: ToolRegistry;
  router: ModelRouter;
  charter: Charter;
  skills: SkillRegistry;
  dynamicAgents?: DynamicAgentLoader;
  slashCommands?: SlashCommandLoader;
  hooks?: HookManager;
  mcpClient?: MCPClient;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | Anthropic.ContentBlockParam[];
}

export interface SessionData {
  id: string;
  startedAt: string;
  projectDir: string;
  conversationHistory: ConversationMessage[];
  turnCount: number;
  modifiedFiles: string[];
}

export interface ContextChapter {
  title: string;
  summary?: string;
  startIndex: number;
}

export interface NonInteractiveResult {
  response: string;
  tokens: { input: number; output: number };
  files: string[];
  errors: string[];
}

export interface AgentState {
  config: MimoConfig;
  apiClient: ApiAdapter;
  memory: MemoryStore;
  extractor: MemoryExtractor;
  tools: ToolRegistry;
  router: ModelRouter;
  charter: Charter;
  skills: SkillRegistry;
  dynamicAgents?: DynamicAgentLoader;
  slashCommands?: SlashCommandLoader;
  hooks?: HookManager;
  mcpClient?: MCPClient;
  checkpoint: CheckpointManager;
  compressor: ContextCompressor;
  subagentManager: SubagentManager;
  taskManager: TaskManager;
  constitution: Constitution;
  diagnosticsManager: DiagnosticsManager;
  enhancedSandbox: EnhancedSandbox;
  sessionRollback: SessionRollbackManager;
  rlmManager: RLMManager;
  auditLogger: AuditLogger;

  conversationHistory: ConversationMessage[];
  turnCount: number;
  errorCount: number;
  sessionId: string;
  sessionStartTime: string;
  modifiedFiles: Set<string>;
  projectRules: string;
  nonInteractive: boolean;
  nonInteractiveBuffer: string;
  nonInteractiveErrors: string[];
  yoloMode: boolean;
  chapters: ContextChapter[];
  currentPlan: PlanFile | null;
  thinkingEnabled: boolean;
  thinkingExplicitlyDisabled: boolean;
  sessionFile: string;
  autoVerifyCount: number;
  cachedEnvironmentInfo: EnvironmentInfo | null;
  todos: Array<{ text: string; done: boolean }>;
  _recoverableSession: SessionData | null;
}
