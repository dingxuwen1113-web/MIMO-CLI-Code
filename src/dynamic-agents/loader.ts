// ── 动态 Agent 定义加载 ──────────────────────────

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  model?: string;
  tools?: string[];
  maxTurns?: number;
  triggers?: string[];
}

export class DynamicAgentLoader {
  private agents: Map<string, AgentDefinition> = new Map();
  private searchPaths: string[];

  constructor(searchPaths?: string[]) {
    const homeDir = os.homedir();
    this.searchPaths = searchPaths || [
      path.join(process.cwd(), 'agents'),
      path.join(process.cwd(), '.claude', 'agents'),
      path.join(process.cwd(), '.mimo', 'agents'),
      path.join(homeDir, '.claude', 'agents'),
      path.join(homeDir, '.mimo', 'agents'),
    ];
  }

  async loadAll(): Promise<void> {
    for (const searchPath of this.searchPaths) {
      await this.loadFromDir(searchPath);
    }
  }

  private async loadFromDir(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // 递归扫描子目录
          await this.loadFromDir(fullPath);
        } else if (entry.name.endsWith('.md') || entry.name.endsWith('.json')) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const agent = this.parseAgent(entry.name, content);
            if (agent) {
              this.agents.set(agent.name, agent);
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* dir doesn't exist */ }
  }

  private parseAgent(filename: string, content: string): AgentDefinition | null {
    const name = filename.replace(/\.(md|json)$/, '');

    if (filename.endsWith('.json')) {
      try {
        const data = JSON.parse(content);
        return {
          name: data.name || name,
          description: data.description || '',
          systemPrompt: data.systemPrompt || data.system_prompt || data.prompt || '',
          model: data.model,
          tools: data.tools,
          maxTurns: data.maxTurns || data.max_turns,
          triggers: data.triggers,
        };
      } catch { return null; }
    }

    // Markdown 格式：frontmatter + body
    let systemPrompt = content;
    let description = '';
    let model: string | undefined;
    let tools: string[] | undefined;
    let triggers: string[] | undefined;

    if (content.startsWith('---')) {
      const endIdx = content.indexOf('---', 3);
      if (endIdx !== -1) {
        const fm = content.slice(3, endIdx).trim();
        systemPrompt = content.slice(endIdx + 3).trim();

        for (const line of fm.split('\n')) {
          const colonIdx = line.indexOf(':');
          if (colonIdx === -1) continue;
          const key = line.slice(0, colonIdx).trim();
          const value = line.slice(colonIdx + 1).trim();
          switch (key) {
            case 'description': description = value; break;
            case 'model': model = value; break;
            case 'tools': tools = value.split(',').map((s) => s.trim()); break;
            case 'triggers': triggers = value.split(',').map((s) => s.trim()); break;
          }
        }
      }
    }

    return { name, description, systemPrompt, model, tools, triggers };
  }

  getAgent(name: string): AgentDefinition | undefined {
    return this.agents.get(name);
  }

  listAgents(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  // 根据触发词匹配
  matchAgent(input: string): AgentDefinition | null {
    const lower = input.toLowerCase();
    for (const agent of this.agents.values()) {
      if (agent.triggers) {
        for (const trigger of agent.triggers) {
          if (lower.includes(trigger.toLowerCase())) {
            return agent;
          }
        }
      }
    }
    return null;
  }
}
