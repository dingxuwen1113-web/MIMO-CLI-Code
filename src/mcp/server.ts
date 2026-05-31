// ── MCP Server: Expose MIMO as MCP Tools ────────────────────────

import * as readline from 'readline';
import { encodeLSPMessage, LSPMessageDecoder } from '../tools/lsp/protocol';

// Local decode helper using LSPMessageDecoder
function decodeMessages(buffer: string): { messages: any[]; remainder: string } {
  const decoder = new LSPMessageDecoder();
  const parts = buffer.split('\r\n\r\n');
  const messages: any[] = [];
  let remainder = '';
  for (let i = 0; i < parts.length; i += 2) {
    if (i + 1 < parts.length) {
      const header = parts[i];
      const body = parts[i + 1];
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (match) {
        try { messages.push(JSON.parse(body.slice(0, parseInt(match[1])))); } catch { /* skip */ }
      }
    } else {
      remainder = parts[i];
    }
  }
  return { messages, remainder };
}

interface MIMOToolContext {
  memoryStore: any;
  sessionManager: any;
  config: any;
}

export class MCPServer {
  private context: MIMOToolContext;
  private running = false;
  private buffer = '';

  constructor(context: MIMOToolContext) {
    this.context = context;
  }

  async start(): Promise<void> {
    this.running = true;
    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', (line) => this.handleLine(line));
    rl.on('close', () => { this.running = false; });

    // Notify that server is ready
    process.stderr.write('MIMO MCP Server started\n');
  }

  private handleLine(line: string): void {
    this.buffer += line;
    const { messages, remainder } = decodeMessages(this.buffer + '\r\n\r\n');
    this.buffer = remainder;
    for (const msg of messages) {
      try { this.handleMessage(JSON.parse(msg)); } catch { /* skip */ }
    }
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    const method = msg.method as string;
    const id = msg.id;

    if (method === 'initialize') {
      this.sendResponse(id, { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'mimo-cli-code', version: '2.0.0' } });
    } else if (method === 'notifications/initialized') {
      // No response needed
    } else if (method === 'tools/list') {
      this.sendResponse(id, { tools: this.getToolDefinitions() });
    } else if (method === 'tools/call') {
      const params = msg.params as Record<string, unknown>;
      const result = await this.handleToolCall(params.name as string, params.arguments as Record<string, unknown> || {});
      this.sendResponse(id, result);
    } else if (method === 'ping') {
      this.sendResponse(id, {});
    }
  }

  private getToolDefinitions(): unknown[] {
    return [
      { name: 'conversations_list', description: 'List all MIMO sessions', inputSchema: { type: 'object', properties: { limit: { type: 'number' } } } },
      { name: 'conversation_get', description: 'Get a specific session', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
      { name: 'messages_read', description: 'Read messages from a session', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, limit: { type: 'number' } }, required: ['sessionId'] } },
      { name: 'messages_send', description: 'Send a message to a session', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, content: { type: 'string' } }, required: ['sessionId', 'content'] } },
      { name: 'memory_save', description: 'Save a memory entry', inputSchema: { type: 'object', properties: { type: { type: 'string' }, name: { type: 'string' }, content: { type: 'string' } }, required: ['type', 'name', 'content'] } },
      { name: 'memory_read', description: 'Read a memory entry', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      { name: 'memory_search', description: 'Search memories', inputSchema: { type: 'object', properties: { query: { type: 'string' }, types: { type: 'array', items: { type: 'string' } } }, required: ['query'] } },
      { name: 'memory_list', description: 'List all memories', inputSchema: { type: 'object', properties: { types: { type: 'array', items: { type: 'string' } } } } },
      { name: 'memory_delete', description: 'Delete a memory entry', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
      { name: 'memory_context', description: 'Get memory context for a project', inputSchema: { type: 'object', properties: { projectSlug: { type: 'string' } } } },
    ];
  }

  private async handleToolCall(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      const memory = this.context.memoryStore;
      const sessions = this.context.sessionManager;

      switch (name) {
        case 'conversations_list': {
          const list = sessions?.listSessions?.(args.limit || 20) || [];
          return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
        }
        case 'conversation_get': {
          const session = sessions?.getSession?.(args.sessionId as string);
          return { content: [{ type: 'text', text: session ? JSON.stringify(session, null, 2) : 'Session not found' }] };
        }
        case 'messages_read': {
          const messages = sessions?.getMessages?.(args.sessionId as string, args.limit as number) || [];
          return { content: [{ type: 'text', text: JSON.stringify(messages, null, 2) }] };
        }
        case 'messages_send': {
          return { content: [{ type: 'text', text: 'Message queued for processing' }] };
        }
        case 'memory_save': {
          const entry = memory?.save?.({ type: args.type, name: args.name, description: '', content: args.content });
          return { content: [{ type: 'text', text: entry ? `Memory saved: ${entry.id}` : 'Failed to save' }] };
        }
        case 'memory_read': {
          const entry = memory?.read?.(args.id as string);
          return { content: [{ type: 'text', text: entry ? (typeof entry === 'string' ? entry : entry.content || JSON.stringify(entry)) : 'Not found' }] };
        }
        case 'memory_search': {
          const results = memory?.search?.(args.query as string, { types: args.types as string[] }) || [];
          return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
        }
        case 'memory_list': {
          const list = memory?.list?.(args.types as string[]) || [];
          return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
        }
        case 'memory_delete': {
          memory?.remove?.(args.id as string);
          return { content: [{ type: 'text', text: 'Memory deleted' }] };
        }
        case 'memory_context': {
          const context = memory?.buildMemoryContext?.(args.projectSlug as string) || '';
          return { content: [{ type: 'text', text: context }] };
        }
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err}` }], isError: true };
    }
  }

  private sendResponse(id: unknown, result: unknown): void {
    const response = { jsonrpc: '2.0', id, result };
    process.stdout.write(encodeLSPMessage(response as any));
  }

  isRunning(): boolean { return this.running; }
}
