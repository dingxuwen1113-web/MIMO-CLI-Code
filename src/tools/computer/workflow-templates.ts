/**
 * 预定义的工作流模板库
 * 包含常用的自动化操作模式
 */

import { AutomationWorkflow } from './auto-orchestrator';

// ── 应用程序操作模板 ─────────────────────────────────────────────────

export const NOTEPAD_TEMPLATES: Record<string, AutomationWorkflow> = {
  // 打开记事本并输入文字
  'open-notepad-and-type': {
    id: 'tpl-notepad-type',
    name: '打开记事本并输入',
    description: '启动记事本，等待加载，切换焦点，输入指定文字',
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
        input: { text: '{{text}}' },  // 模板变量
        description: '输入文字: {{text}}',
      },
    ],
  },

  // 在记事本中创建新文件
  'notepad-new-file': {
    id: 'tpl-notepad-new',
    name: '记事本新建文件',
    description: '打开记事本，创建新文件，输入内容，保存',
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
        tool: 'computer_key',
        input: { keys: 'ctrl+n' },
        description: '新建文件',
      },
      {
        tool: 'computer_type',
        input: { text: '{{text}}' },
        description: '输入内容',
      },
      {
        tool: 'computer_key',
        input: { keys: 'ctrl+s' },
        description: '保存文件',
      },
      {
        tool: 'computer_wait',
        input: { seconds: 1 },
        description: '等待保存对话框',
      },
      {
        tool: 'computer_type',
        input: { text: '{{filename}}' },
        description: '输入文件名',
      },
      {
        tool: 'computer_key',
        input: { keys: 'enter' },
        description: '确认保存',
      },
    ],
  },
};

// ── 浏览器操作模板 ─────────────────────────────────────────────────

export const BROWSER_TEMPLATES: Record<string, AutomationWorkflow> = {
  // 打开浏览器并访问URL
  'open-browser-url': {
    id: 'tpl-browser-url',
    name: '浏览器打开网址',
    description: '打开Chrome浏览器，访问指定URL',
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
        input: { text: '{{url}}' },
        description: '输入网址: {{url}}',
      },
      {
        tool: 'computer_key',
        input: { keys: 'enter' },
        description: '打开网页',
      },
      {
        tool: 'computer_wait',
        input: { seconds: 2 },
        description: '等待页面加载',
      },
    ],
  },

  // 浏览器搜索
  'browser-search': {
    id: 'tpl-browser-search',
    name: '浏览器搜索',
    description: '在Google搜索指定关键词',
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
        description: '等待Google加载',
      },
      {
        tool: 'computer_type',
        input: { text: '{{query}}' },
        description: '输入搜索词: {{query}}',
      },
      {
        tool: 'computer_key',
        input: { keys: 'enter' },
        description: '执行搜索',
      },
      {
        tool: 'computer_wait',
        input: { seconds: 2 },
        description: '等待搜索结果',
      },
    ],
  },

  // 浏览器截图
  'browser-screenshot': {
    id: 'tpl-browser-screenshot',
    name: '浏览器截图',
    description: '打开浏览器并截图',
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
        tool: 'computer_screenshot',
        input: {},
        description: '截图',
      },
    ],
  },
};

// ── 文件操作模板 ─────────────────────────────────────────────────────

export const FILE_TEMPLATES: Record<string, AutomationWorkflow> = {
  // 截图并保存
  'screenshot-save': {
    id: 'tpl-screenshot-save',
    name: '截图并保存',
    description: '截取屏幕并保存到文件',
    steps: [
      {
        tool: 'computer_screenshot',
        input: {},
        description: '截取屏幕',
      },
      {
        tool: 'computer_key',
        input: { keys: 'ctrl+s' },
        description: '打开保存对话框',
      },
      {
        tool: 'computer_wait',
        input: { seconds: 1 },
        description: '等待对话框',
      },
      {
        tool: 'computer_type',
        input: { text: '{{filename}}' },
        description: '输入文件名: {{filename}}',
      },
      {
        tool: 'computer_key',
        input: { keys: 'enter' },
        description: '确认保存',
      },
    ],
  },

  // 打开文件管理器
  'open-file-explorer': {
    id: 'tpl-file-explorer',
    name: '打开文件管理器',
    description: '打开Windows资源管理器',
    steps: [
      {
        tool: 'computer_launch',
        input: { application: 'explorer' },
        description: '打开资源管理器',
        waitFor: 1500,
      },
      {
        tool: 'computer_wait',
        input: { seconds: 1.5 },
        description: '等待资源管理器启动',
      },
      {
        tool: 'computer_focus',
        input: { application: 'File Explorer' },
        description: '切换到资源管理器',
      },
    ],
  },
};

// ── 文本编辑模板 ─────────────────────────────────────────────────────

export const TEXT_EDITING_TEMPLATES: Record<string, AutomationWorkflow> = {
  // 全选复制粘贴
  'copy-all-paste': {
    id: 'tpl-copy-paste',
    name: '全选复制粘贴',
    description: '全选内容，复制，然后粘贴',
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

  // 查找替换
  'find-replace': {
    id: 'tpl-find-replace',
    name: '查找替换',
    description: '打开查找替换对话框',
    steps: [
      {
        tool: 'computer_key',
        input: { keys: 'ctrl+h' },
        description: '打开查找替换',
      },
      {
        tool: 'computer_wait',
        input: { seconds: 0.5 },
        description: '等待对话框',
      },
      {
        tool: 'computer_type',
        input: { text: '{{find}}' },
        description: '输入查找内容: {{find}}',
      },
      {
        tool: 'computer_key',
        input: { keys: 'tab' },
        description: '切换到替换字段',
      },
      {
        tool: 'computer_type',
        input: { text: '{{replace}}' },
        description: '输入替换内容: {{replace}}',
      },
    ],
  },

  // 撤销重做
  'undo-redo': {
    id: 'tpl-undo-redo',
    name: '撤销重做',
    description: '撤销上一步操作，然后重做',
    steps: [
      {
        tool: 'computer_key',
        input: { keys: 'ctrl+z' },
        description: '撤销',
      },
      {
        tool: 'computer_wait',
        input: { seconds: 0.5 },
        description: '等待',
      },
      {
        tool: 'computer_key',
        input: { keys: 'ctrl+y' },
        description: '重做',
      },
    ],
  },
};

// ── IDE操作模板 ──────────────────────────────────────────────────────

export const IDE_TEMPLATES: Record<string, AutomationWorkflow> = {
  // VS Code 操作
  'vscode-open-file': {
    id: 'tpl-vscode-open',
    name: 'VS Code打开文件',
    description: '在VS Code中打开文件',
    steps: [
      {
        tool: 'computer_key',
        input: { keys: 'ctrl+o' },
        description: '打开文件对话框',
      },
      {
        tool: 'computer_wait',
        input: { seconds: 0.5 },
        description: '等待对话框',
      },
      {
        tool: 'computer_type',
        input: { text: '{{filepath}}' },
        description: '输入文件路径: {{filepath}}',
      },
      {
        tool: 'computer_key',
        input: { keys: 'enter' },
        description: '打开文件',
      },
    ],
  },

  // VS Code 保存并运行
  'vscode-save-run': {
    id: 'tpl-vscode-run',
    name: 'VS Code保存并运行',
    description: '在VS Code中保存文件并运行',
    steps: [
      {
        tool: 'computer_key',
        input: { keys: 'ctrl+s' },
        description: '保存文件',
      },
      {
        tool: 'computer_key',
        input: { keys: 'ctrl+`' },
        description: '打开终端',
      },
      {
        tool: 'computer_wait',
        input: { seconds: 0.5 },
        description: '等待终端打开',
      },
      {
        tool: 'computer_type',
        input: { text: '{{command}}' },
        description: '输入命令: {{command}}',
      },
      {
        tool: 'computer_key',
        input: { keys: 'enter' },
        description: '执行命令',
      },
    ],
  },

  // VS Code 格式化代码
  'vscode-format': {
    id: 'tpl-vscode-format',
    name: 'VS Code格式化代码',
    description: '在VS Code中格式化当前文件',
    steps: [
      {
        tool: 'computer_key',
        input: { keys: 'shift+alt+f' },
        description: '格式化文档',
      },
    ],
  },
};

// ── 系统操作模板 ─────────────────────────────────────────────────────

export const SYSTEM_TEMPLATES: Record<string, AutomationWorkflow> = {
  // 打开计算器
  'open-calculator': {
    id: 'tpl-calculator',
    name: '打开计算器',
    description: '打开Windows计算器',
    steps: [
      {
        tool: 'computer_launch',
        input: { application: 'Calculator' },
        description: '启动计算器',
        waitFor: 1500,
      },
      {
        tool: 'computer_wait',
        input: { seconds: 1.5 },
        description: '等待计算器启动',
      },
      {
        tool: 'computer_focus',
        input: { application: 'Calculator' },
        description: '切换到计算器',
      },
    ],
  },

  // 打开任务管理器
  'open-task-manager': {
    id: 'tpl-task-manager',
    name: '打开任务管理器',
    description: '打开Windows任务管理器',
    steps: [
      {
        tool: 'computer_key',
        input: { keys: 'ctrl+shift+esc' },
        description: '打开任务管理器',
      },
      {
        tool: 'computer_wait',
        input: { seconds: 2 },
        description: '等待任务管理器启动',
      },
    ],
  },

  // 锁屏
  'lock-screen': {
    id: 'tpl-lock-screen',
    name: '锁屏',
    description: '锁定Windows屏幕',
    steps: [
      {
        tool: 'computer_key',
        input: { keys: 'meta+l' },
        description: '锁屏',
      },
    ],
  },
};

// ── 汇总所有模板 ─────────────────────────────────────────────────────

export const ALL_TEMPLATES: Record<string, AutomationWorkflow> = {
  ...NOTEPAD_TEMPLATES,
  ...BROWSER_TEMPLATES,
  ...FILE_TEMPLATES,
  ...TEXT_EDITING_TEMPLATES,
  ...IDE_TEMPLATES,
  ...SYSTEM_TEMPLATES,
};

// ── 模板查询函数 ─────────────────────────────────────────────────────

export function getTemplateByName(name: string): AutomationWorkflow | null {
  return ALL_TEMPLATES[name] || null;
}

export function getTemplatesByCategory(category: string): Record<string, AutomationWorkflow> {
  switch (category.toLowerCase()) {
    case 'notepad':
    case '记事本':
      return NOTEPAD_TEMPLATES;
    case 'browser':
    case '浏览器':
      return BROWSER_TEMPLATES;
    case 'file':
    case '文件':
      return FILE_TEMPLATES;
    case 'text':
    case '文本':
    case '编辑':
      return TEXT_EDITING_TEMPLATES;
    case 'ide':
    case 'vscode':
    case '编辑器':
      return IDE_TEMPLATES;
    case 'system':
    case '系统':
      return SYSTEM_TEMPLATES;
    default:
      return ALL_TEMPLATES;
  }
}

export function listAllTemplates(): Array<{
  name: string;
  category: string;
  description: string;
  stepCount: number;
}> {
  const templates: Array<{
    name: string;
    category: string;
    description: string;
    stepCount: number;
  }> = [];

  const addTemplates = (
    templatesObj: Record<string, AutomationWorkflow>,
    category: string
  ) => {
    for (const [name, workflow] of Object.entries(templatesObj)) {
      templates.push({
        name,
        category,
        description: workflow.description,
        stepCount: workflow.steps.length,
      });
    }
  };

  addTemplates(NOTEPAD_TEMPLATES, '记事本');
  addTemplates(BROWSER_TEMPLATES, '浏览器');
  addTemplates(FILE_TEMPLATES, '文件');
  addTemplates(TEXT_EDITING_TEMPLATES, '文本编辑');
  addTemplates(IDE_TEMPLATES, 'IDE');
  addTemplates(SYSTEM_TEMPLATES, '系统');

  return templates;
}

// ── 模板变量替换 ─────────────────────────────────────────────────────

export function fillTemplate(
  template: AutomationWorkflow,
  variables: Record<string, string>
): AutomationWorkflow {
  const filledSteps = template.steps.map((step) => {
    const filledInput: Record<string, any> = {};

    for (const [key, value] of Object.entries(step.input)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        const varName = value.slice(2, -2);
        filledInput[key] = variables[varName] || value;
      } else {
        filledInput[key] = value;
      }
    }

    let filledDescription = step.description;
    for (const [varName, varValue] of Object.entries(variables)) {
      filledDescription = filledDescription.replace(
        new RegExp(`\\{\\{${varName}\\}\\}`, 'g'),
        varValue
      );
    }

    return {
      ...step,
      input: filledInput,
      description: filledDescription,
    };
  });

  return {
    ...template,
    steps: filledSteps,
  };
}
