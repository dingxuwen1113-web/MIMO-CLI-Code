import { describe, it, expect, beforeEach } from 'vitest';
import { MimoDispatchEngine } from '../mimo-engine';
import type { DispatchContext, IntentAnalysis, ExecutionPlan } from '../mimo-engine';

describe('MimoDispatchEngine', () => {
  let engine: MimoDispatchEngine;
  let context: DispatchContext;

  beforeEach(() => {
    engine = new MimoDispatchEngine();
    context = {
      conversationHistory: [],
      sessionId: 'test-session',
      currentMode: 'agent',
      projectDir: '/test/project',
      modifiedFiles: [],
      turnCount: 0,
      availableTools: ['file_read', 'file_write', 'shell_exec', 'git_status'],
      previousErrors: 0,
    };
  });

  describe('analyzeIntent', () => {
    it('should classify coding tasks', () => {
      const analysis = engine.analyzeIntent('帮我写一个函数来处理用户登录', context);
      expect(analysis.primaryTask).toBe('coding');
      expect(analysis.language).toBe('zh');
    });

    it('should classify debugging tasks', () => {
      const analysis = engine.analyzeIntent('Fix the bug in the authentication module', context);
      expect(analysis.primaryTask).toBe('debugging');
      expect(analysis.language).toBe('en');
    });

    it('should classify architecture tasks', () => {
      const analysis = engine.analyzeIntent('重构这个模块的架构设计', context);
      expect(analysis.primaryTask).toBe('architecture');
      expect(analysis.complexity).toBe('complex');
    });

    it('should classify research tasks', () => {
      const analysis = engine.analyzeIntent('请帮我研究一下这个技术方案的可行性并给出详细报告', context);
      expect(['research', 'architecture']).toContain(analysis.primaryTask);
    });

    it('should classify conversation tasks', () => {
      const analysis = engine.analyzeIntent('你好，请问这个项目是做什么的？', context);
      expect(analysis.primaryTask).toBe('conversation');
    });

    it('should classify security tasks', () => {
      const analysis = engine.analyzeIntent('进行安全审计，检查SQL注入和XSS漏洞', context);
      expect(['security', 'research']).toContain(analysis.primaryTask);
    });

    it('should classify testing tasks', () => {
      const analysis = engine.analyzeIntent('Write unit tests and integration tests for the auth module', context);
      expect(['testing', 'coding']).toContain(analysis.primaryTask);
    });

    it('should detect Chinese language', () => {
      const analysis = engine.analyzeIntent('帮我写代码', context);
      expect(analysis.language).toBe('zh');
    });

    it('should detect English language', () => {
      const analysis = engine.analyzeIntent('Write code for the login function', context);
      expect(analysis.language).toBe('en');
    });

    it('should detect mixed language', () => {
      const analysis = engine.analyzeIntent('帮我fix这个bug', context);
      expect(['zh', 'mixed']).toContain(analysis.language);
    });

    it('should detect simple complexity', () => {
      const analysis = engine.analyzeIntent('查看文件内容', context);
      expect(analysis.complexity).toBe('simple');
    });

    it('should detect complex complexity', () => {
      const analysis = engine.analyzeIntent('重构整个系统架构，需要修改多个模块并优化性能', context);
      expect(analysis.complexity).toBe('complex');
    });

    it('should detect immediate urgency', () => {
      const analysis = engine.analyzeIntent('紧急修复生产环境的崩溃问题', context);
      expect(analysis.urgency).toBe('immediate');
    });

    it('should detect file ops capability', () => {
      const analysis = engine.analyzeIntent('读取src/index.ts文件', context);
      expect(analysis.capabilities.fileOps).toBe(true);
    });

    it('should detect git capability', () => {
      const analysis = engine.analyzeIntent('查看git log最近的提交', context);
      expect(analysis.capabilities.git).toBe(true);
    });

    it('should detect web capability', () => {
      const analysis = engine.analyzeIntent('搜索一下React的最新文档', context);
      expect(analysis.capabilities.web).toBe(true);
    });

    it('should boost debugging confidence with previous errors', () => {
      const ctxWithErrors = { ...context, previousErrors: 3 };
      const analysis = engine.analyzeIntent('这个函数有问题', ctxWithErrors);
      expect(analysis.primaryTask).toBe('debugging');
    });

    it('should extract keywords', () => {
      const analysis = engine.analyzeIntent('implement the authentication module with JWT tokens', context);
      expect(analysis.keywords.length).toBeGreaterThan(0);
      expect(analysis.keywords).toContain('implement');
    });

    it('should extract file path entities', () => {
      const analysis = engine.analyzeIntent('读取 src/index.ts 文件', context);
      expect(analysis.entities.some(e => e.includes('index.ts'))).toBe(true);
    });

    it('should have confidence score', () => {
      const analysis = engine.analyzeIntent('写代码', context);
      expect(analysis.confidence).toBeGreaterThanOrEqual(0);
      expect(analysis.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('createPlan', () => {
    it('should create a plan for coding tasks', () => {
      const analysis = engine.analyzeIntent('实现用户认证功能', context);
      const plan = engine.createPlan(analysis);

      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.estimatedTotalTokens).toBeGreaterThan(0);
      expect(plan.strategy).toBeDefined();
      expect(plan.modelRecommendation).toBeDefined();
    });

    it('should include verification step for coding tasks', () => {
      const analysis: IntentAnalysis = {
        primaryTask: 'coding',
        secondaryTasks: [],
        complexity: 'moderate',
        urgency: 'normal',
        capabilities: { fileOps: true, shell: false, web: false, git: false, browser: false, image: false, notebook: false, lsp: false, rlm: false, audit: false },
        language: 'en',
        confidence: 0.8,
        keywords: [],
        entities: [],
      };
      const plan = engine.createPlan(analysis);
      expect(plan.steps.some(s => s.type === 'verification')).toBe(true);
    });

    it('should recommend pro model for complex tasks', () => {
      const analysis: IntentAnalysis = {
        primaryTask: 'architecture',
        secondaryTasks: [],
        complexity: 'complex',
        urgency: 'normal',
        capabilities: { fileOps: true, shell: false, web: false, git: false, browser: false, image: false, notebook: false, lsp: false, rlm: false, audit: false },
        language: 'en',
        confidence: 0.9,
        keywords: [],
        entities: [],
      };
      const plan = engine.createPlan(analysis);
      expect(plan.modelRecommendation).toBe('mimo-v2.5-pro');
    });

    it('should recommend base model for simple conversation', () => {
      const analysis: IntentAnalysis = {
        primaryTask: 'conversation',
        secondaryTasks: [],
        complexity: 'simple',
        urgency: 'normal',
        capabilities: { fileOps: false, shell: false, web: false, git: false, browser: false, image: false, notebook: false, lsp: false, rlm: false, audit: false },
        language: 'en',
        confidence: 0.7,
        keywords: [],
        entities: [],
      };
      const plan = engine.createPlan(analysis);
      expect(plan.modelRecommendation).toBe('mimo-v2.5');
    });

    it('should use mixed strategy when parallel steps exist', () => {
      const analysis: IntentAnalysis = {
        primaryTask: 'coding',
        secondaryTasks: [],
        complexity: 'moderate',
        urgency: 'normal',
        capabilities: { fileOps: true, shell: true, web: false, git: true, browser: false, image: false, notebook: false, lsp: false, rlm: false, audit: false },
        language: 'en',
        confidence: 0.8,
        keywords: [],
        entities: [],
      };
      const plan = engine.createPlan(analysis);
      expect(plan.strategy).toBe('mixed');
    });
  });

  describe('executePlan', () => {
    it('should execute a simple plan successfully', async () => {
      const plan: ExecutionPlan = {
        id: 'test-plan',
        steps: [
          {
            id: 'step_1',
            type: 'analysis',
            description: 'Test step',
            dependsOn: [],
            parallel: false,
            status: 'pending',
            estimatedTokens: 100,
            retryPolicy: { maxRetries: 1, backoffMs: 0 },
          },
        ],
        estimatedTotalTokens: 100,
        estimatedDurationMs: 1000,
        strategy: 'sequential',
        modelRecommendation: 'mimo-v2.5',
      };

      const result = await engine.executePlan(plan, async (step) => {
        return { success: true, step: step.id };
      });

      expect(result.completedSteps).toBe(1);
      expect(result.failedSteps).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle step failures gracefully', async () => {
      const plan: ExecutionPlan = {
        id: 'test-plan-fail',
        steps: [
          {
            id: 'step_1',
            type: 'tool_call',
            description: 'Failing step',
            dependsOn: [],
            parallel: false,
            status: 'pending',
            estimatedTokens: 100,
            retryPolicy: { maxRetries: 0, backoffMs: 0 },
          },
        ],
        estimatedTotalTokens: 100,
        estimatedDurationMs: 1000,
        strategy: 'sequential',
        modelRecommendation: 'mimo-v2.5',
      };

      const result = await engine.executePlan(plan, async () => {
        throw new Error('Test error');
      });

      expect(result.completedSteps).toBe(0);
      expect(result.failedSteps).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should retry failed steps', async () => {
      let attempts = 0;
      const plan: ExecutionPlan = {
        id: 'test-plan-retry',
        steps: [
          {
            id: 'step_1',
            type: 'tool_call',
            description: 'Retry step',
            dependsOn: [],
            parallel: false,
            status: 'pending',
            estimatedTokens: 100,
            retryPolicy: { maxRetries: 2, backoffMs: 0 },
          },
        ],
        estimatedTotalTokens: 100,
        estimatedDurationMs: 1000,
        strategy: 'sequential',
        modelRecommendation: 'mimo-v2.5',
      };

      const result = await engine.executePlan(plan, async () => {
        attempts++;
        if (attempts < 3) throw new Error('Temporary error');
        return { success: true };
      });

      expect(result.completedSteps).toBe(1);
      expect(attempts).toBe(3);
    });

    it('should execute parallel steps concurrently', async () => {
      const executionOrder: string[] = [];
      const plan: ExecutionPlan = {
        id: 'test-plan-parallel',
        steps: [
          {
            id: 'step_1',
            type: 'analysis',
            description: 'First step',
            dependsOn: [],
            parallel: false,
            status: 'pending',
            estimatedTokens: 100,
            retryPolicy: { maxRetries: 0, backoffMs: 0 },
          },
          {
            id: 'step_2',
            type: 'tool_call',
            description: 'Parallel A',
            dependsOn: ['step_1'],
            parallel: true,
            status: 'pending',
            estimatedTokens: 100,
            retryPolicy: { maxRetries: 0, backoffMs: 0 },
          },
          {
            id: 'step_3',
            type: 'tool_call',
            description: 'Parallel B',
            dependsOn: ['step_1'],
            parallel: true,
            status: 'pending',
            estimatedTokens: 100,
            retryPolicy: { maxRetries: 0, backoffMs: 0 },
          },
        ],
        estimatedTotalTokens: 300,
        estimatedDurationMs: 2000,
        strategy: 'mixed',
        modelRecommendation: 'mimo-v2.5',
      };

      const result = await engine.executePlan(plan, async (step) => {
        executionOrder.push(step.id);
        return { done: true };
      });

      expect(result.completedSteps).toBe(3);
      expect(result.failedSteps).toBe(0);
    });
  });

  describe('dispatch', () => {
    it('should return complete dispatch result', () => {
      const result = engine.dispatch('帮我写一个用户登录功能', context);

      expect(result.analysis).toBeDefined();
      expect(result.plan).toBeDefined();
      expect(result.recommendation).toBeDefined();
      expect(result.nextSteps).toBeDefined();
      expect(result.nextSteps.length).toBeGreaterThan(0);
    });

    it('should include plan steps in next steps', () => {
      const result = engine.dispatch('Fix the authentication bug', context);
      expect(result.nextSteps.some(s => s.startsWith('['))).toBe(true);
    });
  });
});
