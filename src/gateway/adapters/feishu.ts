// ── Feishu/Lark Adapter ─────────────────────────────
// Uses Feishu Open Platform API
// Supports: Text, rich text, interactive cards, approval workflows

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import {
  PlatformAdapter, PlatformType, GatewayMessage, MessageType,
  Attachment, RichContent, ApprovalOption, AdapterHealth, AdapterStatus,
} from '../types';

export interface FeishuConfig {
  appId: string;
  appSecret: string;
  verificationToken?: string; // For event callback verification
  encryptKey?: string;        // For event callback encryption
  allowedChatIds?: string[];
  allowedUserIds?: string[];
}

interface TokenCache {
  tenantToken: string;
  expiresAt: number;
}

export class FeishuAdapter extends EventEmitter implements PlatformAdapter {
  readonly platform: PlatformType = 'feishu';
  status: AdapterStatus = 'disconnected';

  private config: FeishuConfig;
  private health: AdapterHealth;
  private tokenCache: TokenCache | null = null;
  private messageHandler: ((msg: GatewayMessage) => void) | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private pendingActions: Map<string, { resolve: (value: string | null) => void; timeout: NodeJS.Timeout }> = new Map();

  private static API_BASE = 'https://open.feishu.cn/open-apis';

  constructor(config: FeishuConfig) {
    super();
    this.config = config;
    this.health = {
      platform: 'feishu', status: 'disconnected', lastMessageAt: null,
      messagesSent: 0, messagesReceived: 0, errors: 0, uptime: 0, latencyMs: 0,
    };
  }

  // ── Lifecycle ─────────────────────────────────────

  async start(): Promise<void> {
    await this.refreshToken();

    // Auto-refresh token (expires in ~7200s, refresh at 6000s)
    this.refreshTimer = setInterval(() => {
      this.refreshToken().catch(err => {
        this.emit('error', { error: `Token refresh failed: ${err.message}` });
      });
    }, 6000 * 1000);

    this.status = 'connected';
    this.health.status = 'connected';
    this.health.uptime = Date.now();
    this.emit('connected');
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
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

  // ── Event Callback Verification ───────────────────

  verifyEvent(url: string, challenge: string): any {
    // Feishu URL verification challenge
    return { challenge };
  }

  // ── Event Processing ──────────────────────────────

  // Process incoming event from Feishu webhook
  processEvent(event: any): void {
    if (!event || !event.header) return;

    const eventType = event.header.event_type;
    const eventData = event.event;

    switch (eventType) {
      case 'im.message.receive_v1':
        this.handleMessageEvent(eventData);
        break;
      case 'im.message.message_read_v1':
        this.emit('message_read', {
          messageId: eventData?.message_id,
          userId: eventData?.reader?.reader_id?.open_id,
        });
        break;
      case 'p2p_chat_create':
        this.emit('chat_created', {
          chatId: eventData?.chat_id,
          userId: eventData?.user_id?.open_id,
        });
        break;
      case 'im.chat.member.bot.added_v1':
        this.emit('bot_added', { chatId: eventData?.chat_id });
        break;
      case 'im.chat.member.bot.deleted_v1':
        this.emit('bot_removed', { chatId: eventData?.chat_id });
        break;
    }
  }

  private handleMessageEvent(eventData: any): void {
    if (!eventData?.message) return;
    const msg = this.handleIncoming(eventData);
    if (msg && this.messageHandler) {
      this.messageHandler(msg);
    }
  }

  // Handle card action callback
  handleCardAction(action: any): void {
    if (action?.action?.value) {
      const actionId = action.action.value.action_id || action.action.tag;
      const pending = this.pendingActions.get(actionId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingActions.delete(actionId);
        pending.resolve(actionId);
      }
    }
    this.emit('card_action', action);
  }

  // ── Message Parsing ───────────────────────────────

  handleIncoming(raw: any): GatewayMessage | null {
    const msg = raw?.message || raw;
    if (!msg) return null;

    // Filter
    if (this.config.allowedChatIds && !this.config.allowedChatIds.includes(msg.chat_id)) {
      return null;
    }

    let type: MessageType = 'text';
    let content = '';
    const attachments: Attachment[] = [];

    const msgType = msg.message_type;
    let parsedContent: any;

    try {
      parsedContent = JSON.parse(msg.content || '{}');
    } catch {
      parsedContent = {};
    }

    switch (msgType) {
      case 'text':
        type = 'text';
        content = parsedContent.text || '';
        break;

      case 'image':
        type = 'image';
        content = '';
        attachments.push({
          id: msg.image_key || '',
          type: 'image',
          url: null,
          filename: null,
          mimeType: 'image/jpeg',
          size: null,
          data: null,
          caption: null,
        });
        break;

      case 'file':
        type = 'file';
        content = '';
        attachments.push({
          id: parsedContent.file_key || '',
          type: 'file',
          url: null,
          filename: parsedContent.file_name || null,
          mimeType: null,
          size: null,
          data: null,
          caption: null,
        });
        break;

      case 'audio':
        type = 'audio';
        content = '';
        attachments.push({
          id: parsedContent.file_key || '',
          type: 'audio',
          url: null,
          filename: 'voice.opus',
          mimeType: 'audio/opus',
          size: null,
          data: null,
          caption: null,
        });
        break;

      case 'media':
        type = 'video';
        content = '';
        attachments.push({
          id: parsedContent.file_key || '',
          type: 'video',
          url: null,
          filename: 'video.mp4',
          mimeType: 'video/mp4',
          size: null,
          data: null,
          caption: null,
        });
        break;

      case 'sticker':
        type = 'sticker';
        content = '[sticker]';
        break;

      case 'interactive':
        // Card message - extract text content
        type = 'interactive';
        content = this.extractCardText(parsedContent);
        break;

      case 'merge_forward':
        type = 'text';
        content = '[Forwarded messages]';
        break;

      default:
        return null;
    }

    this.health.messagesReceived++;
    this.health.lastMessageAt = new Date().toISOString();

    return {
      id: msg.message_id || `feishu-${Date.now()}`,
      platform: 'feishu',
      direction: 'inbound',
      sessionId: `feishu:${msg.chat_id}`,
      userId: raw.sender?.sender_id?.open_id || 'unknown',
      userName: raw.sender?.sender_type || null,
      channelId: msg.chat_id,
      channelName: null,
      threadId: msg.thread_id || msg.root_id || null,
      type,
      content,
      attachments,
      replyToId: msg.parent_id || null,
      timestamp: new Date(parseInt(msg.create_time || '0')).toISOString(),
      metadata: {
        chatType: msg.chat_type, // p2p or group
        mentions: msg.mentions || [],
        messageSubType: msgType,
      },
    };
  }

  private extractCardText(card: any): string {
    const parts: string[] = [];
    if (card.header?.title?.content) parts.push(card.header.title.content);

    const elements = card.elements || card.i18n_elements?.zh_cn || [];
    for (const el of elements) {
      if (el.tag === 'div' && el.text?.content) parts.push(el.text.content);
      if (el.tag === 'markdown' && el.content) parts.push(el.content);
      if (el.tag === 'plain_text' && el.content) parts.push(el.content);
    }
    return parts.join('\n');
  }

  // ── Sending Messages ──────────────────────────────

  async sendMessage(message: GatewayMessage): Promise<boolean> {
    try {
      const token = await this.getAccessToken();

      if (message.type === 'image' && message.attachments.length > 0 && message.attachments[0].id) {
        return await this.sendImageMessage(message.channelId, message.attachments[0].id, token);
      }

      // Send as text
      return await this.sendText(message.channelId, message.content);
    } catch (err: any) {
      this.health.errors++;
      this.emit('send_error', { error: err.message });
      return false;
    }
  }

  async sendText(chatId: string, text: string): Promise<boolean> {
    const token = await this.getAccessToken();
    try {
      const result = await fetch(
        `${FeishuAdapter.API_BASE}/im/v1/messages?receive_id_type=chat_id`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            receive_id: chatId,
            msg_type: 'text',
            content: JSON.stringify({ text }),
          }),
        }
      );
      const data = await result.json() as any;
      if (data.code !== 0) {
        this.health.errors++;
        this.emit('error', { error: `Feishu API error ${data.code}: ${data.msg}` });
        return false;
      }
      this.health.messagesSent++;
      return true;
    } catch {
      this.health.errors++;
      return false;
    }
  }

  async sendRichContent(sessionId: string, content: RichContent): Promise<boolean> {
    const chatId = sessionId.replace('feishu:', '');
    const token = await this.getAccessToken();

    // Build interactive card
    const card = this.buildInteractiveCard(content);

    try {
      const result = await fetch(
        `${FeishuAdapter.API_BASE}/im/v1/messages?receive_id_type=chat_id`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            receive_id: chatId,
            msg_type: 'interactive',
            content: JSON.stringify(card),
          }),
        }
      );
      const data = await result.json() as any;
      if (data.code !== 0) { this.health.errors++; return false; }
      this.health.messagesSent++;
      return true;
    } catch {
      this.health.errors++;
      return false;
    }
  }

  async sendApprovalButtons(sessionId: string, prompt: string, options: ApprovalOption[]): Promise<string | null> {
    const chatId = sessionId.replace('feishu:', '');
    const token = await this.getAccessToken();

    const card = {
      header: {
        title: { tag: 'plain_text', content: prompt },
        template: 'blue',
      },
      elements: [
        {
          tag: 'action',
          actions: options.map(opt => ({
            tag: 'button',
            text: { tag: 'plain_text', content: opt.label },
            type: opt.style === 'danger' ? 'danger' : 'primary',
            value: { action_id: opt.id },
          })),
        },
      ],
    };

    try {
      const result = await fetch(
        `${FeishuAdapter.API_BASE}/im/v1/messages?receive_id_type=chat_id`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            receive_id: chatId,
            msg_type: 'interactive',
            content: JSON.stringify(card),
          }),
        }
      );
      const data = await result.json() as any;
      if (data.code !== 0) { this.health.errors++; return null; }
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

  // ── Interactive Card Builder ──────────────────────

  private buildInteractiveCard(content: RichContent): any {
    const elements: any[] = [];

    if (content.description) {
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: content.description } });
    }

    if (content.fields) {
      const fieldText = content.fields.map(f => `**${f.name}:** ${f.value}`).join('\n');
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: fieldText } });
    }

    if (content.code) {
      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: `\`\`\`${content.language || ''}\n${content.code}\n\`\`\`` },
      });
    }

    if (content.buttons && content.buttons.length > 0) {
      elements.push({
        tag: 'action',
        actions: content.buttons.map(btn => ({
          tag: 'button',
          text: { tag: 'plain_text', content: btn.text },
          type: 'primary',
          url: btn.url,
          value: btn.callbackData ? { action_id: btn.callbackData } : undefined,
        })),
      });
    }

    if (content.footer) {
      elements.push({ tag: 'note', elements: [{ tag: 'lark_md', content: content.footer }] });
    }

    return {
      header: {
        title: { tag: 'plain_text', content: content.title || 'MIMO' },
        template: content.color ? 'blue' : 'indigo',
      },
      elements,
    };
  }

  // ── Image Sending ─────────────────────────────────

  private async sendImageMessage(chatId: string, imageKey: string, token: string): Promise<boolean> {
    try {
      const result = await fetch(
        `${FeishuAdapter.API_BASE}/im/v1/messages?receive_id_type=chat_id`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            receive_id: chatId,
            msg_type: 'image',
            content: JSON.stringify({ image_key: imageKey }),
          }),
        }
      );
      const data = await result.json() as any;
      if (data.code !== 0) { this.health.errors++; return false; }
      this.health.messagesSent++;
      return true;
    } catch {
      this.health.errors++;
      return false;
    }
  }

  // ── Upload Image ──────────────────────────────────

  async uploadImage(data: Buffer, filename: string): Promise<string | null> {
    const token = await this.getAccessToken();
    const formData = new FormData();
    formData.append('image_type', 'message');
    formData.append('image', new Blob([data]), filename);

    try {
      const result = await fetch(
        `${FeishuAdapter.API_BASE}/im/v1/images`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        }
      );
      const json = await result.json() as any;
      if (json.code === 0) return json.data?.image_key || null;
      return null;
    } catch {
      return null;
    }
  }

  // ── Token Management ──────────────────────────────

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.tenantToken;
    }
    await this.refreshToken();
    return this.tokenCache!.tenantToken;
  }

  private async refreshToken(): Promise<void> {
    const result = await fetch(
      `${FeishuAdapter.API_BASE}/auth/v3/tenant_access_token/internal`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: this.config.appId,
          app_secret: this.config.appSecret,
        }),
      }
    );
    const data = await result.json() as any;

    if (!data.tenant_access_token) {
      throw new Error(`Feishu token refresh failed: data.msg || 'unknown error'`);
    }

    this.tokenCache = {
      tenantToken: data.tenant_access_token,
      expiresAt: Date.now() + (data.expire - 300) * 1000, // Refresh 5 min early
    };
  }

  // ── Health ────────────────────────────────────────

  getHealth(): AdapterHealth { return { ...this.health }; }
}
