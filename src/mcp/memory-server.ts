#!/usr/bin/env node

// ── MIMO Memory MCP Server ─────────────────────────
// 标准 Model Context Protocol 服务器
// 提供记忆读写、搜索、会话管理的 MCP 工具接口
// 可被 Claude Code、Cursor、Continue 等 MCP 客户端连接

import * as readline from 'readline';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ── 类型定义 ─────────────────────────────────────

interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

interface MemoryEntry {
  id: string;
  type: MemoryType;
  name: string;
  description: string;
  content: string;
  tags: string[];
  links: string[];
  updatedAt: string;
  filePath: string;
}

// ── 配置 ─────────────────────────────────────────

const MEMORY_DIR = process.env.MIMO_MEMORY_DIR || path.join(os.homedir(), '.mimo', 'memory');

// ── 记忆存储操作 ─────────────────────────────────

async function initMemoryDirs(): Promise<void> {
  for (const dir of ['user', 'project', 'reference', 'sessions']) {
    await fs.mkdir(path.join(MEMORY_DIR, dir), { recursive: true });
  }

  // 确保索引存在
  const indexPath = path.join(MEMORY_DIR, 'MEMORY.md');
  try {
    await fs.access(indexPath);
  } catch {
    await fs.writeFile(
      indexPath,
      '# MIMO Memory Index\n\n| ID | Type | Name | Description | File | Updated |\n|---|---|---|---|---|---|\n',
      'utf-8'
    );
  }
}

async function loadIndex(): Promise<MemoryEntry[]> {
  try {
    const raw = await fs.readFile(path.join(MEMORY_DIR, 'MEMORY.md'), 'utf-8');
    const lines = raw.split('\n').filter((l) => l.startsWith('|') && !l.startsWith('|--'));
    return lines.slice(1).map((line) => {
      const cols = line
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      return {
        id: cols[0] || '',
        type: (cols[1] || 'user') as MemoryType,
        name: cols[2] || '',
        description: cols[3] || '',
        filePath: cols[4] || '',
        updatedAt: cols[5] || '',
        content: '',
        tags: [],
        links: [],
      };
    });
  } catch {
    return [];
  }
}

async function saveIndex(entries: MemoryEntry[]): Promise<void> {
  const lines = [
    '# MIMO Memory Index',
    '',
    '| ID | Type | Name | Description | File | Updated |',
    '|---|---|---|---|---|---|',
    ...entries.map(
      (m) => `| ${m.id} | ${m.type} | ${m.name} | ${m.description} | ${m.filePath} | ${m.updatedAt} |`
    ),
  ];
  await fs.writeFile(path.join(MEMORY_DIR, 'MEMORY.md'), lines.join('\n'), 'utf-8');
}

function sanitizeContent(content: string): string {
  return content
    .replace(/sk-ant-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/ghp_[a-zA-Z0-9]{30,}/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?-----END[\s\S]*?PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/password\s*[:=]\s*["']?[^\s,;"'}{]+/gi, 'password=[REDACTED]');
}

async function readMemory(id: string): Promise<string | null> {
  const entries = await loadIndex();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  try {
    return await fs.readFile(path.join(MEMORY_DIR, entry.filePath), 'utf-8');
  } catch {
    return null;
  }
}

async function writeMemory(
  id: string,
  type: MemoryType,
  name: string,
  description: string,
  content: string,
  tags: string[] = [],
  links: string[] = []
): Promise<void> {
  const dirMap: Record<MemoryType, string> = {
    user: 'user',
    feedback: 'user',
    project: 'project',
    reference: 'reference',
  };
  const dir = dirMap[type];
  const safeId = id.replace(/[^a-z0-9-]/g, '-').toLowerCase();
  const filePath = path.join(MEMORY_DIR, dir, `${safeId}.md`);
  const now = new Date().toISOString().split('T')[0];

  const frontmatter = [
    '---',
    `name: ${safeId}`,
    `description: ${description}`,
    `type: ${type}`,
    `tags: [${tags.join(', ')}]`,
    `links: [${links.join(', ')}]`,
    `updated: ${now}`,
    '---',
  ].join('\n');

  const sanitizedContent = sanitizeContent(content);
  await fs.writeFile(filePath, `${frontmatter}\n\n${sanitizedContent}`, 'utf-8');

  // 更新索引
  const entries = await loadIndex();
  const relPath = path.relative(MEMORY_DIR, filePath).replace(/\\/g, '/');
  const existingIdx = entries.findIndex((e) => e.id === id);
  const entry: MemoryEntry = {
    id,
    type,
    name: name || id,
    description,
    filePath: relPath,
    updatedAt: now,
    content: '',
    tags,
    links,
  };

  if (existingIdx >= 0) {
    entries[existingIdx] = entry;
  } else {
    entries.push(entry);
  }

  await saveIndex(entries);
}

async function searchMemories(query: string, types?: MemoryType[]): Promise<any[]> {
  const entries = await loadIndex();
  const results: Array<{ entry: MemoryEntry; score: number }> = [];

  for (const entry of entries) {
    if (types && !types.includes(entry.type)) continue;

    try {
      const raw = await fs.readFile(path.join(MEMORY_DIR, entry.filePath), 'utf-8');
      const searchable = (raw + ' ' + entry.description + ' ' + entry.name).toLowerCase();
      const score = query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 1 && searchable.includes(w)).length;

      if (score > 0) {
        results.push({ entry, score });
      }
    } catch {
      // skip
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((r) => ({
      id: r.entry.id,
      type: r.entry.type,
      name: r.entry.name,
      description: r.entry.description,
      score: r.score,
    }));
}

async function deleteMemory(id: string): Promise<boolean> {
  const entries = await loadIndex();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return false;

  const entry = entries[idx];
  try {
    await fs.unlink(path.join(MEMORY_DIR, entry.filePath));
  } catch {
    // already deleted
  }

  entries.splice(idx, 1);
  await saveIndex(entries);
  return true;
}

async function getSessionSummary(sessionId: string): Promise<any | null> {
  try {
    const raw = await fs.readFile(
      path.join(MEMORY_DIR, 'sessions', `${sessionId}.json`),
      'utf-8'
    );
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function listSessions(limit = 20): Promise<any[]> {
  try {
    const files = await fs.readdir(path.join(MEMORY_DIR, 'sessions'));
    const sessions = [];
    for (const file of files.filter((f) => f.endsWith('.json')).slice(-limit)) {
      try {
        const raw = await fs.readFile(path.join(MEMORY_DIR, 'sessions', file), 'utf-8');
        sessions.push(JSON.parse(raw));
      } catch {
        // skip
      }
    }
    return sessions.sort(
      (a, b) => new Date(b.endedAt || 0).getTime() - new Date(a.endedAt || 0).getTime()
    );
  } catch {
    return [];
  }
}

// ── MCP 工具定义 ─────────────────────────────────

const MCP_TOOLS: MCPTool[] = [
  {
    name: 'memory_save',
    description: '保存一条记忆到持久化存储。支持 user/feedback/project/reference 类型。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '唯一标识 (kebab-case)' },
        type: { type: 'string', enum: ['user', 'feedback', 'project', 'reference'] },
        name: { type: 'string', description: '短标题' },
        description: { type: 'string', description: '一行描述' },
        content: { type: 'string', description: '记忆正文 (markdown)' },
        tags: { type: 'array', items: { type: 'string' } },
        links: { type: 'array', items: { type: 'string' } },
      },
      required: ['id', 'type', 'content'],
    },
  },
  {
    name: 'memory_read',
    description: '读取指定 ID 的记忆内容。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '记忆 ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'memory_search',
    description: '搜索记忆。支持关键词匹配和类型过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        types: {
          type: 'array',
          items: { type: 'string', enum: ['user', 'feedback', 'project', 'reference'] },
          description: '类型过滤',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_list',
    description: '列出所有记忆，可按类型过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        types: {
          type: 'array',
          items: { type: 'string', enum: ['user', 'feedback', 'project', 'reference'] },
        },
      },
    },
  },
  {
    name: 'memory_delete',
    description: '删除指定 ID 的记忆。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'memory_context',
    description: '构建记忆上下文字符串（用于注入系统 prompt）。',
    inputSchema: {
      type: 'object',
      properties: {
        projectSlug: { type: 'string', description: '当前项目名' },
        maxTokens: { type: 'number', description: '最大 token 数 (默认 2000)' },
      },
    },
  },
  {
    name: 'session_list',
    description: '列出最近的会话记录。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '最大返回数 (默认 20)' },
      },
    },
  },
  {
    name: 'session_read',
    description: '读取指定会话的摘要。',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'memory_export',
    description: '导出所有记忆为 JSON。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'memory_import',
    description: '从 JSON 导入记忆。',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'JSON 字符串' },
      },
      required: ['data'],
    },
  },
];

// ── MCP 请求处理 ─────────────────────────────────

async function handleRequest(req: MCPRequest): Promise<MCPResponse> {
  try {
    switch (req.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: req.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: {
              name: 'mimo-memory',
              version: '1.0.0',
            },
          },
        };

      case 'notifications/initialized':
        return { jsonrpc: '2.0', id: req.id, result: {} };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id: req.id,
          result: { tools: MCP_TOOLS },
        };

      case 'tools/call': {
        const { name, arguments: args } = req.params;
        const result = await handleToolCall(name, args || {});
        return {
          jsonrpc: '2.0',
          id: req.id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        };
      }

      case 'ping':
        return { jsonrpc: '2.0', id: req.id, result: {} };

      default:
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32601, message: `Unknown method: ${req.method}` },
        };
    }
  } catch (err: any) {
    return {
      jsonrpc: '2.0',
      id: req.id,
      error: { code: -32000, message: err.message },
    };
  }
}

async function handleToolCall(name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case 'memory_save':
      await writeMemory(
        args.id,
        args.type,
        args.name || args.id,
        args.description || '',
        args.content,
        args.tags || [],
        args.links || []
      );
      return { success: true, id: args.id };

    case 'memory_read': {
      const content = await readMemory(args.id);
      return content !== null
        ? { found: true, content }
        : { found: false, message: `记忆 "${args.id}" 不存在` };
    }

    case 'memory_search':
      return { results: await searchMemories(args.query, args.types) };

    case 'memory_list': {
      const entries = await loadIndex();
      const filtered = args.types
        ? entries.filter((e) => args.types.includes(e.type))
        : entries;
      return {
        count: filtered.length,
        memories: filtered.map((e) => ({
          id: e.id,
          type: e.type,
          name: e.name,
          description: e.description,
          updatedAt: e.updatedAt,
        })),
      };
    }

    case 'memory_delete': {
      const deleted = await deleteMemory(args.id);
      return deleted
        ? { success: true, message: `已删除记忆 "${args.id}"` }
        : { success: false, message: `记忆 "${args.id}" 不存在` };
    }

    case 'memory_context': {
      const entries = await loadIndex();
      const parts: string[] = [];

      // 始终加载 user + feedback
      for (const entry of entries) {
        if (entry.type === 'user' || entry.type === 'feedback') {
          const content = await readMemory(entry.id);
          if (content) parts.push(content);
        }
      }

      // 加载项目记忆
      if (args.projectSlug) {
        for (const entry of entries) {
          if (entry.type === 'project' && entry.id.includes(args.projectSlug)) {
            const content = await readMemory(entry.id);
            if (content) parts.push(content);
          }
        }
      }

      const full = parts.join('\n---\n');
      const maxChars = (args.maxTokens || 2000) * 3;
      return {
        context: full.length > maxChars ? full.slice(0, maxChars) + '\n...(截断)' : full,
        tokenEstimate: Math.ceil(full.length / 3),
      };
    }

    case 'session_list':
      return { sessions: await listSessions(args.limit) };

    case 'session_read':
      return (await getSessionSummary(args.sessionId)) || { message: '会话不存在' };

    case 'memory_export': {
      const entries = await loadIndex();
      const all: Record<string, string> = {};
      for (const entry of entries) {
        const content = await readMemory(entry.id);
        if (content) all[entry.id] = content;
      }
      return { count: Object.keys(all).length, data: all };
    }

    case 'memory_import': {
      const data = JSON.parse(args.data);
      let count = 0;
      for (const [id, content] of Object.entries(data)) {
        try {
          const raw = content as string;
          // 从 frontmatter 提取类型
          const typeMatch = raw.match(/type:\s*(\w+)/);
          const type = (typeMatch?.[1] || 'user') as MemoryType;
          const descMatch = raw.match(/description:\s*(.+)/);
          const desc = descMatch?.[1] || '';
          await writeMemory(id, type, id, desc, raw);
          count++;
        } catch {
          // skip invalid
        }
      }
      return { success: true, imported: count };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── MCP stdio 传输层 ─────────────────────────────

async function main(): Promise<void> {
  await initMemoryDirs();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', async (line) => {
    if (!line.trim()) return;

    try {
      const request: MCPRequest = JSON.parse(line);
      const response = await handleRequest(request);
      process.stdout.write(JSON.stringify(response) + '\n');
    } catch (err: any) {
      const errorResponse: MCPResponse = {
        jsonrpc: '2.0',
        id: 0,
        error: { code: -32700, message: `Parse error: ${err.message}` },
      };
      process.stdout.write(JSON.stringify(errorResponse) + '\n');
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });

  // 保持进程运行
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
