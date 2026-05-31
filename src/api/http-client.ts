import createDebug from 'debug';

const debug = createDebug('mimo:api:http');

// ── HTTP Agent Configuration ────────────────────────────────────────
// Note: Custom HTTP agents with keep-alive cause connection issues on Windows
// with certain proxies/servers. We return undefined to use SDK defaults.

/**
 * Returns HTTP agents for use with the Anthropic SDK.
 * Returns undefined to use the SDK's built-in agent configuration,
 * which works reliably across all platforms including Windows.
 */
export function getSharedHttpAgents(): {
  httpAgent: undefined;
  httpsAgent: undefined;
} {
  debug('Using SDK default HTTP agents');
  return { httpAgent: undefined, httpsAgent: undefined };
}

/**
 * Get stats about the connection pool for diagnostics.
 */
export function getPoolStats(): {
  httpActive: number;
  httpsActive: number;
} {
  return { httpActive: 0, httpsActive: 0 };
}
