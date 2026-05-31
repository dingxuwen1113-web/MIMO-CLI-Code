// ── Non-Interactive Runner ──────────────────────────────
// Runs the MIMO agent without any TTY interaction, suitable for CI/CD pipelines.

import { MimoConfig } from '../config/schema';
import { ApiAdapter } from '../api/auth';
import { MemoryStore } from '../memory/store';
import { MemoryExtractor } from '../memory/extractor';
import { ToolRegistry } from '../tools/registry';
import { SkillRegistry } from '../skills/registry';
import { ModelRouter } from './router';
import { Charter } from './charter';
import { DynamicAgentLoader } from '../dynamic-agents/loader';
import { SlashCommandLoader } from '../slash-commands/loader';
import { HookManager } from '../hooks/manager';
import { MCPClient } from '../mcp/client';
import { MimoAgent } from './agent';
import { EXIT_SUCCESS, EXIT_ERROR, EXIT_PARTIAL, EXIT_TIMEOUT } from './exit-codes';

export interface NonInteractiveOptions {
  /** Output format: 'text' for plain text, 'json' for structured JSON */
  format: 'text' | 'json';
  /** Timeout in seconds (default: 300) */
  timeout: number;
  /** Suppress all non-essential output */
  quiet: boolean;
}

export interface NonInteractiveResult {
  /** The final assistant response text */
  response: string;
  /** Process exit code */
  exitCode: number;
  /** Token usage */
  tokens: {
    input: number;
    output: number;
  };
  /** Files that were modified during execution */
  files: string[];
  /** Error messages encountered */
  errors: string[];
}

export interface NonInteractiveDeps {
  config: MimoConfig;
  apiClient: ApiAdapter;
  memory: MemoryStore;
  extractor: MemoryExtractor;
  tools: ToolRegistry;
  router: ModelRouter;
  charter: Charter;
  skills: SkillRegistry;
  dynamicAgents?: DynamicAgentLoader;
  slashCommands?: SlashCommandLoader;
  hooks?: HookManager;
  mcpClient?: MCPClient;
}

export class NonInteractiveRunner {
  private deps: NonInteractiveDeps;
  private options: NonInteractiveOptions;
  private timeoutTimer: NodeJS.Timeout | null = null;
  private timedOut = false;

  constructor(deps: NonInteractiveDeps, options: NonInteractiveOptions) {
    this.deps = deps;
    this.options = options;
  }

  async run(prompt: string): Promise<NonInteractiveResult> {
    // Force yolo mode for non-interactive execution
    this.deps.config.agent.mode = 'yolo';
    // Disable streaming to get complete responses
    this.deps.config.api.stream = false;

    // Create the agent
    const agent = new MimoAgent(this.deps);

    // Set up timeout
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      this.timeoutTimer = setTimeout(() => {
        this.timedOut = true;
        reject(new Error('TIMEOUT'));
      }, this.options.timeout * 1000);
    });

    // Set up SIGTERM handler for graceful shutdown
    const sigtermHandler = () => {
      this.cleanup();
      process.exit(EXIT_ERROR);
    };
    process.on('SIGTERM', sigtermHandler);
    process.on('SIGINT', sigtermHandler);

    try {
      // Race between execution and timeout
      const result = await Promise.race([
        this.executeAgent(agent, prompt),
        timeoutPromise,
      ]);

      return result;
    } catch (err: any) {
      if (this.timedOut || err.message === 'TIMEOUT') {
        return {
          response: '',
          exitCode: EXIT_TIMEOUT,
          tokens: { input: 0, output: 0 },
          files: [],
          errors: ['Execution timed out'],
        };
      }

      return {
        response: '',
        exitCode: EXIT_ERROR,
        tokens: { input: 0, output: 0 },
        files: [],
        errors: [err.message || String(err)],
      };
    } finally {
      this.cleanup();
      process.off('SIGTERM', sigtermHandler);
      process.off('SIGINT', sigtermHandler);
    }
  }

  private async executeAgent(agent: MimoAgent, prompt: string): Promise<NonInteractiveResult> {
    // Use the agent's non-interactive method which returns structured data
    const result = await agent.runNonInteractive(prompt, {
      quiet: this.options.quiet,
    });

    // Determine exit code
    let exitCode = EXIT_SUCCESS;
    if (result.errors.length > 0 && result.response) {
      exitCode = EXIT_PARTIAL;
    } else if (result.errors.length > 0) {
      exitCode = EXIT_ERROR;
    }

    return {
      response: result.response,
      exitCode,
      tokens: result.tokens,
      files: result.files,
      errors: result.errors,
    };
  }

  private cleanup(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }
}
