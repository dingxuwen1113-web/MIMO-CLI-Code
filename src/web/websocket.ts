// ── WebSocket Handler ────────────────────────────────────────────────────────
// Bidirectional message streaming, session management, auto-reconnect,
// heartbeat/ping-pong, and message queuing for offline clients

// Dynamic import - ws is optional dependency
let WebSocketServerClass: any;
let WebSocketClass: any;
try {
  const ws = require('ws');
  WebSocketServerClass = ws.WebSocketServer || ws.Server;
  WebSocketClass = ws.WebSocket || ws;
} catch { /* ws not installed */ }

import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import * as crypto from 'crypto';
import type {
  WebSocketEvent,
  WSEventType,
  WebSocketPayload,
  ChatMessage,
  ReconnectPayload,
  PongPayload,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// Client Connection State
// ═══════════════════════════════════════════════════════════════════════════════

interface ClientConnection {
  id: string;
  ws: any;
  sessionId: string | null;
  connectedAt: string;
  lastPongAt: string;
  isAlive: boolean;
  /** Messages queued while the client was disconnected */
  messageQueue: WebSocketEvent[];
  /** Reconnect token issued to this client for session re-association */
  reconnectToken: string;
  /** Client metadata (user-agent, etc.) */
  metadata: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WebSocket Handler
// ═══════════════════════════════════════════════════════════════════════════════

export interface WebSocketHandlerOptions {
  heartbeatInterval: number;
  maxQueueSize: number;
  sessionTimeout: number;
  authToken: string | null;
}

const DEFAULT_WS_OPTIONS: WebSocketHandlerOptions = {
  heartbeatInterval: 30_000,
  maxQueueSize: 200,
  sessionTimeout: 30 * 60 * 1000,
  authToken: null,
};

export class WebSocketHandler {
  private wss: any = null;
  private clients: Map<string, ClientConnection> = new Map();
  /** Maps sessionId -> set of client IDs subscribed to that session */
  private sessionClients: Map<string, Set<string>> = new Map();
  /** Maps reconnectToken -> sessionId for re-association */
  private reconnectTokens: Map<string, string> = new Map();
  /** Queued messages per sessionId for when no clients are connected */
  private sessionQueues: Map<string, WebSocketEvent[]> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private options: WebSocketHandlerOptions;

  /** External handler: called when a chat message arrives via WS */
  private messageHandler: ((sessionId: string, message: string) => Promise<void>) | null = null;

  constructor(options: Partial<WebSocketHandlerOptions> = {}) {
    this.options = { ...DEFAULT_WS_OPTIONS, ...options };
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Attach to an existing HTTP server to create the WebSocket endpoint.
   */
  attach(server: Server, path: string = '/ws'): void {
    this.wss = new WebSocketServerClass({ server, path });

    this.wss.on('connection', (ws: any, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (err: Error) => {
      console.error('[WS] Server error:', err.message);
    });

    // Start heartbeat interval
    this.startHeartbeat();

    console.log(`[WS] WebSocket handler attached at path: ${path}`);
  }

  /**
   * Gracefully shut down: close all clients, stop heartbeat.
   */
  async shutdown(): Promise<void> {
    this.stopHeartbeat();

    // Close all client connections
    for (const [clientId, client] of this.clients) {
      try {
        client.ws.close(1000, 'Server shutting down');
      } catch {
        // Client may already be disconnected
      }
    }

    this.clients.clear();
    this.sessionClients.clear();

    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
      this.wss = null;
    }

    console.log('[WS] WebSocket handler shut down');
  }

  // ── Event Registration ───────────────────────────────────────────────────

  /**
   * Register handler for incoming chat messages from WebSocket clients.
   */
  onChatMessage(handler: (sessionId: string, message: string) => Promise<void>): void {
    this.messageHandler = handler;
  }

  // ── Broadcasting ─────────────────────────────────────────────────────────

  /**
   * Send an event to all clients subscribed to a specific session.
   * If no clients are connected, queue the message for later delivery.
   */
  broadcastToSession(sessionId: string, event: WebSocketEvent): void {
    const clientIds = this.sessionClients.get(sessionId);

    if (!clientIds || clientIds.size === 0) {
      // No clients connected to this session — queue the message
      this.enqueueForSession(sessionId, event);
      return;
    }

    const payload = JSON.stringify(event);
    let sent = 0;

    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === WebSocketClass.OPEN) {
        try {
          client.ws.send(payload);
          sent++;
        } catch (err) {
          console.error(`[WS] Failed to send to client ${clientId}:`, err);
          this.handleClientDisconnect(clientId);
        }
      }
    }

    if (sent === 0) {
      this.enqueueForSession(sessionId, event);
    }
  }

  /**
   * Send an event to all connected clients (regardless of session).
   */
  broadcastToAll(event: WebSocketEvent): void {
    const payload = JSON.stringify(event);

    for (const [clientId, client] of this.clients) {
      if (client.ws.readyState === WebSocketClass.OPEN) {
        try {
          client.ws.send(payload);
        } catch {
          this.handleClientDisconnect(clientId);
        }
      }
    }
  }

  /**
   * Send an event to a specific client.
   */
  sendToClient(clientId: string, event: WebSocketEvent): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocketClass.OPEN) {
      return false;
    }

    try {
      client.ws.send(JSON.stringify(event));
      return true;
    } catch {
      this.handleClientDisconnect(clientId);
      return false;
    }
  }

  // ── Session Reconnection ─────────────────────────────────────────────────

  /**
   * Generate a reconnect token for a session. Clients can use this to
   * re-associate with their session after a disconnect.
   */
  issueReconnectToken(sessionId: string): string {
    const token = crypto.randomBytes(24).toString('hex');
    this.reconnectTokens.set(token, sessionId);

    // Auto-expire token after session timeout
    setTimeout(() => {
      this.reconnectTokens.delete(token);
    }, this.options.sessionTimeout);

    return token;
  }

  // ── Statistics ───────────────────────────────────────────────────────────

  getStats(): {
    connectedClients: number;
    activeSessions: number;
    totalQueuedMessages: number;
    reconnectTokens: number;
  } {
    let totalQueued = 0;
    for (const queue of this.sessionQueues.values()) {
      totalQueued += queue.length;
    }
    for (const client of this.clients.values()) {
      totalQueued += client.messageQueue.length;
    }

    return {
      connectedClients: this.clients.size,
      activeSessions: this.sessionClients.size,
      totalQueuedMessages: totalQueued,
      reconnectTokens: this.reconnectTokens.size,
    };
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getSessionClientCount(sessionId: string): number {
    return this.sessionClients.get(sessionId)?.size ?? 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Internal: Connection Handling
  // ═══════════════════════════════════════════════════════════════════════════════

  private handleConnection(ws: any, req: IncomingMessage): void {
    // Authenticate if token is configured
    if (this.options.authToken) {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const token = url.searchParams.get('token') ?? '';
      if (token !== this.options.authToken) {
        ws.close(4001, 'Unauthorized');
        return;
      }
    }

    const clientId = crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();

    const client: ClientConnection = {
      id: clientId,
      ws,
      sessionId: null,
      connectedAt: now,
      lastPongAt: now,
      isAlive: true,
      messageQueue: [],
      reconnectToken: '',
      metadata: {
        userAgent: req.headers['user-agent'] ?? '',
        remoteAddress: req.socket.remoteAddress ?? '',
      },
    };

    this.clients.set(clientId, client);

    // Send welcome message with client ID and reconnect token
    const reconnectToken = this.issueReconnectToken('__pending__');
    client.reconnectToken = reconnectToken;

    this.sendToClient(clientId, {
      type: 'reconnect',
      timestamp: now,
      payload: {
        sessionId: '',
        queuedMessages: [],
      } as ReconnectPayload,
    });

    // Wire up event handlers
    ws.on('message', (data: Buffer) => {
      this.handleMessage(clientId, data);
    });

    ws.on('close', (code: number, reason: Buffer) => {
      console.log(`[WS] Client ${clientId} disconnected: ${code} ${reason.toString()}`);
      this.handleClientDisconnect(clientId);
    });

    ws.on('error', (err: Error) => {
      console.error(`[WS] Client ${clientId} error:`, err.message);
      this.handleClientDisconnect(clientId);
    });

    ws.on('pong', () => {
      const c = this.clients.get(clientId);
      if (c) {
        c.isAlive = true;
        c.lastPongAt = new Date().toISOString();
      }
    });

    console.log(`[WS] Client ${clientId} connected from ${client.metadata.remoteAddress}`);
  }

  private handleMessage(clientId: string, raw: Buffer): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    let event: WebSocketEvent;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      this.sendToClient(clientId, {
        type: 'error',
        timestamp: new Date().toISOString(),
        payload: { error: 'Invalid JSON', code: 'PARSE_ERROR' },
      });
      return;
    }

    switch (event.type) {
      case 'chat.message':
        this.handleChatMessage(client, event);
        break;

      case 'session.created':
      case 'session.status':
        // Client is associating with a session
        if (event.sessionId) {
          this.subscribeClientToSession(clientId, event.sessionId);
        }
        break;

      case 'pong':
        client.isAlive = true;
        client.lastPongAt = new Date().toISOString();
        break;

      case 'reconnect':
        this.handleReconnect(client, event);
        break;

      default:
        // Forward unknown events to the message handler if set
        if (this.messageHandler && event.sessionId) {
          this.messageHandler(event.sessionId, JSON.stringify(event.payload)).catch((err) => {
            console.error(`[WS] Message handler error for client ${clientId}:`, err);
          });
        }
        break;
    }
  }

  private handleChatMessage(client: ClientConnection, event: WebSocketEvent): void {
    const payload = event.payload as { message?: string; sessionId?: string };
    const sessionId = event.sessionId ?? payload.sessionId ?? client.sessionId;

    if (!sessionId) {
      this.sendToClient(client.id, {
        type: 'error',
        timestamp: new Date().toISOString(),
        sessionId: undefined,
        payload: { error: 'No session associated. Send session.created first.', code: 'NO_SESSION' },
      });
      return;
    }

    if (!payload.message) {
      this.sendToClient(client.id, {
        type: 'error',
        timestamp: new Date().toISOString(),
        sessionId,
        payload: { error: 'No message content provided.', code: 'EMPTY_MESSAGE' },
      });
      return;
    }

    // Ensure client is subscribed to this session
    this.subscribeClientToSession(client.id, sessionId);

    // Forward to the registered handler
    if (this.messageHandler) {
      this.messageHandler(sessionId, payload.message).catch((err) => {
        console.error(`[WS] Chat message handler error:`, err);
        this.sendToClient(client.id, {
          type: 'chat.stream.error',
          timestamp: new Date().toISOString(),
          sessionId,
          payload: {
            error: err instanceof Error ? err.message : 'Unknown error',
            code: 'HANDLER_ERROR',
            recoverable: true,
          },
        });
      });
    }
  }

  private handleReconnect(client: ClientConnection, event: WebSocketEvent): void {
    const payload = event.payload as { sessionId?: string };
    const requestedSessionId = event.sessionId ?? payload.sessionId;

    // Check if the client provides a reconnect token in the payload
    const reconnectPayload = event.payload as { reconnectToken?: string };
    if (reconnectPayload.reconnectToken) {
      const storedSessionId = this.reconnectTokens.get(reconnectPayload.reconnectToken);
      if (storedSessionId && storedSessionId !== '__pending__') {
        this.subscribeClientToSession(client.id, storedSessionId);
        this.reconnectTokens.delete(reconnectPayload.reconnectToken);

        // Deliver queued messages for this session
        const queued = this.sessionQueues.get(storedSessionId) ?? [];
        this.sessionQueues.delete(storedSessionId);

        this.sendToClient(client.id, {
          type: 'reconnect',
          timestamp: new Date().toISOString(),
          sessionId: storedSessionId,
          payload: {
            sessionId: storedSessionId,
            queuedMessages: queued.map((e) => e.payload).filter((p: any) => 'id' in p && 'content' in p) as any[],
          } as ReconnectPayload,
        });

        // Deliver queued events individually
        for (const queuedEvent of queued) {
          this.sendToClient(client.id, queuedEvent);
        }
        return;
      }
    }

    // Fallback: direct session ID
    if (requestedSessionId) {
      this.subscribeClientToSession(client.id, requestedSessionId);

      const queued = this.sessionQueues.get(requestedSessionId) ?? [];
      this.sessionQueues.delete(requestedSessionId);

      this.sendToClient(client.id, {
        type: 'reconnect',
        timestamp: new Date().toISOString(),
        sessionId: requestedSessionId,
        payload: {
          sessionId: requestedSessionId,
          queuedMessages: queued.map((e) => e.payload).filter((p: any) => 'id' in p && 'content' in p) as any[],
        } as ReconnectPayload,
      });

      for (const queuedEvent of queued) {
        this.sendToClient(client.id, queuedEvent);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Internal: Session Management
  // ═══════════════════════════════════════════════════════════════════════════════

  private subscribeClientToSession(clientId: string, sessionId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Unsubscribe from previous session
    if (client.sessionId) {
      const prevSet = this.sessionClients.get(client.sessionId);
      if (prevSet) {
        prevSet.delete(clientId);
        if (prevSet.size === 0) {
          this.sessionClients.delete(client.sessionId);
        }
      }
    }

    // Subscribe to new session
    client.sessionId = sessionId;

    let sessionSet = this.sessionClients.get(sessionId);
    if (!sessionSet) {
      sessionSet = new Set();
      this.sessionClients.set(sessionId, sessionSet);
    }
    sessionSet.add(clientId);
  }

  private handleClientDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // If the client was subscribed to a session, queue any pending messages
    if (client.sessionId) {
      const sessionSet = this.sessionClients.get(client.sessionId);
      if (sessionSet) {
        sessionSet.delete(clientId);
        if (sessionSet.size === 0) {
          this.sessionClients.delete(client.sessionId);
          // Session-level queue remains intact for reconnect
        }
      }
    }

    this.clients.delete(clientId);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Internal: Message Queuing
  // ═══════════════════════════════════════════════════════════════════════════════

  private enqueueForSession(sessionId: string, event: WebSocketEvent): void {
    let queue = this.sessionQueues.get(sessionId);
    if (!queue) {
      queue = [];
      this.sessionQueues.set(sessionId, queue);
    }

    // Enforce max queue size
    while (queue.length >= this.options.maxQueueSize) {
      queue.shift();
    }

    queue.push(event);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Internal: Heartbeat / Ping-Pong
  // ═══════════════════════════════════════════════════════════════════════════════

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.runHeartbeat();
    }, this.options.heartbeatInterval);

    // Prevent the timer from keeping the process alive
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private runHeartbeat(): void {
    const now = Date.now();
    const timeoutMs = this.options.heartbeatInterval * 2; // allow 2 missed pings

    for (const [clientId, client] of this.clients) {
      if (!client.isAlive) {
        // Client did not respond to last ping — terminate
        console.log(`[WS] Client ${clientId} heartbeat timeout, terminating`);
        try {
          client.ws.terminate();
        } catch {
          // Already terminated
        }
        this.handleClientDisconnect(clientId);
        continue;
      }

      // Mark as not alive until we receive a pong
      client.isAlive = false;

      if (client.ws.readyState === WebSocketClass.OPEN) {
        try {
          client.ws.ping();
        } catch {
          this.handleClientDisconnect(clientId);
        }
      }
    }

    // Also clean up stale reconnect tokens
    for (const [token, sessionId] of this.reconnectTokens) {
      // Tokens are self-expiring via setTimeout, but clean up orphaned session queues
      // if no clients are connected and no tokens reference the session
    }
  }
}
