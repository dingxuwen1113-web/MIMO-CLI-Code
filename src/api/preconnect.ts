// ── API Preconnect (modeled after Claude Code) ──────────────
// Fires a HEAD request to warm the TCP+TLS connection at startup.
// The real API request reuses the warmed connection.

import createDebug from 'debug';

const debug = createDebug('mimo:preconnect');

let fired = false;

export function preconnectApi(baseUrl: string): void {
  if (fired) return;
  fired = true;

  if (!baseUrl) return;

  const url = baseUrl.replace(/\/+$/, '');
  debug('preconnect to %s', url);

  void fetch(url, {
    method: 'HEAD',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {
    // Silently swallow — preconnect is fire-and-forget
  });
}
