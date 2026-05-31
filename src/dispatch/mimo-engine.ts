import createDebug from 'debug';

const debug = createDebug('mimo:dispatch');

// ─── Intent Analysis Types ──────────────────────────────────────────

export type TaskType =
  | 'coding'
  | 'debugging'
  | 'architecture'
  | 'research'
  | 'conversation'
  | 'system-management'
  | 'devops'
  | 'security'
  | 'testing'
  | 'documentation';

export type ComplexityLevel = 'simple' | 'moderate' | 'complex';
export type UrgencyLevel = 'immediate' | 'normal' | 'deferred';

export interface RequiredCapabilities {
  fileOps: boolean;
  shell: boolean;
  web: boolean;
  git: boolean;
  browser: boolean;
  image: boolean;
  notebook: boolean;
  lsp: boolean;
  rlm: boolean;
  audit: boolean;
}

export interface IntentAnalysis {
  primaryTask: TaskType;
  secondaryTasks: TaskType[];
  complexity: ComplexityLevel;
  urgency: UrgencyLevel;
  capabilities: RequiredCapabilities;
  language: 'zh' | 'en' | 'mixed';
  confidence: number;
  keywords: string[];
  entities: string[];
}

// ─── Execution Plan Types ───────────────────────────────────────────

export type StepType = 'tool_call' | 'agent_spawn' | 'analysis' | 'verification' | 'decision';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface PlanStep {
  id: string;
  type: StepType;
  description: string;
  toolName?: string;
  toolInput?: Record<string, any>;
  dependsOn: string[];
  parallel: boolean;
  status: StepStatus;
  result?: any;
  estimatedTokens: number;
  retryPolicy: { maxRetries: number; backoffMs: number };
}

export interface ExecutionPlan {
  id: string;
  steps: PlanStep[];
  estimatedTotalTokens: number;
  estimatedDurationMs: number;
  strategy: 'sequential' | 'parallel' | 'mixed';
  modelRecommendation: string;
}

// ─── Dispatch Context ───────────────────────────────────────────────

export interface DispatchContext {
  conversationHistory: Array<{ role: string; content: any }>;
  sessionId: string;
  currentMode: string;
  projectDir: string;
  modifiedFiles: string[];
  turnCount: number;
  availableTools: string[];
  previousErrors: number;
}

// ─── Execution Result ───────────────────────────────────────────────

export interface ExecutionResult {
  planId: string;
  completedSteps: number;
  failedSteps: number;
  totalSteps: number;
  results: Map<string, any>;
  errors: string[];
  tokensUsed: number;
  durationMs: number;
}

export interface DispatchResult {
  analysis: IntentAnalysis;
  plan: ExecutionPlan;
  execution: ExecutionResult;
  recommendation: string;
  nextSteps: string[];
}

// ─── Keyword Patterns ───────────────────────────────────────────────

const TASK_PATTERNS: Record<TaskType, { zh: RegExp[]; en: RegExp[] }> = {
  coding: {
    zh: [/写代码|实现|编写|创建|开发|添加功能|写一个|实现一个|代码|编程/],
    en: [/implement|write code|create|develop|add feature|build|code|program|function|class|module/i],
  },
  debugging: {
    zh: [/调试|修复|bug|错误|异常|崩溃|排错|诊断|出问题|不工作|报错/],
    en: [/debug|fix|bug|error|crash|broken|issue|problem|fault|diagnose|troubleshoot/i],
  },
  architecture: {
    zh: [/架构|设计|重构|优化|模式|方案|设计模式|系统设计|拆分|解耦/],
    en: [/architect|design|refactor|optimize|pattern|system design|restructure|decouple/i],
  },
  research: {
    zh: [/分析|研究|调查|探索|了解|查看|检查|解释|说明|什么是/],
    en: [/analyze|research|investigate|explore|understand|examine|explain|what is|how does/i],
  },
  conversation: {
    zh: [/你好|谢谢|帮忙|请问|告诉我|你觉得|推荐|建议/],
    en: [/hello|hi|thanks|help|tell me|what do you think|recommend|suggest/i],
  },
  'system-management': {
    zh: [/配置|设置|安装|部署|环境|依赖|更新|升级|迁移/],
    en: [/config|setup|install|deploy|environment|dependency|update|upgrade|migrate/i],
  },
  devops: {
    zh: [/部署|CI|CD|管道|构建|发布|容器|Docker|K8s|监控/],
    en: [/deploy|CI\/CD|pipeline|build|release|container|docker|k8s|monitor/i],
  },
  security: {
    zh: [/安全|漏洞|权限|加密|认证|授权|注入|XSS|CSRF/],
    en: [/security|vulnerability|permission|encrypt|auth|inject|XSS|CSRF/i],
  },
  testing: {
    zh: [/测试|单元测试|集成测试|端到端|覆盖率|断言|mock/],
    en: [/test|unit test|integration test|e2e|coverage|assert|mock/i],
  },
  documentation: {
    zh: [/文档|README|注释|说明|API文档|变更日志|CHANGELOG/],
    en: [/document|README|comment|docs|API doc|changelog/i],
  },
};

const CAPABILITY_KEYWORDS: Record<keyof RequiredCapabilities, { zh: RegExp[]; en: RegExp[] }> = {
  fileOps: {
    zh: [/文件|读取|写入|编辑|创建文件|删除文件/],
    en: [/file|read|write|edit|create file|delete file/i],
  },
  shell: {
    zh: [/运行|执行|命令|终端|shell|npm|yarn|pip|cargo/],
    en: [/run|execute|command|terminal|shell|npm|yarn|pip|cargo/i],
  },
  web: {
    zh: [/搜索|网页|URL|链接|API|请求|下载/],
    en: [/search|web|URL|link|API|request|download|fetch/i],
  },
  git: {
    zh: [/git|提交|分支|合并|拉取|推送|版本控制|PR|merge/],
    en: [/git|commit|branch|merge|pull|push|version control|PR/i],
  },
  browser: {
    zh: [/浏览器|网页|点击|截图|Selenium|Playwright/],
    en: [/browser|webpage|click|screenshot|Selenium|Playwright/i],
  },
  image: {
    zh: [/图片|图像|截图|PNG|JPG|SVG/],
    en: [/image|picture|screenshot|PNG|JPG|SVG/i],
  },
  notebook: {
    zh: [/notebook|jupyter|ipynb|单元格/],
    en: [/notebook|jupyter|ipynb|cell/i],
  },
  lsp: {
    zh: [/诊断|类型检查|LSP|TypeScript|编译错误/],
    en: [/diagnostic|type check|LSP|TypeScript|compile error/i],
  },
  rlm: {
    zh: [/递归|RLM|Python|执行环境/],
    en: [/recursive|RLM|Python|execution environment/i],
  },
  audit: {
    zh: [/审计|日志|追踪|记录|合规/],
    en: [/audit|log|trace|record|compliance/i],
  },
};

// ─── Complexity Keywords ────────────────────────────────────────────

const COMPLEXITY_INDICATORS = {
  simple: {
    zh: [/简单|快速|小|修改一下|改一下|查看/],
    en: [/simple|quick|small|minor|check|show|list/i],
  },
  complex: {
    zh: [/重构|整个|全部|系统|架构|大规模|复杂|多文件|多模块|优化|迁移/],
    en: [/refactor|entire|all|system|architecture|complex|multi-file|optimize|migrate/i],
  },
};

// ─── Main Dispatch Engine ───────────────────────────────────────────

export class MimoDispatchEngine {
  private strategyHistory: Map<string, { success: number; failure: number }> = new Map();

  /**
   * Analyze user intent with multi-dimensional classification
   */
  analyzeIntent(input: string, context: DispatchContext): IntentAnalysis {
    debug('Analyzing intent: %s', input.slice(0, 100));

    const normalizedInput = input.toLowerCase();
    const lang = this.detectLanguage(input);

    // Task type classification with scoring
    const taskScores: Map<TaskType, number> = new Map();
    for (const [taskType, patterns] of Object.entries(TASK_PATTERNS)) {
      let score = 0;
      for (const pattern of patterns[lang === 'zh' ? 'zh' : 'en']) {
        if (pattern.test(input)) score += 2;
      }
      for (const pattern of patterns[lang === 'zh' ? 'en' : 'zh']) {
        if (pattern.test(input)) score += 1;
      }
      // Context boost: previous errors suggest debugging
      if (taskType === 'debugging' && context.previousErrors > 0) score += 1;
      // Context boost: modified files suggest coding
      if (taskType === 'coding' && context.modifiedFiles.length > 0) score += 0.5;
      taskScores.set(taskType as TaskType, score);
    }

    const sortedTasks = [...taskScores.entries()].sort((a, b) => b[1] - a[1]);
    const primaryTask = sortedTasks[0][0];
    const secondaryTasks = sortedTasks
      .slice(1, 3)
      .filter(([, score]) => score > 0)
      .map(([task]) => task);

    // Complexity analysis
    let complexity: ComplexityLevel = 'moderate';
    for (const pattern of COMPLEXITY_INDICATORS.simple[lang === 'zh' ? 'zh' : 'en']) {
      if (pattern.test(input)) { complexity = 'simple'; break; }
    }
    for (const pattern of COMPLEXITY_INDICATORS.complex[lang === 'zh' ? 'zh' : 'en']) {
      if (pattern.test(input)) { complexity = 'complex'; break; }
    }
    // Heuristic: long input = complex
    if (input.length > 500) complexity = 'complex';
    if (input.length < 50 && complexity === 'moderate') complexity = 'simple';

    // Urgency
    const urgency = this.detectUrgency(input, lang);

    // Required capabilities
    const capabilities = this.detectCapabilities(input, lang);

    // Extract keywords and entities
    const keywords = this.extractKeywords(input);
    const entities = this.extractEntities(input);

    const confidence = sortedTasks[0][1] > 0 ? Math.min(1, sortedTasks[0][1] / 4) : 0.3;

    const analysis: IntentAnalysis = {
      primaryTask,
      secondaryTasks,
      complexity,
      urgency,
      capabilities,
      language: lang,
      confidence,
      keywords,
      entities,
    };

    debug('Intent analysis: %O', { task: primaryTask, complexity, urgency, confidence });
    return analysis;
  }

  /**
   * Create execution plan based on intent analysis
   */
  createPlan(analysis: IntentAnalysis): ExecutionPlan {
    debug('Creating plan for task: %s (complexity: %s)', analysis.primaryTask, analysis.complexity);

    const steps: PlanStep[] = [];
    let stepId = 0;
    const nextId = () => `step_${++stepId}`;

    // Step 1: Always start with understanding the context
    steps.push({
      id: nextId(),
      type: 'analysis',
      description: 'Analyze current project state and context',
      dependsOn: [],
      parallel: false,
      status: 'pending',
      estimatedTokens: 500,
      retryPolicy: { maxRetries: 1, backoffMs: 0 },
    });

    // Step 2: Based on capabilities, add tool-specific steps
    if (analysis.capabilities.fileOps) {
      steps.push({
        id: nextId(),
        type: 'tool_call',
        description: 'Read and analyze relevant source files',
        toolName: 'file_read',
        dependsOn: [steps[steps.length - 1].id],
        parallel: false,
        status: 'pending',
        estimatedTokens: 1000,
        retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      });
    }

    if (analysis.capabilities.git) {
      steps.push({
        id: nextId(),
        type: 'tool_call',
        description: 'Check git status and recent changes',
        toolName: 'git_status',
        dependsOn: [steps[0].id],
        parallel: true,
        status: 'pending',
        estimatedTokens: 300,
        retryPolicy: { maxRetries: 1, backoffMs: 0 },
      });
    }

    if (analysis.capabilities.shell && analysis.primaryTask === 'debugging') {
      steps.push({
        id: nextId(),
        type: 'tool_call',
        description: 'Run diagnostic commands',
        toolName: 'shell_exec',
        dependsOn: [steps[0].id],
        parallel: true,
        status: 'pending',
        estimatedTokens: 500,
        retryPolicy: { maxRetries: 3, backoffMs: 2000 },
      });
    }

    // Main execution step
    const mainStepId = nextId();
    steps.push({
      id: mainStepId,
      type: 'tool_call',
      description: this.getMainActionDescription(analysis),
      dependsOn: steps.filter(s => s.type !== 'analysis').map(s => s.id),
      parallel: false,
      status: 'pending',
      estimatedTokens: this.estimateMainTokens(analysis),
      retryPolicy: { maxRetries: analysis.complexity === 'complex' ? 3 : 2, backoffMs: 2000 },
    });

    // Verification step for coding tasks
    if (['coding', 'debugging'].includes(analysis.primaryTask)) {
      steps.push({
        id: nextId(),
        type: 'verification',
        description: 'Verify changes compile and pass basic checks',
        dependsOn: [mainStepId],
        parallel: false,
        status: 'pending',
        estimatedTokens: 800,
        retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      });
    }

    // Security scan for security tasks
    if (analysis.primaryTask === 'security' || analysis.capabilities.shell) {
      steps.push({
        id: nextId(),
        type: 'verification',
        description: 'Run security checks on changes',
        toolName: 'cyber_scan',
        dependsOn: [mainStepId],
        parallel: true,
        status: 'pending',
        estimatedTokens: 600,
        retryPolicy: { maxRetries: 1, backoffMs: 0 },
      });
    }

    const hasParallel = steps.some(s => s.parallel);
    const strategy = hasParallel ? 'mixed' : 'sequential';

    // Model recommendation
    const modelRecommendation = this.recommendModel(analysis);

    const estimatedTotalTokens = steps.reduce((sum, s) => sum + s.estimatedTokens, 0);
    const estimatedDurationMs = this.estimateDuration(steps);

    const plan: ExecutionPlan = {
      id: `plan_${Date.now().toString(36)}`,
      steps,
      estimatedTotalTokens,
      estimatedDurationMs,
      strategy,
      modelRecommendation,
    };

    debug('Plan created: %d steps, ~%d tokens, strategy: %s', steps.length, estimatedTotalTokens, strategy);
    return plan;
  }

  /**
   * Execute the plan with real-time adaptation
   */
  async executePlan(
    plan: ExecutionPlan,
    executor: (step: PlanStep) => Promise<any>,
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const results = new Map<string, any>();
    const errors: string[] = [];
    let completedSteps = 0;
    let failedSteps = 0;
    let tokensUsed = 0;

    debug('Executing plan %s with %d steps', plan.id, plan.steps.length);

    // Build dependency graph
    const completed = new Set<string>();
    const remaining = [...plan.steps];

    while (remaining.length > 0) {
      // Find steps whose dependencies are all satisfied
      const ready = remaining.filter(step =>
        step.dependsOn.every(dep => completed.has(dep)),
      );

      if (ready.length === 0) {
        // Deadlock detection
        errors.push('Execution deadlock: circular dependency detected');
        break;
      }

      // Execute ready steps (parallel ones concurrently)
      const parallelSteps = ready.filter(s => s.parallel);
      const sequentialSteps = ready.filter(s => !s.parallel);

      // Run parallel steps concurrently
      if (parallelSteps.length > 0) {
        const parallelResults = await Promise.allSettled(
          parallelSteps.map(step => this.executeStepWithRetry(step, executor)),
        );

        for (let i = 0; i < parallelSteps.length; i++) {
          const step = parallelSteps[i];
          const result = parallelResults[i];

          remaining.splice(remaining.indexOf(step), 1);

          if (result.status === 'fulfilled') {
            step.status = 'completed';
            step.result = result.value;
            results.set(step.id, result.value);
            completedSteps++;
            tokensUsed += step.estimatedTokens;
          } else {
            step.status = 'failed';
            errors.push(`Step ${step.id} failed: ${result.reason}`);
            failedSteps++;
            // Try adaptation strategy
            const adapted = this.adaptAfterFailure(step, result.reason as Error);
            if (adapted) {
              debug('Adapted strategy for step %s', step.id);
            }
          }
          completed.add(step.id);
        }
      }

      // Run sequential steps one by one
      for (const step of sequentialSteps) {
        remaining.splice(remaining.indexOf(step), 1);

        try {
          step.status = 'running';
          const result = await this.executeStepWithRetry(step, executor);
          step.status = 'completed';
          step.result = result;
          results.set(step.id, result);
          completedSteps++;
          tokensUsed += step.estimatedTokens;
        } catch (err: any) {
          step.status = 'failed';
          errors.push(`Step ${step.id} failed: ${err.message}`);
          failedSteps++;
          this.adaptAfterFailure(step, err);
        }
        completed.add(step.id);
      }
    }

    const durationMs = Date.now() - startTime;
    debug('Plan execution complete: %d/%d steps, %dms', completedSteps, plan.steps.length, durationMs);

    // Record strategy outcome
    this.recordOutcome(plan.id, failedSteps === 0);

    return {
      planId: plan.id,
      completedSteps,
      failedSteps,
      totalSteps: plan.steps.length,
      results,
      errors,
      tokensUsed,
      durationMs,
    };
  }

  /**
   * Convenience method: analyze, plan, and prepare for execution
   */
  dispatch(input: string, context: DispatchContext): {
    analysis: IntentAnalysis;
    plan: ExecutionPlan;
    recommendation: string;
    nextSteps: string[];
  } {
    const analysis = this.analyzeIntent(input, context);
    const plan = this.createPlan(analysis);

    const recommendation = this.buildRecommendation(analysis, plan);
    const nextSteps = this.buildNextSteps(analysis, plan);

    return { analysis, plan, recommendation, nextSteps };
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  private detectLanguage(input: string): 'zh' | 'en' | 'mixed' {
    const zhChars = (input.match(/[一-鿿]/g) || []).length;
    const totalChars = input.replace(/\s/g, '').length;
    if (totalChars === 0) return 'en';
    const zhRatio = zhChars / totalChars;
    if (zhRatio > 0.3) return 'zh';
    if (zhRatio > 0.1) return 'mixed';
    return 'en';
  }

  private detectUrgency(input: string, lang: 'zh' | 'en' | 'mixed'): UrgencyLevel {
    const urgentPatterns = lang === 'zh'
      ? [/紧急|马上|立即|ASAP|生产环境|线上|服务器崩溃|数据丢失/]
      : [/urgent|asap|production|server down|data loss|critical|emergency/i];
    const deferredPatterns = lang === 'zh'
      ? [/有空|不急|以后|优化|改进|TODO/]
      : [/whenever|no rush|later|optimize|improve|TODO/i];

    for (const p of urgentPatterns) if (p.test(input)) return 'immediate';
    for (const p of deferredPatterns) if (p.test(input)) return 'deferred';
    return 'normal';
  }

  private detectCapabilities(input: string, lang: 'zh' | 'en' | 'mixed'): RequiredCapabilities {
    const caps: RequiredCapabilities = {
      fileOps: false, shell: false, web: false, git: false,
      browser: false, image: false, notebook: false, lsp: false,
      rlm: false, audit: false,
    };

    for (const [key, patterns] of Object.entries(CAPABILITY_KEYWORDS)) {
      for (const pattern of patterns[lang === 'zh' ? 'zh' : 'en']) {
        if (pattern.test(input)) {
          caps[key as keyof RequiredCapabilities] = true;
          break;
        }
      }
    }

    // Default: coding tasks need file ops
    if (!caps.fileOps && !caps.shell && !caps.web) {
      caps.fileOps = true;
    }

    return caps;
  }

  private extractKeywords(input: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
      'should', 'may', 'might', 'must', 'can', 'could', 'to', 'of', 'in',
      'for', 'on', 'with', 'at', 'by', 'from', 'it', 'this', 'that',
      '的', '了', '在', '是', '和', '与', '或', '但', '把', '被',
    ]);

    return input
      .toLowerCase()
      .replace(/[^\w一-鿿\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .slice(0, 20);
  }

  private extractEntities(input: string): string[] {
    const entities: string[] = [];

    // File paths
    const pathMatches = input.match(/[\w\-./\\]+\.\w{1,10}/g);
    if (pathMatches) entities.push(...pathMatches);

    // URLs
    const urlMatches = input.match(/https?:\/\/[^\s]+/g);
    if (urlMatches) entities.push(...urlMatches);

    // Code identifiers (camelCase, snake_case, PascalCase)
    const idMatches = input.match(/\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/g);
    if (idMatches) entities.push(...idMatches);

    const snakeMatches = input.match(/\b[a-z]+_[a-z_]+\b/g);
    if (snakeMatches) entities.push(...snakeMatches);

    return [...new Set(entities)].slice(0, 10);
  }

  private getMainActionDescription(analysis: IntentAnalysis): string {
    const descriptions: Record<TaskType, string> = {
      coding: 'Implement the requested code changes',
      debugging: 'Diagnose and fix the identified issue',
      architecture: 'Design and implement architectural changes',
      research: 'Analyze and report findings',
      conversation: 'Provide helpful response',
      'system-management': 'Apply configuration or environment changes',
      devops: 'Execute DevOps operations',
      security: 'Perform security analysis and fixes',
      testing: 'Write and run tests',
      documentation: 'Generate or update documentation',
    };
    return descriptions[analysis.primaryTask];
  }

  private estimateMainTokens(analysis: IntentAnalysis): number {
    const base: Record<ComplexityLevel, number> = {
      simple: 500,
      moderate: 2000,
      complex: 5000,
    };
    return base[analysis.complexity];
  }

  private recommendModel(analysis: IntentAnalysis): string {
    if (analysis.complexity === 'complex' || analysis.primaryTask === 'architecture') {
      return 'mimo-v2.5-pro';
    }
    if (analysis.primaryTask === 'conversation' || analysis.complexity === 'simple') {
      return 'mimo-v2.5';
    }
    return 'mimo-v2.5-pro';
  }

  private estimateDuration(steps: PlanStep[]): number {
    // Estimate 2s per step average, parallel steps count as one
    const parallelGroups = new Map<string, PlanStep[]>();
    const sequential: PlanStep[] = [];

    for (const step of steps) {
      if (step.parallel && step.dependsOn.length > 0) {
        const depKey = step.dependsOn.join(',');
        if (!parallelGroups.has(depKey)) parallelGroups.set(depKey, []);
        parallelGroups.get(depKey)!.push(step);
      } else {
        sequential.push(step);
      }
    }

    let totalMs = sequential.length * 2000;
    for (const group of parallelGroups.values()) {
      totalMs += 2000; // Parallel group takes ~2s regardless of count
    }
    return totalMs;
  }

  private async executeStepWithRetry(
    step: PlanStep,
    executor: (step: PlanStep) => Promise<any>,
  ): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= step.retryPolicy.maxRetries; attempt++) {
      try {
        if (attempt > 0 && step.retryPolicy.backoffMs > 0) {
          await new Promise(r => setTimeout(r, step.retryPolicy.backoffMs * attempt));
        }
        return await executor(step);
      } catch (err: any) {
        lastError = err;
        debug('Step %s attempt %d failed: %s', step.id, attempt + 1, err.message);
      }
    }

    throw lastError;
  }

  private adaptAfterFailure(step: PlanStep, error: Error): boolean {
    const errorStr = error.message.toLowerCase();

    // Strategy adaptations based on error type
    if (errorStr.includes('rate limit') || errorStr.includes('429')) {
      step.retryPolicy.backoffMs = Math.min(step.retryPolicy.backoffMs * 2, 30000);
      return true;
    }

    if (errorStr.includes('not found') || errorStr.includes('404')) {
      // File/resource not found - can't retry
      return false;
    }

    if (errorStr.includes('permission') || errorStr.includes('403')) {
      // Permission error - escalate to user
      return false;
    }

    if (errorStr.includes('timeout')) {
      step.retryPolicy.maxRetries += 1;
      step.retryPolicy.backoffMs *= 2;
      return true;
    }

    return false;
  }

  private recordOutcome(planId: string, success: boolean): void {
    const existing = this.strategyHistory.get(planId) || { success: 0, failure: 0 };
    if (success) existing.success++;
    else existing.failure++;
    this.strategyHistory.set(planId, existing);
  }

  private buildRecommendation(analysis: IntentAnalysis, plan: ExecutionPlan): string {
    const parts: string[] = [];

    parts.push(`Task: ${analysis.primaryTask} (${analysis.complexity} complexity)`);
    parts.push(`Strategy: ${plan.strategy} with ${plan.steps.length} steps`);
    parts.push(`Recommended model: ${plan.modelRecommendation}`);

    if (analysis.urgency === 'immediate') {
      parts.push('Priority: HIGH - addressing immediately');
    }

    if (analysis.secondaryTasks.length > 0) {
      parts.push(`Also considering: ${analysis.secondaryTasks.join(', ')}`);
    }

    return parts.join(' | ');
  }

  private buildNextSteps(analysis: IntentAnalysis, plan: ExecutionPlan): string[] {
    const steps: string[] = [];

    for (const step of plan.steps.filter(s => s.status === 'pending')) {
      steps.push(`[${step.type}] ${step.description}`);
    }

    if (analysis.primaryTask === 'coding') {
      steps.push('Run type-checker after changes');
      steps.push('Verify no regressions');
    }

    return steps;
  }
}
