// ── RLM Tool Definitions ────────────────────────────────────────────────────

import { ToolDefinition, ToolResult } from '../tools/registry';
import { RLMManager } from './manager';

// Global instance (initialized by agent)
let rlmManager: RLMManager | null = null;

export function setRLMManager(manager: RLMManager): void {
  rlmManager = manager;
}

export function getRLMManager(): RLMManager | null {
  return rlmManager;
}

export const rlmOpenTool: ToolDefinition = {
  name: 'rlm_open',
  description: 'Open a new RLM (Recursive Language Model) session — a sandboxed Python REPL for data analysis, code analysis, and batch processing. Use rlm_eval to run code, rlm_close to end session.',
  input_schema: {
    type: 'object' as const,
    properties: {
      description: { type: 'string', description: 'Purpose of this RLM session' },
      cwd: { type: 'string', description: 'Working directory for the session' },
    },
  },
  permission: 'auto',
};

export const rlmEvalTool: ToolDefinition = {
  name: 'rlm_eval',
  description: 'Execute Python code in an RLM session. Built-in capabilities: rlm.peek(file), rlm.search(pattern), rlm.chunk(file, start, end), rlm.sub_query_batch(queries), rlm.analyze_code(file). Standard Python libraries available.',
  input_schema: {
    type: 'object' as const,
    properties: {
      session_id: { type: 'string', description: 'RLM session ID from rlm_open' },
      code: { type: 'string', description: 'Python code to execute' },
    },
    required: ['session_id', 'code'],
  },
  permission: 'auto',
};

export const rlmCloseTool: ToolDefinition = {
  name: 'rlm_close',
  description: 'Close an RLM session and free resources.',
  input_schema: {
    type: 'object' as const,
    properties: {
      session_id: { type: 'string', description: 'RLM session ID to close' },
    },
    required: ['session_id'],
  },
  permission: 'auto',
};

export const rlmListTool: ToolDefinition = {
  name: 'rlm_list',
  description: 'List all active RLM sessions with their status and execution count.',
  input_schema: {
    type: 'object' as const,
    properties: {},
  },
  permission: 'auto',
};

export async function executeRLMOpen(input: Record<string, any>): Promise<ToolResult> {
  if (!rlmManager) {
    return { output: 'RLM not initialized. Python may not be available.', isError: true };
  }

  try {
    const sessionId = await rlmManager.open(input.description);
    if (input.cwd) {
      await rlmManager.configure(sessionId, { cwd: input.cwd });
    }
    return {
      output: `RLM session opened: ${sessionId}\n${rlmManager.getBuiltinCapabilities()}`,
      isError: false,
    };
  } catch (err: any) {
    return { output: `Failed to open RLM session: ${err.message}`, isError: true };
  }
}

export async function executeRLMEval(input: Record<string, any>): Promise<ToolResult> {
  if (!rlmManager) {
    return { output: 'RLM not initialized', isError: true };
  }

  try {
    const result = await rlmManager.eval(input.session_id, input.code);
    const parts: string[] = [];
    if (result.output) parts.push(result.output);
    if (result.error) parts.push(`ERROR: ${result.error}`);
    parts.push(`[${result.executionTime}ms]`);
    return { output: parts.join('\n'), isError: !!result.error };
  } catch (err: any) {
    return { output: `RLM eval error: ${err.message}`, isError: true };
  }
}

export async function executeRLMClose(input: Record<string, any>): Promise<ToolResult> {
  if (!rlmManager) {
    return { output: 'RLM not initialized', isError: true };
  }

  try {
    await rlmManager.close(input.session_id);
    return { output: `RLM session ${input.session_id} closed`, isError: false };
  } catch (err: any) {
    return { output: `Failed to close RLM session: ${err.message}`, isError: true };
  }
}

export async function executeRLMList(_input: Record<string, any>): Promise<ToolResult> {
  if (!rlmManager) {
    return { output: 'RLM not initialized', isError: true };
  }

  const sessions = rlmManager.list();
  if (sessions.length === 0) {
    return { output: 'No active RLM sessions', isError: false };
  }

  const lines = sessions.map(s =>
    `  ${s.id} | ${s.status} | ${s.executionCount} executions | vars: ${Object.keys(s.variables).length}`
  );
  return { output: `Active RLM Sessions (${sessions.length}):\n${lines.join('\n')}`, isError: false };
}
