// ── Batch System Types ───────────────────────────────

export type BatchStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type TrajectoryStepType = 'tool_call' | 'tool_result' | 'thought' | 'message' | 'error' | 'state_snapshot';

export interface BatchConfig {
  concurrency: number;
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  outputFormat: 'jsonl' | 'json' | 'csv';
  outputPath: string;
  continueOnError: boolean;
  progressCallback?: (progress: BatchProgress) => void;
}

export interface BatchPrompt {
  id: string;
  prompt: string;
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  metadata?: Record<string, any>;
}

export interface Trajectory {
  id: string;
  promptId: string;
  prompt: string;
  steps: TrajectoryStep[];
  startedAt: string;
  endedAt: string | null;
  totalTokensUsed: number;
  model: string;
  metadata: Record<string, any>;
  summary: string | null;
}

export interface TrajectoryStep {
  id: string;
  index: number;
  type: TrajectoryStepType;
  timestamp: string;
  content: string;
  toolName: string | null;
  toolInput: Record<string, any> | null;
  toolOutput: string | null;
  isError: boolean;
  tokensUsed: number;
  durationMs: number;
  stateSnapshot: Record<string, any> | null;
  metadata: Record<string, any>;
}

export interface BatchResult {
  id: string;
  promptId: string;
  status: BatchStatus;
  response: string | null;
  error: string | null;
  tokensUsed: number;
  durationMs: number;
  trajectoryId: string | null;
  startedAt: string;
  endedAt: string | null;
  retryCount: number;
  metadata: Record<string, any>;
}

export interface BatchRun {
  id: string;
  status: BatchStatus;
  config: BatchConfig;
  prompts: BatchPrompt[];
  results: BatchResult[];
  startedAt: string;
  endedAt: string | null;
  totalTokensUsed: number;
  totalDurationMs: number;
}

export interface BatchProgress {
  batchId: string;
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
  percentage: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
  currentPrompts: string[];
}

export interface TrajectoryCompressionConfig {
  maxSteps: number;
  removeRedundantOutputs: boolean;
  summarizeLongConversations: boolean;
  summarizeThreshold: number;
  preserveErrors: boolean;
  preserveDecisions: boolean;
  targetTokenCount: number;
}

export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  concurrency: 5,
  maxRetries: 2,
  retryDelayMs: 1000,
  timeoutMs: 300000,
  outputFormat: 'jsonl',
  outputPath: './batch-results',
  continueOnError: true,
};

export const DEFAULT_COMPRESSION_CONFIG: TrajectoryCompressionConfig = {
  maxSteps: 100,
  removeRedundantOutputs: true,
  summarizeLongConversations: true,
  summarizeThreshold: 50,
  preserveErrors: true,
  preserveDecisions: true,
  targetTokenCount: 4000,
};
