// ── Tool Execution Guardrails ───────────────────────────────────

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
  sanitized?: Record<string, unknown>;
  warnings: string[];
}

export interface GuardrailConfig {
  maxFileSize: number;
  maxCommandLength: number;
  maxOutputSize: number;
  timeoutMs: number;
  blockedPaths: RegExp[];
  blockedCommands: RegExp[];
  sensitivePatterns: RegExp[];
}

const DEFAULT_CONFIG: GuardrailConfig = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxCommandLength: 10000,
  maxOutputSize: 1024 * 1024, // 1MB
  timeoutMs: 120000, // 2 minutes
  blockedPaths: [
    /^\/(etc|sys|proc|boot|dev)\//,
    /\.ssh\/(id_|authorized_keys|known_hosts)/,
    /\.gnupg\//,
    /\.aws\/(credentials|config)$/,
    /\.kube\/config$/,
    /C:\\Windows\\(System32|SysWOW64)/i,
  ],
  blockedCommands: [
    /^mkfs\./,
    /^dd\s+if=/,
    /^:(){ :|:& };:/,  // fork bomb
    /kill\s+-9\s+1$/,
    /shutdown/,
    /reboot/,
    /halt/,
    /init\s+[06]/,
  ],
  sensitivePatterns: [
    /password\s*[:=]\s*\S+/i,
    /api[_-]?key\s*[:=]\s*\S+/i,
    /secret\s*[:=]\s*\S+/i,
    /token\s*[:=]\s*\S+/i,
    /bearer\s+[a-zA-Z0-9._-]+/i,
    /sk-[a-zA-Z0-9]{20,}/,
    /-----BEGIN\s+(RSA|EC|DSA|OPENSSH)\s+PRIVATE\s+KEY-----/,
  ],
};

export class GuardrailEngine {
  private config: GuardrailConfig;

  constructor(config?: Partial<GuardrailConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  checkToolExecution(toolName: string, input: Record<string, unknown>): GuardrailResult {
    const warnings: string[] = [];

    // Check command length
    const command = input.command as string || '';
    if (command.length > this.config.maxCommandLength) {
      return { allowed: false, reason: `Command exceeds max length (${this.config.maxCommandLength})`, warnings };
    }

    // Check blocked commands
    for (const pattern of this.config.blockedCommands) {
      if (pattern.test(command)) {
        return { allowed: false, reason: `Blocked command pattern: ${pattern.source}`, warnings };
      }
    }

    // Check file paths
    const filePath = (input.path as string) || (input.file_path as string) || '';
    for (const pattern of this.config.blockedPaths) {
      if (pattern.test(filePath)) {
        return { allowed: false, reason: `Blocked path: ${filePath}`, warnings };
      }
    }

    // Check file size
    const content = input.content as string || '';
    if (content.length > this.config.maxFileSize) {
      return { allowed: false, reason: `Content exceeds max size (${this.config.maxFileSize} bytes)`, warnings };
    }

    // Check for sensitive data in output/content
    for (const pattern of this.config.sensitivePatterns) {
      if (pattern.test(content) || pattern.test(command)) {
        warnings.push(`Sensitive data pattern detected: ${pattern.source}`);
      }
    }

    return { allowed: true, warnings, sanitized: this.sanitizeInput(input) };
  }

  private sanitizeInput(input: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...input };
    for (const key of Object.keys(sanitized)) {
      if (typeof sanitized[key] === 'string') {
        let val = sanitized[key] as string;
        for (const pattern of this.config.sensitivePatterns) {
          val = val.replace(pattern, '[REDACTED]');
        }
        sanitized[key] = val;
      }
    }
    return sanitized;
  }

  sanitizeOutput(output: string, maxLength?: number): string {
    let sanitized = output;
    for (const pattern of this.config.sensitivePatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }
    const limit = maxLength || this.config.maxOutputSize;
    if (sanitized.length > limit) {
      sanitized = sanitized.slice(0, limit) + '\n[Output truncated...]';
    }
    return sanitized;
  }

  getTimeout(): number { return this.config.timeoutMs; }
  updateConfig(config: Partial<GuardrailConfig>): void { Object.assign(this.config, config); }
}
