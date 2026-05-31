// ── LSP Client Implementation ─────────────────────────────────────────────
// Full Language Server Protocol client using JSON-RPC 2.0 over stdio.
// Supports initialization handshake, document sync, language features,
// diagnostics notification handling, error recovery, and reconnection.

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCNotification,
  Position,
  Range,
  TextDocumentIdentifier,
  VersionedTextDocumentIdentifier,
  TextDocumentItem,
  TextDocumentContentChangeEvent,
  TextDocumentPositionParams,
  TextEdit,
  WorkspaceEdit,
  Diagnostic,
  DiagnosticSeverity,
  PublishDiagnosticsParams,
  CompletionItem,
  CompletionList,
  CompletionParams,
  CompletionTriggerKind,
  Hover,
  MarkedString,
  Location,
  CodeAction,
  CodeActionParams,
  Command,
  DocumentSymbol,
  SymbolInformation,
  FormattingOptions,
  DocumentFormattingParams,
  RenameParams,
  ReferenceParams,
  InitializeParams,
  InitializeResult,
  ServerCapabilities,
  ClientCapabilities,
  TextDocumentSyncKind,
  LSPMethods,
  encodeLSPMessage,
  createRequest,
  createNotification,
  LSPMessageDecoder,
  isNotification,
  isResponse,
  isRequest,
} from './protocol';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface LSPClientOptions {
  /** Language server command (e.g., "typescript-language-server") */
  command: string;
  /** Command arguments (e.g., ["--stdio"]) */
  args?: string[];
  /** Working directory for the language server */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Server name for logging */
  name?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum reconnection attempts (default: 3) */
  maxReconnectAttempts?: number;
  /** Delay between reconnect attempts in ms (default: 2000) */
  reconnectDelay?: number;
  /** Initialization options sent to the server */
  initializationOptions?: any;
}

export interface LSPClientEvents {
  diagnostics: (uri: string, diagnostics: Diagnostic[]) => void;
  error: (error: Error) => void;
  exit: (code: number | null, signal: string | null) => void;
  close: () => void;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  method: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LSP Client
// ═══════════════════════════════════════════════════════════════════════════════

export class LSPClient extends EventEmitter {
  private options: Required<LSPClientOptions>;
  private process: ChildProcess | null = null;
  private requestId: number = 0;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private decoder: LSPMessageDecoder = new LSPMessageDecoder();
  private serverCapabilities: ServerCapabilities | null = null;
  private initialized: boolean = false;
  private connected: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private documentVersions: Map<string, number> = new Map();
  private openDocuments: Set<string> = new Set();

  constructor(options: LSPClientOptions) {
    super();
    this.options = {
      command: options.command,
      args: options.args ?? [],
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? {},
      name: options.name ?? options.command,
      timeout: options.timeout ?? 30000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 3,
      reconnectDelay: options.reconnectDelay ?? 2000,
      initializationOptions: options.initializationOptions ?? {},
    };
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Start the language server process and perform the initialize handshake.
   * Returns the server's capabilities on success.
   */
  async start(): Promise<InitializeResult> {
    if (this.connected) {
      throw new Error(`LSP client "${this.options.name}" is already started`);
    }

    return new Promise<InitializeResult>((resolve, reject) => {
      try {
        this.process = spawn(this.options.command, this.options.args, {
          cwd: this.options.cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: process.platform === 'win32',
          env: { ...process.env, NODE_NO_WARNINGS: '1', ...this.options.env },
        });
      } catch (err) {
        reject(new Error(`Failed to spawn LSP server "${this.options.name}": ${(err as Error).message}`));
        return;
      }

      this.decoder.reset();

      // Handle stdout (JSON-RPC messages from server)
      this.process.stdout!.on('data', (data: Buffer) => {
        try {
          const messages = this.decoder.feed(data);
          for (const msg of messages) {
            this.handleMessage(msg);
          }
        } catch (err) {
          this.emit('error', new Error(`LSP message decode error: ${(err as Error).message}`));
        }
      });

      // Suppress stderr (servers often log to stderr)
      this.process.stderr?.on('data', () => {});

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        this.connected = false;
        this.initialized = false;
        this.rejectAllPending(`Server exited (code=${code}, signal=${signal})`);
        this.emit('exit', code, signal);

        // Attempt reconnection for unexpected exits
        if (code !== 0 && this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      });

      this.process.on('error', (err) => {
        this.emit('error', new Error(`LSP server process error: ${err.message}`));
      });

      // Perform initialize handshake
      const initParams: InitializeParams = {
        processId: process.pid,
        rootUri: `file://${this.options.cwd.replace(/\\/g, '/')}`,
        capabilities: this.buildClientCapabilities(),
        initializationOptions: this.options.initializationOptions,
        workspaceFolders: [
          {
            uri: `file://${this.options.cwd.replace(/\\/g, '/')}`,
            name: require('path').basename(this.options.cwd),
          },
        ],
      };

      this.sendRequest<InitializeResult>(LSPMethods.Initialize, initParams)
        .then((result) => {
          this.serverCapabilities = result.capabilities;
          this.initialized = true;
          this.connected = true;
          this.reconnectAttempts = 0;

          // Send initialized notification
          this.sendNotification(LSPMethods.Initialized, {});

          resolve(result);
        })
        .catch((err) => {
          this.process?.kill();
          this.process = null;
          reject(new Error(`LSP initialize failed for "${this.options.name}": ${err.message}`));
        });
    });
  }

  /**
   * Gracefully shut down the language server (shutdown + exit).
   */
  async shutdown(): Promise<void> {
    if (!this.connected || !this.initialized) {
      this.killProcess();
      return;
    }

    try {
      await this.sendRequest(LSPMethods.Shutdown, null);
      this.sendNotification(LSPMethods.Exit, null);
    } catch {
      // Best-effort shutdown
    }

    this.initialized = false;
    this.connected = false;
    this.killProcess();
    this.rejectAllPending('Client shut down');
    this.emit('close');
  }

  /**
   * Check if the client is connected and initialized.
   */
  isReady(): boolean {
    return this.connected && this.initialized;
  }

  /**
   * Get the server's capabilities (available after initialization).
   */
  getCapabilities(): ServerCapabilities | null {
    return this.serverCapabilities;
  }

  // ── Document Synchronization ─────────────────────────────────────────────

  /**
   * Notify the server that a document was opened.
   */
  didOpen(uri: string, languageId: string, text: string): void {
    const version = 1;
    this.documentVersions.set(uri, version);
    this.openDocuments.add(uri);

    const item: TextDocumentItem = {
      uri,
      languageId,
      version,
      text,
    };

    this.sendNotification(LSPMethods.DidOpen, { textDocument: item });
  }

  /**
   * Notify the server about document content changes (full sync).
   */
  didChange(uri: string, newText: string): void {
    if (!this.serverCapabilities) return;

    const syncKind = this.getTextDocumentSyncKind();
    const currentVersion = (this.documentVersions.get(uri) ?? 0) + 1;
    this.documentVersions.set(uri, currentVersion);

    const changes: TextDocumentContentChangeEvent[] =
      syncKind === TextDocumentSyncKind.Incremental
        ? [{ text: newText }] // For incremental we'd need to compute diffs; send full as safe fallback
        : [{ text: newText }];

    this.sendNotification(LSPMethods.DidChange, {
      textDocument: {
        uri,
        version: currentVersion,
      } as VersionedTextDocumentIdentifier,
      contentChanges: changes,
    });
  }

  /**
   * Notify the server that a document was closed.
   */
  didClose(uri: string): void {
    this.openDocuments.delete(uri);
    this.documentVersions.delete(uri);

    this.sendNotification(LSPMethods.DidClose, {
      textDocument: { uri } as TextDocumentIdentifier,
    });
  }

  /**
   * Notify the server that a document was saved.
   */
  didSave(uri: string, text?: string): void {
    const params: any = {
      textDocument: { uri } as TextDocumentIdentifier,
    };
    if (text !== undefined) {
      params.text = text;
    }
    this.sendNotification(LSPMethods.DidSave, params);
  }

  // ── Language Feature Requests ────────────────────────────────────────────

  /**
   * Request code completion at a position.
   */
  async completion(
    uri: string,
    position: Position,
    context?: { triggerKind?: CompletionTriggerKind; triggerCharacter?: string }
  ): Promise<CompletionItem[]> {
    const params: CompletionParams = {
      textDocument: { uri },
      position,
      context: context
        ? {
            triggerKind: context.triggerKind ?? CompletionTriggerKind.Invoked,
            triggerCharacter: context.triggerCharacter,
          }
        : undefined,
    };

    const result = await this.sendRequest<CompletionList | CompletionItem[] | null>(
      LSPMethods.Completion,
      params
    );

    if (!result) return [];
    if (Array.isArray(result)) return result;
    return result.items ?? [];
  }

  /**
   * Request hover information at a position.
   */
  async hover(uri: string, position: Position): Promise<Hover | null> {
    const params: TextDocumentPositionParams = { textDocument: { uri }, position };
    return this.sendRequest<Hover | null>(LSPMethods.Hover, params);
  }

  /**
   * Request the definition location(s) of the symbol at a position.
   */
  async definition(uri: string, position: Position): Promise<Location[]> {
    const params: TextDocumentPositionParams = { textDocument: { uri }, position };
    const result = await this.sendRequest<Location | Location[] | null>(LSPMethods.Definition, params);

    if (!result) return [];
    if (Array.isArray(result)) return result;
    return [result];
  }

  /**
   * Request references to the symbol at a position.
   */
  async references(
    uri: string,
    position: Position,
    includeDeclaration: boolean = true
  ): Promise<Location[]> {
    const params: ReferenceParams = {
      textDocument: { uri },
      position,
      context: { includeDeclaration },
    };
    return this.sendRequest<Location[]>(LSPMethods.References, params) ?? [];
  }

  /**
   * Request code actions for a range (e.g., quick fixes, refactorings).
   */
  async codeAction(
    uri: string,
    range: Range,
    diagnostics: Diagnostic[] = []
  ): Promise<CodeAction[]> {
    const params: CodeActionParams = {
      textDocument: { uri },
      range,
      context: { diagnostics },
    };
    const result = await this.sendRequest<(CodeAction | Command)[] | null>(
      LSPMethods.CodeAction,
      params
    );
    return (result ?? []) as CodeAction[];
  }

  /**
   * Request document formatting.
   */
  async formatting(
    uri: string,
    options?: Partial<FormattingOptions>
  ): Promise<TextEdit[]> {
    const params: DocumentFormattingParams = {
      textDocument: { uri },
      options: {
        tabSize: 2,
        insertSpaces: true,
        ...options,
      },
    };
    return this.sendRequest<TextEdit[]>(LSPMethods.Formatting, params) ?? [];
  }

  /**
   * Request document symbols (outline of the file).
   */
  async documentSymbol(uri: string): Promise<DocumentSymbol[] | SymbolInformation[]> {
    const params = { textDocument: { uri } as TextDocumentIdentifier };
    const result = await this.sendRequest<DocumentSymbol[] | SymbolInformation[] | null>(
      LSPMethods.DocumentSymbol,
      params
    );
    return result ?? [];
  }

  /**
   * Request a rename operation.
   */
  async rename(
    uri: string,
    position: Position,
    newName: string
  ): Promise<WorkspaceEdit | null> {
    const params: RenameParams = {
      textDocument: { uri },
      position,
      newName,
    };
    return this.sendRequest<WorkspaceEdit | null>(LSPMethods.Rename, params);
  }

  // ── Request / Notification Transport ─────────────────────────────────────

  /**
   * Send a JSON-RPC request and wait for the response.
   */
  private sendRequest<T>(method: string, params: any): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        reject(new Error(`LSP client "${this.options.name}" is not connected`));
        return;
      }

      const id = ++this.requestId;

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`LSP request timed out (${this.options.timeout}ms): ${method}`));
        }
      }, this.options.timeout);

      this.pendingRequests.set(id, { resolve: resolve as any, reject, timer, method });

      const message = createRequest(id, method, params);
      const encoded = encodeLSPMessage(message);

      try {
        this.process.stdin.write(encoded);
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(new Error(`Failed to write to LSP server: ${(err as Error).message}`));
      }
    });
  }

  /**
   * Send a JSON-RPC notification (fire-and-forget, no response expected).
   */
  private sendNotification(method: string, params: any): void {
    if (!this.process || !this.process.stdin) return;

    const message = createNotification(method, params);
    const encoded = encodeLSPMessage(message);

    try {
      this.process.stdin.write(encoded);
    } catch {
      // Best-effort; process is likely dying
    }
  }

  // ── Message Handling ─────────────────────────────────────────────────────

  private handleMessage(message: JSONRPCMessage): void {
    if (isResponse(message)) {
      // Response to a request we sent
      const pending = this.pendingRequests.get(message.id as number);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.id as number);

        if (message.error) {
          pending.reject(
            new Error(
              `LSP error (${pending.method}): [${message.error.code}] ${message.error.message}`
            )
          );
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (isNotification(message)) {
      // Server -> client notification
      this.handleNotification(message);
    } else if (isRequest(message)) {
      // Server -> client request (e.g., window/showMessage) -- acknowledge but don't act
      // In a full implementation, we'd handle workspace/applyEdit, window/showMessage, etc.
    }
  }

  private handleNotification(notification: JSONRPCNotification): void {
    switch (notification.method) {
      case LSPMethods.PublishDiagnostics: {
        const params = notification.params as PublishDiagnosticsParams;
        this.emit('diagnostics', params.uri, params.diagnostics);
        break;
      }
      case 'window/showMessage':
      case 'window/logMessage':
      case 'telemetry/event':
        // Acknowledge but don't process in the client
        break;
      default:
        // Unknown notification
        break;
    }
  }

  // ── Reconnection ─────────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = this.options.reconnectDelay * this.reconnectAttempts;

    this.reconnectTimer = setTimeout(async () => {
      try {
        // Re-open all previously open documents after reconnection
        const previouslyOpen = new Set(this.openDocuments);
        this.openDocuments.clear();
        this.documentVersions.clear();

        const result = await this.start();

        // Re-sync documents
        // Note: We don't have the full text of previously open documents cached here.
        // Callers should re-open documents after detecting a reconnection via the 'reconnected' event.
        this.emit('reconnected', result);
      } catch {
        if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          this.emit('error', new Error(`Failed to reconnect to "${this.options.name}" after ${this.options.maxReconnectAttempts} attempts`));
        }
      }
    }, delay);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private getTextDocumentSyncKind(): TextDocumentSyncKind {
    if (!this.serverCapabilities) return TextDocumentSyncKind.Full;
    const sync = this.serverCapabilities.textDocumentSync;
    if (typeof sync === 'number') return sync;
    if (sync && typeof sync === 'object' && 'change' in sync) {
      return sync.change ?? TextDocumentSyncKind.Full;
    }
    return TextDocumentSyncKind.Full;
  }

  private buildClientCapabilities(): ClientCapabilities {
    return {
      textDocument: {
        synchronization: {
          dynamicRegistration: false,
          willSave: false,
          willSaveWaitUntil: false,
          didSave: true,
        },
        completion: {
          dynamicRegistration: false,
          completionItem: {
            snippetSupport: true,
            commitCharactersSupport: true,
            documentationFormat: ['markdown', 'plaintext'],
            deprecatedSupport: true,
            preselectSupport: true,
            tagSupport: { valueSet: [1] },
          },
          contextSupport: true,
        },
        hover: {
          dynamicRegistration: false,
          contentFormat: ['markdown', 'plaintext'],
        },
        definition: {
          dynamicRegistration: false,
          linkSupport: false,
        },
        references: { dynamicRegistration: false },
        codeAction: {
          dynamicRegistration: false,
          codeActionLiteralSupport: {
            codeActionKind: {
              valueSet: [
                '',
                'quickfix',
                'refactor',
                'refactor.extract',
                'refactor.inline',
                'refactor.rewrite',
                'source',
                'source.organizeImports',
                'source.fixAll',
              ],
            },
          },
        },
        formatting: { dynamicRegistration: false },
        rename: { dynamicRegistration: false, prepareSupport: true },
        publishDiagnostics: {
          relatedInformation: true,
          tagSupport: { valueSet: [1, 2] },
          versionSupport: true,
        },
      },
      workspace: {
        workspaceEdit: {
          documentChanges: true,
          resourceOperations: ['create', 'rename', 'delete'],
        },
      },
    };
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }

  private killProcess(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.process) {
      try {
        this.process.kill();
      } catch {
        // Process may already be dead
      }
      this.process = null;
    }
  }
}
