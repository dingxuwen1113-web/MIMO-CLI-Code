// ── MIMO 智能调度引擎 ──────────────────────────────
// 统一调度 Agents / Skills / MCP 工具，自动选择最优路径

import { SkillRegistry, Skill } from '../skills/registry';
import { DynamicAgentLoader, AgentDefinition } from '../dynamic-agents/loader';
import { MCPClient } from '../mcp/client';
import { ToolRegistry } from '../tools/registry';
import { ModelRouter } from '../core/router';

// ═══════════════════════════════════════════════════════
//  类型定义
// ═══════════════════════════════════════════════════════

export type DispatchTarget = 'skill' | 'agent' | 'mcp' | 'builtin' | 'model';

export interface DispatchDecision {
  target: DispatchTarget;
  id: string;
  name: string;
  confidence: number;   // 0-1
  reason: string;
  injectPrompt?: string;
  mcpServer?: string;
  mcpTool?: string;
}

export interface DispatchResult {
  decisions: DispatchDecision[];
  primary: DispatchDecision;
  fallbacks: DispatchDecision[];
  model: string;
  systemPromptAddons: string[];
}

// ═══════════════════════════════════════════════════════
//  调度引擎
// ═══════════════════════════════════════════════════════

export class DispatchEngine {
  private skills: SkillRegistry;
  private agents: DynamicAgentLoader;
  private mcpClient: MCPClient;
  private tools: ToolRegistry;
  private router: ModelRouter;
  private dispatchHistory: Array<{ input: string; result: DispatchResult; timestamp: number }> = [];

  constructor(
    skills: SkillRegistry,
    agents: DynamicAgentLoader,
    mcpClient: MCPClient,
    tools: ToolRegistry,
    router: ModelRouter,
  ) {
    this.skills = skills;
    this.agents = agents;
    this.mcpClient = mcpClient;
    this.tools = tools;
    this.router = router;
  }

  // ── 核心调度方法 ──
  dispatch(userInput: string): DispatchResult {
    const candidates: DispatchDecision[] = [];

    // 1. 匹配内置工具模式（高优先级：具体操作）
    const builtinMatch = this.matchBuiltin(userInput);
    if (builtinMatch) candidates.push(builtinMatch);

    // 2. 匹配 Skills
    const skillMatch = this.matchSkill(userInput);
    if (skillMatch) candidates.push(skillMatch);

    // 3. 匹配 Agents
    const agentMatch = this.matchAgent(userInput);
    if (agentMatch) candidates.push(agentMatch);

    // 4. 匹配 MCP 工具
    const mcpMatches = this.matchMCP(userInput);
    candidates.push(...mcpMatches);

    // 5. 通用模型调用（保底）
    candidates.push({
      target: 'model',
      id: 'default',
      name: 'General',
      confidence: 0.1,
      reason: 'No specific match, use general model',
    });

    // 按置信度排序
    candidates.sort((a, b) => b.confidence - a.confidence);

    const primary = candidates[0];
    const fallbacks = candidates.slice(1, 3);

    // 选择最优模型
    const taskContext = this.router.classifyTask(userInput);
    const model = this.router.route({ ...taskContext });

    // 构建 system prompt 附加内容
    const addons: string[] = [];
    if (primary.injectPrompt) addons.push(primary.injectPrompt);

    const result: DispatchResult = {
      decisions: candidates,
      primary,
      fallbacks,
      model,
      systemPromptAddons: addons,
    };

    // 记录历史
    this.dispatchHistory.push({ input: userInput, result, timestamp: Date.now() });
    if (this.dispatchHistory.length > 100) this.dispatchHistory.shift();

    return result;
  }

  // ── Skill 匹配 ──
  private matchSkill(input: string): DispatchDecision | null {
    const skill = this.skills.matchSkill(input);
    if (!skill) return null;

    const confidence = this.calculateSkillConfidence(input, skill);
    return {
      target: 'skill',
      id: skill.id,
      name: skill.name,
      confidence,
      reason: `Matched triggers: ${skill.triggers.filter(t => input.toLowerCase().includes(t.toLowerCase())).join(', ')}`,
      injectPrompt: skill.systemPrompt,
    };
  }

  private calculateSkillConfidence(input: string, skill: Skill): number {
    const lower = input.toLowerCase();
    let score = 0;
    let maxScore = 0;
    let exactHits = 0;

    // 技能 ID 直接匹配（最高权重）
    const idParts = skill.id.split('-');
    for (const part of idParts) {
      if (part.length >= 3 && lower.includes(part)) {
        score += 15;
        exactHits++;
      }
    }

    for (const trigger of skill.triggers) {
      const t = trigger.toLowerCase();
      maxScore += t.length;
      if (lower.includes(t)) {
        score += t.length;
        exactHits++;
        // 精确匹配加分
        if (t.length <= 5 && lower.split(/\s+/).some(w => w === t)) {
          score += 10;
        }
      }
    }

    // 多个触发词命中额外加分
    if (exactHits >= 2) score += exactHits * 3;

    const normalized = maxScore > 0 ? score / maxScore : 0;
    return Math.min(0.95, 0.3 + normalized * 0.7);
  }

  // ── Agent 匹配 ──
  private matchAgent(input: string): DispatchDecision | null {
    if (!this.agents) return null;

    const agentList = this.agents.listAgents();
    let bestMatch: AgentDefinition | null = null;
    let bestScore = 0;

    for (const agent of agentList) {
      const triggers = agent.triggers || [];
      let score = 0;
      for (const trigger of triggers) {
        if (input.toLowerCase().includes(trigger.toLowerCase())) {
          score += trigger.length;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = agent;
      }
    }

    if (!bestMatch || bestScore < 3) return null;

    return {
      target: 'agent',
      id: bestMatch.name,
      name: bestMatch.description || bestMatch.name,
      confidence: Math.min(0.9, 0.4 + (bestScore / 20)),
      reason: `Agent "${bestMatch.name}" matched`,
      injectPrompt: bestMatch.systemPrompt,
    };
  }

  // ── MCP 工具匹配 ──
  private matchMCP(input: string): DispatchDecision[] {
    const results: DispatchDecision[] = [];
    const mcpTools = this.mcpClient.getAllTools();
    const lower = input.toLowerCase();

    for (const { server, tool } of mcpTools) {
      const desc = (tool.description || '').toLowerCase();
      const name = (tool.name || '').toLowerCase();

      // 简单关键词匹配
      const keywords = lower.split(/\s+/).filter(w => w.length > 2);
      let matchCount = 0;
      for (const kw of keywords) {
        if (desc.includes(kw) || name.includes(kw)) matchCount++;
      }

      if (matchCount >= 1) {
        results.push({
          target: 'mcp',
          id: `${server}__${tool.name}`,
          name: `[MCP] ${tool.name}`,
          confidence: Math.min(0.7, 0.2 + matchCount * 0.15),
          reason: `MCP tool "${tool.name}" from ${server}`,
          mcpServer: server,
          mcpTool: tool.name,
        });
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  // ── 内置工具模式匹配 ──
  private matchBuiltin(input: string): DispatchDecision | null {
    const lower = input.toLowerCase();

    // 文件操作模式（包含具体文件路径/扩展名时高优先级）
    const hasFilePath = /\.(ts|js|py|go|rs|java|c|cpp|html|css|json|md|yaml|yml|toml|txt)/.test(lower)
      || /src\/|lib\/|app\/|test\/|\.\//.test(lower);
    const hasReadVerb = /(read|open|show|cat|view|display|读取|打开|查看|显示|看一)/i.test(lower);

    if (hasFilePath && hasReadVerb) {
      return { target: 'builtin', id: 'file_read', name: 'Read File', confidence: 0.9, reason: 'File path + read verb detected' };
    }

    // 搜索模式（包含具体文件类型时高优先级）
    const hasSearchVerb = /(find|search|grep|look for|where is|搜索|查找|找一下)/i.test(lower);
    const hasFileType = /(typescript|javascript|python|\.ts|\.js|\.py|文件|files|code|代码)/i.test(lower);
    const hasSearchAll = /搜索.*所有|查找.*所有|find.*all|search.*all/i.test(lower);

    if ((hasSearchVerb && hasFileType) || hasSearchAll) {
      return { target: 'builtin', id: 'grep_search', name: 'Search', confidence: 0.96, reason: 'Search + file type detected' };
    }

    // Git 模式（避免 "logo" 等误匹配）
    if (/\bgit\b|commit|branch|merge|\bdiff\b|\blog\b|status|push|pull|\bpr\b/i.test(lower) &&
        !/\blogo\b/i.test(lower)) {
      return { target: 'builtin', id: 'git', name: 'Git', confidence: 0.7, reason: 'Git operation detected' };
    }

    // Shell 模式
    if (/(run|execute|install|npm|yarn|pip|cargo|build|test|deploy|运行|安装|构建|部署)/i.test(lower)) {
      return { target: 'builtin', id: 'shell_exec', name: 'Shell', confidence: 0.6, reason: 'Shell command pattern' };
    }

    // 浏览器模式
    if (/(http|www|\.com|\.org|\.net|\.io)/i.test(lower)) {
      return { target: 'builtin', id: 'browser', name: 'Browser', confidence: 0.65, reason: 'URL detected' };
    }

    return null;
  }

  // ── 获取调度历史 ──
  getHistory(): Array<{ input: string; result: DispatchResult; timestamp: number }> {
    return [...this.dispatchHistory];
  }

  // ── 获取调度统计 ──
  getStats(): { total: number; byTarget: Record<DispatchTarget, number>; avgConfidence: number } {
    const byTarget: Record<DispatchTarget, number> = { skill: 0, agent: 0, mcp: 0, builtin: 0, model: 0 };
    let totalConfidence = 0;

    for (const entry of this.dispatchHistory) {
      byTarget[entry.result.primary.target]++;
      totalConfidence += entry.result.primary.confidence;
    }

    return {
      total: this.dispatchHistory.length,
      byTarget,
      avgConfidence: this.dispatchHistory.length > 0 ? totalConfidence / this.dispatchHistory.length : 0,
    };
  }
}
