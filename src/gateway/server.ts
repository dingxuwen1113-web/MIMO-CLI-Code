// ── Gateway Server ───────────────────────────────────

import { EventEmitter } from 'events';
import {
  PlatformAdapter, PlatformType, GatewayMessage, GatewayConfig,
  GatewaySession, HealthReport, AdapterHealth, RateLimitConfig,
  DEFAULT_GATEWAY_CONFIG,
} from './types';
import { MessageRouter } from './router';

export class GatewayServer extends EventEmitter {
  private config: GatewayConfig;
  private adapters: Map<PlatformType, PlatformAdapter> = new Map();
  private sessions: Map<string, GatewaySession> = new Map();
  private messageQueue: GatewayMessage[] = [];
  private router: MessageRouter;
  private rateLimiters: Map<PlatformType, RateLimiter> = new Map();
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private startedAt: number = 0;
  private messageHandler: ((message: GatewayMessage) => Promise<string>) | null = null;

  constructor(config?: Partial<GatewayConfig>) {
    super();
    this.config = { ...DEFAULT_GATEWAY_CONFIG, ...config };
    this.router = new MessageRouter(this);

    // Initialize rate limiters
    if (this.config.rateLimiting.enabled) {
      this.initRateLimiters();
    }
  }

  // ── Adapter Registration ──────────────────────────

  registerAdapter(adapter: PlatformAdapter): void {
    this.adapters.set(adapter.platform, adapter);

    // Adapter registered; message handling is done via handleIncomingMessage()
  }

  getAdapter(platform: PlatformType): PlatformAdapter | undefined {
    return this.adapters.get(platform);
  }

  // ── Message Handler Registration ──────────────────

  setMessageHandler(handler: (message: GatewayMessage) => Promise<string>): void {
    this.messageHandler = handler;
  }

  // ── Lifecycle ─────────────────────────────────────

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startedAt = Date.now();

    const startPromises: Promise<void>[] = [];

    for (const [platform, adapter] of this.adapters) {
      const platformConfig = this.config.platforms.find(p => p.platform === platform);
      if (platformConfig?.enabled !== false) {
        startPromises.push(
          adapter.start().catch(err => {
            this.emit('adapter_error', { platform, error: err.message });
          })
        );
      }
    }

    await Promise.allSettled(startPromises);

    // Start health check
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);

    // Start message queue processor
    this.processMessageQueue();

    // Start session cleanup
    this.cleanupSessions();

    this.emit('started', { adapters: Array.from(this.adapters.keys()) });
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    const stopPromises: Promise<void>[] = [];
    for (const adapter of this.adapters.values()) {
      stopPromises.push(adapter.stop().catch(() => {}));
    }
    await Promise.allSettled(stopPromises);

    this.emit('stopped');
  }

  // ── Message Processing ────────────────────────────

  async handleIncomingMessage(rawMessage: any, platform: PlatformType): Promise<void> {
    const adapter = this.adapters.get(platform);
    if (!adapter) return;

    // Parse raw message into GatewayMessage
    const message = adapter.handleIncoming(rawMessage);
    if (!message) return;

    // Rate limiting
    if (this.config.rateLimiting.enabled) {
      const limiter = this.rateLimiters.get(platform);
      if (limiter && !limiter.allow()) {
        this.emit('rate_limited', { platform, userId: message.userId });
        return;
      }
    }

    // Update/create session
    const session = this.getOrCreateSession(message);

    // Add to message history
    session.messageHistory.push(message);
    if (session.messageHistory.length > 100) {
      session.messageHistory = session.messageHistory.slice(-100);
    }
    session.lastActivityAt = new Date().toISOString();

    this.emit('message_received', message);

    // Route through message router
    try {
      const response = await this.router.routeMessage(message);

      if (response) {
        await this.sendResponse(message, response);
      }
    } catch (err: any) {
      this.emit('routing_error', { message, error: err.message });

      // Send error message to user
      await adapter.sendText(message.sessionId, `Error processing your message: ${err.message}`);
    }
  }

  async sendResponse(originalMessage: GatewayMessage, responseText: string): Promise<void> {
    const adapter = this.adapters.get(originalMessage.platform);
    if (!adapter) return;

    const response: GatewayMessage = {
      id: `resp-${Date.now()}`,
      platform: originalMessage.platform,
      direction: 'outbound',
      sessionId: originalMessage.sessionId,
      userId: originalMessage.userId,
      userName: null,
      channelId: originalMessage.channelId,
      channelName: originalMessage.channelName,
      threadId: originalMessage.threadId,
      type: 'text',
      content: responseText,
      attachments: [],
      replyToId: originalMessage.id,
      timestamp: new Date().toISOString(),
      metadata: {},
    };

    try {
      await adapter.sendMessage(response);
      this.emit('message_sent', response);
    } catch (err: any) {
      this.emit('send_error', { message: response, error: err.message });

      // Retry with backoff
      await this.retrySendMessage(adapter, response);
    }
  }

  async sendToSession(sessionId: string, content: string, type: 'text' | 'image' | 'file' = 'text'): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const adapter = this.adapters.get(session.platform);
    if (!adapter) return false;

    const message: GatewayMessage = {
      id: `msg-${Date.now()}`,
      platform: session.platform,
      direction: 'outbound',
      sessionId,
      userId: session.userId,
      userName: null,
      channelId: session.channelId,
      channelName: null,
      threadId: null,
      type,
      content,
      attachments: [],
      replyToId: null,
      timestamp: new Date().toISOString(),
      metadata: {},
    };

    return adapter.sendMessage(message);
  }

  // ── Message Queue ─────────────────────────────────

  private async processMessageQueue(): Promise<void> {
    while (this.isRunning) {
      if (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift()!;
        try {
          await this.handleIncomingMessage(message, message.platform);
        } catch (err: any) {
          this.emit('queue_error', { messageId: message.id, error: err.message });
        }
      } else {
        await this.sleep(100);
      }
    }
  }

  enqueueMessage(message: GatewayMessage): void {
    if (this.messageQueue.length >= this.config.maxMessageQueueSize) {
      // Drop oldest message
      this.messageQueue.shift();
      this.emit('queue_overflow', { dropped: true });
    }
    this.messageQueue.push(message);
  }

  // ── Session Management ────────────────────────────

  private getOrCreateSession(message: GatewayMessage): GatewaySession {
    const sessionKey = `${message.platform}:${message.userId}:${message.channelId}`;

    let session = this.sessions.get(sessionKey);
    if (!session) {
      session = {
        id: sessionKey,
        platform: message.platform,
        userId: message.userId,
        channelId: message.channelId,
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        context: {},
        messageHistory: [],
      };
      this.sessions.set(sessionKey, session);
      this.emit('session_created', { sessionId: sessionKey, platform: message.platform });
    }

    return session;
  }

  getSession(sessionId: string): GatewaySession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): GatewaySession[] {
    return Array.from(this.sessions.values());
  }

  updateSessionContext(sessionId: string, context: Record<string, any>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.context = { ...session.context, ...context };
      session.lastActivityAt = new Date().toISOString();
    }
  }

  private cleanupSessions(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions) {
        const lastActivity = new Date(session.lastActivityAt).getTime();
        if (now - lastActivity > this.config.sessionTimeout) {
          this.sessions.delete(id);
          this.emit('session_expired', { sessionId: id });
        }
      }
    }, 60000); // Check every minute
  }

  // ── Rate Limiting ─────────────────────────────────

  private initRateLimiters(): void {
    for (const [platform, limit] of Object.entries(this.config.rateLimiting.perPlatform)) {
      this.rateLimiters.set(
        platform as PlatformType,
        new RateLimiter(limit, 60000, this.config.rateLimiting.burstSize)
      );
    }
  }

  // ── Health Monitoring ─────────────────────────────

  private performHealthCheck(): void {
    const report = this.getHealthReport();

    this.emit('health_check', report);

    if (report.status === 'unhealthy') {
      this.emit('unhealthy', report);

      // Attempt to reconnect failed adapters
      for (const adapterHealth of report.adapters) {
        if (adapterHealth.status === 'error') {
          const adapter = this.adapters.get(adapterHealth.platform);
          if (adapter) {
            this.reconnectAdapter(adapter).catch(() => {});
          }
        }
      }
    }
  }

  getHealthReport(): HealthReport {
    const adapterHealths: AdapterHealth[] = [];

    for (const adapter of this.adapters.values()) {
      adapterHealths.push(adapter.getHealth());
    }

    const errorCount = adapterHealths.filter(a => a.status === 'error').length;
    const connectedCount = adapterHealths.filter(a => a.status === 'connected').length;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (errorCount === 0 && connectedCount > 0) {
      status = 'healthy';
    } else if (connectedCount > 0) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      adapters: adapterHealths,
      activeSessions: this.sessions.size,
      queuedMessages: this.messageQueue.length,
      uptime: Date.now() - this.startedAt,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Retry Logic ───────────────────────────────────

  private async retrySendMessage(adapter: PlatformAdapter, message: GatewayMessage): Promise<void> {
    const { maxRetries, baseDelayMs, maxDelayMs, backoffMultiplier } = this.config.retryConfig;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const delay = Math.min(baseDelayMs * Math.pow(backoffMultiplier, attempt), maxDelayMs);
      await this.sleep(delay);

      try {
        await adapter.sendMessage(message);
        return;
      } catch {
        // Continue retrying
      }
    }

    this.emit('send_failed', { message, retries: maxRetries });
  }

  private async reconnectAdapter(adapter: PlatformAdapter): Promise<void> {
    this.emit('reconnecting', { platform: adapter.platform });

    try {
      await adapter.stop();
      await adapter.start();
      this.emit('reconnected', { platform: adapter.platform });
    } catch (err: any) {
      this.emit('reconnect_failed', { platform: adapter.platform, error: err.message });
    }
  }

  // ── Utility ───────────────────────────────────────

  getRouter(): MessageRouter {
    return this.router;
  }

  getConfig(): GatewayConfig {
    return { ...this.config };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ── Rate Limiter (Token Bucket) ──────────────────────

class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per ms
  private lastRefill: number;

  constructor(maxPerMinute: number, windowMs: number, burstSize: number) {
    this.maxTokens = burstSize;
    this.tokens = burstSize;
    this.refillRate = maxPerMinute / windowMs;
    this.lastRefill = Date.now();
  }

  allow(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}
