// ── Audit Tool Definitions ──────────────────────────────────────────────────

import { ToolDefinition, ToolResult } from '../tools/registry';
import { AuditLogger } from './logger';

// Global instance (initialized by agent)
let auditLogger: AuditLogger | null = null;

export function setAuditLogger(logger: AuditLogger): void {
  auditLogger = logger;
}

export function getAuditLogger(): AuditLogger | null {
  return auditLogger;
}

export const auditQueryTool: ToolDefinition = {
  name: 'audit_query',
  description: 'Query the audit log with filters. Returns tool calls, approvals, security events, errors, and more. Useful for debugging what happened in a session.',
  input_schema: {
    type: 'object' as const,
    properties: {
      event_type: {
        type: 'string',
        description: 'Filter by event type (tool_call, security_violation, mode_change, error, etc.)',
      },
      severity: {
        type: 'string',
        description: 'Filter by severity (debug, info, warning, error, critical)',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default: 50)',
      },
    },
  },
  permission: 'auto',
};

export const auditReportTool: ToolDefinition = {
  name: 'audit_report',
  description: 'Generate a comprehensive audit report for the current session. Shows tool usage stats, security events, approval counts, file operations, and errors.',
  input_schema: {
    type: 'object' as const,
    properties: {},
  },
  permission: 'auto',
};

export async function executeAuditQuery(input: Record<string, any>): Promise<ToolResult> {
  if (!auditLogger) {
    return { output: 'Audit logger not initialized', isError: true };
  }

  const filters: any = {};
  if (input.event_type) filters.eventTypes = [input.event_type];
  if (input.severity) filters.severities = [input.severity];
  filters.limit = input.limit || 50;

  const entries = auditLogger.query(filters);

  if (entries.length === 0) {
    return { output: 'No matching audit entries found', isError: false };
  }

  const lines = entries.map(e => {
    const time = new Date(e.timestamp).toLocaleTimeString();
    const severity = e.severity.toUpperCase().padEnd(8);
    return `  ${time} [${severity}] ${e.eventType}: ${e.action} → ${e.outcome}${e.error ? ` (${e.error})` : ''}`;
  });

  return {
    output: `Audit entries (${entries.length}):\n${lines.join('\n')}`,
    isError: false,
  };
}

export async function executeAuditReport(_input: Record<string, any>): Promise<ToolResult> {
  if (!auditLogger) {
    return { output: 'Audit logger not initialized', isError: true };
  }

  const report = auditLogger.generateReport();
  const formatted = auditLogger.formatReport(report);
  return { output: formatted, isError: false };
}
