// ── Worker Agent ─────────────────────────────────────

import { EventEmitter } from 'events';
import {
  KanbanCard, Worker, WorkerStatus, BoardEvent,
} from './types';
import { KanbanBoardManager } from './board';

export interface WorkerConfig {
  boardId: string;
  workerId: string;
  pollIntervalMs: number;
  maxRetries: number;
  heartbeatIntervalMs: number;
}

export interface WorkerMessage {
  type: 'task_result' | 'progress' | 'error' | 'heartbeat' | 'request_help' | 'share_data';
  fromWorkerId: string;
  toWorkerId: string | null;
  cardId: string | null;
  payload: Record<string, any>;
  timestamp: string;
}

export type TaskExecutor = (card: KanbanCard) => Promise<{
  success: boolean;
  output: string;
  tokensUsed: number;
}>;

export class WorkerAgent extends EventEmitter {
  private boardManager: KanbanBoardManager;
  private config: WorkerConfig;
  private taskExecutor: TaskExecutor;
  private pollTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private currentTasks: Map<string, { card: KanbanCard; startedAt: number }> = new Map();
  private messageQueue: WorkerMessage[] = [];

  constructor(
    boardManager: KanbanBoardManager,
    config: WorkerConfig,
    taskExecutor: TaskExecutor
  ) {
    super();
    this.boardManager = boardManager;
    this.config = config;
    this.taskExecutor = taskExecutor;
  }

  // ── Lifecycle ─────────────────────────────────────

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // Update worker status to idle
    await this.boardManager.updateWorkerStatus(
      this.config.boardId,
      this.config.workerId,
      'idle'
    );

    // Start polling for tasks
    this.pollTimer = setInterval(() => {
      this.pollForTasks().catch(err => {
        this.emit('error', { workerId: this.config.workerId, error: err.message });
      });
    }, this.config.pollIntervalMs);

    // Start heartbeat
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat().catch(() => {});
    }, this.config.heartbeatIntervalMs);

    // Do an initial poll immediately
    await this.pollForTasks();

    this.emit('started', { workerId: this.config.workerId });
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    await this.boardManager.updateWorkerStatus(
      this.config.boardId,
      this.config.workerId,
      'offline'
    );

    this.emit('stopped', { workerId: this.config.workerId });
  }

  // ── Task Polling ──────────────────────────────────

  private async pollForTasks(): Promise<void> {
    if (!this.isRunning) return;

    const board = this.boardManager.getBoard(this.config.boardId);
    if (!board) return;

    const worker = board.workers.find(w => w.id === this.config.workerId);
    if (!worker) return;

    // Skip if at max capacity
    if (worker.currentTaskIds.length >= worker.maxConcurrent) return;

    // Find cards assigned to this worker in in_progress
    const assignedCards = board.cards.filter(c =>
      c.assigneeId === this.config.workerId &&
      c.columnId === 'in_progress' &&
      !this.currentTasks.has(c.id)
    );

    for (const card of assignedCards) {
      if (this.currentTasks.size >= worker.maxConcurrent) break;
      await this.executeTask(card);
    }
  }

  // ── Task Execution ────────────────────────────────

  private async executeTask(card: KanbanCard): Promise<void> {
    this.currentTasks.set(card.id, { card, startedAt: Date.now() });

    this.emit('task_started', {
      workerId: this.config.workerId,
      cardId: card.id,
      title: card.title,
    });

    let result: { success: boolean; output: string; tokensUsed: number };

    try {
      result = await this.taskExecutor(card);
    } catch (err: any) {
      result = {
        success: false,
        output: '',
        tokensUsed: 0,
      };

      this.emit('task_error', {
        workerId: this.config.workerId,
        cardId: card.id,
        error: err.message || String(err),
      });
    }

    this.currentTasks.delete(card.id);

    // Handle result
    if (result.success) {
      await this.handleTaskSuccess(card, result);
    } else {
      await this.handleTaskFailure(card, result);
    }
  }

  private async handleTaskSuccess(
    card: KanbanCard,
    result: { success: boolean; output: string; tokensUsed: number }
  ): Promise<void> {
    // Update card
    await this.boardManager.updateCard(this.config.boardId, card.id, {
      estimatedTokens: result.tokensUsed,
    });

    // Move to review
    await this.boardManager.moveCard(this.config.boardId, card.id, 'review');

    // Complete for worker
    await this.boardManager.completeTaskForWorker(
      this.config.boardId,
      card.id,
      this.config.workerId,
      true
    );

    // Broadcast completion message
    this.broadcastMessage({
      type: 'task_result',
      fromWorkerId: this.config.workerId,
      toWorkerId: null,
      cardId: card.id,
      payload: { success: true, output: result.output },
    });

    this.emit('task_completed', {
      workerId: this.config.workerId,
      cardId: card.id,
      output: result.output,
      tokensUsed: result.tokensUsed,
    });
  }

  private async handleTaskFailure(
    card: KanbanCard,
    result: { success: boolean; output: string; tokensUsed: number }
  ): Promise<void> {
    const updatedCard = this.boardManager.getCard(this.config.boardId, card.id);
    if (!updatedCard) return;

    if (updatedCard.retryCount < this.config.maxRetries) {
      // Retry: move back to todo, unassign
      updatedCard.retryCount++;
      updatedCard.assigneeId = null;
      updatedCard.updatedAt = new Date().toISOString();

      await this.boardManager.unassignCard(this.config.boardId, card.id);
      await this.boardManager.moveCard(this.config.boardId, card.id, 'todo');

      this.emit('task_retry', {
        workerId: this.config.workerId,
        cardId: card.id,
        retryCount: updatedCard.retryCount,
      });
    } else {
      // Max retries reached: move to backlog
      await this.boardManager.unassignCard(this.config.boardId, card.id);
      await this.boardManager.moveCard(this.config.boardId, card.id, 'backlog');
      await this.boardManager.completeTaskForWorker(
        this.config.boardId,
        card.id,
        this.config.workerId,
        false
      );

      this.emit('task_failed', {
        workerId: this.config.workerId,
        cardId: card.id,
        retries: updatedCard.retryCount,
      });
    }

    // Broadcast failure message
    this.broadcastMessage({
      type: 'task_result',
      fromWorkerId: this.config.workerId,
      toWorkerId: null,
      cardId: card.id,
      payload: { success: false, error: result.output },
    });
  }

  // ── Progress Reporting ────────────────────────────

  reportProgress(cardId: string, progress: number, message: string): void {
    const taskEntry = this.currentTasks.get(cardId);
    if (!taskEntry) return;

    this.emit('progress', {
      workerId: this.config.workerId,
      cardId,
      progress,
      message,
      elapsed: Date.now() - taskEntry.startedAt,
    });
  }

  // ── Inter-Worker Communication ────────────────────

  private broadcastMessage(msg: Omit<WorkerMessage, 'timestamp'>): void {
    const fullMsg: WorkerMessage = {
      ...msg,
      timestamp: new Date().toISOString(),
    };
    this.emit('message', fullMsg);
  }

  sendMessage(toWorkerId: string, type: WorkerMessage['type'], cardId: string | null, payload: Record<string, any>): void {
    this.broadcastMessage({
      type,
      fromWorkerId: this.config.workerId,
      toWorkerId,
      cardId,
      payload,
    });
  }

  receiveMessage(message: WorkerMessage): void {
    this.messageQueue.push(message);
    this.emit('message_received', message);

    // Auto-process certain message types
    if (message.type === 'share_data' && message.cardId) {
      this.emit('data_shared', {
        fromWorkerId: message.fromWorkerId,
        cardId: message.cardId,
        data: message.payload,
      });
    }
  }

  getMessageQueue(): WorkerMessage[] {
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    return messages;
  }

  // ── Heartbeat ─────────────────────────────────────

  private async sendHeartbeat(): Promise<void> {
    await this.boardManager.workerHeartbeat(this.config.boardId, this.config.workerId);
  }

  // ── Status ────────────────────────────────────────

  getStatus(): {
    workerId: string;
    isRunning: boolean;
    currentTasks: number;
    maxConcurrent: number;
    pendingMessages: number;
  } {
    const board = this.boardManager.getBoard(this.config.boardId);
    const worker = board?.workers.find(w => w.id === this.config.workerId);

    return {
      workerId: this.config.workerId,
      isRunning: this.isRunning,
      currentTasks: this.currentTasks.size,
      maxConcurrent: worker?.maxConcurrent || 1,
      pendingMessages: this.messageQueue.length,
    };
  }

  getCurrentTasks(): KanbanCard[] {
    return Array.from(this.currentTasks.values()).map(e => e.card);
  }

  getWorkerId(): string {
    return this.config.workerId;
  }
}
