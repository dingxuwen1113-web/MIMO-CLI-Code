// ── Gateway Types ────────────────────────────────────

export type PlatformType = 'telegram' | 'discord' | 'slack' | 'wechat' | 'feishu' | 'dingtalk' | 'webhook' | 'custom';

export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'video' | 'location' | 'sticker' | 'interactive';

export type MessageDirection = 'inbound' | 'outbound';

export type AdapterStatus = 'connected' | 'disconnected' | 'error' | 'reconnecting';

export interface GatewayMessage {
  id: string;
  platform: PlatformType;
  direction: MessageDirection;
  sessionId: string;
  userId: string;
  userName: string | null;
  channelId: string;
  channelName: string | null;
  threadId: string | null;
  type: MessageType;
  content: string;
  attachments: Attachment[];
  replyToId: string | null;
  timestamp: string;
  metadata: Record<string, any>;
}

export interface Attachment {
  id: string;
  type: 'image' | 'file' | 'audio' | 'video';
  url: string | null;
  filename: string | null;
  mimeType: string | null;
  size: number | null;
  data: Buffer | null;
  caption: string | null;
}

export interface PlatformAdapter {
  readonly platform: PlatformType;
  status: AdapterStatus;

  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(message: GatewayMessage): Promise<boolean>;
  sendText(sessionId: string, text: string): Promise<boolean>;
  sendRichContent(sessionId: string, content: RichContent): Promise<boolean>;
  sendApprovalButtons(sessionId: string, prompt: string, options: ApprovalOption[]): Promise<string | null>;
  handleIncoming(rawMessage: any): GatewayMessage | null;
  getHealth(): AdapterHealth;
}

export interface RichContent {
  title?: string;
  description?: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  code?: string;
  language?: string;
  imageUrl?: string;
  footer?: string;
  color?: string;
  buttons?: Array<{ text: string; url?: string; callbackData?: string }>;
}

export interface ApprovalOption {
  id: string;
  label: string;
  style?: 'primary' | 'danger' | 'success';
}

export interface AdapterHealth {
  platform: PlatformType;
  status: AdapterStatus;
  lastMessageAt: string | null;
  messagesSent: number;
  messagesReceived: number;
  errors: number;
  uptime: number;
  latencyMs: number;
}

export interface GatewayConfig {
  platforms: PlatformConfig[];
  rateLimiting: RateLimitConfig;
  sessionTimeout: number;
  maxMessageQueueSize: number;
  healthCheckIntervalMs: number;
  retryConfig: RetryConfig;
}

export interface PlatformConfig {
  platform: PlatformType;
  enabled: boolean;
  credentials: Record<string, string>;
  options: Record<string, any>;
}

export interface RateLimitConfig {
  enabled: boolean;
  requestsPerMinute: number;
  burstSize: number;
  perPlatform: Record<PlatformType, number>;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface GatewaySession {
  id: string;
  platform: PlatformType;
  userId: string;
  channelId: string;
  createdAt: string;
  lastActivityAt: string;
  context: Record<string, any>;
  messageHistory: GatewayMessage[];
}

export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  adapters: AdapterHealth[];
  activeSessions: number;
  queuedMessages: number;
  uptime: number;
  timestamp: string;
}

export const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  platforms: [],
  rateLimiting: {
    enabled: true,
    requestsPerMinute: 30,
    burstSize: 5,
    perPlatform: {
      telegram: 30,
      discord: 50,
      slack: 30,
      wechat: 20,
      feishu: 30,
      dingtalk: 30,
      webhook: 60,
      custom: 30,
    },
  },
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  maxMessageQueueSize: 1000,
  healthCheckIntervalMs: 30000,
  retryConfig: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  },
};
