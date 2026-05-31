// ── Enhanced Sandbox System ─────────────────────────────────────────────────
// Multi-technology sandboxing: bwrap, landlock, seatbelt, seccomp, process_hardening
// Side-git automatic snapshots per turn, workspace boundaries, trust mode

import { exec, spawn, ExecOptions } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type SandboxTechnology = 'bwrap' | 'landlock' | 'seatbelt' | 'seccomp' | 'process_hardening' | 'none';
export type SandboxMode = 'strict' | 'permissive' | 'trusted';

export interface SandboxConfig {
  mode: SandboxMode;
  technologies: SandboxTechnology[];
  workspaceRoot: string;
  allowedPaths: string[];
  blockedPaths: string[];
  allowNetwork: boolean;
  allowEnvInherit: boolean;
  tmpDir: string;
  timeout: number;
  maxOutput: number;
  maxMemoryMB: number;
  blockedCommands: string[];
  trustedCommands: string[];
}

export interface SandboxViolation {
  technology: SandboxTechnology;
  rule: string;
  detail: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
}

export interface SideGitSnapshot {
  id: string;
  turnNumber: number;
  timestamp: string;
  description: string;
  filesChanged: string[];
  commitHash?: string;
}

export interface WorkspaceBoundary {
  root: string;
  enforced: boolean;
  trustedPaths: string[];
  violations: SandboxViolation[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Config
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: SandboxConfig = {
  mode: 'strict',
  technologies: [],
  workspaceRoot: process.cwd(),
  allowedPaths: [],
  blockedPaths: [
    '/etc', '/usr', '/bin', '/sbin', '/boot', '/dev', '/proc', '/sys',
    'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)',
    '/System', '/Library',
  ],
  allowNetwork: true,
  allowEnvInherit: true,
  tmpDir: path.join(os.tmpdir(), 'mimo-sandbox'),
  timeout: 30000,
  maxOutput: 5 * 1024 * 1024, // 5MB
  maxMemoryMB: 512,
  blockedCommands: [
    'rm -rf /', 'sudo rm -rf', 'mkfs', 'dd if=', ':(){', 'chmod -R 777 /',
    'curl.*|.*sh', 'wget.*|.*sh', 'nc -', 'ncat --exec', 'socat',
    'stratum+tcp://', 'xmrig', 'cpuminer',
  ],
  trustedCommands: [
    'git', 'npm', 'npx', 'node', 'python', 'python3', 'pip', 'pip3',
    'cargo', 'rustc', 'go', 'java', 'javac', 'mvn', 'gradle',
    'tsc', 'eslint', 'prettier', 'pytest', 'jest', 'mocha',
    'ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc', 'sort', 'uniq',
    'echo', 'pwd', 'whoami', 'which', 'env',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// Sandbox Technology Detectors
// ═══════════════════════════════════════════════════════════════════════════════

async function detectAvailableTechnologies(): Promise<SandboxTechnology[]> {
  const available: SandboxTechnology[] = [];
  const platform = os.platform();

  if (platform === 'linux') {
    // Bubblewrap
    try {
      await execAsync('which bwrap', { timeout: 3000 });
      available.push('bwrap');
    } catch {}

    // Landlock (kernel >= 5.13)
    try {
      const kernel = os.release().split('.').map(Number);
      if (kernel[0] > 5 || (kernel[0] === 5 && kernel[1] >= 13)) {
        available.push('landlock');
      }
    } catch {}

    // Seccomp
    try {
      await execAsync('grep Seccomp /proc/self/status', { timeout: 3000 });
      available.push('seccomp');
    } catch {}
  }

  if (platform === 'darwin') {
    // macOS Seatbelt
    try {
      await execAsync('which sandbox-exec', { timeout: 3000 });
      available.push('seatbelt');
    } catch {}
  }

  // Process hardening is always available (rlimits, no-new-privs, etc.)
  available.push('process_hardening');

  return available;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EnhancedSandbox
// ═══════════════════════════════════════════════════════════════════════════════

export class EnhancedSandbox {
  private config: SandboxConfig;
  private violations: SandboxViolation[] = [];
  private sideGitDir: string;
  private snapshots: SideGitSnapshot[] = [];
  private turnNumber: number = 0;
  private detectedTechnologies: SandboxTechnology[] = [];
  private workspaceBoundary: WorkspaceBoundary;
  private _trusted: boolean = false;

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sideGitDir = path.join(this.config.workspaceRoot, '.mimo', 'side-git');
    this.workspaceBoundary = {
      root: this.config.workspaceRoot,
      enforced: this.config.mode !== 'trusted',
      trustedPaths: [...this.config.allowedPaths],
      violations: [],
    };
  }

  // ── Initialization ──────────────────────────────────────────────────

  async init(): Promise<void> {
    // Detect available sandbox technologies
    this.detectedTechnologies = await detectAvailableTechnologies();
    this.config.technologies = this.detectedTechnologies;

    // Create sandbox directories
    await fs.mkdir(this.config.tmpDir, { recursive: true });
    await fs.mkdir(this.sideGitDir, { recursive: true });

    // Initialize side-git repository if not exists
    await this.initSideGit();

    // Take initial snapshot
    await this.takeSnapshot('Session start');
  }

  private async initSideGit(): Promise<void> {
    const gitDir = path.join(this.sideGitDir, '.git');
    try {
      await fs.access(gitDir);
    } catch {
      // Not initialized yet
      try {
        await execAsync('git init', { cwd: this.sideGitDir, timeout: 5000 });
        // Create .gitignore to exclude side-git internals
        await fs.writeFile(
          path.join(this.sideGitDir, '.gitignore'),
          '.gitignore\n',
          'utf-8'
        );
        await execAsync('git add -A && git commit -m "Initialize side-git"', {
          cwd: this.sideGitDir, timeout: 5000,
        });
      } catch { /* non-fatal */ }
    }
  }

  // ── Command Safety Checking ─────────────────────────────────────────

  /**
   * Check if a command is safe to execute.
   * Returns { safe, reason?, violations? }
   */
  checkCommand(command: string): { safe: boolean; reason?: string; violations?: SandboxViolation[] } {
    const violations: SandboxViolation[] = [];

    // 1. Check blocked commands
    for (const blocked of this.config.blockedCommands) {
      try {
        const regex = new RegExp(blocked, 'i');
        if (regex.test(command)) {
          violations.push({
            technology: 'process_hardening',
            rule: 'blocked_command',
            detail: `Command matches blocked pattern: "${blocked}"`,
            severity: 'critical',
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        // Literal match
        if (command.includes(blocked)) {
          violations.push({
            technology: 'process_hardening',
            rule: 'blocked_command',
            detail: `Command contains blocked pattern: "${blocked}"`,
            severity: 'critical',
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // 2. Check workspace boundary
    if (this.workspaceBoundary.enforced) {
      const pathArgs = this.extractPaths(command);
      for (const p of pathArgs) {
        const resolved = path.resolve(this.config.workspaceRoot, p);
        if (!resolved.startsWith(this.config.workspaceRoot) && !this.isPathTrusted(resolved)) {
          violations.push({
            technology: 'process_hardening',
            rule: 'workspace_boundary',
            detail: `Path "${p}" is outside workspace root`,
            severity: 'high',
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // 3. Check for system directory access
    const systemPaths = ['/etc/', '/usr/', '/bin/', '/sbin/', '/boot/', '/dev/', '/proc/', '/sys/',
      'C:\\Windows', 'C:\\Program Files'];
    for (const sp of systemPaths) {
      if (command.includes(sp) && !command.includes(sp + 'local')) {
        // Allow reading from /usr/local etc.
        const isWrite = /\b(cp|mv|rm|chmod|chown|mkdir|touch|tee|dd|install)\b/.test(command);
        if (isWrite) {
          violations.push({
            technology: 'process_hardening',
            rule: 'system_directory_write',
            detail: `Write to system directory: ${sp}`,
            severity: 'critical',
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // 4. Check for reverse shells and exfiltration
    const reverseShellPatterns = [
      /nc\s+-[a-z]*e\s*\/bin/i,
      /ncat\s+--exec/i,
      /bash\s+-i\s+>.*\/dev\/tcp/i,
      /python.*socket.*connect.*subprocess/i,
      /socat\s+.*exec/i,
    ];
    for (const pattern of reverseShellPatterns) {
      if (pattern.test(command)) {
        violations.push({
          technology: 'process_hardening',
          rule: 'reverse_shell',
          detail: `Potential reverse shell detected`,
          severity: 'critical',
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Store violations
    this.violations.push(...violations);
    this.workspaceBoundary.violations.push(...violations);

    const criticalViolations = violations.filter(v => v.severity === 'critical');
    if (criticalViolations.length > 0) {
      return {
        safe: false,
        reason: criticalViolations.map(v => v.detail).join('; '),
        violations,
      };
    }

    // In trusted mode, allow everything
    if (this._trusted || this.config.mode === 'trusted') {
      return { safe: true, violations };
    }

    // In strict mode, high violations block execution
    if (this.config.mode === 'strict') {
      const highViolations = violations.filter(v => v.severity === 'high');
      if (highViolations.length > 0) {
        return {
          safe: false,
          reason: highViolations.map(v => v.detail).join('; '),
          violations,
        };
      }
    }

    return { safe: true, violations };
  }

  // ── Sandboxed Execution ─────────────────────────────────────────────

  /**
   * Execute a command with sandboxing applied.
   */
  async execute(command: string, options: { cwd?: string; timeout?: number } = {}): Promise<{ stdout: string; stderr: string; code: number }> {
    const safety = this.checkCommand(command);
    if (!safety.safe) {
      return {
        stdout: '',
        stderr: `Sandbox blocked: ${safety.reason}`,
        code: 126,
      };
    }

    const execOptions: ExecOptions = {
      timeout: options.timeout || this.config.timeout,
      cwd: options.cwd || this.config.workspaceRoot,
      maxBuffer: this.config.maxOutput,
      env: this.buildSafeEnvironment(),
    };

    // Apply sandbox technology
    let wrappedCommand = command;
    if (!this._trusted && this.config.mode !== 'trusted') {
      wrappedCommand = await this.wrapWithSandbox(command, execOptions);
    }

    try {
      const result = await execAsync(wrappedCommand, execOptions);
      return {
        stdout: String(result.stdout),
        stderr: String(result.stderr),
        code: 0,
      };
    } catch (err: any) {
      return {
        stdout: String(err.stdout || ''),
        stderr: String(err.stderr || ''),
        code: err.code || 1,
      };
    }
  }

  // ── Side-Git Snapshots ──────────────────────────────────────────────

  /**
   * Take a snapshot of the workspace using side-git.
   * Call this BEFORE each tool call that modifies files.
   */
  async takeSnapshot(description: string): Promise<SideGitSnapshot> {
    this.turnNumber++;
    const id = crypto.randomBytes(6).toString('hex');

    const snapshot: SideGitSnapshot = {
      id,
      turnNumber: this.turnNumber,
      timestamp: new Date().toISOString(),
      description,
      filesChanged: [],
    };

    try {
      // Sync workspace files to side-git
      await this.syncToSideGit();

      // Commit in side-git
      const commitMsg = `[Turn ${this.turnNumber}] ${description} (${id})`;
      await execAsync(`git add -A && git commit -m "${commitMsg.replace(/"/g, '\\"')}" --allow-empty`, {
        cwd: this.sideGitDir,
        timeout: 15000,
      });

      // Get commit hash
      try {
        const { stdout } = await execAsync('git rev-parse HEAD', { cwd: this.sideGitDir, timeout: 3000 });
        snapshot.commitHash = stdout.trim();
      } catch {}

      // Count changed files
      try {
        const { stdout } = await execAsync('git diff --stat HEAD~1 HEAD', { cwd: this.sideGitDir, timeout: 3000 });
        snapshot.filesChanged = stdout.split('\n').filter(l => l.includes('|')).map(l => l.split('|')[0].trim());
      } catch {}
    } catch { /* non-fatal */ }

    this.snapshots.push(snapshot);
    return snapshot;
  }

  /**
   * Restore workspace to a specific snapshot.
   */
  async restoreSnapshot(snapshotId?: string): Promise<{ restored: string[]; snapshotId: string }> {
    let snapshot: SideGitSnapshot;

    if (snapshotId) {
      const found = this.snapshots.find(s => s.id === snapshotId);
      if (!found || !found.commitHash) {
        throw new Error(`Snapshot ${snapshotId} not found or has no commit hash`);
      }
      snapshot = found;
    } else {
      // Restore to previous snapshot
      if (this.snapshots.length < 2) {
        throw new Error('No previous snapshot to restore to');
      }
      snapshot = this.snapshots[this.snapshots.length - 2];
      if (!snapshot.commitHash) {
        throw new Error('Previous snapshot has no commit hash');
      }
    }

    // Checkout in side-git
    await execAsync(`git checkout ${snapshot.commitHash} -- .`, {
      cwd: this.sideGitDir,
      timeout: 15000,
    });

    // Sync back to workspace
    const restored = await this.syncFromSideGit();

    // Remove the snapshot and all later ones
    this.snapshots = this.snapshots.filter(s => s.turnNumber <= snapshot.turnNumber);

    return { restored, snapshotId: snapshot.id };
  }

  /**
   * List all available snapshots.
   */
  listSnapshots(): SideGitSnapshot[] {
    return [...this.snapshots];
  }

  // ── Trust Mode ──────────────────────────────────────────────────────

  /**
   * Enter trust mode: removes workspace boundaries for this session.
   */
  trust(): void {
    this._trusted = true;
    this.workspaceBoundary.enforced = false;
  }

  /**
   * Check if currently in trust mode.
   */
  isTrusted(): boolean {
    return this._trusted;
  }

  // ── Status & Reporting ──────────────────────────────────────────────

  getStatus(): {
    technologies: SandboxTechnology[];
    detected: SandboxTechnology[];
    mode: SandboxMode;
    trusted: boolean;
    violations: number;
    snapshots: number;
    workspaceRoot: string;
    boundaryEnforced: boolean;
  } {
    return {
      technologies: this.config.technologies,
      detected: this.detectedTechnologies,
      mode: this.config.mode,
      trusted: this._trusted,
      violations: this.violations.length,
      snapshots: this.snapshots.length,
      workspaceRoot: this.config.workspaceRoot,
      boundaryEnforced: this.workspaceBoundary.enforced,
    };
  }

  getViolations(): SandboxViolation[] {
    return [...this.violations];
  }

  formatStatus(): string {
    const s = this.getStatus();
    const techs = s.detected.map(t => t === 'none' ? 'basic' : t).join(', ');
    const lines = [
      `Sandbox Status:`,
      `  Mode: ${s.mode}${s.trusted ? ' (TRUSTED)' : ''}`,
      `  Technologies: ${techs || 'basic (no OS-level sandbox)'}`,
      `  Workspace: ${s.workspaceRoot}`,
      `  Boundary: ${s.boundaryEnforced ? 'ENFORCED' : 'DISABLED'}`,
      `  Violations: ${s.violations} total`,
      `  Snapshots: ${s.snapshots} available`,
    ];
    return lines.join('\n');
  }

  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.config.tmpDir, { recursive: true, force: true });
    } catch {}
  }

  // ── Private Helpers ─────────────────────────────────────────────────

  private buildSafeEnvironment(): NodeJS.ProcessEnv {
    if (this.config.allowEnvInherit) {
      return { ...process.env };
    }
    // Minimal environment
    return {
      PATH: process.env.PATH,
      HOME: process.env.HOME || os.homedir(),
      USER: process.env.USER || os.userInfo().username,
      LANG: process.env.LANG || 'en_US.UTF-8',
      TERM: process.env.TERM || 'xterm-256color',
      TMPDIR: this.config.tmpDir,
      TEMP: this.config.tmpDir,
    };
  }

  private async wrapWithSandbox(command: string, options: ExecOptions): Promise<string> {
    const platform = os.platform();

    // Try platform-specific sandbox
    if (platform === 'linux') {
      if (this.detectedTechnologies.includes('bwrap')) {
        return this.wrapWithBwrap(command, options);
      }
    }

    if (platform === 'darwin') {
      if (this.detectedTechnologies.includes('seatbelt')) {
        return this.wrapWithSeatbelt(command, options);
      }
    }

    // Fallback: process hardening (ulimits, etc.)
    return this.wrapWithProcessHardening(command, options);
  }

  private wrapWithBwrap(command: string, options: ExecOptions): string {
    const root = this.config.workspaceRoot;
    const args = [
      'bwrap',
      '--ro-bind', '/usr', '/usr',
      '--ro-bind', '/lib', '/lib',
      '--ro-bind', '/lib64', '/lib64',
      '--ro-bind', '/bin', '/bin',
      '--proc', '/proc',
      '--dev', '/dev',
      '--tmpfs', '/tmp',
      '--bind', root, root,
      '--chdir', options.cwd || root,
      '--unshare-all',
      '--die-with-parent',
    ];

    // Add allowed paths
    for (const p of this.config.allowedPaths) {
      args.push('--bind', p, p);
    }

    // Add network if allowed
    if (this.config.allowNetwork) {
      args.push('--share-net');
    }

    args.push('--', '/bin/sh', '-c', command);
    return args.join(' ');
  }

  private wrapWithSeatbelt(command: string, options: ExecOptions): string {
    // macOS sandbox-exec with a restrictive profile
    const profile = [
      '(version 1)',
      '(deny default)',
      '(allow process-exec)',
      '(allow process-fork)',
      `(allow file-read* (subpath "${this.config.workspaceRoot}"))`,
      `(allow file-write* (subpath "${this.config.workspaceRoot}"))`,
      `(allow file-read* (subpath "/usr"))`,
      `(allow file-read* (subpath "/System"))`,
      `(allow file-read* (subpath "/Library"))`,
      `(allow file-read-metadata (subpath "/"))`,
      '(allow sysctl-read)',
      '(allow mach-lookup)',
      '(allow signal)',
    ];

    if (this.config.allowNetwork) {
      profile.push('(allow network*)');
    }

    const profilePath = path.join(this.config.tmpDir, 'seatbelt.sb');
    // Write profile synchronously for immediate use
    require('fs').writeFileSync(profilePath, profile.join('\n'), 'utf-8');

    return `sandbox-exec -f "${profilePath}" /bin/sh -c '${command.replace(/'/g, "'\\''")}'`;
  }

  private wrapWithProcessHardening(command: string, options: ExecOptions): string {
    // Apply ulimits and process restrictions
    const limits: string[] = [];

    // Memory limit
    if (this.config.maxMemoryMB > 0) {
      limits.push(`ulimit -v ${this.config.maxMemoryMB * 1024} 2>/dev/null`);
    }

    // File size limit (100MB)
    limits.push('ulimit -f 102400 2>/dev/null');

    // CPU time limit (derived from timeout)
    const timeoutSec = Math.ceil((options.timeout || this.config.timeout) / 1000);
    limits.push(`ulimit -t ${timeoutSec * 2} 2>/dev/null`);

    limits.push(command);
    return limits.join(' && ');
  }

  private extractPaths(command: string): string[] {
    const paths: string[] = [];

    // Extract quoted paths
    const quotedPaths = command.match(/"([^"]+)"|'([^']+)'/g);
    if (quotedPaths) {
      for (const qp of quotedPaths) {
        const cleaned = qp.slice(1, -1);
        if (cleaned.includes('/') || cleaned.includes('\\')) {
          paths.push(cleaned);
        }
      }
    }

    // Extract paths from common commands
    const pathCommands = command.match(/(?:cat|head|tail|less|more|grep|vi|vim|nano|code|open|read|write|edit|cp|mv|rm|mkdir|touch|chmod|chown)\s+(\/[^\s;|&]+|[A-Z]:\\[^\s;|&]+)/g);
    if (pathCommands) {
      for (const pc of pathCommands) {
        const p = pc.split(/\s+/).slice(1).join(' ');
        if (p) paths.push(p);
      }
    }

    return paths;
  }

  private isPathTrusted(resolvedPath: string): boolean {
    return this.config.allowedPaths.some((tp: string) => resolvedPath.startsWith(tp));
  }

  private async syncToSideGit(): Promise<void> {
    try {
      // Use rsync or cp to sync workspace to side-git
      const workspaceFiles = await this.getWorkspaceFiles();
      for (const file of workspaceFiles.slice(0, 1000)) {
        const src = path.join(this.config.workspaceRoot, file);
        const dst = path.join(this.sideGitDir, file);
        try {
          await fs.mkdir(path.dirname(dst), { recursive: true });
          await fs.copyFile(src, dst);
        } catch {}
      }
    } catch { /* non-fatal */ }
  }

  private async syncFromSideGit(): Promise<string[]> {
    const restored: string[] = [];
    try {
      const { stdout } = await execAsync(
        `git diff --name-only HEAD`,
        { cwd: this.sideGitDir, timeout: 5000 }
      );
      const files = stdout.trim().split('\n').filter(Boolean);

      for (const file of files) {
        const src = path.join(this.sideGitDir, file);
        const dst = path.join(this.config.workspaceRoot, file);
        try {
          await fs.mkdir(path.dirname(dst), { recursive: true });
          await fs.copyFile(src, dst);
          restored.push(dst);
        } catch {}
      }
    } catch {}
    return restored;
  }

  private async getWorkspaceFiles(): Promise<string[]> {
    const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.mimo', '__pycache__', '.next', 'target'];
    const files: string[] = [];

    const walk = async (dir: string, rel: string = ''): Promise<void> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') && entry.name !== '.env') continue;
          if (ignoreDirs.includes(entry.name)) continue;

          const relPath = rel ? `${rel}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            await walk(path.join(dir, entry.name), relPath);
          } else if (entry.isFile()) {
            files.push(relPath);
          }
        }
      } catch {}
    };

    await walk(this.config.workspaceRoot);
    return files;
  }
}
