// ── Task 任务管理系统 ──────────────────────────────

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'deleted';

export interface Task {
  id: string;
  subject: string;
  description: string;
  status: TaskStatus;
  owner: string;
  activeForm: string;
  blocks: string[];
  blockedBy: string[];
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

const TASKS_DIR = path.join(os.homedir(), '.mimo', 'tasks');
const MAX_SUBJECT_LENGTH = 200;

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in_progress', 'deleted'],
  in_progress: ['completed', 'pending', 'deleted'],
  completed: ['in_progress', 'deleted'],
  deleted: [],
};

export class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private initialized = false;
  private nextTaskId: number = 1;

  async init(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(TASKS_DIR, { recursive: true });
    await this.loadAll();
    this.initialized = true;
  }

  private async loadAll(): Promise<void> {
    try {
      const files = await fs.readdir(TASKS_DIR);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(path.join(TASKS_DIR, file), 'utf-8');
          const task = JSON.parse(raw) as Task;
          this.tasks.set(task.id, task);
          const numId = parseInt(task.id, 10);
          if (!isNaN(numId) && numId >= this.nextTaskId) {
            this.nextTaskId = numId + 1;
          }
        } catch { /* skip */ }
      }
    } catch { /* dir doesn't exist */ }
  }

  async create(subject: string, description: string, options: Partial<Task> = {}): Promise<Task> {
    if (!subject || subject.trim().length === 0) {
      throw new Error('Task subject cannot be empty');
    }
    if (subject.length > MAX_SUBJECT_LENGTH) {
      throw new Error(`Task subject exceeds maximum length of ${MAX_SUBJECT_LENGTH} characters`);
    }

    const id = String(this.nextTaskId++);
    const now = new Date().toISOString();
    const task: Task = {
      id,
      subject,
      description,
      status: 'pending',
      owner: options.owner || '',
      activeForm: options.activeForm || subject,
      blocks: options.blocks || [],
      blockedBy: options.blockedBy || [],
      metadata: options.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(id, task);
    await this.save(task);
    return task;
  }

  async get(taskId: string): Promise<Task | undefined> {
    return this.tasks.get(taskId);
  }

  async update(taskId: string, updates: Partial<Task>): Promise<Task | undefined> {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    // Validate status transition
    if (updates.status && updates.status !== task.status) {
      const allowed = VALID_TRANSITIONS[task.status] || [];
      if (!allowed.includes(updates.status)) {
        throw new Error(
          `Invalid status transition: ${task.status} -> ${updates.status}. Allowed: ${allowed.join(', ') || 'none'}`
        );
      }
    }

    // Validate subject length if being updated
    if (updates.subject !== undefined) {
      if (!updates.subject || updates.subject.trim().length === 0) {
        throw new Error('Task subject cannot be empty');
      }
      if (updates.subject.length > MAX_SUBJECT_LENGTH) {
        throw new Error(`Task subject exceeds maximum length of ${MAX_SUBJECT_LENGTH} characters`);
      }
    }

    // Protect immutable fields — merge only allowed fields
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...safeUpdates } = updates as any;
    Object.assign(task, safeUpdates, { updatedAt: new Date().toISOString() });
    this.tasks.set(taskId, task);
    await this.save(task);
    return task;
  }

  async delete(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.status = 'deleted';
    task.updatedAt = new Date().toISOString();
    await this.save(task);
    this.tasks.delete(taskId);

    try {
      await fs.unlink(path.join(TASKS_DIR, `${taskId}.json`));
    } catch { /* already gone */ }

    return true;
  }

  list(filters?: { status?: TaskStatus; owner?: string }): Task[] {
    let tasks = Array.from(this.tasks.values());

    if (filters?.status) {
      tasks = tasks.filter((t) => t.status === filters.status);
    }
    if (filters?.owner) {
      tasks = tasks.filter((t) => t.owner === filters.owner);
    }

    return tasks.sort((a, b) => parseInt(a.id) - parseInt(b.id));
  }

  getAvailable(owner?: string): Task[] {
    return this.list({ status: 'pending' }).filter((t) => {
      // 没有阻塞依赖
      if (t.blockedBy.length > 0) {
        const allResolved = t.blockedBy.every((depId) => {
          const dep = this.tasks.get(depId);
          return dep?.status === 'completed';
        });
        if (!allResolved) return false;
      }
      // 无 owner 或 owner 匹配
      return !t.owner || t.owner === owner;
    });
  }

  getBlocked(): Task[] {
    return this.list({ status: 'pending' }).filter((t) => t.blockedBy.length > 0);
  }

  getProgress(): { total: number; pending: number; inProgress: number; completed: number; percent: number } {
    const all = this.list();
    const pending = all.filter((t) => t.status === 'pending').length;
    const inProgress = all.filter((t) => t.status === 'in_progress').length;
    const completed = all.filter((t) => t.status === 'completed').length;
    const total = all.length;
    return {
      total,
      pending,
      inProgress,
      completed,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  private async save(task: Task): Promise<void> {
    const filePath = path.join(TASKS_DIR, `${task.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(task, null, 2), 'utf-8');
  }
}

// ── 工具定义 ──────────────────────────────────────

import { ToolDefinition, ToolResult } from '../tools/registry';

export const taskCreateTool: ToolDefinition = {
  name: 'task_create',
  description: '创建新任务。返回任务 ID。',
  input_schema: {
    type: 'object' as const,
    properties: {
      subject: { type: 'string', description: '任务标题（祈使句）' },
      description: { type: 'string', description: '详细描述' },
      owner: { type: 'string', description: '负责人（代理名）' },
      activeForm: { type: 'string', description: '进行中时显示的文本' },
    },
    required: ['subject', 'description'],
  },
  permission: 'auto',
};

export const taskUpdateTool: ToolDefinition = {
  name: 'task_update',
  description: '更新任务状态、负责人、依赖等。',
  input_schema: {
    type: 'object' as const,
    properties: {
      taskId: { type: 'string', description: '任务 ID' },
      status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'deleted'] },
      owner: { type: 'string', description: '新负责人' },
      subject: { type: 'string', description: '新标题' },
      description: { type: 'string', description: '新描述' },
      addBlocks: { type: 'array', items: { type: 'string' }, description: '添加阻塞的任务 ID' },
      addBlockedBy: { type: 'array', items: { type: 'string' }, description: '添加被阻塞的任务 ID' },
    },
    required: ['taskId'],
  },
  permission: 'auto',
};

export const taskListTool: ToolDefinition = {
  name: 'task_list',
  description: '列出所有任务，可按状态/负责人过滤。',
  input_schema: {
    type: 'object' as const,
    properties: {
      status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
      owner: { type: 'string', description: '按负责人过滤' },
    },
  },
  permission: 'auto',
};

export const taskGetTool: ToolDefinition = {
  name: 'task_get',
  description: '获取任务的完整详情。',
  input_schema: {
    type: 'object' as const,
    properties: {
      taskId: { type: 'string', description: '任务 ID' },
    },
    required: ['taskId'],
  },
  permission: 'auto',
};

// ── 执行函数 ──────────────────────────────────────

let taskManager: TaskManager | null = null;

async function getTaskManager(): Promise<TaskManager> {
  if (!taskManager) {
    taskManager = new TaskManager();
    await taskManager.init();
  }
  return taskManager;
}

export async function executeTaskCreate(input: Record<string, any>): Promise<ToolResult> {
  const tm = await getTaskManager();
  const task = await tm.create(input.subject, input.description, {
    owner: input.owner,
    activeForm: input.activeForm,
  });
  return {
    output: `已创建任务 #${task.id}: ${task.subject}`,
    isError: false,
  };
}

export async function executeTaskUpdate(input: Record<string, any>): Promise<ToolResult> {
  const tm = await getTaskManager();
  const task = await tm.get(input.taskId);
  if (!task) return { output: `任务 #${input.taskId} 不存在`, isError: true };

  const updates: Partial<Task> = {};
  if (input.status) updates.status = input.status;
  if (input.owner) updates.owner = input.owner;
  if (input.subject) updates.subject = input.subject;
  if (input.description) updates.description = input.description;
  if (input.addBlocks) updates.blocks = [...new Set([...task.blocks, ...input.addBlocks])];
  if (input.addBlockedBy) updates.blockedBy = [...new Set([...task.blockedBy, ...input.addBlockedBy])];

  await tm.update(input.taskId, updates);
  return {
    output: `已更新任务 #${input.taskId}`,
    isError: false,
  };
}

export async function executeTaskList(input: Record<string, any>): Promise<ToolResult> {
  const tm = await getTaskManager();
  const tasks = tm.list({
    status: input.status,
    owner: input.owner,
  });

  if (tasks.length === 0) {
    return { output: '(无任务)', isError: false };
  }

  const progress = tm.getProgress();
  const lines = tasks.map((t) => {
    const statusIcon = { pending: '○', in_progress: '◐', completed: '●', deleted: '✕' }[t.status];
    const owner = t.owner ? ` @${t.owner}` : '';
    const blocked = t.blockedBy.length > 0 ? ` [blocked by #${t.blockedBy.join(', #')}]` : '';
    return `  ${statusIcon} #${t.id} ${t.subject}${owner}${blocked}`;
  });

  lines.unshift(`  进度: ${progress.completed}/${progress.total} (${progress.percent}%)\n`);

  return { output: lines.join('\n'), isError: false };
}

export async function executeTaskGet(input: Record<string, any>): Promise<ToolResult> {
  const tm = await getTaskManager();
  const task = await tm.get(input.taskId);
  if (!task) return { output: `任务 #${input.taskId} 不存在`, isError: true };

  const output = [
    `任务 #${task.id}: ${task.subject}`,
    `状态: ${task.status}`,
    task.owner ? `负责人: ${task.owner}` : '',
    task.description ? `描述: ${task.description}` : '',
    task.blocks.length > 0 ? `阻塞: #${task.blocks.join(', #')}` : '',
    task.blockedBy.length > 0 ? `被阻塞: #${task.blockedBy.join(', #')}` : '',
    `创建: ${task.createdAt}`,
    `更新: ${task.updatedAt}`,
  ].filter(Boolean).join('\n');

  return { output, isError: false };
}
