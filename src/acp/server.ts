// ── ACP Server (JSON-RPC 2.0 over stdio) ─────────────

import { EventEmitter } from 'events';
import * as readline from 'readline';
import {
  ACPRequest, ACPResponse, ACPNotification, ACPError, ACPSession, ACPEvent,
  ACPHandshakeParams, ACPHandshakeResult, EditApprovalRequest, Permission,
  ToolMapping,
  ACP_ERROR_CODES, ACP_PROTOCOL_VERSION, ACP_SERVER_NAME, ACP_SERVER_VERSION,
  DEFAULT_TOOL_MAPPINGS,
} from './types';
import { ACPAuthProvider } from './auth';

export interface ACPToolExecutor {
  (toolName: string, params: Record<string, any>): Promise<any>;
}

export class ACPServer extends EventEmitter {
  private sessions: Map<string, ACPSession> = new Map();
  private pendingApprovals: Map<string, EditApprovalRequest> = new Map();
  private authProvider: ACPAuthProvider;
  private toolExecutor: ACPToolExecutor;
  private toolMappings: ToolMapping[];
  private rl: readline.Interface | null = null;
  private requestIdCounter = 0;
  private isRunning = false;
  private eventSubscribers: Map<string, Set<string>> = new Map(); // sessionId -> Set<eventType>

  constructor(
    authProvider: ACPAuthProvider,
    toolExecutor: ACPToolExecutor,
    toolMappings?: ToolMapping[]
  ) {
    super();
    this.authProvider = authProvider;
    this.toolExecutor = toolExecutor;
    this.toolMappings = toolMappings || [...DEFAULT_TOOL_MAPPINGS];
  }

  // ── Server Lifecycle ──────────────────────────────

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    this.rl.on('line', (line: string) => {
      this.handleInput(line.trim()).catch(err => {
        this.writeError(null, ACP_ERROR_CODES.INTERNAL_ERROR, err.message);
      });
    });

    this.rl.on('close', () => {
      this.shutdown();
    });

    this.emit('started');
  }

  async shutdown(): Promise<void> {
    this.isRunning = false;

    // End all active sessions
    for (const [sessionId, session] of this.sessions) {
      if (session.status === 'active') {
        session.status = 'ended';
        this.emitEvent(sessionId, 'session_ended', { reason: 'server_shutdown' });
      }
    }

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    this.emit('shutdown');
  }

  // ── Input Handling ────────────────────────────────

  private async handleInput(line: string): Promise<void> {
    if (!line) return;

    let request: ACPRequest;
    try {
      request = JSON.parse(line);
    } catch {
      this.writeError(null, ACP_ERROR_CODES.PARSE_ERROR, 'Invalid JSON');
      return;
    }

    // Validate JSON-RPC structure
    if (request.jsonrpc !== '2.0' || !request.method) {
      this.writeError(request.id || null, ACP_ERROR_CODES.INVALID_REQUEST, 'Invalid JSON-RPC request');
      return;
    }

    try {
      const result = await this.routeRequest(request);
      this.writeResponse(request.id, result);
    } catch (err: any) {
      if (err.code !== undefined) {
        this.writeError(request.id, err.code, err.message, err.data);
      } else {
        this.writeError(request.id, ACP_ERROR_CODES.INTERNAL_ERROR, err.message || String(err));
      }
    }
  }

  // ── Request Router ────────────────────────────────

  private async routeRequest(request: ACPRequest): Promise<any> {
    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request.params as ACPHandshakeParams);
      case 'tools/list':
        return this.handleToolsList(request.params);
      case 'tools/call':
        return this.handleToolsCall(request.params);
      case 'resources/list':
        return this.handleResourcesList(request.params);
      case 'resources/read':
        return this.handleResourcesRead(request.params);
      case 'edit/approve':
        return this.handleEditApprove(request.params);
      case 'edit/reject':
        return this.handleEditReject(request.params);
      case 'session/start':
        return this.handleSessionStart(request.params);
      case 'session/end':
        return this.handleSessionEnd(request.params);
      case 'session/list':
        return this.handleSessionList();
      case 'events/subscribe':
        return this.handleEventsSubscribe(request.params);
      case 'events/unsubscribe':
        return this.handleEventsUnsubscribe(request.params);
      case 'ping':
        return { pong: true, timestamp: new Date().toISOString() };
      case 'shutdown':
        await this.shutdown();
        return { success: true };
      default:
        throw { code: ACP_ERROR_CODES.METHOD_NOT_FOUND, message: `Method not found: ${request.method}` };
    }
  }

  // ── Initialize / Handshake ────────────────────────

  private async handleInitialize(params: ACPHandshakeParams): Promise<ACPHandshakeResult> {
    if (!params || !params.clientName) {
      throw { code: ACP_ERROR_CODES.INVALID_PARAMS, message: 'Missing clientName' };
    }

    // Authenticate if token provided
    if (params.authToken) {
      const authResult = await this.authProvider.validateToken(params.authToken);
      if (!authResult.valid) {
        throw { code: ACP_ERROR_CODES.AUTH_FAILED, message: 'Authentication failed' };
      }
    }

    // Create session
    const sessionId = this.generateId();
    const permissions = await this.authProvider.getDefaultPermissions();

    const session: ACPSession = {
      id: sessionId,
      status: 'active',
      clientName: params.clientName,
      clientVersion: params.clientVersion,
      permissions,
      toolMappings: [...this.toolMappings],
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      metadata: params.capabilities || {},
    };

    this.sessions.set(sessionId, session);
    this.emitEvent(sessionId, 'session_started', {
      clientName: params.clientName,
      clientVersion: params.clientVersion,
    });

    return {
      serverName: ACP_SERVER_NAME,
      serverVersion: ACP_SERVER_VERSION,
      protocolVersion: ACP_PROTOCOL_VERSION,
      sessionId,
      capabilities: {
        tools: true,
        resources: true,
        editApproval: true,
        eventStreaming: true,
        sessions: true,
      },
      permissions,
    };
  }

  // ── Tool Mapping ──────────────────────────────────

  private handleToolsList(params?: Record<string, any>): { tools: any[] } {
    const sessionId = params?.sessionId;
    const session = sessionId ? this.sessions.get(sessionId) : null;

    return {
      tools: this.toolMappings.map(mapping => ({
        name: mapping.acpToolName,
        description: mapping.description,
        requiresApproval: mapping.requiresApproval,
        inputSchema: { type: 'object', properties: {} },
      })),
    };
  }

  private async handleToolsCall(params?: Record<string, any>): Promise<any> {
    if (!params || !params.name) {
      throw { code: ACP_ERROR_CODES.INVALID_PARAMS, message: 'Missing tool name' };
    }

    const sessionId = params.sessionId;
    const session = sessionId ? this.sessions.get(sessionId) : null;

    // Find tool mapping
    const mapping = this.toolMappings.find(m => m.acpToolName === params.name);
    if (!mapping) {
      throw { code: ACP_ERROR_CODES.TOOL_NOT_FOUND, message: `Tool not found: ${params.name}` };
    }

    // Check permissions
    if (session) {
      const hasPermission = this.checkToolPermission(session, mapping);
      if (!hasPermission) {
        throw { code: ACP_ERROR_CODES.PERMISSION_DENIED, message: `No permission for tool: ${params.name}` };
      }
    }

    // Check if approval is needed
    if (mapping.requiresApproval) {
      // In write/edit tools, check if we need to create an approval request
      if (params.arguments?.filePath && (mapping.acpToolName === 'write_file' || mapping.acpToolName === 'edit_file')) {
        const approvalId = this.generateId();
        const approvalRequest: EditApprovalRequest = {
          id: approvalId,
          sessionId: sessionId || '',
          filePath: params.arguments.filePath,
          originalContent: params.arguments.originalContent || '',
          proposedContent: params.arguments.content || params.arguments.newContent || '',
          diff: params.arguments.diff || '',
          toolName: mapping.mimoToolName,
          description: params.arguments.description || `Edit file: ${params.arguments.filePath}`,
          status: 'pending',
          requestedAt: new Date().toISOString(),
          respondedAt: null,
        };

        this.pendingApprovals.set(approvalId, approvalRequest);
        this.emitEvent(sessionId, 'edit_approval_requested', { approvalId, request: approvalRequest });

        // Return approval needed response
        throw {
          code: ACP_ERROR_CODES.APPROVAL_REQUIRED,
          message: 'Edit approval required',
          data: { approvalId, request: approvalRequest },
        };
      }
    }

    // Transform parameters
    const transformedParams = this.transformParams(params.arguments || {}, mapping);

    // Execute mapped MIMO tool
    const result = await this.toolExecutor(mapping.mimoToolName, transformedParams);

    // Update session activity
    if (session) {
      session.lastActivityAt = new Date().toISOString();
    }

    return result;
  }

  // ── Resources ─────────────────────────────────────

  private handleResourcesList(params?: Record<string, any>): { resources: any[] } {
    return {
      resources: [
        { uri: 'mimo://session/current', name: 'Current Session', mimeType: 'application/json' },
        { uri: 'mimo://config/current', name: 'Current Config', mimeType: 'application/json' },
        { uri: 'mimo://tools/available', name: 'Available Tools', mimeType: 'application/json' },
      ],
    };
  }

  private async handleResourcesRead(params?: Record<string, any>): Promise<any> {
    if (!params?.uri) {
      throw { code: ACP_ERROR_CODES.INVALID_PARAMS, message: 'Missing resource URI' };
    }

    switch (params.uri) {
      case 'mimo://session/current':
        return { content: JSON.stringify(this.getActiveSessions(), null, 2) };
      case 'mimo://tools/available':
        return { content: JSON.stringify(this.toolMappings, null, 2) };
      default:
        throw { code: ACP_ERROR_CODES.INVALID_PARAMS, message: `Unknown resource: ${params.uri}` };
    }
  }

  // ── Edit Approval Flow ────────────────────────────

  private handleEditApprove(params?: Record<string, any>): any {
    if (!params?.approvalId) {
      throw { code: ACP_ERROR_CODES.INVALID_PARAMS, message: 'Missing approvalId' };
    }

    const approval = this.pendingApprovals.get(params.approvalId);
    if (!approval) {
      throw { code: ACP_ERROR_CODES.SESSION_NOT_FOUND, message: 'Approval request not found' };
    }

    approval.status = 'approved';
    approval.respondedAt = new Date().toISOString();

    this.emitEvent(approval.sessionId, 'edit_approved', { approvalId: params.approvalId });

    return { status: 'approved', approvalId: params.approvalId };
  }

  private handleEditReject(params?: Record<string, any>): any {
    if (!params?.approvalId) {
      throw { code: ACP_ERROR_CODES.INVALID_PARAMS, message: 'Missing approvalId' };
    }

    const approval = this.pendingApprovals.get(params.approvalId);
    if (!approval) {
      throw { code: ACP_ERROR_CODES.SESSION_NOT_FOUND, message: 'Approval request not found' };
    }

    approval.status = 'rejected';
    approval.respondedAt = new Date().toISOString();

    this.emitEvent(approval.sessionId, 'edit_rejected', { approvalId: params.approvalId, reason: params.reason });

    return { status: 'rejected', approvalId: params.approvalId };
  }

  getPendingApprovals(sessionId?: string): EditApprovalRequest[] {
    const approvals = Array.from(this.pendingApprovals.values());
    if (sessionId) {
      return approvals.filter(a => a.sessionId === sessionId && a.status === 'pending');
    }
    return approvals.filter(a => a.status === 'pending');
  }

  // ── Session Management ────────────────────────────

  private handleSessionStart(params?: Record<string, any>): any {
    const sessionId = params?.sessionId;
    const session = sessionId ? this.sessions.get(sessionId) : null;

    if (session) {
      session.status = 'active';
      session.lastActivityAt = new Date().toISOString();
      this.emitEvent(sessionId, 'session_resumed', {});
      return { sessionId, status: 'active' };
    }

    throw { code: ACP_ERROR_CODES.SESSION_NOT_FOUND, message: 'Session not found' };
  }

  private handleSessionEnd(params?: Record<string, any>): any {
    const sessionId = params?.sessionId;
    const session = sessionId ? this.sessions.get(sessionId) : null;

    if (!session) {
      throw { code: ACP_ERROR_CODES.SESSION_NOT_FOUND, message: 'Session not found' };
    }

    session.status = 'ended';
    session.lastActivityAt = new Date().toISOString();
    this.emitEvent(sessionId, 'session_ended', { reason: 'client_request' });

    return { sessionId, status: 'ended' };
  }

  private handleSessionList(): { sessions: any[] } {
    return {
      sessions: Array.from(this.sessions.values()).map(s => ({
        id: s.id,
        status: s.status,
        clientName: s.clientName,
        startedAt: s.startedAt,
        lastActivityAt: s.lastActivityAt,
      })),
    };
  }

  getActiveSessions(): ACPSession[] {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active');
  }

  getSession(sessionId: string): ACPSession | undefined {
    return this.sessions.get(sessionId);
  }

  // ── Event Streaming ───────────────────────────────

  private handleEventsSubscribe(params?: Record<string, any>): any {
    if (!params?.sessionId || !params?.eventType) {
      throw { code: ACP_ERROR_CODES.INVALID_PARAMS, message: 'Missing sessionId or eventType' };
    }

    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw { code: ACP_ERROR_CODES.SESSION_NOT_FOUND, message: 'Session not found' };
    }

    if (!this.eventSubscribers.has(params.sessionId)) {
      this.eventSubscribers.set(params.sessionId, new Set());
    }
    this.eventSubscribers.get(params.sessionId)!.add(params.eventType);

    return { subscribed: true, eventType: params.eventType };
  }

  private handleEventsUnsubscribe(params?: Record<string, any>): any {
    if (!params?.sessionId || !params?.eventType) {
      throw { code: ACP_ERROR_CODES.INVALID_PARAMS, message: 'Missing sessionId or eventType' };
    }

    const subs = this.eventSubscribers.get(params.sessionId);
    if (subs) {
      subs.delete(params.eventType);
    }

    return { unsubscribed: true, eventType: params.eventType };
  }

  private emitEvent(sessionId: string, type: string, data: Record<string, any>): void {
    const event: ACPEvent = {
      type,
      sessionId,
      data,
      timestamp: new Date().toISOString(),
    };

    this.emit('event', event);

    // Check if this session has subscribers for this event type
    const subs = this.eventSubscribers.get(sessionId);
    if (subs && subs.has(type)) {
      this.writeNotification('events/event', event);
    }

    // Also broadcast to all sessions subscribing to wildcard
    for (const [sid, eventTypes] of this.eventSubscribers) {
      if (sid !== sessionId && eventTypes.has('*')) {
        this.writeNotification('events/event', { ...event, targetSessionId: sid });
      }
    }
  }

  // ── Helper Methods ────────────────────────────────

  private checkToolPermission(session: ACPSession, mapping: ToolMapping): boolean {
    // Check if session has an appropriate permission for the mapped tool
    const toolAction = mapping.requiresApproval ? 'execute' : 'read';
    return session.permissions.some(p =>
      p.granted &&
      (p.resource === '*' || p.resource === mapping.mimoToolName) &&
      p.actions.includes(toolAction) &&
      (!p.expiresAt || new Date(p.expiresAt) > new Date())
    );
  }

  private transformParams(args: Record<string, any>, mapping: ToolMapping): Record<string, any> {
    const transformed = { ...args };
    for (const [acpParam, mimoParam] of Object.entries(mapping.parameterTransforms)) {
      if (transformed[acpParam] !== undefined) {
        transformed[mimoParam] = transformed[acpParam];
        delete transformed[acpParam];
      }
    }
    return transformed;
  }

  // ── I/O ───────────────────────────────────────────

  private writeResponse(id: number | string | null, result: any): void {
    const response: ACPResponse = {
      jsonrpc: '2.0',
      id: id ?? 0,
      result,
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }

  private writeError(id: number | string | null, code: number, message: string, data?: any): void {
    const response: ACPResponse = {
      jsonrpc: '2.0',
      id: id ?? 0,
      error: { code, message, data },
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }

  private writeNotification(method: string, params: any): void {
    const notification: ACPNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    process.stdout.write(JSON.stringify(notification) + '\n');
  }

  private generateId(): string {
    return `acp-${Date.now()}-${++this.requestIdCounter}`;
  }
}
