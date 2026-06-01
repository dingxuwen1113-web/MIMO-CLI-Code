import { ToolResult } from '../registry';

// ── Types ─────────────────────────────────────────────────────────────

export interface AutomationStep {
  tool: string;
  input: Record<string, any>;
  description: string;
  waitFor?: number;
  condition?: string;
  onError?: 'retry' | 'skip' | 'abort';
}

export interface AutomationWorkflow {
  id: string;
  name: string;
  description: string;
  steps: AutomationStep[];
  metadata?: Record<string, any>;
}

export interface ExecutionResult {
  success: boolean;
  workflowId: string;
  steps: Array<{
    stepIndex: number;
    description: string;
    tool: string;
    success: boolean;
    output?: string;
    error?: string;
    duration: number;
  }>;
  totalDuration: number;
  summary: string;
}

// ── Natural Language Parser ───────────────────────────────────────────

interface ParsedIntent {
  action: string;
  target?: string;
  parameters?: Record<string, any>;
  confidence: number;
}

const ACTION_PATTERNS: Array<{
  pattern: RegExp;
  action: string;
  extract: (match: RegExpMatchArray) => Record<string, any>;
}> = [
  // 打开/启动应用
  {
    pattern: /(?:打开|启动|运行|launch|open|start)\s+(.+?)(?:\s+应用|\s+程序|$)/i,
    action: 'launch',
    extract: (m) => ({ application: m[1].trim() }),
  },
  // 输入文字
  {
    pattern: /(?:输入|键入|打字|type|input)\s*[""'](.+?)[""']/i,
    action: 'type',
    extract: (m) => ({ text: m[1] }),
  },
  {
    pattern: /(?:输入|键入|打字|type|input)\s+(.+)/i,
    action: 'type',
    extract: (m) => ({ text: m[1].trim() }),
  },
  // 点击
  {
    pattern: /(?:点击|按下|click)\s+(?:坐标\s*)?(\d+)\s*[，,]\s*(\d+)/i,
    action: 'click',
    extract: (m) => ({ x: parseInt(m[1]), y: parseInt(m[2]) }),
  },
  {
    pattern: /(?:点击|按下|click)\s+(.+)/i,
    action: 'click_element',
    extract: (m) => ({ element: m[1].trim() }),
  },
  // 按键
  {
    pattern: /(?:按下|按|press)\s+(.+)/i,
    action: 'key',
    extract: (m) => ({ keys: m[1].trim() }),
  },
  // 等待
  {
    pattern: /(?:等待|等|wait)\s+(\d+)\s*(?:秒|秒钟|s|second)/i,
    action: 'wait',
    extract: (m) => ({ seconds: parseInt(m[1]) }),
  },
  // 截图
  {
    pattern: /(?:截图|截屏|screenshot|capture)/i,
    action: 'screenshot',
    extract: () => ({}),
  },
  // 切换窗口
  {
    pattern: /(?:切换到|切换|focus|switch)\s+(.+)/i,
    action: 'focus',
    extract: (m) => ({ application: m[1].trim() }),
  },
  // 滚动
  {
    pattern: /(?:向上|往上|scroll\s+up)/i,
    action: 'scroll',
    extract: () => ({ direction: 'up', amount: 3 }),
  },
  {
    pattern: /(?:向下|往下|scroll\s+down)/i,
    action: 'scroll',
    extract: () => ({ direction: 'down', amount: 3 }),
  },
  // 保存
  {
    pattern: /(?:保存|save)/i,
    action: 'save',
    extract: () => ({ keys: 'ctrl+s' }),
  },
  // 复制
  {
    pattern: /(?:复制|copy)\s*(全部|选中)?/i,
    action: 'copy',
    extract: (m) => {
      if (m[1] === '全部') return { keys: 'ctrl+a' };
      return { keys: 'ctrl+c' };
    },
  },
  // 粘贴
  {
    pattern: /(?:粘贴|paste)/i,
    action: 'paste',
    extract: () => ({ keys: 'ctrl+v' }),
  },
  // 撤销
  {
    pattern: /(?:撤销|undo)/i,
    action: 'undo',
    extract: () => ({ keys: 'ctrl+z' }),
  },
  // 全选
  {
    pattern: /(?:全选|select\s+all)/i,
    action: 'select_all',
    extract: () => ({ keys: 'ctrl+a' }),
  },
  // 关闭
  {
    pattern: /(?:关闭|close|exit|quit)/i,
    action: 'close',
    extract: () => ({ keys: 'alt+f4' }),
  },
  // 回车
  {
    pattern: /(?:回车|确认|enter|confirm|submit)/i,
    action: 'enter',
    extract: () => ({ keys: 'enter' }),
  },
  // Tab
  {
    pattern: /(?:tab|下一个)/i,
    action: 'tab',
    extract: () => ({ keys: 'tab' }),
  },
];

function parseNaturalLanguage(instruction: string): ParsedIntent[] {
  const intents: ParsedIntent[] = [];
  const sentences = instruction.split(/[，,；;。.、\n]+/).filter(Boolean);

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    let matched = false;
    for (const { pattern, action, extract } of ACTION_PATTERNS) {
      const match = trimmed.match(pattern);
      if (match) {
        intents.push({
          action,
          parameters: extract(match),
          confidence: 0.9,
        });
        matched = true;
        break;
      }
    }

    if (!matched) {
      // 尝试作为目标识别
      intents.push({
        action: 'unknown',
        target: trimmed,
        confidence: 0.3,
      });
    }
  }

  return intents;
}

// ── Workflow Generator ────────────────────────────────────────────────

function generateWorkflow(intents: ParsedIntent[]): AutomationWorkflow {
  const steps: AutomationStep[] = [];
  const workflowId = `auto_${Date.now()}`;

  for (const intent of intents) {
    switch (intent.action) {
      case 'launch':
        steps.push({
          tool: 'computer_launch',
          input: { application: intent.parameters?.application },
          description: `启动应用: ${intent.parameters?.application}`,
          waitFor: 2000,
        });
        steps.push({
          tool: 'computer_wait',
          input: { seconds: 2 },
          description: '等待应用启动',
        });
        break;

      case 'type':
        steps.push({
          tool: 'computer_type',
          input: { text: intent.parameters?.text },
          description: `输入文字: ${intent.parameters?.text}`,
        });
        break;

      case 'click':
        steps.push({
          tool: 'computer_click',
          input: {
            x: intent.parameters?.x,
            y: intent.parameters?.y,
            button: 'left',
            clickType: 'single',
          },
          description: `点击坐标: (${intent.parameters?.x}, ${intent.parameters?.y})`,
        });
        break;

      case 'click_element':
        steps.push({
          tool: 'computer_screenshot',
          input: {},
          description: '截图查找元素',
        });
        steps.push({
          tool: 'computer_wait',
          input: { seconds: 1 },
          description: '等待页面加载',
        });
        // 注：实际需要图像识别来定位元素
        break;

      case 'key':
        steps.push({
          tool: 'computer_key',
          input: { keys: intent.parameters?.keys },
          description: `按键: ${intent.parameters?.keys}`,
        });
        break;

      case 'wait':
        steps.push({
          tool: 'computer_wait',
          input: { seconds: intent.parameters?.seconds || 1 },
          description: `等待 ${intent.parameters?.seconds || 1} 秒`,
        });
        break;

      case 'screenshot':
        steps.push({
          tool: 'computer_screenshot',
          input: {},
          description: '截图',
        });
        break;

      case 'focus':
        steps.push({
          tool: 'computer_focus',
          input: { application: intent.parameters?.application },
          description: `切换到: ${intent.parameters?.application}`,
        });
        break;

      case 'scroll':
        steps.push({
          tool: 'computer_scroll',
          input: {
            direction: intent.parameters?.direction || 'down',
            amount: intent.parameters?.amount || 3,
          },
          description: `滚动: ${intent.parameters?.direction || 'down'}`,
        });
        break;

      case 'save':
      case 'copy':
      case 'paste':
      case 'undo':
      case 'select_all':
      case 'close':
      case 'enter':
      case 'tab':
        steps.push({
          tool: 'computer_key',
          input: { keys: intent.parameters?.keys },
          description: `按键: ${intent.parameters?.keys}`,
        });
        break;

      default:
        steps.push({
          tool: 'computer_wait',
          input: { seconds: 1 },
          description: `处理未知指令: ${intent.target}`,
          onError: 'skip',
        });
    }
  }

  return {
    id: workflowId,
    name: 'Auto Generated Workflow',
    description: `自动化工作流 - ${steps.length}个步骤`,
    steps,
    metadata: {
      createdAt: new Date().toISOString(),
      intentCount: intents.length,
    },
  };
}

// ── Workflow Templates ────────────────────────────────────────────────

const WORKFLOW_TEMPLATES: Record<string, AutomationWorkflow> = {
  'open-notepad-type': {
    id: 'template-open-notepad-type',
    name: '打开记事本并输入',
    description: '打开记事本应用程序并输入文字',
    steps: [
      {
        tool: 'computer_launch',
        input: { application: 'notepad' },
        description: '启动记事本',
        waitFor: 2000,
      },
      {
        tool: 'computer_wait',
        input: { seconds: 2 },
        description: '等待记事本启动',
      },
      {
        tool: 'computer_focus',
        input: { application: 'Notepad' },
        description: '切换到记事本窗口',
      },
      {
        tool: 'computer_type',
        input: { text: 'Hello, World!' },
        description: '输入文字',
      },
    ],
  },

  'open-browser-search': {
    id: 'template-open-browser-search',
    name: '打开浏览器并搜索',
    description: '打开浏览器，输入搜索关键词',
    steps: [
      {
        tool: 'computer_launch',
        input: { application: 'chrome' },
        description: '启动Chrome',
        waitFor: 3000,
      },
      {
        tool: 'computer_wait',
        input: { seconds: 3 },
        description: '等待浏览器启动',
      },
      {
        tool: 'computer_focus',
        input: { application: 'Chrome' },
        description: '切换到Chrome窗口',
      },
      {
        tool: 'computer_key',
        input: { keys: 'ctrl+l' },
        description: '聚焦地址栏',
      },
      {
        tool: 'computer_type',
        input: { text: 'https://www.google.com' },
        description: '输入Google地址',
      },
      {
        tool: 'computer_key',
        input: { keys: 'enter' },
        description: '打开Google',
      },
      {
        tool: 'computer_wait',
        input: { seconds: 2 },
        description: '等待页面加载',
      },
    ],
  },

  'screenshot-and-save': {
    id: 'template-screenshot-and-save',
    name: '截图并保存',
    description: '截取屏幕截图并保存',
    steps: [
      {
        tool: 'computer_screenshot',
        input: {},
        description: '截取屏幕',
      },
      {
        tool: 'computer_wait',
        input: { seconds: 1 },
        description: '等待截图完成',
      },
    ],
  },

  'text-editing-workflow': {
    id: 'template-text-editing',
    name: '文字编辑工作流',
    description: '常用的文字编辑操作序列',
    steps: [
      {
        tool: 'computer_key',
        input: { keys: 'ctrl+a' },
        description: '全选',
      },
      {
        tool: 'computer_key',
        input: { keys: 'ctrl+c' },
        description: '复制',
      },
      {
        tool: 'computer_key',
        input: { keys: 'ctrl+v' },
        description: '粘贴',
      },
    ],
  },

  'file-save-workflow': {
    id: 'template-file-save',
    name: '文件保存工作流',
    description: '保存当前文件',
    steps: [
      {
        tool: 'computer_key',
        input: { keys: 'ctrl+s' },
        description: '保存文件',
      },
      {
        tool: 'computer_wait',
        input: { seconds: 1 },
        description: '等待保存完成',
      },
    ],
  },
};

// ── Auto Orchestrator ─────────────────────────────────────────────────

export class AutoOrchestrator {
  private workflowHistory: ExecutionResult[] = [];

  async execute(instruction: string): Promise<ExecutionResult> {
    const startTime = Date.now();
    const executionId = `exec_${startTime}`;

    console.log(`[AutoOrchestrator] 执行指令: ${instruction}`);

    // 1. 检查是否匹配模板
    const templateMatch = this.findMatchingTemplate(instruction);
    if (templateMatch) {
      console.log(`[AutoOrchestrator] 匹配到模板: ${templateMatch.name}`);
      return this.executeWorkflow(templateMatch, executionId, startTime);
    }

    // 2. 解析自然语言
    const intents = parseNaturalLanguage(instruction);
    console.log(`[AutoOrchestrator] 识别到 ${intents.length} 个意图`);

    if (intents.length === 0) {
      return {
        success: false,
        workflowId: executionId,
        steps: [],
        totalDuration: Date.now() - startTime,
        summary: '无法识别指令，请尝试更明确的描述',
      };
    }

    // 3. 生成工作流
    const workflow = generateWorkflow(intents);
    console.log(`[AutoOrchestrator] 生成工作流: ${workflow.steps.length} 个步骤`);

    // 4. 执行工作流
    return this.executeWorkflow(workflow, executionId, startTime);
  }

  private findMatchingTemplate(instruction: string): AutomationWorkflow | null {
    const lowerInstruction = instruction.toLowerCase();

    // 检查常用模式
    if (lowerInstruction.includes('记事本') || lowerInstruction.includes('notepad')) {
      if (lowerInstruction.includes('打开') || lowerInstruction.includes('open')) {
        const template = { ...WORKFLOW_TEMPLATES['open-notepad-type'] };

        // 提取要输入的文字
        const typeMatch = instruction.match(/输入\s*[""']?(.+?)[""']?\s*$/);
        if (typeMatch) {
          template.steps = template.steps.map((step) => {
            if (step.tool === 'computer_type') {
              return { ...step, input: { text: typeMatch[1] } };
            }
            return step;
          });
        }

        return template;
      }
    }

    if (lowerInstruction.includes('浏览器') || lowerInstruction.includes('browser')) {
      if (lowerInstruction.includes('搜索') || lowerInstruction.includes('search')) {
        const template = { ...WORKFLOW_TEMPLATES['open-browser-search'] };

        // 提取搜索关键词
        const searchMatch = instruction.match(/搜索\s*[""']?(.+?)[""']?\s*$/);
        if (searchMatch) {
          // 修改模板以包含搜索
          template.steps.push({
            tool: 'computer_type',
            input: { text: searchMatch[1] },
            description: `输入搜索词: ${searchMatch[1]}`,
          });
          template.steps.push({
            tool: 'computer_key',
            input: { keys: 'enter' },
            description: '执行搜索',
          });
        }

        return template;
      }
    }

    if (lowerInstruction.includes('截图') || lowerInstruction.includes('screenshot')) {
      return WORKFLOW_TEMPLATES['screenshot-and-save'];
    }

    return null;
  }

  private async executeWorkflow(
    workflow: AutomationWorkflow,
    executionId: string,
    startTime: number
  ): Promise<ExecutionResult> {
    const steps: ExecutionResult['steps'] = [];
    let success = true;

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      const stepStartTime = Date.now();

      console.log(`[AutoOrchestrator] 执行步骤 ${i + 1}/${workflow.steps.length}: ${step.description}`);

      try {
        // 执行工具调用
        const result = await this.executeTool(step.tool, step.input);

        steps.push({
          stepIndex: i,
          description: step.description,
          tool: step.tool,
          success: !result.isError,
          output: result.output,
          duration: Date.now() - stepStartTime,
        });

        if (result.isError) {
          console.error(`[AutoOrchestrator] 步骤 ${i + 1} 失败: ${result.output}`);

          if (step.onError === 'abort') {
            success = false;
            break;
          } else if (step.onError === 'skip') {
            console.log(`[AutoOrchestrator] 跳过失败步骤`);
            continue;
          }
          // 默认重试一次
          else {
            console.log(`[AutoOrchestrator] 重试步骤 ${i + 1}`);
            const retryResult = await this.executeTool(step.tool, step.input);

            if (retryResult.isError) {
              success = false;
              if (step.onError !== 'skip' as string) break;
            }
          }
        }

        // 等待指定时间
        if (step.waitFor) {
          await this.delay(step.waitFor);
        }
      } catch (error: any) {
        console.error(`[AutoOrchestrator] 步骤 ${i + 1} 异常:`, error);

        steps.push({
          stepIndex: i,
          description: step.description,
          tool: step.tool,
          success: false,
          error: error.message,
          duration: Date.now() - stepStartTime,
        });

        success = false;
        if (step.onError !== 'skip') break;
      }
    }

    const result: ExecutionResult = {
      success,
      workflowId: executionId,
      steps,
      totalDuration: Date.now() - startTime,
      summary: this.generateSummary(steps, success),
    };

    this.workflowHistory.push(result);
    return result;
  }

  private async executeTool(toolName: string, input: Record<string, any>): Promise<ToolResult> {
    // 这里需要调用实际的工具执行器
    // 由于我们需要访问ToolRegistry，这里提供一个接口
    // 实际使用时需要注入工具执行器

    // 模拟执行（实际应该调用ToolRegistry.execute）
    return {
      output: `Executed ${toolName} with ${JSON.stringify(input)}`,
      isError: false,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private generateSummary(
    steps: ExecutionResult['steps'],
    success: boolean
  ): string {
    const totalSteps = steps.length;
    const successfulSteps = steps.filter((s) => s.success).length;
    const failedSteps = totalSteps - successfulSteps;

    if (success) {
      return `✅ 自动化执行完成: ${successfulSteps}/${totalSteps} 个步骤成功`;
    } else {
      return `❌ 自动化执行部分失败: ${successfulSteps}/${totalSteps} 个步骤成功, ${failedSteps} 个失败`;
    }
  }

  getTemplates(): Record<string, AutomationWorkflow> {
    return WORKFLOW_TEMPLATES;
  }

  getTemplate(name: string): AutomationWorkflow | null {
    return WORKFLOW_TEMPLATES[name] || null;
  }

  getExecutionHistory(): ExecutionResult[] {
    return this.workflowHistory;
  }
}

// ── Helper Functions ──────────────────────────────────────────────────

export function isAutomationInstruction(instruction: string): boolean {
  const keywords = [
    '打开', '启动', '输入', '点击', '按下', '等待', '截图',
    '切换', '滚动', '保存', '复制', '粘贴', '撤销', '关闭',
    'open', 'launch', 'start', 'type', 'input', 'click', 'press',
    'wait', 'screenshot', 'focus', 'switch', 'scroll', 'save',
    'copy', 'paste', 'undo', 'close',
  ];

  const lowerInstruction = instruction.toLowerCase();
  return keywords.some((keyword) => lowerInstruction.includes(keyword));
}

export function parseInstruction(instruction: string): AutomationStep[] {
  const intents = parseNaturalLanguage(instruction);
  const workflow = generateWorkflow(intents);
  return workflow.steps;
}
