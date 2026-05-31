// ── MCP Client：连接外部 MCP 服务器 ──────────────

import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';

interface MCPMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: any;
  result?: any;
  error?: { code: number; message: string };
}

interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export class MCPClient {
  private servers: Map<string, {
    config: MCPServerConfig;
    process: ChildProcess | null;
    tools: MCPTool[];
    connected: boolean;
    pendingRequests: Map<number | string, { resolve: Function; reject: Function; timer: NodeJS.Timeout }>;
    nextId: number;
    buffer: string;
  }> = new Map();

  private requestTimeout: number = 30000;

  /** Set the default request timeout in milliseconds. */
  setRequestTimeout(ms: number): void {
    this.requestTimeout = ms;
  }

  // 注册 MCP 服务器
  registerServer(name: string, config: MCPServerConfig): void {
    this.servers.set(name, {
      config,
      process: null,
      tools: [],
      connected: false,
      pendingRequests: new Map(),
      nextId: 1,
      buffer: '',
    });
  }

  // 从配置文件加载
  async loadFromConfig(configPath: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const raw = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(raw);

      if (config.mcpServers) {
        for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
          this.registerServer(name, serverConfig as MCPServerConfig);
        }
      }
    } catch {
      // 配置文件不存在
    }
  }

  // 连接服务器
  async connect(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (!server) throw new Error(`MCP 服务器 "${serverName}" 未注册`);
    if (server.connected) return;

    const { command, args = [], env = {} } = server.config;

    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });

    server.process = child;
    server.buffer = '';

    // 设置 readline 解析
    const rl = readline.createInterface({ input: child.stdout!, terminal: false });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const msg: MCPMessage = JSON.parse(line);
        this.handleMessage(serverName, msg);
      } catch { /* ignore parse errors */ }
    });

    child.stderr?.on('data', (data) => {
      // 忽略 stderr（MCP 服务器可能输出日志到 stderr）
    });

    child.on('exit', (code, signal) => {
      server.connected = false;
      server.process = null;

      // Reject all pending requests with a descriptive error
      const exitReason = signal
        ? `killed by signal ${signal}`
        : `exited with code ${code}`;
      for (const [id, pending] of server.pendingRequests) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`MCP server "${serverName}" ${exitReason} (request id=${id})`));
      }
      server.pendingRequests.clear();
    });

    // 发送 initialize
    try {
      const initResult = await this.sendRequest(serverName, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        clientInfo: { name: 'mimo-cli', version: '1.0.0' },
      });

      // 发送 initialized 通知
      this.sendNotification(serverName, 'notifications/initialized', {});

      // 获取工具列表
      const toolsResult = await this.sendRequest(serverName, 'tools/list', {}) as any;
      server.tools = toolsResult?.tools || [];
      server.connected = true;
    } catch (err) {
      // Cleanup on failure to avoid orphaned child process
      child.kill();
      server.process = null;
      throw err;
    }
  }

  // 连接所有注册的服务器
  async connectAll(): Promise<void> {
    for (const name of this.servers.keys()) {
      try {
        await this.connect(name);
      } catch {
        // 单个服务器连接失败不阻断
      }
    }
  }

  // 调用 MCP 工具
  async callTool(serverName: string, toolName: string, args: Record<string, any>): Promise<any> {
    const server = this.servers.get(serverName);
    if (!server?.connected) throw new Error(`MCP 服务器 "${serverName}" 未连接`);

    const result = await this.sendRequest(serverName, 'tools/call', {
      name: toolName,
      arguments: args,
    });

    return result;
  }

  // 获取所有服务器的工具列表
  getAllTools(): Array<{ server: string; tool: MCPTool }> {
    const tools: Array<{ server: string; tool: MCPTool }> = [];
    for (const [name, server] of this.servers) {
      if (server.connected) {
        for (const tool of server.tools) {
          tools.push({ server: name, tool });
        }
      }
    }
    return tools;
  }

  // 查找哪个服务器有指定工具
  findTool(toolName: string): { server: string; tool: MCPTool } | null {
    for (const [name, server] of this.servers) {
      if (!server.connected) continue;
      const tool = server.tools.find((t) => t.name === toolName);
      if (tool) return { server: name, tool };
    }
    return null;
  }

  // 获取连接状态
  getStatus(): Array<{ name: string; connected: boolean; toolCount: number }> {
    return Array.from(this.servers.entries()).map(([name, server]) => ({
      name,
      connected: server.connected,
      toolCount: server.tools.length,
    }));
  }

  // 断开所有连接
  async disconnectAll(): Promise<void> {
    for (const [name, server] of this.servers) {
      // Reject all pending requests before killing
      for (const [id, pending] of server.pendingRequests) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`MCP server "${name}" disconnected (request id=${id})`));
      }
      server.pendingRequests.clear();

      if (server.process) {
        server.process.kill();
        server.process = null;
        server.connected = false;
      }
    }
  }

  // 发送请求
  private sendRequest(serverName: string, method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const server = this.servers.get(serverName);
      if (!server || !server.process) {
        reject(new Error(`MCP server "${serverName}" is not connected`));
        return;
      }

      const id = server.nextId++;

      const timer = setTimeout(() => {
        if (server.pendingRequests.has(id)) {
          server.pendingRequests.delete(id);
          reject(new Error(`MCP request timed out after ${this.requestTimeout}ms: ${method} (server="${serverName}")`));
        }
      }, this.requestTimeout);

      server.pendingRequests.set(id, { resolve, reject, timer });

      const msg: MCPMessage = { jsonrpc: '2.0', id, method, params };
      try {
        server.process.stdin!.write(JSON.stringify(msg) + '\n');
      } catch (err: any) {
        clearTimeout(timer);
        server.pendingRequests.delete(id);
        reject(new Error(`Failed to send request to MCP server "${serverName}": ${err.message}`));
      }
    });
  }

  // 发送通知（无响应）
  private sendNotification(serverName: string, method: string, params: any): void {
    const server = this.servers.get(serverName);
    if (!server?.process) return;

    const msg: MCPMessage = { jsonrpc: '2.0', method, params };
    server.process.stdin!.write(JSON.stringify(msg) + '\n');
  }

  // 处理收到的消息
  private handleMessage(serverName: string, msg: MCPMessage): void {
    const server = this.servers.get(serverName);
    if (!server) return;

    if (msg.id !== undefined && server.pendingRequests.has(msg.id)) {
      const { resolve, reject, timer } = server.pendingRequests.get(msg.id)!;
      clearTimeout(timer);
      server.pendingRequests.delete(msg.id);

      if (msg.error) {
        reject(new Error(`MCP error from "${serverName}": ${msg.error.message} (code=${msg.error.code})`));
      } else {
        resolve(msg.result);
      }
    }
  }
}
