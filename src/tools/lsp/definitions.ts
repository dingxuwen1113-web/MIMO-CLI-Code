// ── LSP Diagnostics Tool Definitions ────────────────────────────────────────

import { ToolDefinition, ToolResult } from '../registry';
import { DiagnosticsManager } from './diagnostics';

// Global instance (initialized by agent)
let diagnosticsManager: DiagnosticsManager | null = null;

export function setDiagnosticsManager(manager: DiagnosticsManager): void {
  diagnosticsManager = manager;
}

export function getDiagnosticsManager(): DiagnosticsManager | null {
  return diagnosticsManager;
}

export const lspDiagnosticsTool: ToolDefinition = {
  name: 'lsp_diagnostics',
  description: 'Run LSP diagnostics on a file or project. Checks for type errors, warnings, and code issues using language servers (TypeScript, Python, Rust, Go, C/C++, Java, Vue). Run after file edits to catch errors early.',
  input_schema: {
    type: 'object' as const,
    properties: {
      target: {
        type: 'string',
        description: 'File path to diagnose, or "project" for full project diagnostics',
      },
      language: {
        type: 'string',
        description: 'Force a specific language (typescript, python, rust, go, c, java, vue). Auto-detected from file extension if not specified.',
      },
    },
    required: ['target'],
  },
  permission: 'auto', // Read-only operation
};

export async function executeLSPDiagnostics(input: Record<string, any>): Promise<ToolResult> {
  if (!diagnosticsManager) {
    return { output: 'LSP Diagnostics not initialized', isError: true };
  }

  const target = input.target;

  try {
    if (target === 'project') {
      const results = await diagnosticsManager.diagnoseProject();
      const formatted = diagnosticsManager.formatAllDiagnostics(results);
      return { output: formatted || 'No diagnostics available for project', isError: false };
    }

    const result = await diagnosticsManager.diagnoseFile(target);
    const formatted = diagnosticsManager.formatDiagnostics(result);
    return { output: formatted, isError: false };
  } catch (err: any) {
    return { output: `LSP diagnostics error: ${err.message}`, isError: true };
  }
}
