/**
 * 超级智能编排引擎
 * 支持一句话完成任何复杂任务
 */

import { AgentPoolManager, WorkflowOrchestrator, AgentType, TaskPriority, Task } from './agent-pool';
import { v4 as uuidv4 } from 'uuid';

// ── 类型定义 ─────────────────────────────────────────────────────────

export interface SuperCommand {
  id: string;
  instruction: string;
  context?: Record<string, any>;
  options?: {
    maxAgents?: number;
    timeout?: number;
    priority?: TaskPriority;
    parallelism?: number;
    verbose?: boolean;
  };
}

export interface CommandResult {
  success: boolean;
  commandId: string;
  summary: string;
  tasks: Array<{
    id: string;
    description: string;
    type: AgentType;
    status: string;
    output?: any;
    error?: string;
    duration: number;
    agent: string;
  }>;
  totalDuration: number;
  agentsUsed: number;
  performance: {
    tasksPerSecond: number;
    successRate: number;
    avgTaskDuration: number;
  };
}

// ── 智能意图解析器 ───────────────────────────────────────────────────

interface ParsedIntent {
  category: string;
  actions: Array<{
    type: AgentType;
    action: string;
    parameters: Record<string, any>;
    priority: TaskPriority;
    dependencies: string[];
  }>;
  parallelizable: boolean;
  estimatedComplexity: 'simple' | 'moderate' | 'complex' | 'massive';
}

const INTENT_PATTERNS: Array<{
  pattern: RegExp;
  category: string;
  extract: (match: RegExpMatchArray) => any;
}> = [
  // 软件测试
  {
    pattern: /(?:测试|test|检查|check|验证|verify|审计|audit)\s*(?:软件|software|代码|code|应用|app|系统|system|网站|website|API)?/i,
    category: 'software-testing',
    extract: () => ({ target: 'software' }),
  },
  {
    pattern: /(?:修复|fix|修正|correct|解决|solve|调试|debug)\s*(?:bug|错误|error|问题|issue|缺陷|defect)/i,
    category: 'bug-fixing',
    extract: () => ({ action: 'fix' }),
  },
  {
    pattern: /(?:重构|refactor|优化|optimize|改进|improve|重写|rewrite)\s*(?:代码|code|性能|performance)?/i,
    category: 'code-improvement',
    extract: () => ({ action: 'improve' }),
  },
  {
    pattern: /(?:部署|deploy|发布|release|上线|launch|上线|publish)/i,
    category: 'deployment',
    extract: () => ({ action: 'deploy' }),
  },
  {
    pattern: /(?:监控|monitor|观察|watch|跟踪|track|日志|log)/i,
    category: 'monitoring',
    extract: () => ({ action: 'monitor' }),
  },

  // 游戏开发
  {
    pattern: /(?:创建|create|制作|make|开发|develop|设计|design)\s*(?:游戏|game|场景|scene|关卡|level|地图|map|角色|character|动画|animation)/i,
    category: 'game-development',
    extract: (m) => ({ asset: m[1] || 'game' }),
  },
  {
    pattern: /(?:渲染|render|绘制|draw|生成|generate)\s*(?:3D|2D|图形|graphics|模型|model|纹理|texture)/i,
    category: 'game-graphics',
    extract: () => ({ action: 'render' }),
  },
  {
    pattern: /(?:游戏引擎|game\s*engine|Unity|Unreal|Godot|虚幻)/i,
    category: 'game-engine',
    extract: () => ({ engine: 'auto' }),
  },

  // 办公自动化
  {
    pattern: /(?:处理|process|分析|analyze|整理|organize|汇总|summarize)\s*(?:数据|data|表格|spreadsheet|报告|report|文档|document)/i,
    category: 'office-automation',
    extract: () => ({ type: 'data' }),
  },
  {
    pattern: /(?:发送|send|邮件|email|通知|notify|提醒|remind)/i,
    category: 'communication',
    extract: () => ({ type: 'email' }),
  },
  {
    pattern: /(?:会议|meeting|日程|schedule|安排|arrange|预约|appointment)/i,
    category: 'scheduling',
    extract: () => ({ type: 'meeting' }),
  },
  {
    pattern: /(?:演示|presentation|幻灯片|slides|报告|report)/i,
    category: 'presentation',
    extract: () => ({ type: 'slides' }),
  },

  // 数据分析
  {
    pattern: /(?:分析|analyze|统计|statistics|挖掘|mine|预测|predict)\s*(?:数据|data|趋势|trend|模式|pattern)/i,
    category: 'data-analysis',
    extract: () => ({ action: 'analyze' }),
  },
  {
    pattern: /(?:可视化|visualize|图表|chart|图形|graph|仪表盘|dashboard)/i,
    category: 'data-visualization',
    extract: () => ({ action: 'visualize' }),
  },

  // AI/ML
  {
    pattern: /(?:训练|train|模型|model|机器学习|ML|深度学习|deep\s*learning|神经网络|neural)/i,
    category: 'ai-training',
    extract: () => ({ type: 'ml' }),
  },
  {
    pattern: /(?:推理|inference|预测|predict|分类|classify|聚类|cluster)/i,
    category: 'ai-inference',
    extract: () => ({ type: 'inference' }),
  },

  // 安全
  {
    pattern: /(?:安全|security|漏洞|vulnerability|渗透|penetration|扫描|scan|审计|audit)/i,
    category: 'security',
    extract: () => ({ type: 'security' }),
  },

  // 设计
  {
    pattern: /(?:设计|design|UI|UX|界面|interface|原型|prototype|线框|wireframe)/i,
    category: 'design',
    extract: () => ({ type: 'ui' }),
  },
  {
    pattern: /(?:图片|image|照片|photo|图标|icon|Logo|标志|banner|海报|poster)/i,
    category: 'graphics-design',
    extract: () => ({ type: 'image' }),
  },

  // 自动化
  {
    pattern: /(?:自动化|automate|脚本|script|批量|batch|流水线|pipeline|工作流|workflow)/i,
    category: 'automation',
    extract: () => ({ type: 'automation' }),
  },
];

function parseIntelligentIntent(instruction: string): ParsedIntent {
  const lowerInstruction = instruction.toLowerCase();
  let category = 'general';
  let parameters: any = {};

  // 匹配意图
  for (const { pattern, category: cat, extract } of INTENT_PATTERNS) {
    const match = lowerInstruction.match(pattern);
    if (match) {
      category = cat;
      parameters = extract(match);
      break;
    }
  }

  // 分析复杂度
  const complexity = analyzeComplexity(instruction);

  // 分解为子任务
  const actions = decomposeIntoActions(instruction, category, parameters);

  // 判断是否可并行
  const parallelizable = checkParallelizability(actions);

  return {
    category,
    actions,
    parallelizable,
    estimatedComplexity: complexity,
  };
}

function analyzeComplexity(instruction: string): 'simple' | 'moderate' | 'complex' | 'massive' {
  const wordCount = instruction.split(/\s+/).length;
  const actionCount = (instruction.match(/[,，;；.。、]/g) || []).length + 1;
  const hasMultipleTargets = /(?:和|and|以及|同时|同时|一起)/i.test(instruction);

  if (wordCount < 10 && actionCount <= 2) return 'simple';
  if (wordCount < 30 && actionCount <= 5) return 'moderate';
  if (wordCount < 100 && actionCount <= 15) return 'complex';
  return 'massive';
}

function decomposeIntoActions(
  instruction: string,
  category: string,
  parameters: any
): ParsedIntent['actions'] {
  const actions: ParsedIntent['actions'] = [];

  // 基于类别的默认任务分解
  switch (category) {
    case 'software-testing':
      actions.push(
        { type: 'software-tester', action: 'analyze-code', parameters: {}, priority: 'high', dependencies: [] },
        { type: 'software-tester', action: 'run-tests', parameters: {}, priority: 'high', dependencies: [] },
        { type: 'security-auditor', action: 'security-scan', parameters: {}, priority: 'medium', dependencies: [] },
        { type: 'code-fixer', action: 'fix-issues', parameters: {}, priority: 'high', dependencies: [] }
      );
      break;

    case 'bug-fixing':
      actions.push(
        { type: 'software-tester', action: 'identify-bug', parameters: {}, priority: 'critical', dependencies: [] },
        { type: 'code-fixer', action: 'fix-bug', parameters: {}, priority: 'critical', dependencies: [] },
        { type: 'software-tester', action: 'verify-fix', parameters: {}, priority: 'high', dependencies: [] }
      );
      break;

    case 'game-development':
      actions.push(
        { type: 'game-developer', action: 'create-scene', parameters, priority: 'high', dependencies: [] },
        { type: 'game-developer', action: 'design-assets', parameters, priority: 'medium', dependencies: [] },
        { type: 'game-developer', action: 'implement-logic', parameters, priority: 'high', dependencies: [] },
        { type: 'game-developer', action: 'optimize-performance', parameters, priority: 'medium', dependencies: [] }
      );
      break;

    case 'game-graphics':
      actions.push(
        { type: 'game-developer', action: 'generate-3d-model', parameters, priority: 'high', dependencies: [] },
        { type: 'design-creator', action: 'create-texture', parameters, priority: 'medium', dependencies: [] },
        { type: 'game-developer', action: 'render-scene', parameters, priority: 'high', dependencies: [] }
      );
      break;

    case 'office-automation':
      actions.push(
        { type: 'data-analyst', action: 'process-data', parameters, priority: 'high', dependencies: [] },
        { type: 'office-automation', action: 'generate-report', parameters, priority: 'high', dependencies: [] },
        { type: 'office-automation', action: 'create-charts', parameters, priority: 'medium', dependencies: [] }
      );
      break;

    case 'data-analysis':
      actions.push(
        { type: 'data-analyst', action: 'collect-data', parameters, priority: 'high', dependencies: [] },
        { type: 'data-analyst', action: 'clean-data', parameters, priority: 'high', dependencies: [] },
        { type: 'data-analyst', action: 'analyze-patterns', parameters, priority: 'high', dependencies: [] },
        { type: 'data-analyst', action: 'visualize-results', parameters, priority: 'medium', dependencies: [] }
      );
      break;

    case 'ai-training':
      actions.push(
        { type: 'ai-trainer', action: 'prepare-dataset', parameters, priority: 'high', dependencies: [] },
        { type: 'ai-trainer', action: 'train-model', parameters, priority: 'critical', dependencies: [] },
        { type: 'ai-trainer', action: 'evaluate-model', parameters, priority: 'high', dependencies: [] },
        { type: 'ai-trainer', action: 'deploy-model', parameters, priority: 'medium', dependencies: [] }
      );
      break;

    case 'security':
      actions.push(
        { type: 'security-auditor', action: 'vulnerability-scan', parameters, priority: 'critical', dependencies: [] },
        { type: 'security-auditor', action: 'penetration-test', parameters, priority: 'high', dependencies: [] },
        { type: 'code-fixer', action: 'fix-vulnerabilities', parameters, priority: 'critical', dependencies: [] }
      );
      break;

    case 'design':
      actions.push(
        { type: 'design-creator', action: 'create-mockup', parameters, priority: 'high', dependencies: [] },
        { type: 'design-creator', action: 'design-components', parameters, priority: 'high', dependencies: [] },
        { type: 'design-creator', action: 'create-prototype', parameters, priority: 'medium', dependencies: [] }
      );
      break;

    default:
      actions.push(
        { type: 'general', action: 'analyze', parameters: { instruction }, priority: 'high', dependencies: [] },
        { type: 'general', action: 'execute', parameters: { instruction }, priority: 'high', dependencies: [] }
      );
  }

  return actions;
}

function checkParallelizability(actions: ParsedIntent['actions']): boolean {
  // 如果没有依赖关系，可以并行
  return actions.every((a) => a.dependencies.length === 0);
}

// ── 超级编排引擎 ─────────────────────────────────────────────────────

export class SuperOrchestrator {
  private agentPool: AgentPoolManager;
  private workflowOrchestrator: WorkflowOrchestrator;
  private commandHistory: CommandResult[] = [];

  constructor(config?: { maxAgents?: number }) {
    this.agentPool = new AgentPoolManager({
      maxAgents: config?.maxAgents || 0, // 无限
      scalingStrategy: 'elastic',
      healthCheckInterval: 10000,
      taskTimeout: 600000, // 10分钟
      maxRetries: 3,
    });

    this.workflowOrchestrator = new WorkflowOrchestrator(this.agentPool);

    // 初始化默认agents
    this.initializeDefaultAgents();

    // 监听事件
    this.setupEventListeners();
  }

  private initializeDefaultAgents(): void {
    const agentTypes: AgentType[] = [
      'software-tester',
      'code-fixer',
      'game-developer',
      'office-automation',
      'data-analyst',
      'design-creator',
      'web-developer',
      'devops-engineer',
      'security-auditor',
      'ai-trainer',
      'general',
    ];

    // 每种类型创建2个agent
    for (const type of agentTypes) {
      this.agentPool.createAgent(type, [type]);
      this.agentPool.createAgent(type, [type]);
    }

    console.log(`[SuperOrchestrator] Initialized ${agentTypes.length * 2} default agents`);
  }

  private setupEventListeners(): void {
    this.agentPool.on('task:completed', (task) => {
      console.log(`[SuperOrchestrator] Task completed: ${task.id}`);
    });

    this.agentPool.on('task:failed', (task) => {
      console.error(`[SuperOrchestrator] Task failed: ${task.id} - ${task.error}`);
    });

    this.agentPool.on('metrics:updated', (metrics) => {
      if (metrics.pendingTasks > 0 || metrics.runningTasks > 0) {
        console.log(`[SuperOrchestrator] Status: ${metrics.runningTasks} running, ${metrics.pendingTasks} pending, ${metrics.idleAgents} agents idle`);
      }
    });
  }

  // ── 核心执行方法 ─────────────────────────────────────────────────

  async execute(command: SuperCommand): Promise<CommandResult> {
    const startTime = Date.now();
    console.log(`[SuperOrchestrator] Executing command: ${command.instruction}`);

    // 1. 解析意图
    const intent = parseIntelligentIntent(command.instruction);
    console.log(`[SuperOrchestrator] Detected category: ${intent.category}, complexity: ${intent.estimatedComplexity}`);
    console.log(`[SuperOrchestrator] Decomposed into ${intent.actions.length} tasks`);

    // 2. 创建工作流
    const workflow = this.workflowOrchestrator.createWorkflow(
      `Command: ${command.instruction.substring(0, 50)}`,
      command.instruction,
      command.options?.parallelism || (intent.parallelizable ? 0 : 1)
    );

    // 3. 添加任务到工作流
    const tasks: any[] = [];
    for (const action of intent.actions) {
      const task = this.workflowOrchestrator.addTaskToWorkflow(workflow.id, {
        description: `${action.action} - ${command.instruction.substring(0, 30)}`,
        type: action.type,
        priority: command.options?.priority || action.priority,
        dependencies: action.dependencies,
        input: {
          ...action.parameters,
          originalInstruction: command.instruction,
          context: command.context,
        },
        metadata: {
          category: intent.category,
          complexity: intent.estimatedComplexity,
        },
        maxRetries: 3,
        timeout: command.options?.timeout || 600000,
      });

      if (task) tasks.push(task);
    }

    // 4. 动态扩展agents（如果需要）
    if (intent.estimatedComplexity === 'massive') {
      const additionalAgents = Math.min(tasks.length * 2, 100);
      console.log(`[SuperOrchestrator] Scaling up: Creating ${additionalAgents} additional agents`);
      for (let i = 0; i < additionalAgents; i++) {
        const type = intent.actions[i % intent.actions.length].type;
        this.agentPool.createAgent(type, [type]);
      }
    }

    // 5. 执行工作流
    try {
      await this.workflowOrchestrator.executeWorkflow(workflow.id);
    } catch (error: any) {
      console.error(`[SuperOrchestrator] Workflow execution failed: ${error.message}`);
    }

    // 6. 收集结果
    const result = this.collectResults(command, workflow, startTime);

    // 7. 保存历史
    this.commandHistory.push(result);

    return result;
  }

  private collectResults(command: SuperCommand, workflow: any, startTime: number): CommandResult {
    const endTime = Date.now();
    const duration = endTime - startTime;

    const allTasks = this.agentPool.getAllTasks();
    const workflowTasks = allTasks.filter((t) =>
      workflow.tasks.some((wt: any) => wt.id === t.id)
    );

    const completedTasks = workflowTasks.filter((t) => t.status === 'completed');
    const failedTasks = workflowTasks.filter((t) => t.status === 'failed');

    const tasks = workflowTasks.map((t) => ({
      id: t.id,
      description: t.description,
      type: t.type,
      status: t.status,
      output: t.output,
      error: t.error,
      duration: (t.endTime || Date.now()) - (t.startTime || Date.now()),
      agent: t.assignedAgent || 'unassigned',
    }));

    const successRate = workflowTasks.length > 0 ? completedTasks.length / workflowTasks.length : 0;
    const avgDuration = completedTasks.length > 0
      ? completedTasks.reduce((sum, t) => sum + ((t.endTime || 0) - (t.startTime || 0)), 0) / completedTasks.length
      : 0;

    return {
      success: failedTasks.length === 0,
      commandId: command.id,
      summary: this.generateSummary(command, workflowTasks, successRate),
      tasks,
      totalDuration: duration,
      agentsUsed: new Set(tasks.map((t) => t.agent)).size,
      performance: {
        tasksPerSecond: workflowTasks.length / (duration / 1000),
        successRate,
        avgTaskDuration: avgDuration,
      },
    };
  }

  private generateSummary(command: SuperCommand, tasks: Task[], successRate: number): string {
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const total = tasks.length;

    if (successRate === 1) {
      return `✅ 命令执行成功: "${command.instruction.substring(0, 50)}..." - ${completed}/${total} 个任务完成`;
    } else if (successRate > 0.5) {
      return `⚠️ 命令部分成功: "${command.instruction.substring(0, 50)}..." - ${completed}/${total} 个任务完成`;
    } else {
      return `❌ 命令执行失败: "${command.instruction.substring(0, 50)}..." - 仅 ${completed}/${total} 个任务完成`;
    }
  }

  // ── 状态查询 ─────────────────────────────────────────────────────

  getStatus(): any {
    return {
      agentPool: this.agentPool.getStatus(),
      recentCommands: this.commandHistory.slice(-10),
    };
  }

  getCommandHistory(): CommandResult[] {
    return this.commandHistory;
  }

  // ── 便捷方法 ─────────────────────────────────────────────────────

  async testSoftware(instruction: string): Promise<CommandResult> {
    return this.execute({
      id: `cmd-${uuidv4().slice(0, 8)}`,
      instruction: `测试软件: ${instruction}`,
      options: { priority: 'high' },
    });
  }

  async fixBugs(instruction: string): Promise<CommandResult> {
    return this.execute({
      id: `cmd-${uuidv4().slice(0, 8)}`,
      instruction: `修复bug: ${instruction}`,
      options: { priority: 'critical' },
    });
  }

  async createGame(instruction: string): Promise<CommandResult> {
    return this.execute({
      id: `cmd-${uuidv4().slice(0, 8)}`,
      instruction: `创建游戏: ${instruction}`,
      options: { priority: 'high', parallelism: 10 },
    });
  }

  async automateOffice(instruction: string): Promise<CommandResult> {
    return this.execute({
      id: `cmd-${uuidv4().slice(0, 8)}`,
      instruction: `办公自动化: ${instruction}`,
      options: { priority: 'medium' },
    });
  }

  async analyzeData(instruction: string): Promise<CommandResult> {
    return this.execute({
      id: `cmd-${uuidv4().slice(0, 8)}`,
      instruction: `数据分析: ${instruction}`,
      options: { priority: 'high' },
    });
  }

  async trainAI(instruction: string): Promise<CommandResult> {
    return this.execute({
      id: `cmd-${uuidv4().slice(0, 8)}`,
      instruction: `AI训练: ${instruction}`,
      options: { priority: 'critical', parallelism: 20 },
    });
  }
}

// ── 导出 ─────────────────────────────────────────────────────────────

export const createSuperOrchestrator = (config?: { maxAgents?: number }) =>
  new SuperOrchestrator(config);
