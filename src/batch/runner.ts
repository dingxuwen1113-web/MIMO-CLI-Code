// ── Batch Runner ─────────────────────────────────────

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import {
  BatchConfig, BatchPrompt, BatchResult, BatchRun, BatchProgress,
  BatchStatus, DEFAULT_BATCH_CONFIG,
} from './types';

export type PromptExecutor = (prompt: BatchPrompt) => Promise<{
  response: string;
  tokensUsed: number;
  trajectoryId?: string;
}>;

export class BatchRunner extends EventEmitter {
  private config: BatchConfig;
  private executor: PromptExecutor;
  private activeRuns: Map<string, BatchRun> = new Map();

  constructor(executor: PromptExecutor, config?: Partial<BatchConfig>) {
    super();
    this.executor = executor;
    this.config = { ...DEFAULT_BATCH_CONFIG, ...config };
  }

  // ── Run a Batch ───────────────────────────────────

  async run(prompts: BatchPrompt[]): Promise<BatchRun> {
    const batchId = this.generateId();
    const batchRun: BatchRun = {
      id: batchId,
      status: 'running',
      config: { ...this.config },
      prompts,
      results: [],
      startedAt: new Date().toISOString(),
      endedAt: null,
      totalTokensUsed: 0,
      totalDurationMs: 0,
    };

    this.activeRuns.set(batchId, batchRun);
    this.emit('batch_started', { batchId, promptCount: prompts.length });

    const startTime = Date.now();

    try {
      await this.executeBatch(batchRun);
    } catch (err: any) {
      batchRun.status = 'failed';
      this.emit('batch_error', { batchId, error: err.message });
    }

    batchRun.endedAt = new Date().toISOString();
    batchRun.totalDurationMs = Date.now() - startTime;

    if (batchRun.status === 'running') {
      const allFailed = batchRun.results.every(r => r.status === 'failed');
      batchRun.status = allFailed ? 'failed' : 'completed';
    }

    // Write results to file
    await this.writeResults(batchRun);

    this.emit('batch_completed', {
      batchId,
      status: batchRun.status,
      totalResults: batchRun.results.length,
      totalTokens: batchRun.totalTokensUsed,
      durationMs: batchRun.totalDurationMs,
    });

    return batchRun;
  }

  private async executeBatch(batchRun: BatchRun): Promise<void> {
    const { concurrency, maxRetries, retryDelayMs, timeoutMs, continueOnError } = this.config;
    const prompts = batchRun.prompts;

    // Initialize results
    batchRun.results = prompts.map(p => ({
      id: this.generateId(),
      promptId: p.id,
      status: 'pending' as BatchStatus,
      response: null,
      error: null,
      tokensUsed: 0,
      durationMs: 0,
      trajectoryId: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
      retryCount: 0,
      metadata: p.metadata || {},
    }));

    // Create a queue of indices
    const queue = prompts.map((_, i) => i);
    const running = new Set<Promise<void>>();

    const executeWithRetry = async (index: number): Promise<void> => {
      const result = batchRun.results[index];
      const prompt = prompts[index];
      result.status = 'running';
      result.startedAt = new Date().toISOString();

      let lastError: string | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (batchRun.status === 'cancelled') {
          result.status = 'cancelled' as BatchStatus;
          return;
        }

        result.retryCount = attempt;

        try {
          const executorPromise = this.executor(prompt);
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), timeoutMs);
          });

          const response = await Promise.race([executorPromise, timeoutPromise]);

          result.status = 'completed';
          result.response = response.response;
          result.tokensUsed = response.tokensUsed;
          result.trajectoryId = response.trajectoryId || null;
          result.endedAt = new Date().toISOString();
          result.durationMs = new Date(result.endedAt).getTime() - new Date(result.startedAt).getTime();

          batchRun.totalTokensUsed += response.tokensUsed;

          this.emit('prompt_completed', {
            batchId: batchRun.id,
            promptId: prompt.id,
            index,
            tokensUsed: response.tokensUsed,
          });

          return; // Success
        } catch (err: any) {
          lastError = err.message || String(err);

          if (attempt < maxRetries) {
            this.emit('prompt_retry', {
              batchId: batchRun.id,
              promptId: prompt.id,
              attempt: attempt + 1,
              error: lastError,
            });
            await this.sleep(retryDelayMs * (attempt + 1)); // Exponential-ish backoff
          }
        }
      }

      // All retries failed
      result.status = 'failed';
      result.error = lastError;
      result.endedAt = new Date().toISOString();
      result.durationMs = new Date(result.endedAt).getTime() - new Date(result.startedAt).getTime();

      this.emit('prompt_failed', {
        batchId: batchRun.id,
        promptId: prompt.id,
        error: lastError,
      });

      if (!continueOnError) {
        batchRun.status = 'failed';
      }
    };

    // Execute in parallel with concurrency limit
    const worker = async (): Promise<void> => {
      while (queue.length > 0 && batchRun.status !== 'cancelled') {
        const index = queue.shift()!;
        await executeWithRetry(index);
        this.reportProgress(batchRun);
      }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(concurrency, prompts.length); i++) {
      workers.push(worker());
    }

    await Promise.all(workers);
  }

  // ── Progress Reporting ────────────────────────────

  private reportProgress(batchRun: BatchRun): void {
    const progress = this.getProgress(batchRun.id);
    if (progress) {
      this.emit('progress', progress);
      if (this.config.progressCallback) {
        this.config.progressCallback(progress);
      }
    }
  }

  getProgress(batchId: string): BatchProgress | null {
    const run = this.activeRuns.get(batchId);
    if (!run) return null;

    const completed = run.results.filter(r => r.status === 'completed').length;
    const failed = run.results.filter(r => r.status === 'failed').length;
    const running = run.results.filter(r => r.status === 'running').length;
    const pending = run.results.filter(r => r.status === 'pending').length;
    const total = run.results.length;
    const elapsedMs = Date.now() - new Date(run.startedAt).getTime();

    const done = completed + failed;
    const estimatedRemainingMs = done > 0 ? (elapsedMs / done) * (total - done) : 0;

    return {
      batchId,
      total,
      completed,
      failed,
      running,
      pending,
      percentage: total > 0 ? Math.round((done / total) * 100) : 0,
      elapsedMs,
      estimatedRemainingMs: Math.round(estimatedRemainingMs),
      currentPrompts: run.results
        .filter(r => r.status === 'running')
        .map(r => r.promptId),
    };
  }

  // ── Cancellation ──────────────────────────────────

  cancel(batchId: string): boolean {
    const run = this.activeRuns.get(batchId);
    if (!run || run.status !== 'running') return false;

    run.status = 'cancelled';
    this.emit('batch_cancelled', { batchId });
    return true;
  }

  // ── Output Writing ────────────────────────────────

  private async writeResults(batchRun: BatchRun): Promise<void> {
    const { outputFormat, outputPath } = this.config;

    try {
      await fs.mkdir(outputPath, { recursive: true });
    } catch {
      // Directory may already exist
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `batch-${batchRun.id}-${timestamp}`;

    switch (outputFormat) {
      case 'jsonl': {
        const filePath = path.join(outputPath, `${filename}.jsonl`);
        const lines = batchRun.results.map(r => JSON.stringify(r));
        await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf-8');
        break;
      }
      case 'json': {
        const filePath = path.join(outputPath, `${filename}.json`);
        await fs.writeFile(filePath, JSON.stringify(batchRun, null, 2), 'utf-8');
        break;
      }
      case 'csv': {
        const filePath = path.join(outputPath, `${filename}.csv`);
        const headers = ['promptId', 'status', 'response', 'error', 'tokensUsed', 'durationMs', 'retryCount'];
        const rows = batchRun.results.map(r => [
          r.promptId,
          r.status,
          `"${(r.response || '').replace(/"/g, '""')}"`,
          `"${(r.error || '').replace(/"/g, '""')}"`,
          String(r.tokensUsed),
          String(r.durationMs),
          String(r.retryCount),
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        await fs.writeFile(filePath, csv, 'utf-8');
        break;
      }
    }

    this.emit('results_written', { batchId: batchRun.id, format: outputFormat, path: outputPath });
  }

  // ── Utility ───────────────────────────────────────

  getRun(batchId: string): BatchRun | undefined {
    return this.activeRuns.get(batchId);
  }

  listRuns(): BatchRun[] {
    return Array.from(this.activeRuns.values());
  }

  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ── Configuration ─────────────────────────────────

  updateConfig(config: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): BatchConfig {
    return { ...this.config };
  }
}
