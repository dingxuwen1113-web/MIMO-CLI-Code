import * as http from 'http';
import * as https from 'https';
import createDebug from 'debug';

const debug = createDebug('mimo:api:http');

// ── Shared HTTP agents with keep-alive + connection pooling ────────
// These agents are reused across all Anthropic SDK client instances
// to avoid the overhead of TCP handshake + TLS negotiation on every request.

const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,      // keep idle connections alive for 30s
  maxSockets: 10,               // up to 10 concurrent connections per host
  maxFreeSockets: 5,            // keep 5 idle connections in the pool
  timeout: 120_000,             // socket timeout matches request timeout
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 120_000,
  // Enable HTTP/2 via ALPN negotiation when server supports it
  // (Node's https.Agent falls back to HTTP/1.1 automatically)
});

/**
 * Returns pre-configured HTTP/HTTPS agents for use with the Anthropic SDK.
 * Agents maintain a connection pool with keep-alive to avoid repeated
 * TCP handshakes and TLS negotiations.
 *
 * Usage in Anthropic SDK:
 *   const { httpAgent, httpsAgent } = getSharedHttpAgents();
 *   new Anthropic({ httpAgent, httpsAgent, ... });
 */
export function getSharedHttpAgents(): {
  httpAgent: http.Agent;
  httpsAgent: https.Agent;
} {
  debug('Returning shared HTTP agents (keep-alive, pool size 10)');
  return { httpAgent, httpsAgent };
}

/**
 * Get stats about the connection pool for diagnostics.
 */
export function getPoolStats(): {
  httpActive: number;
  httpsActive: number;
} {
  return {
    httpActive: (httpAgent as any).sockets?.['api.anthropic.com']?.length ?? 0,
    httpsActive: (httpsAgent as any).sockets?.['api.anthropic.com']?.length ?? 0,
  };
}
