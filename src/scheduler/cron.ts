import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import createDebug from 'debug';

const debug = createDebug('mimo:cron');

// ─── Cron Types ────────────────────────────────────────────────────

export interface CronJob {
  id: string;
  description: string;
  cronExpression: string;
  fireAt?: string;         // ISO timestamp for one-shot
  prompt: string;
  enabled: boolean;
  recurring: boolean;
  heartbeatPolicy?: 'none' | 'notify' | 'restart';
  isolationMode?: 'shared' | 'isolated';  // isolated = new agent session per run
  nextRunAt?: string;
  lastRunAt?: string;
  runCount: number;
  maxRuns?: number;        // auto-disable after N runs (for recurring)
  createdAt: string;
}

interface CronFields {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

// ─── Cron Parser ───────────────────────────────────────────────────

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseCronField(field: string, min: number, max: number, names?: string[]): number[] {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) values.add(i);
    } else if (part.startsWith('*/')) {
      const step = parseInt(part.slice(2));
      for (let i = min; i <= max; i += step) values.add(i);
    } else if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(v => resolveName(v.trim(), names));
      for (let i = lo; i <= hi; i++) values.add(i);
    } else {
      values.add(resolveName(part.trim(), names));
    }
  }

  return Array.from(values).sort((a, b) => a - b);
}

function resolveName(val: string, names?: string[]): number {
  const num = parseInt(val);
  if (!isNaN(num)) return num;
  if (names) {
    const idx = names.indexOf(val.toLowerCase());
    if (idx >= 0) return idx;
  }
  return parseInt(val);
}

function parseCronExpression(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression: ${expr} (expected 5 fields)`);

  return {
    minute: parseCronField(parts[0], 0, 59),
    hour: parseCronField(parts[1], 0, 23),
    dayOfMonth: parseCronField(parts[2], 1, 31),
    month: parseCronField(parts[3], 1, 12),
    dayOfWeek: parseCronField(parts[4], 0, 6, DAYS),
  };
}

function matchesCron(date: Date, fields: CronFields): boolean {
  return (
    fields.minute.includes(date.getMinutes()) &&
    fields.hour.includes(date.getHours()) &&
    fields.dayOfMonth.includes(date.getDate()) &&
    fields.month.includes(date.getMonth() + 1) &&
    fields.dayOfWeek.includes(date.getDay())
  );
}

// ─── Cron Scheduler ────────────────────────────────────────────────

export class CronScheduler {
  private jobs: Map<string, CronJob> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private storagePath: string;
  private onFire: ((job: CronJob) => Promise<void>) | null = null;
  private jitterMs = 0;  // 0-60s random jitter

  constructor(storagePath?: string) {
    this.storagePath = storagePath || path.join(os.homedir(), '.mimo', 'scheduled-tasks.json');
  }

  setFireHandler(handler: (job: CronJob) => Promise<void>): void {
    this.onFire = handler;
  }

  async init(): Promise<void> {
    await this.load();
    this.scheduleAll();
    debug('Cron scheduler initialized with %d jobs', this.jobs.size);
  }

  async create(job: Omit<CronJob, 'id' | 'runCount' | 'createdAt'>): Promise<CronJob> {
    const id = job.description.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const fullJob: CronJob = {
      ...job,
      id,
      runCount: 0,
      createdAt: new Date().toISOString(),
    };

    // Calculate next run
    fullJob.nextRunAt = this.calculateNextRun(fullJob);

    this.jobs.set(id, fullJob);
    this.scheduleJob(fullJob);
    await this.save();

    debug('Created job: %s (next: %s)', id, fullJob.nextRunAt);
    return fullJob;
  }

  async update(id: string, patch: Partial<CronJob>): Promise<CronJob | null> {
    const job = this.jobs.get(id);
    if (!job) return null;

    Object.assign(job, patch);
    if (patch.cronExpression || patch.fireAt) {
      job.nextRunAt = this.calculateNextRun(job);
    }

    this.rescheduleJob(job);
    await this.save();
    return job;
  }

  async remove(id: string): Promise<boolean> {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    const deleted = this.jobs.delete(id);
    if (deleted) await this.save();
    return deleted;
  }

  async enable(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) return false;
    job.enabled = true;
    job.nextRunAt = this.calculateNextRun(job);
    this.scheduleJob(job);
    await this.save();
    return true;
  }

  async disable(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) return false;
    job.enabled = false;
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    await this.save();
    return true;
  }

  list(): CronJob[] {
    return Array.from(this.jobs.values()).sort((a, b) =>
      (a.nextRunAt || '').localeCompare(b.nextRunAt || ''),
    );
  }

  get(id: string): CronJob | undefined {
    return this.jobs.get(id);
  }

  calculateNextRun(job: CronJob): string | undefined {
    if (!job.enabled) return undefined;

    // One-shot
    if (job.fireAt) {
      const fireDate = new Date(job.fireAt);
      return fireDate > new Date() ? job.fireAt : undefined;
    }

    // Recurring
    if (!job.cronExpression) return undefined;

    try {
      const fields = parseCronExpression(job.cronExpression);
      const now = new Date();
      const candidate = new Date(now);
      candidate.setSeconds(0, 0);
      candidate.setMinutes(candidate.getMinutes() + 1);

      // Search up to 366 days
      for (let i = 0; i < 527040; i++) {
        if (matchesCron(candidate, fields)) {
          return candidate.toISOString();
        }
        candidate.setMinutes(candidate.getMinutes() + 1);
      }
    } catch (err: any) {
      debug('Failed to calculate next run for %s: %s', job.id, err.message);
    }

    return undefined;
  }

  private scheduleAll(): void {
    for (const job of this.jobs.values()) {
      if (job.enabled) this.scheduleJob(job);
    }
  }

  private scheduleJob(job: CronJob): void {
    // Clear existing timer
    const existing = this.timers.get(job.id);
    if (existing) clearTimeout(existing);

    if (!job.enabled || !job.nextRunAt) return;

    const nextRun = new Date(job.nextRunAt).getTime();
    const now = Date.now();
    const delay = Math.max(0, nextRun - now);

    // Add jitter (0-60s) to avoid thundering herd
    const jitter = Math.floor(Math.random() * 60000);
    const totalDelay = delay + jitter;

    const timer = setTimeout(() => this.fireJob(job), totalDelay);
    this.timers.set(job.id, timer);

    debug('Scheduled %s: fire in %dms (jitter: %dms)', job.id, totalDelay, jitter);
  }

  private rescheduleJob(job: CronJob): void {
    const timer = this.timers.get(job.id);
    if (timer) clearTimeout(timer);
    this.timers.delete(job.id);
    if (job.enabled) this.scheduleJob(job);
  }

  private async fireJob(job: CronJob): Promise<void> {
    debug('Firing job: %s', job.id);

    job.lastRunAt = new Date().toISOString();
    job.runCount++;

    // Auto-disable after maxRuns
    if (job.maxRuns && job.runCount >= job.maxRuns) {
      job.enabled = false;
      debug('Job %s auto-disabled after %d runs', job.id, job.runCount);
    }

    // Call handler
    if (this.onFire) {
      try {
        await this.onFire(job);
      } catch (err: any) {
        debug('Job %s handler error: %s', job.id, err.message);
      }
    }

    // Reschedule recurring jobs
    if (job.recurring && job.enabled) {
      job.nextRunAt = this.calculateNextRun(job);
      if (job.nextRunAt) this.scheduleJob(job);
    }

    await this.save();
  }

  private async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.storagePath, 'utf-8');
      const jobs = JSON.parse(data) as CronJob[];
      for (const job of jobs) {
        this.jobs.set(job.id, job);
      }
    } catch {
      // File doesn't exist yet
    }
  }

  private async save(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
      await fs.writeFile(this.storagePath, JSON.stringify(Array.from(this.jobs.values()), null, 2));
    } catch (err: any) {
      debug('Save failed: %s', err.message);
    }
  }

  destroy(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
