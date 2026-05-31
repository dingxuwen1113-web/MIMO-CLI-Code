// ── ACP (Agent Control Protocol) Types ───────────────

export type ACPMethod =
  | 'initialize'
  | 'initialized'
  | 'tools/list'
  | 'tools/call'
  | 'resources/list'
  | 'resources/read'
  | 'edit/approve'
  | 'edit/reject'
  | 'session/start'
  | 'session/end'
  | 'session/list'
  | 'events/subscribe'
  | 'events/unsubscribe'
  | 'ping'
  | 'shutdown';

export interface ACPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: ACPMethod;
  params?: Record<string, any>;
}

export interface ACPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: ACPError;
}

export interface ACPError {
  code: number;
  message: string;
  data?: any;
}

export interface ACPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, any>;
}

export type ACPSessionStatus = 'active' | 'paused' | 'ended' | 'error';

export interface ACPSession {
  id: string;
  status: ACPSessionStatus;
  clientName: string;
  clientVersion: string;
  permissions: Permission[];
  toolMappings: ToolMapping[];
  startedAt: string;
  lastActivityAt: string;
  metadata: Record<string, any>;
}

export interface Permission {
  id: string;
  resource: string;
  actions: PermissionAction[];
  scope: PermissionScope;
  granted: boolean;
  expiresAt: string | null;
}

export type PermissionAction = 'read' | 'write' | 'execute' | 'approve' | 'admin';
export type PermissionScope = 'session' | 'global' | 'project';

export interface ToolMapping {
  acpToolName: string;
  mimoToolName: string;
  description: string;
  requiresApproval: boolean;
  parameterTransforms: Record<string, string>;
}

export interface EditApprovalRequest {
  id: string;
  sessionId: string;
  filePath: string;
  originalContent: string;
  proposedContent: string;
  diff: string;
  toolName: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requestedAt: string;
  respondedAt: string | null;
}

export interface ACPEvent {
  type: string;
  sessionId: string;
  data: Record<string, any>;
  timestamp: string;
}

export interface ACPHandshakeParams {
  clientName: string;
  clientVersion: string;
  protocolVersion: string;
  capabilities: Record<string, any>;
  authToken?: string;
}

export interface ACPHandshakeResult {
  serverName: string;
  serverVersion: string;
  protocolVersion: string;
  sessionId: string;
  capabilities: Record<string, any>;
  permissions: Permission[];
}

// Standard JSON-RPC error codes
export const ACP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom ACP error codes
  AUTH_FAILED: -32000,
  PERMISSION_DENIED: -32001,
  SESSION_NOT_FOUND: -32002,
  SESSION_EXPIRED: -32003,
  TOOL_NOT_FOUND: -32004,
  APPROVAL_REQUIRED: -32005,
  APPROVAL_TIMEOUT: -32006,
  EDIT_CONFLICT: -32007,
} as const;

export const ACP_PROTOCOL_VERSION = '1.0.0';
export const ACP_SERVER_NAME = 'mimo-acp-server';
export const ACP_SERVER_VERSION = '1.0.0';

export const DEFAULT_TOOL_MAPPINGS: ToolMapping[] = [
  { acpToolName: 'read_file', mimoToolName: 'file_read', description: 'Read a file', requiresApproval: false, parameterTransforms: {} },
  { acpToolName: 'write_file', mimoToolName: 'file_write', description: 'Write a file', requiresApproval: true, parameterTransforms: {} },
  { acpToolName: 'edit_file', mimoToolName: 'file_edit', description: 'Edit a file', requiresApproval: true, parameterTransforms: {} },
  { acpToolName: 'execute_command', mimoToolName: 'shell_exec', description: 'Execute a shell command', requiresApproval: true, parameterTransforms: {} },
  { acpToolName: 'search_files', mimoToolName: 'grep_search', description: 'Search file contents', requiresApproval: false, parameterTransforms: {} },
  { acpToolName: 'list_files', mimoToolName: 'glob_match', description: 'List files matching a pattern', requiresApproval: false, parameterTransforms: {} },
  { acpToolName: 'web_search', mimoToolName: 'web_search', description: 'Search the web', requiresApproval: false, parameterTransforms: {} },
  { acpToolName: 'web_fetch', mimoToolName: 'web_fetch', description: 'Fetch a URL', requiresApproval: false, parameterTransforms: {} },
  { acpToolName: 'git_status', mimoToolName: 'git_status', description: 'Show git status', requiresApproval: false, parameterTransforms: {} },
  { acpToolName: 'git_diff', mimoToolName: 'git_diff', description: 'Show git diff', requiresApproval: false, parameterTransforms: {} },
  { acpToolName: 'git_commit', mimoToolName: 'git_commit', description: 'Create a git commit', requiresApproval: true, parameterTransforms: {} },
];
