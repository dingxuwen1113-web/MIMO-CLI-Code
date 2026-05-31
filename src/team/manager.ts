// ── Team 多代理协作系统（增强版）──────────────────

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SubagentManager, SubagentResult } from '../subagent/manager';
import { TaskManager, Task } from '../task/manager';

export interface TeamMember {
  name: string;
  agentType: string;
  status: 'idle' | 'busy' | 'shutdown';
  capabilities: string[];
  lastActiveAt?: string;
}

export interface TeamConfig {
  name: string;
  description: string;
  members: TeamMember[];
  createdAt: string;
  archived: boolean;
}

export interface TeamMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: string;
  read: boolean;
  type: 'text' | 'task_result' | 'status_update' | 'request';
}

const TEAMS_DIR = path.join(os.homedir(), '.mimo', 'teams');

export class TeamManager {
  private subagentManager: SubagentManager;
  private taskManager: TaskManager;
  private teams: Map<string, TeamConfig> = new Map();
  private messages: Map<string, TeamMessage[]> = new Map();
  private onMessageCallbacks: Map<string, (msg: TeamMessage) => void> = new Map();

  constructor(subagentManager: SubagentManager, taskManager: TaskManager) {
    this.subagentManager = subagentManager;
    this.taskManager = taskManager;
  }

  async init(): Promise<void> {
    await fs.mkdir(TEAMS_DIR, { recursive: true });
    await this.loadTeams();
  }

  private async loadTeams(): Promise<void> {
    try {
      const dirs = await fs.readdir(TEAMS_DIR);
      for (const dir of dirs) {
        try {
          const raw = await fs.readFile(path.join(TEAMS_DIR, dir, 'config.json'), 'utf-8');
          const config = JSON.parse(raw) as TeamConfig;
          if (!config.archived) {
            this.teams.set(config.name, config);
          }
        } catch { /* skip */ }
      }
    } catch { /* dir doesn't exist */ }
  }

  async createTeam(name: string, description: string): Promise<TeamConfig> {
    const config: TeamConfig = {
      name,
      description,
      members: [],
      createdAt: new Date().toISOString(),
      archived: false,
    };

    const dir = path.join(TEAMS_DIR, name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');

    this.teams.set(name, config);
    this.messages.set(name, []);
    return config;
  }

  async addMember(teamName: string, member: TeamMember): Promise<void> {
    const team = this.teams.get(teamName);
    if (!team) throw new Error(`团队 "${teamName}" 不存在`);

    member.status = 'idle';
    member.lastActiveAt = new Date().toISOString();
    team.members.push(member);
    await this.saveTeam(team);
  }

  // 发送消息（实时通知）
  async sendMessage(teamName: string, from: string, to: string, content: string, type: TeamMessage['type'] = 'text'): Promise<TeamMessage> {
    const msg: TeamMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      from,
      to,
      content,
      timestamp: new Date().toISOString(),
      read: false,
      type,
    };

    const msgs = this.messages.get(teamName) || [];
    msgs.push(msg);
    this.messages.set(teamName, msgs);

    // 触发接收方回调
    const callback = this.onMessageCallbacks.get(`${teamName}:${to}`);
    if (callback) {
      callback(msg);
    }

    // 更新成员最后活跃时间
    const team = this.teams.get(teamName);
    if (team) {
      const member = team.members.find(m => m.name === from);
      if (member) {
        member.lastActiveAt = new Date().toISOString();
      }
    }

    // 持久化
    await this.saveMessages(teamName);

    return msg;
  }

  // 获取未读消息
  getUnreadMessages(teamName: string, memberName: string): TeamMessage[] {
    const msgs = this.messages.get(teamName) || [];
    return msgs.filter(m => m.to === memberName && !m.read);
  }

  // 标记消息为已读
  markRead(teamName: string, memberName: string): void {
    const msgs = this.messages.get(teamName) || [];
    for (const msg of msgs) {
      if (msg.to === memberName) {
        msg.read = true;
      }
    }
  }

  // 注册消息接收回调
  onMessage(teamName: string, memberName: string, callback: (msg: TeamMessage) => void): void {
    this.onMessageCallbacks.set(`${teamName}:${memberName}`, callback);
  }

  // 获取消息历史
  getMessages(teamName: string, options?: { from?: string; to?: string; limit?: number }): TeamMessage[] {
    let msgs = this.messages.get(teamName) || [];
    if (options?.from) msgs = msgs.filter(m => m.from === options.from);
    if (options?.to) msgs = msgs.filter(m => m.to === options.to);
    if (options?.limit) msgs = msgs.slice(-options.limit);
    return msgs;
  }

  // 分配任务给成员（集成消息通知）
  async assignTask(teamName: string, memberName: string, task: Task): Promise<SubagentResult> {
    const team = this.teams.get(teamName);
    if (!team) throw new Error(`团队 "${teamName}" 不存在`);

    const member = team.members.find((m) => m.name === memberName);
    if (!member) throw new Error(`成员 "${memberName}" 不在团队 "${teamName}" 中`);

    member.status = 'busy';
    await this.saveTeam(team);

    // 发送任务分配消息
    await this.sendMessage(teamName, 'system', memberName, `新任务: ${task.subject}`, 'task_result');

    await this.taskManager.update(task.id, { status: 'in_progress', owner: memberName });

    try {
      const result = await this.subagentManager.spawn(
        task.description,
        { label: `${teamName}/${memberName}: ${task.subject}`, agentName: member.agentType }
      );

      await this.taskManager.update(task.id, { status: 'completed' });

      // 发送完成消息
      await this.sendMessage(teamName, memberName, 'system', `任务完成: ${task.subject}\n${result.output.slice(0, 500)}`, 'task_result');

      return result;
    } catch (err: any) {
      await this.sendMessage(teamName, memberName, 'system', `任务失败: ${err.message}`, 'status_update');
      throw err;
    } finally {
      member.status = 'idle';
      member.lastActiveAt = new Date().toISOString();
      await this.saveTeam(team);
    }
  }

  // 并行分配多个任务
  async assignTasksParallel(teamName: string, assignments: Array<{ memberName: string; task: Task }>): Promise<SubagentResult[]> {
    const promises = assignments.map(({ memberName, task }) =>
      this.assignTask(teamName, memberName, task).catch(err => ({
        output: `错误: ${err.message}`,
        turnsUsed: 0,
        toolsCalled: 0,
        tokensUsed: { input: 0, output: 0 },
      }))
    );
    return Promise.all(promises);
  }

  getTeamStatus(teamName: string): TeamConfig | undefined {
    return this.teams.get(teamName);
  }

  listTeams(): TeamConfig[] {
    return Array.from(this.teams.values());
  }

  getMemberStatus(teamName: string, memberName: string): TeamMember | undefined {
    const team = this.teams.get(teamName);
    return team?.members.find(m => m.name === memberName);
  }

  // 归档团队
  async archiveTeam(teamName: string): Promise<void> {
    const team = this.teams.get(teamName);
    if (!team) return;

    team.archived = true;
    await this.saveTeam(team);
    this.teams.delete(teamName);
  }

  async shutdownTeam(teamName: string): Promise<void> {
    const team = this.teams.get(teamName);
    if (!team) return;

    for (const member of team.members) {
      member.status = 'shutdown';
    }
    await this.saveTeam(team);
  }

  private async saveTeam(team: TeamConfig): Promise<void> {
    const dir = path.join(TEAMS_DIR, team.name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'config.json'), JSON.stringify(team, null, 2), 'utf-8');
  }

  private async saveMessages(teamName: string): Promise<void> {
    const dir = path.join(TEAMS_DIR, teamName);
    await fs.mkdir(dir, { recursive: true });
    const msgs = this.messages.get(teamName) || [];
    await fs.writeFile(path.join(dir, 'messages.json'), JSON.stringify(msgs, null, 2), 'utf-8');
  }
}
