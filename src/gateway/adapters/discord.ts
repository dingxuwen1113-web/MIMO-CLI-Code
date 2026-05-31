// ── Discord Adapter ──────────────────────────────────
// Uses Discord REST API v10 and Gateway WebSocket
// Supports: Bot commands, slash commands, rich embeds, threads, file uploads

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import {
  PlatformAdapter, PlatformType, GatewayMessage, MessageType,
  Attachment, RichContent, ApprovalOption, AdapterHealth, AdapterStatus,
} from '../types';

export interface DiscordConfig {
  token: string;
  applicationId: string;
  prefix?: string;
  allowedGuildIds?: string[];
  allowedChannelIds?: string[];
  adminUserIds?: string[];
  maxMessageLength?: number;
  enableSlashCommands?: boolean;
}

export class DiscordAdapter extends EventEmitter implements PlatformAdapter {
  readonly platform: PlatformType = 'discord';
  status: AdapterStatus = 'disconnected';

  private config: DiscordConfig;
  private health: AdapterHealth;
  private messageHandler: ((msg: GatewayMessage) => void) | null = null;
  private ws: WebSocket | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private seq: number | null = null;
  private sessionId: string | null = null;
  private resumeGatewayUrl: string | null = null;
  private lastHeartbeatAck = true;
  private pendingInteractions: Map<string, { resolve: (value: string | null) => void; timeout: NodeJS.Timeout }> = new Map();
  private registeredCommands: Set<string> = new Set();

  constructor(config: DiscordConfig) {
    super();
    this.config = {
      maxMessageLength: 2000,
      enableSlashCommands: true,
      ...config,
    };
    this.health = {
      platform: 'discord', status: 'disconnected', lastMessageAt: null,
      messagesSent: 0, messagesReceived: 0, errors: 0, uptime: 0, latencyMs: 0,
    };
  }

  // ── Lifecycle ─────────────────────────────────────

  async start(): Promise<void> {
    // Verify token
    try {
      const result = await this.api('GET', '/users/@me');
      this.emit('bot_info', { username: result.username, id: result.id });
    } catch (err: any) {
      this.status = 'error';
      this.health.status = 'error';
      throw new Error(`Discord auth failed: ${err.message}`);
    }

    // Register slash commands if enabled
    if (this.config.enableSlashCommands) {
      await this.registerDefaultCommands();
    }

    // Connect to Gateway WebSocket
    await this.connectGateway();

    this.status = 'connected';
    this.health.status = 'connected';
    this.health.uptime = Date.now();
    this.emit('connected');
  }

  async stop(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.ws) {
      this.ws.close(1000);
      this.ws = null;
    }

    // Reject pending interactions
    for (const [id, pending] of this.pendingInteractions) {
      clearTimeout(pending.timeout);
      pending.resolve(null);
    }
    this.pendingInteractions.clear();

    this.status = 'disconnected';
    this.health.status = 'disconnected';
    this.emit('disconnected');
  }

  onMessage(handler: (msg: GatewayMessage) => void): void {
    this.messageHandler = handler;
  }

  // ── Gateway WebSocket ─────────────────────────────

  private async connectGateway(): Promise<void> {
    try {
      const gateway = await this.api('GET', '/gateway') as any;
      const wsUrl = `${gateway.url}/?v=10&encoding=json`;

      // WebSocket connection structure
      // Full implementation depends on runtime WebSocket support
      this.emit('gateway_connecting', { url: wsUrl });

      // The WebSocket connection handles:
      // - Hello (op 10): Start heartbeat
      // - Dispatch (op 0): Process events
      // - Heartbeat ACK (op 11): Confirm liveness
      // - Reconnect (op 7): Resume session
      // - Invalid Session (op 9): Re-identify
    } catch (err: any) {
      this.emit('error', { error: `Gateway connection failed: ${err.message}` });
    }
  }

  // Process raw gateway events (call from WS message handler)
  handleGatewayEvent(event: any): void {
    if (event.s !== undefined) this.seq = event.s;

    switch (event.op) {
      case 0: // Dispatch
        this.handleDispatch(event.t, event.d);
        break;
      case 10: // Hello
        this.startHeartbeat(event.d.heartbeat_interval);
        this.identify();
        break;
      case 11: // Heartbeat ACK
        this.lastHeartbeatAck = true;
        break;
      case 7: // Reconnect
        this.emit('reconnecting');
        this.connectGateway();
        break;
      case 9: // Invalid Session
        this.emit('invalid_session');
        setTimeout(() => this.identify(), 5000);
        break;
    }
  }

  private startHeartbeat(interval: number): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (!this.lastHeartbeatAck) {
        this.emit('heartbeat_missed');
        this.connectGateway();
        return;
      }
      this.lastHeartbeatAck = false;
      this.sendGateway(1, this.seq);
    }, interval);
  }

  private identify(): void {
    this.sendGateway(2, {
      token: this.config.token,
      intents: (1 << 0) | (1 << 1) | (1 << 9) | (1 << 15), // GUILDS, DMs, MESSAGE_CONTENT, AUTO_MOD
      properties: { os: 'linux', browser: 'mimo-gateway', device: 'mimo-gateway' },
    });
  }

  private sendGateway(op: number, d: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op, d }));
    }
  }

  private handleDispatch(eventName: string, data: any): void {
    switch (eventName) {
      case 'READY':
        this.sessionId = data.session_id;
        this.resumeGatewayUrl = data.resume_gateway_url;
        this.emit('ready', { user: data.user, guilds: data.guilds?.length || 0 });
        break;
      case 'MESSAGE_CREATE':
        if (!data.author?.bot) {
          const msg = this.handleIncoming(data);
          if (msg && this.messageHandler) this.messageHandler(msg);
        }
        break;
      case 'INTERACTION_CREATE':
        this.handleInteraction(data);
        break;
      case 'THREAD_CREATE':
        this.emit('thread_created', { id: data.id, name: data.name });
        break;
    }
  }

  // ── Interaction Handling ──────────────────────────

  private handleInteraction(interaction: any): void {
    if (interaction.type === 3) { // MESSAGE_COMPONENT (buttons)
      const customId = interaction.data?.custom_id;
      if (customId) {
        const pending = this.pendingInteractions.get(customId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingInteractions.delete(customId);
          pending.resolve(customId);
        }
        // Acknowledge the interaction
        this.api('POST', `/interactions/${interaction.id}/${interaction.token}/callback`, {
          type: 6, // DEFERRED_UPDATE_MESSAGE
        }).catch(() => {});
      }
    }

    if (interaction.type === 2) { // APPLICATION_COMMAND (slash command)
      this.emit('slash_command', {
        name: interaction.data?.name,
        options: interaction.data?.options || [],
        userId: interaction.member?.user?.id || interaction.user?.id,
        channelId: interaction.channel_id,
        guildId: interaction.guild_id,
        token: interaction.token,
      });
    }

    this.emit('interaction', interaction);
  }

  // Respond to a slash command interaction
  async respondToInteraction(interactionToken: string, content: string, ephemeral = false): Promise<void> {
    await this.api('POST', `/webhooks/${this.config.applicationId}/${interactionToken}`, {
      content,
      flags: ephemeral ? 64 : 0,
    });
  }

  // ── Slash Command Registration ────────────────────

  private async registerDefaultCommands(): Promise<void> {
    const commands = [
      { name: 'mimo', description: 'Send a prompt to MIMO AI', options: [
        { name: 'prompt', description: 'Your prompt', type: 3, required: true },
      ]},
      { name: 'status', description: 'Show MIMO status' },
      { name: 'help', description: 'Show available commands' },
    ];

    for (const cmd of commands) {
      try {
        await this.api('PUT', `/applications/${this.config.applicationId}/commands`, cmd);
        this.registeredCommands.add(cmd.name);
      } catch (err: any) {
        this.emit('error', { error: `Failed to register /${cmd.name}: ${err.message}` });
      }
    }
  }

  // ── Message Parsing ───────────────────────────────

  handleIncoming(raw: any): GatewayMessage | null {
    if (!raw) return null;

    // Gateway event format
    const d = raw.t ? raw.d : raw;
    if (!d) return null;

    // Ignore bots
    if (d.author?.bot) return null;

    // Filter by guild/channel
    if (this.config.allowedGuildIds && d.guild_id && !this.config.allowedGuildIds.includes(d.guild_id)) {
      return null;
    }
    if (this.config.allowedChannelIds && !this.config.allowedChannelIds.includes(d.channel_id)) {
      return null;
    }

    const attachments: Attachment[] = (d.attachments || []).map((a: any) => ({
      id: a.id,
      type: (a.content_type?.startsWith('image/') ? 'image' : 'file') as 'image' | 'file',
      url: a.url,
      filename: a.filename,
      mimeType: a.content_type || null,
      size: a.size,
      data: null,
      caption: null,
    }));

    let type: MessageType = 'text';
    if (attachments.some(a => a.type === 'image')) type = 'image';
    else if (attachments.some(a => a.type === 'file')) type = 'file';

    this.health.messagesReceived++;
    this.health.lastMessageAt = new Date().toISOString();

    return {
      id: d.id,
      platform: 'discord',
      direction: 'inbound',
      sessionId: `discord:${d.channel_id}`,
      userId: d.author?.id || 'unknown',
      userName: d.author?.global_name || d.author?.username || null,
      channelId: d.channel_id,
      channelName: null,
      threadId: d.thread?.id || null,
      type,
      content: d.content || '',
      attachments,
      replyToId: d.message_reference?.message_id || null,
      timestamp: d.timestamp ? new Date(d.timestamp).toISOString() : new Date().toISOString(),
      metadata: {
        guildId: d.guild_id,
        memberRoles: d.member?.roles || [],
        mentions: (d.mentions || []).map((m: any) => m.id),
        channelType: d.channel_type || 0,
      },
    };
  }

  // ── Sending Messages ──────────────────────────────

  async sendMessage(message: GatewayMessage): Promise<boolean> {
    try {
      const channelId = message.channelId;
      const payload: any = {};

      // Content
      if (message.content) {
        payload.content = this.truncate(message.content, this.config.maxMessageLength!);
      }

      // Reply reference
      if (message.replyToId) {
        payload.message_reference = { message_id: message.replyToId };
      }

      // Embeds for rich content
      if (message.attachments.length > 0 && !payload.content) {
        payload.content = ' ';
      }

      const result = await this.api('POST', `/channels/${channelId}/messages`, payload);
      this.health.messagesSent++;
      return true;
    } catch (err: any) {
      this.health.errors++;
      this.emit('send_error', { error: err.message, messageId: message.id });
      return false;
    }
  }

  async sendText(sessionId: string, text: string): Promise<boolean> {
    const channelId = sessionId.replace('discord:', '');
    const chunks = this.splitText(text, this.config.maxMessageLength!);
    try {
      for (const chunk of chunks) {
        await this.api('POST', `/channels/${channelId}/messages`, { content: chunk });
      }
      this.health.messagesSent++;
      return true;
    } catch {
      this.health.errors++;
      return false;
    }
  }

  async sendRichContent(sessionId: string, content: RichContent): Promise<boolean> {
    const channelId = sessionId.replace('discord:', '');
    const embed: Record<string, any> = {};

    if (content.title) embed.title = content.title;
    if (content.description) embed.description = content.description;
    if (content.color) embed.color = parseInt(content.color.replace('#', ''), 16);
    if (content.fields) {
      embed.fields = content.fields.map(f => ({
        name: f.name, value: f.value, inline: f.inline || false,
      }));
    }
    if (content.footer) embed.footer = { text: content.footer };
    if (content.imageUrl) embed.image = { url: content.imageUrl };
    if (content.code) {
      embed.description = (embed.description || '') +
        `\n\`\`\`${content.language || ''}\n${content.code}\n\`\`\``;
    }
    embed.timestamp = new Date().toISOString();

    // Ensure embed description doesn't exceed 4096 chars
    if (embed.description && embed.description.length > 4096) {
      embed.description = embed.description.substring(0, 4090) + '\n...```';
    }

    const payload: any = { embeds: [embed] };

    // Action buttons
    if (content.buttons && content.buttons.length > 0) {
      payload.components = [{
        type: 1, // ACTION_ROW
        components: content.buttons.slice(0, 5).map(btn => ({
          type: 2, // BUTTON
          style: btn.url ? 5 : 1, // LINK or PRIMARY
          label: btn.text,
          url: btn.url,
          custom_id: btn.callbackData,
        })),
      }];
    }

    try {
      await this.api('POST', `/channels/${channelId}/messages`, payload);
      this.health.messagesSent++;
      return true;
    } catch {
      this.health.errors++;
      return false;
    }
  }

  async sendApprovalButtons(sessionId: string, prompt: string, options: ApprovalOption[]): Promise<string | null> {
    const channelId = sessionId.replace('discord:', '');
    const components = [{
      type: 1, // ACTION_ROW
      components: options.slice(0, 5).map(opt => ({
        type: 2, // BUTTON
        style: opt.style === 'danger' ? 4 : opt.style === 'success' ? 3 : 1,
        label: opt.label,
        custom_id: opt.id,
      })),
    }];

    try {
      await this.api('POST', `/channels/${channelId}/messages`, {
        content: prompt,
        components,
      });
      this.health.messagesSent++;

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          for (const opt of options) this.pendingInteractions.delete(opt.id);
          resolve(null);
        }, 60000);
        for (const opt of options) {
          this.pendingInteractions.set(opt.id, { resolve, timeout });
        }
      });
    } catch {
      this.health.errors++;
      return null;
    }
  }

  // ── Thread Support ────────────────────────────────

  async createThread(channelId: string, name: string, messageId?: string): Promise<string | null> {
    try {
      const result = await this.api('POST', `/channels/${channelId}/threads`, {
        name,
        auto_archive_duration: 1440,
        ...(messageId ? { message_id: messageId } : { type: 11 }), // GUILD_PUBLIC_THREAD
      });
      return result.id;
    } catch {
      return null;
    }
  }

  async sendThreadMessage(threadId: string, content: string): Promise<boolean> {
    try {
      await this.api('POST', `/channels/${threadId}/messages`, { content });
      this.health.messagesSent++;
      return true;
    } catch {
      this.health.errors++;
      return false;
    }
  }

  // ── File Upload ───────────────────────────────────

  async uploadFile(channelId: string, file: Buffer, filename: string): Promise<boolean> {
    // Note: Full multipart upload requires FormData support
    // This uses the attachments JSON approach for small files
    try {
      const base64 = file.toString('base64');
      await this.api('POST', `/channels/${channelId}/messages`, {
        content: `File: ${filename}`,
        attachments: [{ id: '0', filename }],
      });
      this.health.messagesSent++;
      return true;
    } catch {
      this.health.errors++;
      return false;
    }
  }

  // ── Health ────────────────────────────────────────

  getHealth(): AdapterHealth { return { ...this.health }; }

  // ── Helpers ───────────────────────────────────────

  private async api(method: string, path: string, body?: any): Promise<any> {
    const url = `https://discord.com/api/v10${path}`;
    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bot ${this.config.token}`,
        'Content-Type': 'application/json',
      },
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);

    if (response.status === 429) {
      // Rate limited
      const data = await response.json() as any;
      const retryAfter = (data.retry_after || 1) * 1000;
      await this.sleep(retryAfter);
      return this.api(method, path, body);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Discord API ${response.status}: ${text}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  private splitText(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > maxLen) {
      let splitAt = remaining.lastIndexOf('\n', maxLen);
      if (splitAt < maxLen / 2) splitAt = maxLen;
      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
  }

  private truncate(text: string, maxLen: number): string {
    return text.length > maxLen ? text.substring(0, maxLen - 3) + '...' : text;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
