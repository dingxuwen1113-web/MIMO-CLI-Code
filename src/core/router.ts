// ── 模型路由器：根据任务复杂度选择模型 ──────────────

export type ModelChoice = 'mimo-v2.5-pro' | 'mimo-v2.5';

interface TaskContext {
  isSimpleChat?: boolean;
  isCoding?: boolean;
  isDebugging?: boolean;
  isArchitectural?: boolean;
  isComplexRefactor?: boolean;
  turnCount?: number;
  previousErrors?: number;
}

export class ModelRouter {
  private baseModel: string;
  private resolvedBaseUrl: string;

  constructor(baseModel: string, baseUrl?: string) {
    this.baseModel = baseModel;
    this.resolvedBaseUrl = baseUrl || process.env.ANTHROPIC_BASE_URL || '';
  }

  route(task: TaskContext = {}): ModelChoice {
    // 如果用户指定了具体模型，直接使用
    if (this.baseModel !== 'auto') {
      const validModels: ModelChoice[] = ['mimo-v2.5-pro', 'mimo-v2.5'];
      if (validModels.includes(this.baseModel as ModelChoice)) {
        return this.baseModel as ModelChoice;
      }
      // Unknown model specified — fall back to pro
      return 'mimo-v2.5-pro';
    }

    // 检测是否在使用 mimo 代理（通过配置或环境变量）
    const isMimoProxy = !!(
      this.resolvedBaseUrl?.includes('mimo') ||
      process.env.MIMO_MODEL?.startsWith('mimo')
    );

    if (isMimoProxy) {
      // mimo 代理路由 — 统一使用 pro 模型（非 pro 模型有严格 60s 限速）
      return 'mimo-v2.5-pro';
    }

    // 官方 MIMO 路由
    if (task.isSimpleChat) return 'mimo-v2.5';
    if (task.isArchitectural || task.isComplexRefactor) return 'mimo-v2.5-pro';
    if (task.isCoding || task.isDebugging) return 'mimo-v2.5-pro';

    if (task.previousErrors && task.previousErrors > 2) return 'mimo-v2.5-pro';

    return 'mimo-v2.5-pro';
  }

  classifyTask(userInput: string): TaskContext {
    const lower = userInput.toLowerCase();

    // 检测是否为简单对话
    const simpleIndicators = ['你好', 'hello', 'hi', '谢谢', 'thanks', 'ok', '好的'];
    const isGreetingOrAck = simpleIndicators.some(s => lower === s || lower.startsWith(s + ' '));

    const isSimpleChat =
      (lower.length < 50 || isGreetingOrAck) &&
      !lower.includes('代码') &&
      !lower.includes('code') &&
      !lower.includes('bug') &&
      !lower.includes('fix') &&
      !lower.includes('error') &&
      !lower.includes('test') &&
      !lower.includes('debug');

    const isArchitectural =
      lower.includes('架构') ||
      lower.includes('architecture') ||
      lower.includes('重构') ||
      lower.includes('refactor') ||
      lower.includes('设计') ||
      lower.includes('design pattern') ||
      lower.includes('microservice') ||
      lower.includes('微服务') ||
      lower.includes('优化') ||
      lower.includes('optimize') ||
      lower.includes('scalab');

    const isDebugging =
      lower.includes('bug') ||
      lower.includes('fix') ||
      lower.includes('error') ||
      lower.includes('错误') ||
      lower.includes('异常') ||
      lower.includes('报错') ||
      lower.includes('traceback') ||
      lower.includes('stack trace') ||
      lower.includes('crash') ||
      lower.includes('崩溃') ||
      lower.includes('调试') ||
      lower.includes('debug');

    const isCoding =
      lower.includes('代码') ||
      lower.includes('code') ||
      lower.includes('实现') ||
      lower.includes('implement') ||
      lower.includes('函数') ||
      lower.includes('function') ||
      lower.includes('写') ||
      lower.includes('write') ||
      lower.includes('创建') ||
      lower.includes('create') ||
      lower.includes('添加') ||
      lower.includes('add') ||
      lower.includes('接口') ||
      lower.includes('api') ||
      lower.includes('endpoint') ||
      lower.includes('模块') ||
      lower.includes('module') ||
      lower.includes('组件') ||
      lower.includes('component');

    return {
      isSimpleChat: isSimpleChat && !isArchitectural && !isDebugging && !isCoding,
      isCoding,
      isDebugging,
      isArchitectural,
      isComplexRefactor: isArchitectural && lower.includes('重构') || lower.includes('refactor'),
    };
  }
}
