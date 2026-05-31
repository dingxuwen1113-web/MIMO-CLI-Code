/**
 * 终极CLI系统
 * 一个人抵得上千人公司
 * 一句话解决所有问题
 */

import { createReasoningEngine } from './reasoning-engine';
import { createUniversalExecutor } from './universal-executor';
import { createComputeEngine } from './compute-engine';
import { createKnowledgeGraph } from './knowledge-graph';
import { searchSkills, ALL_INDUSTRIES } from './industry-skills';
import { ToolResult } from '../registry';

// ── 终极CLI引擎 ─────────────────────────────────────────────────────

export class UltimateCLI {
  private reasoningEngine = createReasoningEngine();
  private executor = createUniversalExecutor();
  private computeEngine = createComputeEngine();
  private knowledgeGraph = createKnowledgeGraph();

  // ── 核心执行方法 ─────────────────────────────────────────────────

  async solve(input: string): Promise<{
    understanding: string;
    solution: string;
    execution: any;
    result: any;
    insights: string[];
  }> {
    console.log(`[UltimateCLI] Processing: ${input}`);

    // 1. 理解问题
    const understanding = await this.understand(input);

    // 2. 推理和规划
    const plan = await this.reason(input);

    // 3. 执行解决方案
    const execution = await this.execute(input, plan);

    // 4. 生成结果
    const result = await this.generateResult(input, execution);

    // 5. 产生洞察
    const insights = await this.generateInsights(input, result);

    return {
      understanding,
      solution: plan,
      execution,
      result,
      insights,
    };
  }

  private async understand(input: string): Promise<string> {
    // 分析输入的意图和上下文
    const keywords = this.extractKeywords(input);
    const intent = this.identifyIntent(input);
    const domain = this.identifyDomain(input);

    return `理解: 这是一个关于${domain}的${intent}问题。关键词: ${keywords.join(', ')}`;
  }

  private async reason(input: string): Promise<string> {
    // 使用推理引擎深度思考
    const thought = await this.reasoningEngine.reason(input);
    return thought.conclusion;
  }

  private async execute(input: string, plan: string): Promise<any> {
    // 根据问题类型选择执行策略
    const strategy = this.selectStrategy(input);

    switch (strategy) {
      case 'calculate':
        return this.executeCalculation(input);
      case 'automate':
        return this.executeAutomation(input);
      case 'analyze':
        return this.executeAnalysis(input);
      case 'create':
        return this.executeCreation(input);
      case 'learn':
        return this.executeLearning(input);
      default:
        return this.executeGeneral(input);
    }
  }

  private async generateResult(input: string, execution: any): Promise<any> {
    // 汇总执行结果
    return {
      answer: execution.result || '任务完成',
      details: execution.details || {},
      metrics: execution.metrics || {},
    };
  }

  private async generateInsights(input: string, result: any): Promise<string[]> {
    // 从知识图谱获取相关洞察
    const knowledge = await this.knowledgeGraph.query({ query: input, limit: 3 });

    return [
      `相关知识: ${knowledge.nodes.map((n) => n.name).join(', ')}`,
      `建议: ${knowledge.suggestions[0] || '继续探索相关领域'}`,
      `置信度: ${(knowledge.confidence * 100).toFixed(1)}%`,
    ];
  }

  // ── 辅助方法 ─────────────────────────────────────────────────────

  private extractKeywords(input: string): string[] {
    const stopWords = ['的', '了', '是', '在', '我', '你', '他', '她', '它', '这', '那', '有', '和', '与', '或'];
    return input
      .split(/[\s,，。.!?！？]+/)
      .filter((word) => word.length > 1 && !stopWords.includes(word))
      .slice(0, 10);
  }

  private identifyIntent(input: string): string {
    const intents: Array<{ pattern: RegExp; intent: string }> = [
      { pattern: /计算|求|算|多少|几/, intent: '计算' },
      { pattern: /分析|研究|了解|查看/, intent: '分析' },
      { pattern: /创建|做|制作|生成|写/, intent: '创建' },
      { pattern: /修复|改|修|解决|处理/, intent: '修复' },
      { pattern: /学习|了解|知道|解释/, intent: '学习' },
      { pattern: /测试|检查|验证|评估/, intent: '测试' },
      { pattern: /优化|改进|提升|增强/, intent: '优化' },
      { pattern: /部署|发布|上线|推出/, intent: '部署' },
    ];

    for (const { pattern, intent } of intents) {
      if (pattern.test(input)) {
        return intent;
      }
    }

    return '通用';
  }

  private identifyDomain(input: string): string {
    const domains: Array<{ keywords: string[]; domain: string }> = [
      { keywords: ['代码', '程序', '软件', '开发', '编程'], domain: '软件开发' },
      { keywords: ['数据', '分析', '统计', '图表'], domain: '数据分析' },
      { keywords: ['AI', '机器学习', '深度学习', '模型'], domain: '人工智能' },
      { keywords: ['游戏', '场景', '角色', '3D'], domain: '游戏开发' },
      { keywords: ['钱', '金融', '投资', '股票'], domain: '金融' },
      { keywords: ['设计', 'UI', '界面', '图片'], domain: '设计' },
      { keywords: ['数学', '计算', '公式', '方程'], domain: '数学' },
      { keywords: ['报告', '文档', 'PPT', '演示'], domain: '办公' },
    ];

    for (const { keywords, domain } of domains) {
      if (keywords.some((kw) => input.includes(kw))) {
        return domain;
      }
    }

    return '通用';
  }

  private selectStrategy(input: string): string {
    if (/计算|数学|方程|公式|1\+1/.test(input)) return 'calculate';
    if (/自动|操作|执行|运行|打开/.test(input)) return 'automate';
    if (/分析|研究|数据|统计/.test(input)) return 'analyze';
    if (/创建|制作|生成|写|画/.test(input)) return 'create';
    if (/学习|了解|知道|解释|教学/.test(input)) return 'learn';
    return 'general';
  }

  // ── 执行策略 ─────────────────────────────────────────────────────

  private async executeCalculation(input: string): Promise<any> {
    // 提取数学表达式
    const mathExpr = input.match(/[0-9+\-*/().^sqrt sin cos tan log exp pi]+/g)?.[0] || input;

    const result = await this.computeEngine.calculate({
      id: `calc-${Date.now()}`,
      type: 'arithmetic',
      expression: mathExpr,
    });

    return {
      result: result.result,
      steps: result.steps,
      type: 'calculation',
    };
  }

  private async executeAutomation(input: string): Promise<any> {
    // 自动化执行
    const result = await this.executor.execute({
      id: `auto-${Date.now()}`,
      type: 'application',
      action: 'launch',
      target: 'vscode',
      parameters: {},
    });

    return {
      result: result.success ? '自动化任务执行成功' : '自动化任务执行失败',
      details: result.output,
      type: 'automation',
    };
  }

  private async executeAnalysis(input: string): Promise<any> {
    // 分析任务
    const knowledge = await this.knowledgeGraph.query({ query: input, limit: 5 });

    return {
      result: `分析完成: 找到 ${knowledge.nodes.length} 个相关知识点`,
      details: knowledge,
      type: 'analysis',
    };
  }

  private async executeCreation(input: string): Promise<any> {
    // 创作任务
    const solutions = await this.reasoningEngine.generateCreativeSolutions(input);

    return {
      result: `生成了 ${solutions.solutions.length} 个创意方案`,
      details: solutions,
      type: 'creation',
    };
  }

  private async executeLearning(input: string): Promise<any> {
    // 学习任务
    const recommendations = await this.knowledgeGraph.getRecommendations(input);

    return {
      result: `学习建议: ${recommendations[0] || '继续探索'}`,
      details: { recommendations },
      type: 'learning',
    };
  }

  private async executeGeneral(input: string): Promise<any> {
    // 通用执行
    const thought = await this.reasoningEngine.reason(input);

    return {
      result: thought.conclusion,
      details: {
        confidence: thought.confidence,
        alternatives: thought.alternatives,
        insights: thought.insights,
      },
      type: 'general',
    };
  }

  // ── 快捷方法 ─────────────────────────────────────────────────────

  // 数学计算
  async calculate(expression: string): Promise<string> {
    const result = await this.computeEngine.calculate({
      id: `math-${Date.now()}`,
      type: 'arithmetic',
      expression,
    });
    return `${expression} = ${result.result}`;
  }

  // 代码分析
  async analyzeCode(code: string, language: string): Promise<any> {
    return this.reasoningEngine.reasonAboutCode(code, language);
  }

  // 深度思考
  async think(input: string): Promise<any> {
    return this.reasoningEngine.reason(input);
  }

  // 知识查询
  async learn(topic: string): Promise<any> {
    return this.knowledgeGraph.query({ query: topic, limit: 5 });
  }

  // 行业技能
  async getSkills(industry?: string): Promise<any> {
    if (industry) {
      const skills = searchSkills(industry);
      return { industry, skills };
    }
    return {
      totalIndustries: ALL_INDUSTRIES.length,
      totalSkills: ALL_INDUSTRIES.reduce((sum, ind) => sum + ind.skills.length, 0),
      industries: ALL_INDUSTRIES.map((ind) => ({
        name: ind.nameCN,
        skillCount: ind.skills.length,
      })),
    };
  }

  // 执行系统命令
  async executeCommand(command: string): Promise<any> {
    return this.executor.execute({
      id: `cmd-${Date.now()}`,
      type: 'system',
      action: 'exec',
      target: command,
      parameters: {},
    });
  }

  // 获取系统状态
  async getStatus(): Promise<any> {
    return {
      knowledge: this.knowledgeGraph.getStats(),
      compute: {
        historySize: this.computeEngine.getHistory().length,
      },
      executor: {
        commandHistory: this.executor.getCommandHistory().length,
      },
    };
  }
}

// ── 导出工具函数 ─────────────────────────────────────────────────────

let ultimateCLI: UltimateCLI | null = null;

function getUltimateCLI(): UltimateCLI {
  if (!ultimateCLI) {
    ultimateCLI = new UltimateCLI();
  }
  return ultimateCLI;
}

export async function executeUltimate(input: Record<string, any>): Promise<ToolResult> {
  try {
    const instruction = input.instruction;
    if (typeof instruction !== 'string' || instruction.length === 0) {
      return {
        output: '请提供指令',
        isError: true,
      };
    }

    const cli = getUltimateCLI();
    console.log(`[Ultimate] Processing: ${instruction}`);

    // 处理不同类型的请求
    let result: any;

    if (/^计算|^算|^求|^多少|^1\+1/i.test(instruction)) {
      // 数学计算
      const expr = instruction.replace(/^(计算|算|求|多少)\s*/i, '');
      result = await cli.calculate(expr);
    } else if (/^分析代码|^代码分析/i.test(instruction)) {
      // 代码分析
      result = await cli.analyzeCode(instruction, 'javascript');
    } else if (/^深度思考|^思考|^想想/i.test(instruction)) {
      // 深度思考
      result = await cli.think(instruction);
    } else if (/^学习|^了解|^知识/i.test(instruction)) {
      // 知识查询
      const topic = instruction.replace(/^(学习|了解|知识)\s*/i, '');
      result = await cli.learn(topic);
    } else if (/^技能|^行业/i.test(instruction)) {
      // 行业技能
      result = await cli.getSkills();
    } else if (/^执行|^运行|^执行命令/i.test(instruction)) {
      // 执行命令
      const cmd = instruction.replace(/^(执行|运行|执行命令)\s*/i, '');
      result = await cli.executeCommand(cmd);
    } else if (/^状态|^系统状态/i.test(instruction)) {
      // 系统状态
      result = await cli.getStatus();
    } else {
      // 通用处理
      result = await cli.solve(instruction);
    }

    return {
      output: JSON.stringify(result, null, 2),
      isError: false,
    };
  } catch (error: any) {
    console.error(`[Ultimate] Error:`, error);
    return {
      output: `执行失败: ${error.message}`,
      isError: true,
    };
  }
}

export async function executeCalculate(input: Record<string, any>): Promise<ToolResult> {
  try {
    const expression = input.expression;
    if (!expression) {
      return { output: '请提供数学表达式', isError: true };
    }

    const cli = getUltimateCLI();
    const result = await cli.calculate(expression);

    return {
      output: JSON.stringify({ result, expression }, null, 2),
      isError: false,
    };
  } catch (error: any) {
    return { output: `计算失败: ${error.message}`, isError: true };
  }
}

export async function executeDeepThink(input: Record<string, any>): Promise<ToolResult> {
  try {
    const question = input.question;
    if (!question) {
      return { output: '请提供问题', isError: true };
    }

    const cli = getUltimateCLI();
    const result = await cli.think(question);

    return {
      output: JSON.stringify(result, null, 2),
      isError: false,
    };
  } catch (error: any) {
    return { output: `思考失败: ${error.message}`, isError: true };
  }
}

export async function executeKnowledgeQuery(input: Record<string, any>): Promise<ToolResult> {
  try {
    const topic = input.topic;
    if (!topic) {
      return { output: '请提供查询主题', isError: true };
    }

    const cli = getUltimateCLI();
    const result = await cli.learn(topic);

    return {
      output: JSON.stringify(result, null, 2),
      isError: false,
    };
  } catch (error: any) {
    return { output: `查询失败: ${error.message}`, isError: true };
  }
}

export async function executeIndustrySkills(input: Record<string, any>): Promise<ToolResult> {
  try {
    const industry = input.industry;
    const cli = getUltimateCLI();
    const result = await cli.getSkills(industry);

    return {
      output: JSON.stringify(result, null, 2),
      isError: false,
    };
  } catch (error: any) {
    return { output: `查询失败: ${error.message}`, isError: true };
  }
}

export async function executeSystemCommand(input: Record<string, any>): Promise<ToolResult> {
  try {
    const command = input.command;
    if (!command) {
      return { output: '请提供命令', isError: true };
    }

    const cli = getUltimateCLI();
    const result = await cli.executeCommand(command);

    return {
      output: JSON.stringify(result, null, 2),
      isError: false,
    };
  } catch (error: any) {
    return { output: `执行失败: ${error.message}`, isError: true };
  }
}

export async function executeUltimateStatus(_input: Record<string, any>): Promise<ToolResult> {
  try {
    const cli = getUltimateCLI();
    const result = await cli.getStatus();

    return {
      output: JSON.stringify(result, null, 2),
      isError: false,
    };
  } catch (error: any) {
    return { output: `状态查询失败: ${error.message}`, isError: true };
  }
}
