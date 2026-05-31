import createDebug from 'debug';

const debug = createDebug('mimo:subagent-v2');

// ─── Sub-agent Types ───────────────────────────────────────────────

export type AgentStatus = 'initializing' | 'running' | 'idle' | 'completed' | 'failed' | 'shutdown';

export interface AgentConfig {
  name: string;
  type: 'explore' | 'plan' | 'general-purpose' | 'code-reviewer' | 'custom';
  model?: string;
  maxTurns?: number;
  tokenBudget?: number;
  toolFilter?: string[];     // tools this agent can use
  isolationLevel?: 'shared' | 'workspace' | 'full';  // workspace = git worktree
  systemPromptOverride?: string;
}

export interface AgentInstance {
  id: string;
  config: AgentConfig;
  status: AgentStatus;
  turnsUsed: number;
  tokensUsed: number;
  toolCallsMade: number;
  createdAt: string;
  lastActiveAt: string;
  messages: AgentMessage[];
  inbox: InboxMessage[];
  worktreePath?: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  turnIndex: number;
}

export interface InboxMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: string;
  read: boolean;
}

export interface TeamConfig {
  name: string;
  description?: string;
  sharedTaskList: boolean;
  persistenceDir?: string;
}

export interface TeamMember {
  name: string;
  agentId: string;
  agentType: string;
  status: AgentStatus;
  capabilities: string[];
}

// ─── Sub-agent Manager V2 ──────────────────────────────────────────

export class SubagentManagerV2 {
  private agents: Map<string, AgentInstance> = new Map();
  private teams: Map<string, { config: TeamConfig; members: TeamMember[] }> = new Map();
  private messageLog: InboxMessage[] = [];
  private agentIdCounter = 0;

  // ─── Agent Lifecycle ──────────────────────────────────────────

  async spawn(config: AgentConfig): Promise<AgentInstance> {
    const id = `agent-${++this.agentIdCounter}-${config.type}`;

    const agent: AgentInstance = {
      id,
      config,
      status: 'initializing',
      turnsUsed: 0,
      tokensUsed: 0,
      toolCallsMade: 0,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      messages: [],
      inbox: [],
    };

    // Create isolated worktree if needed
    if (config.isolationLevel === 'workspace' || config.isolationLevel === 'full') {
      try {
        const { execSync } = require('child_process');
        const worktreePath = `.mimo/worktrees/${id}`;
        execSync(`git worktree add -b mimo/${id} ${worktreePath}`, { stdio: 'pipe' });
        agent.worktreePath = worktreePath;
        debug('Created worktree for agent %s: %s', id, worktreePath);
      } catch (err: any) {
        debug('Worktree creation failed for %s: %s', id, err.message);
      }
    }

    agent.status = 'idle';
    this.agents.set(id, agent);

    debug('Spawned agent: %s (type=%s, isolation=%s)', id, config.type, config.isolationLevel);
    return agent;
  }

  async shutdown(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    agent.status = 'shutdown';
    agent.lastActiveAt = new Date().toISOString();

    // Clean up worktree
    if (agent.worktreePath) {
      try {
        const { execSync } = require('child_process');
        execSync(`git worktree remove ${agent.worktreePath} --force`, { stdio: 'pipe' });
      } catch {}
    }

    debug('Shutdown agent: %s', agentId);
    return true;
  }

  getAgent(id: string): AgentInstance | undefined {
    return this.agents.get(id);
  }

  listAgents(filter?: { status?: AgentStatus; type?: string }): AgentInstance[] {
    let agents = Array.from(this.agents.values());
    if (filter?.status) agents = agents.filter(a => a.status === filter.status);
    if (filter?.type) agents = agents.filter(a => a.config.type === filter.type);
    return agents;
  }

  getActiveAgents(): AgentInstance[] {
    return this.listAgents({ status: 'running' });
  }

  // ─── Inter-agent Messaging ─────────────────────────────────────

  sendMessage(from: string, to: string, content: string): InboxMessage {
    const message: InboxMessage = {
      id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      from,
      to,
      content,
      timestamp: new Date().toISOString(),
      read: false,
    };

    this.messageLog.push(message);

    const targetAgent = this.agents.get(to);
    if (targetAgent) {
      targetAgent.inbox.push(message);
    }

    // Also check team members
    for (const team of this.teams.values()) {
      const member = team.members.find(m => m.name === to);
      if (member) {
        const agent = this.agents.get(member.agentId);
        if (agent) agent.inbox.push(message);
      }
    }

    debug('Message: %s → %s: %s', from, to, content.slice(0, 50));
    return message;
  }

  getInbox(agentId: string, unreadOnly = false): InboxMessage[] {
    const agent = this.agents.get(agentId);
    if (!agent) return [];
    if (unreadOnly) return agent.inbox.filter(m => !m.read);
    return [...agent.inbox];
  }

  markRead(agentId: string, messageId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    const msg = agent.inbox.find(m => m.id === messageId);
    if (msg) { msg.read = true; return true; }
    return false;
  }

  getMessageLog(limit = 100): InboxMessage[] {
    return this.messageLog.slice(-limit);
  }

  // ─── Multi-agent Routing ──────────────────────────────────────

  routeToAgent(input: string, channel?: string): string | null {
    // Route based on input characteristics
    const inputLower = input.toLowerCase();

    // Find matching agents by type
    for (const agent of this.agents.values()) {
      if (agent.status === 'shutdown' || agent.status === 'failed') continue;

      switch (agent.config.type) {
        case 'explore':
          if (/find|search|locate|where is|show me/.test(inputLower)) return agent.id;
          break;
        case 'code-reviewer':
          if (/review|check|audit|lint|quality/.test(inputLower)) return agent.id;
          break;
        case 'plan':
          if (/plan|design|architect|strategy|approach/.test(inputLower)) return agent.id;
          break;
      }
    }

    // Default: use first available general-purpose agent
    for (const agent of this.agents.values()) {
      if (agent.config.type === 'general-purpose' && agent.status === 'idle') {
        return agent.id;
      }
    }

    return null;
  }

  // ─── Team Management ──────────────────────────────────────────

  createTeam(config: TeamConfig): string {
    const id = config.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    this.teams.set(id, { config, members: [] });
    debug('Created team: %s', id);
    return id;
  }

  async addToTeam(teamId: string, agentId: string, role?: string): Promise<boolean> {
    const team = this.teams.get(teamId);
    const agent = this.agents.get(agentId);
    if (!team || !agent) return false;

    team.members.push({
      name: agent.config.name,
      agentId,
      agentType: agent.config.type,
      status: agent.status,
      capabilities: agent.config.toolFilter || [],
    });

    debug('Added %s to team %s', agentId, teamId);
    return true;
  }

  getTeam(teamId: string): { config: TeamConfig; members: TeamMember[] } | undefined {
    return this.teams.get(teamId);
  }

  listTeams(): Array<{ id: string; config: TeamConfig; memberCount: number }> {
    return Array.from(this.teams.entries()).map(([id, team]) => ({
      id,
      config: team.config,
      memberCount: team.members.length,
    }));
  }

  // ─── Broadcast ────────────────────────────────────────────────

  broadcast(from: string, content: string, teamId?: string): number {
    let sent = 0;

    if (teamId) {
      const team = this.teams.get(teamId);
      if (team) {
        for (const member of team.members) {
          if (member.agentId !== from) {
            this.sendMessage(from, member.agentId, content);
            sent++;
          }
        }
      }
    } else {
      for (const agent of this.agents.values()) {
        if (agent.id !== from && agent.status !== 'shutdown') {
          this.sendMessage(from, agent.id, content);
          sent++;
        }
      }
    }

    debug('Broadcast from %s: %d messages sent', from, sent);
    return sent;
  }

  // ─── Stats ────────────────────────────────────────────────────

  getStats(): {
    totalAgents: number;
    activeAgents: number;
    idleAgents: number;
    failedAgents: number;
    totalTeams: number;
    totalMessages: number;
    totalTokens: number;
    totalToolCalls: number;
  } {
    const agents = Array.from(this.agents.values());
    return {
      totalAgents: agents.length,
      activeAgents: agents.filter(a => a.status === 'running').length,
      idleAgents: agents.filter(a => a.status === 'idle').length,
      failedAgents: agents.filter(a => a.status === 'failed').length,
      totalTeams: this.teams.size,
      totalMessages: this.messageLog.length,
      totalTokens: agents.reduce((s, a) => s + a.tokensUsed, 0),
      totalToolCalls: agents.reduce((s, a) => s + a.toolCallsMade, 0),
    };
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  async shutdownAll(): Promise<void> {
    for (const agent of this.agents.values()) {
      if (agent.status !== 'shutdown') {
        await this.shutdown(agent.id);
      }
    }
    debug('All agents shut down');
  }
}
