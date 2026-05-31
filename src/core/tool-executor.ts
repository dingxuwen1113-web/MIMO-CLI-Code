import * as path from 'path';
import createDebug from 'debug';
import { AgentState } from './types';
import { checkToolSafety } from '../security/checks';
import { animateToolCall } from '../tui/animations';
import { printWarning, printError } from '../tui/output';
import Anthropic from '@anthropic-ai/sdk';

const debug = createDebug('mimo:tool-executor');

export interface ToolExecutionResult {
  toolResults: Anthropic.ContentBlockParam[];
  modifiedFiles: Set<string>;
  errorCount: number;
}

/**
 * Handles the execution of tool calls with safety checks,
 * permission verification, hooks, checkpointing, and audit logging.
 */
export class ToolExecutor {
  private state: AgentState;

  constructor(state: AgentState) {
    this.state = state;
  }

  /**
   * Execute a batch of tool use blocks from the AI response.
   */
  async executeBatch(
    toolUseBlocks: Anthropic.ToolUseBlock[],
  ): Promise<ToolExecutionResult> {
    const toolResults: Anthropic.ContentBlockParam[] = [];
    const modifiedFiles = new Set<string>();
    let errorCount = 0;

    for (const toolCall of toolUseBlocks) {
      const toolName = toolCall.name;
      const toolInput = toolCall.input as Record<string, any>;

      try {
        const result = await this.executeSingle(toolName, toolInput, toolCall.id);
        toolResults.push(...result.toolResults);
        for (const f of result.modifiedFiles) modifiedFiles.add(f);
        errorCount += result.errorCount;
      } catch (err: any) {
        debug('Tool execution error for %s: %s', toolName, err.message);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: `Error: ${err.message}`,
          is_error: true,
        });
        errorCount++;
      }
    }

    return { toolResults, modifiedFiles, errorCount };
  }

  /**
   * Execute a single tool call with full safety pipeline.
   */
  private async executeSingle(
    toolName: string,
    toolInput: Record<string, any>,
    toolUseId: string,
  ): Promise<ToolExecutionResult> {
    const toolResults: Anthropic.ContentBlockParam[] = [];
    const modifiedFiles = new Set<string>();

    // 1. Safety check
    const safetyCheck = await checkToolSafety(toolName, toolInput);
    if (!safetyCheck.safe) {
      for (const msg of safetyCheck.blocked) {
        if (this.state.nonInteractive) {
          this.state.nonInteractiveErrors.push(msg);
        } else {
          printError(msg);
        }
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: safetyCheck.blocked.join('\n'),
        is_error: true,
      });
      return { toolResults, modifiedFiles, errorCount: 1 };
    }
    for (const msg of safetyCheck.warnings) {
      if (!this.state.nonInteractive) printWarning(msg);
    }

    // 2. Pre-tool hook
    if (this.state.hooks) {
      const hookResult = await this.state.hooks.execute('pre_tool', {
        toolName, toolInput, sessionId: this.state.sessionId, projectDir: process.cwd(),
      });
      if (!hookResult.allowed) {
        const msg = `Hook rejected: ${hookResult.message}`;
        if (this.state.nonInteractive) this.state.nonInteractiveErrors.push(msg);
        else printWarning(msg);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: msg,
          is_error: true,
        });
        return { toolResults, modifiedFiles, errorCount: 0 };
      }
      if (hookResult.modifiedInput) Object.assign(toolInput, hookResult.modifiedInput);
    }

    // 3. Permission check
    const permission = this.state.yoloMode ? 'auto' : this.state.tools.checkPermission(toolName, toolInput);
    if (permission === 'denied') {
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: `Denied: ${toolName} not allowed in current mode`,
        is_error: true,
      });
      return { toolResults, modifiedFiles, errorCount: 0 };
    }

    // 4. Checkpoint before file modifications
    if (['file_write', 'file_edit'].includes(toolName) && toolInput.path) {
      await this.state.checkpoint.snapshot(toolInput.path, `${toolName}: ${path.basename(toolInput.path)}`);
      await this.state.enhancedSandbox.takeSnapshot(`${toolName}: ${path.basename(toolInput.path)}`);
    }

    // 5. Execute the tool
    let result: { output: string; isError: boolean };
    const toolStartTime = Date.now();

    if (this.state.nonInteractive) {
      result = await this.state.tools.execute(toolName, toolInput);
    } else {
      const toolAnim = animateToolCall(toolName, this.formatToolDesc(toolName, toolInput));
      result = await this.state.tools.execute(toolName, toolInput);
      toolAnim.done(!result.isError);
    }

    const toolDuration = Date.now() - toolStartTime;

    // 6. Audit log
    this.state.auditLogger.logToolCall(toolName, toolInput, result.output, result.isError, toolDuration);

    // 7. Post-tool hook
    if (this.state.hooks) {
      await this.state.hooks.execute('post_tool', {
        toolName, toolInput, toolOutput: result.output,
        isError: result.isError, sessionId: this.state.sessionId,
      });
    }

    // 8. Track file modifications
    if (['file_write', 'file_edit'].includes(toolName) && !result.isError) {
      modifiedFiles.add(toolInput.path);

      // LSP auto-diagnostics
      if (this.state.diagnosticsManager.isEnabled() && this.state.diagnosticsManager.isAutoRunEnabled()) {
        try {
          const diagResult = await this.state.diagnosticsManager.diagnoseFile(toolInput.path);
          if (diagResult.diagnostics.length > 0) {
            const errors = diagResult.diagnostics.filter((d: any) => d.severity === 'error');
            if (errors.length > 0) {
              const formatted = this.state.diagnosticsManager.formatDiagnostics(diagResult);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUseId,
                content: `${result.output}\n\n[LSP Auto-Diagnostics]\n${formatted}\n\nPlease fix these errors.`,
                is_error: false,
              });
              return { toolResults, modifiedFiles, errorCount: 0 };
            }
          }
        } catch { /* LSP errors are non-fatal */ }
      }
    }

    toolResults.push({
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: result.output,
      is_error: result.isError,
    });

    return { toolResults, modifiedFiles, errorCount: result.isError ? 1 : 0 };
  }

  private formatToolDesc(toolName: string, input: Record<string, any>): string {
    switch (toolName) {
      case 'file_read': return input.path || '';
      case 'file_write': return `${input.path} · ${(input.content || '').split('\n').length} lines`;
      case 'file_edit': return input.path || '';
      case 'shell_exec': return (input.command || '').slice(0, 50);
      case 'grep_search': return `"${input.pattern}" → ${input.path || '.'}`;
      case 'glob_match': return input.pattern || '';
      case 'web_search': return `"${input.query}"`;
      case 'git_commit': return (input.message || '').slice(0, 40);
      case 'git_status': return '';
      case 'git_diff': return input.target || '';
      default:
        if (toolName.startsWith('mcp__')) return toolName.split('__').slice(1).join('__');
        return '';
    }
  }
}
