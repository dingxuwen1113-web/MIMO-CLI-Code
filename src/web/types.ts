// ── Web Dashboard Types ──────────────────────────────────────────────────────
// Type definitions for the MIMO CLI Code Web Dashboard system

import type { MimoConfig } from '../config/schema';
import type { StreamEvent } from '../providers/types';

// ═══════════════════════════════════════════════════════════════════════════════
// Dashboard Configuration
// ═══════════════════════════════════════════════════════════════════════════════

export interface DashboardConfig {
  /** Port to listen on (default: 3000) */
  port: number;
  /** Host to bind to (default: '0.0.0.0') */
  host: string;
  /** Path to static files (React build output) */
  staticPath: string;
  /** Enable CORS (default: true) */
  cors: boolean;
  /** Allowed CORS origins (default: '*') */
  corsOrigins: string[];
  /** Authentication token for API access */
  authToken: string | null;
  /** Enable WebSocket (default: true) */
  websocket: boolean;
  /** Maximum number of concurrent sessions */
  maxSessions: number;
  /** Session idle timeout in milliseconds (default: 1800000 = 30min) */
  sessionTimeout: number;
  /** Message queue max size per disconnected client */
  maxQueueSize: number;
  /** Heartbeat interval in milliseconds (default: 30000) */
  heartbeatInterval: number;
  /** Enable request logging (default: true) */
  requestLogging: boolean;
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  port: 3000,
  host: '0.0.0.0',
  staticPath: './web/build',
  cors: true,
  corsOrigins: ['*'],
  authToken: null,
  websocket: true,
  maxSessions: 50,
  sessionTimeout: 30 * 60 * 1000,
  maxQueueSize: 200,
  heartbeatInterval: 30_000,
  requestLogging: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Session Types
// ═══════════════════════════════════════════════════════════════════════════════

export type SessionStatus = 'active' | 'idle' | 'completed' | 'error';

export interface SessionInfo {
  /** Unique session identifier */
  id: string;
  /** Current session status */
  status: SessionStatus;
  /** ISO timestamp when session was created */
  createdAt: string;
  /** ISO timestamp of last activity */
  lastActivityAt: string;
  /** Number of messages in this session */
  messageCount: number;
  /** Model used for this session */
  model: string;
  /** Agent mode (plan, agent, yolo) */
  mode: string;
  /** Associated project directory */
  projectDir: string;
  /** Files modified during this session */
  filesModified: string[];
  /** Total tokens consumed */
  totalTokens: { input: number; output: number };
  /** Optional label for the session */
  label?: string;
}

export interface SessionDetail extends SessionInfo {
  /** Full message history */
  messages: ChatMessage[];
  /** Conversation metadata */
  metadata: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Chat Message Types
// ═══════════════════════════════════════════════════════════════════════════════

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'pending' | 'streaming' | 'complete' | 'error';

export interface ChatMessage {
  /** Unique message identifier */
  id: string;
  /** Session this message belongs to */
  sessionId: string;
  /** Role of the message sender */
  role: MessageRole;
  /** Text content */
  content: string;
  /** ISO timestamp */
  timestamp: string;
  /** Message delivery/status */
  status: MessageStatus;
  /** Tool calls made during this message */
  toolCalls?: ToolCallInfo[];
  /** Token usage for this message */
  usage?: MessageUsage;
  /** Error info if status is 'error' */
  error?: string;
  /** Model that generated this message */
  model?: string;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  input: string;
  output: string;
  isError: boolean;
  durationMs: number;
}

export interface MessageUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreation?: number;
  cacheRead?: number;
  totalCost?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WebSocket Event Types
// ═══════════════════════════════════════════════════════════════════════════════

export type WSEventType =
  | 'chat.message'
  | 'chat.stream.start'
  | 'chat.stream.text'
  | 'chat.stream.tool_use'
  | 'chat.stream.thinking'
  | 'chat.stream.end'
  | 'chat.stream.error'
  | 'session.created'
  | 'session.deleted'
  | 'session.status'
  | 'system.status'
  | 'system.config.updated'
  | 'error'
  | 'pong'
  | 'reconnect';

export interface WebSocketEvent {
  /** Event type identifier */
  type: WSEventType;
  /** ISO timestamp of the event */
  timestamp: string;
  /** Associated session ID (if applicable) */
  sessionId?: string;
  /** Event payload */
  payload: WebSocketPayload;
}

export type WebSocketPayload =
  | ChatMessagePayload
  | StreamTextPayload
  | StreamToolPayload
  | StreamThinkingPayload
  | StreamEndPayload
  | StreamErrorPayload
  | SessionEventPayload
  | SystemStatusPayload
  | ConfigUpdatedPayload
  | ErrorPayload
  | PongPayload
  | ReconnectPayload;

export interface ChatMessagePayload {
  message: ChatMessage;
}

export interface StreamTextPayload {
  text: string;
  /** Accumulated text so far */
  accumulated: string;
}

export interface StreamToolPayload {
  tool: {
    id: string;
    name: string;
    input: string;
  };
}

export interface StreamThinkingPayload {
  thinking: string;
}

export interface StreamEndPayload {
  messageId: string;
  usage: MessageUsage;
  /** Full assembled response text */
  fullText: string;
}

export interface StreamErrorPayload {
  error: string;
  code?: string;
  recoverable: boolean;
}

export interface SessionEventPayload {
  session: SessionInfo;
}

export interface SystemStatusPayload {
  uptime: number;
  activeSessions: number;
  totalMessages: number;
  memoryUsageMb: number;
  version: string;
}

export interface ConfigUpdatedPayload {
  config: Partial<MimoConfig>;
}

export interface ErrorPayload {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface PongPayload {
  serverTime: string;
}

export interface ReconnectPayload {
  sessionId: string;
  /** Messages queued while disconnected */
  queuedMessages: ChatMessage[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// API Request/Response Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface ChatRequest {
  /** Session ID to send message to (creates new if omitted) */
  sessionId?: string;
  /** The user message content */
  message: string;
  /** Model override for this message */
  model?: string;
  /** Agent mode override */
  mode?: string;
}

export interface ConfigUpdateRequest {
  /** Partial config to merge with current config */
  config: Partial<MimoConfig>;
}

export interface MemoryCreateRequest {
  id: string;
  type: 'user' | 'feedback' | 'project' | 'reference';
  name: string;
  description: string;
  content: string;
  tags?: string[];
  links?: string[];
}

export interface StatsResponse {
  totalSessions: number;
  activeSessions: number;
  totalMessages: number;
  totalTokens: { input: number; output: number };
  uptimeMs: number;
  memoryUsageMb: number;
  averageResponseTimeMs: number;
  modelUsage: Record<string, number>;
  errorCount: number;
}
