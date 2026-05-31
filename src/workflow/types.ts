// ── Workflow Definition Types ────────────────────────────────────────────────
// Declarative workflow definitions with conditional branching, loops,
// error handling, variable system, step dependencies, and parallel execution.

// ── Variable & Expression Types ─────────────────────────────────────────────

/** A template string that can contain {{variable}} references */
export type TemplateString = string;

/** Variable definition for the workflow */
export interface VariableDefinition {
  /** Variable name (used as {{name}} in templates) */
  name: string;
  /** Default value if not provided at runtime */
  default?: any;
  /** Optional description */
  description?: string;
  /** Whether the variable is required (must be provided at runtime) */
  required?: boolean;
}

/** Condition expression evaluated at runtime */
export interface ConditionExpression {
  /** Left operand - can be a template string referencing variables/step results */
  left: TemplateString;
  /** Comparison operator */
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'matches' | 'exists' | 'not_exists' | 'in' | 'not_in' | 'truthy' | 'falsy';
  /** Right operand (not needed for exists/not_exists/truthy/falsy) */
  right?: any;
}

/** A condition can be a single expression, a boolean, or a complex group */
export type Condition =
  | ConditionExpression
  | boolean
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition };

// ── Retry Policy ────────────────────────────────────────────────────────────

export interface RetryPolicy {
  /** Maximum number of retry attempts (default: 0 = no retries) */
  maxAttempts: number;
  /** Delay between retries in milliseconds */
  delayMs?: number;
  /** Use exponential backoff for delay (delay * 2^attempt) */
  exponentialBackoff?: boolean;
  /** Only retry on specific error patterns */
  retryOn?: string[];
  /** Max delay cap in milliseconds */
  maxDelayMs?: number;
}

// ── Step Types ──────────────────────────────────────────────────────────────

export type StepType = 'command' | 'tool' | 'agent' | 'condition' | 'loop' | 'parallel' | 'try_catch' | 'set_variable' | 'log' | 'workflow';

/** Base step fields shared by all step types */
export interface StepBase {
  /** Unique step ID (used for dependencies and result access) */
  id: string;
  /** Step type */
  type: StepType;
  /** Human-readable name */
  name?: string;
  /** Description of what this step does */
  description?: string;
  /** Step dependencies - IDs of steps that must complete before this one runs */
  dependsOn?: string[];
  /** Whether this step should run concurrently with other parallel steps */
  parallel?: boolean;
  /** Error handling strategy */
  onError?: 'fail' | 'skip' | 'retry';
  /** Retry policy (used when onError is 'retry') */
  retry?: RetryPolicy;
  /** Conditional execution - step only runs if condition is true */
  when?: Condition;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/** Execute a shell command */
export interface CommandStep extends StepBase {
  type: 'command';
  /** The shell command to execute (supports {{variable}} templates) */
  command: TemplateString;
  /** Working directory (supports templates) */
  cwd?: TemplateString;
  /** Environment variables to set (values support templates) */
  env?: Record<string, TemplateString>;
}

/** Execute a registered tool */
export interface ToolStep extends StepBase {
  type: 'tool';
  /** Tool name (e.g., 'file_read', 'grep_search') */
  tool: string;
  /** Tool input parameters (values support templates) */
  input: Record<string, any>;
}

/** Spawn an AI agent */
export interface AgentStep extends StepBase {
  type: 'agent';
  /** Prompt to send to the agent (supports templates) */
  prompt: TemplateString;
  /** Optional model override */
  model?: string;
  /** Schema for structured output */
  schema?: object;
  /** Agent label for tracking */
  label?: string;
}

/** Conditional branching (if/else) */
export interface ConditionStep extends StepBase {
  type: 'condition';
  /** Condition to evaluate */
  condition: Condition;
  /** Steps to execute if condition is true */
  then: WorkflowStep[];
  /** Steps to execute if condition is false */
  else?: WorkflowStep[];
}

/** Loop over items or while condition is true */
export interface LoopStep extends StepBase {
  type: 'loop';
  /** forEach: iterate over a list of items */
  forEach?: {
    /** Expression that evaluates to an array (supports templates) */
    items: TemplateString;
    /** Variable name for the current item (default: 'item') */
    as?: string;
    /** Variable name for the current index (default: 'index') */
    indexAs?: string;
    /** Steps to execute for each item */
    body: WorkflowStep[];
    /** Max iterations (safety limit) */
    maxIterations?: number;
  };
  /** while: repeat while condition is true */
  while?: {
    /** Condition to check before each iteration */
    condition: Condition;
    /** Steps to execute each iteration */
    body: WorkflowStep[];
    /** Max iterations (safety limit, default: 100) */
    maxIterations?: number;
  };
}

/** Parallel execution of multiple step groups */
export interface ParallelStep extends StepBase {
  type: 'parallel';
  /** Steps to execute concurrently */
  steps: WorkflowStep[];
  /** Max concurrency (default: unlimited) */
  maxConcurrency?: number;
  /** Wait for all steps even if some fail */
  waitForAll?: boolean;
}

/** Try/catch error handling */
export interface TryCatchStep extends StepBase {
  type: 'try_catch';
  /** Steps to try */
  try: WorkflowStep[];
  /** Steps to execute on error */
  catch?: WorkflowStep[];
  /** Steps to execute regardless (finally) */
  finally?: WorkflowStep[];
  /** Variable name for the caught error (default: 'error') */
  errorAs?: string;
}

/** Set a variable */
export interface SetVariableStep extends StepBase {
  type: 'set_variable';
  /** Variable name */
  name: string;
  /** Value to set (supports templates) */
  value: any;
}

/** Log a message */
export interface LogStep extends StepBase {
  type: 'log';
  /** Message to log (supports templates) */
  message: TemplateString;
  /** Log level */
  level?: 'info' | 'warn' | 'error' | 'debug';
}

/** Execute a nested workflow */
export interface WorkflowRefStep extends StepBase {
  type: 'workflow';
  /** Workflow name or file path */
  workflow: string;
  /** Arguments to pass to the nested workflow */
  args?: Record<string, any>;
}

/** Union of all step types */
export type WorkflowStep =
  | CommandStep
  | ToolStep
  | AgentStep
  | ConditionStep
  | LoopStep
  | ParallelStep
  | TryCatchStep
  | SetVariableStep
  | LogStep
  | WorkflowRefStep;

// ── Workflow Definition ─────────────────────────────────────────────────────

export interface WorkflowDefinition {
  /** Workflow metadata */
  meta: {
    /** Workflow name (must be unique) */
    name: string;
    /** Human-readable description */
    description: string;
    /** Version string */
    version?: string;
    /** Author */
    author?: string;
    /** Tags for discovery */
    tags?: string[];
    /** Phase descriptions for progress display */
    phases?: Array<{ title: string; detail?: string }>;
  };
  /** Input variables for the workflow */
  variables?: VariableDefinition[];
  /** Ordered list of steps to execute */
  steps: WorkflowStep[];
  /** Default retry policy for all steps */
  defaultRetry?: RetryPolicy;
  /** Default error handling for all steps */
  defaultOnError?: 'fail' | 'skip' | 'retry';
  /** Max total execution time in milliseconds */
  timeoutMs?: number;
}

// ── Runtime Context ─────────────────────────────────────────────────────────

export interface WorkflowVariables {
  /** Get a variable value */
  get(name: string): any;
  /** Set a variable value */
  set(name: string, value: any): void;
  /** Check if a variable exists */
  has(name: string): boolean;
  /** Get all variables as a plain object */
  all(): Record<string, any>;
}

export interface StepResult {
  /** Step ID */
  stepId: string;
  /** Whether the step succeeded */
  success: boolean;
  /** Output value from the step */
  output: any;
  /** Error if the step failed */
  error?: string;
  /** Duration in milliseconds */
  duration: number;
  /** Whether this result came from cache */
  fromCache?: boolean;
  /** Number of retry attempts used */
  retryAttempts?: number;
}

export interface WorkflowContext {
  /** Variable storage */
  variables: WorkflowVariables;
  /** Results from completed steps (keyed by step ID) */
  results: Map<string, StepResult>;
  /** Current step index */
  currentStepIndex: number;
  /** Current step ID */
  currentStepId: string;
  /** Workflow definition */
  definition: WorkflowDefinition;
  /** Runtime args passed to the workflow */
  args: Record<string, any>;
  /** Total steps completed */
  stepsCompleted: number;
  /** Total steps in the workflow */
  stepsTotal: number;
  /** Emitted events for progress tracking */
  emit: (event: WorkflowEvent) => void;
}

// ── Workflow Result ─────────────────────────────────────────────────────────

export interface WorkflowResult {
  /** Whether the workflow completed successfully */
  success: boolean;
  /** Final return value (from the last step's output) */
  returnValue: any;
  /** All step results keyed by step ID */
  stepResults: Map<string, StepResult>;
  /** Variables at completion */
  variables: Record<string, any>;
  /** Collected log messages */
  logs: string[];
  /** Collected error messages */
  errors: string[];
  /** Total duration in milliseconds */
  duration: number;
  /** Total steps executed */
  stepsExecuted: number;
  /** Run ID for journal/resume */
  runId: string;
  /** Workflow metadata */
  meta: WorkflowDefinition['meta'];
}

// ── Progress Events ─────────────────────────────────────────────────────────

export type WorkflowEventType =
  | 'workflow_start'
  | 'workflow_end'
  | 'step_start'
  | 'step_end'
  | 'step_retry'
  | 'step_skip'
  | 'step_error'
  | 'phase_start'
  | 'phase_end'
  | 'variable_set'
  | 'log'
  | 'progress';

export interface WorkflowEvent {
  type: WorkflowEventType;
  timestamp: number;
  /** Step ID (for step events) */
  stepId?: string;
  /** Step name */
  stepName?: string;
  /** Step type */
  stepType?: StepType;
  /** Phase title (for phase events) */
  phaseTitle?: string;
  /** Progress fraction 0-1 (for progress events) */
  progress?: number;
  /** Steps completed / total */
  stepsCompleted?: number;
  stepsTotal?: number;
  /** Message for log events */
  message?: string;
  /** Variable name (for variable_set events) */
  variableName?: string;
  /** Step result (for step_end events) */
  result?: StepResult;
  /** Error message */
  error?: string;
  /** Retry attempt number */
  retryAttempt?: number;
}

/** Progress listener callback */
export type WorkflowEventListener = (event: WorkflowEvent) => void;
