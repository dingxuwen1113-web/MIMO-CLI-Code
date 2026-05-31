/**
 * SDK types for programmatic MIMO CLI embedding.
 */

/** Configuration options for MimoSDK. */
export interface SDKConfig {
  /** Anthropic API key (overrides config file and env var). */
  apiKey?: string;
  /** API base URL (overrides config file and env var). */
  baseUrl?: string;
  /** Model to use (e.g. 'mimo-v2.5-pro', 'mimo-v2.5', 'auto'). */
  model?: string;
  /** Agent mode. Determines tool permission level. */
  mode?: 'plan' | 'agent' | 'custom' | 'yolo';
  /** Maximum LLM turns per run() or chat() call. */
  maxTurns?: number;
  /** Enable streaming responses. Default: true. */
  stream?: boolean;
  /** Enable extended thinking. Default: false. */
  thinking?: boolean;
  /** Working directory for file operations and config lookup. Default: process.cwd(). */
  cwd?: string;
  /** Timeout in milliseconds for a single run() or chat() call. 0 = no timeout. Default: 0. */
  timeout?: number;
}

/** Result returned by run() — the full output of a single SDK invocation. */
export interface SDKResult {
  /** Concatenated assistant text output. */
  response: string;
  /** Exit code (0 = success, 1 = error). */
  exitCode: number;
  /** Token usage breakdown. */
  tokens: {
    input: number;
    output: number;
  };
  /** File paths that were modified by tool calls during execution. */
  files: string[];
  /** Number of LLM turns executed. */
  turns: number;
  /** Wall-clock duration in milliseconds. */
  duration: number;
}

/** A single message in a conversation history. */
export interface SDKMessage {
  /** Message role. */
  role: 'user' | 'assistant' | 'tool';
  /** Text content of the message. */
  content: string;
  /** Tool name (present when role is 'tool'). */
  toolName?: string;
  /** Tool input parameters (present when role is 'tool'). */
  toolInput?: Record<string, unknown>;
  /** Raw tool output string (present when role is 'tool'). */
  toolOutput?: string;
  /** Whether this message represents an error. */
  isError?: boolean;
}

/** An event emitted during streaming execution. */
export interface SDKStreamEvent {
  /** Event type. */
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'done';
  /** Event payload — shape depends on type:
   *  - text: string (a chunk of assistant text)
   *  - tool_call: { id, name, input }
   *  - tool_result: { id, name, output, isError }
   *  - error: { message }
   *  - done: SDKResult
   */
  data: any;
}
