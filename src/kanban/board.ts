// ── Kanban Board (File-based Persistence) ────────────

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import {
  KanbanBoard, KanbanCard, KanbanColumn, KanbanColumnId, CardPriority,
  Worker, WorkerStatus, BoardStats, BoardEvent, DEFAULT_COLUMNS, DEFAULT_SWARM_CONFIG,
  SwarmConfig, Subtask,
} from './types';

const BOARDS_DIR = path.join(os.homedir(), '.mimo', 'kanban');

export class KanbanBoardManager extends EventEmitter {
  private boards: Map<string, KanbanBoard> = new Map();
  private initialized = false;

  constructor() {
    super();
  }

  // ── Initialization ────────────────────────────────

  async init(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(BOARDS_DIR, { recursive: true });
    await this.loadAllBoards();
    this.initialized = true;
  }

  private async loadAllBoards(): Promise<void> {
    try {
      const files = await fs.readdir(BOARDS_DIR);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const filePath = path.join(BOARDS_DIR, file);
          const raw = await fs.readFile(filePath, 'utf-8');
          const board: KanbanBoard = JSON.parse(raw);
          this.boards.set(board.id, board);
        } catch {
          // Skip corrupted board files
        }
      }
    } catch {
      // Directory may not exist yet
    }
  }

  private async saveBoard(board: KanbanBoard): Promise<void> {
    board.updatedAt = new Date().toISOString();
    const filePath = path.join(BOARDS_DIR, `${board.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(board, null, 2), 'utf-8');
  }

  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  // ── Board CRUD ────────────────────────────────────

  async createBoard(name: string, description: string, config?: Partial<SwarmConfig>): Promise<KanbanBoard> {
    const board: KanbanBoard = {
      id: this.generateId(),
      name,
      description,
      columns: [...DEFAULT_COLUMNS],
      cards: [],
      workers: [],
      swarmConfig: { ...DEFAULT_SWARM_CONFIG, ...config },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.boards.set(board.id, board);
    await this.saveBoard(board);
    this.emitEvent('board_updated', board.id, { action: 'created', board });
    return board;
  }

  getBoard(boardId: string): KanbanBoard | undefined {
    return this.boards.get(boardId);
  }

  listBoards(): KanbanBoard[] {
    return Array.from(this.boards.values());
  }

  async deleteBoard(boardId: string): Promise<boolean> {
    const board = this.boards.get(boardId);
    if (!board) return false;

    this.boards.delete(boardId);
    const filePath = path.join(BOARDS_DIR, `${boardId}.json`);
    try {
      await fs.unlink(filePath);
    } catch {
      // File may not exist
    }
    return true;
  }

  async updateBoard(boardId: string, updates: Partial<Pick<KanbanBoard, 'name' | 'description' | 'swarmConfig'>>): Promise<KanbanBoard | null> {
    const board = this.boards.get(boardId);
    if (!board) return null;

    if (updates.name !== undefined) board.name = updates.name;
    if (updates.description !== undefined) board.description = updates.description;
    if (updates.swarmConfig !== undefined) board.swarmConfig = { ...board.swarmConfig, ...updates.swarmConfig };

    await this.saveBoard(board);
    this.emitEvent('board_updated', boardId, { action: 'updated', updates });
    return board;
  }

  // ── Card CRUD ─────────────────────────────────────

  async createCard(
    boardId: string,
    title: string,
    description: string,
    options: {
      columnId?: KanbanColumnId;
      priority?: CardPriority;
      labels?: string[];
      assigneeId?: string | null;
      dependencies?: string[];
      estimatedTokens?: number;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<KanbanCard | null> {
    const board = this.boards.get(boardId);
    if (!board) return null;

    const card: KanbanCard = {
      id: this.generateId(),
      title,
      description,
      columnId: options.columnId || 'backlog',
      priority: options.priority || 'medium',
      labels: options.labels || [],
      assigneeId: options.assigneeId || null,
      dependencies: options.dependencies || [],
      subtasks: [],
      estimatedTokens: options.estimatedTokens || 0,
      actualTokens: 0,
      retryCount: 0,
      maxRetries: board.swarmConfig.maxRetries,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      metadata: options.metadata || {},
    };

    board.cards.push(card);
    await this.saveBoard(board);
    this.emitEvent('card_created', boardId, { card });
    return card;
  }

  getCard(boardId: string, cardId: string): KanbanCard | null {
    const board = this.boards.get(boardId);
    if (!board) return null;
    return board.cards.find(c => c.id === cardId) || null;
  }

  getCardsByColumn(boardId: string, columnId: KanbanColumnId): KanbanCard[] {
    const board = this.boards.get(boardId);
    if (!board) return [];
    return board.cards.filter(c => c.columnId === columnId);
  }

  getCardsByWorker(boardId: string, workerId: string): KanbanCard[] {
    const board = this.boards.get(boardId);
    if (!board) return [];
    return board.cards.filter(c => c.assigneeId === workerId && c.columnId !== 'done');
  }

  async updateCard(
    boardId: string,
    cardId: string,
    updates: Partial<Pick<KanbanCard, 'title' | 'description' | 'priority' | 'labels' | 'estimatedTokens' | 'maxRetries' | 'metadata'>>
  ): Promise<KanbanCard | null> {
    const board = this.boards.get(boardId);
    if (!board) return null;

    const card = board.cards.find(c => c.id === cardId);
    if (!card) return null;

    Object.assign(card, updates, { updatedAt: new Date().toISOString() });
    await this.saveBoard(board);
    this.emitEvent('card_updated', boardId, { cardId, updates });
    return card;
  }

  async deleteCard(boardId: string, cardId: string): Promise<boolean> {
    const board = this.boards.get(boardId);
    if (!board) return false;

    const idx = board.cards.findIndex(c => c.id === cardId);
    if (idx === -1) return false;

    // Remove from other cards' dependencies
    for (const card of board.cards) {
      card.dependencies = card.dependencies.filter(d => d !== cardId);
    }

    board.cards.splice(idx, 1);
    await this.saveBoard(board);
    return true;
  }

  // ── Drag-and-Drop State Transitions ───────────────

  async moveCard(
    boardId: string,
    cardId: string,
    targetColumnId: KanbanColumnId,
    options: { insertBefore?: string; insertAfter?: string } = {}
  ): Promise<KanbanCard | null> {
    const board = this.boards.get(boardId);
    if (!board) return null;

    const card = board.cards.find(c => c.id === cardId);
    if (!card) return null;

    const targetColumn = board.columns.find(c => c.id === targetColumnId);
    if (!targetColumn) return null;

    // Check WIP limit
    if (targetColumn.wipLimit !== null) {
      const currentCount = board.cards.filter(c => c.columnId === targetColumnId).length;
      if (currentCount >= targetColumn.wipLimit) {
        return null; // WIP limit reached
      }
    }

    // Check dependencies — can't move to in_progress if blocked
    if (targetColumnId === 'in_progress' || targetColumnId === 'review') {
      for (const depId of card.dependencies) {
        const dep = board.cards.find(c => c.id === depId);
        if (dep && dep.columnId !== 'done') {
          return null; // Blocked by dependency
        }
      }
    }

    const previousColumn = card.columnId;
    card.columnId = targetColumnId;
    card.updatedAt = new Date().toISOString();

    // Track time-based fields
    if (targetColumnId === 'in_progress' && !card.startedAt) {
      card.startedAt = new Date().toISOString();
    }
    if (targetColumnId === 'done') {
      card.completedAt = new Date().toISOString();
    }

    // Handle reordering within column
    if (options.insertBefore || options.insertAfter) {
      const columnCards = board.cards.filter(c => c.columnId === targetColumnId && c.id !== cardId);
      const cardIdx = board.cards.indexOf(card);

      // Remove card from current position
      board.cards.splice(cardIdx, 1);

      if (options.insertBefore) {
        const beforeIdx = board.cards.findIndex(c => c.id === options.insertBefore);
        board.cards.splice(beforeIdx, 0, card);
      } else if (options.insertAfter) {
        const afterIdx = board.cards.findIndex(c => c.id === options.insertAfter);
        board.cards.splice(afterIdx + 1, 0, card);
      }
    }

    await this.saveBoard(board);
    this.emitEvent('card_moved', boardId, {
      cardId,
      from: previousColumn,
      to: targetColumnId,
    });

    if (targetColumnId === 'done') {
      this.emitEvent('card_completed', boardId, { cardId });
    }

    return card;
  }

  // ── Card Assignment ───────────────────────────────

  async assignCard(boardId: string, cardId: string, workerId: string): Promise<KanbanCard | null> {
    const board = this.boards.get(boardId);
    if (!board) return null;

    const card = board.cards.find(c => c.id === cardId);
    if (!card) return null;

    const worker = board.workers.find(w => w.id === workerId);
    if (!worker) return null;

    card.assigneeId = workerId;
    card.updatedAt = new Date().toISOString();

    // Add to worker's current tasks
    if (!worker.currentTaskIds.includes(cardId)) {
      worker.currentTaskIds.push(cardId);
    }

    await this.saveBoard(board);
    this.emitEvent('card_assigned', boardId, { cardId, workerId });
    return card;
  }

  async unassignCard(boardId: string, cardId: string): Promise<KanbanCard | null> {
    const board = this.boards.get(boardId);
    if (!board) return null;

    const card = board.cards.find(c => c.id === cardId);
    if (!card) return null;

    const previousAssignee = card.assigneeId;
    card.assigneeId = null;
    card.updatedAt = new Date().toISOString();

    if (previousAssignee) {
      const worker = board.workers.find(w => w.id === previousAssignee);
      if (worker) {
        worker.currentTaskIds = worker.currentTaskIds.filter(id => id !== cardId);
      }
    }

    await this.saveBoard(board);
    return card;
  }

  // ── Subtasks ──────────────────────────────────────

  async addSubtask(boardId: string, cardId: string, title: string): Promise<Subtask | null> {
    const board = this.boards.get(boardId);
    if (!board) return null;

    const card = board.cards.find(c => c.id === cardId);
    if (!card) return null;

    const subtask: Subtask = {
      id: this.generateId(),
      title,
      completed: false,
      completedAt: null,
    };

    card.subtasks.push(subtask);
    card.updatedAt = new Date().toISOString();
    await this.saveBoard(board);
    return subtask;
  }

  async completeSubtask(boardId: string, cardId: string, subtaskId: string): Promise<boolean> {
    const board = this.boards.get(boardId);
    if (!board) return false;

    const card = board.cards.find(c => c.id === cardId);
    if (!card) return false;

    const subtask = card.subtasks.find(s => s.id === subtaskId);
    if (!subtask) return false;

    subtask.completed = true;
    subtask.completedAt = new Date().toISOString();
    card.updatedAt = new Date().toISOString();
    await this.saveBoard(board);
    return true;
  }

  // ── Worker Management ─────────────────────────────

  async addWorker(
    boardId: string,
    name: string,
    capabilities: string[],
    options: { maxConcurrent?: number; metadata?: Record<string, any> } = {}
  ): Promise<Worker | null> {
    const board = this.boards.get(boardId);
    if (!board) return null;

    const worker: Worker = {
      id: this.generateId(),
      name,
      status: 'idle',
      capabilities,
      maxConcurrent: options.maxConcurrent || 1,
      currentTaskIds: [],
      completedTaskCount: 0,
      failedTaskCount: 0,
      lastHeartbeat: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      metadata: options.metadata || {},
    };

    board.workers.push(worker);
    await this.saveBoard(board);
    this.emitEvent('worker_joined', boardId, { worker });
    return worker;
  }

  async removeWorker(boardId: string, workerId: string): Promise<boolean> {
    const board = this.boards.get(boardId);
    if (!board) return false;

    const idx = board.workers.findIndex(w => w.id === workerId);
    if (idx === -1) return false;

    const worker = board.workers[idx];

    // Unassign all tasks from this worker
    for (const taskId of worker.currentTaskIds) {
      const card = board.cards.find(c => c.id === taskId);
      if (card) {
        card.assigneeId = null;
        card.updatedAt = new Date().toISOString();
      }
    }

    board.workers.splice(idx, 1);
    await this.saveBoard(board);
    this.emitEvent('worker_left', boardId, { workerId });
    return true;
  }

  async updateWorkerStatus(boardId: string, workerId: string, status: WorkerStatus): Promise<boolean> {
    const board = this.boards.get(boardId);
    if (!board) return false;

    const worker = board.workers.find(w => w.id === workerId);
    if (!worker) return false;

    worker.status = status;
    worker.lastHeartbeat = new Date().toISOString();
    await this.saveBoard(board);
    this.emitEvent('worker_status_changed', boardId, { workerId, status });
    return true;
  }

  async workerHeartbeat(boardId: string, workerId: string): Promise<boolean> {
    const board = this.boards.get(boardId);
    if (!board) return false;

    const worker = board.workers.find(w => w.id === workerId);
    if (!worker) return false;

    worker.lastHeartbeat = new Date().toISOString();
    await this.saveBoard(board);
    return true;
  }

  async completeTaskForWorker(boardId: string, cardId: string, workerId: string, success: boolean): Promise<void> {
    const board = this.boards.get(boardId);
    if (!board) return;

    const worker = board.workers.find(w => w.id === workerId);
    if (!worker) return;

    worker.currentTaskIds = worker.currentTaskIds.filter(id => id !== cardId);
    if (success) {
      worker.completedTaskCount++;
    } else {
      worker.failedTaskCount++;
    }
    worker.status = worker.currentTaskIds.length > 0 ? 'busy' : 'idle';
    await this.saveBoard(board);
  }

  // ── Query Helpers ─────────────────────────────────

  getAvailableWorkers(boardId: string): Worker[] {
    const board = this.boards.get(boardId);
    if (!board) return [];
    return board.workers.filter(w =>
      w.status !== 'offline' && w.status !== 'error' && w.currentTaskIds.length < w.maxConcurrent
    );
  }

  getBlockedCards(boardId: string): KanbanCard[] {
    const board = this.boards.get(boardId);
    if (!board) return [];

    return board.cards.filter(card => {
      if (card.columnId === 'done') return false;
      return card.dependencies.some(depId => {
        const dep = board.cards.find(c => c.id === depId);
        return dep && dep.columnId !== 'done';
      });
    });
  }

  getReadyCards(boardId: string): KanbanCard[] {
    const board = this.boards.get(boardId);
    if (!board) return [];

    return board.cards.filter(card => {
      if (card.columnId !== 'todo') return false;
      if (card.assigneeId !== null) return false;
      // Check if all dependencies are done
      return card.dependencies.every(depId => {
        const dep = board.cards.find(c => c.id === depId);
        return !dep || dep.columnId === 'done';
      });
    });
  }

  // ── Stats ─────────────────────────────────────────

  getBoardStats(boardId: string): BoardStats | null {
    const board = this.boards.get(boardId);
    if (!board) return null;

    const cardsByColumn: Record<KanbanColumnId, number> = {
      backlog: 0, todo: 0, in_progress: 0, review: 0, done: 0,
    };
    const cardsByPriority: Record<CardPriority, number> = {
      critical: 0, high: 0, medium: 0, low: 0,
    };

    let totalCompletionTime = 0;
    let completedCount = 0;

    for (const card of board.cards) {
      cardsByColumn[card.columnId]++;
      cardsByPriority[card.priority]++;
      if (card.completedAt && card.startedAt) {
        totalCompletionTime += new Date(card.completedAt).getTime() - new Date(card.startedAt).getTime();
        completedCount++;
      }
    }

    const activeWorkers = board.workers.filter(w => w.status === 'busy').length;
    const idleWorkers = board.workers.filter(w => w.status === 'idle').length;

    // Throughput: cards completed in the last 24 hours
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentCompletions = board.cards.filter(c =>
      c.completedAt && new Date(c.completedAt).getTime() > oneDayAgo
    ).length;

    return {
      totalCards: board.cards.length,
      cardsByColumn,
      cardsByPriority,
      activeWorkers,
      idleWorkers,
      averageCompletionTime: completedCount > 0 ? totalCompletionTime / completedCount : 0,
      throughput: recentCompletions,
      blockedCards: this.getBlockedCards(boardId).length,
    };
  }

  // ── Priority Sorting ──────────────────────────────

  sortByPriority(cards: KanbanCard[]): KanbanCard[] {
    const order: Record<CardPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...cards].sort((a, b) => order[a.priority] - order[b.priority]);
  }

  // ── Label Filtering ───────────────────────────────

  filterByLabels(boardId: string, labels: string[]): KanbanCard[] {
    const board = this.boards.get(boardId);
    if (!board) return [];
    return board.cards.filter(c => labels.some(l => c.labels.includes(l)));
  }

  // ── Event Emission ────────────────────────────────

  private emitEvent(type: BoardEvent['type'], boardId: string, data: Record<string, any>): void {
    const event: BoardEvent = {
      type,
      boardId,
      cardId: data.cardId || data.card?.id,
      workerId: data.workerId || data.worker?.id,
      data,
      timestamp: new Date().toISOString(),
    };
    this.emit(type, event);
    this.emit('any', event);
  }
}
