// ── Web Dashboard Server ────────────────────────────────────────

export interface DashboardConfig {
  port: number;
  host: string;
  staticDir?: string;
  authToken?: string;
  corsOrigin?: string;
}

export interface SystemStatus {
  version: string;
  uptime: number;
  activeSessions: number;
  totalMemories: number;
  activePlugins: string[];
  activeProviders: string[];
  model: string;
  mode: string;
}

export class DashboardServer {
  private config: DashboardConfig;
  private server: unknown = null;
  private wss: unknown = null;
  private deps: Record<string, unknown> = {};
  private startTime = Date.now();

  constructor(config: DashboardConfig, deps: Record<string, unknown> = {}) {
    this.config = { ...config, host: config.host || '127.0.0.1', port: config.port || 9119 };
    this.deps = deps;
  }

  async start(): Promise<void> {
    const express = require('express');
    const app = express();
    app.use(express.json());

    if (this.config.corsOrigin) {
      app.use((_req: unknown, res: any, next: Function) => {
        res.header('Access-Control-Allow-Origin', this.config.corsOrigin);
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        next();
      });
    }

    if (this.config.authToken) {
      app.use((req: any, _res: any, next: Function) => {
        if (req.path === '/health') return next();
        const auth = req.headers.authorization;
        if (auth !== `Bearer ${this.config.authToken}`) return _res.status(401).json({ error: 'Unauthorized' });
        next();
      });
    }

    // Health
    app.get('/health', (_req: unknown, res: any) => res.json({ status: 'ok', uptime: Date.now() - this.startTime }));

    // System status
    app.get('/api/status', (_req: unknown, res: any) => {
      res.json({
        version: '2.0.0', uptime: Date.now() - this.startTime,
        activeSessions: 0, totalMemories: 0, activePlugins: [], activeProviders: [],
        model: 'auto', mode: 'agent',
      } as SystemStatus);
    });

    // Config
    app.get('/api/config', (_req: unknown, res: any) => res.json(this.deps.config || {}));
    app.put('/api/config', (req: any, res: any) => { res.json({ updated: true }); });

    // Sessions
    app.get('/api/sessions', (_req: unknown, res: any) => {
      const sessions = (this.deps.sessionManager as any)?.listSessions?.() || [];
      res.json(sessions);
    });
    app.get('/api/sessions/:id', (req: any, res: any) => {
      const session = (this.deps.sessionManager as any)?.getSession?.(req.params.id);
      session ? res.json(session) : res.status(404).json({ error: 'Not found' });
    });
    app.delete('/api/sessions/:id', (req: any, res: any) => {
      (this.deps.sessionManager as any)?.deleteSession?.(req.params.id);
      res.json({ deleted: true });
    });

    // Chat
    app.post('/api/chat', async (req: any, res: any) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);
      // In production, this would stream from the agent
      res.write(`data: ${JSON.stringify({ type: 'text', content: 'Chat endpoint ready. Connect via WebSocket for live interaction.' })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
      res.end();
    });

    // Models
    app.get('/api/models', (_req: unknown, res: any) => {
      const providers = (this.deps.providerRegistry as any)?.listProviders?.() || [];
      const models = providers.flatMap((p: any) => (p.models || []).map((m: any) => ({ ...m, provider: p.name })));
      res.json(models);
    });

    // Skills
    app.get('/api/skills', (_req: unknown, res: any) => {
      const skills = (this.deps.skillRegistry as any)?.getAll?.() || [];
      res.json(skills);
    });

    // Tools
    app.get('/api/tools', (_req: unknown, res: any) => {
      const tools = (this.deps.toolRegistry as any)?.getDefinitions?.() || [];
      res.json(tools.map((t: any) => ({ name: t.name, description: t.description })));
    });

    // Memory
    app.get('/api/memory', async (_req: unknown, res: any) => {
      const memories = await (this.deps.memoryStore as any)?.list?.() || [];
      res.json(memories);
    });
    app.post('/api/memory', async (req: any, res: any) => {
      const entry = await (this.deps.memoryStore as any)?.save?.(req.body);
      res.json(entry || { error: 'Failed' });
    });

    // Plugins
    app.get('/api/plugins', (_req: unknown, res: any) => {
      const plugins = (this.deps.pluginRegistry as any)?.list?.() || [];
      res.json(plugins);
    });

    // Stats
    app.get('/api/stats', (_req: unknown, res: any) => {
      res.json({ uptime: Date.now() - this.startTime, version: '2.0.0' });
    });

    // Static files
    if (this.config.staticDir) {
      app.use(express.static(this.config.staticDir));
      app.get('*', (_req: unknown, res: any) => res.sendFile('index.html', { root: this.config.staticDir }));
    }

    this.server = app.listen(this.config.port, this.config.host, () => {
      console.log(`MIMO Dashboard running at http://${this.config.host}:${this.config.port}`);
    });
  }

  async stop(): Promise<void> {
    if (this.wss) (this.wss as any).close();
    if (this.server) (this.server as any).close();
  }

  getPort(): number { return this.config.port; }
}
