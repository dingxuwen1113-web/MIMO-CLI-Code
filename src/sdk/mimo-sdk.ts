import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SDKConfig, SDKResult, SDKMessage, SDKStreamEvent } from './types';
import { MimoSDKError, MimoAuthError, MimoTimeoutError, MimoModelError } from './errors';
import { MimoConfig, DEFAULT_CONFIG, AgentMode, ModelId } from '../config/schema';
import { loadConfig } from '../config/loader';
import { createApiClient, ApiAdapter } from '../api/auth';
import { ToolRegistry } from '../tools/registry';
import { Charter } from '../core/charter';

/** Default locations for MIMO project rules files (lowest to highest priority). */
const RULE_FILE_PATHS = (cwd: string) => [
  path.join(os.homedir(), '.mimo', 'rules.md'),
  path.join(cwd, 'CLAUDE.md'),
  path.join(cwd, 'MIMO.md'),
  path.join(cwd, '.mimo', 'rules.md'),
  path.join(cwd, '.claude', 'CLAUDE.md'),
];

/**
 * MimoSDK — programmatic, headless interface to MIMO CLI.
 *
 * Works without a TTY. No console output by default.
 * All tool calls are auto-approved (equivalent to yolo mode).
 *
 * @example
 * ```typescript
 * import { MimoSDK } from 'mimo-cli-code/sdk';
 *
 * const sdk = new MimoSDK({ model: 'mimo-v2.5-pro' });
 * const result = await sdk.run('Create a hello-world Express app');
 * console.log(result.response);
 * await sdk.dispose();
 * ```
 */
export class MimoSDK {
  private config: SDKConfig;
  private mimoConfig?: MimoConfig;
  private apiClient?: ApiAdapter;
  private toolRegistry?: ToolRegistry;
  private systemPrompt?: string;
  private conversationHistory: Anthropic.MessageParam[] = [];
  private initialized = false;
  private disposed = false;

  /**
   * Create a new MimoSDK instance.
   *
   * Configuration is resolved in this priority order (highest wins):
   * 1. `config` constructor argument
   * 2. Environment variables (`ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `MIMO_MODEL`, `MIMO_MODE`)
   * 3. `~/.mimo/config.toml` and settings.json files
   * 4. Built-in defaults
   */
  constructor(config?: SDKConfig) {
    this.config = config ?? {};
  }

  // ────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────

  /**
   * Execute a single prompt and return the full result.
   *
   * Runs the agent loop (LLM + tool calls) until the assistant
   * produces a final text response or the turn limit is reached.
   */
  async run(prompt: string): Promise<SDKResult> {
    this.assertNotDisposed();
    await this.ensureInitialized();
    return this.execute(prompt);
  }

  /**
   * Execute a prompt with streaming events.
   *
   * Returns an async iterable of `SDKStreamEvent` objects.
   * The final event is always of type `'done'` with the complete `SDKResult`.
   *
   * @example
   * ```typescript
   * for await (const event of sdk.stream('Explain quicksort')) {
   *   if (event.type === 'text') process.stdout.write(event.data);
   * }
   * ```
   */
  async *stream(prompt: string): AsyncGenerator<SDKStreamEvent> {
    this.assertNotDisposed();
    await this.ensureInitialized();

    const startTime = Date.now();
    const cwd = this.config.cwd ?? process.cwd();
    const maxTurns = this.config.maxTurns ?? this.mimoConfig!.agent.maxTurns;

    this.conversationHistory.push({ role: 'user', content: prompt });

    let turnCount = 0;
    let streamedText = '';
    const modifiedFiles = new Set<string>();
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      while (turnCount < maxTurns) {
        const messages = [...this.conversationHistory];

        let response: Anthropic.Message;

        try {
          response = await this.apiClient!.chat(
            messages,
            this.toolRegistry!.getDefinitions(),
            this.systemPrompt!,
            {
              model: this.mimoConfig!.api.model,
              thinking: this.config.thinking ?? false,
            },
          );
        } catch (err: any) {
          const wrapped = this.wrapApiError(err);
          yield { type: 'error', data: { message: wrapped.message } };
          throw wrapped;
        }

        inputTokens += response.usage?.input_tokens ?? 0;
        outputTokens += response.usage?.output_tokens ?? 0;

        // Extract text content
        let responseText = '';
        const thinkingText = '';
        for (const block of response.content) {
          if (block.type === 'text') {
            responseText += block.text;
            streamedText += block.text;
            yield { type: 'text', data: block.text };
          }
        }

        // No tool calls — agent loop is done
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );

        if (toolUseBlocks.length === 0) {
          this.conversationHistory.push({ role: 'assistant', content: response.content });
          turnCount++;
          break;
        }

        // Has tool calls — add assistant message with tool_use, then process tools
        this.conversationHistory.push({ role: 'assistant', content: response.content });
        streamedText = '';

        const toolResults: Anthropic.ContentBlockParam[] = [];

        for (const toolCall of toolUseBlocks) {
          const toolName = toolCall.name;
          const toolInput = toolCall.input as Record<string, any>;

          yield { type: 'tool_call', data: { id: toolCall.id, name: toolName, input: toolInput } };

          let toolOutput: string;
          let isError = false;
          try {
            const result = await this.toolRegistry!.execute(toolName, toolInput);
            toolOutput = result.output;
            isError = result.isError;
          } catch (err: any) {
            toolOutput = `Error: ${err.message}`;
            isError = true;
          }

          if (['file_write', 'file_edit'].includes(toolName) && !isError && toolInput.path) {
            modifiedFiles.add(path.resolve(cwd, toolInput.path));
          }

          yield {
            type: 'tool_result',
            data: { id: toolCall.id, name: toolName, output: toolOutput, isError },
          };

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: toolOutput,
            is_error: isError,
          });
        }

        this.conversationHistory.push({ role: 'user', content: toolResults });
        turnCount++;
      }
    } catch (err) {
      if (err instanceof MimoSDKError) throw err;
      throw new MimoSDKError(
        `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
        'MIMO_UNEXPECTED_ERROR',
        err instanceof Error ? err : undefined,
      );
    }

    const result: SDKResult = {
      response: streamedText,
      exitCode: 0,
      tokens: { input: inputTokens, output: outputTokens },
      files: Array.from(modifiedFiles),
      turns: turnCount,
      duration: Date.now() - startTime,
    };

    yield { type: 'done', data: result };
  }

  /**
   * Multi-turn chat — send a message and get the assistant reply.
   *
   * Conversation history is accumulated internally. Use `getHistory()`
   * to inspect it or `clearHistory()` to reset.
   */
  async chat(message: string): Promise<SDKMessage> {
    this.assertNotDisposed();
    await this.ensureInitialized();

    const result = await this.execute(message);

    return {
      role: 'assistant',
      content: result.response,
    };
  }

  /**
   * Get the full conversation history (user + assistant messages).
   *
   * Tool call/result messages are flattened into 'tool' role messages.
   */
  getHistory(): SDKMessage[] {
    const history: SDKMessage[] = [];

    for (const msg of this.conversationHistory) {
      if (typeof msg.content === 'string') {
        history.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
        });
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            history.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: (block as any).text });
          } else if (block.type === 'tool_use') {
            history.push({
              role: 'assistant',
              content: '',
              toolName: (block as any).name,
              toolInput: (block as any).input,
            });
          } else if (block.type === 'tool_result') {
            history.push({
              role: 'tool',
              content: '',
              toolName: undefined,
              toolOutput: typeof (block as any).content === 'string'
                ? (block as any).content
                : JSON.stringify((block as any).content),
              isError: (block as any).is_error,
            });
          }
        }
      }
    }

    return history;
  }

  /** Clear conversation history, freeing memory. */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /** Change the model at runtime. Takes effect on next run/chat/stream call. */
  setModel(model: string): void {
    this.config.model = model;
    if (this.mimoConfig) {
      this.mimoConfig.api.model = model as ModelId;
    }
  }

  /** Change the agent mode at runtime. */
  setMode(mode: 'plan' | 'agent' | 'custom' | 'yolo'): void {
    this.config.mode = mode;
    if (this.mimoConfig) {
      this.mimoConfig.agent.mode = mode as AgentMode;
    }
  }

  /** Release all resources. Always call this when finished. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.conversationHistory = [];
    this.mimoConfig = undefined;
    this.apiClient = undefined;
    this.toolRegistry = undefined;
    this.systemPrompt = undefined;
    this.initialized = false;
  }

  // ────────────────────────────────────────────────────────────
  // Private internals
  // ────────────────────────────────────────────────────────────

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new MimoSDKError('SDK instance has been disposed.', 'MIMO_DISPOSED');
    }
  }

  /**
   * Lazy initialization — loads config, creates API client and tool registry.
   * Runs once per SDK instance; subsequent calls are no-ops.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const cwd = this.config.cwd ?? process.cwd();
    const originalCwd = process.cwd();

    try {
      // Temporarily set cwd for loadConfig to pick up the right project directory
      if (cwd !== originalCwd) {
        process.chdir(cwd);
      }

      // 1. Load base config from ~/.mimo/config.toml + settings.json + env vars
      let baseConfig: MimoConfig;
      try {
        baseConfig = await loadConfig({});
      } catch {
        baseConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      }

      // Restore cwd
      if (cwd !== originalCwd) {
        process.chdir(originalCwd);
      }

      // 2. Apply SDK overrides on top of base config
      const apiKey = this.config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
      const baseUrl = this.config.baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? '';
      const model = this.config.model ?? process.env.MIMO_MODEL ?? baseConfig.api.model;
      const mode = this.config.mode ?? (process.env.MIMO_MODE as AgentMode) ?? baseConfig.agent.mode;

      if (apiKey) {
        baseConfig.api.tokenPlan.apiKey = apiKey;
        baseConfig.api.payAsYouGo.apiKey = apiKey;
      }
      if (baseUrl) {
        baseConfig.api.tokenPlan.baseUrl = baseUrl;
        baseConfig.api.payAsYouGo.baseUrl = baseUrl;
      }
      baseConfig.api.model = model as ModelId;
      baseConfig.agent.mode = mode as AgentMode;
      baseConfig.api.stream = false; // SDK manages its own stream logic

      if (this.config.maxTurns !== undefined) {
        baseConfig.agent.maxTurns = this.config.maxTurns;
      }

      this.mimoConfig = baseConfig;

      // 3. Validate API key
      const effectiveKey = baseConfig.api.tokenPlan.apiKey || baseConfig.api.payAsYouGo.apiKey;
      if (!effectiveKey) {
        throw new MimoAuthError();
      }

      // 4. Create API client
      this.apiClient = createApiClient(baseConfig);

      // 5. Create tool registry (auto-approve all tools for headless operation)
      this.toolRegistry = new ToolRegistry(baseConfig.agent.mode);

      // 6. Build system prompt
      this.systemPrompt = await this.buildSystemPrompt(cwd);

      this.initialized = true;
    } catch (err) {
      // Restore cwd if we changed it
      try { process.chdir(originalCwd); } catch { /* ignore */ }

      if (err instanceof MimoSDKError) throw err;
      throw new MimoSDKError(
        `SDK initialization failed: ${err instanceof Error ? err.message : String(err)}`,
        'MIMO_INIT_ERROR',
        err instanceof Error ? err : undefined,
      );
    }
  }

  /**
   * Build the system prompt from the Charter and project rules files.
   */
  private async buildSystemPrompt(cwd: string): Promise<string> {
    const charter = new Charter();
    const charterContent = charter.getContent();
    const parts: string[] = [
      charterContent ?? 'You are MIMO, a helpful AI coding assistant.',
    ];

    const rules: string[] = [];
    for (const filePath of RULE_FILE_PATHS(cwd)) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        if (content.trim()) {
          rules.push(content.trim());
        }
      } catch {
        // File doesn't exist — skip
      }
    }

    if (rules.length > 0) {
      parts.push(rules.join('\n\n'));
    }

    return parts.join('\n\n');
  }

  /**
   * Core agent loop — executes a single prompt through the LLM,
   * processing any tool calls, until a final text response is produced.
   */
  private async execute(prompt: string): Promise<SDKResult> {
    const startTime = Date.now();
    const cwd = this.config.cwd ?? process.cwd();
    const maxTurns = this.config.maxTurns ?? this.mimoConfig!.agent.maxTurns;
    const timeout = this.config.timeout ?? 0;

    this.conversationHistory.push({ role: 'user', content: prompt });

    let turnCount = 0;
    let finalResponse = '';
    const modifiedFiles = new Set<string>();
    let inputTokens = 0;
    let outputTokens = 0;

    // Build execution promise
    const execPromise = this.runAgentLoop(
      maxTurns,
      cwd,
      (text) => { finalResponse = text; },
      (filePath) => modifiedFiles.add(filePath),
      (inp, out) => { inputTokens += inp; outputTokens += out; },
      () => turnCount++,
    );

    // Apply timeout if configured
    if (timeout > 0) {
      await Promise.race([
        execPromise,
        new Promise<never>((_, reject) => {
          const timer = setTimeout(() => reject(new MimoTimeoutError(timeout)), timeout);
          // Allow the timer to not keep the process alive
          if (typeof timer === 'object' && 'unref' in timer) timer.unref();
        }),
      ]);
    } else {
      await execPromise;
    }

    return {
      response: finalResponse,
      exitCode: 0,
      tokens: { input: inputTokens, output: outputTokens },
      files: Array.from(modifiedFiles),
      turns: turnCount,
      duration: Date.now() - startTime,
    };
  }

  /**
   * The inner agent loop — shared by execute() and stream().
   * Sends messages to the API, processes tool calls, and repeats.
   */
  private async runAgentLoop(
    maxTurns: number,
    cwd: string,
    onResponse: (text: string) => void,
    onFileModified: (filePath: string) => void,
    onTokens: (input: number, output: number) => void,
    onTurnComplete: () => void,
  ): Promise<void> {
    let turn = 0;

    while (turn < maxTurns) {
      const messages = [...this.conversationHistory];

      let response: Anthropic.Message;
      try {
        response = await this.apiClient!.chat(
          messages,
          this.toolRegistry!.getDefinitions(),
          this.systemPrompt!,
          {
            model: this.mimoConfig!.api.model,
            thinking: this.config.thinking ?? false,
          },
        );
      } catch (err: any) {
        throw this.wrapApiError(err);
      }

      onTokens(response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0);

      // Extract text and thinking blocks
      let responseText = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          responseText += block.text;
        }
      }
      onResponse(responseText);

      // Check for tool calls
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      if (toolUseBlocks.length === 0) {
        // No tool calls — agent loop is finished
        this.conversationHistory.push({ role: 'assistant', content: response.content });
        onTurnComplete();
        break;
      }

      // Has tool calls — add assistant message, then execute each tool
      this.conversationHistory.push({ role: 'assistant', content: response.content });
      onResponse(''); // Reset response text for next turn
      onTurnComplete();

      const toolResults: Anthropic.ContentBlockParam[] = [];

      for (const toolCall of toolUseBlocks) {
        const toolName = toolCall.name;
        const toolInput = toolCall.input as Record<string, any>;

        let toolOutput: string;
        let isError = false;
        try {
          const result = await this.toolRegistry!.execute(toolName, toolInput);
          toolOutput = result.output;
          isError = result.isError;
        } catch (err: any) {
          toolOutput = `Error: ${err.message}`;
          isError = true;
        }

        if (['file_write', 'file_edit'].includes(toolName) && !isError && toolInput.path) {
          onFileModified(path.resolve(cwd, toolInput.path));
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: toolOutput,
          is_error: isError,
        });
      }

      // Add tool results as a user message
      this.conversationHistory.push({ role: 'user', content: toolResults });
      turn++;
    }
  }

  /**
   * Wrap raw API errors into typed SDK errors.
   */
  private wrapApiError(err: any): MimoSDKError {
    const msg: string = err.message ?? String(err);

    if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('invalid x-api-key')) {
      return new MimoAuthError('API key is invalid or expired.');
    }

    if (msg.includes('429') || msg.includes('rate_limit') || msg.includes('rate limit')) {
      return new MimoModelError('Rate limit exceeded. Retry after a short delay.', 429, err);
    }

    if (msg.includes('529') || msg.includes('overloaded')) {
      return new MimoModelError('API is overloaded. Retry after a short delay.', 529, err);
    }

    if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) {
      return new MimoModelError('Cannot connect to API. Check baseUrl and network.', undefined, err);
    }

    if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
      return new MimoModelError('API request timed out.', undefined, err);
    }

    if (msg.includes('403') || msg.includes('Forbidden')) {
      return new MimoModelError('API access forbidden. Check API key permissions.', 403, err);
    }

    if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
      return new MimoModelError('API service temporarily unavailable.', undefined, err);
    }

    return new MimoModelError(msg, undefined, err);
  }
}
