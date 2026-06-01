import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AutoOrchestrator,
  isAutomationInstruction,
  parseInstruction,
} from '../auto-orchestrator';
import { getTemplateByName, fillTemplate, listAllTemplates } from '../workflow-templates';

describe('AutoOrchestrator', () => {
  let orchestrator: AutoOrchestrator;

  beforeEach(() => {
    orchestrator = new AutoOrchestrator();
  });

  describe('isAutomationInstruction', () => {
    it('should identify automation keywords in Chinese', () => {
      expect(isAutomationInstruction('打开记事本')).toBe(true);
      expect(isAutomationInstruction('输入文字')).toBe(true);
      expect(isAutomationInstruction('点击这里')).toBe(true);
      expect(isAutomationInstruction('保存文件')).toBe(true);
      expect(isAutomationInstruction('截图')).toBe(true);
    });

    it('should identify automation keywords in English', () => {
      expect(isAutomationInstruction('open notepad')).toBe(true);
      expect(isAutomationInstruction('type text')).toBe(true);
      expect(isAutomationInstruction('click here')).toBe(true);
      expect(isAutomationInstruction('save file')).toBe(true);
      expect(isAutomationInstruction('screenshot')).toBe(true);
    });

    it('should reject non-automation instructions', () => {
      expect(isAutomationInstruction('今天天气怎么样')).toBe(false);
      expect(isAutomationInstruction('什么是AI')).toBe(false);
      expect(isAutomationInstruction('帮我写代码')).toBe(false);
    });
  });

  describe('parseInstruction', () => {
    it('should parse type instruction with quotes', () => {
      const steps = parseInstruction('键入"Hello World"');
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0].tool).toBe('computer_type');
      expect(steps[0].input.text).toBe('Hello World');
    });

    it('should parse multiple instructions', () => {
      const steps = parseInstruction('截图，保存');
      expect(steps.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('execute', () => {
    it('should handle empty instruction', async () => {
      const result = await orchestrator.execute('');
      expect(result.success).toBe(false);
      expect(result.summary).toContain('无法识别指令');
    });

    it('should handle unknown instruction', async () => {
      const result = await orchestrator.execute('今天天气怎么样');
      // 由于会尝试解析任何指令，它可能会生成一个工作流
      expect(result).toBeDefined();
      expect(result.workflowId).toBeDefined();
    });

    it('should parse and generate workflow for known instruction', async () => {
      // Mock the executeTool function
      (orchestrator as any).executeTool = vi.fn().mockResolvedValue({
        output: 'Success',
        isError: false,
      });

      const result = await orchestrator.execute('打开记事本');
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.workflowId).toBeDefined();
    });
  });

  describe('getTemplates', () => {
    it('should return all templates', () => {
      const templates = orchestrator.getTemplates();
      expect(Object.keys(templates).length).toBeGreaterThan(0);
    });

    it('should get specific template by name', () => {
      const template = orchestrator.getTemplate('open-notepad-type');
      expect(template).toBeDefined();
      expect(template?.name).toBe('打开记事本并输入');
    });

    it('should return null for non-existent template', () => {
      const template = orchestrator.getTemplate('non-existent');
      expect(template).toBeNull();
    });
  });
});

describe('Workflow Templates', () => {
  describe('getTemplateByName', () => {
    it('should find template by exact name', () => {
      const template = getTemplateByName('open-notepad-and-type');
      expect(template).toBeDefined();
      expect(template?.id).toBe('tpl-notepad-type');
    });

    it('should return null for unknown template', () => {
      const template = getTemplateByName('unknown-template');
      expect(template).toBeNull();
    });
  });

  describe('fillTemplate', () => {
    it('should replace template variables', () => {
      const template = getTemplateByName('open-notepad-and-type');
      expect(template).toBeDefined();

      if (template) {
        const filled = fillTemplate(template, { text: 'Test Value' });
        const typeStep = filled.steps.find((s) => s.tool === 'computer_type');
        expect(typeStep?.input.text).toBe('Test Value');
      }
    });

    it('should replace multiple variables', () => {
      const template = getTemplateByName('notepad-new-file');
      expect(template).toBeDefined();

      if (template) {
        const filled = fillTemplate(template, {
          text: 'Content',
          filename: 'test.txt',
        });

        const typeSteps = filled.steps.filter((s) => s.tool === 'computer_type');
        expect(typeSteps.length).toBe(2);
        expect(typeSteps[0].input.text).toBe('Content');
        expect(typeSteps[1].input.text).toBe('test.txt');
      }
    });

    it('should leave unreplaced variables as-is', () => {
      const template = getTemplateByName('open-notepad-and-type');
      expect(template).toBeDefined();

      if (template) {
        const filled = fillTemplate(template, {});
        const typeStep = filled.steps.find((s) => s.tool === 'computer_type');
        expect(typeStep?.input.text).toBe('{{text}}');
      }
    });
  });

  describe('listAllTemplates', () => {
    it('should return list of all templates', () => {
      const templates = listAllTemplates();
      expect(templates.length).toBeGreaterThan(0);

      // Check structure
      const first = templates[0];
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('category');
      expect(first).toHaveProperty('description');
      expect(first).toHaveProperty('stepCount');
    });

    it('should include templates from all categories', () => {
      const templates = listAllTemplates();
      const categories = new Set(templates.map((t) => t.category));

      expect(categories.has('记事本')).toBe(true);
      expect(categories.has('浏览器')).toBe(true);
      expect(categories.has('文件')).toBe(true);
      expect(categories.has('文本编辑')).toBe(true);
      expect(categories.has('IDE')).toBe(true);
      expect(categories.has('系统')).toBe(true);
    });
  });
});

describe('Natural Language Parsing', () => {
  describe('Chinese Instructions', () => {
    it('should parse "截图"', () => {
      const steps = parseInstruction('截图');
      expect(steps[0].tool).toBe('computer_screenshot');
    });

    it('should parse "保存"', () => {
      const steps = parseInstruction('保存');
      expect(steps[0].tool).toBe('computer_key');
      expect(steps[0].input.keys).toBe('ctrl+s');
    });

    it('should parse "复制"', () => {
      const steps = parseInstruction('复制');
      expect(steps[0].tool).toBe('computer_key');
      expect(steps[0].input.keys).toBe('ctrl+c');
    });

    it('should parse "粘贴"', () => {
      const steps = parseInstruction('粘贴');
      expect(steps[0].tool).toBe('computer_key');
      expect(steps[0].input.keys).toBe('ctrl+v');
    });

    it('should parse "按下回车"', () => {
      const steps = parseInstruction('按下回车');
      expect(steps[0].tool).toBe('computer_key');
      expect(steps[0].input.keys).toBe('enter');
    });
  });

  describe('English Instructions', () => {
    it('should parse "open notepad"', () => {
      const steps = parseInstruction('open notepad');
      expect(steps[0].tool).toBe('computer_launch');
    });

    it('should parse "type hello"', () => {
      const steps = parseInstruction('type hello');
      expect(steps[0].tool).toBe('computer_type');
    });

    it('should parse "press enter"', () => {
      const steps = parseInstruction('press enter');
      expect(steps[0].tool).toBe('computer_key');
    });

    it('should parse "wait 2 seconds"', () => {
      const steps = parseInstruction('wait 2 seconds');
      expect(steps[0].tool).toBe('computer_wait');
    });

    it('should parse "save"', () => {
      const steps = parseInstruction('save');
      expect(steps[0].tool).toBe('computer_key');
      expect(steps[0].input.keys).toBe('ctrl+s');
    });
  });

  describe('Complex Instructions', () => {
    it('should parse comma-separated instructions', () => {
      const steps = parseInstruction('打开记事本，输入Hello，保存');
      expect(steps.length).toBeGreaterThanOrEqual(3);
    });

    it('should parse semicolon-separated instructions', () => {
      const steps = parseInstruction('打开浏览器;搜索天气;截图');
      expect(steps.length).toBeGreaterThanOrEqual(3);
    });

    it('should parse newline-separated instructions', () => {
      const steps = parseInstruction('打开记事本\n输入文字\n保存');
      expect(steps.length).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('Edge Cases', () => {
  it('should handle empty string', () => {
    const steps = parseInstruction('');
    expect(steps.length).toBe(0);
  });

  it('should handle whitespace-only string', () => {
    const steps = parseInstruction('   ');
    expect(steps.length).toBe(0);
  });

  it('should handle instruction with no automation keywords', () => {
    const result = isAutomationInstruction('今天是星期几');
    expect(result).toBe(false);
  });

  it('should handle mixed language instruction', () => {
    const steps = parseInstruction('open 记事本 and type Hello');
    expect(steps.length).toBeGreaterThan(0);
  });
});
