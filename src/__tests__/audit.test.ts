// ── Audit Logger Tests ────────────────────────────────
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AuditLogger } from '../audit/logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const AUDIT_DIR = path.join(os.homedir(), '.mimo', 'audit');

describe('AuditLogger', () => {
  let logger: AuditLogger;

  beforeAll(async () => {
    logger = new AuditLogger('test-session-' + Date.now());
    await logger.init();
  });

  afterAll(async () => {
    await logger.close();
  });

  it('logs a tool call', () => {
    logger.logToolCall('file_read', { path: '/test.ts' }, 'file contents', false, 42);
    const entries = logger.getAll();
    const found = entries.find(e => e.eventType === 'tool_call' && e.target === 'file_read');
    expect(found).toBeDefined();
    expect(found!.outcome).toBe('success');
    expect(found!.duration).toBe(42);
  });

  it('logs a failed tool call', () => {
    logger.logToolCall('shell_exec', { command: 'bad' }, 'error occurred', true, 100);
    const entries = logger.query({ eventTypes: ['tool_call'], severities: ['warning'] });
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it('logs mode changes', () => {
    logger.logModeChange('agent', 'yolo', 'user');
    const entries = logger.query({ eventTypes: ['mode_change'] });
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].details?.to).toBe('yolo');
  });

  it('logs permission escalation on yolo', () => {
    const entries = logger.query({ eventTypes: ['permission_escalation'] });
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it('logs security violations', () => {
    logger.logSecurityViolation('Blocked dangerous command', { target: 'shell_exec', command: 'rm -rf /' });
    const entries = logger.query({ eventTypes: ['security_violation'] });
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it('logs file operations', () => {
    logger.logFileOperation('write', '/tmp/test.ts', true);
    const entries = logger.query({ eventTypes: ['file_operation'] });
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it('sanitizes sensitive input fields', () => {
    logger.logToolCall('api_call', { apiKey: 'sk-secret-123', password: 'hunter2', data: 'safe' }, 'ok', false, 10);
    const entries = logger.getAll();
    const last = entries[entries.length - 1];
    // The details should exist and contain input
    expect(last.details).toBeDefined();
    expect(last.details?.input).toBeDefined();
    // The safe field should be preserved
    expect(last.details?.input?.data).toBe('safe');
    // Password should be redacted (this key is in the sensitive list)
    expect(last.details?.input?.password).toBe('[REDACTED]');
  });

  it('generates a report', () => {
    const report = logger.generateReport();
    expect(report.sessionId).toBeTruthy();
    expect(report.totalEvents).toBeGreaterThan(0);
    expect(report.generatedAt).toBeTruthy();
    expect(report.timeRange.start).toBeTruthy();
    expect(report.timeRange.end).toBeTruthy();
  });

  it('formats report as text', () => {
    const text = logger.formatReport();
    expect(text).toContain('Audit Report');
    expect(text).toContain('Total Events:');
  });

  it('queries with filters', () => {
    const results = logger.query({ limit: 5 });
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('queries by severity', () => {
    const warnings = logger.query({ severities: ['warning'] });
    for (const entry of warnings) {
      expect(entry.severity).toBe('warning');
    }
  });

  it('exports to JSON', async () => {
    const filePath = await logger.exportJson();
    const raw = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(Array.isArray(data)).toBe(true);
    try { await fs.unlink(filePath); } catch {}
  });

  it('exports to CSV', async () => {
    const filePath = await logger.exportCsv();
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('id,timestamp,eventType');
    try { await fs.unlink(filePath); } catch {}
  });
});
