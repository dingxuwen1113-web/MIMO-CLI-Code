// ── Workflow Execution Engine ──────────────────────────────────
// Real implementation with:
//   - True pipelined execution (stage N+1 item M starts as soon as
//     stage N item M finishes -- no full-stage barriers)
//   - Semaphore-based concurrency control
//   - Token budget tracking
//   - Phase-based progress grouping
//   - Subagent spawning via SubagentManager or lightweight runner
//   - Nested workflow execution
//   - Journal-based resume with deterministic agent caching

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  ScriptRunner,
  ScriptResult,
  CachedAgentResult,
  loadScriptFromFile,
  saveRunResult,
  loadRunResult,
} from './script-runner';

// ── Core types ─────────────────────────────────────────────────

export interface WorkflowScript {
  meta: {
    name: string;
    description: string;
    phases?: Array<{ title: string; detail?: string }>;
  };
  body: (ctx: WorkflowContext) => Promise<any>;
}

export interface AgentOpts {
  label?: string;
  model?: string;
  schema?: object;
  phase?: string;
  isolation?: 'worktree';
  agentType?: string;
  maxTurns?: number;
}

export interface WorkflowContext {
  agent: (prompt: string, opts?: AgentOpts) => Promise<any>;
  pipeline: (
    items: any[],
    ...stages: Array<(prevResult: any, item: any, index: number) => Promise<any>>
  ) => Promise<any[]>;
  parallel: (thunks: Array<() => Promise<any>>) => Promise<any[]>;
  phase: (title: string) => void;
  log: (message: string) => void;
  args: any;
  budget: {
    total: number | null;
    spent(): number;
    remaining(): number;
  };
  workflow: (nameOrRef: string | { scriptPath: string }, args?: any) => Promise<any>;
}

export type AgentRunner = (
  prompt: string,
  options?: { model?: string; label?: string; schema?: object }
) => Promise<string | object>;

export interface WorkflowBudget {
  totalTokens: number | null;
  spentTokens: number;
  maxAgents: number;
  agentCount: number;
}

// ── Concurrency limiter ───────────────────────────────────────

export class Semaphore {
  private _permits: number;
  private _waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    if (permits < 1) throw new Error('Semaphore permits must be >= 1');
    this._permits = permits;
  }

  get permits(): number {
    return Math.max(0, this._permits);
  }

  get available(): number {
    return Math.max(0, this._permits);
  }

  get waiting(): number {
    return this._waitQueue.length;
  }

  acquire(): Promise<void> {
    if (this._permits > 0) {
      this._permits--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this._waitQueue.push(() => {
        this._permits--;
        resolve();
      });
    });
  }

  release(): void {
    if (this._waitQueue.length > 0) {
      const next = this._waitQueue.shift()!;
      // Run async to avoid stack buildup
      queueMicrotask(next);
    } else {
      this._permits++;
    }
  }

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// ── Workflow Engine ───────────────────────────────────────────

const MAX_TOTAL_AGENTS = 1000;

function maxConcurrency(): number {
  try {
    const cores = os.cpus().length;
    return Math.min(16, Math.max(1, cores - 2));
  } catch {
    return 8;
  }
}

export class WorkflowEngine {
  private agentRunner: AgentRunner;
  private subagentManager: any | null;
  private savedWorkflows: Map<string, WorkflowScript> = new Map();

  constructor(agentRunner: AgentRunner, subagentManager?: any) {
    this.agentRunner = agentRunner;
    this.subagentManager = subagentManager ?? null;
  }

  // ── Saved workflow persistence ─────────────────────────────

  async loadSaved(): Promise<void> {
    const dir = path.join(os.homedir(), '.mimo', 'workflows');
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(path.join(dir, file), 'utf-8');
          const script = JSON.parse(raw) as WorkflowScript;
          this.savedWorkflows.set(script.meta.name, script);
        } catch {
          /* skip malformed */
        }
      }
    } catch {
      /* directory does not exist */
    }
  }

  getSaved(): WorkflowScript[] {
    return Array.from(this.savedWorkflows.values());
  }

  async save(script: WorkflowScript): Promise<void> {
    const dir = path.join(os.homedir(), '.mimo', 'workflows');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${script.meta.name}.json`);
    await fs.writeFile(filePath, JSON.stringify(script, null, 2), 'utf-8');
    this.savedWorkflows.set(script.meta.name, script);
  }

  // ── Script execution (via ScriptRunner) ────────────────────

  async runScript(script: string, args?: any, budget?: Partial<WorkflowBudget>): Promise<ScriptResult> {
    const runner = new ScriptRunner(this.agentRunner, budget, this.subagentManager);
    return runner.run(script, args);
  }

  async runScriptFile(filePath: string, args?: any, budget?: Partial<WorkflowBudget>): Promise<ScriptResult> {
    const script = await loadScriptFromFile(filePath);
    return this.runScript(script, args, budget);
  }

  async runSavedScript(name: string, args?: any, budget?: Partial<WorkflowBudget>): Promise<ScriptResult> {
    const script = this.savedWorkflows.get(name);
    if (!script) throw new Error(`Workflow "${name}" not found`);

    // Saved workflows are JSON-serialized, so `body` (a function) is always
    // `undefined` after round-trip.  Try to load the corresponding .js file
    // from the standard workflows directory.
    const candidates = [
      path.join(os.homedir(), '.mimo', 'workflows', `${name}.js`),
      path.join(process.cwd(), '.mimo', 'workflows', `${name}.js`),
    ];
    for (const candidate of candidates) {
      try {
        const scriptContent = await loadScriptFromFile(candidate);
        return this.runScript(scriptContent, args, budget);
      } catch {
        /* try next */
      }
    }
    throw new Error(
      `Workflow "${name}" has no loadable .js file. ` +
      `Place a ${name}.js file in ~/.mimo/workflows/ or ./.mimo/workflows/.`
    );
  }

  async resumeScript(runId: string, script: string, args?: any, budget?: Partial<WorkflowBudget>): Promise<ScriptResult> {
    const cached = await loadRunResult(runId);
    const runner = new ScriptRunner(this.agentRunner, budget, this.subagentManager);
    if (cached?.agentResults) {
      runner.setCache(cached.agentResults);
    }
    const result = await runner.run(script, args);
    const newRunId = `wf_${Date.now().toString(36)}`;
    await saveRunResult(newRunId, result, runner.getAgentResults());
    return result;
  }

  // ── Live script execution (for WorkflowScript with body fn) ─

  async execute(script: WorkflowScript, args?: any, budget?: Partial<WorkflowBudget>): Promise<ScriptResult> {
    const startTime = Date.now();

    const state = this._createState(budget);
    const logs: string[] = [];
    const errors: string[] = [];
    const phases: Array<{ title: string; agents: string[] }> = [];
    let currentPhase = '';
    const runId = `wf_${Date.now().toString(36)}`;
    const agentCallIndex = new Map<string, { idx: number }>();
    let nextCallIdx = 0;

    // Journal for resume
    const journal: JournalEntry = {
      runId,
      scriptName: script.meta.name,
      args,
      agentResults: [],
      timestamp: new Date().toISOString(),
    };

    const self = this;

    const ctx: WorkflowContext = {
      // ── agent() ──────────────────────────────────────────
      agent: async (prompt: string, opts?: AgentOpts): Promise<any> => {
        self._checkBudget(state, errors);
        self._checkAgentCount(state, errors);

        const label = opts?.label || `agent-${nextCallIdx}`;
        const phase = opts?.phase || currentPhase;

        state.agentCount++;
        const thisCallIdx = nextCallIdx++;
        agentCallIndex.set(prompt, { idx: thisCallIdx });

        try {
          let result: any;

          if (opts?.isolation === 'worktree' && self.subagentManager) {
            result = await self.subagentManager.spawn(prompt, {
              label,
              model: opts.model,
              worktree: true,
              maxTurns: opts.maxTurns,
            });
            result = result?.output ?? result;
          } else {
            result = await self.agentRunner(prompt, {
              model: opts?.model,
              label,
              schema: opts?.schema,
            });
          }

          // Estimate token consumption
          const inputTokens = Math.ceil(prompt.length / 3);
          const outputTokens = typeof result === 'string'
            ? Math.ceil(result.length / 3)
            : 1000;
          state.spentTokens += inputTokens + outputTokens;

          // Record in journal
          journal.agentResults.push({ prompt, opts, result, callIdx: thisCallIdx });

          // Record in phase
          if (phase) {
            self._recordAgentToPhase(phases, phase, label);
          }

          logs.push(`[agent] ${label} completed`);
          return result;
        } catch (err: any) {
          errors.push(`agent "${label}" failed: ${err.message}`);
          logs.push(`[agent] ${label} FAILED: ${err.message}`);
          journal.agentResults.push({ prompt, opts, result: null, error: err.message, callIdx: thisCallIdx });
          return null;
        }
      },

      // ── pipeline() ───────────────────────────────────────
      pipeline: async (
        items: any[],
        ...stages: Array<(prevResult: any, item: any, index: number) => Promise<any>>
      ): Promise<any[]> => {
        if (items.length === 0) return [];
        if (stages.length === 0) return [...items];

        const concurrency = maxConcurrency();
        const sem = new Semaphore(concurrency);

        const results: any[] = new Array(items.length).fill(undefined);
        const failed: boolean[] = new Array(items.length).fill(false);
        const stageIdx: number[] = new Array(items.length).fill(0);
        const stagePromises: Array<Promise<any> | null> = new Array(items.length).fill(null);
        let nextPending = 0;

        const launchItem = (itemIndex: number): void => {
          const runStage = async (): Promise<void> => {
            let current: any = itemIndex === 0 ? undefined : undefined;

            while (stageIdx[itemIndex] < stages.length && !failed[itemIndex]) {
              const si = stageIdx[itemIndex];
              const isFirstStage = si === 0;

              // For stage 0, input is the original item.
              // For stage N>0, input is the result we set below.
              const input = isFirstStage ? items[itemIndex] : results[itemIndex];

              try {
                await sem.acquire();
                let stageResult: any;
                try {
                  stageResult = await stages[si](input, items[itemIndex], itemIndex);
                } finally {
                  sem.release();
                }
                results[itemIndex] = stageResult;
              } catch (err: any) {
                logs.push(`[pipeline] item ${itemIndex} stage ${si} failed: ${err.message}`);
                errors.push(`pipeline item ${itemIndex} stage ${si}: ${err.message}`);
                results[itemIndex] = null;
                failed[itemIndex] = true;
                return;
              }

              stageIdx[itemIndex]++;

              // After completing a stage for this item, immediately try to
              // start the next pending item (if any) so the pipeline fills.
              if (nextPending < items.length) {
                const ni = nextPending;
                nextPending++;
                // Fire-and-forget: launchItem registers its own promise
                launchItem(ni);
              }
            }
          };

          stagePromises[itemIndex] = runStage();
        };

        // Bootstrap: launch up to `concurrency` initial items
        const initialCount = Math.min(concurrency, items.length);
        nextPending = initialCount;
        for (let i = 0; i < initialCount; i++) {
          launchItem(i);
        }

        // Wait for all items to complete
        for (let i = 0; i < items.length; i++) {
          if (stagePromises[i]) {
            await stagePromises[i];
          }
        }

        return results;
      },

      // ── parallel() ───────────────────────────────────────
      parallel: async (thunks: Array<() => Promise<any>>): Promise<any[]> => {
        const outcomes = await Promise.allSettled(
          thunks.map(async (thunk) => {
            try {
              return await thunk();
            } catch (err: any) {
              errors.push(`parallel thunk failed: ${err.message}`);
              return null;
            }
          })
        );
        return outcomes.map((o) => (o.status === 'fulfilled' ? o.value : null));
      },

      // ── phase() ──────────────────────────────────────────
      phase: (title: string): void => {
        currentPhase = title;
        phases.push({ title, agents: [] });
        logs.push(`═══ Phase: ${title} ═══`);
      },

      // ── log() ────────────────────────────────────────────
      log: (message: string): void => {
        logs.push(message);
      },

      // ── args ─────────────────────────────────────────────
      args: args ?? {},

      // ── budget ───────────────────────────────────────────
      budget: {
        total: state.totalTokens,
        spent: () => state.spentTokens,
        remaining: () =>
          state.totalTokens != null
            ? Math.max(0, state.totalTokens - state.spentTokens)
            : Infinity,
      },

      // ── workflow() ───────────────────────────────────────
      workflow: async (
        nameOrRef: string | { scriptPath: string },
        nestedArgs?: any
      ): Promise<any> => {
        return self._runNestedWorkflow(nameOrRef, nestedArgs, state, errors, logs);
      },
    };

    // Execute the script body
    let returnValue: any;
    try {
      returnValue = await script.body(ctx);
    } catch (err: any) {
      errors.push(`Script body error: ${err.message}`);
      returnValue = null;
    }

    // Save journal for resume
    try {
      await saveRunResult(runId, {
        meta: script.meta,
        returnValue,
        logs,
        errors,
        agentsSpawned: state.agentCount,
        tokensSpent: state.spentTokens,
        duration: Date.now() - startTime,
      }, journal.agentResults.map(a => ({ prompt: a.prompt, opts: a.opts, result: a.result, callIdx: a.callIdx })));
    } catch {
      /* non-fatal */
    }

    return {
      meta: script.meta,
      returnValue,
      logs,
      errors,
      agentsSpawned: state.agentCount,
      tokensSpent: state.spentTokens,
      duration: Date.now() - startTime,
      runId,
    } as ScriptResult & { runId: string };
  }

  // ── Private helpers ──────────────────────────────────────────

  private _createState(budget?: Partial<WorkflowBudget>): EngineState {
    return {
      totalTokens: budget?.totalTokens ?? null,
      spentTokens: budget?.spentTokens ?? 0,
      maxAgents: budget?.maxAgents ?? MAX_TOTAL_AGENTS,
      agentCount: budget?.agentCount ?? 0,
      agentSemaphore: new Semaphore(maxConcurrency()),
    };
  }

  private _checkBudget(state: EngineState, errors: string[]): void {
    if (state.totalTokens != null && state.spentTokens >= state.totalTokens) {
      const msg = `Token budget exhausted (${state.spentTokens}/${state.totalTokens})`;
      errors.push(msg);
      throw new Error(msg);
    }
  }

  private _checkAgentCount(state: EngineState, errors: string[]): void {
    if (state.agentCount >= state.maxAgents) {
      const msg = `Agent count limit reached (${state.maxAgents})`;
      errors.push(msg);
      throw new Error(msg);
    }
  }

  private _recordAgentToPhase(
    phases: Array<{ title: string; agents: string[] }>,
    phaseTitle: string,
    label: string
  ): void {
    let group = phases.find((p) => p.title === phaseTitle);
    if (!group) {
      group = { title: phaseTitle, agents: [] };
      phases.push(group);
    }
    group.agents.push(label);
  }

  private async _runNestedWorkflow(
    nameOrRef: string | { scriptPath: string },
    nestedArgs: any,
    state: EngineState,
    errors: string[],
    logs: string[]
  ): Promise<any> {
    try {
      let scriptContent: string;

      if (typeof nameOrRef === 'object' && nameOrRef.scriptPath) {
        // Load from file path
        scriptContent = await loadScriptFromFile(nameOrRef.scriptPath);
      } else if (typeof nameOrRef === 'string') {
        // Check if it looks like a file path
        if (nameOrRef.includes('/') || nameOrRef.includes('\\') || nameOrRef.endsWith('.js')) {
          scriptContent = await loadScriptFromFile(nameOrRef);
        } else {
          // Look up by name in saved workflows
          const saved = this.savedWorkflows.get(nameOrRef);
          if (saved?.body) {
            // Can't serialize live function -- not supported for string refs
            throw new Error(
              `Nested workflow "${nameOrRef}" has a live body. Use {scriptPath} to load from file.`
            );
          }
          // Try to find a .js file in standard locations
          const candidates = [
            path.join(process.cwd(), '.mimo', 'workflows', `${nameOrRef}.js`),
            path.join(os.homedir(), '.mimo', 'workflows', `${nameOrRef}.js`),
          ];
          let found = false;
          for (const candidate of candidates) {
            try {
              scriptContent = await loadScriptFromFile(candidate);
              found = true;
              break;
            } catch {
              /* try next */
            }
          }
          if (!found) {
            throw new Error(`Nested workflow "${nameOrRef}" not found`);
          }
        }
      } else {
        throw new Error('Invalid workflow reference');
      }

      // Execute via ScriptRunner with shared budget state
      const runner = new ScriptRunner(
        this.agentRunner,
        {
          totalTokens: state.totalTokens,
          spentTokens: state.spentTokens,
          maxAgents: state.maxAgents,
          agentCount: state.agentCount,
        },
        this.subagentManager
      );

      const result = await runner.run(scriptContent!, nestedArgs);

      // Merge budget state back
      state.spentTokens = runner.getTokensSpent();
      state.agentCount = runner.getAgentsSpawned();

      if (result.errors.length > 0) {
        errors.push(...result.errors.map((e) => `[nested] ${e}`));
      }
      logs.push(...result.logs.map((l) => `[nested] ${l}`));

      return result.returnValue;
    } catch (err: any) {
      errors.push(`Nested workflow error: ${err.message}`);
      logs.push(`[nested] FAILED: ${err.message}`);
      return null;
    }
  }
}

// ── Internal state ────────────────────────────────────────────

interface EngineState {
  totalTokens: number | null;
  spentTokens: number;
  maxAgents: number;
  agentCount: number;
  agentSemaphore: Semaphore;
}

interface JournalEntry {
  runId: string;
  scriptName: string;
  args: any;
  agentResults: Array<{
    prompt: string;
    opts: any;
    result: any;
    error?: string;
    callIdx: number;
  }>;
  timestamp: string;
}
