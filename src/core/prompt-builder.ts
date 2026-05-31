import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import createDebug from 'debug';
import { AgentState } from './types';
import { matchExpertAgent } from '../dynamic-agents/expert-registry';
import { detectEnvironment, formatEnvironment } from './environment';

const debug = createDebug('mimo:prompt');

/**
 * Builds the system prompt for the AI model.
 * Combines charter, project rules, skills, agents, memory, and environment info.
 */
export class PromptBuilder {
  private state: AgentState;

  constructor(state: AgentState) {
    this.state = state;
  }

  /**
   * Load project rules from CLAUDE.md files in the hierarchy.
   */
  async loadProjectRules(): Promise<void> {
    const cwd = process.cwd();
    const homeDir = os.homedir();

    const ruleFiles = [
      path.join(homeDir, '.claude', 'CLAUDE.md'),
      path.join(homeDir, '.mimo', 'rules.md'),
      path.join(cwd, 'CLAUDE.md'),
      path.join(cwd, '.mimo', 'rules.md'),
      path.join(cwd, 'MIMO.md'),
      path.join(cwd, '.claude', 'CLAUDE.md'),
    ];

    const rules: string[] = [];
    for (const file of ruleFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        if (content.trim()) {
          rules.push(`## 项目规则 (${path.relative(cwd, file) || path.basename(file)})\n\n${content.trim()}`);
        }
      } catch {
        // File doesn't exist, skip
      }
    }

    this.state.projectRules = rules.join('\n\n');
    debug('Loaded %d rule files', rules.length);
  }

  /**
   * Build the complete system prompt.
   */
  async build(memoryContext: string, userInput?: string): Promise<string> {
    const charterContent = this.state.charter.getContent();
    const parts = charterContent ? [charterContent] : ['You are MIMO, a helpful AI coding assistant.'];

    // Project rules
    if (this.state.projectRules) {
      parts.push(this.state.projectRules);
    }

    // Matched skill
    if (userInput) {
      const matchedSkill = this.state.skills.matchSkill(userInput);
      if (matchedSkill) {
        parts.push(`# 当前技能: ${matchedSkill.icon} ${matchedSkill.name}\n\n${matchedSkill.systemPrompt}`);
      }
    }

    // Matched dynamic agent
    if (userInput && this.state.dynamicAgents) {
      const matchedAgent = this.state.dynamicAgents.matchAgent(userInput);
      if (matchedAgent) {
        parts.push(`# Agent: ${matchedAgent.name}\n\n${matchedAgent.systemPrompt}`);
      }
    }

    // Matched expert agent
    if (userInput) {
      const expertAgent = matchExpertAgent(userInput);
      if (expertAgent) {
        try {
          const agentPath = path.join(process.cwd(), expertAgent.filePath);
          const agentContent = await fs.readFile(agentPath, 'utf-8');
          const body = agentContent.replace(/^---[\s\S]*?---\n*/m, '');
          parts.push(`# 专家团队: ${expertAgent.name}\n\n${body}`);
        } catch {
          parts.push(`# 专家团队: ${expertAgent.name}\n\n${expertAgent.description}`);
        }
      }
    }

    // MCP tools
    const mcpTools = this.state.tools.getExternalTools();
    if (mcpTools.length > 0) {
      const toolList = mcpTools.map(t => `  - mcp__${t.server}__${t.name}: ${t.description}`).join('\n');
      parts.push(`# 可用 MCP 工具\n\n${toolList}`);
    }

    // Memory context
    if (memoryContext) {
      parts.push(`# 用户记忆与上下文\n\n${memoryContext}`);
    }

    // Current plan
    if (this.state.currentPlan) {
      const planText = this.state.currentPlan.steps
        .map((s, i) => `${i + 1}. [${s.status === 'done' ? 'x' : ' '}] ${s.description}`)
        .join('\n');
      parts.push(`# 当前计划: ${this.state.currentPlan.title}\n\n${planText}`);
    }

    // Chapters
    if (this.state.chapters.length > 0) {
      const chapterList = this.state.chapters.map(c => `  - ${c.title}${c.summary ? ': ' + c.summary : ''}`).join('\n');
      parts.push(`# 会话章节\n\n${chapterList}`);
    }

    // Environment info
    if (!this.state.cachedEnvironmentInfo) {
      try {
        this.state.cachedEnvironmentInfo = await detectEnvironment();
      } catch { /* non-fatal */ }
    }
    if (this.state.cachedEnvironmentInfo) {
      parts.push(formatEnvironment(this.state.cachedEnvironmentInfo));
    }

    debug('Built system prompt with %d sections', parts.length);
    return parts.join('\n\n');
  }
}
