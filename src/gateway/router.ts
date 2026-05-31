// ── Message Router ───────────────────────────────────

import * as crypto from 'crypto';
import {
  GatewayMessage, GatewaySession, PlatformType, RichContent,
  Attachment, MessageType,
} from './types';

export interface GatewayServerRef {
  getSession(sessionId: string): GatewaySession | undefined;
  updateSessionContext(sessionId: string, context: Record<string, any>): void;
  sendToSession(sessionId: string, content: string, type?: 'text' | 'image' | 'file'): Promise<boolean>;
}

export class MessageRouter {
  private server: GatewayServerRef;
  private messageTransformers: Map<PlatformType, MessageTransformer> = new Map();
  private attachmentHandlers: Map<string, AttachmentHandler> = new Map();

  constructor(server: GatewayServerRef) {
    this.server = server;
    this.initDefaultTransformers();
  }

  // ── Message Routing ───────────────────────────────

  async routeMessage(message: GatewayMessage): Promise<string | null> {
    // Transform message for the agent
    const transformed = this.transformInbound(message);

    // Get or create session context
    const session = this.server.getSession(message.sessionId);
    const context = session?.context || {};

    // Build the agent prompt with context
    const prompt = this.buildAgentPrompt(transformed, context);

    // Store context updates
    this.server.updateSessionContext(message.sessionId, {
      lastMessage: message.content,
      lastPlatform: message.platform,
      lastUserId: message.userId,
    });

    // Return the prompt for the server to process
    // The actual agent invocation happens in the server
    return prompt;
  }

  // ── Response Formatting ───────────────────────────

  formatResponse(platform: PlatformType, response: string): string | RichContent {
    const transformer = this.messageTransformers.get(platform);
    if (transformer) {
      return transformer.formatResponse(response);
    }
    return response;
  }

  // ── Attachment Handling ───────────────────────────

  registerAttachmentHandler(mimeType: string, handler: AttachmentHandler): void {
    this.attachmentHandlers.set(mimeType, handler);
  }

  async processAttachments(message: GatewayMessage): Promise<string[]> {
    const descriptions: string[] = [];

    for (const attachment of message.attachments) {
      const handler = this.attachmentHandlers.get(attachment.mimeType || '*/*');
      if (handler) {
        const description = await handler.process(attachment);
        descriptions.push(description);
      } else {
        // Default handling
        if (attachment.type === 'image') {
          descriptions.push(`[Image: ${attachment.filename || 'unknown'}]`);
        } else if (attachment.type === 'file') {
          descriptions.push(`[File: ${attachment.filename || 'unknown'} (${attachment.size || 0} bytes)]`);
        } else if (attachment.type === 'audio') {
          descriptions.push(`[Audio: ${attachment.filename || 'voice message'}]`);
        }
      }
    }

    return descriptions;
  }

  // ── Cross-Platform Session Continuity ─────────────

  linkSessions(sessionId1: string, sessionId2: string): void {
    const session1 = this.server.getSession(sessionId1);
    const session2 = this.server.getSession(sessionId2);

    if (session1 && session2) {
      const sharedContext = { ...session1.context, ...session2.context };
      sharedContext.linkedSessions = [
        ...(session1.context.linkedSessions || []),
        ...(session2.context.linkedSessions || []),
        sessionId1,
        sessionId2,
      ];
      // Deduplicate
      sharedContext.linkedSessions = [...new Set(sharedContext.linkedSessions)];

      this.server.updateSessionContext(sessionId1, sharedContext);
      this.server.updateSessionContext(sessionId2, sharedContext);
    }
  }

  // ── Transformers ──────────────────────────────────

  private initDefaultTransformers(): void {
    this.messageTransformers.set('telegram', {
      formatResponse: (response: string) => {
        // Telegram supports Markdown
        return this.truncateResponse(response, 4096);
      },
    });

    this.messageTransformers.set('discord', {
      formatResponse: (response: string) => {
        // Discord: 2000 char limit, use code blocks
        return this.truncateResponse(response, 2000);
      },
    });

    this.messageTransformers.set('slack', {
      formatResponse: (response: string) => {
        // Slack supports mrkdwn
        return this.truncateResponse(response, 40000);
      },
    });

    this.messageTransformers.set('wechat', {
      formatResponse: (response: string) => {
        // WeChat: plain text, 2048 char limit
        return this.truncateResponse(response, 2048);
      },
    });

    this.messageTransformers.set('feishu', {
      formatResponse: (response: string) => {
        return this.truncateResponse(response, 4096);
      },
    });

    this.messageTransformers.set('dingtalk', {
      formatResponse: (response: string) => {
        return this.truncateResponse(response, 4096);
      },
    });

    this.messageTransformers.set('webhook', {
      formatResponse: (response: string) => response,
    });
  }

  private transformInbound(message: GatewayMessage): GatewayMessage {
    const transformer = this.messageTransformers.get(message.platform);

    // Apply any platform-specific transformations
    const transformed = { ...message };

    // Clean up content based on platform
    if (message.platform === 'telegram') {
      // Remove bot mention prefix
      transformed.content = transformed.content.replace(/^\/\w+(@\w+)?\s*/, '');
    }

    if (message.platform === 'discord') {
      // Remove bot mention
      transformed.content = transformed.content.replace(/<@!?\d+>/g, '').trim();
    }

    return transformed;
  }

  private buildAgentPrompt(message: GatewayMessage, context: Record<string, any>): string {
    const parts: string[] = [];

    parts.push(`[Message from ${message.platform}]`);
    parts.push(`User: ${message.userName || message.userId}`);
    parts.push(`Channel: ${message.channelName || message.channelId}`);

    if (message.threadId) {
      parts.push(`Thread: ${message.threadId}`);
    }

    parts.push('');
    parts.push(message.content);

    // Add attachment descriptions
    if (message.attachments.length > 0) {
      parts.push('');
      parts.push('Attachments:');
      for (const att of message.attachments) {
        parts.push(`- [${att.type}] ${att.filename || att.url || 'unknown'}`);
        if (att.caption) parts.push(`  Caption: ${att.caption}`);
      }
    }

    return parts.join('\n');
  }

  private truncateResponse(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 20) + '\n\n[truncated...]';
  }
}

// ── Supporting Interfaces ────────────────────────────

interface MessageTransformer {
  formatResponse(response: string): string | RichContent;
}

export interface AttachmentHandler {
  process(attachment: Attachment): Promise<string>;
}
