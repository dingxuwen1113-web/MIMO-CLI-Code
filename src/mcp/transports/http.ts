// ── MCP HTTP + SSE Transport ────────────────────────────────────

export interface HTTPTransportConfig {
  port: number;
  host?: string;
  cors?: boolean;
  authToken?: string;
}

export class MCPHTTPTransport {
  private config: HTTPTransportConfig;
  private sessions = new Map<string, { res: unknown; queue: string[] }>();
  private messageHandler: ((msg: Record<string, unknown>) => Promise<Record<string, unknown>>) | null = null;
  private server: unknown = null;

  constructor(config: HTTPTransportConfig) {
    this.config = { host: '127.0.0.1', cors: true, ...config };
  }

  onMessage(handler: (msg: Record<string, unknown>) => Promise<Record<string, unknown>>): void {
    this.messageHandler = handler;
  }

  async start(): Promise<void> {
    const express = require('express');
    const app = express();
    app.use(express.json({ limit: '10mb' }));

    if (this.config.cors) {
      app.use((_req: unknown, res: any, next: Function) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        next();
      });
    }

    if (this.config.authToken) {
      app.use((req: any, _res: any, next: Function) => {
        const auth = req.headers.authorization;
        if (auth !== `Bearer ${this.config.authToken}`) return _res.status(401).json({ error: 'Unauthorized' });
        next();
      });
    }

    // SSE endpoint for server-initiated messages
    app.get('/mcp', (req: any, res: any) => {
      const sessionId = req.query.sessionId as string || Math.random().toString(36).slice(2);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);
      this.sessions.set(sessionId, { res, queue: [] });
      req.on('close', () => this.sessions.delete(sessionId));
    });

    // JSON-RPC endpoint
    app.post('/mcp', async (req: any, res: any) => {
      if (!this.messageHandler) return res.status(503).json({ error: 'Server not ready' });
      try {
        const result = await this.messageHandler(req.body);
        res.json(result);
      } catch (err) {
        res.status(500).json({ jsonrpc: '2.0', id: req.body?.id, error: { code: -32603, message: String(err) } });
      }
    });

    // Health check
    app.get('/health', (_req: unknown, res: any) => res.json({ status: 'ok', sessions: this.sessions.size }));

    this.server = app.listen(this.config.port, this.config.host, () => {
      process.stderr?.write?.(`MCP HTTP transport listening on ${this.config.host}:${this.config.port}\n`);
    });
  }

  sendToSession(sessionId: string, message: unknown): void {
    const session = this.sessions.get(sessionId);
    if (session) { (session.res as any).write(`data: ${JSON.stringify(message)}\n\n`); }
  }

  broadcast(message: unknown): void {
    const data = `data: ${JSON.stringify(message)}\n\n`;
    for (const [, session] of this.sessions) { (session.res as any).write(data); }
  }

  async stop(): Promise<void> {
    for (const [id, session] of this.sessions) { (session.res as any).end(); this.sessions.delete(id); }
    if (this.server) (this.server as any).close();
  }

  getActiveSessions(): string[] { return [...this.sessions.keys()]; }
}
