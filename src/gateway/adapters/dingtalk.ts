// ── DingTalk Adapter ────────────────────────────────
// Uses DingTalk Open Platform API and Robot Webhook
// Supports: Text, markdown, action cards, link messages, signing

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import {
  PlatformAdapter, PlatformType, GatewayMessage, MessageType,
  Attachment, RichContent, ApprovalOption, AdapterHealth, AdapterStatus,
} from '../types';

export interface DingTalkConfig {
  /** Robot webhook URL for sending messages */
  webhookUrl: string;
  /** Secret for signing webhook requests (optional) */
  secret?: string;
  /** App key for Open Platform API (optional, for receiving messages) */
  appKey?: string;
  /** App secret for Open Platform API */
  appSecret?: string;
  /** Robot code for v2 API */
  robotCode?: string;
  /** Allowed sender user IDs */
  allowedUserIds?: string[];
  /** Allowed conversation IDs */
  allowedConversationIds?: string[];
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

export class DingTalkAdapter extends EventEmitter implements PlatformAdapter {
  readonly platform: PlatformType = 'dingtalk';
  status: AdapterStatus = 'disconnected';

  private config: DingTalkConfig;
  private health: AdapterHealth;
  private messageHandler: ((msg: GatewayMessage) => void) | null = null;
  private tokenCache: TokenCache | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private pendingActions: Map<string, { resolve: (value: string | null) => void; timeout: NodeJS.Timeout }> = new Map();

  private static API_BASE = 'https://api.dingtalk.com/v1.0';

  constructor(config: DingTalkConfig) {
    super();
    this.config = config;
    this.health = {
      platform: 'dingtalk', status: 'disconnected', lastMessageAt: null,
      messagesSent: 0, messagesReceived: 0, errors: 0, uptime: 0, latencyMs: 0,
    };
  }

  // ── Lifecycle ─────────────────────────────────────

  async start(): Promise<void> {
    // If using Open Platform API, obtain access token
    if (this.config.appKey && this.config.appSecret) {
      await this.refreshToken();
      this.refreshTimer = setInterval(() => {
        this.refreshToken().catch(err => {
          this.emit('error', { error: `Token refresh failed: ${err.message}` });
        });
      }, 6000 * 1000);
    }

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

  // ── Incoming Message Handling ──────────────────────

  // Process incoming message from DingTalk callback
  handleIncoming(raw: any): GatewayMessage | null {
    if (!raw) return null;

    let type: MessageType = 'text';
    let content = '';
    const attachments: Attachment[] = [];

    // V2 callback format
    if (raw.msgtype) {
      switch (raw.msgtype) {
        case 'text':
          type = 'text';
          content = raw.text?.content?.trim() || '';
          break;
        case 'picture':
          type = 'image';
          content = '';
          attachments.push({
            id: raw.content?.pictureDownloadCode || '',
            type: 'image',
            url: null,
            filename: null,
            mimeType: 'image/jpeg',
            size: null,
            data: null,
            caption: null,
          });
          break;
        case 'audio':
          type = 'audio';
          content = raw.content?.recognition || ''; // Speech-to-text
          attachments.push({
            id: '',
            type: 'audio',
            url: null,
            filename: 'voice.amr',
            mimeType: 'audio/amr',
            size: null,
            data: null,
            caption: null,
          });
          break;
        case 'file':
          type = 'file';
          content = '';
          attachments.push({
            id: raw.content?.downloadCode || '',
            type: 'file',
            url: null,
            filename: raw.content?.fileName || null,
            mimeType: null,
            size: null,
            data: null,
            caption: null,
          });
          break;
        case 'richText':
        case 'markdown':
          type = 'text';
          content = this.extractRichTextContent(raw.content);
          break;
        default:
          type = 'text';
          content = JSON.stringify(raw.content || {});
      }
    }
    // V1 callback format (legacy)
    else if (raw.text?.content) {
      type = 'text';
      content = raw.text.content.trim();
    }
    else if (raw.msgtype === 'picture') {
      type = 'image';
      content = '';
    }
    else {
      return null;
    }

    // Filter by allowed users/conversations
    const userId = raw.senderStaffId || raw.senderId || raw.sender?.senderId || '';
    const conversationId = raw.conversationId || raw.sender?.conversationId || '';

    if (this.config.allowedUserIds && !this.config.allowedUserIds.includes(userId)) {
      return null;
    }
    if (this.config.allowedConversationIds && !this.config.allowedConversationIds.includes(conversationId)) {
      return null;
    }

    this.health.messagesReceived++;
    this.health.lastMessageAt = new Date().toISOString();

    return {
      id: raw.msgId || raw.msgmsgId || `dingtalk-${Date.now()}`,
      platform: 'dingtalk',
      direction: 'inbound',
      sessionId: `dingtalk:${conversationId}`,
      userId,
      userName: raw.senderNick || raw.sender?.senderNick || null,
      channelId: conversationId,
      channelName: raw.conversationTitle || raw.sender?.conversationTitle || null,
      threadId: null,
      type,
      content,
      attachments,
      replyToId: null,
      timestamp: new Date().toISOString(),
      metadata: {
        robotCode: raw.robotCode || this.config.robotCode,
        conversationType: raw.conversationType || raw.sender?.conversationType,
        isInAtList: raw.isInAtList || false,
        senderCorpId: raw.senderCorpId || raw.sender?.corpId,
      },
    };
  }

  private extractRichTextContent(content: any): string {
    if (typeof content === 'string') return content;
    if (content?.richText) {
      return content.richText.map((item: any) => {
        if (item.text) return item.text;
        if (item.image) return '[image]';
        return '';
      }).join('');
    }
    return JSON.stringify(content);
  }

  // ── Sending Messages (via Webhook) ────────────────

  async sendMessage(message: GatewayMessage): Promise<boolean> {
    if (message.type === 'text') {
      return this.sendText(message.channelId, message.content);
    }
    return this.sendMarkdown(message.channelId, message.content, message.content);
  }

  async sendText(sessionId: string, text: string): Promise<boolean> {
    const body: Record<string, any> = {
      msgtype: 'text',
      text: { content: text },
    };

    return this.sendWebhook(body);
  }

  async sendRichContent(sessionId: string, content: RichContent): Promise<boolean> {
    // Build markdown message
    let md = '';
    if (content.title) md += `### ${content.title}\n\n`;
    if (content.description) md += `${content.description}\n\n`;
    if (content.fields) {
      for (const f of content.fields) {
        md += `**${f.name}:** ${f.value}\n\n`;
      }
    }
    if (content.code) {
      md += `\`\`\`\n${content.code}\n\`\`\`\n\n`;
    }
    if (content.buttons && content.buttons.length > 0) {
      for (const btn of content.buttons) {
        if (btn.url) {
          md += `[${btn.text}](${btn.url})\n\n`;
        } else {
          md += `- ${btn.text}\n`;
        }
      }
    }
    if (content.footer) {
      md += `---\n${content.footer}`;
    }

    if (content.buttons && content.buttons.length > 0 && content.buttons[0].url) {
      // Use action card with buttons
      return this.sendActionCard(sessionId, content.title || '', md, content.buttons.map(b => ({
        title: b.text,
        actionURL: b.url || '',
      })));
    }

    return this.sendMarkdown(sessionId, content.title || 'MIMO', md);
  }

  async sendApprovalButtons(sessionId: string, prompt: string, options: ApprovalOption[]): Promise<string | null> {
    // Use action card for approval buttons
    const buttons = options.map(opt => ({
      title: opt.label,
      actionURL: `dingtalk://dingtalkclient/page/link?url=${encodeURIComponent(`mimo-approval://${opt.id}`)}`,
    }));

    const sent = await this.sendActionCard(sessionId, prompt, prompt, buttons);

    if (sent) {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          for (const opt of options) this.pendingActions.delete(opt.id);
          resolve(null);
        }, 60000);
        for (const opt of options) {
          this.pendingActions.set(opt.id, { resolve, timeout });
        }
      });
    }
    return null;
  }

  // ── Webhook Message Types ─────────────────────────

  private async sendMarkdown(sessionId: string, title: string, text: string): Promise<boolean> {
    const body: Record<string, any> = {
      msgtype: 'markdown',
      markdown: { title, text },
    };
    return this.sendWebhook(body);
  }

  private async sendActionCard(sessionId: string, title: string, text: string, buttons: Array<{ title: string; actionURL: string }>): Promise<boolean> {
    const body: Record<string, any> = {
      msgtype: 'actionCard',
      actionCard: {
        title,
        text,
        btnOrientation: '1',
        btns: buttons,
      },
    };
    return this.sendWebhook(body);
  }

  async sendLinkMessage(title: string, text: string, messageUrl: string, picUrl?: string): Promise<boolean> {
    const body: Record<string, any> = {
      msgtype: 'link',
      link: {
        title,
        text,
        messageUrl,
        picUrl: picUrl || '',
      },
    };
    return this.sendWebhook(body);
  }

  // ── Open Platform API (v2) for receiving messages ─

  // Process stream connection events (DingTalk Stream mode)
  handleStreamEvent(event: any): void {
    if (!event) return;

    const headers = event.headers || {};
    const data = event.data || event;

    // Dispatch based on event type
    const eventType = headers.topic || event.topic;

    switch (eventType) {
      case 'robot':
      case 'im.message.receive_v1':
        const msg = this.handleIncoming(data);
        if (msg && this.messageHandler) this.messageHandler(msg);
        break;

      case 'chatbot_ai_action':
        this.emit('ai_action', data);
        break;

      default:
        this.emit('unknown_event', { type: eventType, data });
    }
  }

  // ── Webhook Send Helper ───────────────────────────

  private async sendWebhook(body: Record<string, any>): Promise<boolean> {
    let url = this.config.webhookUrl;

    // Add signing if secret is configured
    if (this.config.secret) {
      const timestamp = Date.now();
      const sign = await this.calculateSign(timestamp);
      url += `&timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
    }

    try {
      const result = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await result.json() as any;

      if (data.errcode !== 0) {
        this.health.errors++;
        this.emit('error', { error: `DingTalk API error ${data.errcode}: ${data.errmsg}` });
        return false;
      }

      this.health.messagesSent++;
      return true;
    } catch (err: any) {
      this.health.errors++;
      this.emit('send_error', { error: err.message });
      return false;
    }
  }

  // ── Open Platform API Calls ───────────────────────

  async sendToConversation(conversationId: string, msgType: string, content: any): Promise<boolean> {
    if (!this.tokenCache) return false;

    try {
      const result = await fetch(
        `${DingTalkAdapter.API_BASE}/robot/groupMessages/send`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-acs-dingtalk-access-token': this.tokenCache.accessToken,
          },
          body: JSON.stringify({
            msgParam: JSON.stringify(content),
            msgKey: msgType,
            openConversationId: conversationId,
            robotCode: this.config.robotCode,
          }),
        }
      );
      const data = await result.json() as any;
      return !data.code;
    } catch {
      this.health.errors++;
      return false;
    }
  }

  async sendToSingleChat(userId: string, msgType: string, content: any): Promise<boolean> {
    if (!this.tokenCache) return false;

    try {
      const result = await fetch(
        `${DingTalkAdapter.API_BASE}/robot/oToMessages/batchSend`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-acs-dingtalk-access-token': this.tokenCache.accessToken,
          },
          body: JSON.stringify({
            msgParam: JSON.stringify(content),
            msgKey: msgType,
            robotCode: this.config.robotCode,
            userIds: [userId],
          }),
        }
      );
      const data = await result.json() as any;
      return !data.code;
    } catch {
      this.health.errors++;
      return false;
    }
  }

  // ── Signing ───────────────────────────────────────

  private async calculateSign(timestamp: number): Promise<string> {
    const str = `${timestamp}\n${this.config.secret}`;
    const hmac = crypto.createHmac('sha256', this.config.secret!);
    hmac.update(str);
    return hmac.digest('base64');
  }

  // ── Token Management ──────────────────────────────

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.accessToken;
    }
    await this.refreshToken();
    return this.tokenCache!.accessToken;
  }

  private async refreshToken(): Promise<void> {
    if (!this.config.appKey || !this.config.appSecret) return;

    const result = await fetch(
      'https://api.dingtalk.com/v1.0/oauth2/accessToken',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appKey: this.config.appKey,
          appSecret: this.config.appSecret,
        }),
      }
    );
    const data = await result.json() as any;

    if (!data.accessToken) {
      throw new Error(`DingTalk token refresh failed: ${data.message || 'unknown error'}`);
    }

    this.tokenCache = {
      accessToken: data.accessToken,
      expiresAt: Date.now() + (data.expireIn - 300) * 1000,
    };
  }

  // ── Health ────────────────────────────────────────

  getHealth(): AdapterHealth { return { ...this.health }; }
}
