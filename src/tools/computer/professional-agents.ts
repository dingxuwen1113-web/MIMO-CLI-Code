/**
 * 专业Agent实现
 * 每个Agent专注于特定领域
 */

import { ToolResult } from '../registry';
import { SuperOrchestrator, createSuperOrchestrator } from './super-orchestrator';

// ── 全局单例 ─────────────────────────────────────────────────────────

let orchestrator: SuperOrchestrator | null = null;

function getOrchestrator(): SuperOrchestrator {
  if (!orchestrator) {
    orchestrator = createSuperOrchestrator({
      maxAgents: 0, // 无限agents
    });
  }
  return orchestrator;
}

// ── 超级自动化执行函数 ───────────────────────────────────────────────

export async function executeSuperAuto(input: Record<string, any>): Promise<ToolResult> {
  try {
    const instruction = input.instruction;
    if (typeof instruction !== 'string' || instruction.length === 0) {
      return {
        output: 'Instruction parameter is required and must be a non-empty string',
        isError: true,
      };
    }

    const orch = getOrchestrator();

    console.log(`[SuperAuto] Executing: ${instruction}`);

    // 执行超级命令
    const result = await orch.execute({
      id: `super-${Date.now()}`,
      instruction,
      context: input.context || {},
      options: {
        maxAgents: input.maxAgents || 0,
        timeout: input.timeout || 600000,
        priority: input.priority || 'high',
        parallelism: input.parallelism || 0,
        verbose: input.verbose || false,
      },
    });

    // 格式化输出
    const output = formatSuperResult(result, input.verbose);

    return {
      output: JSON.stringify(output, null, 2),
      isError: !result.success,
    };
  } catch (error: any) {
    console.error(`[SuperAuto] Execution failed:`, error);
    return {
      output: `Super automation failed: ${error.message}`,
      isError: true,
    };
  }
}

function formatSuperResult(result: any, verbose: boolean): any {
  const output: any = {
    success: result.success,
    summary: result.summary,
    commandId: result.commandId,
    totalDuration: `${(result.totalDuration / 1000).toFixed(2)}s`,
    tasksCompleted: result.tasks.filter((t: any) => t.status === 'completed').length,
    tasksFailed: result.tasks.filter((t: any) => t.status === 'failed').length,
    totalTasks: result.tasks.length,
    agentsUsed: result.agentsUsed,
    performance: {
      tasksPerSecond: result.performance.tasksPerSecond.toFixed(2),
      successRate: `${(result.performance.successRate * 100).toFixed(1)}%`,
      avgTaskDuration: `${(result.performance.avgTaskDuration / 1000).toFixed(2)}s`,
    },
  };

  if (verbose) {
    output.tasks = result.tasks.map((task: any) => ({
      id: task.id,
      description: task.description,
      type: task.type,
      status: task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : '⏳',
      duration: `${(task.duration / 1000).toFixed(2)}s`,
      agent: task.agent,
      output: task.output ? JSON.stringify(task.output).substring(0, 200) : undefined,
      error: task.error,
    }));
  }

  // 添加建议
  if (!result.success) {
    output.suggestions = [
      'Try breaking the task into smaller subtasks',
      'Increase maxAgents for more parallelism',
      'Check task dependencies',
      'Increase timeout for long-running tasks',
    ];
  }

  return output;
}

// ── 专用命令函数 ─────────────────────────────────────────────────────

export async function executeSoftwareTest(input: Record<string, any>): Promise<ToolResult> {
  try {
    const orch = getOrchestrator();
    const target = input.target || 'software';

    console.log(`[SoftwareTest] Testing: ${target}`);

    const result = await orch.testSoftware(target);

    return {
      output: JSON.stringify({
        success: result.success,
        summary: result.summary,
        testsRun: result.tasks.length,
        passed: result.tasks.filter((t) => t.status === 'completed').length,
        failed: result.tasks.filter((t) => t.status === 'failed').length,
        duration: `${(result.totalDuration / 1000).toFixed(2)}s`,
      }, null, 2),
      isError: !result.success,
    };
  } catch (error: any) {
    return {
      output: `Software test failed: ${error.message}`,
      isError: true,
    };
  }
}

export async function executeBugFix(input: Record<string, any>): Promise<ToolResult> {
  try {
    const orch = getOrchestrator();
    const description = input.description || 'bug';

    console.log(`[BugFix] Fixing: ${description}`);

    const result = await orch.fixBugs(description);

    return {
      output: JSON.stringify({
        success: result.success,
        summary: result.summary,
        bugsFixed: result.tasks.filter((t) => t.status === 'completed').length,
        duration: `${(result.totalDuration / 1000).toFixed(2)}s`,
      }, null, 2),
      isError: !result.success,
    };
  } catch (error: any) {
    return {
      output: `Bug fix failed: ${error.message}`,
      isError: true,
    };
  }
}

export async function executeGameCreation(input: Record<string, any>): Promise<ToolResult> {
  try {
    const orch = getOrchestrator();
    const description = input.description || 'game';

    console.log(`[GameCreation] Creating: ${description}`);

    const result = await orch.createGame(description);

    return {
      output: JSON.stringify({
        success: result.success,
        summary: result.summary,
        assetsCreated: result.tasks.filter((t) => t.status === 'completed').length,
        duration: `${(result.totalDuration / 1000).toFixed(2)}s`,
        agentsUsed: result.agentsUsed,
      }, null, 2),
      isError: !result.success,
    };
  } catch (error: any) {
    return {
      output: `Game creation failed: ${error.message}`,
      isError: true,
    };
  }
}

export async function executeOfficeAutomation(input: Record<string, any>): Promise<ToolResult> {
  try {
    const orch = getOrchestrator();
    const task = input.task || 'office task';

    console.log(`[OfficeAutomation] Processing: ${task}`);

    const result = await orch.automateOffice(task);

    return {
      output: JSON.stringify({
        success: result.success,
        summary: result.summary,
        tasksCompleted: result.tasks.filter((t) => t.status === 'completed').length,
        duration: `${(result.totalDuration / 1000).toFixed(2)}s`,
      }, null, 2),
      isError: !result.success,
    };
  } catch (error: any) {
    return {
      output: `Office automation failed: ${error.message}`,
      isError: true,
    };
  }
}

export async function executeDataAnalysis(input: Record<string, any>): Promise<ToolResult> {
  try {
    const orch = getOrchestrator();
    const description = input.description || 'data analysis';

    console.log(`[DataAnalysis] Analyzing: ${description}`);

    const result = await orch.analyzeData(description);

    return {
      output: JSON.stringify({
        success: result.success,
        summary: result.summary,
        analysisTasks: result.tasks.filter((t) => t.status === 'completed').length,
        duration: `${(result.totalDuration / 1000).toFixed(2)}s`,
      }, null, 2),
      isError: !result.success,
    };
  } catch (error: any) {
    return {
      output: `Data analysis failed: ${error.message}`,
      isError: true,
    };
  }
}

export async function executeAITraining(input: Record<string, any>): Promise<ToolResult> {
  try {
    const orch = getOrchestrator();
    const description = input.description || 'AI model';

    console.log(`[AITraining] Training: ${description}`);

    const result = await orch.trainAI(description);

    return {
      output: JSON.stringify({
        success: result.success,
        summary: result.summary,
        trainingTasks: result.tasks.filter((t) => t.status === 'completed').length,
        duration: `${(result.totalDuration / 1000).toFixed(2)}s`,
        agentsUsed: result.agentsUsed,
      }, null, 2),
      isError: !result.success,
    };
  } catch (error: any) {
    return {
      output: `AI training failed: ${error.message}`,
      isError: true,
    };
  }
}

export async function executeSuperStatus(_input: Record<string, any>): Promise<ToolResult> {
  try {
    const orch = getOrchestrator();
    const status = orch.getStatus();

    return {
      output: JSON.stringify(status, null, 2),
      isError: false,
    };
  } catch (error: any) {
    return {
      output: `Status check failed: ${error.message}`,
      isError: true,
    };
  }
}

export async function executeSecurityAudit(input: Record<string, any>): Promise<ToolResult> {
  try {
    const orch = getOrchestrator();
    const target = input.target || 'system';
    const auditType = input.auditType || 'full';

    console.log(`[SecurityAudit] Auditing: ${target} (type: ${auditType})`);

    // 使用通用执行方法进行安全审计
    const result = await orch.execute({
      id: `security-${Date.now()}`,
      instruction: `安全审计: ${target} - ${auditType}`,
      context: { target, auditType },
      options: { priority: 'critical' },
    });

    return {
      output: JSON.stringify({
        success: result.success,
        summary: result.summary,
        auditTasks: result.tasks.filter((t) => t.status === 'completed').length,
        vulnerabilities: result.tasks.filter((t) => t.status === 'failed').length,
        duration: `${(result.totalDuration / 1000).toFixed(2)}s`,
      }, null, 2),
      isError: !result.success,
    };
  } catch (error: any) {
    return {
      output: `Security audit failed: ${error.message}`,
      isError: true,
    };
  }
}
