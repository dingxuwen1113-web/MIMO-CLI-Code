// ── Feature 3: Context Memory Graph ──────────────────
import { FeatureModule, FeatureContext } from '../registry';
import { readFileSafe, now_iso } from '../utils';
import * as fs from 'fs/promises';
import * as path from 'path';

interface MemoryNode {
  id: string;
  type: 'decision' | 'bug-fix' | 'refactor' | 'feature' | 'config';
  title: string;
  description: string;
  files: string[];
  sessionId: string;
  timestamp: string;
  links: string[];
  importance: number;
}

class MemoryGraph {
  private nodes: Map<string, MemoryNode> = new Map();
  private graphPath = '';

  async init(memoryDir: string) {
    this.graphPath = path.join(memoryDir, 'context-graph.json');
    await this.load();
  }

  async addNode(node: Omit<MemoryNode, 'id' | 'timestamp'>): Promise<string> {
    const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.nodes.set(id, { ...node, id, timestamp: now_iso() });
    await this.save();
    return id;
  }

  linkNodes(fromId: string, toId: string) {
    const from = this.nodes.get(fromId);
    if (from && !from.links.includes(toId)) {
      from.links.push(toId);
      this.save();
    }
  }

  queryByFile(filePath: string): MemoryNode[] {
    return Array.from(this.nodes.values()).filter(n => n.files.includes(filePath));
  }

  queryByType(type: MemoryNode['type']): MemoryNode[] {
    return Array.from(this.nodes.values()).filter(n => n.type === type);
  }

  getRecentContext(limit = 10): MemoryNode[] {
    return Array.from(this.nodes.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  getRelated(nodeId: string): MemoryNode[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];
    return node.links.map(id => this.nodes.get(id)).filter(Boolean) as MemoryNode[];
  }

  getContextForFiles(files: string[]): string {
    const relevant: MemoryNode[] = [];
    for (const f of files) relevant.push(...this.queryByFile(f));
    if (relevant.length === 0) return '';

    const sorted = relevant.sort((a, b) => b.importance - a.importance).slice(0, 5);
    return sorted.map(n => `[${n.type}] ${n.title}: ${n.description}`).join('\n');
  }

  getNodeCount(): number { return this.nodes.size; }

  private async load() {
    try {
      const raw = await readFileSafe(this.graphPath);
      if (raw) {
        const data = JSON.parse(raw);
        for (const [k, v] of Object.entries(data)) this.nodes.set(k, v as MemoryNode);
      }
    } catch { /* no graph yet */ }
  }

  private async save() {
    const obj: Record<string, MemoryNode> = {};
    for (const [k, v] of this.nodes) obj[k] = v;
    await fs.mkdir(path.dirname(this.graphPath), { recursive: true });
    await fs.writeFile(this.graphPath, JSON.stringify(obj, null, 2));
  }
}

const graph = new MemoryGraph();

export const ContextMemoryGraphFeature: FeatureModule = {
  meta: {
    id: 'context-memory-graph',
    name: 'Context Memory Graph',
    description: 'Cross-session decision graph with context linking',
    category: 'perception',
    enabled: true,
    priority: 'P1',
  },
  async init(ctx: FeatureContext) { await graph.init(ctx.memoryDir); },
  async onEvent(event: string, data: any) {
    if (event === 'file_edited' && data.decision) {
      await graph.addNode({
        type: data.type || 'decision',
        title: data.title || 'Code change',
        description: data.description || '',
        files: data.files || [],
        sessionId: data.sessionId || '',
        links: [],
        importance: data.importance || 5,
      });
    }
  },
  getTools() {
    return [{
      name: 'memory_graph_query',
      definition: {
        name: 'memory_graph_query',
        description: 'Query the context memory graph for related past decisions and changes',
        input_schema: {
          type: 'object' as const,
          properties: {
            file: { type: 'string', description: 'Find context related to a file' },
            type: { type: 'string', enum: ['decision', 'bug-fix', 'refactor', 'feature', 'config'] },
            recent: { type: 'boolean', description: 'Get recent context' },
          },
        },
      },
      execute: async (input: any) => {
        let nodes: MemoryNode[];
        if (input.file) nodes = graph.queryByFile(input.file);
        else if (input.type) nodes = graph.queryByType(input.type);
        else nodes = graph.getRecentContext();

        return {
          output: nodes.length > 0
            ? nodes.map(n => `[${n.type}] ${n.title} (${n.files.join(', ')}) — ${n.description}`).join('\n')
            : '(no context found)',
          isError: false,
        };
      },
    }];
  },
  getStatus() { return { nodes: graph.getNodeCount() }; },
};
