// ── Kanban System Exports ────────────────────────────

export {
  KanbanColumnId,
  CardPriority,
  CardStatus,
  KanbanCard,
  Subtask,
  KanbanColumn,
  KanbanBoard,
  WorkerStatus,
  Worker,
  SwarmConfig,
  TaskDecomposition,
  SuggestedSubtask,
  BoardEvent,
  BoardStats,
  DEFAULT_COLUMNS,
  DEFAULT_SWARM_CONFIG,
} from './types';

export { KanbanBoardManager } from './board';

export {
  SwarmOrchestrator,
  SwarmAgent,
  SwarmTask,
  SwarmTaskResult,
  DecompositionStrategy,
} from './swarm';

export {
  WorkerAgent,
  WorkerConfig,
  WorkerMessage,
  TaskExecutor,
} from './worker';
