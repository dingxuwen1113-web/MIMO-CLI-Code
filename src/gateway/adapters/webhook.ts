// ── Generic Webhook Adapter ─────────────────────────
// A flexible adapter for any platform that can send/receive webhooks
// Supports: JSON webhooks, signature verification, custom transformations

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import {
  PlatformAdapter, PlatformType, GatewayMessage, MessageType,
  Attachment, RichContent, ApprovalOption, AdapterHealth, AdapterStatus,
} from '../types';

export interface WebhookConfig {
  /** URL to send outbound messages to */
  callbackUrl: string;
  /** Secret for signing outbound requests */
  secret?: string;
  /** Secret for verifying inbound request signatures */
  verifySecret?: string;
  /** Header name for signature verification */
  signatureHeader?: string;
  /** Signature algorithm */
  signatureAlgorithm?: 'sha256' | 'sha1';
  /** Custom headers to include with outbound requests */
  customHeaders?: Record<string, string>;
  /** Timeout for outbound requests in ms */
  timeoutMs?: number;
  /** Custom inbound message parser */
  inboundParser?: (raw: any) => GatewayMessage | null;
  /** Custom outbound message formatter */
  outboundFormatter?: (message: GatewayMessage) => any;
}

export class WebhookAdapter extends EventEmitter implements PlatformAdapter {
  readonly platform: PlatformType = 'webhook';
  status: AdapterStatus = 'disconnected';

  private config: WebhookConfig;
  private health: AdapterHealth;
  private messageHandler: ((msg: GatewayMessage) => void) | null = null;
  private receivedMessageIds: Set<string> = new Set(); // Dedup

  constructor(config: WebhookConfig) {
    super();
    this.config = {
      signatureAlgorithm: 'sha256',
      timeoutMs: 30000,
      ...config,
    };
    this.health = {
      platform: 'webhook', status: 'disconnected', lastMessageAt: null,
      messagesSent: 0, messagesReceived: 0, errors: 0, uptime: 0, latencyMs: 0,
    };
  }

  // ── Lifecycle ─────────────────────────────────────

  async start(): Promise<void> {
    this.status = 'connected';
    this.health.status = 'connected';
    this.health.uptime = Date.now();
    this.emit('connected', { callbackUrl: this.config.callbackUrl });
  }

  async stop(): Promise<void> {
    this.status = 'disconnected';
    this.health.status = 'disconnected';
    this.receivedMessageIds.clear();
    this.emit('disconnected');
  }

  onMessage(handler: (msg: GatewayMessage) => void): void {
    this.messageHandler = handler;
  }

  // ── Inbound Request Verification ──────────────────

  verifyRequest(body: string, signature: string | null): boolean {
    if (!this.config.verifySecret || !signature) return !this.config.verifySecret;

    const algorithm = this.config.signatureAlgorithm || 'sha256';
    const expected = crypto
      .createHmac(algorithm, this.config.verifySecret)
      .update(body)
      .digest('hex');

    // Support both raw hex and prefixed formats
    const sig = signature.replace(/^sha256=/, '').replace(/^sha1=/, '');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(sig, 'hex')
      );
    } catch {
      return false;
    }
  }

  // ── Message Parsing ───────────────────────────────

  handleIncoming(raw: any): GatewayMessage | null {
    if (!raw) return null;

    // Use custom parser if provided
    if (this.config.inboundParser) {
      const msg = this.config.inboundParser(raw);
      if (msg) {
        this.health.messagesReceived++;
        this.health.lastMessageAt = new Date().toISOString();
      }
      return msg;
    }

    // Default flexible parser - tries multiple common formats
    const content = raw.message || raw.text || raw.content || raw.body || '';
    if (!content && !raw.attachments && !raw.files) return null;

    const id = raw.id || raw.message_id || raw.messageId || `wh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Deduplication
    if (this.receivedMessageIds.has(id)) return null;
    this.receivedMessageIds.add(id);
    // Evict old IDs (keep last 1000)
    if (this.receivedMessageIds.size > 1000) {
      const first = this.receivedMessageIds.values().next().value;
      if (first) this.receivedMessageIds.delete(first);
    }

    const userId = raw.user_id || raw.userId || raw.sender_id || raw.from || 'anonymous';
    const channelId = raw.channel_id || raw.channelId || raw.room_id || raw.conversation_id || 'default';

    // Parse attachments
    const attachments: Attachment[] = [];
    const rawAttachments = raw.attachments || raw.files || raw.media || [];
    if (Array.isArray(rawAttachments)) {
      for (const att of rawAttachments) {
        attachments.push({
          id: att.id || att.file_id || `att-${Date.now()}`,
          type: this.inferAttachmentType(att),
          url: att.url || att.href || att.download_url || null,
          filename: att.filename || att.name || att.file_name || null,
          mimeType: att.mime_type || att.content_type || att.mimeType || null,
          size: att.size || att.file_size || null,
          data: null,
          caption: att.caption || att.description || null,
        });
      }
    }

    let type: MessageType = 'text';
    if (attachments.some(a => a.type === 'image')) type = 'image';
    else if (attachments.some(a => a.type === 'audio')) type = 'audio';
    else if (attachments.some(a => a.type === 'video')) type = 'video';
    else if (attachments.length > 0) type = 'file';
    else if (raw.type === 'image' || raw.msgtype === 'image') type = 'image';
    else if (raw.type === 'file' || raw.msgtype === 'file') type = 'file';

    this.health.messagesReceived++;
    this.health.lastMessageAt = new Date().toISOString();

    return {
      id,
      platform: 'webhook',
      direction: 'inbound',
      sessionId: `webhook:${userId}:${channelId}`,
      userId,
      userName: raw.user_name || raw.userName || raw.sender_name || raw.display_name || null,
      channelId,
      channelName: raw.channel_name || raw.channelName || raw.room_name || null,
      threadId: raw.thread_id || raw.threadId || raw.reply_to || null,
      type,
      content: String(content),
      attachments,
      replyToId: raw.reply_to || raw.replyTo || raw.in_reply_to || null,
      timestamp: raw.timestamp || raw.created_at || raw.time || new Date().toISOString(),
      metadata: {
        ...raw.metadata || {},
        originalPayload: raw,
      },
    };
  }

  private inferAttachmentType(att: any): 'image' | 'file' | 'audio' | 'video' {
    const mime = (att.mime_type || att.content_type || att.mimeType || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('video/')) return 'video';
    if (att.type) {
      const t = String(att.type).toLowerCase();
      if (t === 'image' || t === 'audio' || t === 'video') return t as any;
    }
    return 'file';
  }

  // ── Sending Messages ──────────────────────────────

  async sendMessage(message: GatewayMessage): Promise<boolean> {
    try {
      // Use custom formatter if provided
      let payload: any;
      if (this.config.outboundFormatter) {
        payload = this.config.outboundFormatter(message);
      } else {
        payload = this.defaultFormatOutbound(message);
      }

      const success = await this.postToWebhook(payload);
      if (success) this.health.messagesSent++;
      return success;
    } catch (err: any) {
      this.health.errors++;
      this.emit('send_error', { error: err.message });
      return false;
    }
  }

  async sendText(sessionId: string, text: string): Promise<boolean> {
    const message: GatewayMessage = {
      id: `msg-${Date.now()}`,
      platform: 'webhook',
      direction: 'outbound',
      sessionId,
      userId: '',
      userName: null,
      channelId: sessionId.replace('webhook:', ''),
      channelName: null,
      threadId: null,
      type: 'text',
      content: text,
      attachments: [],
      replyToId: null,
      timestamp: new Date().toISOString(),
      metadata: {},
    };
    return this.sendMessage(message);
  }

  async sendRichContent(sessionId: string, content: RichContent): Promise<boolean> {
    const text = this.formatRichContentAsText(content);
    return this.sendText(sessionId, text);
  }

  async sendApprovalButtons(sessionId: string, prompt: string, options: ApprovalOption[]): Promise<string | null> {
    // Webhook doesn't have native button support; send as formatted text
    let text = `${prompt}\n\n`;
    options.forEach((opt, i) => {
      text += `[${i + 1}] ${opt.label} (${opt.id})\n`;
    });

    const sent = await this.sendText(sessionId, text);
    return sent ? 'sent' : null;
  }

  // ── Outbound Formatting ───────────────────────────

  private defaultFormatOutbound(message: GatewayMessage): any {
    const payload: any = {
      message_id: message.id,
      text: message.content,
      user_id: message.userId,
      channel_id: message.channelId,
      timestamp: message.timestamp,
      type: message.type,
    };

    // Include attachments metadata
    if (message.attachments.length > 0) {
      payload.attachments = message.attachments.map(a => ({
        id: a.id,
        type: a.type,
        url: a.url,
        filename: a.filename,
        mime_type: a.mimeType,
        size: a.size,
      }));
    }

    // Include reply reference
    if (message.replyToId) {
      payload.reply_to = message.replyToId;
    }

    // Include thread
    if (message.threadId) {
      payload.thread_id = message.threadId;
    }

    return payload;
  }

  // ── Webhook POST ──────────────────────────────────

  private async postToWebhook(payload: any): Promise<boolean> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.customHeaders,
    };

    // Sign the request if secret is configured
    if (this.config.secret) {
      const algorithm = this.config.signatureAlgorithm || 'sha256';
      const signature = crypto
        .createHmac(algorithm, this.config.secret)
        .update(body)
        .digest('hex');
      headers['X-Signature'] = `${algorithm}=${signature}`;
      headers['X-Timestamp'] = String(Date.now());
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs!);

    try {
      const response = await fetch(this.config.callbackUrl, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();
        this.health.errors++;
        this.emit('send_error', { error: `HTTP ${response.status}: ${text}` });
        return false;
      }

      return true;
    } catch (err: any) {
      clearTimeout(timeout);
      this.health.errors++;

      if (err.name === 'AbortError') {
        this.emit('send_error', { error: 'Request timeout' });
      } else {
        this.emit('send_error', { error: err.message });
      }
      return false;
    }
  }

  // ── Utility ───────────────────────────────────────

  private formatRichContentAsText(content: RichContent): string {
    const parts: string[] = [];
    if (content.title) parts.push(`=== ${content.title} ===`);
    if (content.description) parts.push(content.description);
    if (content.fields) {
      for (const f of content.fields) parts.push(`${f.name}: ${f.value}`);
    }
    if (content.code) parts.push(`\`\`\`\n${content.code}\n\`\`\``);
    if (content.buttons) {
      for (const btn of content.buttons) {
        parts.push(`[${btn.text}]${btn.url ? `(${btn.url})` : ''}`);
      }
    }
    if (content.footer) parts.push(`--- ${content.footer}`);
    return parts.join('\n');
  }

  // ── Health ────────────────────────────────────────

  getHealth(): AdapterHealth { return { ...this.health }; }
}
