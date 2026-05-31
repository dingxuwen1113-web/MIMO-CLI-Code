// ── Kanban System Types ──────────────────────────────

export type KanbanColumnId = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';

export type CardPriority = 'critical' | 'high' | 'medium' | 'low';

export type CardStatus = KanbanColumnId;

export interface KanbanCard {
  id: string;
  title: string;
  description: string;
  columnId: KanbanColumnId;
  priority: CardPriority;
  labels: string[];
  assigneeId: string | null;
  dependencies: string[];
  subtasks: Subtask[];
  estimatedTokens: number;
  actualTokens: number;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  metadata: Record<string, any>;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  completedAt: string | null;
}

export interface KanbanColumn {
  id: KanbanColumnId;
  name: string;
  description: string;
  wipLimit: number | null;
  order: number;
}

export interface KanbanBoard {
  id: string;
  name: string;
  description: string;
  columns: KanbanColumn[];
  cards: KanbanCard[];
  workers: Worker[];
  swarmConfig: SwarmConfig;
  createdAt: string;
  updatedAt: string;
}

export type WorkerStatus = 'idle' | 'busy' | 'offline' | 'error';

export interface Worker {
  id: string;
  name: string;
  status: WorkerStatus;
  capabilities: string[];
  maxConcurrent: number;
  currentTaskIds: string[];
  completedTaskCount: number;
  failedTaskCount: number;
  lastHeartbeat: string | null;
  createdAt: string;
  metadata: Record<string, any>;
}

export interface SwarmConfig {
  maxWorkers: number;
  autoAssign: boolean;
  retryFailedTasks: boolean;
  maxRetries: number;
  taskDecomposition: boolean;
  parallelExecution: boolean;
  dependencyResolution: 'strict' | 'relaxed';
  idleWorkerReassignment: boolean;
  progressReportInterval: number;
}

export interface TaskDecomposition {
  taskId: string;
  parentId: string | null;
  subtaskIds: string[];
  strategy: 'sequential' | 'parallel' | 'mixed';
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  suggestedBreakdown: SuggestedSubtask[];
}

export interface SuggestedSubtask {
  title: string;
  description: string;
  estimatedTokens: number;
  requiredCapabilities: string[];
  dependencies: string[];
  order: number;
}

export interface BoardEvent {
  type: 'card_created' | 'card_updated' | 'card_moved' | 'card_assigned' | 'card_completed' |
        'card_failed' | 'worker_joined' | 'worker_left' | 'worker_status_changed' | 'board_updated';
  boardId: string;
  cardId?: string;
  workerId?: string;
  data: Record<string, any>;
  timestamp: string;
}

export interface BoardStats {
  totalCards: number;
  cardsByColumn: Record<KanbanColumnId, number>;
  cardsByPriority: Record<CardPriority, number>;
  activeWorkers: number;
  idleWorkers: number;
  averageCompletionTime: number;
  throughput: number;
  blockedCards: number;
}

export const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: 'backlog', name: 'Backlog', description: 'Tasks waiting to be planned', wipLimit: null, order: 0 },
  { id: 'todo', name: 'To Do', description: 'Tasks ready to be worked on', wipLimit: 10, order: 1 },
  { id: 'in_progress', name: 'In Progress', description: 'Tasks currently being worked on', wipLimit: 5, order: 2 },
  { id: 'review', name: 'Review', description: 'Tasks waiting for review', wipLimit: 3, order: 3 },
  { id: 'done', name: 'Done', description: 'Completed tasks', wipLimit: null, order: 4 },
];

export const DEFAULT_SWARM_CONFIG: SwarmConfig = {
  maxWorkers: 5,
  autoAssign: true,
  retryFailedTasks: true,
  maxRetries: 3,
  taskDecomposition: true,
  parallelExecution: true,
  dependencyResolution: 'strict',
  idleWorkerReassignment: true,
  progressReportInterval: 5000,
};
