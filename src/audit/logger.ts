// ── Audit Logging System ────────────────────────────────────────────────────
// Complete audit trail for security, compliance, and debugging.
// Records: tool calls, approvals, security events, session lifecycle,
// credential operations, permission escalations.

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type AuditEventType =
  | 'tool_call'          // Tool executed
  | 'tool_denied'        // Tool denied by permission
  | 'tool_approval'      // Tool approved/rejected by user
  | 'security_violation' // Sandbox or security violation
  | 'mode_change'        // Agent mode change (plan/agent/yolo)
  | 'session_start'      // Session started
  | 'session_end'        // Session ended
  | 'auth_event'         // Authentication/credential event
  | 'permission_escalation' // Escalation to yolo, trust mode, etc.
  | 'file_operation'     // File read/write/edit
  | 'shell_execution'    // Shell command executed
  | 'git_operation'      // Git command
  | 'config_change'      // Configuration changed
  | 'error'              // Error occurred
  | 'hook_event'         // Hook fired
  | 'sandbox_event'      // Sandbox event (snapshot, restore, violation)
  | 'rlm_event'          // RLM session event
  | 'lsp_event'          // LSP diagnostics event
  | 'subagent_event'     // Sub-agent lifecycle event
  | 'memory_event'       // Memory read/write
  | 'constitution_event' // Constitution arbitration
  | 'custom';            // Custom event

export type AuditSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export interface AuditEntry {
  id: string;
  timestamp: string;
  sessionId: string;
  eventType: AuditEventType;
  severity: AuditSeverity;
  actor: string;           // 'user', 'agent', 'system', 'hook', 'subagent:<id>'
  action: string;          // Specific action taken
  target?: string;         // What was acted upon (file path, tool name, etc.)
  details?: Record<string, any>;  // Additional structured data
  outcome: 'success' | 'failure' | 'blocked' | 'pending';
  duration?: number;       // ms, for timed operations
  error?: string;          // Error message if outcome is failure
}

export interface AuditQuery {
  eventTypes?: AuditEventType[];
  severities?: AuditSeverity[];
  actor?: string;
  target?: string;
  outcome?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

export interface AuditReport {
  sessionId: string;
  generatedAt: string;
  timeRange: { start: string; end: string };
  totalEvents: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  byOutcome: Record<string, number>;
  securityEvents: AuditEntry[];
  toolCalls: number;
  approvals: { approved: number; rejected: number };
  fileOperations: { read: number; write: number; edit: number };
  errors: AuditEntry[];
  topTools: Array<{ name: string; count: number }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AuditLogger
// ═══════════════════════════════════════════════════════════════════════════════

const AUDIT_DIR = path.join(os.homedir(), '.mimo', 'audit');

export class AuditLogger {
  private sessionId: string;
  private entries: AuditEntry[] = [];
  private logFilePath: string;
  private flushInterval: NodeJS.Timeout | null = null;
  private pendingWrites: AuditEntry[] = [];
  private enabled: boolean = true;
  private maxEntriesInMemory: number = 5000;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.logFilePath = path.join(AUDIT_DIR, `${sessionId}.jsonl`);
  }

  // ── Initialization ──────────────────────────────────────────────────

  async init(): Promise<void> {
    await fs.mkdir(AUDIT_DIR, { recursive: true });

    // Auto-flush every 5 seconds
    this.flushInterval = setInterval(() => this.flush(), 5000);

    this.log('session_start', 'info', 'system', 'Session initialized', undefined, 'success');
  }

  async close(): Promise<void> {
    this.log('session_end', 'info', 'system', 'Session ended', undefined, 'success');
    await this.flush();
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  // ── Core Logging ────────────────────────────────────────────────────

  /**
   * Log an audit event.
   */
  log(
    eventType: AuditEventType,
    severity: AuditSeverity,
    actor: string,
    action: string,
    target?: string,
    outcome: 'success' | 'failure' | 'blocked' | 'pending' = 'success',
    details?: Record<string, any>,
    error?: string,
    duration?: number
  ): AuditEntry {
    if (!this.enabled) {
      return { id: '', timestamp: '', sessionId: '', eventType, severity, actor, action, outcome };
    }

    const entry: AuditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      eventType,
      severity,
      actor,
      action,
      target,
      details,
      outcome,
      duration,
      error,
    };

    this.entries.push(entry);
    this.pendingWrites.push(entry);

    // Trim memory
    if (this.entries.length > this.maxEntriesInMemory) {
      this.entries = this.entries.slice(-this.maxEntriesInMemory);
    }

    return entry;
  }

  // ── Convenience Methods ─────────────────────────────────────────────

  /**
   * Log a tool call.
   */
  logToolCall(
    toolName: string,
    input: Record<string, any>,
    output: string,
    isError: boolean,
    duration: number,
    actor: string = 'agent'
  ): void {
    // Sanitize input (remove sensitive data)
    const sanitizedInput = this.sanitizeInput(toolName, input);
    const truncatedOutput = output.slice(0, 500);

    this.log(
      'tool_call',
      isError ? 'warning' : 'info',
      actor,
      `Tool: ${toolName}`,
      toolName,
      isError ? 'failure' : 'success',
      { input: sanitizedInput, outputPreview: truncatedOutput },
      isError ? output.slice(0, 200) : undefined,
      duration
    );
  }

  /**
   * Log a tool approval/rejection.
   */
  logToolApproval(toolName: string, approved: boolean, actor: string = 'user'): void {
    this.log(
      'tool_approval',
      approved ? 'info' : 'warning',
      actor,
      `${approved ? 'Approved' : 'Rejected'}: ${toolName}`,
      toolName,
      approved ? 'success' : 'blocked'
    );
  }

  /**
   * Log a security violation.
   */
  logSecurityViolation(
    action: string,
    details: Record<string, any>,
    severity: AuditSeverity = 'warning'
  ): void {
    this.log(
      'security_violation',
      severity,
      'system',
      action,
      details.target,
      'blocked',
      details
    );
  }

  /**
   * Log a mode change.
   */
  logModeChange(from: string, to: string, actor: string = 'user'): void {
    const severity: AuditSeverity = to === 'yolo' ? 'warning' : 'info';
    this.log(
      'mode_change',
      severity,
      actor,
      `Mode: ${from} → ${to}`,
      undefined,
      'success',
      { from, to }
    );

    if (to === 'yolo') {
      this.log(
        'permission_escalation',
        'warning',
        actor,
        'Escalated to YOLO mode (all tools auto-approved)',
        undefined,
        'success',
        { from, to }
      );
    }
  }

  /**
   * Log a file operation.
   */
  logFileOperation(operation: 'read' | 'write' | 'edit', filePath: string, success: boolean, actor: string = 'agent'): void {
    this.log(
      'file_operation',
      success ? 'info' : 'warning',
      actor,
      `File ${operation}: ${path.basename(filePath)}`,
      filePath,
      success ? 'success' : 'failure'
    );
  }

  /**
   * Log a shell execution.
   */
  logShellExecution(command: string, exitCode: number, duration: number, actor: string = 'agent'): void {
    this.log(
      'shell_execution',
      exitCode === 0 ? 'info' : 'warning',
      actor,
      `Shell: ${command.slice(0, 100)}`,
      undefined,
      exitCode === 0 ? 'success' : 'failure',
      { command: command.slice(0, 200), exitCode },
      exitCode !== 0 ? `Exit code: ${exitCode}` : undefined,
      duration
    );
  }

  /**
   * Log a git operation.
   */
  logGitOperation(action: string, details: Record<string, any>, success: boolean, actor: string = 'agent'): void {
    this.log(
      'git_operation',
      success ? 'info' : 'warning',
      actor,
      `Git: ${action}`,
      undefined,
      success ? 'success' : 'failure',
      details
    );
  }

  /**
   * Log an auth event.
   */
  logAuthEvent(action: string, details: Record<string, any>): void {
    this.log('auth_event', 'info', 'system', action, undefined, 'success', this.sanitizeDetails(details));
  }

  /**
   * Log a sandbox event.
   */
  logSandboxEvent(action: string, details: Record<string, any>, severity: AuditSeverity = 'info'): void {
    this.log('sandbox_event', severity, 'system', action, undefined, 'success', details);
  }

  /**
   * Log an RLM event.
   */
  logRLMEvent(action: string, sessionId: string, details?: Record<string, any>): void {
    this.log('rlm_event', 'info', 'system', action, sessionId, 'success', details);
  }

  /**
   * Log an LSP event.
   */
  logLSPEvent(action: string, details?: Record<string, any>): void {
    this.log('lsp_event', 'info', 'system', action, undefined, 'success', details);
  }

  /**
   * Log a subagent event.
   */
  logSubagentEvent(action: string, agentId: string, details?: Record<string, any>): void {
    this.log('subagent_event', 'info', `subagent:${agentId}`, action, agentId, 'success', details);
  }

  /**
   * Log a constitution arbitration.
   */
  logConstitutionEvent(action: string, details: Record<string, any>): void {
    this.log('constitution_event', 'info', 'system', action, undefined, 'success', details);
  }

  /**
   * Log an error.
   */
  logError(action: string, error: string, details?: Record<string, any>): void {
    this.log('error', 'error', 'system', action, undefined, 'failure', details, error);
  }

  // ── Querying ────────────────────────────────────────────────────────

  /**
   * Query audit entries with filters.
   */
  query(filters: AuditQuery): AuditEntry[] {
    let results = [...this.entries];

    if (filters.eventTypes?.length) {
      results = results.filter(e => filters.eventTypes!.includes(e.eventType));
    }
    if (filters.severities?.length) {
      results = results.filter(e => filters.severities!.includes(e.severity));
    }
    if (filters.actor) {
      results = results.filter(e => e.actor.includes(filters.actor!));
    }
    if (filters.target) {
      results = results.filter(e => e.target?.includes(filters.target!));
    }
    if (filters.outcome) {
      results = results.filter(e => e.outcome === filters.outcome);
    }
    if (filters.startTime) {
      results = results.filter(e => e.timestamp >= filters.startTime!);
    }
    if (filters.endTime) {
      results = results.filter(e => e.timestamp <= filters.endTime!);
    }

    const offset = filters.offset || 0;
    const limit = filters.limit || 100;
    return results.slice(offset, offset + limit);
  }

  /**
   * Get recent entries (last N).
   */
  recent(n: number = 20): AuditEntry[] {
    return this.entries.slice(-n);
  }

  /**
   * Get all entries.
   */
  getAll(): AuditEntry[] {
    return [...this.entries];
  }

  // ── Reporting ───────────────────────────────────────────────────────

  /**
   * Generate an audit report for the current session.
   */
  generateReport(): AuditReport {
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const byOutcome: Record<string, number> = {};
    const toolCounts: Record<string, number> = {};
    let approvals = { approved: 0, rejected: 0 };
    let fileOps = { read: 0, write: 0, edit: 0 };
    const errors: AuditEntry[] = [];
    const securityEvents: AuditEntry[] = [];

    for (const entry of this.entries) {
      byType[entry.eventType] = (byType[entry.eventType] || 0) + 1;
      bySeverity[entry.severity] = (bySeverity[entry.severity] || 0) + 1;
      byOutcome[entry.outcome] = (byOutcome[entry.outcome] || 0) + 1;

      if (entry.eventType === 'tool_call' && entry.target) {
        toolCounts[entry.target] = (toolCounts[entry.target] || 0) + 1;
      }
      if (entry.eventType === 'tool_approval') {
        if (entry.outcome === 'success') approvals.approved++;
        else approvals.rejected++;
      }
      if (entry.eventType === 'file_operation') {
        if (entry.action.includes('read')) fileOps.read++;
        else if (entry.action.includes('write')) fileOps.write++;
        else if (entry.action.includes('edit')) fileOps.edit++;
      }
      if (entry.eventType === 'error') errors.push(entry);
      if (entry.eventType === 'security_violation' || entry.eventType === 'permission_escalation') {
        securityEvents.push(entry);
      }
    }

    const topTools = Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    return {
      sessionId: this.sessionId,
      generatedAt: new Date().toISOString(),
      timeRange: {
        start: this.entries[0]?.timestamp || '',
        end: this.entries[this.entries.length - 1]?.timestamp || '',
      },
      totalEvents: this.entries.length,
      byType,
      bySeverity,
      byOutcome,
      securityEvents,
      toolCalls: byType['tool_call'] || 0,
      approvals,
      fileOperations: fileOps,
      errors,
      topTools,
    };
  }

  /**
   * Format report as human-readable text.
   */
  formatReport(report?: AuditReport): string {
    const r = report || this.generateReport();
    const lines: string[] = [];

    lines.push(`Audit Report — Session ${r.sessionId}`);
    lines.push(`Time: ${r.timeRange.start} → ${r.timeRange.end}`);
    lines.push(`Total Events: ${r.totalEvents}`);
    lines.push('');

    lines.push('By Type:');
    for (const [type, count] of Object.entries(r.byType).sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${type}: ${count}`);
    }
    lines.push('');

    lines.push('By Severity:');
    for (const [sev, count] of Object.entries(r.bySeverity)) {
      lines.push(`  ${sev}: ${count}`);
    }
    lines.push('');

    lines.push(`Tool Calls: ${r.toolCalls}`);
    lines.push(`Approvals: ${r.approvals.approved} approved, ${r.approvals.rejected} rejected`);
    lines.push(`File Ops: ${r.fileOperations.read} read, ${r.fileOperations.write} write, ${r.fileOperations.edit} edit`);
    lines.push('');

    if (r.topTools.length > 0) {
      lines.push('Top Tools:');
      for (const t of r.topTools) {
        lines.push(`  ${t.name}: ${t.count}`);
      }
      lines.push('');
    }

    if (r.securityEvents.length > 0) {
      lines.push(`Security Events (${r.securityEvents.length}):`);
      for (const e of r.securityEvents.slice(0, 20)) {
        lines.push(`  [${e.severity}] ${e.action} (${e.outcome})`);
      }
      lines.push('');
    }

    if (r.errors.length > 0) {
      lines.push(`Errors (${r.errors.length}):`);
      for (const e of r.errors.slice(0, 10)) {
        lines.push(`  ${e.action}: ${e.error || 'unknown'}`);
      }
    }

    return lines.join('\n');
  }

  // ── Export ──────────────────────────────────────────────────────────

  /**
   * Export all audit entries as JSON.
   */
  async exportJson(outputPath?: string): Promise<string> {
    const filePath = outputPath || path.join(AUDIT_DIR, `export-${this.sessionId}.json`);
    await fs.writeFile(filePath, JSON.stringify(this.entries, null, 2), 'utf-8');
    return filePath;
  }

  /**
   * Export as CSV.
   */
  async exportCsv(outputPath?: string): Promise<string> {
    const filePath = outputPath || path.join(AUDIT_DIR, `export-${this.sessionId}.csv`);
    const headers = 'id,timestamp,eventType,severity,actor,action,target,outcome,error\n';
    const rows = this.entries.map(e =>
      [e.id, e.timestamp, e.eventType, e.severity, e.actor, `"${e.action.replace(/"/g, '""')}"`, e.target || '', e.outcome, e.error || ''].join(',')
    ).join('\n');
    await fs.writeFile(filePath, headers + rows, 'utf-8');
    return filePath;
  }

  // ── Persistence ─────────────────────────────────────────────────────

  /**
   * Flush pending entries to disk.
   */
  async flush(): Promise<void> {
    if (this.pendingWrites.length === 0) return;

    const entries = this.pendingWrites.splice(0);
    const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';

    try {
      await fs.appendFile(this.logFilePath, lines, 'utf-8');
    } catch {
      // Re-add to pending on failure
      this.pendingWrites.unshift(...entries);
    }
  }

  /**
   * Load entries from a previous session's log file.
   */
  async loadFromFile(filePath: string): Promise<AuditEntry[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const entries: AuditEntry[] = [];
      for (const line of content.split('\n').filter(Boolean)) {
        try {
          entries.push(JSON.parse(line));
        } catch { /* skip malformed lines */ }
      }
      return entries;
    } catch {
      return [];
    }
  }

  /**
   * List all audit log files.
   */
  static async listLogs(): Promise<string[]> {
    try {
      const files = await fs.readdir(AUDIT_DIR);
      return files.filter(f => f.endsWith('.jsonl')).map(f => path.join(AUDIT_DIR, f));
    } catch {
      return [];
    }
  }

  // ── Configuration ───────────────────────────────────────────────────

  setEnabled(enabled: boolean): void { this.enabled = enabled; }
  isEnabled(): boolean { return this.enabled; }

  // ── Private Helpers ─────────────────────────────────────────────────

  private sanitizeInput(toolName: string, input: Record<string, any>): Record<string, any> {
    const sanitized = { ...input };

    // Remove sensitive fields
    const sensitiveKeys = ['apiKey', 'api_key', 'password', 'secret', 'token', 'authorization'];
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    // Truncate large content
    for (const key of Object.keys(sanitized)) {
      if (typeof sanitized[key] === 'string' && sanitized[key].length > 500) {
        sanitized[key] = sanitized[key].slice(0, 500) + '...[truncated]';
      }
    }

    return sanitized;
  }

  private sanitizeDetails(details: Record<string, any>): Record<string, any> {
    return this.sanitizeInput('', details);
  }
}
