// ── Scheduled Tasks：定时任务系统（完整 cron 支持）────

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface ScheduledTask {
  id: string;
  prompt: string;
  description: string;
  cronExpression?: string;
  fireAt?: string;
  recurring: boolean;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  durable: boolean;
}

const SCHEDULER_FILE = path.join(os.homedir(), '.mimo', 'scheduled-tasks.json');

export class Scheduler {
  private tasks: Map<string, ScheduledTask> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private onFire?: (task: ScheduledTask) => Promise<void>;

  constructor(onFire?: (task: ScheduledTask) => Promise<void>) {
    this.onFire = onFire;
  }

  async init(): Promise<void> {
    await this.load();
    this.scheduleAll();
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(SCHEDULER_FILE, 'utf-8');
      const tasks = JSON.parse(raw) as ScheduledTask[];
      for (const task of tasks) {
        this.tasks.set(task.id, task);
      }
    } catch {
      // 文件不存在
    }
  }

  private async save(): Promise<void> {
    const dir = path.dirname(SCHEDULER_FILE);
    await fs.mkdir(dir, { recursive: true });
    const tasks = Array.from(this.tasks.values());
    await fs.writeFile(SCHEDULER_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
  }

  async create(task: Omit<ScheduledTask, 'enabled' | 'lastRunAt' | 'nextRunAt' | 'durable'> & { durable?: boolean }): Promise<ScheduledTask> {
    // Validate cron expression if provided
    if (task.cronExpression) {
      const cronError = this.validateCronExpression(task.cronExpression);
      if (cronError) {
        throw new Error(`Invalid cron expression "${task.cronExpression}": ${cronError}`);
      }
    }

    // Validate fireAt if provided
    if (task.fireAt) {
      const fireTime = new Date(task.fireAt);
      if (isNaN(fireTime.getTime())) {
        throw new Error(`Invalid fireAt timestamp: "${task.fireAt}"`);
      }
      if (fireTime.getTime() < Date.now()) {
        throw new Error(`fireAt timestamp is in the past: "${task.fireAt}"`);
      }
    }

    const fullTask: ScheduledTask = {
      ...task,
      enabled: true,
      durable: task.durable || false,
      nextRunAt: task.fireAt || (task.cronExpression ? this.calculateNextRun(task.cronExpression) : new Date(Date.now() + 3600000).toISOString()),
    };

    this.tasks.set(fullTask.id, fullTask);
    await this.save();
    this.scheduleTask(fullTask);
    return fullTask;
  }

  async update(taskId: string, updates: Partial<ScheduledTask>): Promise<ScheduledTask | undefined> {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    // Validate cron expression if being updated
    if (updates.cronExpression) {
      const cronError = this.validateCronExpression(updates.cronExpression);
      if (cronError) {
        throw new Error(`Invalid cron expression "${updates.cronExpression}": ${cronError}`);
      }
    }

    // Validate fireAt if being updated
    if (updates.fireAt) {
      const fireTime = new Date(updates.fireAt);
      if (isNaN(fireTime.getTime())) {
        throw new Error(`Invalid fireAt timestamp: "${updates.fireAt}"`);
      }
    }

    Object.assign(task, updates);
    if (updates.cronExpression || updates.fireAt) {
      task.nextRunAt = task.fireAt || (task.cronExpression ? this.calculateNextRun(task.cronExpression) : task.nextRunAt);
    }

    this.tasks.set(taskId, task);
    await this.save();

    this.clearTask(taskId);
    if (task.enabled) this.scheduleTask(task);

    return task;
  }

  async remove(taskId: string): Promise<boolean> {
    this.clearTask(taskId);
    const deleted = this.tasks.delete(taskId);
    if (deleted) await this.save();
    return deleted;
  }

  list(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  private scheduleAll(): void {
    for (const task of this.tasks.values()) {
      if (task.enabled) {
        this.scheduleTask(task);
      }
    }
  }

  private scheduleTask(task: ScheduledTask): void {
    if (!task.nextRunAt) return;

    const nextTime = new Date(task.nextRunAt).getTime();
    const now = Date.now();
    let delay = Math.max(0, nextTime - now);

    // 添加 jitter (0-60s) 避免同时触发
    delay += Math.random() * 60000;

    const timer = setTimeout(async () => {
      try {
        await this.fireTask(task);
      } catch (err) {
        console.error(`Scheduler: task ${task.id} failed:`, err);
      }
    }, delay);

    this.timers.set(task.id, timer);
  }

  private clearTask(taskId: string): void {
    const timer = this.timers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(taskId);
    }
  }

  private async fireTask(task: ScheduledTask): Promise<void> {
    task.lastRunAt = new Date().toISOString();

    if (task.recurring && task.cronExpression) {
      // Calculate next run BEFORE applying jitter to avoid cumulative drift
      task.nextRunAt = this.calculateNextRun(task.cronExpression);
    } else {
      task.enabled = false;
    }

    await this.save();
    if (task.enabled) {
      this.scheduleTask(task);
    }

    if (this.onFire) {
      await this.onFire(task);
    }
  }

  // ── Cron 表达式验证 ─────────────────────────────
  private validateCronExpression(cron: string): string | null {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) {
      return `Expected 5 fields (minute hour dayOfMonth month dayOfWeek), got ${parts.length}`;
    }

    const fieldNames = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'];
    const fieldRanges = [
      { min: 0, max: 59 },
      { min: 0, max: 23 },
      { min: 1, max: 31 },
      { min: 1, max: 12 },
      { min: 0, max: 7 }, // 0 and 7 both = Sunday
    ];

    for (let i = 0; i < 5; i++) {
      const field = parts[i];
      const { min, max } = fieldRanges[i];

      if (field === '*') continue;

      // Handle */N
      if (field.startsWith('*/')) {
        const step = parseInt(field.slice(2));
        if (isNaN(step) || step < 1) {
          return `Invalid step in ${fieldNames[i]}: "${field}"`;
        }
        continue;
      }

      // Handle ranges and lists
      const values = field.split(',');
      for (const val of values) {
        if (val.includes('-')) {
          const [start, end] = val.split('-').map(Number);
          if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) {
            return `Invalid range "${val}" in ${fieldNames[i]} (valid: ${min}-${max})`;
          }
        } else {
          const num = parseInt(val);
          if (isNaN(num) || num < min || num > max) {
            return `Invalid value "${val}" in ${fieldNames[i]} (valid: ${min}-${max})`;
          }
        }
      }
    }

    return null; // valid
  }

  // ── 完整 Cron 解析器（5 字段：分 时 日 月 周）────
  calculateNextRun(cron: string): string {
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5) {
      return new Date(Date.now() + 3600000).toISOString();
    }

    const [minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] = parts;

    const now = new Date();
    const next = new Date(now);

    // 尝试最多 366 天找下一个匹配时间
    for (let dayOffset = 0; dayOffset < 366; dayOffset++) {
      const candidate = new Date(now);
      candidate.setDate(candidate.getDate() + dayOffset);
      candidate.setSeconds(0, 0);

      // 检查月份
      if (!this.fieldMatches(candidate.getMonth() + 1, monthField)) continue;

      // 检查日期
      if (!this.fieldMatches(candidate.getDate(), dayOfMonthField)) continue;

      // 检查星期 (0=Sun in cron, 0=Sun in JS)
      if (!this.fieldMatches(candidate.getDay(), dayOfWeekField)) continue;

      // 找到匹配的日期，现在找时间
      const hour = this.findNextValue(candidate.getHours(), hourField, 23);
      if (hour === -1) continue;

      if (hour > candidate.getHours()) {
        candidate.setHours(hour);
        const min = this.findNextValue(0, minuteField, 59);
        if (min === -1) continue;
        candidate.setMinutes(min);
      } else if (hour === candidate.getHours()) {
        const min = this.findNextValue(candidate.getMinutes() + 1, minuteField, 59);
        if (min === -1) continue;
        candidate.setMinutes(min);
      } else {
        continue;
      }

      if (candidate > now) {
        return candidate.toISOString();
      }
    }

    // 回退：1 小时后
    return new Date(Date.now() + 3600000).toISOString();
  }

  // 检查值是否匹配 cron 字段
  private fieldMatches(value: number, field: string): boolean {
    if (field === '*') return true;

    // 处理 */N (每 N 个单位)
    if (field.startsWith('*/')) {
      const step = parseInt(field.slice(2));
      return value % step === 0;
    }

    // 处理范围 N-M
    if (field.includes('-')) {
      const [start, end] = field.split('-').map(Number);
      return value >= start && value <= end;
    }

    // 处理列表 N,M,P
    if (field.includes(',')) {
      return field.split(',').map(Number).includes(value);
    }

    // 精确匹配
    return parseInt(field) === value;
  }

  // 找下一个匹配的值
  private findNextValue(from: number, field: string, max: number): number {
    if (field === '*') return from;

    if (field.startsWith('*/')) {
      const step = parseInt(field.slice(2));
      for (let v = from; v <= max; v++) {
        if (v % step === 0) return v;
      }
      return -1;
    }

    // 收集所有可能的值
    const values = new Set<number>();
    for (const part of field.split(',')) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        for (let v = start; v <= end; v++) values.add(v);
      } else {
        values.add(parseInt(part));
      }
    }

    for (let v = from; v <= max; v++) {
      if (values.has(v)) return v;
    }

    return -1;
  }
}
