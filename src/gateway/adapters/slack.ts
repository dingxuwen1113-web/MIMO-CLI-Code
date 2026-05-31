// ── Slack Adapter ────────────────────────────────────
// Uses Slack Web API and Events API / Socket Mode
// Supports: Block Kit, threads, file sharing, interactive components

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import {
  PlatformAdapter, PlatformType, GatewayMessage, MessageType,
  Attachment, RichContent, ApprovalOption, AdapterHealth, AdapterStatus,
} from '../types';

export interface SlackConfig {
  botToken: string;
  appToken?: string;         // For Socket Mode
  signingSecret?: string;    // For webhook verification
  mode: 'socket' | 'webhook';
  allowedChannelIds?: string[];
  allowedWorkspaceIds?: string[];
  adminUserIds?: string[];
  maxMessageLength?: number;
}

export class SlackAdapter extends EventEmitter implements PlatformAdapter {
  readonly platform: PlatformType = 'slack';
  status: AdapterStatus = 'disconnected';

  private config: SlackConfig;
  private health: AdapterHealth;
  private messageHandler: ((msg: GatewayMessage) => void) | null = null;
  private pendingActions: Map<string, { resolve: (value: string | null) => void; timeout: NodeJS.Timeout }> = new Map();
  private ws: WebSocket | null = null;
  private messageId = 0;
  private userCache: Map<string, string> = new Map(); // userId -> displayName

  constructor(config: SlackConfig) {
    super();
    this.config = {
      maxMessageLength: 40000,
      ...config,
    };
    this.health = {
      platform: 'slack', status: 'disconnected', lastMessageAt: null,
      messagesSent: 0, messagesReceived: 0, errors: 0, uptime: 0, latencyMs: 0,
    };
  }

  // ── Lifecycle ─────────────────────────────────────

  async start(): Promise<void> {
    try {
      const result = await this.api('auth.test');
      if (!result.ok) throw new Error(`Slack auth failed: ${result.error}`);
      this.emit('bot_info', { team: result.team, userId: result.user_id, botId: result.bot_id });
    } catch (err: any) {
      this.status = 'error';
      this.health.status = 'error';
      throw new Error(`Failed to connect to Slack: ${err.message}`);
    }

    if (this.config.mode === 'socket' && this.config.appToken) {
      await this.connectSocketMode();
    }

    this.status = 'connected';
    this.health.status = 'connected';
    this.health.uptime = Date.now();
    this.emit('connected');
  }

  async stop(): Promise<void> {
    if (this.ws) {
      this.ws.close(1000);
      this.ws = null;
    }

    for (const [id, pending] of this.pendingActions) {
      clearTimeout(pending.timeout);
      pending.resolve(null);
    }
    this.pendingActions.clear();

    this.status = 'disconnected';
    this.health.status = 'disconnected';
    this.emit('disconnected');
  }

  onMessage(handler: (msg: GatewayMessage) => void): void {
    this.messageHandler = handler;
  }

  // ── Socket Mode ───────────────────────────────────

  private async connectSocketMode(): Promise<void> {
    try {
      const result = await this.socketApi('apps.connections.open') as any;
      if (result.ok && result.url) {
        this.emit('socket_connecting', { url: result.url });
        // WebSocket connection to result.url
        // Events are received as JSON frames
      }
    } catch (err: any) {
      this.emit('error', { error: `Socket Mode connection failed: ${err.message}` });
    }
  }

  // Handle Socket Mode events
  handleSocketEvent(event: any): void {
    if (event.type === 'events_api' && event.payload) {
      const ack = { envelope_id: event.envelope_id };
      this.sendSocketAck(ack);

      const payload = event.payload;
      if (payload.event) {
        this.processEvent(payload);
      }
    }

    if (event.type === 'interactive' && event.payload) {
      const ack = { envelope_id: event.envelope_id };
      this.sendSocketAck(ack);
      this.handleInteraction(event.payload);
    }

    if (event.type === 'slash_commands' && event.payload) {
      const ack = { envelope_id: event.envelope_id };
      this.sendSocketAck(ack);
      this.emit('slash_command', event.payload);
    }
  }

  private sendSocketAck(ack: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(ack));
    }
  }

  // ── Webhook Event Handling ────────────────────────

  // Verify Slack webhook signature
  verifyWebhookSignature(signingSecret: string, timestamp: string, body: string, signature: string): boolean {
    if (!this.config.signingSecret) return true;
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
    if (parseInt(timestamp) < fiveMinutesAgo) return false;

    const baseString = `v0:${timestamp}:${body}`;
    const computed = 'v0=' + crypto
      .createHmac('sha256', signingSecret)
      .update(baseString)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(signature)
    );
  }

  // Process an Events API event
  processEvent(payload: any): void {
    const event = payload.event;
    if (!event) return;

    // Handle different event types
    switch (event.type) {
      case 'message':
      case 'app_mention':
        if (event.bot_id || event.subtype === 'bot_message') return;

        // Filter channels
        if (this.config.allowedChannelIds && !this.config.allowedChannelIds.includes(event.channel)) {
          return;
        }

        const msg = this.handleIncoming(payload);
        if (msg && this.messageHandler) {
          this.messageHandler(msg);
        }
        break;

      case 'reaction_added':
        this.emit('reaction', {
          userId: event.user,
          reaction: event.reaction,
          channelId: event.item?.channel,
          messageId: event.item?.ts,
        });
        break;

      case 'file_shared':
        this.emit('file_shared', {
          fileId: event.file_id,
          userId: event.user_id,
          channelId: event.channel_id,
        });
        break;
    }
  }

  // ── Interaction Handling ──────────────────────────

  handleInteraction(payload: any): void {
    if (payload.type === 'block_actions' && payload.actions) {
      for (const action of payload.actions) {
        const actionId = action.action_id;
        const pending = this.pendingActions.get(actionId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingActions.delete(actionId);
          pending.resolve(actionId);
        }
        this.emit('action', {
          actionId,
          value: action.value,
          userId: payload.user?.id,
          channelId: payload.channel?.id,
        });
      }
    }

    if (payload.type === 'view_submission') {
      this.emit('modal_submission', {
        viewId: payload.view?.id,
        values: payload.view?.state?.values,
        userId: payload.user?.id,
      });
    }
  }

  // ── Message Parsing ───────────────────────────────

  handleIncoming(raw: any): GatewayMessage | null {
    const event = raw.event || raw;
    if (!event) return null;

    // Ignore bots and subtypes (except thread_broadcast)
    if (event.bot_id || (event.subtype && event.subtype !== 'thread_broadcast')) return null;

    // Filter
    if (this.config.allowedChannelIds && !this.config.allowedChannelIds.includes(event.channel)) {
      return null;
    }

    const attachments: Attachment[] = (event.files || []).map((f: any) => ({
      id: f.id,
      type: (f.mimetype?.startsWith('image/') ? 'image' : 'file') as 'image' | 'file',
      url: f.url_private || f.permalink || null,
      filename: f.name || null,
      mimeType: f.mimetype || null,
      size: f.size || null,
      data: null,
      caption: null,
    }));

    let type: MessageType = 'text';
    if (attachments.some(a => a.type === 'image')) type = 'image';
    else if (attachments.some(a => a.type === 'file')) type = 'file';

    // Unfurl Slack-specific formatting
    const content = this.unfurlSlackText(event.text || '');

    this.health.messagesReceived++;
    this.health.lastMessageAt = new Date().toISOString();

    // Resolve username
    if (event.user && !this.userCache.has(event.user)) {
      this.resolveUserName(event.user);
    }

    return {
      id: event.ts || event.client_msg_id || `slack-${Date.now()}`,
      platform: 'slack',
      direction: 'inbound',
      sessionId: `slack:${event.channel}`,
      userId: event.user || 'unknown',
      userName: this.userCache.get(event.user) || null,
      channelId: event.channel,
      channelName: null,
      threadId: event.thread_ts || null,
      type,
      content,
      attachments,
      replyToId: event.thread_ts || null,
      timestamp: event.ts ? new Date(parseFloat(event.ts) * 1000).toISOString() : new Date().toISOString(),
      metadata: {
        teamId: raw.team_id,
        channelType: event.channel_type,
        isThreadReply: !!event.thread_ts && event.thread_ts !== event.ts,
      },
    };
  }

  // ── Sending Messages ──────────────────────────────

  async sendMessage(message: GatewayMessage): Promise<boolean> {
    try {
      const payload: any = {
        channel: message.channelId,
        text: this.truncate(message.content, this.config.maxMessageLength!),
      };

      if (message.threadId) {
        payload.thread_ts = message.threadId;
      }

      const result = await this.api('chat.postMessage', payload);
      this.health.messagesSent++;
      return result.ok;
    } catch (err: any) {
      this.health.errors++;
      this.emit('send_error', { error: err.message });
      return false;
    }
  }

  async sendText(sessionId: string, text: string): Promise<boolean> {
    const channelId = sessionId.replace('slack:', '');
    try {
      const result = await this.api('chat.postMessage', {
        channel: channelId,
        text: this.truncate(text, this.config.maxMessageLength!),
      });
      if (!result.ok) { this.health.errors++; return false; }
      this.health.messagesSent++;
      return true;
    } catch {
      this.health.errors++;
      return false;
    }
  }

  async sendRichContent(sessionId: string, content: RichContent): Promise<boolean> {
    const channelId = sessionId.replace('slack:', '');
    const blocks: any[] = [];

    // Header
    if (content.title) {
      blocks.push({
        type: 'header',
        text: { type: 'plain_text', text: content.title, emoji: true },
      });
    }

    // Main section
    const sectionText: string[] = [];
    if (content.description) sectionText.push(content.description);
    if (content.code) {
      sectionText.push(`\`\`\`${content.language || ''}\n${content.code}\n\`\`\``);
    }
    if (sectionText.length > 0) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: sectionText.join('\n\n') },
      });
    }

    // Fields
    if (content.fields && content.fields.length > 0) {
      // Split into chunks of 10 (Slack limit per section)
      for (let i = 0; i < content.fields.length; i += 10) {
        blocks.push({
          type: 'section',
          fields: content.fields.slice(i, i + 10).map(f => ({
            type: 'mrkdwn',
            text: `*${f.name}*\n${f.value}`,
          })),
        });
      }
    }

    // Image
    if (content.imageUrl) {
      blocks.push({
        type: 'image',
        image_url: content.imageUrl,
        alt_text: content.title || 'Image',
      });
    }

    // Divider before footer/buttons
    if (blocks.length > 0 && (content.footer || content.buttons)) {
      blocks.push({ type: 'divider' });
    }

    // Footer
    if (content.footer) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: content.footer }],
      });
    }

    // Buttons
    if (content.buttons && content.buttons.length > 0) {
      blocks.push({
        type: 'actions',
        elements: content.buttons.slice(0, 25).map(btn => ({
          type: 'button',
          text: { type: 'plain_text', text: btn.text },
          url: btn.url,
          action_id: btn.callbackData || `btn_${Date.now()}`,
          style: 'primary',
        })),
      });
    }

    try {
      const result = await this.api('chat.postMessage', {
        channel: channelId,
        blocks,
        text: content.title || content.description || ' ',
      });
      this.health.messagesSent++;
      return result.ok;
    } catch {
      this.health.errors++;
      return false;
    }
  }

  async sendApprovalButtons(sessionId: string, prompt: string, options: ApprovalOption[]): Promise<string | null> {
    const channelId = sessionId.replace('slack:', '');

    const blocks = [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: prompt },
      },
      {
        type: 'actions',
        elements: options.slice(0, 25).map(opt => ({
          type: 'button',
          text: { type: 'plain_text', text: opt.label },
          action_id: opt.id,
          style: opt.style === 'danger' ? 'danger' : 'primary',
        })),
      },
    ];

    try {
      await this.api('chat.postMessage', {
        channel: channelId,
        blocks,
        text: prompt,
      });
      this.health.messagesSent++;

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          for (const opt of options) this.pendingActions.delete(opt.id);
          resolve(null);
        }, 60000);
        for (const opt of options) {
          this.pendingActions.set(opt.id, { resolve, timeout });
        }
      });
    } catch {
      this.health.errors++;
      return null;
    }
  }

  // ── Thread Support ────────────────────────────────

  async sendThreadReply(channelId: string, threadTs: string, text: string): Promise<boolean> {
    try {
      const result = await this.api('chat.postMessage', {
        channel: channelId,
        thread_ts: threadTs,
        text: this.truncate(text, this.config.maxMessageLength!),
      });
      this.health.messagesSent++;
      return result.ok;
    } catch {
      this.health.errors++;
      return false;
    }
  }

  async createThread(channelId: string, text: string): Promise<string | null> {
    try {
      const result = await this.api('chat.postMessage', {
        channel: channelId,
        text,
      }) as any;
      if (result.ok && result.ts) {
        return result.ts;
      }
    } catch { /* ignore */ }
    return null;
  }

  // ── File Sharing ──────────────────────────────────

  async uploadFile(channelId: string, content: string | Buffer, filename: string, title?: string, threadTs?: string): Promise<boolean> {
    try {
      const result = await this.api('files.upload', {
        channels: channelId,
        filename,
        title: title || filename,
        content: typeof content === 'string' ? content : content.toString('utf-8'),
        ...(threadTs ? { thread_ts: threadTs } : {}),
      });
      this.health.messagesSent++;
      return (result as any).ok;
    } catch {
      this.health.errors++;
      return false;
    }
  }

  // ── Modal Dialogs ─────────────────────────────────

  async openModal(triggerId: string, title: string, blocks: any[], submitLabel = 'Submit'): Promise<boolean> {
    try {
      await this.api('views.open', {
        trigger_id: triggerId,
        view: {
          type: 'modal',
          title: { type: 'plain_text', text: title },
          submit: { type: 'plain_text', text: submitLabel },
          blocks,
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  // ── User Resolution ───────────────────────────────

  private async resolveUserName(userId: string): Promise<void> {
    try {
      const result = await this.api('users.info', { user: userId }) as any;
      if (result.ok && result.user) {
        const name = result.user.real_name || result.user.display_name || result.user.name || userId;
        this.userCache.set(userId, name);
      }
    } catch { /* ignore */ }
  }

  // ── Health ────────────────────────────────────────

  getHealth(): AdapterHealth { return { ...this.health }; }

  // ── Helpers ───────────────────────────────────────

  private unfurlSlackText(text: string): string {
    return text
      .replace(/<@(U[A-Z0-9]+)>/g, (match, userId) => {
        return this.userCache.get(userId) || '@user';
      })
      .replace(/<#(C[A-Z0-9]+)\|([^>]+)>/g, '#$2')
      .replace(/<(https?:\/\/[^|>]+)(\|([^>]+))?>/g, (_, url, __, label) => label || url)
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  private async api(method: string, body?: Record<string, any>): Promise<any> {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json() as any;

    // Handle rate limiting
    if (data.error === 'rate_limited') {
      const retryAfter = (data.retry_after || 1) * 1000;
      await this.sleep(retryAfter);
      return this.api(method, body);
    }

    return data;
  }

  private async socketApi(method: string, body?: Record<string, any>): Promise<any> {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.appToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.json();
  }

  private truncate(text: string, maxLen: number): string {
    return text.length > maxLen ? text.substring(0, maxLen - 20) + '\n\n[truncated...]' : text;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
