// ── LSP Protocol Types, Constants, and JSON-RPC Helpers ───────────────────
// Language Server Protocol (LSP 3.17) type definitions and utilities.
// See: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/

// ═══════════════════════════════════════════════════════════════════════════════
// JSON-RPC 2.0 Base Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: any;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: JSONRPCError;
}

export interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: any;
}

export type JSONRPCMessage = JSONRPCRequest | JSONRPCResponse | JSONRPCNotification;

// Standard JSON-RPC error codes
export const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  // LSP-specific error codes
  ServerNotInitialized: -32002,
  RequestCancelled: -32800,
  ContentModified: -32801,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Basic LSP Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface Position {
  /** 0-based line number */
  line: number;
  /** 0-based character offset (UTF-16 code units) */
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface TextDocumentIdentifier {
  uri: string;
}

export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
  version: number;
}

export interface TextDocumentItem {
  uri: string;
  languageId: string;
  version: number;
  text: string;
}

export interface TextDocumentContentChangeEvent {
  range?: Range;
  text: string;
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface WorkspaceEdit {
  changes?: { [uri: string]: TextEdit[] };
  documentChanges?: Array<TextDocumentEdit | CreateFile | RenameFile | DeleteFile>;
}

export interface TextDocumentEdit {
  textDocument: VersionedTextDocumentIdentifier;
  edits: TextEdit[];
}

export interface CreateFile {
  kind: 'create';
  uri: string;
}

export interface RenameFile {
  kind: 'rename';
  oldUri: string;
  newUri: string;
}

export interface DeleteFile {
  kind: 'delete';
  uri: string;
}

export interface TextDocumentPositionParams {
  textDocument: TextDocumentIdentifier;
  position: Position;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Diagnostics
// ═══════════════════════════════════════════════════════════════════════════════

export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export enum DiagnosticTag {
  Unnecessary = 1,
  Deprecated = 2,
}

export interface Diagnostic {
  range: Range;
  severity?: DiagnosticSeverity;
  code?: number | string;
  codeDescription?: { href: string };
  source?: string;
  message: string;
  tags?: DiagnosticTag[];
  relatedInformation?: DiagnosticRelatedInformation[];
  data?: any;
}

export interface DiagnosticRelatedInformation {
  location: Location;
  message: string;
}

export interface PublishDiagnosticsParams {
  uri: string;
  version?: number;
  diagnostics: Diagnostic[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Completion
// ═══════════════════════════════════════════════════════════════════════════════

export enum CompletionItemKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
  Folder = 19,
  EnumMember = 20,
  Constant = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

export enum InsertTextFormat {
  PlainText = 1,
  Snippet = 2,
}

export interface CompletionItem {
  label: string;
  kind?: CompletionItemKind;
  tags?: CompletionItemTag[];
  detail?: string;
  documentation?: string | MarkupContent;
  deprecated?: boolean;
  preselect?: boolean;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  insertTextFormat?: InsertTextFormat;
  textEdit?: TextEdit | InsertReplaceEdit;
  additionalTextEdits?: TextEdit[];
  commitCharacters?: string[];
  command?: Command;
  data?: any;
}

export enum CompletionItemTag {
  Deprecated = 1,
}

export interface InsertReplaceEdit {
  newText: string;
  insert: Range;
  replace: Range;
}

export interface Command {
  title: string;
  command: string;
  arguments?: any[];
}

export interface CompletionList {
  isIncomplete: boolean;
  items: CompletionItem[];
}

export interface CompletionParams extends TextDocumentPositionParams {
  context?: CompletionContext;
}

export interface CompletionContext {
  triggerKind: CompletionTriggerKind;
  triggerCharacter?: string;
}

export enum CompletionTriggerKind {
  Invoked = 1,
  TriggerCharacter = 2,
  TriggerForIncompleteCompletions = 3,
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hover
// ═══════════════════════════════════════════════════════════════════════════════

export interface Hover {
  contents: MarkupContent | MarkedString | MarkedString[];
  range?: Range;
}

export type MarkedString = string | { language: string; value: string };

export interface MarkupContent {
  kind: MarkupKind;
  value: string;
}

export type MarkupKind = 'plaintext' | 'markdown';

// ═══════════════════════════════════════════════════════════════════════════════
// Code Action
// ═══════════════════════════════════════════════════════════════════════════════

export interface CodeActionParams {
  textDocument: TextDocumentIdentifier;
  range: Range;
  context: CodeActionContext;
}

export interface CodeActionContext {
  diagnostics: Diagnostic[];
  only?: CodeActionKind[];
  triggerKind?: CodeActionTriggerKind;
}

export enum CodeActionTriggerKind {
  Automatic = 1,
  Invoked = 2,
}

export type CodeActionKind = string;

export const CodeActionKind = {
  Empty: '' as CodeActionKind,
  QuickFix: 'quickfix' as CodeActionKind,
  Refactor: 'refactor' as CodeActionKind,
  RefactorExtract: 'refactor.extract' as CodeActionKind,
  RefactorInline: 'refactor.inline' as CodeActionKind,
  RefactorRewrite: 'refactor.rewrite' as CodeActionKind,
  Source: 'source' as CodeActionKind,
  SourceOrganizeImports: 'source.organizeImports' as CodeActionKind,
  SourceFixAll: 'source.fixAll' as CodeActionKind,
};

export interface CodeAction {
  title: string;
  kind?: CodeActionKind;
  diagnostics?: Diagnostic[];
  isPreferred?: boolean;
  disabled?: { reason: string };
  edit?: WorkspaceEdit;
  command?: Command;
  data?: any;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Symbols
// ═══════════════════════════════════════════════════════════════════════════════

export enum SymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

export enum SymbolTag {
  Deprecated = 1,
}

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: SymbolKind;
  tags?: SymbolTag[];
  deprecated?: boolean;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

export interface SymbolInformation {
  name: string;
  kind: SymbolKind;
  tags?: SymbolTag[];
  deprecated?: boolean;
  location: Location;
  containerName?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Formatting
// ═══════════════════════════════════════════════════════════════════════════════

export interface DocumentFormattingParams {
  textDocument: TextDocumentIdentifier;
  options: FormattingOptions;
}

export interface FormattingOptions {
  tabSize: number;
  insertSpaces: boolean;
  trimTrailingWhitespace?: boolean;
  insertFinalNewline?: boolean;
  trimFinalNewlines?: boolean;
  [key: string]: any;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Rename
// ═══════════════════════════════════════════════════════════════════════════════

export interface RenameParams extends TextDocumentPositionParams {
  newName: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// References
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReferenceParams extends TextDocumentPositionParams {
  context: ReferenceContext;
}

export interface ReferenceContext {
  includeDeclaration: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Initialize / Capabilities
// ═══════════════════════════════════════════════════════════════════════════════

export interface InitializeParams {
  processId: number | null;
  rootUri: string | null;
  capabilities: ClientCapabilities;
  initializationOptions?: any;
  workspaceFolders?: WorkspaceFolder[] | null;
}

export interface InitializeResult {
  capabilities: ServerCapabilities;
  serverInfo?: { name: string; version?: string };
}

export interface WorkspaceFolder {
  uri: string;
  name: string;
}

export interface ClientCapabilities {
  textDocument?: TextDocumentClientCapabilities;
  workspace?: WorkspaceClientCapabilities;
  general?: { staleRequestSupport?: { cancel: boolean; retryOnContentModified: string[] } };
}

export interface TextDocumentClientCapabilities {
  synchronization?: {
    dynamicRegistration?: boolean;
    willSave?: boolean;
    willSaveWaitUntil?: boolean;
    didSave?: boolean;
  };
  completion?: {
    dynamicRegistration?: boolean;
    completionItem?: {
      snippetSupport?: boolean;
      commitCharactersSupport?: boolean;
      documentationFormat?: MarkupKind[];
      deprecatedSupport?: boolean;
      preselectSupport?: boolean;
      tagSupport?: { valueSet: CompletionItemTag[] };
    };
    contextSupport?: boolean;
  };
  hover?: {
    dynamicRegistration?: boolean;
    contentFormat?: MarkupKind[];
  };
  definition?: {
    dynamicRegistration?: boolean;
    linkSupport?: boolean;
  };
  references?: { dynamicRegistration?: boolean };
  codeAction?: {
    dynamicRegistration?: boolean;
    codeActionLiteralSupport?: {
      codeActionKind?: { valueSet: string[] };
    };
  };
  formatting?: { dynamicRegistration?: boolean };
  rename?: { dynamicRegistration?: boolean; prepareSupport?: boolean };
  publishDiagnostics?: {
    relatedInformation?: boolean;
    tagSupport?: { valueSet: DiagnosticTag[] };
    versionSupport?: boolean;
  };
}

export interface WorkspaceClientCapabilities {
  workspaceEdit?: {
    documentChanges?: boolean;
    resourceOperations?: Array<'create' | 'rename' | 'delete'>;
  };
  didChangeConfiguration?: { dynamicRegistration?: boolean };
  symbol?: {
    dynamicRegistration?: boolean;
    symbolKind?: { valueSet: SymbolKind[] };
  };
}

export interface ServerCapabilities {
  textDocumentSync?: TextDocumentSyncKind | TextDocumentSyncOptions;
  completionProvider?: {
    triggerCharacters?: string[];
    allCommitCharacters?: string[];
    resolveProvider?: boolean;
    completionItem?: { labelDetailsSupport?: boolean };
  };
  hoverProvider?: boolean | { workDoneProgress?: boolean };
  definitionProvider?: boolean | {};
  referencesProvider?: boolean | {};
  codeActionProvider?: boolean | CodeActionOptions;
  documentFormattingProvider?: boolean | {};
  documentSymbolProvider?: boolean | {};
  renameProvider?: boolean | RenameOptions;
}

export interface CodeActionOptions {
  codeActionKinds?: string[];
}

export interface RenameOptions {
  prepareProvider?: boolean;
}

export enum TextDocumentSyncKind {
  None = 0,
  Full = 1,
  Incremental = 2,
}

export interface TextDocumentSyncOptions {
  openClose?: boolean;
  change?: TextDocumentSyncKind;
  willSave?: boolean;
  willSaveWaitUntil?: boolean;
  save?: boolean | { includeText?: boolean };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LSP Method Constants
// ═══════════════════════════════════════════════════════════════════════════════

export const LSPMethods = {
  // Lifecycle
  Initialize: 'initialize',
  Initialized: 'initialized',
  Shutdown: 'shutdown',
  Exit: 'exit',

  // Text Document Sync
  DidOpen: 'textDocument/didOpen',
  DidChange: 'textDocument/didChange',
  DidClose: 'textDocument/didClose',
  DidSave: 'textDocument/didSave',

  // Language Features
  Completion: 'textDocument/completion',
  CompletionResolve: 'completionItem/resolve',
  Hover: 'textDocument/hover',
  Definition: 'textDocument/definition',
  References: 'textDocument/references',
  CodeAction: 'textDocument/codeAction',
  Formatting: 'textDocument/formatting',
  DocumentSymbol: 'textDocument/documentSymbol',
  Rename: 'textDocument/rename',
  PrepareRename: 'textDocument/prepareRename',

  // Diagnostics (server -> client notification)
  PublishDiagnostics: 'textDocument/publishDiagnostics',

  // Workspace
  WorkspaceSymbol: 'workspace/symbol',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// JSON-RPC Message Encoding / Decoding (Content-Length framed)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Encode a JSON-RPC message into the LSP Content-Length framed wire format.
 * Format: "Content-Length: <byte length>\r\n\r\n<JSON body>"
 */
export function encodeLSPMessage(message: JSONRPCMessage): Buffer {
  const body = JSON.stringify(message);
  const bodyBuffer = Buffer.from(body, 'utf-8');
  const header = `Content-Length: ${bodyBuffer.length}\r\n\r\n`;
  return Buffer.concat([Buffer.from(header, 'ascii'), bodyBuffer]);
}

/**
 * Create a JSON-RPC request message.
 */
export function createRequest(id: number, method: string, params?: any): JSONRPCRequest {
  return { jsonrpc: '2.0', id, method, params };
}

/**
 * Create a JSON-RPC notification message (no id, no response expected).
 */
export function createNotification(method: string, params?: any): JSONRPCNotification {
  return { jsonrpc: '2.0', method, params };
}

/**
 * Create a JSON-RPC success response.
 */
export function createResponse(id: number | string, result: any): JSONRPCResponse {
  return { jsonrpc: '2.0', id, result };
}

/**
 * Create a JSON-RPC error response.
 */
export function createErrorResponse(
  id: number | string,
  code: number,
  message: string,
  data?: any
): JSONRPCResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

/**
 * LSP message stream decoder. Accumulates incoming buffer data and yields
 * complete JSON-RPC messages parsed from Content-Length framed protocol.
 *
 * Usage:
 *   const decoder = new LSPMessageDecoder();
 *   for (const msg of decoder.feed(chunk)) { ... }
 */
export class LSPMessageDecoder {
  private buffer: Buffer = Buffer.alloc(0);

  /**
   * Feed raw bytes into the decoder. Returns all complete messages found.
   */
  feed(data: Buffer): JSONRPCMessage[] {
    this.buffer = Buffer.concat([this.buffer, data]);
    const messages: JSONRPCMessage[] = [];

    while (true) {
      // Look for header delimiter
      const delimiterIndex = this.indexOfDelimiter(this.buffer);
      if (delimiterIndex === -1) break;

      // Parse Content-Length header
      const headerSection = this.buffer.slice(0, delimiterIndex).toString('ascii');
      const contentLengthMatch = headerSection.match(/Content-Length:\s*(\d+)/i);
      if (!contentLengthMatch) {
        // Malformed header -- skip the delimiter and try again
        this.buffer = this.buffer.slice(delimiterIndex + 4);
        continue;
      }

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const bodyStart = delimiterIndex + 4; // skip \r\n\r\n

      // Check if we have enough bytes for the full body
      if (this.buffer.length < bodyStart + contentLength) break;

      const body = this.buffer.slice(bodyStart, bodyStart + contentLength).toString('utf-8');
      this.buffer = this.buffer.slice(bodyStart + contentLength);

      try {
        const message = JSON.parse(body) as JSONRPCMessage;
        messages.push(message);
      } catch {
        // Skip malformed JSON
      }
    }

    return messages;
  }

  /**
   * Reset the internal buffer (e.g., on reconnect).
   */
  reset(): void {
    this.buffer = Buffer.alloc(0);
  }

  /**
   * Check if the buffer has leftover data.
   */
  hasPartialData(): boolean {
    return this.buffer.length > 0;
  }

  private indexOfDelimiter(buf: Buffer): number {
    // Search for \r\n\r\n
    for (let i = 0; i <= buf.length - 4; i++) {
      if (
        buf[i] === 0x0d &&
        buf[i + 1] === 0x0a &&
        buf[i + 2] === 0x0d &&
        buf[i + 3] === 0x0a
      ) {
        return i;
      }
    }
    return -1;
  }
}

/**
 * Detect if a message is a notification (no `id` field, has `method`).
 */
export function isNotification(msg: JSONRPCMessage): msg is JSONRPCNotification {
  return 'method' in msg && !('id' in msg);
}

/**
 * Detect if a message is a request (has `id` and `method`).
 */
export function isRequest(msg: JSONRPCMessage): msg is JSONRPCRequest {
  return 'method' in msg && 'id' in msg;
}

/**
 * Detect if a message is a response (has `id` but no `method`).
 */
export function isResponse(msg: JSONRPCMessage): msg is JSONRPCResponse {
  return 'id' in msg && !('method' in msg);
}
