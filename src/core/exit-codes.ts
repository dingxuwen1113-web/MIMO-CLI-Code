// ── Exit Code Constants ──────────────────────────────────
// Standard exit codes for CI/CD pipelines

/** Success: agent completed without errors */
export const EXIT_SUCCESS = 0;

/** Error: agent encountered an unrecoverable error */
export const EXIT_ERROR = 1;

/** Partial: agent completed but some tool calls failed */
export const EXIT_PARTIAL = 2;

/** Timeout: agent exceeded the time limit */
export const EXIT_TIMEOUT = 3;

/** Auth error: API key missing or invalid */
export const EXIT_AUTH_ERROR = 4;
