// ── Telegram Adapter ─────────────────────────────────
// Uses Telegram Bot API: https://api.telegram.org/bot{token}/
// Supports long polling and webhook modes

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import {
  PlatformAdapter, PlatformType, GatewayMessage, MessageType,
  Attachment, RichContent, ApprovalOption, AdapterHealth, AdapterStatus,
} from '../types';

export interface TelegramConfig {
  token: string;
  mode: 'polling' | 'webhook';
  webhookUrl?: string;
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  allowedChatIds?: number[];
  adminChatIds?: number[];
  pollingTimeout?: number;
  maxConnections?: number;
}

export class TelegramAdapter extends EventEmitter implements PlatformAdapter {
  readonly platform: PlatformType = 'telegram';
  status: AdapterStatus = 'disconnected';

  private config: TelegramConfig;
  private baseUrl: string;
  private offset = 0;
  private polling = false;
  private messageHandler: ((msg: GatewayMessage) => void) | null = null;
  private health: AdapterHealth;
  private pendingCallbacks: Map<string, { resolve: (value: string | null) => void; timeout: NodeJS.Timeout }> = new Map();
  private retryCount = 0;
  private maxRetries = 5;
  private baseRetryDelay = 1000;

  constructor(config: TelegramConfig) {
    super();
    this.config = config;
    this.baseUrl = `https://api.telegram.org/bot${config.token}`;
    this.health = {
      platform: 'telegram', status: 'disconnected', lastMessageAt: null,
      messagesSent: 0, messagesReceived: 0, errors: 0, uptime: 0, latencyMs: 0,
    };
  }

  // ── Lifecycle ─────────────────────────────────────

  async start(): Promise<void> {
    try {
      const me = await this.api('getMe');
      if (!me.ok) throw new Error(`Telegram auth failed: ${me.description}`);
      this.emit('bot_info', { username: me.result.username, id: me.result.id });
    } catch (err: any) {
      this.status = 'error';
      this.health.status = 'error';
      throw new Error(`Failed to connect to Telegram: ${err.message}`);
    }

    this.status = 'connected';
    this.health.status = 'connected';
    this.health.uptime = Date.now();
    this.retryCount = 0;

    if (this.config.mode === 'webhook' && this.config.webhookUrl) {
      await this.setupWebhook();
    } else {
      this.polling = true;
      this.poll();
    }

    this.emit('connected');
  }

  async stop(): Promise<void> {
    this.polling = false;

    if (this.config.mode === 'webhook') {
      try {
        await this.api('deleteWebhook');
      } catch { /* ignore */ }
    }

    // Reject all pending callbacks
    for (const [id, pending] of this.pendingCallbacks) {
      clearTimeout(pending.timeout);
      pending.resolve(null);
    }
    this.pendingCallbacks.clear();

    this.status = 'disconnected';
    this.health.status = 'disconnected';
    this.emit('disconnected');
  }

  onMessage(handler: (msg: GatewayMessage) => void): void {
    this.messageHandler = handler;
  }

  // ── Webhook Mode ──────────────────────────────────

  private async setupWebhook(): Promise<void> {
    const result = await this.api('setWebhook', {
      url: this.config.webhookUrl,
      max_connections: this.config.maxConnections || 40,
      allowed_updates: JSON.stringify(['message', 'callback_query', 'edited_message']),
    });
    if (!result.ok) throw new Error(`Webhook setup failed: ${result.description}`);
    this.emit('webhook_set', { url: this.config.webhookUrl });
  }

  // Call this from your HTTP server when a webhook payload arrives
  async handleWebhookPayload(payload: any): Promise<void> {
    try {
      if (payload.message) {
        this.processUpdate({ update_id: payload.update_id, message: payload.message });
      }
      if (payload.callback_query) {
        this.handleCallbackQuery(payload.callback_query);
      }
    } catch (err: any) {
      this.health.errors++;
      this.emit('error', { error: err.message, payload });
    }
  }

  // ── Long Polling Mode ─────────────────────────────

  private async poll(): Promise<void> {
    while (this.polling) {
      try {
        const startTime = Date.now();
        const updates = await this.api('getUpdates', {
          offset: this.offset,
          timeout: this.config.pollingTimeout || 30,
          allowed_updates: JSON.stringify(['message', 'callback_query', 'edited_message']),
        });
        this.health.latencyMs = Date.now() - startTime;
        this.retryCount = 0;

        if (updates.ok && Array.isArray(updates.result)) {
          for (const update of updates.result) {
            this.offset = update.update_id + 1;
            this.processUpdate(update);
          }
        }
      } catch (err: any) {
        this.health.errors++;
        this.retryCount++;

        if (this.retryCount >= this.maxRetries) {
          this.status = 'error';
          this.health.status = 'error';
          this.emit('error', { error: `Max retries reached: ${err.message}` });
          this.polling = false;
          return;
        }

        const delay = this.baseRetryDelay * Math.pow(2, this.retryCount);
        this.emit('reconnecting', { attempt: this.retryCount, delay });
        await this.sleep(Math.min(delay, 30000));
      }
    }
  }

  private processUpdate(update: any): void {
    if (update.callback_query) {
      this.handleCallbackQuery(update.callback_query);
      return;
    }
    if (update.message) {
      const msg = this.handleIncoming(update.message);
      if (msg && this.messageHandler) {
        this.messageHandler(msg);
      }
    }
    if (update.edited_message) {
      this.emit('message_edited', update.edited_message);
    }
  }

  private handleCallbackQuery(query: any): void {
    const callbackData = query.data;
    // Answer the callback query to stop the loading indicator
    this.api('answerCallbackQuery', { callback_query_id: query.id }).catch(() => {});

    const pending = this.pendingCallbacks.get(callbackData);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingCallbacks.delete(callbackData);
      pending.resolve(callbackData);
    }

    this.emit('callback_query', { data: callbackData, userId: query.from?.id });
  }

  // ── Message Parsing ───────────────────────────────

  handleIncoming(raw: any): GatewayMessage | null {
    if (!raw) return null;

    const attachments: Attachment[] = [];
    let type: MessageType = 'text';
    let content = '';

    // Text message
    if (raw.text) {
      type = 'text';
      content = raw.text;
    }
    // Photo
    else if (raw.photo) {
      type = 'image';
      content = raw.caption || '';
      const largest = raw.photo[raw.photo.length - 1];
      attachments.push({
        id: largest.file_id, type: 'image', url: null, filename: null,
        mimeType: 'image/jpeg', size: largest.file_size || null,
        data: null, caption: raw.caption || null,
      });
    }
    // Document
    else if (raw.document) {
      type = 'file';
      content = raw.caption || '';
      attachments.push({
        id: raw.document.file_id, type: 'file', url: null,
        filename: raw.document.file_name || null,
        mimeType: raw.document.mime_type || null,
        size: raw.document.file_size || null, data: null,
        caption: raw.caption || null,
      });
    }
    // Voice
    else if (raw.voice) {
      type = 'audio';
      content = '';
      attachments.push({
        id: raw.voice.file_id, type: 'audio', url: null,
        filename: 'voice.ogg', mimeType: 'audio/ogg',
        size: raw.voice.file_size || null, data: null, caption: null,
      });
    }
    // Video
    else if (raw.video) {
      type = 'video';
      content = raw.caption || '';
      attachments.push({
        id: raw.video.file_id, type: 'video', url: null,
        filename: raw.video.file_name || null,
        mimeType: raw.video.mime_type || null,
        size: raw.video.file_size || null, data: null,
        caption: raw.caption || null,
      });
    }
    // Sticker
    else if (raw.sticker) {
      type = 'sticker';
      content = raw.sticker.emoji || '[sticker]';
    }
    // Location
    else if (raw.location) {
      type = 'location';
      content = `Location: ${raw.location.latitude}, ${raw.location.longitude}`;
    }
    // Video note
    else if (raw.video_note) {
      type = 'video';
      content = '[video note]';
      attachments.push({
        id: raw.video_note.file_id, type: 'video', url: null,
        filename: 'video_note.mp4', mimeType: 'video/mp4',
        size: raw.video_note.file_size || null, data: null, caption: null,
      });
    }
    // Contact
    else if (raw.contact) {
      type = 'text';
      content = `Contact: ${raw.contact.first_name || ''} ${raw.contact.phone_number || ''}`.trim();
    }
    else {
      return null;
    }

    // Filter by allowed chat IDs
    if (this.config.allowedChatIds && !this.config.allowedChatIds.includes(raw.chat.id)) {
      return null;
    }

    this.health.messagesReceived++;
    this.health.lastMessageAt = new Date().toISOString();

    return {
      id: String(raw.message_id),
      platform: 'telegram',
      direction: 'inbound',
      sessionId: `telegram:${raw.chat.id}`,
      userId: String(raw.from?.id || 'unknown'),
      userName: [raw.from?.first_name, raw.from?.last_name].filter(Boolean).join(' ') || raw.from?.username || null,
      channelId: String(raw.chat.id),
      channelName: raw.chat.title || raw.chat.username || null,
      threadId: raw.message_thread_id ? String(raw.message_thread_id) : null,
      type,
      content,
      attachments,
      replyToId: raw.reply_to_message ? String(raw.reply_to_message.message_id) : null,
      timestamp: new Date(raw.date * 1000).toISOString(),
      metadata: {
        chatType: raw.chat.type,
        entities: raw.entities || [],
        isBot: raw.from?.is_bot || false,
      },
    };
  }

  // ── Sending Messages ──────────────────────────────

  async sendMessage(message: GatewayMessage): Promise<boolean> {
    try {
      const chatId = message.channelId;
      const replyTo = message.replyToId ? Number(message.replyToId) : undefined;

      if (message.type === 'image' && message.attachments.length > 0) {
        const att = message.attachments[0];
        if (att.url) {
          await this.api('sendPhoto', {
            chat_id: chatId, photo: att.url,
            caption: message.content || att.caption || undefined,
            reply_to_message_id: replyTo,
          });
        } else if (att.data) {
          // Upload via multipart would be needed for binary data
          await this.api('sendMessage', {
            chat_id: chatId,
            text: message.content || `[Image: ${att.filename || 'attachment'}]`,
            reply_to_message_id: replyTo,
          });
        }
      } else if (message.type === 'file' && message.attachments.length > 0) {
        const att = message.attachments[0];
        if (att.url) {
          await this.api('sendDocument', {
            chat_id: chatId, document: att.url,
            caption: message.content || att.caption || undefined,
            reply_to_message_id: replyTo,
          });
        } else {
          await this.api('sendMessage', {
            chat_id: chatId,
            text: message.content || `[File: ${att.filename || 'attachment'}]`,
            reply_to_message_id: replyTo,
          });
        }
      } else if (message.type === 'audio' && message.attachments.length > 0) {
        const att = message.attachments[0];
        if (att.url) {
          await this.api('sendVoice', {
            chat_id: chatId, voice: att.url,
            reply_to_message_id: replyTo,
          });
        } else {
          await this.api('sendMessage', {
            chat_id: chatId, text: '[Voice message]',
            reply_to_message_id: replyTo,
          });
        }
      } else {
        // Text message
        const chunks = this.splitText(message.content, 4096);
        for (const chunk of chunks) {
          await this.api('sendMessage', {
            chat_id: chatId,
            text: chunk,
            parse_mode: this.config.parseMode || 'HTML',
            reply_to_message_id: replyTo,
          });
        }
      }

      this.health.messagesSent++;
      return true;
    } catch (err: any) {
      this.health.errors++;
      this.emit('send_error', { error: err.message, messageId: message.id });
      return false;
    }
  }

  async sendText(sessionId: string, text: string): Promise<boolean> {
    const chatId = sessionId.replace('telegram:', '');
    const chunks = this.splitText(text, 4096);
    try {
      for (const chunk of chunks) {
        const result = await this.api('sendMessage', {
          chat_id: chatId,
          text: chunk,
          parse_mode: this.config.parseMode || 'HTML',
        });
        if (!result.ok) { this.health.errors++; return false; }
      }
      this.health.messagesSent++;
      return true;
    } catch {
      this.health.errors++;
      return false;
    }
  }

  async sendRichContent(sessionId: string, content: RichContent): Promise<boolean> {
    let text = '';
    if (content.title) text += `<b>${this.escapeHtml(content.title)}</b>\n\n`;
    if (content.description) text += `${this.escapeHtml(content.description)}\n`;
    if (content.fields) {
      for (const f of content.fields) {
        text += `<b>${this.escapeHtml(f.name)}:</b> ${this.escapeHtml(f.value)}\n`;
      }
    }
    if (content.code) {
      text += `\n<pre>${this.escapeHtml(content.code)}</pre>`;
    }
    if (content.footer) {
      text += `\n<i>${this.escapeHtml(content.footer)}</i>`;
    }

    const chatId = sessionId.replace('telegram:', '');
    const keyboard = content.buttons ? {
      inline_keyboard: [content.buttons.map(btn => ({
        text: btn.text,
        url: btn.url,
        callback_data: btn.callbackData,
      }))],
    } : undefined;

    try {
      await this.api('sendMessage', {
        chat_id: chatId,
        text: text || ' ',
        parse_mode: 'HTML',
        reply_markup: keyboard ? JSON.stringify(keyboard) : undefined,
      });
      this.health.messagesSent++;
      return true;
    } catch {
      this.health.errors++;
      return false;
    }
  }

  async sendApprovalButtons(sessionId: string, prompt: string, options: ApprovalOption[]): Promise<string | null> {
    const chatId = sessionId.replace('telegram:', '');
    const keyboard = {
      inline_keyboard: [options.map(o => ({
        text: o.label,
        callback_data: o.id,
      }))],
    };

    try {
      await this.api('sendMessage', {
        chat_id: chatId,
        text: prompt,
        reply_markup: JSON.stringify(keyboard),
      });
      this.health.messagesSent++;

      // Wait for callback response with timeout
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          for (const opt of options) {
            this.pendingCallbacks.delete(opt.id);
          }
          resolve(null);
        }, 60000);

        for (const opt of options) {
          this.pendingCallbacks.set(opt.id, { resolve, timeout });
        }
      });
    } catch {
      this.health.errors++;
      return null;
    }
  }

  // ── File URL Resolution ───────────────────────────

  async getFileUrl(fileId: string): Promise<string | null> {
    try {
      const result = await this.api('getFile', { file_id: fileId });
      if (result.ok && result.result?.file_path) {
        return `https://api.telegram.org/file/bot${this.config.token}/${result.result.file_path}`;
      }
    } catch { /* ignore */ }
    return null;
  }

  // ── Health ────────────────────────────────────────

  getHealth(): AdapterHealth { return { ...this.health }; }

  // ── Helpers ───────────────────────────────────────

  private async api(method: string, params?: Record<string, any>): Promise<any> {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: params ? JSON.stringify(params) : undefined,
    });
    return response.json();
  }

  private splitText(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > maxLen) {
      let splitAt = remaining.lastIndexOf('\n', maxLen);
      if (splitAt < maxLen / 2) splitAt = maxLen;
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt);
    }
    if (remaining) chunks.push(remaining);
    return chunks;
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
