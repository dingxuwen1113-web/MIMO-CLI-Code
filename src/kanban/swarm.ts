// ── Swarm Orchestrator ───────────────────────────────

import { EventEmitter } from 'events';
import {
  KanbanBoard, KanbanCard, KanbanColumnId, Worker, SwarmConfig,
  TaskDecomposition, SuggestedSubtask, CardPriority, BoardEvent,
} from './types';
import { KanbanBoardManager } from './board';

export interface SwarmAgent {
  id: string;
  name: string;
  capabilities: string[];
  execute: (task: SwarmTask) => Promise<SwarmTaskResult>;
}

export interface SwarmTask {
  cardId: string;
  title: string;
  description: string;
  dependencies: string[];
  metadata: Record<string, any>;
}

export interface SwarmTaskResult {
  success: boolean;
  output: string;
  tokensUsed: number;
  artifacts?: string[];
  error?: string;
}

export interface DecompositionStrategy {
  analyze(card: KanbanCard, allCards: KanbanCard[]): TaskDecomposition;
}

export class SwarmOrchestrator extends EventEmitter {
  private boardManager: KanbanBoardManager;
  private agents: Map<string, SwarmAgent> = new Map();
  private activeExecutions: Map<string, Promise<SwarmTaskResult>> = new Map();
  private progressCallbacks: Map<string, (progress: number, message: string) => void> = new Map();
  private boardId: string;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(boardManager: KanbanBoardManager, boardId: string) {
    super();
    this.boardManager = boardManager;
    this.boardId = boardId;
  }

  // ── Agent Registration ────────────────────────────

  registerAgent(agent: SwarmAgent): void {
    this.agents.set(agent.id, agent);
    this.boardManager.addWorker(
      this.boardId,
      agent.name,
      agent.capabilities,
      { metadata: { agentId: agent.id } }
    );
  }

  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
    // Worker cleanup handled by board
  }

  // ── Task Decomposition ────────────────────────────

  async decomposeTask(cardId: string): Promise<KanbanCard[]> {
    const board = this.boardManager.getBoard(this.boardId);
    if (!board) return [];

    const card = board.cards.find(c => c.id === cardId);
    if (!card) return [];

    const decomposition = this.analyzeDecomposition(card, board.cards);

    const subtaskCards: KanbanCard[] = [];
    for (const suggested of decomposition.suggestedBreakdown) {
      const subCard = await this.boardManager.createCard(
        this.boardId,
        suggested.title,
        suggested.description,
        {
          columnId: 'todo',
          priority: card.priority,
          labels: [...card.labels, 'decomposed'],
          dependencies: suggested.dependencies,
          estimatedTokens: suggested.estimatedTokens,
          metadata: {
            parentCardId: cardId,
            requiredCapabilities: suggested.requiredCapabilities,
            decompositionOrder: suggested.order,
          },
        }
      );

      if (subCard) {
        subtaskCards.push(subCard);
      }
    }

    // Move parent card to todo and mark as decomposed
    await this.boardManager.updateCard(this.boardId, cardId, {
      labels: [...card.labels, 'has-subtasks'],
    });

    this.emit('task_decomposed', { parentId: cardId, subtaskCount: subtaskCards.length });
    return subtaskCards;
  }

  private analyzeDecomposition(card: KanbanCard, allCards: KanbanCard[]): TaskDecomposition {
    const complexity = this.estimateComplexity(card);
    const suggestedBreakdown: SuggestedSubtask[] = [];

    if (complexity === 'simple') {
      return {
        taskId: card.id,
        parentId: null,
        subtaskIds: [],
        strategy: 'sequential',
        estimatedComplexity: 'simple',
        suggestedBreakdown: [],
      };
    }

    // Generate suggested breakdown based on description analysis
    const sections = this.extractActionableSections(card.description);

    for (let i = 0; i < sections.length; i++) {
      suggestedBreakdown.push({
        title: sections[i].title,
        description: sections[i].description,
        estimatedTokens: Math.ceil(card.estimatedTokens / sections.length),
        requiredCapabilities: this.inferCapabilities(sections[i].description),
        dependencies: i > 0 ? [suggestedBreakdown[i - 1].title] : [],
        order: i,
      });
    }

    return {
      taskId: card.id,
      parentId: null,
      subtaskIds: [],
      strategy: complexity === 'complex' ? 'mixed' : 'sequential',
      estimatedComplexity: complexity,
      suggestedBreakdown,
    };
  }

  private estimateComplexity(card: KanbanCard): 'simple' | 'moderate' | 'complex' {
    const descLength = card.description.length;
    const depCount = card.dependencies.length;
    const estimatedTokens = card.estimatedTokens;

    if (estimatedTokens > 10000 || descLength > 2000 || depCount > 3) return 'complex';
    if (estimatedTokens > 3000 || descLength > 500 || depCount > 1) return 'moderate';
    return 'simple';
  }

  private extractActionableSections(description: string): Array<{ title: string; description: string }> {
    const sections: Array<{ title: string; description: string }> = [];
    const lines = description.split('\n').filter(l => l.trim());

    let currentSection = { title: '', description: '' };

    for (const line of lines) {
      if (line.match(/^#{1,3}\s/) || line.match(/^[-*]\s+\*\*/) || line.match(/^\d+\.\s/)) {
        if (currentSection.title) {
          sections.push({ ...currentSection });
        }
        currentSection = {
          title: line.replace(/^#{1,3}\s|[-*]\s+|\d+\.\s/g, '').trim(),
          description: '',
        };
      } else {
        currentSection.description += line + '\n';
      }
    }

    if (currentSection.title) {
      sections.push(currentSection);
    }

    // If no sections were found, create one from the whole description
    if (sections.length === 0 && description.trim()) {
      sections.push({
        title: 'Execute task',
        description: description.trim(),
      });
    }

    return sections;
  }

  private inferCapabilities(description: string): string[] {
    const capabilities: string[] = [];
    const lower = description.toLowerCase();

    if (lower.includes('code') || lower.includes('function') || lower.includes('class') || lower.includes('implement')) {
      capabilities.push('coding');
    }
    if (lower.includes('test') || lower.includes('verify') || lower.includes('check')) {
      capabilities.push('testing');
    }
    if (lower.includes('document') || lower.includes('readme') || lower.includes('write')) {
      capabilities.push('documentation');
    }
    if (lower.includes('review') || lower.includes('feedback')) {
      capabilities.push('review');
    }
    if (lower.includes('deploy') || lower.includes('build') || lower.includes('config')) {
      capabilities.push('devops');
    }
    if (lower.includes('research') || lower.includes('analyze') || lower.includes('investigate')) {
      capabilities.push('research');
    }

    return capabilities.length > 0 ? capabilities : ['general'];
  }

  // ── Auto-Assignment ───────────────────────────────

  async autoAssignTasks(): Promise<number> {
    const board = this.boardManager.getBoard(this.boardId);
    if (!board) return 0;

    const readyCards = this.boardManager.sortByPriority(
      this.boardManager.getReadyCards(this.boardId)
    );
    const availableWorkers = this.boardManager.getAvailableWorkers(this.boardId);

    if (readyCards.length === 0 || availableWorkers.length === 0) return 0;

    let assigned = 0;

    for (const card of readyCards) {
      const bestWorker = this.findBestWorker(card, availableWorkers);
      if (bestWorker) {
        await this.boardManager.assignCard(this.boardId, card.id, bestWorker.id);
        await this.boardManager.updateWorkerStatus(this.boardId, bestWorker.id, 'busy');

        // Move card to in_progress
        await this.boardManager.moveCard(this.boardId, card.id, 'in_progress');

        assigned++;

        // Remove worker from available list if at capacity
        const updatedWorker = board.workers.find(w => w.id === bestWorker.id);
        if (updatedWorker && updatedWorker.currentTaskIds.length >= updatedWorker.maxConcurrent) {
          const idx = availableWorkers.indexOf(bestWorker);
          availableWorkers.splice(idx, 1);
        }
      }
    }

    return assigned;
  }

  private findBestWorker(card: KanbanCard, availableWorkers: Worker[]): Worker | null {
    const requiredCapabilities = (card.metadata?.requiredCapabilities as string[]) || ['general'];

    // Score workers by capability match
    let bestWorker: Worker | null = null;
    let bestScore = -1;

    for (const worker of availableWorkers) {
      if (worker.currentTaskIds.length >= worker.maxConcurrent) continue;

      const score = requiredCapabilities.reduce((s, cap) => {
        return s + (worker.capabilities.includes(cap) ? 1 : 0);
      }, 0);

      if (score > bestScore) {
        bestScore = score;
        bestWorker = worker;
      }
    }

    // If no capability match, pick the least loaded worker
    if (bestScore === 0 && availableWorkers.length > 0) {
      bestWorker = availableWorkers.reduce((least, w) =>
        w.currentTaskIds.length < least.currentTaskIds.length ? w : least
      , availableWorkers[0]);
    }

    return bestWorker;
  }

  // ── Parallel Execution ────────────────────────────

  async executeSwarm(maxConcurrency?: number): Promise<Map<string, SwarmTaskResult>> {
    const board = this.boardManager.getBoard(this.boardId);
    if (!board) return new Map();

    const config = board.swarmConfig;
    const concurrency = maxConcurrency || config.maxWorkers;

    // Auto-assign if enabled
    if (config.autoAssign) {
      await this.autoAssignTasks();
    }

    // Get all assigned in_progress cards
    const activeCards = board.cards.filter(c =>
      c.columnId === 'in_progress' && c.assigneeId !== null
    );

    const results = new Map<string, SwarmTaskResult>();

    // Execute in parallel batches
    const batches = this.createBatches(activeCards, concurrency);

    for (const batch of batches) {
      const batchPromises = batch.map(card => this.executeCard(card));
      const batchResults = await Promise.allSettled(batchPromises);

      for (let i = 0; i < batch.length; i++) {
        const card = batch[i];
        const result = batchResults[i];

        if (result.status === 'fulfilled') {
          results.set(card.id, result.value);
          await this.handleTaskComplete(card, result.value);
        } else {
          const failResult: SwarmTaskResult = {
            success: false,
            output: '',
            tokensUsed: 0,
            error: result.reason?.message || 'Unknown error',
          };
          results.set(card.id, failResult);
          await this.handleTaskFailed(card, failResult);
        }
      }
    }

    return results;
  }

  private createBatches<T>(items: T[], size: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      batches.push(items.slice(i, i + size));
    }
    return batches;
  }

  private async executeCard(card: KanbanCard): Promise<SwarmTaskResult> {
    const agent = this.agents.get(card.assigneeId || '');
    if (!agent) {
      return { success: false, output: '', tokensUsed: 0, error: 'No agent found for worker' };
    }

    const task: SwarmTask = {
      cardId: card.id,
      title: card.title,
      description: card.description,
      dependencies: card.dependencies,
      metadata: card.metadata,
    };

    this.emit('task_started', { cardId: card.id, workerId: card.assigneeId });

    try {
      const result = await agent.execute(task);
      return result;
    } catch (err: any) {
      return {
        success: false,
        output: '',
        tokensUsed: 0,
        error: err.message || String(err),
      };
    }
  }

  private async handleTaskComplete(card: KanbanCard, result: SwarmTaskResult): Promise<void> {
    // Update card tokens
    await this.boardManager.updateCard(this.boardId, card.id, {
      estimatedTokens: result.tokensUsed,
    });

    // Move to review or done
    if (result.success) {
      await this.boardManager.moveCard(this.boardId, card.id, 'review');
    }

    // Complete task for worker
    if (card.assigneeId) {
      await this.boardManager.completeTaskForWorker(this.boardId, card.id, card.assigneeId, true);
    }

    // Reassign idle workers
    const board = this.boardManager.getBoard(this.boardId);
    if (board?.swarmConfig.idleWorkerReassignment) {
      await this.autoAssignTasks();
    }

    this.emit('task_completed', { cardId: card.id, result });
  }

  private async handleTaskFailed(card: KanbanCard, result: SwarmTaskResult): Promise<void> {
    const board = this.boardManager.getBoard(this.boardId);
    if (!board) return;

    if (card.retryCount < card.maxRetries && board.swarmConfig.retryFailedTasks) {
      // Retry: increment count, move back to todo
      await this.boardManager.updateCard(this.boardId, card.id, {
        metadata: { ...card.metadata, lastError: result.error },
      });
      const updatedCard = this.boardManager.getCard(this.boardId, card.id);
      if (updatedCard) {
        updatedCard.retryCount++;
        updatedCard.columnId = 'todo';
        updatedCard.assigneeId = null;
        updatedCard.updatedAt = new Date().toISOString();
      }
      // Save via moveCard-like mechanism
      await this.boardManager.moveCard(this.boardId, card.id, 'todo');
      await this.boardManager.unassignCard(this.boardId, card.id);

      this.emit('task_retry', { cardId: card.id, retryCount: card.retryCount, error: result.error });
    } else {
      // Move back to backlog as failed
      if (card.assigneeId) {
        await this.boardManager.completeTaskForWorker(this.boardId, card.id, card.assigneeId, false);
      }
      await this.boardManager.unassignCard(this.boardId, card.id);
      await this.boardManager.moveCard(this.boardId, card.id, 'backlog');

      this.emit('task_failed', { cardId: card.id, error: result.error });
    }
  }

  // ── Dependency Resolution ─────────────────────────

  getExecutableCards(): KanbanCard[] {
    return this.boardManager.getReadyCards(this.boardId);
  }

  getDependencyGraph(): Map<string, string[]> {
    const board = this.boardManager.getBoard(this.boardId);
    if (!board) return new Map();

    const graph = new Map<string, string[]>();
    for (const card of board.cards) {
      graph.set(card.id, [...card.dependencies]);
    }
    return graph;
  }

  getExecutionOrder(): string[] {
    const board = this.boardManager.getBoard(this.boardId);
    if (!board) return [];

    // Topological sort
    const visited = new Set<string>();
    const order: string[] = [];
    const graph = this.getDependencyGraph();

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const deps = graph.get(nodeId) || [];
      for (const dep of deps) {
        visit(dep);
      }
      order.push(nodeId);
    };

    for (const card of board.cards) {
      if (card.columnId !== 'done') {
        visit(card.id);
      }
    }

    return order;
  }

  // ── Progress Tracking ─────────────────────────────

  registerProgressCallback(taskId: string, callback: (progress: number, message: string) => void): void {
    this.progressCallbacks.set(taskId, callback);
  }

  reportProgress(taskId: string, progress: number, message: string): void {
    const callback = this.progressCallbacks.get(taskId);
    if (callback) {
      callback(progress, message);
    }
    this.emit('progress', { taskId, progress, message });
  }

  getOverallProgress(): { total: number; completed: number; inProgress: number; failed: number; percentage: number } {
    const board = this.boardManager.getBoard(this.boardId);
    if (!board) return { total: 0, completed: 0, inProgress: 0, failed: 0, percentage: 0 };

    const total = board.cards.length;
    const completed = board.cards.filter(c => c.columnId === 'done').length;
    const inProgress = board.cards.filter(c => c.columnId === 'in_progress').length;
    const failed = board.cards.filter(c => c.columnId === 'backlog' && c.retryCount > 0).length;

    return {
      total,
      completed,
      inProgress,
      failed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  // ── Lifecycle ─────────────────────────────────────

  startPolling(intervalMs?: number): void {
    const board = this.boardManager.getBoard(this.boardId);
    const interval = intervalMs || board?.swarmConfig.progressReportInterval || 5000;

    if (this.pollInterval) return;

    this.pollInterval = setInterval(async () => {
      const progress = this.getOverallProgress();
      this.emit('progress_report', progress);

      // Check for idle workers and reassign
      if (board?.swarmConfig.idleWorkerReassignment) {
        await this.autoAssignTasks();
      }
    }, interval);
  }

  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  getActiveExecutions(): string[] {
    return Array.from(this.activeExecutions.keys());
  }
}
