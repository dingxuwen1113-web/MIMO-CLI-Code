/**
 * 无限并行Agent管理系统
 * 支持无上限agents同时并行执行任务
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// ── 类型定义 ─────────────────────────────────────────────────────────

export type AgentType =
  | 'software-tester'
  | 'code-fixer'
  | 'game-developer'
  | 'office-automation'
  | 'data-analyst'
  | 'design-creator'
  | 'web-developer'
  | 'devops-engineer'
  | 'security-auditor'
  | 'ai-trainer'
  | 'general';

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low' | 'background';

export type TaskStatus = 'pending' | 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Agent {
  id: string;
  type: AgentType;
  status: 'idle' | 'busy' | 'error';
  capabilities: string[];
  currentTask?: string;
  performance: {
    tasksCompleted: number;
    successRate: number;
    avgExecutionTime: number;
  };
  resources: {
    cpu: number;
    memory: number;
    gpu?: number;
  };
}

export interface Task {
  id: string;
  description: string;
  type: AgentType;
  priority: TaskPriority;
  status: TaskStatus;
  dependencies: string[];
  input: any;
  output?: any;
  error?: string;
  assignedAgent?: string;
  startTime?: number;
  endTime?: number;
  retryCount: number;
  maxRetries: number;
  timeout: number;
  metadata: Record<string, any>;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  tasks: Task[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  startTime?: number;
  endTime?: number;
  parallelism: number; // 并行度（0=无限制）
}

export interface AgentPoolConfig {
  maxAgents: number; // 0 = 无限
  scalingStrategy: 'fixed' | 'dynamic' | 'elastic';
  healthCheckInterval: number;
  taskTimeout: number;
  maxRetries: number;
}

// ── Agent池管理器 ────────────────────────────────────────────────────

export class AgentPoolManager extends EventEmitter {
  private agents: Map<string, Agent> = new Map();
  private taskQueue: Task[] = [];
  private runningTasks: Map<string, Task> = new Map();
  private config: AgentPoolConfig;
  private taskHistory: Task[] = [];
  private performanceMetrics: any = {};

  constructor(config?: Partial<AgentPoolConfig>) {
    super();
    this.config = {
      maxAgents: 0, // 无限
      scalingStrategy: 'elastic',
      healthCheckInterval: 30000,
      taskTimeout: 300000, // 5分钟
      maxRetries: 3,
      ...config,
    };

    this.startHealthCheck();
  }

  // ── Agent管理 ─────────────────────────────────────────────────────

  createAgent(type: AgentType, capabilities: string[] = []): Agent {
    const agent: Agent = {
      id: `agent-${uuidv4().slice(0, 8)}`,
      type,
      status: 'idle',
      capabilities,
      performance: {
        tasksCompleted: 0,
        successRate: 1.0,
        avgExecutionTime: 0,
      },
      resources: {
        cpu: 0,
        memory: 0,
      },
    };

    this.agents.set(agent.id, agent);
    this.emit('agent:created', agent);

    console.log(`[AgentPool] Created agent: ${agent.id} (${agent.type})`);
    return agent;
  }

  removeAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    if (agent.status === 'busy') {
      console.warn(`[AgentPool] Cannot remove busy agent: ${agentId}`);
      return false;
    }

    this.agents.delete(agentId);
    this.emit('agent:removed', agentId);

    console.log(`[AgentPool] Removed agent: ${agentId}`);
    return true;
  }

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  getAgentsByType(type: AgentType): Agent[] {
    return Array.from(this.agents.values()).filter((a) => a.type === type);
  }

  getIdleAgents(): Agent[] {
    return Array.from(this.agents.values()).filter((a) => a.status === 'idle');
  }

  // ── 动态扩展 ─────────────────────────────────────────────────────

  private autoScale(): void {
    if (this.config.scalingStrategy === 'fixed') return;

    const idleAgents = this.getIdleAgents();
    const pendingTasks = this.taskQueue.length;

    // 如果有待处理任务且空闲agent不足，创建新agent
    if (pendingTasks > 0 && idleAgents.length < 2) {
      const taskTypes = this.taskQueue.map((t) => t.type);
      const mostNeededType = this.getMostFrequentType(taskTypes);

      console.log(`[AgentPool] Auto-scaling: Creating new ${mostNeededType} agent`);
      this.createAgent(mostNeededType);

      // 如果是elastic策略，创建多个
      if (this.config.scalingStrategy === 'elastic' && pendingTasks > 5) {
        for (let i = 0; i < Math.min(pendingTasks, 5); i++) {
          this.createAgent(mostNeededType);
        }
      }
    }

    // 如果空闲agent过多，移除多余的
    if (idleAgents.length > 10 && this.config.scalingStrategy === 'elastic') {
      const toRemove = idleAgents.slice(5);
      for (const agent of toRemove) {
        this.removeAgent(agent.id);
      }
    }
  }

  private getMostFrequentType(types: AgentType[]): AgentType {
    const frequency: Record<string, number> = {};
    for (const type of types) {
      frequency[type] = (frequency[type] || 0) + 1;
    }
    return (Object.entries(frequency).sort(([, a], [, b]) => b - a)[0]?.[0] as AgentType) || 'general';
  }

  // ── 任务管理 ─────────────────────────────────────────────────────

  addTask(task: Omit<Task, 'id' | 'status' | 'retryCount'>): Task {
    const fullTask: Task = {
      ...task,
      id: `task-${uuidv4().slice(0, 8)}`,
      status: 'pending',
      retryCount: 0,
      maxRetries: task.maxRetries || this.config.maxRetries,
      timeout: task.timeout || this.config.taskTimeout,
    };

    this.taskQueue.push(fullTask);
    this.emit('task:added', fullTask);

    console.log(`[AgentPool] Added task: ${fullTask.id} - ${fullTask.description}`);

    // 尝试立即分配
    this.tryAssignTasks();

    return fullTask;
  }

  cancelTask(taskId: string): boolean {
    // 从队列移除
    const queueIndex = this.taskQueue.findIndex((t) => t.id === taskId);
    if (queueIndex >= 0) {
      this.taskQueue.splice(queueIndex, 1);
      this.emit('task:cancelled', taskId);
      return true;
    }

    // 从运行中取消
    const runningTask = this.runningTasks.get(taskId);
    if (runningTask) {
      runningTask.status = 'cancelled';
      if (runningTask.assignedAgent) {
        const agent = this.agents.get(runningTask.assignedAgent);
        if (agent) {
          agent.status = 'idle';
          agent.currentTask = undefined;
        }
      }
      this.runningTasks.delete(taskId);
      this.emit('task:cancelled', taskId);
      return true;
    }

    return false;
  }

  // ── 任务分配 ─────────────────────────────────────────────────────

  private tryAssignTasks(): void {
    this.autoScale();

    const pendingTasks = this.taskQueue.filter((t) => t.status === 'pending');
    const idleAgents = this.getIdleAgents();

    if (pendingTasks.length === 0 || idleAgents.length === 0) return;

    // 按优先级排序
    const priorityOrder: Record<TaskPriority, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      background: 4,
    };

    pendingTasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // 分配任务
    for (const task of pendingTasks) {
      const suitableAgent = this.findSuitableAgent(task, idleAgents);
      if (!suitableAgent) continue;

      // 检查依赖
      if (!this.checkDependencies(task)) continue;

      // 分配
      this.assignTaskToAgent(task, suitableAgent);

      // 从队列移除
      const index = this.taskQueue.indexOf(task);
      if (index >= 0) {
        this.taskQueue.splice(index, 1);
      }
    }
  }

  private findSuitableAgent(task: Task, idleAgents: Agent[]): Agent | null {
    // 优先匹配类型
    const typeMatch = idleAgents.find((a) => a.type === task.type);
    if (typeMatch) return typeMatch;

    // 其次匹配通用agent
    const generalAgent = idleAgents.find((a) => a.type === 'general');
    if (generalAgent) return generalAgent;

    // 最后使用任何空闲agent
    return idleAgents[0] || null;
  }

  private checkDependencies(task: Task): boolean {
    if (task.dependencies.length === 0) return true;

    return task.dependencies.every((depId) => {
      const depTask = this.taskHistory.find((t) => t.id === depId) || this.runningTasks.get(depId);
      return depTask?.status === 'completed';
    });
  }

  private assignTaskToAgent(task: Task, agent: Agent): void {
    task.status = 'assigned';
    task.assignedAgent = agent.id;
    task.startTime = Date.now();

    agent.status = 'busy';
    agent.currentTask = task.id;

    this.runningTasks.set(task.id, task);
    this.emit('task:assigned', { task, agent });

    console.log(`[AgentPool] Assigned task ${task.id} to agent ${agent.id}`);

    // 模拟执行（实际应该调用agent.execute）
    this.simulateTaskExecution(task, agent);
  }

  private async simulateTaskExecution(task: Task, agent: Agent): Promise<void> {
    try {
      // 模拟任务执行时间
      const executionTime = Math.random() * 5000 + 1000;
      await new Promise((resolve) => setTimeout(resolve, executionTime));

      // 模拟成功/失败
      const success = Math.random() > 0.1; // 90% 成功率

      if (success) {
        task.status = 'completed';
        task.output = { result: 'Task completed successfully', executionTime };
        task.endTime = Date.now();

        agent.performance.tasksCompleted++;
        agent.performance.avgExecutionTime =
          (agent.performance.avgExecutionTime * (agent.performance.tasksCompleted - 1) + executionTime) /
          agent.performance.tasksCompleted;

        this.emit('task:completed', task);
        console.log(`[AgentPool] Task ${task.id} completed by agent ${agent.id}`);
      } else {
        throw new Error('Simulated task failure');
      }
    } catch (error: any) {
      task.error = error.message;
      task.endTime = Date.now();

      if (task.retryCount < task.maxRetries) {
        task.retryCount++;
        task.status = 'pending';
        this.taskQueue.push(task);
        console.log(`[AgentPool] Task ${task.id} failed, retrying (${task.retryCount}/${task.maxRetries})`);
      } else {
        task.status = 'failed';
        this.emit('task:failed', task);
        console.log(`[AgentPool] Task ${task.id} failed after ${task.maxRetries} retries`);
      }
    } finally {
      agent.status = 'idle';
      agent.currentTask = undefined;
      this.runningTasks.delete(task.id);
      this.taskHistory.push(task);

      // 尝试分配更多任务
      this.tryAssignTasks();
    }
  }

  // ── 健康检查 ─────────────────────────────────────────────────────

  private startHealthCheck(): void {
    setInterval(() => {
      this.checkAgentHealth();
      this.tryAssignTasks();
      this.updateMetrics();
    }, this.config.healthCheckInterval);
  }

  private checkAgentHealth(): void {
    for (const [id, agent] of this.agents) {
      // 检查资源使用
      if (agent.resources.cpu > 90 || agent.resources.memory > 90) {
        console.warn(`[AgentPool] Agent ${id} resource warning: CPU=${agent.resources.cpu}%, MEM=${agent.resources.memory}%`);
      }

      // 检查任务超时
      if (agent.currentTask) {
        const task = this.runningTasks.get(agent.currentTask);
        if (task && task.startTime) {
          const elapsed = Date.now() - task.startTime;
          if (elapsed > task.timeout) {
            console.warn(`[AgentPool] Task ${task.id} timeout, cancelling`);
            this.cancelTask(task.id);
          }
        }
      }
    }
  }

  private updateMetrics(): void {
    this.performanceMetrics = {
      totalAgents: this.agents.size,
      idleAgents: this.getIdleAgents().length,
      busyAgents: Array.from(this.agents.values()).filter((a) => a.status === 'busy').length,
      pendingTasks: this.taskQueue.length,
      runningTasks: this.runningTasks.size,
      completedTasks: this.taskHistory.filter((t) => t.status === 'completed').length,
      failedTasks: this.taskHistory.filter((t) => t.status === 'failed').length,
      successRate: this.calculateSuccessRate(),
    };

    this.emit('metrics:updated', this.performanceMetrics);
  }

  private calculateSuccessRate(): number {
    const completed = this.taskHistory.filter((t) => t.status === 'completed').length;
    const total = this.taskHistory.length;
    return total > 0 ? completed / total : 1;
  }

  // ── 状态查询 ─────────────────────────────────────────────────────

  getStatus(): any {
    return {
      agents: {
        total: this.agents.size,
        idle: this.getIdleAgents().length,
        busy: Array.from(this.agents.values()).filter((a) => a.status === 'busy').length,
      },
      tasks: {
        pending: this.taskQueue.length,
        running: this.runningTasks.size,
        completed: this.taskHistory.filter((t) => t.status === 'completed').length,
        failed: this.taskHistory.filter((t) => t.status === 'failed').length,
      },
      performance: this.performanceMetrics,
    };
  }

  getTask(taskId: string): Task | undefined {
    return (
      this.taskQueue.find((t) => t.id === taskId) ||
      this.runningTasks.get(taskId) ||
      this.taskHistory.find((t) => t.id === taskId)
    );
  }

  getAllTasks(): Task[] {
    return [...this.taskQueue, ...Array.from(this.runningTasks.values()), ...this.taskHistory];
  }
}

// ── 工作流编排器 ─────────────────────────────────────────────────────

export class WorkflowOrchestrator {
  private agentPool: AgentPoolManager;
  private workflows: Map<string, Workflow> = new Map();

  constructor(agentPool: AgentPoolManager) {
    this.agentPool = agentPool;
  }

  createWorkflow(name: string, description: string, parallelism: number = 0): Workflow {
    const workflow: Workflow = {
      id: `workflow-${uuidv4().slice(0, 8)}`,
      name,
      description,
      tasks: [],
      status: 'pending',
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      parallelism,
    };

    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  addTaskToWorkflow(workflowId: string, task: Omit<Task, 'id' | 'status' | 'retryCount'>): Task | null {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return null;

    const fullTask: Task = {
      ...task,
      id: `task-${uuidv4().slice(0, 8)}`,
      status: 'pending',
      retryCount: 0,
    };

    workflow.tasks.push(fullTask);
    workflow.totalTasks = workflow.tasks.length;

    return fullTask;
  }

  async executeWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

    workflow.status = 'running';
    workflow.startTime = Date.now();

    console.log(`[Workflow] Executing workflow: ${workflow.name} (${workflow.totalTasks} tasks)`);

    // 提交所有任务到agent池
    const taskPromises: Promise<void>[] = [];

    for (const task of workflow.tasks) {
      const fullTask = this.agentPool.addTask(task);

      // 监听任务完成
      const promise = new Promise<void>((resolve) => {
        const onComplete = (completedTask: Task) => {
          if (completedTask.id === fullTask.id) {
            workflow.completedTasks++;
            if (completedTask.status === 'completed') {
              resolve();
            } else {
              workflow.failedTasks++;
              resolve(); // 继续执行其他任务
            }
            this.agentPool.off('task:completed', onComplete);
            this.agentPool.off('task:failed', onComplete);
          }
        };

        this.agentPool.on('task:completed', onComplete);
        this.agentPool.on('task:failed', onComplete);
      });

      taskPromises.push(promise);

      // 如果设置了并行度限制，控制并发
      if (workflow.parallelism > 0) {
        while (taskPromises.length >= workflow.parallelism) {
          await Promise.race(taskPromises);
          // 移除已完成的promise
          const completedIndex = taskPromises.findIndex((p) => {
            // 简化处理：假设已完成
            return false;
          });
          if (completedIndex >= 0) {
            taskPromises.splice(completedIndex, 1);
          }
        }
      }
    }

    // 等待所有任务完成
    await Promise.allSettled(taskPromises);

    workflow.status = workflow.failedTasks > 0 ? 'failed' : 'completed';
    workflow.endTime = Date.now();

    console.log(
      `[Workflow] Workflow ${workflow.name} completed: ${workflow.completedTasks}/${workflow.totalTasks} tasks succeeded`
    );
  }

  getWorkflow(workflowId: string): Workflow | undefined {
    return this.workflows.get(workflowId);
  }
}

// ── 导出 ─────────────────────────────────────────────────────────────

export const createAgentPool = (config?: Partial<AgentPoolConfig>) => new AgentPoolManager(config);
export const createWorkflowOrchestrator = (pool: AgentPoolManager) => new WorkflowOrchestrator(pool);
