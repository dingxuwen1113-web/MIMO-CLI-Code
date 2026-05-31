import * as readline from 'readline';
import * as fs from 'fs/promises';
import * as path from 'path';
import createDebug from 'debug';
import { AgentState, SessionData } from './types';
import { PlanManager } from './plan-manager';
import { printSuccess, printWarning, printInfo, printError, printChapter } from '../tui/output';

const debug = createDebug('mimo:command');

/**
 * Handles all slash commands (/help, /mode, /plan, etc.)
 * Extracted from the massive agent.ts switch statement.
 */
export class CommandHandler {
  private state: AgentState;
  private planManager: PlanManager;

  constructor(state: AgentState, planManager: PlanManager) {
    this.state = state;
    this.planManager = planManager;
  }

  /**
   * Process a slash command. Returns 'quit' to exit, or void to continue.
   */
  async handle(input: string, rl: readline.Interface): Promise<string | void> {
    const cmd = input.trim().toLowerCase();
    const parts = cmd.split(/\s+/);

    debug('Handling command: %s', parts[0]);

    switch (parts[0]) {
      case '/help':
        return this.showHelp();
      case '/mode':
        return this.handleMode(parts);
      case '/model':
        return this.handleModel();
      case '/memory':
        return this.handleMemory();
      case '/skills':
        return this.handleSkills();
      case '/stats':
        return this.handleStats();
      case '/clear':
        return this.handleClear();
      case '/compact':
        return this.handleCompact();
      case '/resume':
        return this.handleResume();
      case '/chapter':
        return this.handleChapter(parts);
      case '/thinking':
        return this.handleThinking();
      case '/plan':
        return this.handlePlan(parts);
      case '/agents':
        return this.handleAgents(parts);
      case '/todos':
        return this.handleTodos(parts);
      case '/tasks':
        return this.handleTasks(parts);
      case '/team':
        return this.handleTeam();
      case '/commands':
        return this.handleCommands();
      case '/mcp':
        return this.handleMcp();
      case '/init':
        return this.handleInit(parts);
      case '/context':
        return this.handleContext();
      case '/undo':
        return this.handleUndo();
      case '/checkpoints':
        return this.handleCheckpoints();
      case '/quit':
      case '/exit':
        return 'quit';
      case '/backtrack':
        return this.handleBacktrack();
      case '/restore':
        return this.handleRestore(parts);
      case '/fork':
        return this.handleFork(parts);
      case '/timeline':
        return this.handleTimeline(parts);
      case '/rlm':
        return this.handleRLM(parts);
      case '/audit':
        return this.handleAudit(parts);
      case '/sandbox':
        return this.handleSandbox();
      case '/constitution':
        return this.handleConstitution();
      case '/diagnostics':
        return this.handleDiagnostics();
      default:
        return this.handleUnknown(parts);
    }
  }

  // ─── Command Implementations ─────────────────────────────────────

  private showHelp(): void {
    console.log(`
  \x1b[1m命令 / Commands\x1b[0m
    /help           显示帮助 / Show help
    /plan [cmd]     计划管理 / Plan management (new|add|done|skip|approve|show|clear)
    /todos [cmd]    待办事项 / Todos (add|done|clear)
    /tasks [cmd]    持久任务 / Tasks (add|done|clear)
    /agents [cmd]   Agent 管理 / Agent management (spawn|kill)
    /init [--force] 分析项目并生成 CLAUDE.md / Generate CLAUDE.md
    /context        显示上下文窗口使用情况 / Show context usage
    /mode [mode]    查看/切换模式 / Switch mode (plan|agent|custom|yolo)
    /model          显示当前模型 / Show current model
    /memory         显示记忆统计 / Show memory stats
    /skills         列出所有技能 / List all skills
    /stats          显示 Token 用量 / Show token usage
    /clear          清空对话历史 / Clear conversation
    /compact        压缩上下文历史 / Compress context
    /undo           回滚上一次文件编辑 / Undo last file edit
    /backtrack      回退到上一个用户 prompt / Backtrack to last prompt
    /restore [id]   恢复到指定快照 / Restore snapshot
    /fork [desc]    在当前点分叉会话 / Fork session
    /timeline       显示会话时间线 / Show timeline
    /checkpoints    列出最近的文件快照 / List checkpoints
    /resume         恢复上一个会话 / Resume last session
    /sessions       列出历史会话 / List sessions
    /chapter <name> 添加上下文章节 / Add chapter
    /thinking       切换思考模式 / Toggle thinking
    /team           列出专家开发团队 / List expert team
    /commands       列出可用 Slash 命令 / List slash commands
    /mcp            显示 MCP 服务器状态 / MCP status
    /review         代码审查 / Code review
    /rlm [cmd]      RLM 递归 LM 管理 / RLM management
    /audit [cmd]    审计日志 / Audit log
    /sandbox        沙箱状态 / Sandbox status
    /constitution   宪法系统摘要 / Constitution summary
    /diagnostics    LSP 诊断状态 / LSP diagnostics
    /quit           退出 / Quit

  \x1b[1m快捷键 / Shortcuts\x1b[0m
    Tab             切换模式 (plan → agent → yolo)
    Shift+Tab       切换推理强度 (off → high → max)
    Ctrl+K          命令面板 / Command palette
    Ctrl+L          清屏 / Clear screen
    F1-F3           切换模式 / Switch mode
    F4              切换思考模式 / Toggle thinking
    F5-F6           切换模型 / Switch model
`);
  }

  private handleMode(parts: string[]): void {
    const validModes = ['plan', 'agent', 'custom', 'yolo'];
    if (parts[1] && validModes.includes(parts[1])) {
      this.state.config.agent.mode = parts[1] as any;
      this.state.yoloMode = parts[1] === 'yolo';
      printSuccess(`已切换到 ${parts[1]} 模式`);
    } else {
      printInfo(`当前模式: ${this.state.yoloMode ? 'yolo' : this.state.config.agent.mode}`);
      printInfo(`可用模式: ${validModes.join(', ')}`);
    }
  }

  private handleModel(): void {
    printInfo(`当前模型: ${this.state.config.api.model}`);
  }

  private async handleMemory(): Promise<void> {
    const memories = await this.state.memory.list();
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
  }

  private handleSkills(): void {
    const categories = this.state.skills.getCategories();
    const totalSkills = this.state.skills.listSkills().length;
    printInfo(`共 ${totalSkills} 个技能，${categories.length} 个类别`);
    console.log('');
    for (const cat of categories) {
      const catSkills = this.state.skills.listSkills(cat);
      console.log(`  \x1b[1m${cat}\x1b[0m`);
      for (const s of catSkills) {
        console.log(`    ${s.icon} ${s.id} - ${s.description}`);
      }
      console.log('');
    }
  }

  private handleStats(): void {
    const stats = this.state.apiClient.getUsageStats();
    const budget = this.state.apiClient.getBudgetInfo();
    // Use existing printUsageStats if available
    console.log(`\n  Token Usage: ${stats.inputTokens} in / ${stats.outputTokens} out`);
    if (budget) {
      console.log(`  Budget: ${budget.used || 0} used, ${budget.remaining || 0} remaining (${budget.percentUsed || 0}%)`);
    }
  }

  private handleClear(): void {
    this.state.conversationHistory = [];
    this.state.turnCount = 0;
    this.state.errorCount = 0;
    this.state.chapters = [];
    printSuccess('对话历史已清空');
  }

  private async handleCompact(): Promise<void> {
    printInfo('正在压缩上下文...');
    const compressed = await this.state.compressor.compress(this.state.conversationHistory);
    this.state.conversationHistory = compressed.preservedMessages;
    printSuccess(`已压缩 ${compressed.compressedCount} 条消息`);
  }

  private async handleResume(): Promise<void> {
    if (!this.state._recoverableSession) {
      printWarning('没有可恢复的会话');
      return;
    }
    const session = this.state._recoverableSession;
    this.state.conversationHistory = session.conversationHistory;
    this.state.turnCount = session.turnCount;
    this.state.modifiedFiles = new Set(session.modifiedFiles);
    this.state.sessionId = session.id;
    printSuccess(`已恢复会话 ${session.id} (${session.turnCount} 轮)`);
  }

  private handleChapter(parts: string[]): void {
    const title = parts.slice(1).join(' ') || `章节 ${this.state.chapters.length + 1}`;
    this.state.chapters.push({ title, startIndex: this.state.conversationHistory.length });
    printChapter(title);
    printSuccess(`已添加章节: ${title}`);
  }

  private handleThinking(): void {
    this.state.thinkingEnabled = !this.state.thinkingEnabled;
    this.state.thinkingExplicitlyDisabled = !this.state.thinkingEnabled;
    printSuccess(`思考模式: ${this.state.thinkingEnabled ? '开启' : '关闭'}`);
  }

  private handlePlan(parts: string[]): void {
    const planCmd = parts[1] || 'show';
    switch (planCmd) {
      case 'show': {
        const plan = this.planManager.getCurrent();
        if (!plan) { printInfo('当前无计划'); return; }
        const { done, total, percent } = this.planManager.getProgress();
        console.log(`\n  ${plan.title} (${done}/${total} done, ${percent}%)`);
        plan.steps.forEach((s, i) => {
          const icon = s.status === 'done' ? '✅' : s.status === 'skipped' ? '⏭' : '○';
          console.log(`  ${icon} ${i + 1}. ${s.description}`);
        });
        break;
      }
      case 'new': {
        const title = parts.slice(2).join(' ') || '操作计划';
        this.planManager.create(title);
        this.state.config.agent.mode = 'plan';
        printSuccess(`已创建计划: ${title}`);
        break;
      }
      case 'add': {
        const desc = parts.slice(2).join(' ');
        if (desc) this.planManager.addStep(desc);
        else printWarning('用法: /plan add <步骤描述>');
        break;
      }
      case 'done': {
        const idx = parseInt(parts[2]) - 1;
        if (this.planManager.completeStep(idx)) printSuccess(`步骤 ${idx + 1} 已完成`);
        else printWarning('无效的步骤编号');
        break;
      }
      case 'skip': {
        const skipIdx = parseInt(parts[2]) - 1;
        if (this.planManager.skipStep(skipIdx)) printSuccess(`步骤 ${skipIdx + 1} 已跳过`);
        else printWarning('无效的步骤编号');
        break;
      }
      case 'approve':
        this.planManager.approve();
        this.state.config.agent.mode = 'agent';
        this.state.yoloMode = false;
        printSuccess('计划已批准');
        break;
      case 'clear':
        this.planManager.clear();
        printSuccess('计划已清除');
        break;
      default:
        printInfo('用法: /plan [show|new|add|done|skip|approve|clear]');
    }
  }

  private async handleAgents(parts: string[]): Promise<void> {
    // Simplified agent handling
    if (parts[1] === 'spawn' && parts[2]) {
      const prompt = parts.slice(2).join(' ');
      printInfo('正在生成子代理...');
      try {
        const result = await this.state.subagentManager.spawn(prompt);
        printSuccess(`子代理完成 (${result.turnsUsed} 轮)`);
      } catch (err: any) {
        printError(`子代理失败: ${err.message}`);
      }
    } else {
      const active = this.state.subagentManager.getActiveAgents();
      printInfo(`活跃子代理: ${active.length}`);
    }
  }

  private handleTodos(parts: string[]): void {
    const todoCmd = parts[1] || 'show';
    switch (todoCmd) {
      case 'show':
        if (this.state.todos.length === 0) { printInfo('无待办事项'); return; }
        this.state.todos.forEach((t, i) => {
          const icon = t.done ? '✅' : '○';
          console.log(`  ${icon} ${i + 1}. ${t.text}`);
        });
        break;
      case 'add':
        if (parts[2]) {
          this.state.todos.push({ text: parts.slice(2).join(' '), done: false });
          printSuccess('已添加待办');
        }
        break;
      case 'done':
        const idx = parseInt(parts[2]) - 1;
        if (idx >= 0 && idx < this.state.todos.length) {
          this.state.todos[idx].done = true;
          printSuccess('已完成');
        }
        break;
      case 'clear':
        this.state.todos = [];
        printSuccess('待办已清除');
        break;
    }
  }

  private async handleTasks(parts: string[]): Promise<void> {
    const taskCmd = parts[1] || 'show';
    switch (taskCmd) {
      case 'show': {
        const tasks = this.state.taskManager.list();
        if (tasks.length === 0) { printInfo('无持久任务'); return; }
        for (const task of tasks) {
          const icon = task.status === 'completed' ? '✅' : task.status === 'in_progress' ? '🔄' : '○';
          console.log(`  ${icon} #${task.id} ${task.subject}`);
        }
        break;
      }
      case 'add':
        if (parts[2]) {
          await this.state.taskManager.create(parts.slice(2).join(' '), '');
          printSuccess('已创建任务');
        }
        break;
      case 'done':
        if (parts[2]) {
          await this.state.taskManager.update(parts[2], { status: 'completed' });
          printSuccess('任务已完成');
        }
        break;
    }
  }

  private handleTeam(): void {
    printInfo('专家开发团队');
    console.log('  使用 /agents 查看详细列表');
  }

  private handleCommands(): void {
    if (!this.state.slashCommands) { printInfo('Slash 命令系统未启用'); return; }
    const cmds = this.state.slashCommands.listCommands();
    printInfo(`共 ${cmds.length} 个命令`);
    for (const c of cmds) {
      console.log(`  /${c.name} - ${c.description}`);
    }
  }

  private handleMcp(): void {
    if (!this.state.mcpClient) { printInfo('MCP 未启用'); return; }
    const status = this.state.mcpClient.getStatus();
    for (const s of status) {
      const icon = s.connected ? '🟢' : '🔴';
      console.log(`  ${icon} ${s.name} - ${s.toolCount} 个工具`);
    }
  }

  private async handleInit(parts: string[]): Promise<void> {
    const { analyzeProject, generateClaudeMd } = require('./project-analyzer');
    printInfo('正在分析项目...');
    const projectDir = process.cwd();
    const projectInfo = await analyzeProject(projectDir);
    const claudeMd = generateClaudeMd(projectInfo);
    const outputPath = path.join(projectDir, 'CLAUDE.md');
    try {
      await fs.access(outputPath);
      if (parts[1] !== '--force') { printWarning('CLAUDE.md 已存在。使用 --force 覆盖。'); return; }
    } catch { /* ok */ }
    await fs.writeFile(outputPath, claudeMd, 'utf-8');
    printSuccess(`已生成 CLAUDE.md (${projectInfo.languages.join(', ')})`);
  }

  private handleContext(): void {
    const msgCount = this.state.conversationHistory.length;
    const estimatedTokens = this.state.compressor.estimateTokens(this.state.conversationHistory);
    console.log(`  消息: ${msgCount} 条`);
    console.log(`  Token: ~${estimatedTokens.toLocaleString()} / 200,000`);
    console.log(`  修改文件: ${this.state.modifiedFiles.size} 个`);
  }

  private async handleUndo(): Promise<void> {
    try {
      const reverted = await this.state.checkpoint.revertLast();
      printSuccess(`已回滚 ${reverted.length} 个文件`);
    } catch (err: any) {
      printWarning(err.message);
    }
  }

  private handleCheckpoints(): void {
    const cps = this.state.checkpoint.recent(10);
    if (cps.length === 0) { printInfo('无 checkpoint'); return; }
    for (const cp of cps) {
      const time = new Date(cp.timestamp).toLocaleTimeString();
      console.log(`  ${cp.id} | ${time} | ${cp.description}`);
    }
  }

  private handleBacktrack(): void {
    const removed = this.state.sessionRollback.backtrackToLastUserPrompt();
    if (removed) {
      const lastIdx = this.state.conversationHistory.length - 1;
      if (lastIdx >= 0 && this.state.conversationHistory[lastIdx].role === 'assistant') {
        this.state.conversationHistory.pop();
      }
      printSuccess(`已回退到 Turn ${removed.turnIndex}`);
    } else {
      printWarning('无法回退：已经是第一个 turn');
    }
  }

  private async handleRestore(parts: string[]): Promise<void> {
    try {
      const { restored, snapshotId } = await this.state.enhancedSandbox.restoreSnapshot(parts[1]);
      printSuccess(`已恢复到快照 ${snapshotId}（${restored.length} 个文件）`);
    } catch (err: any) {
      printWarning(err.message);
    }
  }

  private async handleFork(parts: string[]): Promise<void> {
    try {
      const desc = parts.slice(1).join(' ') || `Fork at turn ${this.state.turnCount}`;
      const fork = await this.state.sessionRollback.forkAtTurn(
        this.state.sessionRollback.getCurrentTurnIndex(),
        desc,
        this.state.conversationHistory,
      );
      printSuccess(`已分叉会话: ${fork.forkId}`);
    } catch (err: any) {
      printWarning(err.message);
    }
  }

  private handleTimeline(parts: string[]): void {
    const max = parseInt(parts[1]) || 20;
    console.log(this.state.sessionRollback.formatTimeline(max));
  }

  private handleRLM(parts: string[]): void {
    const rlmCmd = parts[1] || 'list';
    if (rlmCmd === 'list') {
      const sessions = this.state.rlmManager.list();
      if (sessions.length === 0) { printInfo('无活跃 RLM 会话'); return; }
      for (const s of sessions) {
        console.log(`  ${s.id} — ${s.status} | ${s.executionCount} 次执行`);
      }
    } else if (rlmCmd === 'open') {
      this.state.rlmManager.open(parts.slice(2).join(' ')).then(id => printSuccess(`RLM 会话: ${id}`)).catch(e => printError(e.message));
    }
  }

  private handleAudit(parts: string[]): void {
    const auditCmd = parts[1] || 'report';
    if (auditCmd === 'report') {
      console.log(this.state.auditLogger.formatReport());
    }
  }

  private handleSandbox(): void {
    console.log(this.state.enhancedSandbox.formatStatus());
  }

  private handleConstitution(): void {
    console.log(this.state.charter.getSummary());
  }

  private handleDiagnostics(): void {
    const servers = this.state.diagnosticsManager.getAvailableServers();
    for (const s of servers) {
      console.log(`  ${s.available ? '●' : '○'} ${s.name} — ${s.available ? '可用' : '不可用'}`);
    }
  }

  private async handleUnknown(parts: string[]): Promise<void> {
    if (this.state.slashCommands) {
      const slashName = parts[0].slice(1);
      const cmd = this.state.slashCommands.getCommand(slashName);
      if (cmd) {
        const args = parts.slice(1).join(' ');
        let prompt = cmd.prompt;
        if (args) prompt = prompt.replace(/\{\{args\}\}/g, args).replace(/\$ARGUMENTS/g, args);
        printInfo(`执行 /${slashName}: ${cmd.description}`);
        return;
      }
    }
    printWarning(`未知命令: ${parts[0]}。输入 /help 查看帮助。`);
  }
}
