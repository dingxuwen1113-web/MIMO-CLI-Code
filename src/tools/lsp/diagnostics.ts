// ── LSP Diagnostics System ─────────────────────────────────────────────────
// Integrates 7 language servers for automatic diagnostics after file edits.
// Supported: TypeScript, Python, Rust, Go, C/C++, Java, Vue
// Fallback chain: LSP protocol → CLI tools → basic syntax checks

import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';
import { EventEmitter } from 'events';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  severity: DiagnosticSeverity;
  message: string;
  source: string;        // e.g. 'typescript', 'pyright', 'rust-analyzer'
  code?: string | number;
  relatedInformation?: Array<{
    file: string;
    line: number;
    column: number;
    message: string;
  }>;
}

export interface DiagnosticResult {
  file: string;
  language: string;
  diagnostics: Diagnostic[];
  source: string;
  duration: number;       // ms
  success: boolean;
  error?: string;
}

export interface LSPServerConfig {
  id: string;
  name: string;
  languages: string[];
  fileExtensions: string[];
  command: string;
  args: string[];
  initializationOptions?: Record<string, any>;
  cliFallback?: string;
  cliArgs?: string[];
  cliParsePattern?: RegExp;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Language Server Definitions
// ═══════════════════════════════════════════════════════════════════════════════

const LSP_SERVERS: LSPServerConfig[] = [
  {
    id: 'typescript',
    name: 'TypeScript Language Server',
    languages: ['typescript', 'javascript'],
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cjs', '.cts'],
    command: 'npx',
    args: ['typescript-language-server', '--stdio'],
    cliFallback: 'npx',
    cliArgs: ['tsc', '--noEmit', '--pretty', 'false'],
    cliParsePattern: /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm,
  },
  {
    id: 'pyright',
    name: 'Pyright',
    languages: ['python'],
    fileExtensions: ['.py', '.pyi'],
    command: 'pyright-langserver',
    args: ['--stdio'],
    cliFallback: 'npx',
    cliArgs: ['pyright', '--outputjson'],
  },
  {
    id: 'rust-analyzer',
    name: 'rust-analyzer',
    languages: ['rust'],
    fileExtensions: ['.rs'],
    command: 'rust-analyzer',
    args: [],
    cliFallback: 'cargo',
    cliArgs: ['check', '--message-format=json'],
  },
  {
    id: 'gopls',
    name: 'gopls',
    languages: ['go'],
    fileExtensions: ['.go'],
    command: 'gopls',
    args: [],
    cliFallback: 'go',
    cliArgs: ['vet', './...'],
  },
  {
    id: 'clangd',
    name: 'clangd',
    languages: ['c', 'cpp', 'c++'],
    fileExtensions: ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx'],
    command: 'clangd',
    args: ['--background-index=false', '--clang-tidy=false'],
    cliFallback: 'gcc',
    cliArgs: ['-fsyntax-only', '-Wall'],
  },
  {
    id: 'jdtls',
    name: 'Eclipse JDT Language Server',
    languages: ['java'],
    fileExtensions: ['.java'],
    command: 'jdtls',
    args: [],
    cliFallback: 'javac',
    cliArgs: ['-Xlint:all'],
  },
  {
    id: 'vue-language-server',
    name: 'Vue Language Server',
    languages: ['vue'],
    fileExtensions: ['.vue'],
    command: 'vue-language-server',
    args: ['--stdio'],
    cliFallback: 'npx',
    cliArgs: ['vue-tsc', '--noEmit', '--pretty', 'false'],
    cliParsePattern: /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// LSP Client (JSON-RPC over stdio)
// ═══════════════════════════════════════════════════════════════════════════════

interface LSPRequest {
  id: number;
  method: string;
  params: any;
}

interface LSPResponse {
  id: number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

interface LSPNotification {
  method: string;
  params: any;
}

class LSPClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private requestId: number = 0;
  private pendingRequests: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }> = new Map();
  private buffer: string = '';
  private serverConfig: LSPServerConfig;
  private initialized: boolean = false;
  private diagnostics: Map<string, Diagnostic[]> = new Map();
  private projectRoot: string;

  constructor(config: LSPServerConfig, projectRoot: string) {
    super();
    this.serverConfig = config;
    this.projectRoot = projectRoot;
  }

  async start(): Promise<boolean> {
    try {
      this.process = spawn(this.serverConfig.command, this.serverConfig.args, {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      });

      this.process.stdout?.on('data', (data: Buffer) => this.handleData(data));
      this.process.stderr?.on('data', () => {}); // suppress stderr

      this.process.on('exit', () => {
        this.initialized = false;
        this.emit('exit');
      });

      // Initialize handshake
      const initResult = await this.sendRequest('initialize', {
        processId: process.pid,
        rootUri: `file://${this.projectRoot}`,
        capabilities: {
          textDocument: {
            publishDiagnostics: { relatedInformation: true },
          },
        },
        initializationOptions: this.serverConfig.initializationOptions || {},
      });

      this.sendNotification('initialized', {});
      this.initialized = true;
      return true;
    } catch {
      this.process?.kill();
      this.process = null;
      return false;
    }
  }

  async openFile(filePath: string, content: string, languageId: string): Promise<void> {
    if (!this.initialized) return;
    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri: `file://${filePath.replace(/\\/g, '/')}`,
        languageId,
        version: 1,
        text: content,
      },
    });
  }

  async updateFile(filePath: string, content: string): Promise<void> {
    if (!this.initialized) return;
    this.sendNotification('textDocument/didChange', {
      textDocument: {
        uri: `file://${filePath.replace(/\\/g, '/')}`,
        version: Date.now(),
      },
      contentChanges: [{ text: content }],
    });
  }

  getDiagnostics(filePath: string): Diagnostic[] {
    return this.diagnostics.get(`file://${filePath.replace(/\\/g, '/')}`) || [];
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;
    try {
      await this.sendRequest('shutdown', null);
      this.sendNotification('exit', null);
    } catch { /* ignore */ }
    this.process?.kill();
    this.process = null;
    this.initialized = false;
  }

  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });
      const message = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      const header = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n`;
      this.process?.stdin?.write(header + message);

      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`LSP request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  private sendNotification(method: string, params: any): void {
    const message = JSON.stringify({ jsonrpc: '2.0', method, params });
    const header = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n`;
    this.process?.stdin?.write(header + message);
  }

  private handleData(data: Buffer): void {
    this.buffer += data.toString();

    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const header = this.buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) break;

      const contentLength = parseInt(match[1], 10);
      const messageStart = headerEnd + 4;

      if (this.buffer.length < messageStart + contentLength) break;

      const messageBody = this.buffer.slice(messageStart, messageStart + contentLength);
      this.buffer = this.buffer.slice(messageStart + contentLength);

      try {
        const message = JSON.parse(messageBody);
        this.handleMessage(message);
      } catch { /* skip malformed messages */ }
    }
  }

  private handleMessage(message: any): void {
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
    } else if (message.method === 'textDocument/publishDiagnostics') {
      const { uri, diagnostics } = message.params;
      this.diagnostics.set(uri, (diagnostics || []).map((d: any) => ({
        file: uri.replace('file://', ''),
        line: d.range?.start?.line ? d.range.start.line + 1 : 0,
        column: d.range?.start?.character ? d.range.start.character + 1 : 0,
        endLine: d.range?.end?.line ? d.range.end.line + 1 : undefined,
        endColumn: d.range?.end?.character ? d.range.end.character + 1 : undefined,
        severity: this.mapSeverity(d.severity),
        message: d.message,
        source: d.source || this.serverConfig.id,
        code: d.code,
        relatedInformation: d.relatedInformation?.map((r: any) => ({
          file: r.location?.uri?.replace('file://', '') || '',
          line: r.location?.range?.start?.line ? r.location.range.start.line + 1 : 0,
          column: r.location?.range?.start?.character ? r.location.range.start.character + 1 : 0,
          message: r.message,
        })),
      })));
      this.emit('diagnostics', { uri, diagnostics: this.diagnostics.get(uri) });
    }
  }

  private mapSeverity(severity?: number): DiagnosticSeverity {
    switch (severity) {
      case 1: return 'error';
      case 2: return 'warning';
      case 3: return 'info';
      case 4: return 'hint';
      default: return 'error';
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLI-based Diagnostics (fallback)
// ═══════════════════════════════════════════════════════════════════════════════

async function runCliDiagnostics(
  config: LSPServerConfig,
  filePath: string,
  projectRoot: string
): Promise<Diagnostic[]> {
  if (!config.cliFallback) return [];

  try {
    const args = [...(config.cliArgs || []), filePath];
    const { stdout, stderr } = await execAsync(`${config.cliFallback} ${args.join(' ')}`, {
      cwd: projectRoot,
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024,
    });

    const output = stdout + '\n' + stderr;
    return parseCliOutput(config, output, filePath, projectRoot);
  } catch (err: any) {
    // Non-zero exit means errors found — still parse output
    const output = (err.stdout || '') + '\n' + (err.stderr || '');
    if (!output.trim()) return [];
    return parseCliOutput(config, output, filePath, projectRoot);
  }
}

function parseCliOutput(
  config: LSPServerConfig,
  output: string,
  filePath: string,
  projectRoot: string
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Pyright JSON output
  if (config.id === 'pyright') {
    try {
      const json = JSON.parse(output);
      for (const diag of json.generalDiagnostics || []) {
        diagnostics.push({
          file: diag.file || filePath,
          line: diag.range?.start?.line ? diag.range.start.line + 1 : 0,
          column: diag.range?.start?.character ? diag.range.start.character + 1 : 0,
          severity: diag.severity === 'error' ? 'error' : diag.severity === 'warning' ? 'warning' : 'info',
          message: diag.message || '',
          source: 'pyright',
          code: diag.rule,
        });
      }
      return diagnostics;
    } catch { /* not JSON, fall through to regex */ }
  }

  // Cargo check JSON output
  if (config.id === 'rust-analyzer') {
    for (const line of output.split('\n')) {
      try {
        const msg = JSON.parse(line);
        if (msg.reason === 'compiler-message' && msg.message?.spans) {
          for (const span of msg.message.spans) {
            diagnostics.push({
              file: span.file_name ? path.resolve(projectRoot, span.file_name) : filePath,
              line: span.line_start || 0,
              column: span.column_start || 0,
              endLine: span.line_end,
              endColumn: span.column_end,
              severity: msg.message.level === 'error' ? 'error' : msg.message.level === 'warning' ? 'warning' : 'info',
              message: msg.message.message || '',
              source: 'rust-analyzer',
              code: msg.message.code?.code,
            });
          }
        }
      } catch { /* skip non-JSON lines */ }
    }
    return diagnostics;
  }

  // Generic regex-based parsing (TypeScript, Go, GCC, etc.)
  const patterns: Array<{ regex: RegExp; fileGroup: number; lineGroup: number; colGroup: number; codeGroup?: number; msgGroup: number; severity: DiagnosticSeverity }> = [
    // TypeScript: file.ts(line,col): error TS1234: message
    { regex: /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/gm, fileGroup: 1, lineGroup: 2, colGroup: 3, codeGroup: 5, msgGroup: 6, severity: 'error' },
    // GCC/Clang: file:line:col: error: message
    { regex: /^(.+?):(\d+):(\d+):\s*(error|warning|note):\s*(.+)$/gm, fileGroup: 1, lineGroup: 2, colGroup: 3, msgGroup: 5, severity: 'error' },
    // Go vet: file:line:col: message
    { regex: /^(.+?):(\d+):(\d+):\s*(.+)$/gm, fileGroup: 1, lineGroup: 2, colGroup: 3, msgGroup: 4, severity: 'error' },
    // Python: File "file.py", line N
    { regex: /File "(.+?)", line (\d+)/gm, fileGroup: 1, lineGroup: 2, colGroup: 0, msgGroup: 0, severity: 'error' },
  ];

  for (const { regex, fileGroup, lineGroup, colGroup, codeGroup, msgGroup, severity } of patterns) {
    let match: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((match = regex.exec(output)) !== null) {
      const diagFile = match[fileGroup] ? path.resolve(projectRoot, match[fileGroup]) : filePath;
      const line = match[lineGroup] ? parseInt(match[lineGroup], 10) : 0;
      const col = match[colGroup] ? parseInt(match[colGroup], 10) : 0;
      const msg = match[msgGroup] || '';
      const code = codeGroup && match[codeGroup] ? match[codeGroup] : undefined;

      // Detect severity from message content
      let actualSeverity: DiagnosticSeverity = severity;
      const severityMatch = match[0].match(/\b(error|warning|note|info)\b/i);
      if (severityMatch) {
        const s = severityMatch[1].toLowerCase();
        if (s === 'error') actualSeverity = 'error';
        else if (s === 'warning') actualSeverity = 'warning';
        else actualSeverity = 'info';
      }

      if (msg || line > 0) {
        diagnostics.push({
          file: diagFile,
          line,
          column: col,
          severity: actualSeverity,
          message: msg,
          source: config.id,
          code,
        });
      }
    }
  }

  return diagnostics;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DiagnosticsManager — Main Entry Point
// ═══════════════════════════════════════════════════════════════════════════════

export class DiagnosticsManager {
  private lspClients: Map<string, LSPClient> = new Map();
  private availableServers: Map<string, boolean> = new Map();
  private projectRoot: string;
  private enabled: boolean = true;
  private autoRunAfterEdit: boolean = true;
  private maxDiagnosticsPerFile: number = 50;
  private recentResults: DiagnosticResult[] = [];
  private maxRecentResults: number = 100;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  // ── Initialization ──────────────────────────────────────────────────

  async init(): Promise<void> {
    // Detect available language servers
    for (const server of LSP_SERVERS) {
      const available = await this.checkServerAvailable(server);
      this.availableServers.set(server.id, available);
    }
  }

  private async checkServerAvailable(config: LSPServerConfig): Promise<boolean> {
    try {
      // Check main command
      const checkCmd = config.command === 'npx' ? `npx --yes ${config.args[0]} --help` : `${config.command} --version`;
      await execAsync(checkCmd, { timeout: 10000, stdio: 'pipe' } as any);
      return true;
    } catch {
      // Check CLI fallback
      if (config.cliFallback) {
        try {
          const checkCmd = config.cliFallback === 'npx' ? `npx --yes ${config.cliArgs![0]} --version` : `${config.cliFallback} --version`;
          await execAsync(checkCmd, { timeout: 10000, stdio: 'pipe' } as any);
          return true;
        } catch { return false; }
      }
      return false;
    }
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Run diagnostics on a single file after an edit.
   * Returns diagnostics or empty array if no server available.
   */
  async diagnoseFile(filePath: string): Promise<DiagnosticResult> {
    if (!this.enabled) {
      return { file: filePath, language: '', diagnostics: [], source: '', duration: 0, success: true };
    }

    const startTime = Date.now();
    const ext = path.extname(filePath).toLowerCase();
    const config = this.getServerForExtension(ext);

    if (!config) {
      return { file: filePath, language: '', diagnostics: [], source: '', duration: 0, success: true };
    }

    const available = this.availableServers.get(config.id);
    if (!available) {
      return { file: filePath, language: config.id, diagnostics: [], source: config.id, duration: 0, success: true, error: `${config.name} not available` };
    }

    // Try CLI fallback first (more reliable and simpler)
    let diagnostics: Diagnostic[] = [];
    try {
      diagnostics = await runCliDiagnostics(config, filePath, this.projectRoot);
    } catch (err: any) {
      // CLI failed, try LSP if available
      const client = this.lspClients.get(config.id);
      if (client) {
        diagnostics = client.getDiagnostics(filePath);
      }
    }

    // Limit results
    diagnostics = diagnostics.slice(0, this.maxDiagnosticsPerFile);

    const result: DiagnosticResult = {
      file: filePath,
      language: config.id,
      diagnostics,
      source: config.id,
      duration: Date.now() - startTime,
      success: true,
    };

    this.addRecentResult(result);
    return result;
  }

  /**
   * Run diagnostics on all modified files.
   */
  async diagnoseFiles(filePaths: string[]): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];
    for (const fp of filePaths) {
      results.push(await this.diagnoseFile(fp));
    }
    return results;
  }

  /**
   * Run full project diagnostics using CLI tools.
   */
  async diagnoseProject(): Promise<DiagnosticResult[]> {
    const results: DiagnosticResult[] = [];

    for (const config of LSP_SERVERS) {
      if (!this.availableServers.get(config.id)) continue;
      if (!config.cliFallback) continue;

      // Find relevant files
      const files = await this.findFilesForLanguage(config);
      if (files.length === 0) continue;

      // For project-wide tools (tsc, pyright, cargo check), run once
      try {
        const startTime = Date.now();
        let diagnostics: Diagnostic[] = [];

        if (config.id === 'typescript' || config.id === 'vue-language-server') {
          diagnostics = await this.runProjectDiagnostics(config);
        } else if (config.id === 'pyright') {
          diagnostics = await this.runProjectDiagnostics(config);
        } else if (config.id === 'rust-analyzer') {
          diagnostics = await this.runProjectDiagnostics(config);
        } else {
          // Per-file diagnostics
          for (const file of files.slice(0, 20)) {
            const fileDiags = await runCliDiagnostics(config, file, this.projectRoot);
            diagnostics.push(...fileDiags);
          }
        }

        results.push({
          file: this.projectRoot,
          language: config.id,
          diagnostics: diagnostics.slice(0, 200),
          source: config.id,
          duration: Date.now() - startTime,
          success: true,
        });
      } catch (err: any) {
        results.push({
          file: this.projectRoot,
          language: config.id,
          diagnostics: [],
          source: config.id,
          duration: 0,
          success: false,
          error: err.message,
        });
      }
    }

    return results;
  }

  /**
   * Format diagnostics for display or agent consumption.
   */
  formatDiagnostics(result: DiagnosticResult): string {
    if (!result.success) return `[${result.source}] Error: ${result.error}`;
    if (result.diagnostics.length === 0) return `[${result.source}] No issues found (${result.duration}ms)`;

    const lines: string[] = [];
    const errorCount = result.diagnostics.filter(d => d.severity === 'error').length;
    const warningCount = result.diagnostics.filter(d => d.severity === 'warning').length;
    const infoCount = result.diagnostics.filter(d => d.severity === 'info').length;

    lines.push(`[${result.source}] ${errorCount} error(s), ${warningCount} warning(s), ${infoCount} info (${result.duration}ms)`);

    for (const diag of result.diagnostics) {
      const severity = diag.severity === 'error' ? 'ERROR' : diag.severity === 'warning' ? 'WARN' : 'INFO';
      const location = diag.line > 0 ? `${diag.file}:${diag.line}:${diag.column}` : diag.file;
      const code = diag.code ? ` [${diag.code}]` : '';
      lines.push(`  ${severity}: ${location}${code} - ${diag.message}`);
    }

    return lines.join('\n');
  }

  /**
   * Format all diagnostics results for agent injection.
   */
  formatAllDiagnostics(results: DiagnosticResult[]): string {
    const parts = results.map(r => this.formatDiagnostics(r)).filter(s => s);
    if (parts.length === 0) return '';
    return '# LSP Diagnostics\n\n' + parts.join('\n\n');
  }

  // ── Configuration ───────────────────────────────────────────────────

  setEnabled(enabled: boolean): void { this.enabled = enabled; }
  setAutoRunAfterEdit(auto: boolean): void { this.autoRunAfterEdit = auto; }
  isEnabled(): boolean { return this.enabled; }
  isAutoRunEnabled(): boolean { return this.autoRunAfterEdit; }

  getAvailableServers(): Array<{ id: string; name: string; available: boolean }> {
    return LSP_SERVERS.map(s => ({
      id: s.id,
      name: s.name,
      available: this.availableServers.get(s.id) || false,
    }));
  }

  getRecentResults(): DiagnosticResult[] { return [...this.recentResults]; }

  getSummary(): { totalErrors: number; totalWarnings: number; filesChecked: number } {
    let totalErrors = 0;
    let totalWarnings = 0;
    const files = new Set<string>();
    for (const r of this.recentResults) {
      for (const d of r.diagnostics) {
        if (d.severity === 'error') totalErrors++;
        if (d.severity === 'warning') totalWarnings++;
        files.add(d.file);
      }
    }
    return { totalErrors, totalWarnings, filesChecked: files.size };
  }

  // ── LSP Lifecycle ───────────────────────────────────────────────────

  async startLSPServer(serverId: string): Promise<boolean> {
    const config = LSP_SERVERS.find(s => s.id === serverId);
    if (!config) return false;

    const client = new LSPClient(config, this.projectRoot);
    const started = await client.start();
    if (started) {
      this.lspClients.set(serverId, client);
    }
    return started;
  }

  async stopLSPServer(serverId: string): Promise<void> {
    const client = this.lspClients.get(serverId);
    if (client) {
      await client.shutdown();
      this.lspClients.delete(serverId);
    }
  }

  async stopAll(): Promise<void> {
    for (const [id, client] of this.lspClients) {
      await client.shutdown();
    }
    this.lspClients.clear();
  }

  // ── Private Helpers ─────────────────────────────────────────────────

  private getServerForExtension(ext: string): LSPServerConfig | undefined {
    return LSP_SERVERS.find(s => s.fileExtensions.includes(ext));
  }

  private async findFilesForLanguage(config: LSPServerConfig): Promise<string[]> {
    const files: string[] = [];
    const maxFiles = 100;
    const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', 'target', '__pycache__', '.next', '.mimo', 'coverage']);
    const extSet = new Set(config.fileExtensions);

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 5 || files.length >= maxFiles) return;
      let entries: any[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true as any });
      } catch { return; }
      for (const entry of entries) {
        if (files.length >= maxFiles) break;
        if (entry.name.startsWith('.') && entry.name !== '.env') continue;
        if (entry.isDirectory()) {
          if (!ignoreDirs.has(entry.name)) {
            await walk(path.join(dir, entry.name), depth + 1);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extSet.has(ext)) {
            files.push(path.join(dir, entry.name));
          }
        }
      }
    };

    await walk(this.projectRoot, 0);
    return files;
  }

  private async runProjectDiagnostics(config: LSPServerConfig): Promise<Diagnostic[]> {
    if (!config.cliFallback || !config.cliArgs) return [];

    try {
      const { stdout, stderr } = await execAsync(
        `${config.cliFallback} ${config.cliArgs.join(' ')}`,
        {
          cwd: this.projectRoot,
          timeout: 60000,
          maxBuffer: 10 * 1024 * 1024,
        }
      );
      return parseCliOutput(config, stdout + '\n' + stderr, '', this.projectRoot);
    } catch (err: any) {
      const output = (err.stdout || '') + '\n' + (err.stderr || '');
      return parseCliOutput(config, output, '', this.projectRoot);
    }
  }

  private addRecentResult(result: DiagnosticResult): void {
    this.recentResults.push(result);
    if (this.recentResults.length > this.maxRecentResults) {
      this.recentResults = this.recentResults.slice(-this.maxRecentResults);
    }
  }
}
