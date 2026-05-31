// ── LSP Manager ───────────────────────────────────────────────────────────
// Manages multiple LSP clients per workspace. Auto-detects project language
// from file extensions and config files, routes requests to the correct server,
// handles lifecycle (start, stop, restart), and aggregates diagnostics.

import * as path from 'path';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';
import { LSPClient, LSPClientOptions } from './client';
import {
  Position,
  Range,
  TextEdit,
  Diagnostic,
  CompletionItem,
  Hover,
  Location,
  CodeAction,
  DocumentSymbol,
  SymbolInformation,
  WorkspaceEdit,
  FormattingOptions,
  LSPMethods,
} from './protocol';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface LanguageServerDef {
  id: string;
  name: string;
  languages: string[];
  fileExtensions: string[];
  command: string;
  args: string[];
  /** File patterns indicating this project uses this language (e.g., "package.json" for Node) */
  projectFiles?: string[];
  /** Additional initialization options */
  initializationOptions?: any;
}

export interface LSPManagerOptions {
  /** Project/workspace root directory */
  workspaceRoot: string;
  /** Maximum concurrent language servers */
  maxServers?: number;
  /** Request timeout in ms */
  timeout?: number;
  /** Whether to auto-start servers on first request */
  autoStart?: boolean;
}

export interface DiagnosticsSummary {
  uri: string;
  diagnostics: Diagnostic[];
  serverId: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Known Language Server Definitions
// ═══════════════════════════════════════════════════════════════════════════════

const KNOWN_SERVERS: LanguageServerDef[] = [
  {
    id: 'typescript',
    name: 'TypeScript/JavaScript Language Server',
    languages: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cjs', '.cts'],
    command: 'typescript-language-server',
    args: ['--stdio'],
    projectFiles: ['tsconfig.json', 'jsconfig.json', 'package.json'],
  },
  {
    id: 'pyright',
    name: 'Pyright (Python)',
    languages: ['python'],
    fileExtensions: ['.py', '.pyi'],
    command: 'pyright-langserver',
    args: ['--stdio'],
    projectFiles: ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile'],
  },
  {
    id: 'gopls',
    name: 'gopls (Go)',
    languages: ['go'],
    fileExtensions: ['.go'],
    command: 'gopls',
    args: [],
    projectFiles: ['go.mod', 'go.sum'],
  },
  {
    id: 'rust-analyzer',
    name: 'rust-analyzer (Rust)',
    languages: ['rust'],
    fileExtensions: ['.rs'],
    command: 'rust-analyzer',
    args: [],
    projectFiles: ['Cargo.toml', 'Cargo.lock'],
  },
  {
    id: 'clangd',
    name: 'clangd (C/C++)',
    languages: ['c', 'cpp'],
    fileExtensions: ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx'],
    command: 'clangd',
    args: ['--background-index=false', '--clang-tidy=false'],
    projectFiles: ['CMakeLists.txt', 'Makefile', 'compile_commands.json', 'meson.build'],
  },
  {
    id: 'jdtls',
    name: 'Eclipse JDT Language Server (Java)',
    languages: ['java'],
    fileExtensions: ['.java'],
    command: 'jdtls',
    args: [],
    projectFiles: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
  },
  {
    id: 'lua-language-server',
    name: 'Lua Language Server',
    languages: ['lua'],
    fileExtensions: ['.lua'],
    command: 'lua-language-server',
    args: [],
    projectFiles: ['.luarc.json', '.luacheckrc'],
  },
  {
    id: 'vscode-css-languageserver',
    name: 'CSS/HTML Language Server',
    languages: ['css', 'scss', 'less', 'html'],
    fileExtensions: ['.css', '.scss', '.less', '.html', '.htm'],
    command: 'vscode-css-languageserver',
    args: ['--stdio'],
    projectFiles: [],
  },
  {
    id: 'eslint',
    name: 'ESLint Language Server',
    languages: ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'],
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],
    command: 'eslint',
    args: ['--stdio'],
    projectFiles: ['.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', 'eslint.config.js', 'eslint.config.mjs'],
  },
  {
    id: 'solargraph',
    name: 'Solargraph (Ruby)',
    languages: ['ruby'],
    fileExtensions: ['.rb', '.erb', '.gemspec', 'Gemfile'],
    command: 'solargraph',
    args: ['stdio'],
    projectFiles: ['Gemfile', 'Rakefile', '.gemspec'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// LSP Manager
// ═══════════════════════════════════════════════════════════════════════════════

export class LSPManager extends EventEmitter {
  private options: Required<LSPManagerOptions>;
  private clients: Map<string, LSPClient> = new Map();
  private diagnostics: Map<string, Diagnostic[]> = new Map(); // uri -> diagnostics
  private serverDefinitions: LanguageServerDef[];
  private detectedLanguages: Map<string, Set<string>> = new Map(); // serverId -> set of extensions found
  private diagnosticsListeners: Map<string, (uri: string, diagnostics: Diagnostic[]) => void> = new Map();

  constructor(options: LSPManagerOptions) {
    super();
    this.options = {
      workspaceRoot: path.resolve(options.workspaceRoot),
      maxServers: options.maxServers ?? 5,
      timeout: options.timeout ?? 30000,
      autoStart: options.autoStart ?? true,
    };
    this.serverDefinitions = [...KNOWN_SERVERS];
  }

  // ── Language Detection ───────────────────────────────────────────────────

  /**
   * Auto-detect which languages are used in the project by scanning for
   * project config files and counting file extensions.
   */
  async detectLanguages(): Promise<Map<string, LanguageServerDef>> {
    const detected = new Map<string, LanguageServerDef>();
    const ignoreDirs = new Set([
      'node_modules', '.git', 'dist', 'build', 'target', '__pycache__',
      '.next', '.mimo', 'coverage', '.tox', 'vendor', 'bin', 'obj',
    ]);

    const extensionCounts = new Map<string, number>();
    const projectFiles = new Set<string>();

    // Walk the project directory (depth-limited)
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 4) return;
      let entries: any[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true as any });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.env') continue;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!ignoreDirs.has(entry.name)) {
            await walk(fullPath, depth + 1);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext) {
            extensionCounts.set(ext, (extensionCounts.get(ext) ?? 0) + 1);
          }
          // Check for project config files
          for (const serverDef of this.serverDefinitions) {
            if (serverDef.projectFiles?.includes(entry.name)) {
              projectFiles.add(serverDef.id);
            }
          }
        }
      }
    };

    await walk(this.options.workspaceRoot, 0);

    // Match extensions and project files to language servers
    for (const serverDef of this.serverDefinitions) {
      const matchingExts = serverDef.fileExtensions.filter(
        (ext) => (extensionCounts.get(ext) ?? 0) > 0
      );
      const hasProjectFile = projectFiles.has(serverDef.id);

      if (matchingExts.length > 0 || hasProjectFile) {
        detected.set(serverDef.id, serverDef);
        this.detectedLanguages.set(serverDef.id, new Set(matchingExts));
      }
    }

    return detected;
  }

  /**
   * Get the server definition for a given file path.
   */
  getServerForFile(filePath: string): LanguageServerDef | null {
    const ext = path.extname(filePath).toLowerCase();
    return this.serverDefinitions.find((def) => def.fileExtensions.includes(ext)) ?? null;
  }

  /**
   * Get the server definition by ID.
   */
  getServerById(serverId: string): LanguageServerDef | null {
    return this.serverDefinitions.find((def) => def.id === serverId) ?? null;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Start a specific language server.
   */
  async startServer(serverId: string): Promise<boolean> {
    if (this.clients.has(serverId)) return true;
    if (this.clients.size >= this.options.maxServers) {
      this.emit('error', new Error(`Maximum concurrent servers (${this.options.maxServers}) reached`));
      return false;
    }

    const def = this.getServerById(serverId);
    if (!def) return false;

    const client = new LSPClient({
      command: def.command,
      args: def.args,
      cwd: this.options.workspaceRoot,
      name: def.name,
      timeout: this.options.timeout,
      initializationOptions: def.initializationOptions,
    });

    // Collect diagnostics from this server
    const diagnosticsHandler = (uri: string, diagnostics: Diagnostic[]) => {
      // Tag diagnostics with server source
      const tagged = diagnostics.map((d) => ({
        ...d,
        source: d.source ?? def.id,
      }));

      // Update aggregated diagnostics
      const key = `${serverId}:${uri}`;
      this.diagnostics.set(key, tagged);

      // Emit aggregated event
      this.emit('diagnostics', {
        uri,
        diagnostics: tagged,
        serverId,
      } as DiagnosticsSummary);
    };

    client.on('diagnostics', diagnosticsHandler);
    this.diagnosticsListeners.set(serverId, diagnosticsHandler);

    client.on('error', (err: Error) => {
      this.emit('error', new Error(`[${def.id}] ${err.message}`));
    });

    client.on('exit', (code: number | null) => {
      this.clients.delete(serverId);
      this.diagnosticsListeners.delete(serverId);
      this.emit('serverStopped', serverId, code);
    });

    try {
      await client.start();
      this.clients.set(serverId, client);
      this.emit('serverStarted', serverId);
      return true;
    } catch (err) {
      this.emit('error', new Error(`Failed to start ${def.name}: ${(err as Error).message}`));
      return false;
    }
  }

  /**
   * Stop a specific language server.
   */
  async stopServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (!client) return;

    const listener = this.diagnosticsListeners.get(serverId);
    if (listener) {
      client.removeListener('diagnostics', listener);
      this.diagnosticsListeners.delete(serverId);
    }

    await client.shutdown();
    this.clients.delete(serverId);
  }

  /**
   * Restart a specific language server.
   */
  async restartServer(serverId: string): Promise<boolean> {
    await this.stopServer(serverId);
    return this.startServer(serverId);
  }

  /**
   * Start all detected language servers.
   */
  async startAll(): Promise<Map<string, boolean>> {
    const detected = await this.detectLanguages();
    const results = new Map<string, boolean>();

    for (const serverId of detected.keys()) {
      // Respect maxServers limit
      if (this.clients.size >= this.options.maxServers) break;
      results.set(serverId, await this.startServer(serverId));
    }

    return results;
  }

  /**
   * Stop all language servers.
   */
  async stopAll(): Promise<void> {
    const shutdownPromises: Promise<void>[] = [];
    for (const [serverId] of this.clients) {
      shutdownPromises.push(this.stopServer(serverId));
    }
    await Promise.all(shutdownPromises);
    this.diagnostics.clear();
  }

  // ── Document Synchronization ─────────────────────────────────────────────

  /**
   * Notify the correct server that a document was opened.
   */
  async didOpen(filePath: string, languageId: string, text: string): Promise<void> {
    const serverId = await this.ensureServerForFile(filePath);
    if (!serverId) return;

    const client = this.clients.get(serverId);
    if (!client?.isReady()) return;

    const uri = this.filePathToUri(filePath);
    client.didOpen(uri, languageId, text);
  }

  /**
   * Notify the correct server about document content changes.
   */
  async didChange(filePath: string, newText: string): Promise<void> {
    const serverId = await this.ensureServerForFile(filePath);
    if (!serverId) return;

    const client = this.clients.get(serverId);
    if (!client?.isReady()) return;

    const uri = this.filePathToUri(filePath);
    client.didChange(uri, newText);
  }

  /**
   * Notify the correct server that a document was closed.
   */
  didClose(filePath: string): void {
    const uri = this.filePathToUri(filePath);

    // Notify all clients that may have this file open (e.g., eslint + typescript)
    for (const [, client] of this.clients) {
      if (client.isReady()) {
        client.didClose(uri);
      }
    }
  }

  /**
   * Notify the correct server that a document was saved.
   */
  didSave(filePath: string): void {
    const uri = this.filePathToUri(filePath);

    for (const [, client] of this.clients) {
      if (client.isReady()) {
        client.didSave(uri);
      }
    }
  }

  // ── Language Feature Routing ─────────────────────────────────────────────

  /**
   * Get completions for a file at a position. Routes to the correct server.
   */
  async completion(
    filePath: string,
    position: Position,
    context?: { triggerKind?: number; triggerCharacter?: string }
  ): Promise<CompletionItem[]> {
    const serverId = await this.ensureServerForFile(filePath);
    if (!serverId) return [];

    const client = this.clients.get(serverId);
    if (!client?.isReady()) return [];

    return client.completion(this.filePathToUri(filePath), position, context);
  }

  /**
   * Get hover information for a file at a position.
   */
  async hover(filePath: string, position: Position): Promise<Hover | null> {
    const serverId = await this.ensureServerForFile(filePath);
    if (!serverId) return null;

    const client = this.clients.get(serverId);
    if (!client?.isReady()) return null;

    return client.hover(this.filePathToUri(filePath), position);
  }

  /**
   * Go to definition for a file at a position.
   */
  async definition(filePath: string, position: Position): Promise<Location[]> {
    const serverId = await this.ensureServerForFile(filePath);
    if (!serverId) return [];

    const client = this.clients.get(serverId);
    if (!client?.isReady()) return [];

    return client.definition(this.filePathToUri(filePath), position);
  }

  /**
   * Find references for a symbol at a position.
   */
  async references(
    filePath: string,
    position: Position,
    includeDeclaration: boolean = true
  ): Promise<Location[]> {
    const serverId = await this.ensureServerForFile(filePath);
    if (!serverId) return [];

    const client = this.clients.get(serverId);
    if (!client?.isReady()) return [];

    return client.references(this.filePathToUri(filePath), position, includeDeclaration);
  }

  /**
   * Get code actions for a file range.
   */
  async codeAction(
    filePath: string,
    range: Range,
    diagnostics: Diagnostic[] = []
  ): Promise<CodeAction[]> {
    const serverId = await this.ensureServerForFile(filePath);
    if (!serverId) return [];

    const client = this.clients.get(serverId);
    if (!client?.isReady()) return [];

    return client.codeAction(this.filePathToUri(filePath), range, diagnostics);
  }

  /**
   * Format a document.
   */
  async formatting(
    filePath: string,
    options?: Partial<FormattingOptions>
  ): Promise<TextEdit[]> {
    const serverId = await this.ensureServerForFile(filePath);
    if (!serverId) return [];

    const client = this.clients.get(serverId);
    if (!client?.isReady()) return [];

    return client.formatting(this.filePathToUri(filePath), options);
  }

  /**
   * Get document symbols (outline).
   */
  async documentSymbol(filePath: string): Promise<DocumentSymbol[] | SymbolInformation[]> {
    const serverId = await this.ensureServerForFile(filePath);
    if (!serverId) return [];

    const client = this.clients.get(serverId);
    if (!client?.isReady()) return [];

    return client.documentSymbol(this.filePathToUri(filePath));
  }

  /**
   * Rename a symbol at a position.
   */
  async rename(
    filePath: string,
    position: Position,
    newName: string
  ): Promise<WorkspaceEdit | null> {
    const serverId = await this.ensureServerForFile(filePath);
    if (!serverId) return null;

    const client = this.clients.get(serverId);
    if (!client?.isReady()) return null;

    return client.rename(this.filePathToUri(filePath), position, newName);
  }

  // ── Diagnostics ──────────────────────────────────────────────────────────

  /**
   * Get all collected diagnostics for a specific file.
   */
  getFileDiagnostics(filePath: string): Diagnostic[] {
    const uri = this.filePathToUri(filePath);
    const result: Diagnostic[] = [];

    for (const [key, diagnostics] of this.diagnostics) {
      if (key.endsWith(`:${uri}`)) {
        result.push(...diagnostics);
      }
    }

    return result;
  }

  /**
   * Get all diagnostics across all servers.
   */
  getAllDiagnostics(): DiagnosticsSummary[] {
    const byUri = new Map<string, Diagnostic[]>();

    for (const [key, diagnostics] of this.diagnostics) {
      const [serverId, ...uriParts] = key.split(':');
      const uri = uriParts.join(':'); // rejoin in case URI contains ':'
      const existing = byUri.get(uri) ?? [];
      existing.push(...diagnostics);
      byUri.set(uri, existing);
    }

    return Array.from(byUri.entries()).map(([uri, diagnostics]) => ({
      uri,
      diagnostics,
      serverId: 'aggregated',
    }));
  }

  /**
   * Format diagnostics for display.
   */
  formatDiagnostics(diagnostics: Diagnostic[]): string {
    if (diagnostics.length === 0) return 'No diagnostics found.';

    const errors = diagnostics.filter((d) => d.severity === 1);
    const warnings = diagnostics.filter((d) => d.severity === 2);
    const infos = diagnostics.filter((d) => d.severity === 3);
    const hints = diagnostics.filter((d) => d.severity === 4);

    const lines: string[] = [
      `Diagnostics: ${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info, ${hints.length} hint(s)`,
      '',
    ];

    const severityLabel = (s?: number) => {
      switch (s) {
        case 1: return 'ERROR';
        case 2: return 'WARN';
        case 3: return 'INFO';
        case 4: return 'HINT';
        default: return 'UNKNOWN';
      }
    };

    for (const d of diagnostics) {
      const line = d.range.start.line + 1;
      const col = d.range.start.character + 1;
      const code = d.code ? ` [${d.code}]` : '';
      const source = d.source ? ` (${d.source})` : '';
      lines.push(`  ${severityLabel(d.severity)}: ${line}:${col}${code}${source} - ${d.message}`);
    }

    return lines.join('\n');
  }

  // ── Status ───────────────────────────────────────────────────────────────

  /**
   * Get status of all managed servers.
   */
  getStatus(): Array<{
    id: string;
    name: string;
    running: boolean;
    ready: boolean;
    diagnosticCount: number;
  }> {
    return this.serverDefinitions
      .filter((def) => this.clients.has(def.id) || this.detectedLanguages.has(def.id))
      .map((def) => {
        const client = this.clients.get(def.id);
        let diagCount = 0;
        for (const [key, diagnostics] of this.diagnostics) {
          if (key.startsWith(`${def.id}:`)) {
            diagCount += diagnostics.length;
          }
        }
        return {
          id: def.id,
          name: def.name,
          running: !!client,
          ready: client?.isReady() ?? false,
          diagnosticCount: diagCount,
        };
      });
  }

  /**
   * Get the list of registered server definitions.
   */
  getServerDefinitions(): LanguageServerDef[] {
    return [...this.serverDefinitions];
  }

  /**
   * Register a custom language server definition.
   */
  registerServer(def: LanguageServerDef): void {
    // Remove any existing definition with the same ID
    this.serverDefinitions = this.serverDefinitions.filter((d) => d.id !== def.id);
    this.serverDefinitions.push(def);
  }

  // ── Internal Helpers ─────────────────────────────────────────────────────

  /**
   * Ensure a server is running for the given file. Auto-starts if needed.
   */
  private async ensureServerForFile(filePath: string): Promise<string | null> {
    const def = this.getServerForFile(filePath);
    if (!def) return null;

    // Check if a client already exists for this server type
    if (this.clients.has(def.id)) {
      return def.id;
    }

    // Auto-start if enabled
    if (this.options.autoStart) {
      const started = await this.startServer(def.id);
      return started ? def.id : null;
    }

    return null;
  }

  /**
   * Convert a file path to a URI.
   */
  private filePathToUri(filePath: string): string {
    const absolute = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.options.workspaceRoot, filePath);
    return `file://${absolute.replace(/\\/g, '/')}`;
  }
}
