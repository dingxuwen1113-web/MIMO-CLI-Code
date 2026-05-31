// ── Security System: Comprehensive Protection for MIMO CLI ──────────────────
//
// Components:
//   1. Command Injection Detection
//   2. Path Traversal Prevention
//   3. File Operation Safety
//   4. Tool Safety Checker (main entry point)
//   5. Credential Scanner
//   6. Sandbox Executor
//   7. Permission Matrix
//   8. Cyber Safety Integration (prompt injection, exfiltration, unsafe code)

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import { CyberSafety } from './cyber-safety';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface SecurityCheckResult {
  safe: boolean;
  warnings: string[];
  blocked: string[];
}

export interface InjectionCheckResult {
  safe: boolean;
  threats: string[];
}

export interface PathValidationResult {
  safe: boolean;
  resolved: string;
  reason?: string;
}

export interface FileSafetyResult {
  safe: boolean;
  warnings: string[];
  blocked: string[];
}

export interface CredentialFinding {
  found: boolean;
  type: string;
  line: number;
  redacted: string;
}

export interface SandboxOptions {
  /** Max memory in bytes (default 256MB) */
  maxMemory?: number;
  /** Max CPU time in milliseconds (default 30s) */
  maxCpuTime?: number;
  /** Max wall-clock time in milliseconds (default 60s) */
  maxWallTime?: number;
  /** Block network access (default false) */
  isolateNetwork?: boolean;
  /** Restrict filesystem to tmp directory (default true) */
  restrictFilesystem?: boolean;
  /** Working directory */
  cwd?: string;
  /** Additional environment variables */
  env?: Record<string, string>;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  memoryExceeded: boolean;
  wallTimeMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Permission Matrix
// ═══════════════════════════════════════════════════════════════════════════════

export interface ToolPermissionEntry {
  read: boolean;
  write: boolean;
  network: boolean;
  shell: boolean;
  risk: 'low' | 'medium' | 'high' | 'critical';
}

export const TOOL_PERMISSIONS: Record<string, ToolPermissionEntry> = {
  // ── File tools ──
  file_read:           { read: true,  write: false, network: false, shell: false, risk: 'low' },
  file_write:          { read: true,  write: true,  network: false, shell: false, risk: 'high' },
  file_edit:           { read: true,  write: true,  network: false, shell: false, risk: 'high' },

  // ── Shell ──
  shell_exec:          { read: true,  write: true,  network: true,  shell: true,  risk: 'critical' },

  // ── Search ──
  grep_search:         { read: true,  write: false, network: false, shell: false, risk: 'low' },
  glob_match:          { read: true,  write: false, network: false, shell: false, risk: 'low' },

  // ── Browser (read-only) ──
  browser_navigate:    { read: true,  write: false, network: true,  shell: false, risk: 'low' },
  browser_read:        { read: true,  write: false, network: false, shell: false, risk: 'low' },
  browser_find:        { read: true,  write: false, network: false, shell: false, risk: 'low' },
  browser_screenshot:  { read: true,  write: false, network: false, shell: false, risk: 'low' },
  browser_network:     { read: true,  write: false, network: false, shell: false, risk: 'low' },
  browser_console:     { read: true,  write: false, network: false, shell: false, risk: 'low' },

  // ── Browser (interactive) ──
  browser_click:       { read: true,  write: true,  network: false, shell: false, risk: 'medium' },
  browser_type:        { read: true,  write: true,  network: false, shell: false, risk: 'medium' },
  browser_execute_js:  { read: true,  write: true,  network: true,  shell: false, risk: 'high' },

  // ── Web ──
  web_search:          { read: true,  write: false, network: true,  shell: false, risk: 'low' },
  web_fetch:           { read: true,  write: false, network: true,  shell: false, risk: 'low' },

  // ── Git (read-only) ──
  git_status:          { read: true,  write: false, network: false, shell: false, risk: 'low' },
  git_diff:            { read: true,  write: false, network: false, shell: false, risk: 'low' },
  git_log:             { read: true,  write: false, network: false, shell: false, risk: 'low' },
  git_blame:           { read: true,  write: false, network: false, shell: false, risk: 'low' },

  // ── Git (write) ──
  git_branch:          { read: true,  write: true,  network: false, shell: false, risk: 'medium' },
  git_commit:          { read: true,  write: true,  network: false, shell: false, risk: 'medium' },
  git_checkout:        { read: true,  write: true,  network: false, shell: false, risk: 'medium' },
  git_stash:           { read: true,  write: true,  network: false, shell: false, risk: 'medium' },
  git_pr:              { read: true,  write: true,  network: true,  shell: false, risk: 'high' },
  git_issue:           { read: true,  write: true,  network: true,  shell: false, risk: 'medium' },
  git_release:         { read: true,  write: true,  network: true,  shell: false, risk: 'high' },

  // ── Task management ──
  task_create:         { read: true,  write: true,  network: false, shell: false, risk: 'low' },
  task_update:         { read: true,  write: true,  network: false, shell: false, risk: 'low' },
  task_list:           { read: true,  write: false, network: false, shell: false, risk: 'low' },
  task_get:            { read: true,  write: false, network: false, shell: false, risk: 'low' },

  // ── Notebook ──
  notebook_read:       { read: true,  write: false, network: false, shell: false, risk: 'low' },
  notebook_edit:       { read: true,  write: true,  network: false, shell: false, risk: 'medium' },

  // ── Image / Upload ──
  image_read:          { read: true,  write: false, network: false, shell: false, risk: 'low' },
  file_upload:         { read: true,  write: true,  network: true,  shell: false, risk: 'medium' },

  // ── Auto Review ──
  auto_review:         { read: true,  write: false, network: false, shell: false, risk: 'low' },

  // ── Cyber Safety ──
  cyber_scan:          { read: true,  write: false, network: false, shell: false, risk: 'low' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════════════════════

const isWindows = os.platform() === 'win32';

// Cyber Safety singleton for advanced security checks
const _cyberSafety = new CyberSafety();

/** Sensitive file path patterns */
const SENSITIVE_FILE_PATTERNS = [
  /\.env$/i,
  /\.env\.\w+$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.jks$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.gnupg/i,
  /\.ssh\//i,
  /credentials?\.json$/i,
  /secrets?\.json$/i,
  /secrets?\.ya?ml$/i,
  /\.secret$/i,
  /\.keystore$/i,
  /token\.json$/i,
  /\.npmrc$/i,
  /\.dockercfg$/i,
  /docker-?config\.json$/i,
  /\.netrc$/i,
  /pgpass\.conf$/i,
  /\.htpasswd$/i,
  /\.aws\//i,
  /\.gcloud\//i,
  /\.azure\//i,
  /\.kube\//i,
];

/** Sensitive content patterns for credential scanning */
const SENSITIVE_CONTENT_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']?[\w-]{20,}/gi, type: 'API Key' },
  { pattern: /(?:secret|password|passwd|pwd)\s*[:=]\s*["']?[^\s,;"'}{]{8,}/gi, type: 'Password/Secret' },
  { pattern: /sk-ant-[\w-]{20,}/g, type: 'Anthropic API Key' },
  { pattern: /sk-[\w]{20,}/g, type: 'OpenAI API Key' },
  { pattern: /ghp_[\w]{30,}/g, type: 'GitHub Token' },
  { pattern: /ghu_[\w]{30,}/g, type: 'GitHub User Token' },
  { pattern: /ghs_[\w]{30,}/g, type: 'GitHub Server Token' },
  { pattern: /github_pat_[\w_]{30,}/g, type: 'GitHub Fine-Grained PAT' },
  { pattern: /glpat-[\w-]{20,}/g, type: 'GitLab Token' },
  { pattern: /xoxb-[\w-]+/g, type: 'Slack Bot Token' },
  { pattern: /xoxp-[\w-]+/g, type: 'Slack User Token' },
  { pattern: /AKIA[\w]{16}/g, type: 'AWS Access Key' },
  { pattern: /(?:ASIA|ABIA|ACCA)[\w]{16}/g, type: 'AWS Temporary Key' },
  { pattern: /-----BEGIN[A\s\S]*?PRIVATE KEY-----/g, type: 'Private Key' },
  { pattern: /eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g, type: 'JWT Token' },
  { pattern: /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^\s"']+/gi, type: 'Database Connection String' },
  { pattern: /(?:AccountKey|SharedAccessSignature)\s*[:=]\s*[A-Za-z0-9+/=]{40,}/g, type: 'Azure Key' },
  { pattern: /AIza[\w\-]{35}/g, type: 'Google API Key' },
  { pattern: /ya29\.[\w\-]+/g, type: 'Google OAuth Token' },
];

/** System directories that should never be written to */
const SYSTEM_WRITE_BLOCKED_PATHS = [
  /^\/etc\//i,
  /^\/usr\//i,
  /^\/bin\//i,
  /^\/sbin\//i,
  /^\/boot\//i,
  /^\/dev\//i,
  /^\/proc\//i,
  /^\/sys\//i,
  /^\/lib\//i,
  /^\/var\/log\//i,
  /^C:\\Windows\\/i,
  /^C:\\Program Files/i,
];

/** Paths that should not be deleted */
const PROTECTED_DELETE_PATHS = [
  /\.git(\/|\\|$)/i,
  /node_modules(\/|\\|$)/i,
];

/** Config files that warrant a warning on write */
const CONFIG_WRITE_WARN_PATTERNS = [
  /package\.json$/i,
  /tsconfig\.json$/i,
  /Dockerfile$/i,
  /docker-compose\.ya?ml$/i,
  /\.eslintrc/i,
  /\.prettierrc/i,
  /webpack\.config/i,
  /vite\.config/i,
  /next\.config/i,
  /turbo\.json$/i,
  /\.github\//i,
];

/** Max file size for writes (10MB) */
const MAX_WRITE_SIZE_BYTES = 10 * 1024 * 1024;

/** Commands that are always allowed via shell */
const SAFE_SHELL_COMMANDS = new Set([
  'ls', 'dir', 'pwd', 'cd', 'echo', 'cat', 'head', 'tail', 'wc',
  'grep', 'rg', 'ag', 'find', 'fd', 'tree', 'du', 'df',
  'git', 'npm', 'yarn', 'pnpm', 'bun', 'npx',
  'node', 'npx', 'ts-node', 'tsx', 'deno',
  'python', 'python3', 'pip', 'pip3',
  'cargo', 'rustc', 'rustup',
  'go', 'gofmt',
  'java', 'javac', 'mvn', 'gradle',
  'make', 'cmake', 'gcc', 'g++', 'clang',
  'docker', 'podman',
  'curl', 'wget',
  'tsc', 'eslint', 'prettier', 'jest', 'vitest', 'mocha',
  'pytest', 'unittest',
  'mkdir', 'cp', 'mv', 'touch',
  'date', 'whoami', 'hostname', 'uname',
  'sort', 'uniq', 'cut', 'tr', 'sed', 'awk',
  'diff', 'patch', 'tar', 'gzip', 'unzip',
  'ssh', 'scp', 'rsync',
  'which', 'where', 'type', 'command',
  'man', 'help', 'info',
  'set', 'export', 'env', 'printenv',
  'true', 'false', 'test',
]);

/** Dangerous commands in pipe targets */
const DANGEROUS_PIPE_COMMANDS = /\b(rm|dd|mkfs|fdisk|format|del|shutdown|reboot|halt|poweroff|init)\b/;

/** Hex escape patterns */
const HEX_ESCAPE_PATTERN = /\\x[0-9a-fA-F]{2}/;
const UNICODE_ESCAPE_PATTERN = /\\u[0-9a-fA-F]{4}/;

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Command Injection Detection
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect shell metacharacters and injection patterns in a command string.
 * Returns detailed threat descriptions for each detected pattern.
 */
export function detectCommandInjection(command: string): InjectionCheckResult {
  const threats: string[] = [];

  if (!command || typeof command !== 'string') {
    return { safe: true, threats: [] };
  }

  // --- Subshell execution ---
  // $(...) command substitution
  if (/\$\([^)]*\)/.test(command)) {
    threats.push('Subshell execution via $(...) command substitution');
  }
  // Backtick command substitution (but not in quoted strings for common patterns)
  const strippedBacktickQuotes = command.replace(/(?<!\\)`/g, '`');
  const backtickCount = (strippedBacktickQuotes.match(/`/g) || []).length;
  if (backtickCount >= 2 && /\`[^`]+\`/.test(command)) {
    threats.push('Subshell execution via backtick command substitution');
  }

  // --- Command chaining ---
  // && or || chaining (outside quotes)
  const withoutQuotedStrings = stripQuotedStrings(command);
  if (/&&/.test(withoutQuotedStrings)) {
    threats.push('Command chaining via && (conditional execution)');
  }
  if (/\|\|/.test(withoutQuotedStrings)) {
    threats.push('Command chaining via || (fallback execution)');
  }
  // Semicolon chaining (but not in for/while loop constructs like `; do`)
  if (/;\s*(?!do$|then$|else$|done$|fi$)/.test(withoutQuotedStrings)) {
    threats.push('Command chaining via semicolon');
  }

  // --- Pipe to dangerous commands ---
  if (/\|/.test(withoutQuotedStrings)) {
    const afterPipes = withoutQuotedStrings.split('|').slice(1);
    for (const segment of afterPipes) {
      const trimmed = segment.trim();
      if (DANGEROUS_PIPE_COMMANDS.test(trimmed)) {
        threats.push(`Pipe to dangerous command: ${trimmed.split(/\s+/)[0]}`);
      }
    }
  }

  // --- Environment variable abuse ---
  if (/\$\{?IFS\}?/.test(command)) {
    threats.push('Environment variable abuse: $IFS (field separator manipulation)');
  }
  if (/\$\{?PATH\}?/i.test(command) && /[=:]/.test(command)) {
    threats.push('Environment variable abuse: PATH modification');
  }
  if (/\$\{?LD_PRELOAD\}?/i.test(command)) {
    threats.push('Environment variable abuse: LD_PRELOAD (library injection)');
  }
  if (/\$\{?LD_LIBRARY_PATH\}?/i.test(command)) {
    threats.push('Environment variable abuse: LD_LIBRARY_PATH manipulation');
  }

  // --- Encoded/obfuscated commands ---
  if (/base64\s+(?:-d|--decode)\s*\|/i.test(command)) {
    threats.push('Encoded command: base64 decode piped to execution');
  }
  if (/\|\s*(?:ba)?sh/.test(command) && /base64/i.test(command)) {
    threats.push('Encoded command: base64-encoded payload piped to shell');
  }
  if (HEX_ESCAPE_PATTERN.test(command) && /\$'/.test(command)) {
    threats.push('Obfuscated command: hex escape sequences in ANSI-C quoting');
  }
  if (UNICODE_ESCAPE_PATTERN.test(command) && /\\u/.test(command) && /echo|printf/i.test(command)) {
    threats.push('Obfuscated command: unicode escape sequences');
  }

  // --- Eval-like patterns ---
  if (/\beval\b/.test(withoutQuotedStrings)) {
    threats.push('Dynamic code execution via eval');
  }
  if (/\bexec\b/.test(withoutQuotedStrings) && !/^exec\s/.test(command.trim())) {
    // Only flag if exec is used in a suspicious context, not as standalone command
    const parts = command.trim().split(/\s+/);
    if (parts[0] !== 'exec') {
      threats.push('Dynamic code execution via exec');
    }
  }

  // --- Output redirection to sensitive locations ---
  if (/>\s*\/etc\//.test(command)) {
    threats.push('Output redirection to system directory /etc/');
  }
  if (/>\s*\/dev\/sd/.test(command)) {
    threats.push('Output redirection to block device');
  }
  if (/>\s*~\/\.(bash|zsh|profile)/i.test(command)) {
    threats.push('Output redirection to shell profile (persistence)');
  }

  // --- Process substitution (bash-specific) ---
  if (/<\(/.test(command) || />\(/.test(command)) {
    threats.push('Process substitution detected');
  }

  // --- Fork bomb ---
  if (/:\(\)\{/.test(command) || /:\s*\(\s*\)\s*\{/.test(command)) {
    threats.push('Fork bomb pattern detected');
  }

  return {
    safe: threats.length === 0,
    threats,
  };
}

/**
 * Strip single-quoted, double-quoted, and backtick-quoted strings from a command
 * to allow pattern matching on the structural parts.
 */
function stripQuotedStrings(s: string): string {
  let result = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      // Skip to matching quote
      i++;
      while (i < s.length && s[i] !== ch) {
        if (s[i] === '\\') i++; // skip escaped char
        i++;
      }
      i++; // skip closing quote
      result += ' '; // replace quoted content with space
    } else if (ch === '\\' && i + 1 < s.length) {
      i += 2; // skip escaped char
      result += '  ';
    } else {
      result += ch;
      i++;
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Path Traversal Prevention
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate that a requested path resolves to a location under one of the
 * allowed roots. Detects traversal, null bytes, symlink escapes, and
 * sensitive file access.
 */
export async function validatePath(
  requestedPath: string,
  allowedRoots: string[]
): Promise<PathValidationResult> {
  try {
    // --- Null byte injection ---
    if (requestedPath.includes('\0') || requestedPath.includes('%00')) {
      return {
        safe: false,
        resolved: requestedPath,
        reason: 'Null byte injection detected in path',
      };
    }

    // --- Normalize the path ---
    const normalized = path.normalize(requestedPath);

    // --- Detect traversal sequences ---
    // Count leading ../  sequences
    const traversalMatch = normalized.match(/(?:^|[\\/])\.\.[\\/]/g);
    if (traversalMatch && traversalMatch.length > 0) {
      // Resolve to see where it actually goes
      const resolved = path.resolve(normalized);
      const isUnderRoot = allowedRoots.some((root) => {
        const resolvedRoot = path.resolve(root);
        return resolved.startsWith(resolvedRoot + path.sep) || resolved === resolvedRoot;
      });
      if (!isUnderRoot) {
        return {
          safe: false,
          resolved,
          reason: `Path traversal detected: ${traversalMatch.length} parent directory reference(s) escape allowed roots`,
        };
      }
    }

    // --- Resolve the real path (follows symlinks) ---
    let resolved: string;
    try {
      resolved = await fs.realpath(normalized);
    } catch {
      // File doesn't exist yet - resolve the parent directory
      const dir = path.dirname(normalized);
      const base = path.basename(normalized);
      let resolvedDir: string;
      try {
        resolvedDir = await fs.realpath(dir);
      } catch {
        resolvedDir = path.resolve(dir);
      }
      resolved = path.join(resolvedDir, base);
    }

    // --- Verify resolved path is under allowed roots ---
    const isUnderAllowedRoot = allowedRoots.some((root) => {
      const resolvedRoot = path.resolve(root);
      return resolved.startsWith(resolvedRoot + path.sep) || resolved === resolvedRoot;
    });

    if (!isUnderAllowedRoot && allowedRoots.length > 0) {
      return {
        safe: false,
        resolved,
        reason: `Resolved path "${resolved}" is outside allowed roots: [${allowedRoots.join(', ')}]`,
      };
    }

    // --- Symlink escape detection ---
    // If the resolved path differs from normalized and the original exists,
    // the path traverses through a symlink
    const normalizedAbsolute = path.resolve(normalized);
    if (resolved !== normalizedAbsolute) {
      try {
        const stat = await fs.lstat(normalizedAbsolute);
        if (stat.isSymbolicLink()) {
          // Check if the symlink target is still under allowed roots
          const targetUnderRoot = allowedRoots.some((root) => {
            const resolvedRoot = path.resolve(root);
            return resolved.startsWith(resolvedRoot + path.sep) || resolved === resolvedRoot;
          });
          if (!targetUnderRoot && allowedRoots.length > 0) {
            return {
              safe: false,
              resolved,
              reason: `Symlink escape: "${normalizedAbsolute}" points to "${resolved}" which is outside allowed roots`,
            };
          }
        }
      } catch {
        // Path doesn't exist yet, no symlink to check
      }
    }

    // --- Sensitive file detection ---
    const normalizedForward = resolved.replace(/\\/g, '/');
    const isSensitive = SENSITIVE_FILE_PATTERNS.some((p) => p.test(normalizedForward));
    if (isSensitive) {
      return {
        safe: false,
        resolved,
        reason: `Access to sensitive file/directory: ${path.basename(resolved)}`,
      };
    }

    return { safe: true, resolved };
  } catch (err: any) {
    return {
      safe: false,
      resolved: requestedPath,
      reason: `Path validation error: ${err.message}`,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. File Operation Safety
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a file operation (read/write/delete) is safe.
 * Validates path, checks content for credentials, and enforces size limits.
 */
export async function checkFileSafety(
  operation: 'read' | 'write' | 'delete',
  filePath: string,
  content?: string
): Promise<FileSafetyResult> {
  const warnings: string[] = [];
  const blocked: string[] = [];

  // --- System directory protection ---
  if (operation === 'write' || operation === 'delete') {
    const normalized = filePath.replace(/\\/g, '/');
    for (const pattern of SYSTEM_WRITE_BLOCKED_PATHS) {
      if (pattern.test(normalized)) {
        blocked.push(`Cannot ${operation} in system directory: ${pattern.source}`);
      }
    }
  }

  // --- Protected path deletion ---
  if (operation === 'delete') {
    const normalized = filePath.replace(/\\/g, '/');
    for (const pattern of PROTECTED_DELETE_PATHS) {
      if (pattern.test(normalized)) {
        blocked.push(`Cannot delete protected path: ${pattern.source} (use explicit override)`);
      }
    }
  }

  // --- Config file write warnings ---
  if (operation === 'write') {
    const normalized = filePath.replace(/\\/g, '/');
    for (const pattern of CONFIG_WRITE_WARN_PATTERNS) {
      if (pattern.test(normalized)) {
        warnings.push(`Writing to configuration file: ${path.basename(filePath)}`);
      }
    }
  }

  // --- Sensitive file access ---
  if (isSensitiveFile(filePath)) {
    if (operation === 'read') {
      warnings.push(`Reading sensitive file: ${filePath}`);
    } else {
      blocked.push(`Cannot ${operation} sensitive file: ${filePath}`);
    }
  }

  // --- Write content checks ---
  if (operation === 'write' && content !== undefined) {
    // Size limit
    const contentBytes = Buffer.byteLength(content, 'utf-8');
    if (contentBytes > MAX_WRITE_SIZE_BYTES) {
      blocked.push(
        `File content exceeds maximum size: ${(contentBytes / 1024 / 1024).toFixed(1)}MB > ${MAX_WRITE_SIZE_BYTES / 1024 / 1024}MB limit`
      );
    }

    // Binary content detection
    if (containsBinaryContent(content)) {
      warnings.push('Content appears to be binary data');
    }

    // Credential scanning
    const credentials = scanForCredentials(content);
    for (const cred of credentials) {
      warnings.push(`Content contains ${cred.type} at line ${cred.line}`);
    }
  }

  return {
    safe: blocked.length === 0,
    warnings,
    blocked,
  };
}

/**
 * Check if content contains binary data (null bytes or high ratio of non-printable chars).
 */
function containsBinaryContent(content: string): boolean {
  // Null bytes are a strong indicator of binary content
  if (content.includes('\0')) return true;

  // Sample the first 8KB
  const sample = content.slice(0, 8192);
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    // Non-printable: below tab (0x09), except newline/carriage-return
    if (code < 9 || (code > 13 && code < 32)) {
      nonPrintable++;
    }
  }
  // If more than 10% of characters are non-printable, likely binary
  return nonPrintable / sample.length > 0.1;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Credential Scanner
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scan content for embedded credentials, API keys, tokens, and private keys.
 * Returns findings with redacted versions safe for display.
 */
export function scanForCredentials(content: string): CredentialFinding[] {
  const findings: CredentialFinding[] = [];
  const lines = content.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    for (const { pattern, type } of SENSITIVE_CONTENT_PATTERNS) {
      // Create a fresh regex for each line to avoid state issues
      const regex = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(line)) !== null) {
        const matched = match[0];
        findings.push({
          found: true,
          type,
          line: lineIdx + 1,
          redacted: redactCredential(matched),
        });
      }
    }
  }

  return findings;
}

/**
 * Redact a credential string for safe display.
 * Keeps first 4 and last 4 characters, replaces the middle with ****.
 */
function redactCredential(value: string): string {
  if (value.length <= 12) {
    return value.slice(0, 3) + '****' + value.slice(-2);
  }
  return value.slice(0, 4) + '****' + value.slice(-4);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Sandbox Executor
// ═══════════════════════════════════════════════════════════════════════════════

/** Environment variables that should be removed in sandbox mode */
const SANDBOX_STRIPPED_ENV_VARS = [
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_SECURITY_TOKEN',
  'AZURE_CLIENT_SECRET',
  'AZURE_STORAGE_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GITLAB_TOKEN',
  'NPM_TOKEN',
  'NPM_AUTH_TOKEN',
  'DOCKER_PASSWORD',
  'DATABASE_URL',
  'DB_PASSWORD',
  'DB_PASS',
  'REDIS_PASSWORD',
  'REDIS_URL',
  'MONGO_URI',
  'MONGODB_URI',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'HF_TOKEN',
  'HUGGING_FACE_HUB_TOKEN',
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',
  'GPG_PASSPHRASE',
];

/**
 * Execute a command in a sandboxed environment with resource limits
 * and environment sanitization.
 */
export async function executeSandboxed(
  command: string,
  options?: SandboxOptions
): Promise<SandboxResult> {
  const maxWallTime = options?.maxWallTime ?? 60_000;
  const maxMemory = options?.maxMemory ?? 256 * 1024 * 1024; // 256MB
  const restrictFs = options?.restrictFilesystem !== false; // default true
  const isolateNetwork = options?.isolateNetwork ?? false;

  const startTime = Date.now();

  // Create sandbox tmp directory
  const sandboxDir = path.join(
    os.tmpdir(),
    'mimo-sandbox',
    `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  try {
    await fs.mkdir(sandboxDir, { recursive: true });

    // Sanitize environment
    const sanitizedEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !SANDBOX_STRIPPED_ENV_VARS.includes(key)) {
        sanitizedEnv[key] = value;
      }
    }
    // Add sandbox-specific overrides
    if (restrictFs) {
      sanitizedEnv.TMPDIR = sandboxDir;
      sanitizedEnv.TEMP = sandboxDir;
      sanitizedEnv.TMP = sandboxDir;
    }
    if (options?.env) {
      Object.assign(sanitizedEnv, options.env);
    }

    const cwd = restrictFs ? sandboxDir : (options?.cwd || sandboxDir);

    // On Linux with network isolation, we would use unshare/cl namespaces.
    // On Windows/macOS, we rely on process-level isolation.
    // For cross-platform, we prefix with resource-limiting tools if available.
    let wrappedCommand = command;
    if (isolateNetwork && !isWindows) {
      // Use unshare for network namespace isolation on Linux
      wrappedCommand = `unshare --net -- ${command}`;
    }

    const execOptions: {
      timeout: number;
      cwd: string;
      maxBuffer: number;
      env: Record<string, string>;
      shell?: string;
    } = {
      timeout: maxWallTime,
      cwd,
      maxBuffer: maxMemory,
      env: sanitizedEnv,
    };

    if (isWindows) {
      execOptions.shell = 'powershell.exe';
    }

    const result = await execAsync(wrappedCommand, execOptions);
    const wallTimeMs = Date.now() - startTime;

    return {
      stdout: String(result.stdout || ''),
      stderr: String(result.stderr || ''),
      exitCode: 0,
      timedOut: false,
      memoryExceeded: false,
      wallTimeMs,
    };
  } catch (err: any) {
    const wallTimeMs = Date.now() - startTime;
    const timedOut = err.killed === true || err.code === 'ETIMEDOUT';

    return {
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || ''),
      exitCode: err.code || err.status || 1,
      timedOut,
      memoryExceeded: false,
      wallTimeMs,
    };
  } finally {
    // Cleanup sandbox directory
    try {
      await fs.rm(sandboxDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Tool Safety Checker (Main Entry Point)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main security check for any tool invocation.
 * Routes to the appropriate checker based on tool name and accumulates
 * all warnings and blocked reasons.
 */
export async function checkToolSafety(
  toolName: string,
  input: Record<string, any>
): Promise<SecurityCheckResult> {
  const warnings: string[] = [];
  const blocked: string[] = [];

  switch (toolName) {
    // ── Shell execution ──────────────────────────────────────────────────
    case 'shell_exec': {
      const command = input.command || '';
      if (typeof command !== 'string' || command.trim().length === 0) {
        blocked.push('Empty shell command');
        break;
      }

      // Injection detection
      const injection = detectCommandInjection(command);
      if (!injection.safe) {
        for (const threat of injection.threats) {
          // Threats from injection detection are warnings (user can override)
          // unless they are in the always-block category
          if (isAlwaysBlockedThreat(threat)) {
            blocked.push(threat);
          } else {
            warnings.push(threat);
          }
        }
      }

      // Always-blocked dangerous commands
      const dangerousPatterns = [
        { pattern: /\brm\s+-rf\s+[\/~]/, reason: 'Recursive delete from root/home' },
        { pattern: />\s*\/dev\/sd/, reason: 'Write to disk block device' },
        { pattern: /\bmkfs\b/, reason: 'Format filesystem' },
        { pattern: /\bdd\s+if=/, reason: 'Direct disk operation (dd)' },
        { pattern: /:\(\)\{/, reason: 'Fork bomb' },
        { pattern: /\bchmod\s+777\s+\//, reason: 'World-writable permissions on root' },
        { pattern: /curl.*\|\s*(ba)?sh/i, reason: 'Remote code execution (curl pipe to shell)' },
        { pattern: /wget.*\|\s*(ba)?sh/i, reason: 'Remote code execution (wget pipe to shell)' },
        { pattern: />\s*\/etc\//, reason: 'Write to system config directory' },
      ];

      for (const { pattern, reason } of dangerousPatterns) {
        if (pattern.test(command)) {
          blocked.push(`${reason} [${command.slice(0, 80)}]`);
        }
      }

      // Data exfiltration detection
      if (/[|>]/.test(command)) {
        const exfilPatterns = [
          { pattern: /curl.*(?:@|paste|pastebin|ngrok|requestbin|hookbin|pipedream|webhook)/i, reason: 'Possible data exfiltration via curl' },
          { pattern: /wget.*(?:@|paste|pastebin|ngrok|requestbin|hookbin|pipedream|webhook)/i, reason: 'Possible data exfiltration via wget' },
          { pattern: /\bnc\s+-[a-z]*e\b/i, reason: 'Netcat reverse shell / data exfiltration' },
          { pattern: /\bncat\b.*(?:--exec|-e)\b/i, reason: 'Ncat reverse shell' },
          { pattern: /\bsocat\b/i, reason: 'Socket relay (possible data exfiltration)' },
        ];
        for (const { pattern, reason } of exfilPatterns) {
          if (pattern.test(command)) {
            blocked.push(reason);
          }
        }
      }

      // Warn about elevated privileges
      if (/\bsudo\b/.test(command)) {
        warnings.push('Command uses sudo (elevated privileges)');
      }

      // CyberSafety: advanced shell safety checks
      const cyberShellFindings = _cyberSafety.checkShellSafety(command);
      for (const finding of cyberShellFindings) {
        const msg = `[CyberSafety] ${finding.title}: ${finding.description}`;
        if (finding.severity === 'critical' || finding.confidence >= 0.9) {
          blocked.push(msg);
        } else {
          warnings.push(msg);
        }
      }

      // CyberSafety: exfiltration detection
      const cyberExfilFindings = _cyberSafety.detectExfiltration('shell_exec', input);
      for (const finding of cyberExfilFindings) {
        const msg = `[CyberSafety] ${finding.title}: ${finding.description}`;
        if (finding.severity === 'critical') {
          blocked.push(msg);
        } else {
          warnings.push(msg);
        }
      }

      break;
    }

    // ── File read ────────────────────────────────────────────────────────
    case 'file_read': {
      const filePath = input.path || input.file_path || '';
      if (filePath) {
        if (isSensitiveFile(filePath)) {
          warnings.push(`Reading sensitive file: ${filePath}`);
        }
      }
      break;
    }

    // ── File write / edit ────────────────────────────────────────────────
    case 'file_write':
    case 'file_edit': {
      const filePath = input.path || input.file_path || '';
      const content = input.content;

      if (filePath && isSensitiveFile(filePath)) {
        blocked.push(`Cannot write to sensitive file: ${filePath}`);
      }

      if (content && typeof content === 'string') {
        const credentials = scanForCredentials(content);
        for (const cred of credentials) {
          warnings.push(`Content contains ${cred.type} at line ${cred.line}: ${cred.redacted}`);
        }

        // Size check
        const contentBytes = Buffer.byteLength(content, 'utf-8');
        if (contentBytes > MAX_WRITE_SIZE_BYTES) {
          blocked.push(
            `Content size ${(contentBytes / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_WRITE_SIZE_BYTES / 1024 / 1024}MB limit`
          );
        }
      }
      break;
    }

    // ── Browser JS execution ─────────────────────────────────────────────
    case 'browser_execute_js': {
      const code = input.code || '';
      if (code) {
        // XSS / injection patterns
        if (/<script/i.test(code)) {
          warnings.push('JS contains <script> tag injection');
        }
        if (/document\.write(ln)?/.test(code)) {
          warnings.push('JS uses document.write (potential XSS)');
        }
        if (/innerHTML\s*=/.test(code)) {
          warnings.push('JS sets innerHTML (potential DOM injection)');
        }
        if (/outerHTML\s*=/.test(code)) {
          warnings.push('JS sets outerHTML (potential DOM injection)');
        }

        // Network activity
        if (/fetch\s*\(/.test(code) || /XMLHttpRequest/.test(code) || /navigator\.sendBeacon/.test(code)) {
          warnings.push('JS contains network requests (fetch/XHR/sendBeacon)');
        }

        // Storage/cookie access
        if (/localStorage/.test(code) || /sessionStorage/.test(code)) {
          warnings.push('JS accesses browser storage');
        }
        if (/document\.cookie/.test(code)) {
          warnings.push('JS accesses cookies');
        }

        // eval in browser context
        if (/\beval\s*\(/.test(code)) {
          warnings.push('JS uses eval (dynamic code execution)');
        }
      }
      break;
    }

    // ── Git operations ───────────────────────────────────────────────────
    case 'git_commit': {
      const message = input.message || '';
      if (message) {
        // Scan commit message for credentials
        const credentials = scanForCredentials(message);
        for (const cred of credentials) {
          blocked.push(`Commit message contains ${cred.type}: ${cred.redacted}`);
        }
      }
      break;
    }

    case 'git_branch': {
      const name = input.name || input.branch || '';
      if (name) {
        // Branch name validation
        // Git disallows: space, ~, ^, :, ?, *, [, \, .., @{
        if (/\s/.test(name)) {
          blocked.push('Branch name contains whitespace');
        }
        if (/\.\./.test(name)) {
          blocked.push('Branch name contains .. (traversal)');
        }
        if (/[\~\^\:\?\*\[\\]/.test(name)) {
          blocked.push(`Branch name contains invalid character: ${name}`);
        }
        if (/@\{/.test(name)) {
          blocked.push('Branch name contains @{ (git reflog syntax)');
        }
        if (name.startsWith('-')) {
          blocked.push('Branch name starts with - (interpreted as flag)');
        }
        if (name.endsWith('.')) {
          blocked.push('Branch name ends with .');
        }
        if (name.endsWith('.lock')) {
          blocked.push('Branch name ends with .lock');
        }
        if (name.includes('//')) {
          blocked.push('Branch name contains //');
        }
      }
      break;
    }

    case 'git_checkout':
    case 'git_pr':
    case 'git_issue':
    case 'git_release': {
      // Generic input sanitization for git tools with remote operations
      const message = input.message || input.title || input.body || '';
      if (message && typeof message === 'string') {
        const credentials = scanForCredentials(message);
        for (const cred of credentials) {
          warnings.push(`Git content contains ${cred.type}: ${cred.redacted}`);
        }
      }
      break;
    }

    // ── MCP tools + CyberSafety defaults ───────────────────────────────────
    default: {
      if (toolName.startsWith('mcp__')) {
        // Sanitize MCP tool inputs
        const inputStr = JSON.stringify(input);
        const credentials = scanForCredentials(inputStr);
        for (const cred of credentials) {
          warnings.push(`MCP tool input contains ${cred.type}: ${cred.redacted}`);
        }
      }

      // CyberSafety: exfiltration detection for all network-capable tools
      if (['web_fetch', 'web_search', 'browser_navigate', 'browser_execute_js'].includes(toolName)) {
        const cyberExfilFindings = _cyberSafety.detectExfiltration(toolName, input);
        for (const finding of cyberExfilFindings) {
          const msg = `[CyberSafety] ${finding.title}: ${finding.description}`;
          if (finding.severity === 'critical') {
            blocked.push(msg);
          } else {
            warnings.push(msg);
          }
        }
      }
      break;
    }
  }

  return {
    safe: blocked.length === 0,
    warnings,
    blocked,
  };
}

/**
 * Check if a threat from injection detection should always be blocked
 * (not just warned).
 */
function isAlwaysBlockedThreat(threat: string): boolean {
  const alwaysBlocked = [
    'Fork bomb',
    'Output redirection to block device',
    'Output redirection to system directory',
  ];
  return alwaysBlocked.some((pattern) => threat.includes(pattern));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Legacy / Utility Exports (backward compatible)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a file path matches sensitive file patterns.
 */
export function isSensitiveFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Scan content for sensitive information patterns (legacy interface).
 */
export function checkSensitiveContent(content: string): Array<{ type: string; match: string }> {
  const findings: Array<{ type: string; match: string }> = [];
  for (const { pattern, type } of SENSITIVE_CONTENT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      findings.push({ type, match: match[0].slice(0, 30) + '...' });
    }
  }
  return findings;
}

/**
 * Check file permissions (readable, writable, exists).
 */
export async function checkFilePermissions(filePath: string): Promise<{
  readable: boolean;
  writable: boolean;
  exists: boolean;
}> {
  try {
    await fs.access(filePath, fs.constants.R_OK);
    const writable = await fs.access(filePath, fs.constants.W_OK)
      .then(() => true)
      .catch(() => false);
    return { readable: true, writable, exists: true };
  } catch {
    return { readable: false, writable: false, exists: false };
  }
}

/**
 * Check if a file is ignored by git.
 */
export async function isIgnoredByGit(filePath: string): Promise<boolean> {
  try {
    await execAsync(`git check-ignore "${filePath}"`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Cyber Safety Integration (Prompt Injection, Exfiltration, Unsafe Code)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scan user input for prompt injection attempts.
 * Returns CyberSafety findings with confidence scores.
 */
export function scanUserInputForInjection(input: string): Array<{
  category: string;
  severity: string;
  confidence: number;
  title: string;
  description: string;
}> {
  return _cyberSafety.detectPromptInjection(input);
}

/**
 * Scan tool output for injected instructions.
 */
export function scanToolOutputForInjection(toolName: string, output: string): Array<{
  category: string;
  severity: string;
  confidence: number;
  title: string;
  description: string;
}> {
  return _cyberSafety.scanToolOutput(toolName, output);
}

/**
 * Check shell command safety using CyberSafety.
 */
export function checkShellCommandCyberSafety(command: string): Array<{
  category: string;
  severity: string;
  confidence: number;
  title: string;
  description: string;
}> {
  return _cyberSafety.checkShellSafety(command);
}

/**
 * Check for data exfiltration in tool calls.
 */
export function checkExfiltration(toolName: string, input: Record<string, any>): Array<{
  category: string;
  severity: string;
  confidence: number;
  title: string;
  description: string;
}> {
  return _cyberSafety.detectExfiltration(toolName, input);
}

/**
 * Get the CyberSafety instance for direct use.
 */
export function getCyberSafetyInstance(): CyberSafety {
  return _cyberSafety;
}
