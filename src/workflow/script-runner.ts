// ── Workflow Script Runner ─────────────────────────────────────
// Evaluates JavaScript workflow scripts in a sandboxed context.
//
// Script format:
//   export const meta = { name, description, phases }
//   // body uses: agent(), pipeline(), parallel(), phase(), log(), args, budget
//
// Pipeline: items flow through stages concurrently -- stage B item 0 runs as
//   soon as stage A item 0 finishes, even while stage A item 1 is still going.
// Parallel: barrier -- all thunks launch immediately, await all, return results.
// Agent: spawn subagent with concurrency cap, budget check, resume cache.
// Phase: group agents under a progress heading.
// Workflow: nested script execution.

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AgentRunner, WorkflowBudget, AgentOpts, Semaphore } from './engine';

// ── Public interfaces ─────────────────────────────────────────

export interface ScriptMeta {
  name: string;
  description: string;
  phases?: Array<{ title: string; detail?: string; model?: string }>;
}

export interface ScriptResult {
  meta: ScriptMeta;
  returnValue: any;
  logs: string[];
  errors: string[];
  agentsSpawned: number;
  tokensSpent: number;
  duration: number;
  runId?: string;
}

export interface CachedAgentResult {
  prompt: string;
  opts: any;
  result: any;
  callIdx: number;
}

interface PhaseGroup {
  title: string;
  agents: string[];
}

// ── Constants ─────────────────────────────────────────────────

const MAX_TOTAL_AGENTS = 1000;
const RUNS_DIR = path.join(os.homedir(), '.mimo', 'workflow-runs');

function maxConcurrency(): number {
  try {
    const cores = os.cpus().length;
    return Math.min(16, Math.max(1, cores - 2));
  } catch {
    return 8;
  }
}

// ── ScriptRunner ──────────────────────────────────────────────

export class ScriptRunner {
  private agentRunner: AgentRunner;
  private subagentManager: any | null;
  private budget: WorkflowBudget;
  private logs: string[] = [];
  private errors: string[] = [];
  private agentsSpawned: number = 0;
  private tokensSpent: number = 0;
  private currentPhase: string = '';
  private phases: PhaseGroup[] = [];
  private cachedResults: Map<number, any> = new Map();
  private agentResults: CachedAgentResult[] = [];
  private callIndex: number = 0;
  private agentSemaphore: Semaphore;
  private activeAgentCount: number = 0;

  constructor(
    agentRunner: AgentRunner,
    budget?: Partial<WorkflowBudget>,
    subagentManager?: any
  ) {
    this.agentRunner = agentRunner;
    this.subagentManager = subagentManager ?? null;
    this.budget = {
      totalTokens: budget?.totalTokens ?? null,
      spentTokens: budget?.spentTokens ?? 0,
      maxAgents: budget?.maxAgents ?? MAX_TOTAL_AGENTS,
      agentCount: budget?.agentCount ?? 0,
    };
    this.agentsSpawned = budget?.agentCount ?? 0;
    this.tokensSpent = budget?.spentTokens ?? 0;
    this.agentSemaphore = new Semaphore(maxConcurrency());
  }

  // ── Cache for resume ──────────────────────────────────────

  setCache(cached: CachedAgentResult[]): void {
    for (const entry of cached) {
      this.cachedResults.set(entry.callIdx, entry.result);
    }
  }

  // ── Run script string ─────────────────────────────────────

  async run(script: string, args?: any): Promise<ScriptResult> {
    const startTime = Date.now();

    // 1. Parse meta
    const meta = this.parseMeta(script);

    // 2. Extract body (strip the export const meta = {...}; block)
    const body = this.extractBody(script);

    // 3. Create sandbox with all workflow primitives
    const sandbox = this.createSandbox(args);

    // 4. Evaluate
    let returnValue: any;
    try {
      // Wrap as async IIFE so `return` at top level works
      const wrappedScript = `(async () => {\n${body}\n})()`;
      returnValue = await this.evaluateInSandbox(wrappedScript, sandbox);
    } catch (err: any) {
      this.errors.push(`Script execution error: ${err.message}`);
      returnValue = null;
    }

    return {
      meta,
      returnValue,
      logs: this.logs,
      errors: this.errors,
      agentsSpawned: this.agentsSpawned,
      tokensSpent: this.tokensSpent,
      duration: Date.now() - startTime,
    };
  }

  // ── Accessors ─────────────────────────────────────────────

  getPhases(): PhaseGroup[] {
    return this.phases;
  }

  getTokensSpent(): number {
    return this.tokensSpent;
  }

  getAgentsSpawned(): number {
    return this.agentsSpawned;
  }

  getAgentResults(): CachedAgentResult[] {
    return this.agentResults;
  }

  // ── Meta parsing ──────────────────────────────────────────

  private parseMeta(script: string): ScriptMeta {
    // Match: export const meta = { ... };
    // Handles multi-line, nested arrays, single/double quotes
    const metaMatch = script.match(
      /export\s+const\s+meta\s*=\s*(\{[\s\S]*?\n\})\s*;?/
    );
    if (metaMatch) {
      try {
        return this.safeParseMeta(metaMatch[1]);
      } catch {
        // Fall through to default
      }
    }

    // Also try: const meta = { ... }; (without export)
    const altMatch = script.match(/(?:^|\n)\s*const\s+meta\s*=\s*(\{[\s\S]*?\n\})\s*;?/);
    if (altMatch) {
      try {
        return this.safeParseMeta(altMatch[1]);
      } catch {
        // Fall through
      }
    }

    return { name: 'unnamed-workflow', description: '' };
  }

  private safeParseMeta(metaStr: string): ScriptMeta {
    const result: any = {};

    // name
    const nameMatch = metaStr.match(/name\s*:\s*['"]([^'"]+)['"]/);
    if (nameMatch) result.name = nameMatch[1];

    // description
    const descMatch = metaStr.match(/description\s*:\s*['"]([^'"]+)['"]/);
    if (descMatch) result.description = descMatch[1];

    // phases array
    const phasesMatch = metaStr.match(/phases\s*:\s*\[([\s\S]*?)\]/);
    if (phasesMatch) {
      const phases: any[] = [];
      const phaseRegex =
        /\{\s*title\s*:\s*['"]([^'"]+)['"](?:\s*,\s*detail\s*:\s*['"]([^'"]*?)['"])?(?:\s*,\s*model\s*:\s*['"]([^'"]*?)['"])?\s*\}/g;
      let m;
      while ((m = phaseRegex.exec(phasesMatch[1])) !== null) {
        const phase: any = { title: m[1] };
        if (m[2]) phase.detail = m[2];
        if (m[3]) phase.model = m[3];
        phases.push(phase);
      }
      result.phases = phases;
    }

    return result as ScriptMeta;
  }

  // ── Body extraction ───────────────────────────────────────

  private extractBody(script: string): string {
    let body = script;

    // Remove the meta declaration block
    body = body.replace(
      /export\s+const\s+meta\s*=\s*\{[\s\S]*?\n\}\s*;?\s*\n?/,
      ''
    );
    // Also handle `const meta = {...};` without export
    body = body.replace(
      /(?:^|\n)\s*const\s+meta\s*=\s*\{[\s\S]*?\n\}\s*;?\s*\n?/,
      '\n'
    );

    // Strip remaining export keywords (export default, export async, etc.)
    body = body.replace(/^export\s+(default\s+)?/gm, '');

    return body.trim();
  }

  // ── Sandbox creation ──────────────────────────────────────

  private createSandbox(args: any): Record<string, any> {
    const self = this;

    return {
      // ── args ────────────────────────────────────────────
      args: args ?? {},

      // ── budget ──────────────────────────────────────────
      budget: {
        get total() {
          return self.budget.totalTokens;
        },
        spent: () => self.tokensSpent,
        remaining: () =>
          self.budget.totalTokens != null
            ? Math.max(0, self.budget.totalTokens - self.tokensSpent)
            : Infinity,
      },

      // ── agent() ─────────────────────────────────────────
      agent: async (prompt: string, opts?: AgentOpts): Promise<any> => {
        // Budget check
        if (self.budget.totalTokens != null && self.tokensSpent >= self.budget.totalTokens) {
          throw new Error(
            `Token budget exhausted (${self.tokensSpent}/${self.budget.totalTokens})`
          );
        }
        // Agent count check
        if (self.agentsSpawned >= self.budget.maxAgents) {
          throw new Error(
            `Agent count limit reached (${self.budget.maxAgents})`
          );
        }

        const thisCallIdx = self.callIndex++;
        const label = opts?.label || `agent-${thisCallIdx}`;
        const phase = opts?.phase || self.currentPhase;

        // Resume cache check -- deterministic by call index
        if (self.cachedResults.has(thisCallIdx)) {
          const cached = self.cachedResults.get(thisCallIdx);
          self.logs.push(`[cache hit] agent #${thisCallIdx}: ${label}`);
          return cached;
        }

        self.agentsSpawned++;
        self.activeAgentCount++;
        self.budget.agentCount = self.agentsSpawned;

        try {
          let result: any;

          if (opts?.isolation === 'worktree' && self.subagentManager) {
            // Use SubagentManager for worktree-isolated execution
            const subResult = await self.subagentManager.spawn(prompt, {
              label,
              model: opts.model,
              worktree: true,
              maxTurns: opts.maxTurns,
            });
            result = subResult?.output ?? subResult;
          } else {
            // Use the lightweight agent runner
            result = await self.agentRunner(prompt, {
              model: opts?.model,
              label,
              schema: opts?.schema,
            });
          }

          // Estimate token consumption (input + output)
          const inputTokens = Math.ceil(prompt.length / 3);
          const outputTokens =
            typeof result === 'string' ? Math.ceil(result.length / 3) : 1000;
          self.tokensSpent += inputTokens + outputTokens;
          self.budget.spentTokens = self.tokensSpent;

          // Record in phase
          if (phase) {
            self.recordAgentToPhase(phase, label);
          }

          // Record for resume journal
          self.agentResults.push({
            prompt,
            opts,
            result,
            callIdx: thisCallIdx,
          });

          self.logs.push(`[agent] ${label} completed`);
          return result;
        } catch (err: any) {
          self.errors.push(`agent "${label}" failed: ${err.message}`);
          self.agentResults.push({
            prompt,
            opts,
            result: null,
            callIdx: thisCallIdx,
          });
          return null;
        } finally {
          self.activeAgentCount--;
        }
      },

      // ── pipeline() ──────────────────────────────────────
      // True pipelined execution:
      //   - Stage A item 0 starts immediately
      //   - Stage A item 1 starts (up to concurrency limit)
      //   - As soon as stage A item 0 finishes, stage B item 0 starts
      //     (even while stage A item 1 is still running)
      //   - No full-stage barriers
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
        const stageOfItem: number[] = new Array(items.length).fill(0);
        const itemPromises: Array<Promise<void>> = new Array(items.length);
        let nextPending = 0;

        const launchItem = (itemIndex: number): void => {
          const p = (async () => {
            let current = items[itemIndex];

            while (stageOfItem[itemIndex] < stages.length && !failed[itemIndex]) {
              const si = stageOfItem[itemIndex];

              try {
                await sem.acquire();
                let stageResult: any;
                try {
                  stageResult = await stages[si](current, items[itemIndex], itemIndex);
                } finally {
                  sem.release();
                }
                current = stageResult;
                results[itemIndex] = stageResult;
              } catch (err: any) {
                self.logs.push(
                  `[pipeline] item ${itemIndex} stage ${si} failed: ${err.message}`
                );
                self.errors.push(
                  `pipeline item ${itemIndex} stage ${si}: ${err.message}`
                );
                results[itemIndex] = null;
                failed[itemIndex] = true;
                return;
              }

              stageOfItem[itemIndex]++;

              // After completing a stage, try to start the next pending item
              if (nextPending < items.length) {
                const ni = nextPending++;
                launchItem(ni);
              }
            }
          })();

          itemPromises[itemIndex] = p;
        };

        // Bootstrap: launch up to `concurrency` items
        const initialCount = Math.min(concurrency, items.length);
        nextPending = initialCount;
        for (let i = 0; i < initialCount; i++) {
          launchItem(i);
        }

        // Wait for all items to finish
        for (let i = 0; i < items.length; i++) {
          await itemPromises[i];
        }

        return results;
      },

      // ── parallel() ──────────────────────────────────────
      // Barrier: launch all thunks concurrently, wait for all to settle.
      // Failed thunks return null.
      parallel: async (thunks: Array<() => Promise<any>>): Promise<any[]> => {
        const outcomes = await Promise.allSettled(
          thunks.map(async (thunk) => {
            try {
              return await thunk();
            } catch (err: any) {
              self.errors.push(`parallel thunk failed: ${err.message}`);
              return null;
            }
          })
        );
        return outcomes.map((o) => (o.status === 'fulfilled' ? o.value : null));
      },

      // ── phase() ─────────────────────────────────────────
      phase: (title: string): void => {
        self.currentPhase = title;
        self.phases.push({ title, agents: [] });
        self.logs.push(`═══ Phase: ${title} ═══`);
      },

      // ── log() ───────────────────────────────────────────
      log: (message: string): void => {
        self.logs.push(message);
      },

      // ── workflow() ──────────────────────────────────────
      // Run a nested workflow script by name or file path.
      workflow: async (
        nameOrRef: string | { scriptPath: string },
        nestedArgs?: any
      ): Promise<any> => {
        return self.runNestedWorkflow(nameOrRef, nestedArgs);
      },

      // ── Utility: conditional execution ──────────────────
      when: async (
        condition: boolean | (() => boolean),
        thenFn: () => Promise<any>,
        elseFn?: () => Promise<any>
      ): Promise<any> => {
        const cond = typeof condition === 'function' ? condition() : condition;
        if (cond) return await thenFn();
        if (elseFn) return await elseFn();
        return null;
      },

      // ── Utility: loop ───────────────────────────────────
      loop: async (
        maxIterations: number,
        fn: (i: number) => Promise<boolean | void>
      ): Promise<void> => {
        for (let i = 0; i < maxIterations; i++) {
          const shouldContinue = await fn(i);
          if (shouldContinue === false) break;
        }
      },

      // ── Utility: range ──────────────────────────────────
      range: (n: number): number[] => Array.from({ length: n }, (_, i) => i),

      // ── Passthrough globals ─────────────────────────────
      JSON,
      Promise,
      Error,
      Math,
      Date,
      Object,
      Array,
      Map,
      Set,
      console: {
        log: (...msg: any[]) => self.logs.push(msg.map(String).join(' ')),
        warn: (...msg: any[]) => self.logs.push(`[warn] ${msg.map(String).join(' ')}`),
        error: (...msg: any[]) => self.errors.push(msg.map(String).join(' ')),
      },
    };
  }

  // ── Sandbox evaluation ────────────────────────────────────

  private async evaluateInSandbox(code: string, sandbox: Record<string, any>): Promise<any> {
    const keys = Object.keys(sandbox);
    const values = keys.map((k) => sandbox[k]);

    // Use AsyncFunction constructor for sandboxed evaluation
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction(...keys, `return ${code}`);

    try {
      return await fn(...values);
    } catch (err: any) {
      throw new Error(`Script evaluation error: ${err.message}`);
    }
  }

  // ── Phase tracking ────────────────────────────────────────

  private recordAgentToPhase(phaseTitle: string, label: string): void {
    if (!phaseTitle) return;
    let group = this.phases.find((p) => p.title === phaseTitle);
    if (!group) {
      group = { title: phaseTitle, agents: [] };
      this.phases.push(group);
    }
    group.agents.push(label);
  }

  // ── Nested workflow execution ─────────────────────────────

  private async runNestedWorkflow(
    nameOrRef: string | { scriptPath: string },
    nestedArgs?: any
  ): Promise<any> {
    let scriptContent: string;

    if (typeof nameOrRef === 'object' && nameOrRef.scriptPath) {
      scriptContent = await loadScriptFromFile(nameOrRef.scriptPath);
    } else if (typeof nameOrRef === 'string') {
      // Treat as file path if it contains path separators or .js extension
      if (nameOrRef.includes('/') || nameOrRef.includes('\\') || nameOrRef.endsWith('.js')) {
        scriptContent = await loadScriptFromFile(nameOrRef);
      } else {
        // Search standard directories
        const candidates = [
          path.join(process.cwd(), '.mimo', 'workflows', `${nameOrRef}.js`),
          path.join(os.homedir(), '.mimo', 'workflows', `${nameOrRef}.js`),
          path.join(process.cwd(), '.claude', 'workflows', `${nameOrRef}.js`),
          path.join(os.homedir(), '.claude', 'workflows', `${nameOrRef}.js`),
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
          throw new Error(`Nested workflow "${nameOrRef}" not found in standard locations`);
        }
      }
    } else {
      throw new Error('Invalid workflow reference');
    }

    // Execute nested script with shared budget state
    const nestedRunner = new ScriptRunner(
      this.agentRunner,
      {
        totalTokens: this.budget.totalTokens,
        spentTokens: this.tokensSpent,
        maxAgents: this.budget.maxAgents,
        agentCount: this.agentsSpawned,
      },
      this.subagentManager
    );

    const result = await nestedRunner.run(scriptContent!, nestedArgs);

    // Merge budget state back from nested runner
    this.tokensSpent = nestedRunner.getTokensSpent();
    this.agentsSpawned = nestedRunner.getAgentsSpawned();
    this.budget.spentTokens = this.tokensSpent;
    this.budget.agentCount = this.agentsSpawned;

    // Merge logs and errors
    this.logs.push(...result.logs.map((l) => `[nested] ${l}`));
    if (result.errors.length > 0) {
      this.errors.push(...result.errors.map((e) => `[nested] ${e}`));
    }

    return result.returnValue;
  }
}

// ── File I/O helpers ──────────────────────────────────────────

export async function loadScriptFromFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, 'utf-8');
}

export async function saveRunResult(
  runId: string,
  result: ScriptResult,
  agentResults: CachedAgentResult[]
): Promise<void> {
  await fs.mkdir(RUNS_DIR, { recursive: true });

  const runData = {
    runId,
    timestamp: new Date().toISOString(),
    result: {
      meta: result.meta,
      returnValue: result.returnValue,
      logs: result.logs,
      errors: result.errors,
      agentsSpawned: result.agentsSpawned,
      tokensSpent: result.tokensSpent,
      duration: result.duration,
    },
    agentResults,
  };

  await fs.writeFile(
    path.join(RUNS_DIR, `${runId}.json`),
    JSON.stringify(runData, null, 2),
    'utf-8'
  );
}

export async function loadRunResult(
  runId: string
): Promise<{ result: ScriptResult; agentResults: CachedAgentResult[] } | null> {
  try {
    const filePath = path.join(RUNS_DIR, `${runId}.json`);
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
