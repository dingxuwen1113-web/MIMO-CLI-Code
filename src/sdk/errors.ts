/**
 * Typed error classes for MimoSDK.
 *
 * All SDK errors extend MimoSDKError so callers can catch
 * the base class or use `instanceof` for specific error types.
 */

/** Base class for all MIMO SDK errors. */
export class MimoSDKError extends Error {
  public readonly code: string;
  public readonly cause?: Error;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.name = 'MimoSDKError';
    this.code = code;
    this.cause = cause;
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when no API key is found in config, environment, or SDK options. */
export class MimoAuthError extends MimoSDKError {
  constructor(
    message = 'No API key found. Pass apiKey in SDKConfig, set ANTHROPIC_API_KEY env var, or run "mimo init".',
  ) {
    super(message, 'MIMO_AUTH_ERROR');
    this.name = 'MimoAuthError';
  }
}

/** Thrown when a run() or chat() call exceeds the configured timeout. */
export class MimoTimeoutError extends MimoSDKError {
  public readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(
      `SDK execution timed out after ${timeoutMs}ms. Increase SDKConfig.timeout or set it to 0 to disable.`,
      'MIMO_TIMEOUT_ERROR',
    );
    this.name = 'MimoTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/** Thrown when the Anthropic API returns an error (rate limit, overload, invalid request, etc.). */
export class MimoModelError extends MimoSDKError {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number, cause?: Error) {
    super(message, 'MIMO_MODEL_ERROR', cause);
    this.name = 'MimoModelError';
    this.statusCode = statusCode;
  }
}

/** Thrown when a tool execution fails during the agent loop. */
export class MimoToolError extends MimoSDKError {
  public readonly toolName: string;
  public readonly toolInput?: Record<string, unknown>;

  constructor(
    toolName: string,
    message: string,
    toolInput?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(`Tool "${toolName}" failed: ${message}`, 'MIMO_TOOL_ERROR', cause);
    this.name = 'MimoToolError';
    this.toolName = toolName;
    this.toolInput = toolInput;
  }
}
