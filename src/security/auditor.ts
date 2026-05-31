import createDebug from 'debug';

const debug = createDebug('mimo:audit');

// ─── Audit Types ───────────────────────────────────────────────────

export type AuditSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type AuditCategory = 'config' | 'plugins' | 'channels' | 'sandbox' | 'exec' | 'filesystem' | 'trust' | 'network' | 'credentials' | 'permissions';

export interface AuditFinding {
  id: string;
  category: AuditCategory;
  severity: AuditSeverity;
  title: string;
  description: string;
  recommendation: string;
  evidence?: string;
  autoFixable: boolean;
}

export interface AuditReport {
  timestamp: string;
  durationMs: number;
  findings: AuditFinding[];
  score: number;         // 0-100 (100 = perfect security)
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

// ─── Security Auditor ──────────────────────────────────────────────

export class SecurityAuditor {
  private findingId = 0;

  async runFullAudit(context: AuditContext): Promise<AuditReport> {
    const start = Date.now();
    const findings: AuditFinding[] = [];

    debug('Starting full security audit');

    // Run all audit checks in parallel
    const results = await Promise.allSettled([
      this.auditConfig(context),
      this.auditPlugins(context),
      this.auditSandbox(context),
      this.auditExecSafety(context),
      this.auditFilesystem(context),
      this.auditNetwork(context),
      this.auditCredentials(context),
      this.auditPermissions(context),
      this.auditTrustModel(context),
      this.auditDependencies(context),
    ]);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        findings.push(...result.value);
      }
    }

    const score = this.calculateScore(findings);
    const durationMs = Date.now() - start;

    debug('Audit complete: %d findings, score=%d, duration=%dms', findings.length, score, durationMs);

    return {
      timestamp: new Date().toISOString(),
      durationMs,
      findings,
      score,
      summary: {
        critical: findings.filter(f => f.severity === 'critical').length,
        high: findings.filter(f => f.severity === 'high').length,
        medium: findings.filter(f => f.severity === 'medium').length,
        low: findings.filter(f => f.severity === 'low').length,
        info: findings.filter(f => f.severity === 'info').length,
      },
    };
  }

  // ─── Audit Checks ──────────────────────────────────────────────

  private async auditConfig(ctx: AuditContext): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];

    // Check for exposed API keys in config
    if (ctx.config?.api?.tokenPlan?.apiKey && !ctx.config.api.tokenPlan.apiKey.startsWith('sk-ant-')) {
      findings.push(this.finding('credentials', 'medium', 'Non-standard API key format',
        'Token plan API key does not match expected format', 'Verify the API key is correct'));
    }

    // Check for default/weak settings
    if (ctx.config?.agent?.mode === 'yolo') {
      findings.push(this.finding('config', 'high', 'YOLO mode is active',
        'YOLO mode auto-approves all tool executions without confirmation',
        'Switch to agent or plan mode for safer operation'));
    }

    // Check sandbox configuration
    if (ctx.config?.sandbox?.enabled === false) {
      findings.push(this.finding('sandbox', 'high', 'Sandbox is disabled',
        'Command sandboxing is disabled, allowing unrestricted shell access',
        'Enable sandbox mode for safer command execution'));
    }

    // Check rate limiting
    if (ctx.config?.api?.rateLimit?.requestsPerMinute > 100) {
      findings.push(this.finding('config', 'low', 'High rate limit',
        'Rate limit is set above 100 RPM which may trigger API provider blocks',
        'Consider lowering to 60 RPM or below'));
    }

    return findings;
  }

  private async auditPlugins(ctx: AuditContext): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];

    for (const plugin of ctx.plugins || []) {
      // Check for plugins with shell access
      if (plugin.permissions?.shell) {
        findings.push(this.finding('plugins', 'high', `Plugin "${plugin.name}" has shell access`,
          `Plugin ${plugin.name} (${plugin.version}) can execute arbitrary shell commands`,
          'Review plugin source code and consider restricting shell permissions'));
      }

      // Check for plugins with network access
      if (plugin.permissions?.network) {
        findings.push(this.finding('plugins', 'medium', `Plugin "${plugin.name}" has network access`,
          `Plugin ${plugin.name} can make outbound network requests`,
          'Verify plugin does not exfiltrate data'));
      }

      // Check for plugins with wildcard file access
      if (plugin.permissions?.files?.includes('*')) {
        findings.push(this.finding('plugins', 'medium', `Plugin "${plugin.name}" has full filesystem access`,
          `Plugin can read/write any file on the system`,
          'Restrict file permissions to specific directories'));
      }
    }

    return findings;
  }

  private async auditSandbox(ctx: AuditContext): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];

    if (!ctx.sandboxTechnologies || ctx.sandboxTechnologies.length === 0) {
      findings.push(this.finding('sandbox', 'medium', 'No sandbox technology available',
        'Neither bwrap (Linux), seatbelt (macOS), nor container runtime detected',
        'Install bubblewrap or enable Docker for sandboxed execution'));
    }

    // Check for dangerous commands in allowlist
    for (const cmd of ctx.allowedCommands || []) {
      if (/rm\s+-rf|mkfs|dd\s+if=|>\s*\/dev/.test(cmd)) {
        findings.push(this.finding('sandbox', 'critical', `Dangerous command in allowlist: ${cmd}`,
          'A destructive command is explicitly allowed',
          'Remove from allowlist immediately'));
      }
    }

    return findings;
  }

  private async auditExecSafety(ctx: AuditContext): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];

    // Check for recently executed dangerous commands
    for (const cmd of ctx.recentCommands || []) {
      if (/curl.*\|.*sh|wget.*\|.*sh|eval\(|exec\(/.test(cmd)) {
        findings.push(this.finding('exec', 'critical', 'Pipe-to-shell pattern detected',
          `Command "${cmd.slice(0, 100)}" pipes remote content to shell interpreter`,
          'Avoid piping remote content directly to shell; download and inspect first'));
      }

      if (/sudo\s+/.test(cmd) && ctx.mode !== 'yolo') {
        findings.push(this.finding('exec', 'high', 'Sudo usage detected',
          `Command used sudo: "${cmd.slice(0, 100)}"`,
          'Avoid sudo in agent commands; use explicit permission escalation'));
      }
    }

    return findings;
  }

  private async auditFilesystem(ctx: AuditContext): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];

    // Check for sensitive files in modified set
    for (const file of ctx.modifiedFiles || []) {
      if (/\.env$|\.env\.local$|\.env\.production$/.test(file)) {
        findings.push(this.finding('filesystem', 'high', `Sensitive file modified: ${file}`,
          'Environment files may contain secrets',
          'Ensure secrets are not committed to version control'));
      }

      if (/\.(pem|key|p12|pfx)$/.test(file)) {
        findings.push(this.finding('filesystem', 'critical', `Private key file modified: ${file}`,
          'Private key or certificate file was modified',
          'Verify this change was intentional and keys are not exposed'));
      }

      if (/\.(git\/config|ssh\/config|ssh\/id_)/.test(file)) {
        findings.push(this.finding('filesystem', 'high', `SSH/Git config modified: ${file}`,
          'Authentication configuration file was modified',
          'Review changes to ensure no unauthorized access was added'));
      }
    }

    return findings;
  }

  private async auditNetwork(ctx: AuditContext): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];

    // Check for outbound requests to suspicious domains
    for (const url of ctx.outboundUrls || []) {
      try {
        const parsed = new URL(url);
        const suspicious = ['pastebin', 'ngrok', 'serveo', 'localtunnel', 'webhook.site', 'requestbin'];
        if (suspicious.some(s => parsed.hostname.includes(s))) {
          findings.push(this.finding('network', 'high', `Suspicious outbound URL: ${url}`,
            'Request to a known data exfiltration or tunneling service',
            'Verify this request is intentional'));
        }
      } catch {}
    }

    return findings;
  }

  private async auditCredentials(ctx: AuditContext): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];

    // Scan for leaked credentials in recent outputs
    const patterns = [
      { regex: /sk-ant-[a-zA-Z0-9]{20,}/, name: 'Anthropic API key' },
      { regex: /sk-[a-zA-Z0-9]{20,}/, name: 'OpenAI API key' },
      { regex: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub Personal Access Token' },
      { regex: /AKIA[0-9A-Z]{16}/, name: 'AWS Access Key' },
      { regex: /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/, name: 'JWT Token' },
    ];

    for (const output of ctx.recentOutputs || []) {
      for (const { regex, name } of patterns) {
        if (regex.test(output)) {
          findings.push(this.finding('credentials', 'critical', `${name} detected in output`,
            `A ${name} pattern was found in tool output`,
            'Rotate this credential immediately and review tool output handling'));
        }
      }
    }

    return findings;
  }

  private async auditPermissions(ctx: AuditContext): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];

    if (ctx.mode === 'yolo') {
      findings.push(this.finding('permissions', 'high', 'Running in YOLO mode',
        'All tool executions are auto-approved without user confirmation',
        'Use agent or plan mode for safer operation'));
    }

    // Check for overly permissive directory rules
    for (const rule of ctx.directoryRules || []) {
      if (rule.pattern === '*' && rule.permission === 'auto') {
        findings.push(this.finding('permissions', 'critical', 'Wildcard auto-approve rule',
          `Directory rule "${rule.pattern}" auto-approves all file operations`,
          'Restrict auto-approve to specific directories'));
      }
    }

    return findings;
  }

  private async auditTrustModel(ctx: AuditContext): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];

    // Check for untrusted MCP servers
    for (const server of ctx.mcpServers || []) {
      if (!server.trusted) {
        findings.push(this.finding('trust', 'medium', `Untrusted MCP server: ${server.name}`,
          `MCP server "${server.name}" is not in the trusted list`,
          'Verify server source and add to trusted list if safe'));
      }
    }

    // Check for unverified plugin sources
    for (const plugin of ctx.plugins || []) {
      if (plugin.source === 'unknown' || !plugin.verified) {
        findings.push(this.finding('trust', 'medium', `Unverified plugin: ${plugin.name}`,
          `Plugin source could not be verified`,
          'Only install plugins from trusted sources'));
      }
    }

    return findings;
  }

  private async auditDependencies(ctx: AuditContext): Promise<AuditFinding[]> {
    const findings: AuditFinding[] = [];

    // Check for known typosquat patterns
    const typosquatMap: Record<string, string> = {
      'colour': 'color', 'expresss': 'express', 'lodashs': 'lodash',
      'moongose': 'mongoose', 'reqeust': 'request', 'axois': 'axios',
    };

    for (const dep of ctx.dependencies || []) {
      if (typosquatMap[dep]) {
        findings.push(this.finding('config', 'high', `Possible typosquat: ${dep}`,
          `Package "${dep}" may be a typosquat of "${typosquatMap[dep]}"`,
          `Replace with the correct package "${typosquatMap[dep]}"`));
      }
    }

    return findings;
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private finding(
    category: AuditCategory,
    severity: AuditSeverity,
    title: string,
    description: string,
    recommendation: string,
  ): AuditFinding {
    return {
      id: `AUDIT-${++this.findingId}`,
      category,
      severity,
      title,
      description,
      recommendation,
      autoFixable: false,
    };
  }

  private calculateScore(findings: AuditFinding[]): number {
    let score = 100;
    for (const f of findings) {
      switch (f.severity) {
        case 'critical': score -= 25; break;
        case 'high': score -= 10; break;
        case 'medium': score -= 3; break;
        case 'low': score -= 1; break;
        case 'info': break;
      }
    }
    return Math.max(0, score);
  }

  formatReport(report: AuditReport): string {
    const lines: string[] = [];
    lines.push('');
    lines.push(`  ╔══════════════════════════════════════════╗`);
    lines.push(`  ║     MIMO Security Audit Report           ║`);
    lines.push(`  ╚══════════════════════════════════════════╝`);
    lines.push('');
    lines.push(`  Score: ${report.score}/100  (${report.durationMs}ms)`);
    lines.push(`  Findings: ${report.findings.length} (Critical: ${report.summary.critical}, High: ${report.summary.high}, Medium: ${report.summary.medium}, Low: ${report.summary.low})`);
    lines.push('');

    const grouped = new Map<AuditCategory, AuditFinding[]>();
    for (const f of report.findings) {
      if (!grouped.has(f.category)) grouped.set(f.category, []);
      grouped.get(f.category)!.push(f);
    }

    for (const [category, findings] of grouped) {
      lines.push(`  ── ${category.toUpperCase()} ──`);
      for (const f of findings) {
        const icon = f.severity === 'critical' ? '🔴' : f.severity === 'high' ? '🟠' : f.severity === 'medium' ? '🟡' : '🟢';
        lines.push(`  ${icon} ${f.title}`);
        lines.push(`     ${f.description}`);
        lines.push(`     → ${f.recommendation}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// ─── Audit Context ─────────────────────────────────────────────────

export interface AuditContext {
  config?: any;
  mode?: string;
  plugins?: Array<{ name: string; version: string; permissions?: any; source?: string; verified?: boolean }>;
  sandboxTechnologies?: string[];
  allowedCommands?: string[];
  recentCommands?: string[];
  recentOutputs?: string[];
  modifiedFiles?: string[];
  outboundUrls?: string[];
  directoryRules?: Array<{ pattern: string; permission: string }>;
  mcpServers?: Array<{ name: string; trusted: boolean }>;
  dependencies?: string[];
}
