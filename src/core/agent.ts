import Anthropic from '@anthropic-ai/sdk';
import * as readline from 'readline';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { MimoConfig } from '../config/schema';
import { ApiAdapter } from '../api/auth';
import { MemoryStore } from '../memory/store';
import { MemoryExtractor } from '../memory/extractor';
import { ToolRegistry, ExternalTool } from '../tools/registry';
import { SkillRegistry } from '../skills/registry';
import { DynamicAgentLoader, AgentDefinition } from '../dynamic-agents/loader';
import { matchExpertAgent, listExpertAgents, getAgentCategories, ExpertAgent } from '../dynamic-agents/expert-registry';
import { SlashCommandLoader } from '../slash-commands/loader';
import { HookManager } from '../hooks/manager';
import { MCPClient } from '../mcp/client';
import { ModelRouter } from './router';
import { Charter } from './charter';
import { ContextCompressor } from './compressor';
import { SubagentManager } from '../subagent/manager';
import { TaskManager } from '../task/manager';
import { checkToolSafety } from '../security/checks';
import { setAutoReviewerApi } from '../tools/review/auto-review';
import { CheckpointManager } from './checkpoint';
import { analyzeProject, generateClaudeMd } from './project-analyzer';
import { detectEnvironment, formatEnvironment, getTypeCheckCommand, EnvironmentInfo } from './environment';
import { Constitution } from './constitution';
import { DiagnosticsManager } from '../tools/lsp/diagnostics';
import { setDiagnosticsManager } from '../tools/lsp/definitions';
import { EnhancedSandbox } from '../sandbox/enhanced';
import { SessionRollbackManager } from '../session/rollback';
import { RLMManager } from '../rlm/manager';
import { setRLMManager } from '../rlm/definitions';
import { AuditLogger } from '../audit/logger';
import { setAuditLogger } from '../audit/definitions';
import {
  printAssistantText,
  printToolCall,
  printToolResult,
  printError,
  printSuccess,
  printInfo,
  printWarning,
  printMemorySaved,
  printUsageStats,
  printTurnInfo,
  printSeparator,
  printThinking,
  printChapter,
  printSpinner,
  stopSpinner,
  printBottomBar,
  drawBottomBar,
  BottomBarState,
  ORANGE,
  GRAY,
  GRAY_DIM,
  CYAN,
  B,
  WHITE,
  GREEN,
  YELLOW,
} from '../tui/output';
import {
  createSpinner,
  stopSpinner as stopAnimSpinner,
  StreamingRenderer,
  animateToolCall,
  showToast,
  MultiStepAnimator,
  confetti,
} from '../tui/animations';

interface AgentDeps {
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

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | Anthropic.ContentBlockParam[];
}

interface SessionData {
  id: string;
  startedAt: string;
  projectDir: string;
  conversationHistory: ConversationMessage[];
  turnCount: number;
  modifiedFiles: string[];
}

interface ContextChapter {
  title: string;
  summary?: string;
  startIndex: number;
}

interface PlanFile {
  title: string;
  steps: Array<{ description: string; status: 'pending' | 'done' | 'skipped' }>;
  createdAt: string;
  approved: boolean;
}

const SESSIONS_DIR = path.join(os.homedir(), '.mimo', 'sessions');

export interface NonInteractiveResult {
  response: string;
  tokens: { input: number; output: number };
  files: string[];
  errors: string[];
}

export class MimoAgent {
  private config: MimoConfig;
  private apiClient: ApiAdapter;
  private memory: MemoryStore;
  private extractor: MemoryExtractor;
  private tools: ToolRegistry;
  private router: ModelRouter;
  private charter: Charter;
  private skills: SkillRegistry;
  private dynamicAgents?: DynamicAgentLoader;
  private slashCommands?: SlashCommandLoader;
  private hooks?: HookManager;
  private mcpClient?: MCPClient;
  private checkpoint: CheckpointManager;
  private sessionResumeData?: SessionData | null;
  private compressor: ContextCompressor;
  private subagentManager: SubagentManager;

  private conversationHistory: ConversationMessage[] = [];
  private turnCount: number = 0;
  private errorCount: number = 0;
  private sessionId: string;
  private sessionStartTime: string;
  private modifiedFiles: Set<string> = new Set();
  private projectRules: string = '';
  private nonInteractive: boolean = false;
  private nonInteractiveBuffer: string = '';
  private nonInteractiveErrors: string[] = [];
  private yoloMode: boolean = false;
  private chapters: ContextChapter[] = [];
  private currentPlan: PlanFile | null = null;
  private thinkingEnabled: boolean = false;
  private thinkingExplicitlyDisabled: boolean = false;
  private sessionFile: string = '';
  private autoVerifyCount: number = 0;
  private cachedEnvironmentInfo: EnvironmentInfo | null = null;
  private todos: Array<{ text: string; done: boolean }> = [];
  private taskManager: TaskManager;
  // New systems (CodeWhale parity)
  private constitution: Constitution;
  private diagnosticsManager: DiagnosticsManager;
  private enhancedSandbox: EnhancedSandbox;
  private sessionRollback: SessionRollbackManager;
  private rlmManager: RLMManager;
  private auditLogger: AuditLogger;

  constructor(deps: AgentDeps) {
    this.config = deps.config;
    this.apiClient = deps.apiClient;
    this.memory = deps.memory;
    this.extractor = deps.extractor;
    this.tools = deps.tools;
    this.router = deps.router;
    this.charter = deps.charter;
    this.skills = deps.skills;
    this.dynamicAgents = deps.dynamicAgents;
    this.slashCommands = deps.slashCommands;
    this.hooks = deps.hooks;
    this.mcpClient = deps.mcpClient;

    this.sessionId = crypto.randomBytes(8).toString('hex');
    this.sessionStartTime = new Date().toISOString();
    this.checkpoint = new CheckpointManager(this.sessionId);
    this.checkpoint.init().catch(() => {});

    this.compressor = new ContextCompressor(deps.apiClient);
    this.subagentManager = new SubagentManager(deps.apiClient, deps.tools, deps.charter);

    this.sessionFile = path.join(SESSIONS_DIR, `${this.sessionId}.json`);
    this.taskManager = new TaskManager();

    // Initialize new systems (CodeWhale parity)
    this.constitution = new Constitution();
    this.diagnosticsManager = new DiagnosticsManager(process.cwd());
    this.enhancedSandbox = new EnhancedSandbox({ workspaceRoot: process.cwd() });
    this.sessionRollback = new SessionRollbackManager(this.sessionId);
    this.rlmManager = new RLMManager({ workingDirectory: process.cwd() });
    this.auditLogger = new AuditLogger(this.sessionId);

    // Wire up global tool instances
    setDiagnosticsManager(this.diagnosticsManager);
    setRLMManager(this.rlmManager);
    setAuditLogger(this.auditLogger);

    // Initialize AutoReviewer with the API client
    setAutoReviewerApi(deps.apiClient);
  }

  // ── 初始化（集成所有外部系统）────────────────────
  async init(): Promise<void> {
    // 初始化动画
    const steps = [
      { label: 'MCP 工具', status: 'pending' as const },
      { label: 'Hooks 配置', status: 'pending' as const },
      { label: '动态 Agent', status: 'pending' as const },
      { label: '会话存储', status: 'pending' as const },
      { label: '创新功能', status: 'pending' as const },
      { label: 'LSP 诊断', status: 'pending' as const },
      { label: '沙箱系统', status: 'pending' as const },
      { label: 'RLM 引擎', status: 'pending' as const },
      { label: '审计日志', status: 'pending' as const },
    ];
    const animator = new MultiStepAnimator(steps);
    animator.start();

    // 1. 注入 MCP 工具到 ToolRegistry
    animator.setStep(0, 'running');
    animator.render();
    if (this.mcpClient) {
      try {
        await this.mcpClient.connectAll();
        const mcpTools = this.mcpClient.getAllTools();
        if (mcpTools.length > 0) {
          const externalTools: ExternalTool[] = mcpTools.map(({ server, tool }) => ({
            server,
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema,
          }));
          this.tools.setExternalTools(externalTools, async (server, toolName, args) => {
            return this.mcpClient!.callTool(server, toolName, args);
          });
        }
        animator.setStep(0, 'done');
      } catch (err: any) {
        animator.setStep(0, 'error');
      }
    } else {
      animator.setStep(0, 'skipped');
    }

    // 2. 加载 Hooks 配置
    animator.setStep(1, 'running');
    animator.render();
    if (this.hooks) {
      await this.hooks.loadFromConfig();
      animator.setStep(1, 'done');
    } else {
      animator.setStep(1, 'skipped');
    }

    // 3. 配置 SubagentManager 的动态 Agent 支持
    animator.setStep(2, 'running');
    animator.render();
    if (this.dynamicAgents) {
      this.subagentManager.setDynamicAgents(this.dynamicAgents);
      animator.setStep(2, 'done');
    } else {
      animator.setStep(2, 'skipped');
    }

    // 4. 创建 sessions 目录
    animator.setStep(3, 'running');
    animator.render();
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
    await this.taskManager.init();
    animator.setStep(3, 'done');

    // 5. 创新功能
    animator.setStep(4, 'done');

    // 6. LSP 诊断
    animator.setStep(5, 'running');
    animator.render();
    try {
      await this.diagnosticsManager.init();
      animator.setStep(5, 'done');
    } catch {
      animator.setStep(5, 'skipped');
    }

    // 7. 沙箱系统
    animator.setStep(6, 'running');
    animator.render();
    try {
      await this.enhancedSandbox.init();
      animator.setStep(6, 'done');
    } catch {
      animator.setStep(6, 'skipped');
    }

    // 8. RLM 引擎
    animator.setStep(7, 'running');
    animator.render();
    try {
      await this.rlmManager.init();
      animator.setStep(7, 'done');
    } catch {
      animator.setStep(7, 'skipped');
    }

    // 9. 审计日志
    animator.setStep(8, 'running');
    animator.render();
    try {
      await this.auditLogger.init();
      animator.setStep(8, 'done');
    } catch {
      animator.setStep(8, 'skipped');
    }

    // Initialize session rollback
    await this.sessionRollback.init();

    animator.stop();
  }

  // ── 交互模式 ──────────────────────────────────
  async startInteractive(): Promise<void> {
    await this.init();
    await this.loadProjectRules();

    // 检查是否有可恢复的会话
    await this.checkSessionRecovery();

    // 显示欢迎面板
    this.printWelcomePanel();

    // 绘制固定底部状态栏
    this.showBottomBar();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // SIGINT 处理 + 功能键监听
    let sigintCount = 0;
    const onSigint = () => {
      sigintCount++;
      if (sigintCount >= 2) {
        console.log('\n');
        printInfo('正在退出...');
        rl.close();
        this.onSessionEnd().finally(() => process.exit(0));
      } else {
        console.log('\n  (再次按 Ctrl+C 退出，或输入 /quit)');
        setTimeout(() => { sigintCount = 0; }, 3000);
      }
    };
    process.on('SIGINT', onSigint);

    // 功能键监听（Tab, Shift+Tab, Ctrl+K, F1-F6）
    const onKeypress = (_chunk: any, key: any) => {
      if (!key) return;
      // Tab — cycle modes (plan → agent → yolo)
      if (key.name === 'tab' && !key.shift) {
        this.cycleMode();
      }
      // Shift+Tab — toggle reasoning effort
      else if (key.name === 'tab' && key.shift) {
        this.toggleReasoningEffort();
      }
      // Ctrl+K — command palette
      else if (key.name === 'k' && key.ctrl) {
        this.showCommandPalette();
      }
      // Ctrl+L — clear screen
      else if (key.name === 'l' && key.ctrl) {
        process.stdout.write('\x1b[2J\x1b[H');
        this.showBottomBar();
      }
      // F1-F6
      else if (key.name === 'f1' || key.sequence === '\x1bOP') this.handleFunctionKey('F1');
      else if (key.name === 'f2' || key.sequence === '\x1bOQ') this.handleFunctionKey('F2');
      else if (key.name === 'f3' || key.sequence === '\x1bOR') this.handleFunctionKey('F3');
      else if (key.name === 'f4' || key.sequence === '\x1bOS') this.handleFunctionKey('F4');
      else if (key.name === 'f5' || key.sequence === '\x1b[15~') this.handleFunctionKey('F5');
      else if (key.name === 'f6' || key.sequence === '\x1b[17~') this.handleFunctionKey('F6');
    };
    // Node.js keypress 事件需要 readline emitKeypressEvents
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.on('keypress', onKeypress);
    }

    const ask = (): Promise<string> => {
      return new Promise((resolve) => {
        // Show status summary before prompt
        this.printStatusSummary();

        const modeIndicator = this.yoloMode
          ? '\x1b[31m⚡\x1b[0m'
          : this.config.agent.mode === 'plan'
            ? '\x1b[33mP\x1b[0m'
            : '\x1b[36m>\x1b[0m';
        rl.question(`  [${modeIndicator}] `, (answer) => {
          resolve(answer.trim());
        });
      });
    };

    try {
      while (true) {
        const input = await ask();
        if (!input) continue;

        // 内置命令
        if (input.startsWith('/')) {
          const handled = await this.handleCommand(input, rl);
          if (handled === 'quit') break;
          continue;
        }

        await this.processUserInput(input);

        // 自动保存会话
        await this.saveSession();
      }
    } finally {
      process.off('SIGINT', onSigint);
      process.off('keypress', onKeypress);
      rl.close();
    }
  }

  // ── 单次执行模式 ──────────────────────────────
  async run(prompt: string): Promise<void> {
    await this.init();
    await this.loadProjectRules();
    await this.processUserInput(prompt);
  }

  // ── 非交互模式（CI/CD 管道）────────────────────
  async runNonInteractive(
    prompt: string,
    options: { quiet: boolean }
  ): Promise<NonInteractiveResult> {
    this.nonInteractive = true;
    this.nonInteractiveBuffer = '';
    this.nonInteractiveErrors = [];

    // Force yolo mode so tool calls are auto-approved
    this.yoloMode = true;
    this.config.agent.mode = 'yolo';

    // Disable streaming to get complete responses in buffer
    this.config.api.stream = false;

    try {
      // Initialize agent (MCP, hooks, etc.) — skip TUI animations
      await this.initNonInteractive();
      await this.loadProjectRules();

      // Run the core agent loop
      await this.processUserInput(prompt);

      // Get token usage
      const stats = this.apiClient.getUsageStats();

      return {
        response: this.nonInteractiveBuffer.trim(),
        tokens: {
          input: stats.inputTokens || 0,
          output: stats.outputTokens || 0,
        },
        files: Array.from(this.modifiedFiles),
        errors: this.nonInteractiveErrors,
      };
    } catch (err: any) {
      const msg = err.message || String(err);
      this.nonInteractiveErrors.push(msg);

      const stats = this.apiClient.getUsageStats();
      return {
        response: this.nonInteractiveBuffer.trim(),
        tokens: {
          input: stats.inputTokens || 0,
          output: stats.outputTokens || 0,
        },
        files: Array.from(this.modifiedFiles),
        errors: this.nonInteractiveErrors,
      };
    }
  }

  // ── 非交互初始化（跳过动画）────────────────────
  private async initNonInteractive(): Promise<void> {
    // Inject MCP tools
    if (this.mcpClient) {
      try {
        await this.mcpClient.connectAll();
        const mcpTools = this.mcpClient.getAllTools();
        if (mcpTools.length > 0) {
          const externalTools = mcpTools.map(({ server, tool }) => ({
            server,
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema,
          }));
          this.tools.setExternalTools(externalTools, async (server, toolName, args) => {
            return this.mcpClient!.callTool(server, toolName, args);
          });
        }
      } catch {
        // MCP failures are non-fatal in non-interactive mode
      }
    }

    // Load hooks
    if (this.hooks) {
      try { await this.hooks.loadFromConfig(); } catch {}
    }

    // Configure subagent manager
    if (this.dynamicAgents) {
      this.subagentManager.setDynamicAgents(this.dynamicAgents);
    }

    // Create sessions directory
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
    await this.taskManager.init();
  }

  // ── CLAUDE.md 层级加载 ──────────────────────────
  private async loadProjectRules(): Promise<void> {
    const cwd = process.cwd();
    const homeDir = os.homedir();

    // 按优先级从低到高加载（后加载的优先级更高，放后面）
    const ruleFiles = [
      // 全局
      path.join(homeDir, '.claude', 'CLAUDE.md'),
      path.join(homeDir, '.mimo', 'rules.md'),
      // 项目级
      path.join(cwd, 'CLAUDE.md'),
      path.join(cwd, '.mimo', 'rules.md'),
      path.join(cwd, 'MIMO.md'),
      // 目录级（当前目录）
      path.join(cwd, '.claude', 'CLAUDE.md'),
    ];

    const rules: string[] = [];
    for (const file of ruleFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        if (content.trim()) {
          rules.push(`## 项目规则 (${path.relative(cwd, file) || path.basename(file)})\n\n${content.trim()}`);
        }
      } catch {
        // 文件不存在，跳过
      }
    }

    this.projectRules = rules.join('\n\n');
  }

  // ── 会话恢复 ──────────────────────────────────
  private async checkSessionRecovery(): Promise<void> {
    try {
      const files = await fs.readdir(SESSIONS_DIR);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort();

      if (jsonFiles.length === 0) return;

      // 找最近的会话
      const latestFile = jsonFiles[jsonFiles.length - 1];
      const raw = await fs.readFile(path.join(SESSIONS_DIR, latestFile), 'utf-8');
      const session = JSON.parse(raw) as SessionData;

      // 只恢复 24 小时内的同目录会话
      const sessionAge = Date.now() - new Date(session.startedAt).getTime();
      if (sessionAge > 24 * 60 * 60 * 1000) return;
      if (session.projectDir !== process.cwd()) return;
      if (session.conversationHistory.length === 0) return;

      printInfo(`发现最近会话 (${session.turnCount} 轮, ${Math.round(sessionAge / 60000)} 分钟前)`);
      printInfo('输入 /resume 恢复，或继续新对话');
      // 存储但不自动恢复，等用户决定
      this._recoverableSession = session;
    } catch {
      // 没有可恢复的会话
    }
  }

  private _recoverableSession: SessionData | null = null;

  private async resumeSession(): Promise<void> {
    if (!this._recoverableSession) {
      printWarning('没有可恢复的会话');
      return;
    }

    const session = this._recoverableSession;
    this.conversationHistory = session.conversationHistory;
    this.turnCount = session.turnCount;
    this.modifiedFiles = new Set(session.modifiedFiles);
    this.sessionId = session.id;

    printSuccess(`已恢复会话 ${session.id} (${session.turnCount} 轮, ${session.modifiedFiles.length} 个文件被修改)`);

    // 显示最近的对话摘要
    const lastFew = this.conversationHistory.slice(-4);
    for (const msg of lastFew) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      const preview = content.slice(0, 200);
      printInfo(`[${msg.role}] ${preview}${content.length > 200 ? '...' : ''}`);
    }
  }

  // ── 会话持久化 ────────────────────────────────
  private async saveSession(): Promise<void> {
    try {
      const sessionData: SessionData = {
        id: this.sessionId,
        startedAt: this.sessionStartTime,
        projectDir: process.cwd(),
        conversationHistory: this.conversationHistory,
        turnCount: this.turnCount,
        modifiedFiles: Array.from(this.modifiedFiles),
      };
      await fs.writeFile(this.sessionFile, JSON.stringify(sessionData, null, 2), 'utf-8');
    } catch {
      // 静默失败
    }
  }

  // ── 核心处理逻辑 ──────────────────────────────
  private async processUserInput(userInput: string): Promise<void> {
    this.autoVerifyCount = 0;

    // 检查是否是 slash 命令（/command 格式）
    if (userInput.startsWith('/') && !userInput.startsWith('//')) {
      const handled = await this.handleSlashCommand(userInput);
      if (handled) return;
    }

    // 分类任务，决定模型
    const taskContext = this.router.classifyTask(userInput);
    const model = this.router.route({ ...taskContext, previousErrors: this.errorCount });

    // 自动启用 thinking：编程/调试/架构任务且未手动禁用时自动开启
    const shouldAutoThink = (taskContext.isCoding || taskContext.isDebugging || taskContext.isArchitectural)
      && !this.thinkingExplicitlyDisabled;
    const useThinking = this.thinkingEnabled || shouldAutoThink;

    // 添加用户消息到历史
    this.conversationHistory.push({ role: 'user', content: userInput });

    // 构建系统 prompt
    const projectSlug = this.detectProject();
    const memoryContext = await this.memory.buildMemoryContext(projectSlug);
    const systemPrompt = await this.buildSystemPrompt(memoryContext, userInput);

    // 显示模型信息（仅交互模式）
    if (!this.nonInteractive) {
      printTurnInfo(model, this.config.agent.mode, this.yoloMode);
    }

    // Agent 主循环
    let maxTurns = this.config.agent.maxTurns;
    let streamedText = '';

    while (maxTurns-- > 0) {
      try {
        // 自动压缩
        if (this.compressor.needsCompression(this.conversationHistory)) {
          if (!this.nonInteractive) printInfo('压缩上下文...');
          const compressed = await this.compressor.compress(this.conversationHistory);
          this.conversationHistory = compressed.preservedMessages;
          if (!this.nonInteractive) printSuccess(`已压缩 ${compressed.compressedCount} 条消息`);
        }

        const toolDefs = this.tools.getDefinitions();
        let response: Anthropic.Message;
        streamedText = '';

        if (this.config.api.stream) {
          response = await this.apiClient.chatStream(
            this.conversationHistory as any,
            toolDefs,
            systemPrompt,
            {
              onText: (text) => {
                streamedText += text;
                if (this.nonInteractive) {
                  this.nonInteractiveBuffer += text;
                } else {
                  process.stdout.write(text);
                }
              },
              onThinking: (thinking) => {
                if (!this.nonInteractive && useThinking) {
                  printThinking(thinking);
                }
              },
            },
            { model, thinking: useThinking }
          );
          if (!this.nonInteractive && streamedText) console.log('');
        } else {
          response = await this.apiClient.chat(
            this.conversationHistory as any,
            toolDefs,
            systemPrompt,
            { model, thinking: useThinking }
          );
          for (const block of response.content) {
            if (block.type === 'text') {
              if (this.nonInteractive) {
                this.nonInteractiveBuffer += block.text;
              } else {
                printAssistantText(block.text);
              }
            } else if (block.type === 'thinking' && !this.nonInteractive && useThinking) {
              printThinking((block as any).thinking);
            }
          }
        }

        // 添加 assistant 消息到历史
        this.conversationHistory.push({
          role: 'assistant',
          content: response.content,
        });

        // Guard against empty or missing content blocks
        if (!response.content || response.content.length === 0) {
          this.turnCount++;
          this.errorCount = 0;
          break;
        }

        // 检查工具调用
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        );

        if (toolUseBlocks.length === 0) {
          this.turnCount++;
          this.errorCount = 0;
          break;
        }

        // 执行工具调用
        const toolResults: Anthropic.ContentBlockParam[] = [];
        let needNewline = false;

        for (const toolCall of toolUseBlocks) {
          const toolName = toolCall.name;
          const toolInput = toolCall.input as Record<string, any>;

          // 安全检查
          const safetyCheck = await checkToolSafety(toolName, toolInput);
          if (!safetyCheck.safe) {
            for (const msg of safetyCheck.blocked) {
              if (this.nonInteractive) {
                this.nonInteractiveErrors.push(msg);
              } else {
                printError(msg);
              }
            }
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: safetyCheck.blocked.join('\n'),
              is_error: true,
            });
            continue;
          }
          for (const msg of safetyCheck.warnings) {
            if (!this.nonInteractive) printWarning(msg);
          }

          // Pre-tool Hook
          if (this.hooks) {
            const hookResult = await this.hooks.execute('pre_tool', {
              toolName, toolInput, sessionId: this.sessionId, projectDir: process.cwd(),
            });
            if (!hookResult.allowed) {
              if (this.nonInteractive) {
                this.nonInteractiveErrors.push(`Hook rejected: ${hookResult.message}`);
              } else {
                printWarning(`Hook 拒绝: ${hookResult.message}`);
              }
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: `被 Hook 拒绝: ${hookResult.message}`,
                is_error: true,
              });
              continue;
            }
            if (hookResult.modifiedInput) Object.assign(toolInput, hookResult.modifiedInput);
          }

          // 权限检查（输入感知：区分只读/写操作子类型）
          const permission = this.yoloMode ? 'auto' : this.tools.checkPermission(toolName, toolInput);

          if (permission === 'denied') {
            if (this.nonInteractive) {
              this.nonInteractiveErrors.push(`Denied: ${toolName} not allowed in current mode`);
            } else {
              printWarning(`跳过: ${toolName} (当前模式不允许)`);
            }
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: `错误：当前模式不允许执行 ${toolName}`,
              is_error: true,
            });
            continue;
          }

          if (permission === 'ask') {
            const approved = await this.askApproval(toolName, toolInput);
            if (!approved) {
              if (this.nonInteractive) {
                this.nonInteractiveErrors.push(`Rejected: ${toolName}`);
              } else {
                printWarning(`已拒绝: ${toolName}`);
              }
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: '用户拒绝了此操作',
                is_error: true,
              });
              continue;
            }
          }

          if (!this.nonInteractive && needNewline) console.log('');
          needNewline = true;

          // Checkpoint 快照（编辑文件前自动保存）
          if (['file_write', 'file_edit'].includes(toolName) && toolInput.path) {
            await this.checkpoint.snapshot(toolInput.path, `${toolName}: ${path.basename(toolInput.path)}`);
            // Enhanced sandbox side-git snapshot
            await this.enhancedSandbox.takeSnapshot(`${toolName}: ${path.basename(toolInput.path)}`);
          }

          let result: { output: string; isError: boolean };
          const toolStartTime = Date.now();
          if (this.nonInteractive) {
            // Execute directly without animation
            result = await this.tools.execute(toolName, toolInput);
          } else {
            // 增强版工具调用动画
            const toolAnim = animateToolCall(toolName, this.formatToolDesc(toolName, toolInput));
            result = await this.tools.execute(toolName, toolInput);
            toolAnim.done(!result.isError);
          }
          const toolDuration = Date.now() - toolStartTime;

          // Audit log for tool call
          this.auditLogger.logToolCall(toolName, toolInput, result.output, result.isError, toolDuration);

          // Post-tool Hook
          if (this.hooks) {
            await this.hooks.execute('post_tool', {
              toolName, toolInput, toolOutput: result.output,
              isError: result.isError, sessionId: this.sessionId,
            });
          }

          if (['file_write', 'file_edit'].includes(toolName) && !result.isError) {
            this.modifiedFiles.add(toolInput.path);

            // LSP auto-diagnostics after file edit
            if (this.diagnosticsManager.isEnabled() && this.diagnosticsManager.isAutoRunEnabled()) {
              try {
                const diagResult = await this.diagnosticsManager.diagnoseFile(toolInput.path);
                if (diagResult.diagnostics.length > 0) {
                  const errors = diagResult.diagnostics.filter(d => d.severity === 'error');
                  const warnings = diagResult.diagnostics.filter(d => d.severity === 'warning');
                  if (errors.length > 0) {
                    const formatted = this.diagnosticsManager.formatDiagnostics(diagResult);
                    if (!this.nonInteractive) {
                      printWarning(`[LSP] ${errors.length} error(s), ${warnings.length} warning(s) in ${path.basename(toolInput.path)}`);
                    }
                    // Inject diagnostics as feedback to the agent
                    toolResults.push({
                      type: 'tool_result',
                      tool_use_id: toolCall.id,
                      content: `${result.output}\n\n[LSP Auto-Diagnostics]\n${formatted}\n\nPlease fix these errors.`,
                      is_error: false,
                    });
                    this.auditLogger.logLSPEvent('auto_diagnostics', {
                      file: toolInput.path,
                      errors: errors.length,
                      warnings: warnings.length,
                    });
                    continue;
                  }
                }
              } catch { /* LSP errors are non-fatal */ }
            }

            // Auto-verification: type-check after file edits
            if (
              this.autoVerifyCount < 3 &&
              !this.nonInteractive &&
              this.cachedEnvironmentInfo
            ) {
              const modifiedPath: string = toolInput.path || '';
              const srcExts = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];
              const ext = path.extname(modifiedPath).toLowerCase();
              if (srcExts.includes(ext)) {
                const verifyCmd = getTypeCheckCommand(this.cachedEnvironmentInfo);
                if (verifyCmd) {
                  try {
                    const { execSync } = require('child_process');
                    execSync(verifyCmd, {
                      cwd: process.cwd(),
                      timeout: 30000,
                      stdio: ['pipe', 'pipe', 'pipe'],
                      encoding: 'utf-8',
                    });
                  } catch (verifyErr: any) {
                    const stderr: string = verifyErr.stderr || verifyErr.stdout || verifyErr.message || '';
                    if (stderr.trim()) {
                      printWarning('[自动验证] 类型检查发现错误:');
                      process.stdout.write(stderr.trim() + '\n');
                      toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolCall.id,
                        content: `[自动验证] 类型检查发现错误:\n${stderr.trim()}\n\n请修复这些错误。`,
                        is_error: false,
                      });
                      this.autoVerifyCount++;
                      // Skip adding the normal tool_result below; we already pushed ours
                      continue;
                    }
                  }
                }
              }
            }
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: result.output,
            is_error: result.isError,
          });

          if (result.isError) {
            this.errorCount++;
          }
        }

        // 添加工具结果到历史
        this.conversationHistory.push({
          role: 'user',
          content: toolResults,
        });

        this.turnCount++;
      } catch (err: any) {
        // 429/529 errors are already retried by the global rate limiter.
        // If they still escape (retries exhausted), handleApiError suppresses them silently.
        if (!this.nonInteractive) process.stdout.write('\r\x1b[K');
        this.handleApiError(err);
        this.errorCount = 0;
        break;
      }
    }

    // 定期记忆提取（每 5 轮）
    if (this.turnCount > 0 && this.turnCount % 5 === 0) {
      await this.extractAndSaveMemories();
    }

    // Record turn for session rollback
    const lastAssistant = [...this.conversationHistory].reverse().find(m => m.role === 'assistant');
    const assistantText = lastAssistant
      ? (typeof lastAssistant.content === 'string' ? lastAssistant.content : JSON.stringify(lastAssistant.content)).slice(0, 500)
      : '';
    this.sessionRollback.recordTurn({
      userMessage: userInput,
      assistantResponse: assistantText,
      filesModified: Array.from(this.modifiedFiles),
      toolCalls: [], // tracked per-tool above
      conversationLength: this.conversationHistory.length,
    });
  }

  // ── Slash 命令处理（/command → 执行对应 prompt）────
  private async handleSlashCommand(input: string): Promise<boolean> {
    if (!this.slashCommands) return false;

    const parts = input.trim().split(/\s+/);
    const cmdName = parts[0].slice(1); // 去掉 /
    const args = parts.slice(1).join(' ');

    const cmd = this.slashCommands.getCommand(cmdName);
    if (!cmd) return false;

    // 将 slash 命令的 prompt 作为用户输入执行
    let prompt = cmd.prompt;
    if (args) {
      prompt = prompt.replace(/\{\{args\}\}/g, args).replace(/\$ARGUMENTS/g, args);
    }

    printInfo(`执行 /${cmdName}: ${cmd.description}`);
    await this.processUserInput(prompt);
    return true;
  }

  // ── API 错误处理 ──────────────────────────────
  private handleApiError(err: any): void {
    const msg = err.message || String(err);
    let errorMsg = '';

    if (msg.includes('401') || msg.includes('Unauthorized')) {
      errorMsg = 'API Key 无效 / API Key invalid. 请运行 mimo init 重新配置 / Run mimo init to reconfigure.';
    } else if (msg.includes('429') || msg.includes('rate_limit') || msg.includes('rate limit')) {
      // 静默重试，不打印警告
    } else if (msg.includes('529') || msg.includes('overloaded')) {
      // 静默重试
    } else if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) {
      errorMsg = '无法连接 API / Cannot connect to API. 请检查网络和端点配置 / Check network and endpoint config.';
    } else if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
      errorMsg = 'API 请求超时 / API request timed out.';
    } else if (msg.includes('403') || msg.includes('Forbidden')) {
      errorMsg = 'API 访问被拒绝 / API access forbidden. 请检查 API Key 权限 / Check API key permissions.';
    } else if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
      errorMsg = 'API 服务暂时不可用 / API service temporarily unavailable. 请稍后重试 / Please retry later.';
    } else {
      errorMsg = `API 错误 / API error: ${msg}`;
    }

    if (errorMsg) {
      if (this.nonInteractive) {
        this.nonInteractiveErrors.push(errorMsg);
      } else {
        printError(errorMsg);
      }
    }

    this.errorCount++;
  }

  // ── 构建系统 prompt ──────────────────────────
  private async buildSystemPrompt(memoryContext: string, userInput?: string): Promise<string> {
    const charterContent = this.charter.getContent();
    const parts = charterContent ? [charterContent] : ['You are MIMO, a helpful AI coding assistant.'];

    if (this.projectRules) {
      parts.push(this.projectRules);
    }

    // 注入匹配的技能知识
    if (userInput) {
      const matchedSkill = this.skills.matchSkill(userInput);
      if (matchedSkill) {
        parts.push(`# 当前技能: ${matchedSkill.icon} ${matchedSkill.name}\n\n${matchedSkill.systemPrompt}`);
      }
    }

    // 注入匹配的动态 Agent 指令
    if (userInput && this.dynamicAgents) {
      const matchedAgent = this.dynamicAgents.matchAgent(userInput);
      if (matchedAgent) {
        parts.push(`# Agent: ${matchedAgent.name}\n\n${matchedAgent.systemPrompt}`);
      }
    }

    // 注入匹配的专家团队 Agent 知识
    if (userInput) {
      const expertAgent = matchExpertAgent(userInput);
      if (expertAgent) {
        try {
          const fsSync = require('fs');
          const agentPath = require('path').join(process.cwd(), expertAgent.filePath);
          const agentContent = fsSync.readFileSync(agentPath, 'utf-8');
          // 去掉 frontmatter，只保留正文
          const body = agentContent.replace(/^---[\s\S]*?---\n*/m, '');
          parts.push(`# 专家团队: ${expertAgent.name}\n\n${body}`);
        } catch {
          parts.push(`# 专家团队: ${expertAgent.name}\n\n${expertAgent.description}`);
        }
      }
    }

    // 注入 MCP 工具说明
    const mcpTools = this.tools.getExternalTools();
    if (mcpTools.length > 0) {
      const toolList = mcpTools.map(t => `  - mcp__${t.server}__${t.name}: ${t.description}`).join('\n');
      parts.push(`# 可用 MCP 工具\n\n${toolList}`);
    }

    if (memoryContext) {
      parts.push(`# 用户记忆与上下文\n\n${memoryContext}`);
    }

    // 注入当前计划
    if (this.currentPlan) {
      const planText = this.currentPlan.steps
        .map((s, i) => `${i + 1}. [${s.status === 'done' ? 'x' : ' '}] ${s.description}`)
        .join('\n');
      parts.push(`# 当前计划: ${this.currentPlan.title}\n\n${planText}`);
    }

    // 注入上下文章节
    if (this.chapters.length > 0) {
      const chapterList = this.chapters.map(c => `  - ${c.title}${c.summary ? ': ' + c.summary : ''}`).join('\n');
      parts.push(`# 会话章节\n\n${chapterList}`);
    }

    // 注入环境信息（每会话检测一次，结果缓存）
    if (!this.cachedEnvironmentInfo) {
      try {
        this.cachedEnvironmentInfo = await detectEnvironment();
      } catch {
        // 环境检测失败不阻塞主流程
      }
    }
    if (this.cachedEnvironmentInfo) {
      parts.push(formatEnvironment(this.cachedEnvironmentInfo));
    }

    return parts.join('\n\n');
  }

  // ── 记忆提取 ──────────────────────────────────
  private async extractAndSaveMemories(): Promise<void> {
    try {
      const messages = this.conversationHistory.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }));

      const existingIds = (await this.memory.list()).map((m) => m.id);
      const extraction = await this.extractor.extractFromConversation(messages, existingIds);

      if (extraction.shouldSave && extraction.memories.length > 0) {
        for (const mem of extraction.memories) {
          await this.memory.save({
            id: mem.id,
            type: mem.type,
            name: mem.name,
            description: mem.description,
            content: mem.content,
            tags: [],
            links: [],
          });
          printMemorySaved(mem.name);
        }
      }
    } catch (err: any) {
      printWarning(`记忆提取失败: ${err.message}`);
    }
  }

  // ── 会话结束处理 ──────────────────────────────
  async onSessionEnd(): Promise<void> {
    // Save final session state
    try { await this.saveSession(); } catch {}

    // Flush audit log
    try { await this.auditLogger.close(); } catch {}

    // Stop LSP servers
    try { await this.diagnosticsManager.stopAll(); } catch {}

    // Close RLM sessions
    try { await this.rlmManager.closeAll(); } catch {}

    if (this.turnCount > 0) {
      // 最后一次记忆提取
      try { await this.extractAndSaveMemories(); } catch {}

      // 保存会话快照
      try {
        await this.memory.saveSessionSummary(this.sessionId, {
          projectSlug: this.detectProject(),
          startedAt: this.sessionStartTime,
          turnCount: this.turnCount,
          filesModified: Array.from(this.modifiedFiles),
          decisions: [],
          unresolved: [],
        });
      } catch {}

      // 显示用量统计
      try {
        printSeparator();
        const stats = this.apiClient.getUsageStats();
        const budget = this.apiClient.getBudgetInfo();
        printUsageStats(stats, budget);
      } catch {}

      // 会话结束动画
      if (this.modifiedFiles.size > 0) {
        try {
          showToast(
            `会话结束 · 修改了 ${this.modifiedFiles.size} 个文件 · ${this.turnCount} 轮对话`,
            'success'
          );
        } catch {}
      }
    }

    // 执行 post_session hooks
    try {
      await this.hooks?.execute('post_session', {
        sessionId: this.sessionId,
        projectDir: process.cwd(),
      });
    } catch {}
  }

  // ── 用户审批（带 diff 预览）──────────────────
  private async askApproval(toolName: string, input: Record<string, any>): Promise<boolean> {
    if (!toolName) {
      printWarning('工具名称为空，自动拒绝');
      return false;
    }

    const shortInput = this.formatToolInput(toolName, input || {});

    console.log(`\n  \x1b[33m⚠ 请求执行:\x1b[0m \x1b[1m${toolName}\x1b[0m`);
    console.log(`  \x1b[2m${shortInput}\x1b[0m`);

    // 文件编辑时显示 diff 预览
    if (toolName === 'file_edit' && input.path && input.old_string && input.new_string) {
      try {
        const content = await fs.readFile(input.path, 'utf-8');
        if (content.includes(input.old_string)) {
          const newContent = content.replace(input.old_string, input.new_string);
          this.printInlineDiff(input.old_string, input.new_string);
        }
      } catch {
        // 无法读取文件，跳过 diff
      }
    }

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question('  \x1b[36m允许？\x1b[0m [y]允许 / [n]拒绝 / [a]全部允许 / [p]创建计划: ', (answer) => {
        rl.close();
        const a = answer.trim().toLowerCase();

        if (a === 'a') {
          this.yoloMode = true;
          this.auditLogger.logModeChange('agent', 'yolo', 'user');
          printSuccess('已切换到 YOLO 模式（全部自动批准）');
          resolve(true);
          return;
        }

        if (a === 'p') {
          this.enterPlanMode(input);
          resolve(false);
          return;
        }

        const approved = a === 'y' || a === 'yes' || a === '';
        this.auditLogger.logToolApproval(toolName, approved);
        resolve(approved);
      });
    });
  }

  private printInlineDiff(oldStr: string, newStr: string): void {
    console.log('\n  \x1b[31m- ' + oldStr.split('\n').slice(0, 5).join('\n  - ') + '\x1b[0m');
    console.log('  \x1b[32m+ ' + newStr.split('\n').slice(0, 5).join('\n  + ') + '\x1b[0m');
  }

  // ── Plan 模式 ──────────────────────────────────
  private enterPlanMode(initialInput?: Record<string, any>): void {
    this.currentPlan = {
      title: '操作计划',
      steps: [],
      createdAt: new Date().toISOString(),
      approved: false,
    };
    if (initialInput) {
      this.currentPlan.steps.push({
        description: `执行: ${JSON.stringify(initialInput).slice(0, 100)}`,
        status: 'pending',
      });
    }
    this.config.agent.mode = 'plan';
    printSuccess('已进入 Plan 模式。使用 /plan approve 批准，/plan show 查看。');
  }

  // ── 格式化工具输入 ──────────────────────────
  // 格式化工具描述（用于动画显示）
  private formatToolDesc(toolName: string, input: Record<string, any>): string {
    switch (toolName) {
      case 'file_read':   return input.path || '';
      case 'file_write':  return `${input.path} · ${(input.content || '').split('\n').length} lines`;
      case 'file_edit':   return input.path || '';
      case 'shell_exec':  return (input.command || '').slice(0, 50);
      case 'grep_search': return `"${input.pattern}" → ${input.path || '.'}`;
      case 'glob_match':  return input.pattern || '';
      case 'web_search':  return `"${input.query}"`;
      case 'web_fetch':   return input.url || '';
      case 'git_commit':  return (input.message || '').slice(0, 40);
      case 'git_status':  return '';
      case 'git_diff':    return input.target || '';
      case 'git_log':     return input.count ? `${input.count} commits` : '';
      case 'git_branch':  return `${input.action || 'list'} ${input.name || ''}`.trim();
      case 'git_checkout':return input.target || input.file || '';
      case 'git_stash':   return `${input.action || 'list'} ${input.message || ''}`.trim();
      case 'git_pr':      return `${input.action || ''} ${input.title || input.number || ''}`.trim();
      case 'git_blame':   return input.path || '';
      case 'git_issue':   return `${input.action || ''} ${input.title || '#' + (input.number || '')}`.trim();
      case 'git_release': return `${input.action || ''} ${input.tag || ''}`.trim();
      case 'browser_navigate': return input.url || '';
      case 'browser_read':     return input.url || '';
      case 'browser_find':     return input.query || '';
      case 'browser_click':    return input.selector || input.ref || '';
      case 'browser_type':     return `"${(input.text || '').slice(0, 30)}"`;
      case 'browser_hover':    return input.selector || input.ref || '';
      case 'browser_scroll':   return input.direction || '';
      case 'browser_drag':     return `${input.startRef || ''} → ${input.endRef || ''}`;
      case 'browser_screenshot': return '';
      case 'browser_execute_js': return (input.code || '').slice(0, 40);
      case 'browser_form_input': return `${input.selector || ''}=${(input.value || '').slice(0, 20)}`;
      case 'browser_file_upload': return `${(input.paths || []).length} file(s)`;
      case 'browser_tabs_list':   return '';
      case 'browser_tabs_create': return input.url || '';
      case 'browser_tabs_close':  return `tab ${input.tabId}`;
      case 'browser_tabs_switch': return `tab ${input.tabId}`;
      case 'browser_gif_start':   return '';
      case 'browser_gif_stop':    return '';
      case 'browser_gif_export':  return input.filename || '';
      case 'browser_network':     return '';
      case 'browser_console':     return '';
      case 'browser_console_read':return '';
      case 'browser_network_read':return '';
      case 'browser_select_browser': return input.deviceId || '';
      case 'browser_resize':    return `${input.width || input.preset}x${input.height || ''}`;
      // Computer (desktop GUI)
      case 'computer_screenshot': return input.region ? `region ${input.region.x0},${input.region.y0}-${input.region.x1},${input.region.y1}` : 'fullscreen';
      case 'computer_click':      return `(${input.x},${input.y}) ${input.button || 'left'} ${input.clickType || 'single'}`;
      case 'computer_type':       return `"${(input.text || '').slice(0, 30)}"`;
      case 'computer_key':        return input.keys || '';
      case 'computer_mouse_move': return `(${input.x},${input.y})`;
      case 'computer_drag':       return `(${input.startX},${input.startY}) → (${input.endX},${input.endY})`;
      case 'computer_scroll':     return `${input.direction || ''} ${input.amount || 3}`;
      case 'computer_wait':       return `${input.seconds}s`;
      case 'computer_get_cursor': return '';
      case 'task_create':       return (input.title || '').slice(0, 40);
      case 'task_update':       return `task ${input.id || ''}`;
      case 'task_list':         return '';
      case 'task_get':          return `task ${input.id || ''}`;
      case 'notebook_read':     return input.path || '';
      case 'notebook_edit':     return `cell ${input.cellIndex ?? ''}`;
      case 'image_read':        return input.path || '';
      case 'file_upload':       return `${input.sourcePath || ''} → ${input.destinationPath || ''}`;
      case 'auto_review':       return `${input.target || 'staged'} ${input.fix ? '(with fixes)' : ''}`;
      case 'cyber_scan':        return `${input.target || 'codebase'} [${(input.categories || ['all']).join(',')}]`;
      default:
        if (toolName.startsWith('mcp__')) return toolName.split('__').slice(1).join('__');
        if (toolName.startsWith('git_')) return input.action || input.path || '';
        return '';
    }
  }

  private formatToolInput(toolName: string, input: Record<string, any>): string {
    switch (toolName) {
      case 'file_read':
        return `读取 ${input.path}${input.offset ? ` (行 ${input.offset}+)` : ''}`;
      case 'file_write':
        return `写入 ${input.path} (${(input.content || '').split('\n').length} 行)`;
      case 'file_edit':
        return `编辑 ${input.path}: "${(input.old_string || '').slice(0, 40)}..." → "${(input.new_string || '').slice(0, 40)}..."`;
      case 'shell_exec':
        return `执行: ${input.command}`;
      case 'grep_search':
        return `搜索 "${input.pattern}" in ${input.path || '.'}`;
      case 'glob_match':
        return `匹配 ${input.pattern} in ${input.path || '.'}`;
      case 'git_branch':
        return `Git 分支: ${input.action} ${input.name || ''}`;
      case 'git_stash':
        return `Git stash: ${input.action} ${input.message || ''}`;
      case 'git_checkout':
        return `Git checkout: ${input.target} ${input.create ? '(新建分支)' : input.file ? '(恢复文件)' : ''}`;
      case 'git_commit':
        return `Git commit: ${input.message || '(无消息)'}`;
      case 'git_pr':
        return `GitHub PR: ${input.action} ${input.title || ''}`;
      case 'git_issue':
        return `GitHub Issue: ${input.action} ${input.title || '#' + (input.number || '')}`;
      case 'git_release':
        return `GitHub Release: ${input.action} ${input.tag || ''}`;
      case 'browser_click':
        return `浏览器点击: ${input.selector || input.ref || ''}`;
      case 'browser_type':
        return `浏览器输入: "${(input.text || '').slice(0, 50)}"`;
      case 'browser_hover':
        return `悬停: ${input.selector || input.ref || ''}`;
      case 'browser_scroll':
        return `滚动: ${input.direction}`;
      case 'browser_form_input':
        return `表单: ${input.selector || ''}="${(input.value || '').slice(0, 30)}"`;
      case 'browser_file_upload':
        return `上传: ${(input.paths || []).length} 文件`;
      case 'browser_tabs_create':
        return `新标签页: ${input.url || ''}`;
      case 'browser_tabs_close':
        return `关闭标签页 ${input.tabId}`;
      case 'browser_tabs_switch':
        return `切换标签页 ${input.tabId}`;
      case 'browser_console':
        return `浏览器控制台: ${input.action || ''}`;
      case 'browser_console_read':
        return `读取控制台日志: ${input.pattern || ''}`;
      case 'browser_network_read':
        return `读取网络请求: ${input.urlPattern || ''}`;
      case 'browser_tabs_list':
        return `列出标签页`;
      case 'browser_gif_start':
        return `开始 GIF 录制`;
      case 'browser_gif_stop':
        return `停止 GIF 录制`;
      case 'browser_gif_export':
        return `导出 GIF: ${input.filename || ''}`;
      case 'browser_select_browser':
        return `选择浏览器: ${input.deviceId || ''}`;
      case 'browser_resize':
        return `视口 ${input.width || input.preset}x${input.height || ''}`;
      case 'browser_execute_js':
        return `执行 JS: ${(input.code || '').slice(0, 60)}...`;
      // Computer (desktop GUI)
      case 'computer_screenshot':
        return `截图: ${input.region ? `区域(${input.region.x0},${input.region.y0})-(${input.region.x1},${input.region.y1})` : '全屏'}`;
      case 'computer_click':
        return `点击 (${input.x},${input.y}) ${input.button || '左键'} ${input.clickType || '单击'}`;
      case 'computer_type':
        return `输入: "${(input.text || '').slice(0, 50)}"`;
      case 'computer_key':
        return `按键: ${input.keys}`;
      case 'computer_mouse_move':
        return `鼠标移动: (${input.x},${input.y})`;
      case 'computer_drag':
        return `拖拽: (${input.startX},${input.startY}) → (${input.endX},${input.endY})`;
      case 'computer_scroll':
        return `滚动: ${input.direction} ${input.amount || 3}`;
      case 'computer_wait':
        return `等待 ${input.seconds}秒`;
      case 'computer_get_cursor':
        return `获取光标位置`;
      case 'notebook_edit':
        return `编辑 Notebook Cell ${input.cellIndex}: ${input.editMode || 'replace'}`;
      case 'file_upload':
        return `上传: ${input.sourcePath} → ${input.destinationPath}`;
      case 'auto_review':
        return `Auto Review: ${input.target || 'staged'}${input.fix ? ' (with fixes)' : ''}`;
      case 'cyber_scan':
        return `Cyber Scan: ${input.target || 'codebase'} [${(input.categories || ['all']).join(', ')}]`;
      default:
        if (toolName.startsWith('mcp__')) {
          return `MCP: ${JSON.stringify(input).slice(0, 80)}`;
        }
        return JSON.stringify(input).slice(0, 100);
    }
  }

  // ── 内置命令处理 ──────────────────────────────
  private async handleCommand(input: string, rl: readline.Interface): Promise<string | void> {
    const cmd = input.trim().toLowerCase();
    const parts = cmd.split(/\s+/);

    switch (parts[0]) {
      case '/help':
        console.log(`
  \x1b[1m命令\x1b[0m
    /help           显示帮助
    /plan [cmd]     计划管理 (new|add|done|skip|approve|show|clear)
    /todos [cmd]    待办事项 (add|done|clear)
    /tasks [cmd]    持久任务 (add|done|clear)
    /agents [cmd]   Agent 管理 (spawn|kill)
    /init [--force] 分析项目并生成 CLAUDE.md
    /context        显示上下文窗口使用情况
    /mode [mode]    查看/切换模式 (plan|agent|yolo)
    /model          显示当前模型
    /memory         显示记忆统计
    /skills         列出所有技能
    /stats          显示 Token 用量
    /clear          清空对话历史
    /compact        压缩上下文历史
    /undo           回滚上一次文件编辑
    /backtrack      回退到上一个用户 prompt（Esc-Esc）
    /restore [id]   恢复到指定快照
    /fork [desc]    在当前点分叉会话
    /timeline       显示会话时间线
    /checkpoints    列出最近的文件快照
    /resume         恢复上一个会话
    /sessions       列出历史会话
    /chapter <name> 添加上下文章节
    /thinking       切换思考模式
    /team           列出专家开发团队
    /commands       列出可用 Slash 命令
    /mcp            显示 MCP 服务器状态
    /review         代码审查
    /rlm [cmd]      RLM 递归 LM 管理 (open|list|close)
    /audit [cmd]    审计日志 (report|query|export)
    /sandbox        沙箱状态
    /constitution   宪法系统摘要
    /diagnostics    LSP 诊断状态
    /quit           退出

  \x1b[1mSlash 命令\x1b[0m
    /<command>      执行 Slash 命令（如 /review, /commit, /pr）

  \x1b[1m快捷键\x1b[0m
    Tab             切换模式 (plan → agent → yolo)
    Shift+Tab       切换推理强度 (off → high → max)
    Ctrl+K          命令面板
    Ctrl+L          清屏（保留会话）
    Ctrl+C          中断当前操作 / 退出
    Ctrl+D          退出
    F1              切换到 Plan 模式
    F2              切换到 Agent 模式
    F3              切换到 YOLO 模式
    F4              切换思考模式
    F5              切换到 mimo-v2.5-pro 模型
    F6              切换到 mimo-v2.5 模型
`);
        break;

      case '/mode':
        if (parts[1] && ['plan', 'agent', 'yolo'].includes(parts[1])) {
          this.config.agent.mode = parts[1] as any;
          this.yoloMode = parts[1] === 'yolo';
          this.refreshBar();
        } else {
          printInfo(`当前模式: ${this.yoloMode ? 'yolo' : this.config.agent.mode}`);
          printInfo(`快捷键: F1=plan F2=agent F3=yolo F4=thinking`);
        }
        break;

      case '/model':
        printInfo(`当前模型: ${this.config.api.model}`);
        break;

      case '/memory': {
        const memories = await this.memory.list();
        printInfo(`共 ${memories.length} 条记忆`);
        const byType: Record<string, number> = {};
        for (const m of memories) {
          byType[m.type] = (byType[m.type] || 0) + 1;
        }
        for (const [type, count] of Object.entries(byType)) {
          console.log(`    ${type}: ${count}`);
        }
        for (const m of memories.slice(0, 5)) {
          console.log(`    [${m.type}] ${m.id} - ${m.description}`);
        }
        if (memories.length > 5) {
          console.log(`    ... 还有 ${memories.length - 5} 条`);
        }
        break;
      }

      case '/skills': {
        const categories = this.skills.getCategories();
        const totalSkills = this.skills.listSkills().length;
        printInfo(`共 ${totalSkills} 个技能，${categories.length} 个类别`);
        console.log('');
        for (const cat of categories) {
          const catSkills = this.skills.listSkills(cat);
          console.log(`  \x1b[1m${cat}\x1b[0m`);
          for (const s of catSkills) {
            console.log(`    ${s.icon} ${s.id} - ${s.description}`);
          }
          console.log('');
        }
        break;
      }

      case '/stats': {
        const stats = this.apiClient.getUsageStats();
        const budget = this.apiClient.getBudgetInfo();
        printUsageStats(stats, budget);
        break;
      }

      case '/clear':
        this.conversationHistory = [];
        this.turnCount = 0;
        this.errorCount = 0;
        this.chapters = [];
        printSuccess('对话历史已清空');
        break;

      case '/compact': {
        printInfo('正在压缩上下文...');
        const compressed = await this.compressor.compress(this.conversationHistory);
        this.conversationHistory = compressed.preservedMessages;
        printSuccess(`已压缩 ${compressed.compressedCount} 条消息`);
        break;
      }

      case '/resume':
        await this.resumeSession();
        break;

      case '/sessions': {
        try {
          const files = await fs.readdir(SESSIONS_DIR);
          const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse().slice(0, 10);
          if (jsonFiles.length === 0) {
            printInfo('无历史会话');
            break;
          }
          for (const file of jsonFiles) {
            try {
              const raw = await fs.readFile(path.join(SESSIONS_DIR, file), 'utf-8');
              const s = JSON.parse(raw) as SessionData;
              const age = Date.now() - new Date(s.startedAt).getTime();
              const ageStr = age < 3600000 ? `${Math.round(age / 60000)}分钟前` : `${Math.round(age / 3600000)}小时前`;
              console.log(`  ${s.id} | ${ageStr} | ${s.turnCount}轮 | ${s.modifiedFiles.length}文件`);
            } catch { /* skip */ }
          }
        } catch {
          printInfo('无历史会话');
        }
        break;
      }

      case '/chapter': {
        const title = parts.slice(1).join(' ') || `章节 ${this.chapters.length + 1}`;
        this.chapters.push({
          title,
          startIndex: this.conversationHistory.length,
        });
        printChapter(title);
        printSuccess(`已添加章节: ${title}`);
        break;
      }

      case '/thinking':
        this.thinkingEnabled = !this.thinkingEnabled;
        this.thinkingExplicitlyDisabled = !this.thinkingEnabled;
        printSuccess(`思考模式: ${this.thinkingEnabled ? '开启' : '关闭'}`);
        if (!this.thinkingEnabled) {
          printInfo('编程任务仍会自动启用思考模式');
        }
        break;

      case '/plan': {
        const planCmd = parts[1] || 'show';
        switch (planCmd) {
          case 'show':
            this.renderPlan();
            break;
          case 'new': {
            const title = parts.slice(2).join(' ') || '操作计划';
            this.currentPlan = {
              title,
              steps: [],
              createdAt: new Date().toISOString(),
              approved: false,
            };
            this.config.agent.mode = 'plan';
            printSuccess(`已创建计划: ${title}`);
            this.refreshBar();
            break;
          }
          case 'approve':
            if (this.currentPlan) {
              this.currentPlan.approved = true;
              this.config.agent.mode = 'agent';
              this.yoloMode = false;
              printSuccess('计划已批准，切换回 agent 模式');
              this.refreshBar();
            } else {
              printWarning('当前无计划');
            }
            break;
          case 'add': {
            const desc = parts.slice(2).join(' ');
            if (desc && this.currentPlan) {
              this.currentPlan.steps.push({ description: desc, status: 'pending' });
              printSuccess(`已添加步骤: ${desc}`);
            } else if (!desc) {
              printWarning('用法: /plan add <步骤描述>');
            } else {
              this.enterPlanMode();
              this.currentPlan!.steps.push({ description: desc, status: 'pending' });
              printSuccess(`已添加步骤: ${desc}`);
            }
            break;
          }
          case 'done': {
            const idx = parseInt(parts[2]) - 1;
            if (this.currentPlan && idx >= 0 && idx < this.currentPlan.steps.length) {
              this.currentPlan.steps[idx].status = 'done';
              printSuccess(`步骤 ${idx + 1} 已完成`);
              this.refreshBar();
            } else if (!this.currentPlan) {
              printWarning('当前无计划');
            } else {
              printWarning(`无效的步骤编号: ${parts[2]}`);
            }
            break;
          }
          case 'skip': {
            const skipIdx = parseInt(parts[2]) - 1;
            if (this.currentPlan && skipIdx >= 0 && skipIdx < this.currentPlan.steps.length) {
              this.currentPlan.steps[skipIdx].status = 'skipped';
              printSuccess(`步骤 ${skipIdx + 1} 已跳过`);
              this.refreshBar();
            } else if (!this.currentPlan) {
              printWarning('当前无计划');
            } else {
              printWarning(`无效的步骤编号: ${parts[2]}`);
            }
            break;
          }
          case 'clear':
            this.currentPlan = null;
            printSuccess('计划已清除');
            this.refreshBar();
            break;
          default:
            printInfo('用法: /plan [show|new <title>|add <desc>|done <n>|skip <n>|approve|clear]');
        }
        break;
      }

      case '/agents': {
        const agentCmd = parts[1] || 'show';
        switch (agentCmd) {
          case 'spawn': {
            const prompt = parts.slice(2).join(' ');
            if (!prompt) {
              printWarning('用法: /agents spawn <任务描述>');
              break;
            }
            printInfo('正在生成子代理...');
            try {
              const result = await this.subagentManager.spawn(prompt);
              printSuccess(`子代理完成 (${result.turnsUsed} 轮, ${result.toolsCalled} 工具调用)`);
              if (result.output) {
                console.log(`  ${GRAY(result.output.slice(0, 500))}${result.output.length > 500 ? '...' : ''}`);
              }
            } catch (err: any) {
              printError(`子代理失败: ${err.message}`);
            }
            this.refreshBar();
            break;
          }
          case 'kill': {
            const agentId = parts[2];
            if (!agentId) {
              printWarning('用法: /agents kill <agent-id>');
              break;
            }
            try {
              await this.subagentManager.shutdown(agentId);
              printSuccess(`已终止子代理: ${agentId}`);
            } catch (err: any) {
              printError(`终止失败: ${err.message}`);
            }
            this.refreshBar();
            break;
          }
          default: {
            console.log(`\n  ${CYAN('\u{1F916}')} ${B(WHITE('Agents'))}\n`);

            // Active subagents
            const activeAgents = this.subagentManager.getActiveAgents();
            if (activeAgents.length > 0) {
              console.log(`  ${B(GREEN('Active subagents:'))}`);
              for (const a of activeAgents) {
                const statusColor = a.status === 'running' ? GREEN : a.status === 'idle' ? YELLOW : GRAY;
                console.log(`    ${statusColor('●')} ${ORANGE(a.id)}: ${GRAY(`"${a.label}"`)} — ${statusColor(a.status)}`);
              }
              console.log('');
            }

            // Dynamic agents
            if (this.dynamicAgents) {
              const agents = this.dynamicAgents.listAgents();
              if (agents.length > 0) {
                console.log(`  ${B(ORANGE('Dynamic agents:'))}`);
                for (const a of agents) {
                  console.log(`    ${GRAY('•')} ${ORANGE(a.name)} — ${GRAY(a.description)}${a.triggers ? ` ${GRAY_DIM(`[${a.triggers.join(', ')}]`)}` : ''}`);
                }
                console.log('');
              }
            }

            // Expert agents
            const categories = getAgentCategories();
            const categoryNames: Record<string, string> = {
              desktop: '桌面平台',
              mobile: '移动平台',
              gaming: '游戏开发',
              specialized: '专业领域',
              devops: '游戏运维',
            };
            const expertCount = listExpertAgents().length;
            console.log(`  ${B(ORANGE('Expert agents:'))} ${GRAY_DIM(`(${expertCount} 位专家)`)}\n`);
            for (const cat of categories) {
              const experts = listExpertAgents(cat);
              console.log(`  ${ORANGE(categoryNames[cat] || cat)}`);
              for (const e of experts) {
                console.log(`    ${GRAY('•')} ${ORANGE(e.id.padEnd(30))} ${GRAY(e.description)}`);
              }
              console.log('');
            }

            if (activeAgents.length === 0 && (!this.dynamicAgents || this.dynamicAgents.listAgents().length === 0)) {
              printInfo('输入 /agents spawn <任务> 生成子代理');
            }
          }
        }
        break;
      }

      case '/todos': {
        const todoCmd = parts[1] || 'show';
        switch (todoCmd) {
          case 'show':
            this.renderTodos();
            break;
          case 'add': {
            const text = parts.slice(2).join(' ');
            if (!text) {
              printWarning('用法: /todos add <待办内容>');
              break;
            }
            this.todos.push({ text, done: false });
            printSuccess(`已添加待办: ${text}`);
            this.refreshBar();
            break;
          }
          case 'done': {
            const todoIdx = parseInt(parts[2]) - 1;
            if (todoIdx >= 0 && todoIdx < this.todos.length) {
              this.todos[todoIdx].done = true;
              printSuccess(`待办 ${todoIdx + 1} 已完成`);
              this.refreshBar();
            } else {
              printWarning(`无效的待办编号: ${parts[2]}`);
            }
            break;
          }
          case 'clear':
            this.todos = [];
            printSuccess('待办已全部清除');
            this.refreshBar();
            break;
          default:
            printInfo('用法: /todos [show|add <text>|done <n>|clear]');
        }
        break;
      }

      case '/tasks': {
        const taskCmd = parts[1] || 'show';
        switch (taskCmd) {
          case 'show':
            await this.renderTasks();
            break;
          case 'add': {
            const subject = parts.slice(2).join(' ');
            if (!subject) {
              printWarning('用法: /tasks add <任务标题>');
              break;
            }
            try {
              const task = await this.taskManager.create(subject, '');
              printSuccess(`已创建任务 #${task.id}: ${task.subject}`);
              this.refreshBar();
            } catch (err: any) {
              printError(`创建任务失败: ${err.message}`);
            }
            break;
          }
          case 'done': {
            const taskId = parts[2];
            if (!taskId) {
              printWarning('用法: /tasks done <id>');
              break;
            }
            try {
              const updated = await this.taskManager.update(taskId, { status: 'completed' });
              if (updated) {
                printSuccess(`任务 #${taskId} 已完成`);
                this.refreshBar();
              } else {
                printWarning(`任务 #${taskId} 不存在`);
              }
            } catch (err: any) {
              printError(`更新失败: ${err.message}`);
            }
            break;
          }
          case 'clear': {
            const completed = this.taskManager.list({ status: 'completed' });
            for (const t of completed) {
              await this.taskManager.delete(t.id);
            }
            printSuccess(`已清除 ${completed.length} 个已完成任务`);
            this.refreshBar();
            break;
          }
          default:
            printInfo('用法: /tasks [show|add <subject>|done <id>|clear]');
        }
        break;
      }

      case '/team': {
        const categories = getAgentCategories();
        const categoryNames: Record<string, string> = {
          desktop: '桌面平台',
          mobile: '移动平台',
          gaming: '游戏开发',
          specialized: '专业领域',
          devops: '游戏运维',
        };
        console.log(`\n  ${ORANGE('专家开发团队')} ${GRAY_DIM(`(${listExpertAgents().length} 位专家)`)}\n`);
        for (const cat of categories) {
          const experts = listExpertAgents(cat);
          console.log(`  ${ORANGE(categoryNames[cat] || cat)}`);
          for (const e of experts) {
            console.log(`    ${GRAY('•')} ${ORANGE(e.id.padEnd(30))} ${GRAY(e.description)}`);
          }
          console.log('');
        }
        printInfo('输入相关关键词自动匹配专家。如："帮我开发一个 Android 应用"');
        break;
      }

      case '/commands': {
        if (!this.slashCommands) {
          printInfo('Slash 命令系统未启用');
          break;
        }
        const cmds = this.slashCommands.listCommands();
        console.log(`\n  共 ${cmds.length} 个命令\n`);
        for (const c of cmds) {
          const cat = c.category ? `[${c.category}]` : '';
          console.log(`  /${c.name} ${cat} - ${c.description}`);
        }
        break;
      }

      case '/mcp': {
        if (!this.mcpClient) {
          printInfo('MCP 未启用');
          break;
        }
        const status = this.mcpClient.getStatus();
        if (status.length === 0) {
          printInfo('无 MCP 服务器');
        } else {
          for (const s of status) {
            const icon = s.connected ? '🟢' : '🔴';
            console.log(`  ${icon} ${s.name} - ${s.toolCount} 个工具`);
          }
        }
        const mcpTools = this.tools.getExternalTools();
        if (mcpTools.length > 0) {
          console.log(`\n  已注入 ${mcpTools.length} 个 MCP 工具到代理`);
        }
        break;
      }

      case '/init': {
        printInfo('正在分析项目...');
        const projectDir = process.cwd();
        const projectInfo = await analyzeProject(projectDir);
        const claudeMd = generateClaudeMd(projectInfo);
        const outputPath = path.join(projectDir, 'CLAUDE.md');

        try {
          await fs.access(outputPath);
          printWarning('CLAUDE.md 已存在。使用 --force 覆盖。');
          if (parts[1] !== '--force') break;
        } catch { /* not exists, ok */ }

        await fs.writeFile(outputPath, claudeMd, 'utf-8');
        printSuccess(`已生成 CLAUDE.md (${projectInfo.languages.join(', ')})`);
        printInfo(`  语言: ${projectInfo.languages.join(', ') || '未检测到'}`);
        printInfo(`  框架: ${projectInfo.frameworks.join(', ') || '未检测到'}`);
        printInfo(`  包管理: ${projectInfo.packageManager}`);
        if (projectInfo.buildCommand) printInfo(`  构建: ${projectInfo.buildCommand}`);
        if (projectInfo.testCommand) printInfo(`  测试: ${projectInfo.testCommand}`);
        break;
      }

      case '/context': {
        const msgCount = this.conversationHistory.length;
        const estimatedTokens = this.compressor.estimateTokens(this.conversationHistory);
        const maxTokens = 200000;
        const pct = Math.round((estimatedTokens / maxTokens) * 100);
        const checkpoints = this.checkpoint.list();

        console.log(`  ${ORANGE('Context Window')}`);
        console.log(`  消息: ${msgCount} 条`);
        console.log(`  Token: ~${estimatedTokens.toLocaleString()} / ${maxTokens.toLocaleString()} (${pct}%)`);
        console.log(`  Checkpoint: ${checkpoints.length} 个`);
        console.log(`  修改文件: ${this.modifiedFiles.size} 个`);
        if (this.modifiedFiles.size > 0) {
          for (const f of this.modifiedFiles) {
            console.log(`    ${f}`);
          }
        }
        break;
      }

      case '/undo': {
        try {
          const reverted = await this.checkpoint.revertLast();
          printSuccess(`已回滚 ${reverted.length} 个文件:`);
          for (const f of reverted) {
            printInfo(`  ${f}`);
          }
        } catch (err: any) {
          printWarning(err.message);
        }
        break;
      }

      case '/checkpoints': {
        const cps = this.checkpoint.recent(10);
        if (cps.length === 0) {
          printInfo('无 checkpoint');
          break;
        }
        console.log(`  最近 ${cps.length} 个 checkpoint:`);
        for (const cp of cps) {
          const time = new Date(cp.timestamp).toLocaleTimeString();
          console.log(`  ${cp.id} | ${time} | ${cp.description} | ${cp.files.length}文件`);
        }
        break;
      }

      case '/quit':
      case '/exit':
        return 'quit';

      // ── New commands (CodeWhale parity) ──

      case '/backtrack': {
        const removed = this.sessionRollback.backtrackToLastUserPrompt();
        if (removed) {
          // Remove last assistant message from conversation
          const lastIdx = this.conversationHistory.length - 1;
          if (lastIdx >= 0 && this.conversationHistory[lastIdx].role === 'assistant') {
            this.conversationHistory.pop();
          }
          printSuccess(`已回退到上一个用户 prompt（Turn ${removed.turnIndex}）`);
        } else {
          printWarning('无法回退：已经是第一个 turn');
        }
        break;
      }

      case '/restore': {
        const snapshotId = parts[1];
        try {
          const { restored, snapshotId: sid } = await this.enhancedSandbox.restoreSnapshot(snapshotId);
          printSuccess(`已恢复到快照 ${sid}（${restored.length} 个文件）`);
          for (const f of restored.slice(0, 10)) {
            printInfo(`  ${f}`);
          }
          if (restored.length > 10) printInfo(`  ... 还有 ${restored.length - 10} 个`);
        } catch (err: any) {
          printWarning(err.message);
        }
        break;
      }

      case '/fork': {
        const desc = parts.slice(1).join(' ') || `Fork at turn ${this.turnCount}`;
        try {
          const fork = await this.sessionRollback.forkAtTurn(
            this.sessionRollback.getCurrentTurnIndex(),
            desc,
            this.conversationHistory
          );
          printSuccess(`已分叉会话: ${fork.forkId}`);
          printInfo(`  描述: ${fork.description}`);
          printInfo(`  文件: ${fork.filesModified.length} 个`);
        } catch (err: any) {
          printWarning(err.message);
        }
        break;
      }

      case '/timeline': {
        const maxEntries = parseInt(parts[1]) || 20;
        console.log(this.sessionRollback.formatTimeline(maxEntries));
        break;
      }

      case '/rlm': {
        const rlmCmd = parts[1] || 'list';
        switch (rlmCmd) {
          case 'open': {
            if (!this.rlmManager.isAvailable()) {
              printWarning('Python 不可用，无法启动 RLM');
              break;
            }
            try {
              const sessionId = await this.rlmManager.open(parts.slice(2).join(' '));
              printSuccess(`RLM 会话已开启: ${sessionId}`);
            } catch (err: any) {
              printError(err.message);
            }
            break;
          }
          case 'list': {
            const sessions = this.rlmManager.list();
            if (sessions.length === 0) {
              printInfo('无活跃 RLM 会话。使用 /rlm open 开启。');
            } else {
              console.log(`\n  ${ORANGE('RLM Sessions')} (${sessions.length})\n`);
              for (const s of sessions) {
                console.log(`  ${GREEN('●')} ${ORANGE(s.id)} — ${s.status} | ${s.executionCount} 次执行`);
              }
            }
            break;
          }
          case 'close': {
            const sessionId = parts[2];
            if (!sessionId) { printWarning('用法: /rlm close <session-id>'); break; }
            await this.rlmManager.close(sessionId);
            printSuccess(`RLM 会话 ${sessionId} 已关闭`);
            break;
          }
          case 'help':
            console.log(this.rlmManager.getBuiltinCapabilities());
            break;
          default:
            printInfo('用法: /rlm [open|list|close <id>|help]');
        }
        break;
      }

      case '/audit': {
        const auditCmd = parts[1] || 'report';
        switch (auditCmd) {
          case 'report':
            console.log(this.auditLogger.formatReport());
            break;
          case 'query': {
            const filters: any = {};
            if (parts[2]) filters.eventTypes = [parts[2]];
            if (parts[3]) filters.severities = [parts[3]];
            filters.limit = parseInt(parts[4]) || 20;
            const entries = this.auditLogger.query(filters);
            if (entries.length === 0) {
              printInfo('无匹配的审计条目');
            } else {
              for (const e of entries) {
                const time = new Date(e.timestamp).toLocaleTimeString();
                console.log(`  ${time} [${e.severity}] ${e.eventType}: ${e.action} → ${e.outcome}`);
              }
            }
            break;
          }
          case 'export': {
            const format = parts[2] || 'json';
            if (format === 'csv') {
              const filePath = await this.auditLogger.exportCsv();
              printSuccess(`已导出 CSV: ${filePath}`);
            } else {
              const filePath = await this.auditLogger.exportJson();
              printSuccess(`已导出 JSON: ${filePath}`);
            }
            break;
          }
          default:
            printInfo('用法: /audit [report|query [type] [severity] [limit]|export [json|csv]]');
        }
        break;
      }

      case '/sandbox': {
        console.log(this.enhancedSandbox.formatStatus());
        const violations = this.enhancedSandbox.getViolations();
        if (violations.length > 0) {
          console.log(`\n  最近违规 (${Math.min(violations.length, 5)}):`);
          for (const v of violations.slice(-5)) {
            console.log(`    [${v.severity}] ${v.rule}: ${v.detail}`);
          }
        }
        break;
      }

      case '/constitution': {
        console.log(this.charter.getSummary());
        break;
      }

      case '/diagnostics': {
        const servers = this.diagnosticsManager.getAvailableServers();
        console.log(`\n  ${ORANGE('LSP Diagnostics')}\n`);
        for (const s of servers) {
          const icon = s.available ? GREEN('●') : GRAY('○');
          console.log(`  ${icon} ${s.name} (${s.id}) — ${s.available ? '可用' : '不可用'}`);
        }
        const summary = this.diagnosticsManager.getSummary();
        console.log(`\n  最近: ${summary.filesChecked} 文件, ${summary.totalErrors} 错误, ${summary.totalWarnings} 警告`);
        console.log(`  自动诊断: ${this.diagnosticsManager.isAutoRunEnabled() ? '开启' : '关闭'}`);
        break;
      }

      default:
        // 尝试作为 slash 命令处理
        if (this.slashCommands) {
          const slashName = parts[0].slice(1); // 去掉 /
          const cmd = this.slashCommands.getCommand(slashName);
          if (cmd) {
            const args = parts.slice(1).join(' ');
            let prompt = cmd.prompt;
            if (args) {
              prompt = prompt.replace(/\{\{args\}\}/g, args).replace(/\$ARGUMENTS/g, args);
            }
            printInfo(`执行 /${slashName}: ${cmd.description}`);
            await this.processUserInput(prompt);
            break;
          }
        }
        printWarning(`未知命令: ${parts[0]}。输入 /help 查看帮助。`);
    }
  }

  // ── 检测当前项目 ──────────────────────────────
  // ── 底部状态栏 ──────────────────────────────────
  private showBottomBar(): void {
    const stats = this.apiClient.getUsageStats();
    const barState = this.buildBottomBarState(stats);
    printBottomBar(barState);
  }

  private refreshBar(): void {
    const stats = this.apiClient.getUsageStats();
    const barState = this.buildBottomBarState(stats);
    drawBottomBar(barState);
  }

  private buildBottomBarState(stats: any): BottomBarState {
    const taskProgress = this.taskManager.getProgress();
    const activeAgents = this.subagentManager.getAgentCount();
    let planProgress: string | undefined;
    if (this.currentPlan && this.currentPlan.steps.length > 0) {
      const done = this.currentPlan.steps.filter(s => s.status === 'done').length;
      planProgress = `${done}/${this.currentPlan.steps.length}`;
    }
    return {
      mode: this.yoloMode ? 'yolo' : this.config.agent.mode as any,
      model: this.config.api.model,
      thinking: this.thinkingEnabled,
      turnCount: this.turnCount,
      tokenUsed: stats.inputTokens + stats.outputTokens,
      tasksCompleted: taskProgress.completed,
      tasksTotal: taskProgress.total,
      activeAgents,
      planProgress,
    };
  }

  // 处理功能键快捷键（静默切换，只刷新底部栏，不影响对话）
  private handleFunctionKey(key: string): boolean {
    switch (key) {
      case 'F1':
        this.auditLogger.logModeChange(this.config.agent.mode, 'plan');
        this.config.agent.mode = 'plan';
        this.yoloMode = false;
        this.refreshBar();
        return true;
      case 'F2':
        this.auditLogger.logModeChange(this.config.agent.mode, 'agent');
        this.config.agent.mode = 'agent';
        this.yoloMode = false;
        this.refreshBar();
        return true;
      case 'F3':
        this.auditLogger.logModeChange(this.config.agent.mode, 'yolo');
        this.config.agent.mode = 'yolo';
        this.yoloMode = true;
        this.refreshBar();
        return true;
      case 'F4':
        this.thinkingEnabled = !this.thinkingEnabled;
        this.refreshBar();
        return true;
      case 'F5':
        this.config.api.model = 'mimo-v2.5-pro';
        this.refreshBar();
        return true;
      case 'F6':
        this.config.api.model = 'mimo-v2.5';
        this.refreshBar();
        return true;
    }
    return false;
  }

  // ── Tab: Cycle mode (plan → agent → yolo) ─────────────────────────
  private cycleMode(): void {
    const modes = ['plan', 'agent', 'yolo'] as const;
    const currentIdx = modes.indexOf(this.config.agent.mode as any);
    const nextIdx = (currentIdx + 1) % modes.length;
    const nextMode = modes[nextIdx];

    this.auditLogger.logModeChange(this.config.agent.mode, nextMode);
    this.config.agent.mode = nextMode;
    this.yoloMode = nextMode === 'yolo';
    this.refreshBar();

    if (!this.nonInteractive) {
      const modeLabels: Record<string, string> = { plan: 'Plan', agent: 'Agent', yolo: 'YOLO' };
      const modeColors: Record<string, string> = { plan: '\x1b[33m', agent: '\x1b[32m', yolo: '\x1b[31m' };
      process.stdout.write(`\r  ${modeColors[nextMode]}${modeLabels[nextMode]}\x1b[0m mode\x1b[K\n`);
    }
  }

  // ── Shift+Tab: Toggle reasoning effort ─────────────────────────────
  private toggleReasoningEffort(): void {
    this.thinkingEnabled = !this.thinkingEnabled;
    this.refreshBar();
    if (!this.nonInteractive) {
      const label = this.thinkingEnabled ? '\x1b[32mhigh' : '\x1b[90moff';
      process.stdout.write(`\r  \x1b[38;2;255;165;0mReasoning:\x1b[0m ${label}\x1b[0m\x1b[K\n`);
    }
  }

  // ── Ctrl+K: Command Palette ────────────────────────────────────────
  private showCommandPalette(): void {
    const w = Math.max(40, Math.min(80, process.stdout.columns || 80));
    const commands = [
      { key: '/help', desc: '显示帮助' },
      { key: '/mode', desc: '切换模式' },
      { key: '/model', desc: '显示模型' },
      { key: '/skills', desc: '技能列表' },
      { key: '/memory', desc: '记忆管理' },
      { key: '/stats', desc: 'Token 用量' },
      { key: '/clear', desc: '清空对话' },
      { key: '/compact', desc: '压缩上下文' },
      { key: '/undo', desc: '回滚编辑' },
      { key: '/backtrack', desc: '回退 prompt' },
      { key: '/timeline', desc: '会话时间线' },
      { key: '/checkpoints', desc: '快照列表' },
      { key: '/rlm', desc: 'RLM 管理' },
      { key: '/audit', desc: '审计日志' },
      { key: '/sandbox', desc: '沙箱状态' },
      { key: '/diagnostics', desc: 'LSP 诊断' },
      { key: '/constitution', desc: '宪法系统' },
      { key: '/agents', desc: 'Agent 管理' },
      { key: '/commands', desc: 'Slash 命令' },
      { key: '/mcp', desc: 'MCP 状态' },
      { key: '/init', desc: '生成 CLAUDE.md' },
      { key: '/resume', desc: '恢复会话' },
      { key: '/sessions', desc: '历史会话' },
      { key: '/quit', desc: '退出' },
    ];

    console.log('');
    console.log(`  \x1b[38;2;255;165;0m┏━━\x1b[0m \x1b[1m\x1b[97mCommand Palette\x1b[0m \x1b[38;2;255;165;0m${'━'.repeat(w - 22)}\x1b[0m`);
    for (const cmd of commands) {
      console.log(`  \x1b[38;2;255;165;0m┃\x1b[0m  \x1b[38;2;255;195;51m${cmd.key.padEnd(18)}\x1b[0m \x1b[90m${cmd.desc}\x1b[0m`);
    }
    console.log(`  \x1b[38;2;255;165;0m┗${'━'.repeat(w - 4)}\x1b[0m`);
    console.log('');
  }

  private detectProject(): string | undefined {
    const cwd = process.cwd();
    const parts = cwd.split(/[/\\]/);
    return parts[parts.length - 1] || undefined;
  }

  // ── 欢迎面板（CodeWhale 风格）──────────────────────
  private printWelcomePanel(): void {
    const w = Math.max(40, Math.min(120, process.stdout.columns || 80));
    const mode = this.yoloMode ? 'yolo' : this.config.agent.mode;
    const thinking = this.thinkingEnabled ? 'high' : 'auto';

    console.log('');
    console.log(`  \x1b[38;2;255;165;0m━\x1b[0m`.repeat(w - 4));
    console.log(`  \x1b[1mMIMO CLI Code\x1b[0m \x1b[90mv1.0.0\x1b[0m \x1b[90m·\x1b[0m \x1b[90m${this.config.api.model}\x1b[0m`);
    console.log(`  \x1b[90mTab:mode T:reasoning Ctrl+K:commands /help\x1b[0m`);
    console.log(`  \x1b[38;2;255;165;0m━\x1b[0m`.repeat(w - 4));
    console.log('');
  }

  // ── 状态摘要（输入提示上方）──────────────────
  private printStatusSummary(): void {
    const lines: string[] = [];

    // Plan status
    if (this.currentPlan && this.currentPlan.steps.length > 0) {
      const done = this.currentPlan.steps.filter(s => s.status === 'done').length;
      const total = this.currentPlan.steps.length;
      lines.push(`  \u{1F4CB} Plan: ${total} steps (${done} done)`);
    }

    // Task status
    const taskProgress = this.taskManager.getProgress();
    if (taskProgress.total > 0) {
      lines.push(`  ✅ Tasks: ${taskProgress.completed}/${taskProgress.total}`);
    }

    // Todo status
    if (this.todos.length > 0) {
      const todoDone = this.todos.filter(t => t.done).length;
      lines.push(`  \u{1F4DD} Todos: ${todoDone}/${this.todos.length}`);
    }

    // Agent status
    const activeAgents = this.subagentManager.getAgentCount();
    if (activeAgents > 0) {
      lines.push(`  \u{1F916} Agents: ${activeAgents} active`);
    }

    if (lines.length > 0) {
      console.log(lines.join(' \x1b[90m|\x1b[0m '));
    }
  }

  // ── 渲染计划 ──────────────────────────────────
  private renderPlan(): void {
    if (!this.currentPlan) {
      printInfo('当前无计划。使用 /plan new <标题> 创建新计划。');
      return;
    }

    const total = this.currentPlan.steps.length;
    const done = this.currentPlan.steps.filter(s => s.status === 'done').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const barWidth = 24;
    const filled = total > 0 ? Math.round((done / total) * barWidth) : 0;
    const empty = barWidth - filled;
    const progressBar = '\x1b[38;2;255;165;0m' + '━'.repeat(filled) + '\x1b[2m\x1b[90m' + '─'.repeat(empty) + '\x1b[0m';

    console.log('');
    console.log(`  \u{1F4CB} \x1b[1m${this.currentPlan.title}\x1b[0m \x1b[90m(${done}/${total} done)\x1b[0m`);
    console.log(`  ${progressBar} ${pct}%`);
    for (let i = 0; i < this.currentPlan.steps.length; i++) {
      const step = this.currentPlan.steps[i];
      let icon: string;
      switch (step.status) {
        case 'done':
          icon = '\x1b[32m✅\x1b[0m';
          break;
        case 'skipped':
          icon = '\x1b[90m⏭\x1b[0m';
          break;
        default:
          icon = '\x1b[90m○\x1b[0m';
      }
      const numStr = step.status === 'done' ? `\x1b[90m${i + 1}.\x1b[0m` : `${i + 1}.`;
      const descColor = step.status === 'done' ? '\x1b[90m' : '';
      const descReset = step.status === 'done' ? '\x1b[0m' : '';
      console.log(`  ${icon} ${numStr} ${descColor}${step.description}${descReset}`);
    }
    console.log('');
  }

  // ── 渲染待办 ──────────────────────────────────
  private renderTodos(): void {
    if (this.todos.length === 0) {
      printInfo('无待办事项。使用 /todos add <内容> 添加。');
      return;
    }

    const done = this.todos.filter(t => t.done).length;
    console.log('');
    console.log(`  \u{1F4DD} Todos (${done}/${this.todos.length} done)`);
    for (let i = 0; i < this.todos.length; i++) {
      const todo = this.todos[i];
      const icon = todo.done ? '\x1b[32m✅\x1b[0m' : '\x1b[90m○\x1b[0m';
      const textColor = todo.done ? '\x1b[90m' : '';
      const textReset = todo.done ? '\x1b[0m' : '';
      console.log(`  ${icon} ${textColor}${todo.text}${textReset}`);
    }
    console.log('');
  }

  // ── 渲染任务 ──────────────────────────────────
  private async renderTasks(): Promise<void> {
    const tasks = this.taskManager.list();
    if (tasks.length === 0) {
      printInfo('无持久任务。使用 /tasks add <标题> 创建。');
      return;
    }

    const progress = this.taskManager.getProgress();
    console.log('');
    console.log(`  ✅ Tasks (${progress.completed}/${progress.total} completed)`);
    for (const task of tasks) {
      let icon: string;
      let statusColor: string;
      switch (task.status) {
        case 'completed':
          icon = '\x1b[32m✅\x1b[0m';
          statusColor = '\x1b[90m';
          break;
        case 'in_progress':
          icon = '\x1b[33m\u{1F504}\x1b[0m';
          statusColor = '';
          break;
        default:
          icon = '\x1b[90m○\x1b[0m';
          statusColor = '';
      }
      const owner = task.owner ? ` \x1b[90m(assigned: ${task.owner})\x1b[0m` : '';
      const resetColor = statusColor ? '\x1b[0m' : '';
      console.log(`  ${icon} ${statusColor}#${task.id} ${task.subject}${resetColor}${owner}`);
    }
    console.log('');
  }
}
