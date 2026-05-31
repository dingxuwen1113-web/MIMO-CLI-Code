// ── Cyber Safety Module ────────────────────────────────
// Comprehensive security analysis for MIMO CLI
// Covers: prompt injection, data exfiltration, unsafe code, dependency safety

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type FindingCategory = 'injection' | 'exfiltration' | 'unsafe-code' | 'dependencies';

export interface CyberSafetyFinding {
  category: FindingCategory;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number; // 0-1
  title: string;
  description: string;
  location?: string;
  mitigation: string;
}

export interface SecurityReport {
  riskScore: number; // 0-100
  findings: CyberSafetyFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    byCategory: Record<FindingCategory, number>;
  };
  mitigations: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// CyberSafety Class
// ═══════════════════════════════════════════════════════════════════════════════

export class CyberSafety {
  // ── Prompt Injection Detection ─────────────────────

  /**
   * Scan user input for prompt injection patterns.
   * Returns confidence score 0-1.
   */
  detectPromptInjection(input: string): CyberSafetyFinding[] {
    const findings: CyberSafetyFinding[] = [];
    if (!input || typeof input !== 'string') return findings;

    const normalized = input.toLowerCase();

    // Direct instruction override attempts
    const overridePatterns: Array<{ pattern: RegExp; title: string; confidence: number }> = [
      { pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?|constraints?)/i, title: 'Direct instruction override', confidence: 0.95 },
      { pattern: /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/i, title: 'Instruction disregard attempt', confidence: 0.95 },
      { pattern: /forget\s+(everything|all)\s+(you|about)\s+(were|have been)\s+told/i, title: 'Memory wipe attempt', confidence: 0.9 },
      { pattern: /you\s+are\s+now\s+(?:a|an|the)\s+(?:new|different|evil|malicious)/i, title: 'Role hijacking attempt', confidence: 0.85 },
      { pattern: /new\s+system\s*:\s*/i, title: 'System prompt override', confidence: 0.9 },
      { pattern: /\[system\]|\[SYSTEM\]|<\s*system\s*>/i, title: 'System tag injection', confidence: 0.85 },
      { pattern: /override\s+(safety|security|content|guard)/i, title: 'Safety override attempt', confidence: 0.9 },
      { pattern: /jailbreak|DAN\s+mode|do\s+anything\s+now/i, title: 'Jailbreak attempt', confidence: 0.95 },
      { pattern: /pretend\s+(you|that)\s+(are|have)\s+(no|zero)\s+(restrictions?|limitations?|rules?|filters?)/i, title: 'Restriction bypass attempt', confidence: 0.9 },
      { pattern: /developer\s+mode|debug\s+mode|god\s+mode/i, title: 'Privilege escalation attempt', confidence: 0.8 },
      { pattern: /repeat\s+(the\s+)?(system\s+)?(prompt|instructions?)/i, title: 'System prompt extraction', confidence: 0.85 },
      { pattern: /what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions?|rules?|guidelines?)/i, title: 'Prompt interrogation', confidence: 0.7 },
      { pattern: /output\s+(the\s+)?(full\s+)?(system\s+)?(prompt|instructions?)/i, title: 'Prompt leak attempt', confidence: 0.9 },
      { pattern: /reveal\s+(your|the)\s+(system\s+)?(prompt|instructions?|rules?)/i, title: 'Prompt reveal attempt', confidence: 0.85 },
    ];

    for (const { pattern, title, confidence } of overridePatterns) {
      if (pattern.test(input)) {
        findings.push({
          category: 'injection',
          severity: confidence >= 0.9 ? 'critical' : confidence >= 0.8 ? 'high' : 'medium',
          confidence,
          title,
          description: `Detected prompt injection attempt: "${this.extractSnippet(input, pattern)}"`,
          mitigation: 'Block or sanitize the input before processing',
        });
      }
    }

    // Encoded/obfuscated injection detection
    findings.push(...this.detectEncodedInjections(input));

    return findings;
  }

  /**
   * Scan tool outputs (web pages, fetched content) for injected instructions.
   */
  scanToolOutput(toolName: string, output: string): CyberSafetyFinding[] {
    const findings: CyberSafetyFinding[] = [];
    if (!output || typeof output !== 'string') return findings;

    const lower = output.toLowerCase();

    // Web pages that try to instruct the AI
    const webInjectionPatterns: Array<{ pattern: RegExp; title: string; confidence: number }> = [
      { pattern: /(?:ignore|disregard)\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions?|prompts?)/i, title: 'Web content instruction override', confidence: 0.9 },
      { pattern: /(?:you\s+are|act\s+as|pretend\s+to\s+be)\s+(?:now\s+)?(?:a\s+)?(?:helpful|evil|unrestricted)/i, title: 'Web content role hijack', confidence: 0.7 },
      { pattern: /\b(?:AI|assistant|bot)\s*[:;]\s*(?:ignore|forget|override|disregard)/i, title: 'AI-targeted instruction injection', confidence: 0.85 },
      { pattern: /<!--[\s\S]*?(?:ignore|override|system|instructions?)[\s\S]*?-->/i, title: 'HTML comment injection', confidence: 0.6 },
      { pattern: /<\s*(?:script|style)[^>]*>[\s\S]*?(?:ignore|override|system)[\s\S]*?<\s*\/\s*(?:script|style)>/i, title: 'Script/style tag injection', confidence: 0.5 },
      { pattern: /(?:invisible|hidden)\s+(?:text|instructions?|prompt)/i, title: 'Hidden text injection reference', confidence: 0.6 },
    ];

    for (const { pattern, title, confidence } of webInjectionPatterns) {
      if (pattern.test(output)) {
        findings.push({
          category: 'injection',
          severity: confidence >= 0.8 ? 'high' : 'medium',
          confidence,
          title,
          description: `Tool output from "${toolName}" contains potential prompt injection`,
          location: toolName,
          mitigation: 'Sanitize or truncate the tool output before including in context',
        });
      }
    }

    return findings;
  }

  /**
   * Detect encoded/obfuscated injections (base64, URL encoding, Unicode tricks).
   */
  private detectEncodedInjections(input: string): CyberSafetyFinding[] {
    const findings: CyberSafetyFinding[] = [];

    // Base64 encoded suspicious content
    const b64Pattern = /[A-Za-z0-9+/]{20,}={0,2}/g;
    let b64Match: RegExpExecArray | null;
    while ((b64Match = b64Pattern.exec(input)) !== null) {
      try {
        const decoded = Buffer.from(b64Match[0], 'base64').toString('utf-8');
        const decodedLower = decoded.toLowerCase();
        if (
          decodedLower.includes('ignore') && decodedLower.includes('instruction') ||
          decodedLower.includes('system prompt') ||
          decodedLower.includes('override') && decodedLower.includes('safety')
        ) {
          findings.push({
            category: 'injection',
            severity: 'critical',
            confidence: 0.9,
            title: 'Base64-encoded prompt injection',
            description: `Decoded content contains instruction override: "${decoded.slice(0, 100)}"`,
            mitigation: 'Decode and scan base64 content before processing',
          });
        }
      } catch { /* not valid base64, skip */ }
    }

    // URL-encoded injection attempts
    if (/%[0-9a-fA-F]{2}/.test(input)) {
      try {
        const decoded = decodeURIComponent(input);
        if (decoded !== input) {
          const decodedLower = decoded.toLowerCase();
          if (
            decodedLower.includes('ignore') && decodedLower.includes('previous') ||
            decodedLower.includes('system prompt')
          ) {
            findings.push({
              category: 'injection',
              severity: 'high',
              confidence: 0.85,
              title: 'URL-encoded prompt injection',
              description: 'URL-decoded content contains instruction override patterns',
              mitigation: 'URL-decode and re-scan before processing',
            });
          }
        }
      } catch { /* invalid encoding, skip */ }
    }

    // Unicode homoglyph tricks (Cyrillic, Greek lookalikes)
    const suspiciousUnicode = /[Ѐ-ӿͰ-Ͽ]/;
    if (suspiciousUnicode.test(input)) {
      // Check if mixing with Latin characters (homoglyph attack)
      const hasLatin = /[a-zA-Z]/.test(input);
      if (hasLatin) {
        findings.push({
          category: 'injection',
          severity: 'medium',
          confidence: 0.5,
          title: 'Unicode homoglyph obfuscation',
          description: 'Mixed script usage detected (Latin + Cyrillic/Greek) -- possible homoglyph attack',
          mitigation: 'Normalize Unicode to NFC and check for visual spoofing',
        });
      }
    }

    // Zero-width characters (used to obfuscate keywords)
    const zeroWidth = /[​‌‍⁠﻿]/;
    if (zeroWidth.test(input)) {
      findings.push({
        category: 'injection',
        severity: 'medium',
        confidence: 0.7,
        title: 'Zero-width character obfuscation',
        description: 'Zero-width characters detected -- used to bypass keyword filters',
        mitigation: 'Strip zero-width Unicode characters before processing',
      });
    }

    return findings;
  }

  // ── Data Exfiltration Detection ────────────────────

  /**
   * Monitor tool calls for suspicious data exfiltration patterns.
   */
  detectExfiltration(toolName: string, input: Record<string, any>): CyberSafetyFinding[] {
    const findings: CyberSafetyFinding[] = [];
    const inputStr = JSON.stringify(input);

    // Shell commands that send data to external services
    if (toolName === 'shell_exec') {
      const command = input.command || '';

      // Data exfil via HTTP
      const httpExfilPatterns: Array<{ pattern: RegExp; title: string; confidence: number }> = [
        { pattern: /curl\s+.*https?:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/i, title: 'Data exfiltration via curl to external URL', confidence: 0.6 },
        { pattern: /wget\s+.*https?:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/i, title: 'Data exfiltration via wget to external URL', confidence: 0.6 },
        { pattern: /\bnc\b.*-[a-z]*e/i, title: 'Netcat reverse shell / data exfiltration', confidence: 0.95 },
        { pattern: /\bncat\b.*--exec/i, title: 'Ncat exec-based exfiltration', confidence: 0.9 },
        { pattern: /\bsocat\b/i, title: 'Socket relay (possible exfiltration)', confidence: 0.7 },
      ];

      for (const { pattern, title, confidence } of httpExfilPatterns) {
        if (pattern.test(command)) {
          findings.push({
            category: 'exfiltration',
            severity: confidence >= 0.9 ? 'critical' : confidence >= 0.7 ? 'high' : 'medium',
            confidence,
            title,
            description: `Shell command may exfiltrate data: "${command.slice(0, 100)}"`,
            location: toolName,
            mitigation: 'Review the command to ensure no local data is being sent to external services',
          });
        }
      }

      // DNS exfiltration
      if (/\bdig\b|\bnslookup\b|\bhost\b/.test(command) && /\$|`/.test(command)) {
        findings.push({
          category: 'exfiltration',
          severity: 'high',
          confidence: 0.8,
          title: 'DNS-based data exfiltration',
          description: 'DNS command with variable interpolation -- data may be encoded in DNS queries',
          mitigation: 'Block DNS commands with embedded data',
        });
      }

      // Base64 encoding large blocks before sending
      if (/base64\b/.test(command) && /\bcurl\b|\bwget\b|\bnc\b/.test(command)) {
        findings.push({
          category: 'exfiltration',
          severity: 'high',
          confidence: 0.85,
          title: 'Base64 encoding with external transmission',
          description: 'Command encodes data and sends it externally',
          mitigation: 'Block commands that combine encoding with network transmission',
        });
      }
    }

    // File contents being sent in API requests
    if (toolName === 'web_fetch' || toolName === 'web_search') {
      const url = input.url || input.query || '';
      // Check if the URL contains encoded file contents (very long query params)
      if (url.length > 2000 && /[A-Za-z0-9+/=]{100,}/.test(url)) {
        findings.push({
          category: 'exfiltration',
          severity: 'high',
          confidence: 0.7,
          title: 'Large encoded data in URL',
          description: 'URL contains large encoded data blocks -- may be exfiltrating file contents',
          location: url.slice(0, 200),
          mitigation: 'Review what data is being included in the URL',
        });
      }
    }

    // Secrets in API requests
    const secretsPatterns = [
      /(?:api[_-]?key|apikey)\s*[:=]/i,
      /(?:secret|password|token)\s*[:=]/i,
      /sk-ant-/,
      /sk-[\w]{20,}/,
      /ghp_[\w]+/,
      /AKIA[\w]{16}/,
    ];
    for (const pattern of secretsPatterns) {
      if (pattern.test(inputStr)) {
        findings.push({
          category: 'exfiltration',
          severity: 'critical',
          confidence: 0.9,
          title: 'Secrets included in tool input',
          description: `Tool "${toolName}" input contains what appears to be a secret/credential`,
          mitigation: 'Remove secrets from tool inputs. Use environment variables instead.',
        });
        break; // One finding is enough
      }
    }

    return findings;
  }

  // ── Unsafe Code Pattern Detection ──────────────────

  /**
   * Check shell commands for dangerous patterns before execution.
   */
  checkShellSafety(command: string): CyberSafetyFinding[] {
    const findings: CyberSafetyFinding[] = [];
    if (!command || typeof command !== 'string') return findings;

    const dangerousPatterns: Array<{
      pattern: RegExp;
      title: string;
      severity: CyberSafetyFinding['severity'];
      confidence: number;
    }> = [
      // Data destruction
      { pattern: /\brm\s+-rf\s+\/($|\s)/, title: 'Recursive delete from root', severity: 'critical', confidence: 0.99 },
      { pattern: /\brm\s+-rf\s+~\//, title: 'Recursive delete of home directory', severity: 'critical', confidence: 0.99 },
      { pattern: /\brm\s+-rf\s+\*/, title: 'Recursive delete with wildcard', severity: 'high', confidence: 0.95 },
      { pattern: />\s*\/dev\/sd[a-z]/, title: 'Write to disk block device', severity: 'critical', confidence: 0.99 },
      { pattern: /\bmkfs\b/, title: 'Format filesystem', severity: 'critical', confidence: 0.99 },
      { pattern: /\bdd\s+if=.*of=\/dev\//, title: 'Direct disk write (dd)', severity: 'critical', confidence: 0.95 },

      // Fork bombs
      { pattern: /:\(\)\s*\{/, title: 'Fork bomb', severity: 'critical', confidence: 0.99 },
      { pattern: /\.\s*\|\s*\./, title: 'Fork bomb (dot pipe)', severity: 'critical', confidence: 0.9 },

      // Reverse shells
      { pattern: /\bnc\b.*-[a-z]*e\s*\/bin\/(ba)?sh/i, title: 'Netcat reverse shell', severity: 'critical', confidence: 0.95 },
      { pattern: /\bncat\b.*--exec\s*\/bin\/(ba)?sh/i, title: 'Ncat reverse shell', severity: 'critical', confidence: 0.95 },
      { pattern: /\/bin\/(ba)?sh\s+-i\s*>&?\s*\/dev\/tcp\//i, title: 'Bash reverse shell', severity: 'critical', confidence: 0.95 },
      { pattern: /python.*socket.*connect.*subprocess/i, title: 'Python reverse shell', severity: 'critical', confidence: 0.9 },
      { pattern: /\bsocat\b.*exec/i, title: 'Socat exec (reverse shell)', severity: 'high', confidence: 0.85 },

      // Crypto mining
      { pattern: /\bstratum\+tcp:\/\//i, title: 'Mining pool connection (crypto mining)', severity: 'critical', confidence: 0.95 },
      { pattern: /\b(?:xmrig|cpuminer|minerd|cgminer|bfgminer)\b/i, title: 'Crypto mining software', severity: 'critical', confidence: 0.99 },
      { pattern: /\b(?:hashrate|nonce|difficulty)\b.*\bmine/i, title: 'Mining-related operations', severity: 'high', confidence: 0.7 },

      // Remote code execution
      { pattern: /curl.*\|\s*(ba)?sh/i, title: 'Remote code execution (curl pipe to shell)', severity: 'critical', confidence: 0.95 },
      { pattern: /wget.*\|\s*(ba)?sh/i, title: 'Remote code execution (wget pipe to shell)', severity: 'critical', confidence: 0.95 },
      { pattern: /\beval\s*\(/, title: 'Dynamic code execution (eval)', severity: 'medium', confidence: 0.6 },

      // Privilege escalation
      { pattern: /\bchmod\s+777\s+\//, title: 'World-writable root permissions', severity: 'high', confidence: 0.9 },
      { pattern: /\bchmod\s+\+s\b/, title: 'Setuid/setgid bit modification', severity: 'high', confidence: 0.85 },
      { pattern: /\bsudo\s+.*\bvisudo\b/, title: 'Sudoers file modification', severity: 'critical', confidence: 0.9 },
    ];

    for (const { pattern, title, severity, confidence } of dangerousPatterns) {
      if (pattern.test(command)) {
        findings.push({
          category: 'unsafe-code',
          severity,
          confidence,
          title,
          description: `Dangerous command detected: "${command.slice(0, 120)}"`,
          location: 'shell_exec',
          mitigation: 'Block this command or require explicit user confirmation',
        });
      }
    }

    return findings;
  }

  /**
   * Check file operations for unsafe patterns.
   */
  checkFileSafety(operation: string, filePath: string, content?: string): CyberSafetyFinding[] {
    const findings: CyberSafetyFinding[] = [];

    // Writing to system directories
    const systemPaths = [
      /^\/etc\//i, /^\/usr\//i, /^\/bin\//i, /^\/sbin\//i,
      /^\/boot\//i, /^\/dev\//i, /^\/proc\//i, /^\/sys\//i,
      /^C:\\Windows/i, /^C:\\Program Files/i,
    ];

    for (const pattern of systemPaths) {
      if (pattern.test(filePath)) {
        findings.push({
          category: 'unsafe-code',
          severity: 'critical',
          confidence: 0.95,
          title: 'System directory write attempt',
          description: `Attempt to ${operation} in system directory: ${filePath}`,
          location: filePath,
          mitigation: 'Block writes to system directories',
        });
      }
    }

    // Overwriting critical files
    const criticalFiles = [
      /\/etc\/passwd$/i, /\/etc\/shadow$/i, /\/etc\/sudoers$/i,
      /\/etc\/ssh\/sshd_config$/i, /\/etc\/hosts$/i,
      /\.ssh\/authorized_keys$/i, /\.ssh\/id_rsa$/i,
    ];

    for (const pattern of criticalFiles) {
      if (pattern.test(filePath)) {
        findings.push({
          category: 'unsafe-code',
          severity: 'critical',
          confidence: 0.99,
          title: 'Critical file modification',
          description: `Attempt to modify critical system file: ${filePath}`,
          location: filePath,
          mitigation: 'Block modification of critical system files',
        });
      }
    }

    // Creating executable files with suspicious content
    if (content && (filePath.endsWith('.sh') || filePath.endsWith('.bash') || filePath.endsWith('.ps1') || filePath.endsWith('.bat') || filePath.endsWith('.cmd'))) {
      const suspiciousContent = [
        { pattern: /\bcurl\b.*\|\s*(ba)?sh/i, title: 'Executable downloads and runs remote code' },
        { pattern: /\bwget\b.*\|\s*(ba)?sh/i, title: 'Executable downloads and runs remote code' },
        { pattern: /\beval\s*\(/i, title: 'Executable uses eval for dynamic code execution' },
        { pattern: /\bbase64\s+.*-d/i, title: 'Executable decodes and runs base64 content' },
        { pattern: /\bnc\b.*-[a-z]*e/i, title: 'Executable creates reverse shell' },
      ];

      for (const { pattern, title } of suspiciousContent) {
        if (pattern.test(content)) {
          findings.push({
            category: 'unsafe-code',
            severity: 'high',
            confidence: 0.8,
            title,
            description: `Executable file "${path.basename(filePath)}" contains suspicious content`,
            location: filePath,
            mitigation: 'Review executable content before writing',
          });
        }
      }
    }

    return findings;
  }

  /**
   * Check git operations for unsafe patterns.
   */
  checkGitSafety(operation: string, args: Record<string, any>): CyberSafetyFinding[] {
    const findings: CyberSafetyFinding[] = [];

    // Force push to main/master
    if (operation === 'push') {
      const branch = args.branch || args.target || '';
      const force = args.force || args['--force'] || false;
      if (force && (branch === 'main' || branch === 'master' || branch === 'production')) {
        findings.push({
          category: 'unsafe-code',
          severity: 'critical',
          confidence: 0.95,
          title: 'Force push to protected branch',
          description: `Force push to ${branch} may destroy other developers' work`,
          mitigation: 'Use regular push or create a PR instead',
        });
      }
    }

    // Deleting remote branches with unmerged changes
    if (operation === 'branch' && args.action === 'delete') {
      if (args.remote || args.D) {
        findings.push({
          category: 'unsafe-code',
          severity: 'high',
          confidence: 0.8,
          title: 'Remote branch deletion',
          description: 'Deleting a remote branch may discard unmerged changes',
          mitigation: 'Ensure branch is fully merged before deleting remotely',
        });
      }
    }

    // Reset --hard
    if (operation === 'reset' && (args.hard || args['--hard'])) {
      findings.push({
        category: 'unsafe-code',
        severity: 'high',
        confidence: 0.9,
        title: 'Hard reset (destructive)',
        description: 'Hard reset discards all uncommitted changes',
        mitigation: 'Consider using --mixed or --soft reset, or stash changes first',
      });
    }

    return findings;
  }

  // ── Dependency Safety ──────────────────────────────

  /**
   * Check package operations for typosquatting and suspicious packages.
   */
  checkDependencySafety(packageName: string, registry?: string): CyberSafetyFinding[] {
    const findings: CyberSafetyFinding[] = [];

    // Common typosquats of popular packages
    const typosquatMap: Record<string, string[]> = {
      'express': ['expres', 'expess', 'exprees', 'expresst'],
      'lodash': ['lodahs', 'lodas', 'lodasn', 'lodush'],
      'react': ['raect', 'reac', 'reacr', 'reacxt'],
      'axios': ['axois', 'axious', 'axiox'],
      'webpack': ['webpakc', 'webpac', 'webpach'],
      'typescript': ['typescirpt', 'typesript', 'typscript'],
      'moment': ['momnet', 'momnet', 'momet'],
      'chalk': ['chalke', 'chalkjs', 'chakl'],
      'commander': ['comander', 'commandr', 'commader'],
      'dotenv': ['dotevnt', 'doenv', 'dotnev'],
      'body-parser': ['bodyparser', 'body-paser', 'body-parse'],
      'mongoose': ['mongoos', 'mongoosse', 'mongose'],
      'sequelize': ['sequelze', 'sequalize', 'sequlize'],
      'bcrypt': ['bycrypt', 'brcypt', 'bcrpt'],
      'jsonwebtoken': ['jsonwebtokn', 'jwt-token', 'jsonwebtokenn'],
      'node-fetch': ['nodefethc', 'node-fecth', 'nodefeth'],
      'uuid': ['uuidv4', 'uud', 'uuiid'],
    };

    for (const [legit, squats] of Object.entries(typosquatMap)) {
      if (squats.includes(packageName.toLowerCase())) {
        findings.push({
          category: 'dependencies',
          severity: 'critical',
          confidence: 0.85,
          title: `Possible typosquat: "${packageName}" vs "${legit}"`,
          description: `Package "${packageName}" may be a typosquat of the popular package "${legit}"`,
          mitigation: `Did you mean to install "${legit}"? Typosquat packages may contain malicious code.`,
        });
      }
    }

    // Unknown registry warning
    if (registry && !this.isKnownRegistry(registry)) {
      findings.push({
        category: 'dependencies',
        severity: 'high',
        confidence: 0.7,
        title: 'Unknown package registry',
        description: `Package from unknown registry: ${registry}`,
        mitigation: 'Verify the registry is trustworthy before installing packages from it',
      });
    }

    // Very short or very new package names (suspicious single-char or random names)
    if (packageName.length <= 2) {
      findings.push({
        category: 'dependencies',
        severity: 'medium',
        confidence: 0.5,
        title: 'Very short package name',
        description: `Package "${packageName}" has an unusually short name -- verify it is the intended package`,
        mitigation: 'Double-check the package name',
      });
    }

    // Scoped vs unscoped confusion
    if (packageName.startsWith('@') && !packageName.includes('/')) {
      findings.push({
        category: 'dependencies',
        severity: 'medium',
        confidence: 0.6,
        title: 'Malformed scoped package name',
        description: `Scoped package "${packageName}" is missing the / delimiter`,
        mitigation: 'Scoped packages must follow @scope/name format',
      });
    }

    return findings;
  }

  /**
   * Check package.json changes for suspicious additions.
   */
  async checkPackageJson(projectDir: string): Promise<CyberSafetyFinding[]> {
    const findings: CyberSafetyFinding[] = [];
    const packageJsonPath = path.join(projectDir, 'package.json');

    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);

      // Check all dependency types
      const depTypes = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

      for (const depType of depTypes) {
        const deps = pkg[depType] || {};
        for (const [name, version] of Object.entries(deps)) {
          // Run typosquat check
          const squatFindings = this.checkDependencySafety(name);
          findings.push(...squatFindings);

          // Check for install scripts (pre/post install hooks are a common attack vector)
          // This is done by checking if the package name is known to abuse install scripts
          const riskyPatterns = [
            /^pre-|^post-/, // packages that look like pre/post hooks
            /^install-|^setup-/, // packages that look like install helpers
          ];
          for (const pattern of riskyPatterns) {
            if (pattern.test(name)) {
              findings.push({
                category: 'dependencies',
                severity: 'medium',
                confidence: 0.4,
                title: 'Potentially risky package name pattern',
                description: `Package "${name}" name pattern suggests it may run install scripts`,
                mitigation: 'Review the package source before installing',
              });
            }
          }
        }
      }

      // Check for suspicious scripts
      const scripts = pkg.scripts || {};
      const suspiciousScriptPatterns: Array<{ pattern: RegExp; title: string }> = [
        { pattern: /curl.*\|\s*(ba)?sh/i, title: 'Install script downloads and runs remote code' },
        { pattern: /wget.*\|\s*(ba)?sh/i, title: 'Install script downloads and runs remote code' },
        { pattern: /\beval\s*\(/, title: 'Install script uses eval' },
        { pattern: /\bbase64\s+.*-d.*\|\s*(ba)?sh/i, title: 'Install script decodes and runs base64' },
        { pattern: /node\s+-e\s+['"]/i, title: 'Install script runs inline Node.js code' },
      ];

      for (const [scriptName, scriptContent] of Object.entries(scripts)) {
        if (typeof scriptContent !== 'string') continue;
        for (const { pattern, title } of suspiciousScriptPatterns) {
          if (pattern.test(scriptContent)) {
            findings.push({
              category: 'dependencies',
              severity: 'high',
              confidence: 0.8,
              title,
              description: `Script "${scriptName}" contains suspicious pattern: "${scriptContent.slice(0, 100)}"`,
              location: `package.json scripts.${scriptName}`,
              mitigation: 'Review the script content before running npm install',
            });
          }
        }
      }
    } catch {
      // package.json doesn't exist or is invalid -- not a finding
    }

    return findings;
  }

  private isKnownRegistry(registry: string): boolean {
    const knownRegistries = [
      'https://registry.npmjs.org',
      'https://registry.yarnpkg.com',
      'https://npm.pkg.github.com',
      'https://npm.fontawesome.com',
      'https://registry.npmmirror.com',
      'https://artifactory.',
      'https://pkgs.dev.azure.com',
    ];
    return knownRegistries.some((kr) => registry.startsWith(kr));
  }

  // ── Comprehensive Scan ────────────────────────────

  /**
   * Run a comprehensive security scan on the current project.
   */
  async comprehensiveScan(
    target: string,
    categories: FindingCategory[],
    projectDir?: string
  ): Promise<SecurityReport> {
    const allFindings: CyberSafetyFinding[] = [];
    const cwd = projectDir || process.cwd();

    if (categories.includes('dependencies')) {
      const depFindings = await this.checkPackageJson(cwd);
      allFindings.push(...depFindings);
    }

    if (categories.includes('unsafe-code') && target === 'codebase') {
      // Scan shell scripts in the project
      try {
        const { stdout } = await execAsync(
          'find . -maxdepth 3 -name "*.sh" -o -name "*.bash" -o -name "*.ps1" 2>/dev/null | head -20',
          { cwd, timeout: 5000 }
        );
        const scripts = stdout.trim().split('\n').filter(Boolean);
        for (const script of scripts) {
          try {
            const content = await fs.readFile(path.join(cwd, script), 'utf-8');
            const fileFindings = this.checkFileSafety('read', script, content);
            allFindings.push(...fileFindings);
          } catch { /* skip */ }
        }
      } catch { /* find not available, skip */ }
    }

    if (target === 'diff') {
      // Scan the current git diff
      try {
        const { stdout } = await execAsync('git diff --no-color', { cwd, timeout: 10000 });
        if (stdout) {
          // Check for secrets in the diff
          const secretPatterns = [
            /(?:api[_-]?key|apikey)\s*[:=]\s*["']?[\w-]{20,}/gi,
            /(?:secret|password|passwd|pwd)\s*[:=]\s*["']?[^\s,;"'}{]{8,}/gi,
            /sk-ant-[\w-]{20,}/g,
            /AKIA[\w]{16}/g,
            /ghp_[\w]{30,}/g,
          ];

          for (const pattern of secretPatterns) {
            const regex = new RegExp(pattern.source, pattern.flags);
            let match: RegExpExecArray | null;
            while ((match = regex.exec(stdout)) !== null) {
              allFindings.push({
                category: 'exfiltration',
                severity: 'critical',
                confidence: 0.9,
                title: 'Secret in git diff',
                description: 'Git diff contains what appears to be a secret or credential',
                mitigation: 'Remove the secret from the diff before committing. Rotate the compromised credential.',
              });
              break; // One finding per pattern type
            }
          }
        }
      } catch { /* not a git repo, skip */ }
    }

    return this.buildReport(allFindings);
  }

  // ── Report Generation ──────────────────────────────

  private buildReport(findings: CyberSafetyFinding[]): SecurityReport {
    const summary = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      byCategory: {
        injection: 0,
        exfiltration: 0,
        'unsafe-code': 0,
        dependencies: 0,
      } as Record<FindingCategory, number>,
    };

    for (const f of findings) {
      summary[f.severity]++;
      summary.byCategory[f.category]++;
    }

    // Risk score: weighted by severity
    const riskScore = Math.min(100,
      summary.critical * 25 + summary.high * 10 + summary.medium * 3 + summary.low * 1
    );

    // Deduplicate mitigations
    const mitigationSet = new Set<string>();
    for (const f of findings) {
      mitigationSet.add(f.mitigation);
    }

    return {
      riskScore,
      findings,
      summary,
      mitigations: Array.from(mitigationSet),
    };
  }

  /**
   * Format a security report as human-readable text.
   */
  formatReport(report: SecurityReport): string {
    const lines: string[] = [];

    lines.push(`Security Scan Report`);
    lines.push(`Risk Score: ${report.riskScore}/100`);
    lines.push('');

    lines.push(`Summary: ${report.summary.critical} critical, ${report.summary.high} high, ${report.summary.medium} medium, ${report.summary.low} low`);
    lines.push(`Categories: injection=${report.summary.byCategory.injection}, exfiltration=${report.summary.byCategory.exfiltration}, unsafe-code=${report.summary.byCategory['unsafe-code']}, dependencies=${report.summary.byCategory.dependencies}`);
    lines.push('');

    if (report.findings.length === 0) {
      lines.push('No security issues found.');
      return lines.join('\n');
    }

    const severityIcons: Record<string, string> = {
      critical: '[CRITICAL]',
      high: '[HIGH]',
      medium: '[MEDIUM]',
      low: '[LOW]',
    };

    for (const finding of report.findings) {
      lines.push(`${severityIcons[finding.severity]} [${finding.category}] ${finding.title} (confidence: ${Math.round(finding.confidence * 100)}%)`);
      lines.push(`  ${finding.description}`);
      if (finding.location) {
        lines.push(`  Location: ${finding.location}`);
      }
      lines.push(`  Mitigation: ${finding.mitigation}`);
      lines.push('');
    }

    if (report.mitigations.length > 0) {
      lines.push('Recommended Mitigations:');
      for (let i = 0; i < report.mitigations.length; i++) {
        lines.push(`  ${i + 1}. ${report.mitigations[i]}`);
      }
    }

    return lines.join('\n');
  }

  // ── Helpers ────────────────────────────────────────

  private extractSnippet(input: string, pattern: RegExp): string {
    const match = pattern.exec(input);
    if (!match) return input.slice(0, 80);
    const start = Math.max(0, match.index - 10);
    const end = Math.min(input.length, match.index + match[0].length + 10);
    return input.slice(start, end).replace(/\n/g, ' ');
  }
}
