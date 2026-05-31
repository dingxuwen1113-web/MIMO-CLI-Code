// ── WeChat Work (企业微信) Adapter ──────────────────────────────
// Uses WeChat Work (Enterprise WeChat) API
// Supports: Text, image, news, markdown messages, approval workflows

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import {
  PlatformAdapter, PlatformType, GatewayMessage, MessageType,
  Attachment, RichContent, ApprovalOption, AdapterHealth, AdapterStatus,
} from '../types';

export interface WeChatConfig {
  corpId: string;
  corpSecret: string;
  agentId: string;
  token?: string;          // For callback verification
  encodingAESKey?: string; // For callback encryption
  allowedUserIds?: string[];
  allowedPartyIds?: string[];
  allowedTagIds?: string[];
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

export class WeChatAdapter extends EventEmitter implements PlatformAdapter {
  readonly platform: PlatformType = 'wechat';
  status: AdapterStatus = 'disconnected';

  private config: WeChatConfig;
  private health: AdapterHealth;
  private tokenCache: TokenCache | null = null;
  private messageHandler: ((msg: GatewayMessage) => void) | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(config: WeChatConfig) {
    super();
    this.config = config;
    this.health = {
      platform: 'wechat', status: 'disconnected', lastMessageAt: null,
      messagesSent: 0, messagesReceived: 0, errors: 0, uptime: 0, latencyMs: 0,
    };
  }

  // ── Lifecycle ─────────────────────────────────────

  async start(): Promise<void> {
    await this.refreshToken();

    // Set up auto-refresh (token expires in 7200s, refresh at 6000s)
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
    this.status = 'disconnected';
    this.health.status = 'disconnected';
    this.emit('disconnected');
  }

  onMessage(handler: (msg: GatewayMessage) => void): void {
    this.messageHandler = handler;
  }

  // ── Callback Verification ─────────────────────────

  // Verify WeChat callback signature (for webhook mode)
  verifyCallback(msgSignature: string, timestamp: string, nonce: string, echostr: string): string | null {
    if (!this.config.token) return echostr;

    const arr = [this.config.token, timestamp, nonce, echostr].sort();
    const str = arr.join('');
    const hash = crypto.createHash('sha1').update(str).digest('hex');

    if (hash === msgSignature) {
      return echostr;
    }
    return null;
  }

  // ── Message Parsing ───────────────────────────────

  handleIncoming(raw: any): GatewayMessage | null {
    if (!raw) return null;

    let type: MessageType = 'text';
    let content = '';
    const attachments: Attachment[] = [];

    switch (raw.MsgType) {
      case 'text':
        type = 'text';
        content = raw.Content || '';
        break;

      case 'image':
        type = 'image';
        content = '';
        attachments.push({
          id: raw.MediaId || '',
          type: 'image',
          url: raw.PicUrl || null,
          filename: null,
          mimeType: 'image/jpeg',
          size: null,
          data: null,
          caption: null,
        });
        break;

      case 'voice':
        type = 'audio';
        content = raw.Recognition || ''; // Speech-to-text if enabled
        attachments.push({
          id: raw.MediaId || '',
          type: 'audio',
          url: null,
          filename: 'voice.amr',
          mimeType: 'audio/amr',
          size: null,
          data: null,
          caption: null,
        });
        break;

      case 'video':
      case 'shortvideo':
        type = 'video';
        content = '';
        attachments.push({
          id: raw.MediaId || '',
          type: 'video',
          url: null,
          filename: 'video.mp4',
          mimeType: 'video/mp4',
          size: null,
          data: null,
          caption: null,
        });
        break;

      case 'location':
        type = 'location';
        content = `Location: ${raw.Label || ''} (${raw.Location_X}, ${raw.Location_Y})`;
        break;

      case 'link':
        type = 'text';
        content = `${raw.Title || 'Link'}\n${raw.Description || ''}\n${raw.Url || ''}`;
        break;

      case 'event':
        return this.handleEvent(raw);

      default:
        return null;
    }

    // Filter by allowed users
    if (this.config.allowedUserIds && !this.config.allowedUserIds.includes(raw.FromUserName)) {
      return null;
    }

    this.health.messagesReceived++;
    this.health.lastMessageAt = new Date().toISOString();

    return {
      id: raw.MsgId || `wechat-${Date.now()}`,
      platform: 'wechat',
      direction: 'inbound',
      sessionId: `wechat:${raw.FromUserName}`,
      userId: raw.FromUserName,
      userName: null,
      channelId: raw.FromUserName,
      channelName: null,
      threadId: null,
      type,
      content,
      attachments,
      replyToId: null,
      timestamp: new Date().toISOString(),
      metadata: {
        toUserName: raw.ToUserName,
        agentId: this.config.agentId,
      },
    };
  }

  private handleEvent(raw: any): GatewayMessage | null {
    switch (raw.Event) {
      case 'subscribe':
        this.emit('user_subscribed', { userId: raw.FromUserName });
        return {
          id: `event-${Date.now()}`, platform: 'wechat', direction: 'inbound',
          sessionId: `wechat:${raw.FromUserName}`, userId: raw.FromUserName,
          userName: null, channelId: raw.FromUserName, channelName: null,
          threadId: null, type: 'text', content: '[User subscribed]',
          attachments: [], replyToId: null, timestamp: new Date().toISOString(), metadata: {},
        };
      case 'unsubscribe':
        this.emit('user_unsubscribed', { userId: raw.FromUserName });
        return null;
      case 'enter_agent':
        this.emit('user_entered', { userId: raw.FromUserName });
        return null;
      case 'click':
        // Menu click
        return {
          id: `event-${Date.now()}`, platform: 'wechat', direction: 'inbound',
          sessionId: `wechat:${raw.FromUserName}`, userId: raw.FromUserName,
          userName: null, channelId: raw.FromUserName, channelName: null,
          threadId: null, type: 'text', content: raw.EventKey || '',
          attachments: [], replyToId: null, timestamp: new Date().toISOString(),
          metadata: { event: 'menu_click' },
        };
      default:
        return null;
    }
  }

  // ── Sending Messages ──────────────────────────────

  async sendMessage(message: GatewayMessage): Promise<boolean> {
    try {
      const userId = message.channelId;

      if (message.type === 'image' && message.attachments.length > 0 && message.attachments[0].id) {
        return await this.sendImageMessage(userId, message.attachments[0].id);
      }

      // Default to text
      return await this.sendText(userId, message.content);
    } catch (err: any) {
      this.health.errors++;
      this.emit('send_error', { error: err.message });
      return false;
    }
  }

  async sendText(userId: string, text: string): Promise<boolean> {
    const token = await this.getAccessToken();
    try {
      const result = await fetch(
        `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            touser: userId,
            msgtype: 'text',
            agentid: parseInt(this.config.agentId),
            text: { content: text },
          }),
        }
      );
      const data = await result.json() as any;
      if (data.errcode !== 0) {
        this.health.errors++;
        this.emit('error', { error: `WeChat API error ${data.errcode}: ${data.errmsg}` });
        return false;
      }
      this.health.messagesSent++;
      return true;
    } catch (err: any) {
      this.health.errors++;
      return false;
    }
  }

  async sendRichContent(sessionId: string, content: RichContent): Promise<boolean> {
    const userId = sessionId.replace('wechat:', '');

    // Use markdown if available, otherwise plain text
    let text = '';
    if (content.title) text += `**${content.title}**\n\n`;
    if (content.description) text += `${content.description}\n`;
    if (content.fields) {
      for (const f of content.fields) {
        text += `> **${f.name}:** ${f.value}\n`;
      }
    }
    if (content.code) {
      text += `\n\`\`\`\n${content.code}\n\`\`\``;
    }
    if (content.footer) {
      text += `\n_${content.footer}_`;
    }

    // Try sending as markdown first (if supported)
    try {
      const token = await this.getAccessToken();
      const result = await fetch(
        `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            touser: userId,
            msgtype: 'markdown',
            agentid: parseInt(this.config.agentId),
            markdown: { content: text },
          }),
        }
      );
      const data = await result.json() as any;
      if (data.errcode === 0) {
        this.health.messagesSent++;
        return true;
      }
    } catch { /* fall through to text */ }

    // Fallback to text
    return this.sendText(userId, text);
  }

  async sendApprovalButtons(sessionId: string, prompt: string, options: ApprovalOption[]): Promise<string | null> {
    const userId = sessionId.replace('wechat:', '');
    // WeChat Work doesn't have native inline buttons; use text with numbered options
    let text = `${prompt}\n\n`;
    options.forEach((opt, i) => {
      text += `${i + 1}. ${opt.label}\n`;
    });
    text += '\nReply with the number of your choice.';

    const sent = await this.sendText(userId, text);
    return sent ? 'sent' : null;
  }

  // ── Specialized Message Types ─────────────────────

  private async sendImageMessage(userId: string, mediaId: string): Promise<boolean> {
    const token = await this.getAccessToken();
    try {
      const result = await fetch(
        `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            touser: userId,
            msgtype: 'image',
            agentid: parseInt(this.config.agentId),
            image: { media_id: mediaId },
          }),
        }
      );
      const data = await result.json() as any;
      if (data.errcode !== 0) { this.health.errors++; return false; }
      this.health.messagesSent++;
      return true;
    } catch {
      this.health.errors++;
      return false;
    }
  }

  async sendNewsMessage(userId: string, articles: Array<{ title: string; description: string; url: string; picUrl?: string }>): Promise<boolean> {
    const token = await this.getAccessToken();
    try {
      const result = await fetch(
        `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            touser: userId,
            msgtype: 'news',
            agentid: parseInt(this.config.agentId),
            news: { articles },
          }),
        }
      );
      const data = await result.json() as any;
      if (data.errcode !== 0) { this.health.errors++; return false; }
      this.health.messagesSent++;
      return true;
    } catch {
      this.health.errors++;
      return false;
    }
  }

  async sendToGroup(chatId: string, text: string): Promise<boolean> {
    const token = await this.getAccessToken();
    try {
      const result = await fetch(
        `https://qyapi.weixin.qq.com/cgi-bin/appchat/send?access_token=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatid: chatId,
            msgtype: 'text',
            text: { content: text },
            safe: 0,
          }),
        }
      );
      const data = await result.json() as any;
      if (data.errcode !== 0) { this.health.errors++; return false; }
      this.health.messagesSent++;
      return true;
    } catch {
      this.health.errors++;
      return false;
    }
  }

  // ── Media Upload ──────────────────────────────────

  async uploadMedia(type: 'image' | 'voice' | 'video' | 'file', data: Buffer, filename: string): Promise<string | null> {
    const token = await this.getAccessToken();
    const formData = new FormData();
    formData.append('media', new Blob([data]), filename);

    try {
      const result = await fetch(
        `https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${token}&type=${type}`,
        { method: 'POST', body: formData }
      );
      const json = await result.json() as any;
      if (json.errcode) { this.health.errors++; return null; }
      return json.media_id || null;
    } catch {
      this.health.errors++;
      return null;
    }
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
    const result = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.config.corpId}&corpsecret=${this.config.corpSecret}`
    );
    const data = await result.json() as any;

    if (!data.access_token) {
      throw new Error(`WeChat token refresh failed: ${data.errmsg || 'unknown error'}`);
    }

    this.tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 300) * 1000, // Refresh 5 min early
    };
  }

  // ── Health ────────────────────────────────────────

  getHealth(): AdapterHealth { return { ...this.health }; }
}
