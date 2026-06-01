/**
 * Agent Knowledge Base - 统一知识库系统
 *
 * 所有agents都可以通过知识库来进行升级
 * 提供知识的存储、检索、学习和共享功能
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MimoConfig } from '../config/schema';
import { printInfo, printSuccess, printWarning, ORANGE, GRAY, GREEN, CYAN } from '../tui/output';

// 知识条目类型
export interface KnowledgeItem {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string[];
  source: string; // 来源：'user' | 'web' | 'code' | 'docs' | 'expert'
  relevanceScore: number; // 0-100
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, any>;
}

// 知识库配置
export interface KnowledgeBaseConfig {
  maxItems: number;
  autoCleanup: boolean;
  cleanupDays: number;
  enableSharing: boolean;
  enableVersioning: boolean;
}

// 知识库统计
export interface KnowledgeBaseStats {
  totalItems: number;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  byAgent: Record<string, number>;
  averageRelevance: number;
  totalUsage: number;
}

// Agent升级记录
export interface AgentUpgradeRecord {
  agentId: string;
  knowledgeId: string;
  upgradeType: 'skill' | 'pattern' | 'best_practice' | 'tool' | 'technique';
  description: string;
  appliedAt: string;
  effectiveness: number; // 0-100
}

export class AgentKnowledgeBase {
  private config: MimoConfig;
  private knowledgeFile: string;
  private upgradesFile: string;
  private configFile: string;
  private knowledge: KnowledgeItem[] = [];
  private upgrades: AgentUpgradeRecord[] = [];
  private kbConfig: KnowledgeBaseConfig;

  constructor(config: MimoConfig) {
    this.config = config;
    this.knowledgeFile = path.join(process.cwd(), '.mimo', 'knowledge-base.json');
    this.upgradesFile = path.join(process.cwd(), '.mimo', 'agent-upgrades.json');
    this.configFile = path.join(process.cwd(), '.mimo', 'knowledge-config.json');

    this.kbConfig = {
      maxItems: 10000,
      autoCleanup: true,
      cleanupDays: 90,
      enableSharing: true,
      enableVersioning: true,
    };
  }

  /**
   * 初始化知识库
   */
  async init(): Promise<void> {
    try {
      await fs.mkdir(path.join(process.cwd(), '.mimo'), { recursive: true });
      await this.loadData();
      printSuccess('Agent知识库初始化完成');
    } catch {
      printInfo('初始化Agent知识库...');
      this.knowledge = [];
      this.upgrades = [];
    }
  }

  /**
   * 加载数据
   */
  private async loadData(): Promise<void> {
    try {
      const knowledgeData = await fs.readFile(this.knowledgeFile, 'utf-8');
      this.knowledge = JSON.parse(knowledgeData);
    } catch {
      this.knowledge = [];
    }

    try {
      const upgradesData = await fs.readFile(this.upgradesFile, 'utf-8');
      this.upgrades = JSON.parse(upgradesData);
    } catch {
      this.upgrades = [];
    }

    try {
      const configData = await fs.readFile(this.configFile, 'utf-8');
      this.kbConfig = { ...this.kbConfig, ...JSON.parse(configData) };
    } catch {
      // 使用默认配置
    }
  }

  /**
   * 保存数据
   */
  async saveData(): Promise<void> {
    try {
      await fs.writeFile(this.knowledgeFile, JSON.stringify(this.knowledge, null, 2), 'utf-8');
      await fs.writeFile(this.upgradesFile, JSON.stringify(this.upgrades, null, 2), 'utf-8');
      await fs.writeFile(this.configFile, JSON.stringify(this.kbConfig, null, 2), 'utf-8');
    } catch (err: any) {
      printWarning(`保存知识库失败: ${err.message}`);
    }
  }

  /**
   * 添加知识条目
   */
  async addKnowledge(item: Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): Promise<KnowledgeItem> {
    // 检查是否已存在相似知识
    const existingIndex = this.knowledge.findIndex(k =>
      k.title.toLowerCase() === item.title.toLowerCase() ||
      (k.category === item.category && k.content.substring(0, 100) === item.content.substring(0, 100))
    );

    if (existingIndex >= 0) {
      // 更新现有知识
      const existing = this.knowledge[existingIndex];
      existing.content = item.content;
      existing.tags = [...new Set([...existing.tags, ...item.tags])];
      existing.relevanceScore = Math.min(100, existing.relevanceScore + 10);
      existing.updatedAt = new Date().toISOString();
      existing.metadata = { ...existing.metadata, ...item.metadata };

      printSuccess(`更新知识: ${item.title}`);
      await this.saveData();
      return existing;
    }

    // 创建新知识条目
    const newItem: KnowledgeItem = {
      ...item,
      id: `kb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      usageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.knowledge.push(newItem);

    // 检查是否超过最大数量
    if (this.knowledge.length > this.kbConfig.maxItems) {
      await this.cleanup();
    }

    printSuccess(`添加知识: ${item.title} (${item.category})`);
    await this.saveData();
    return newItem;
  }

  /**
   * 搜索知识
   */
  searchKnowledge(query: string, category?: string, tags?: string[]): KnowledgeItem[] {
    const queryLower = query.toLowerCase();

    let results = this.knowledge.filter(item => {
      // 搜索标题、内容、标签
      const searchText = [
        item.title,
        item.content,
        item.category,
        ...item.tags,
      ].join(' ').toLowerCase();

      const matchesQuery = searchText.includes(queryLower);
      const matchesCategory = !category || item.category.toLowerCase().includes(category.toLowerCase());
      const matchesTags = !tags || tags.some(tag => item.tags.includes(tag));

      return matchesQuery && matchesCategory && matchesTags;
    });

    // 按相关性排序
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return results;
  }

  /**
   * 获取知识详情
   */
  getKnowledge(id: string): KnowledgeItem | null {
    return this.knowledge.find(k => k.id === id) || null;
  }

  /**
   * 使用知识（更新使用统计）
   */
  async useKnowledge(id: string, agentId: string): Promise<void> {
    const item = this.knowledge.find(k => k.id === id);
    if (item) {
      item.usageCount++;
      item.relevanceScore = Math.min(100, item.relevanceScore + 5);
      item.updatedAt = new Date().toISOString();

      // 记录元数据
      if (!item.metadata.usedBy) {
        item.metadata.usedBy = [];
      }
      if (!item.metadata.usedBy.includes(agentId)) {
        item.metadata.usedBy.push(agentId);
      }

      await this.saveData();
    }
  }

  /**
   * Agent升级 - 从知识库学习并升级
   */
  async upgradeAgent(
    agentId: string,
    knowledgeId: string,
    upgradeType: AgentUpgradeRecord['upgradeType'],
    description: string
  ): Promise<AgentUpgradeRecord> {
    const knowledge = this.getKnowledge(knowledgeId);
    if (!knowledge) {
      throw new Error(`知识条目不存在: ${knowledgeId}`);
    }

    // 记录使用
    await this.useKnowledge(knowledgeId, agentId);

    // 创建升级记录
    const upgrade: AgentUpgradeRecord = {
      agentId,
      knowledgeId,
      upgradeType,
      description,
      appliedAt: new Date().toISOString(),
      effectiveness: 0, // 初始效果为0，后续根据使用情况更新
    };

    this.upgrades.push(upgrade);
    await this.saveData();

    printSuccess(`Agent ${agentId} 已升级: ${description}`);
    return upgrade;
  }

  /**
   * 获取Agent的升级历史
   */
  getAgentUpgrades(agentId: string): AgentUpgradeRecord[] {
    return this.upgrades.filter(u => u.agentId === agentId);
  }

  /**
   * 获取Agent可用的知识（按相关性排序）
   */
  getAvailableKnowledgeForAgent(agentId: string, category?: string): KnowledgeItem[] {
    // 获取Agent的升级历史
    const upgrades = this.getAgentUpgrades(agentId);
    const usedKnowledgeIds = new Set(upgrades.map(u => u.knowledgeId));

    // 过滤掉已使用的知识，按相关性排序
    let available = this.knowledge.filter(k => !usedKnowledgeIds.has(k.id));

    if (category) {
      available = available.filter(k => k.category.toLowerCase().includes(category.toLowerCase()));
    }

    return available.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * 推荐知识给Agent
   */
  recommendKnowledgeForAgent(
    agentId: string,
    agentIndustry: string,
    agentExpertise: string[],
    limit: number = 10
  ): KnowledgeItem[] {
    // 获取Agent的升级历史
    const upgrades = this.getAgentUpgrades(agentId);
    const usedKnowledgeIds = new Set(upgrades.map(u => u.knowledgeId));

    // 计算每个知识的相关性分数
    const scoredKnowledge = this.knowledge
      .filter(k => !usedKnowledgeIds.has(k.id))
      .map(k => {
        let score = k.relevanceScore;

        // 行业匹配加分
        if (k.category.toLowerCase().includes(agentIndustry.toLowerCase())) {
          score += 20;
        }

        // 专业领域匹配加分
        for (const expertise of agentExpertise) {
          if (k.tags.some(tag => tag.toLowerCase().includes(expertise.toLowerCase()))) {
            score += 10;
          }
        }

        // 使用频率加分
        score += Math.min(k.usageCount * 2, 20);

        return { ...k, recommendationScore: score };
      })
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, limit);

    return scoredKnowledge;
  }

  /**
   * 批量导入知识
   */
  async importKnowledge(items: Array<Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>>): Promise<number> {
    let imported = 0;

    for (const item of items) {
      try {
        await this.addKnowledge(item);
        imported++;
      } catch (err: any) {
        printWarning(`导入知识失败: ${item.title} - ${err.message}`);
      }
    }

    printSuccess(`导入完成: ${imported}/${items.length} 条知识`);
    return imported;
  }

  /**
   * 导出知识库
   */
  async exportKnowledge(format: 'json' | 'markdown' = 'json'): Promise<string> {
    if (format === 'markdown') {
      return this.exportAsMarkdown();
    }

    return JSON.stringify(this.knowledge, null, 2);
  }

  /**
   * 导出为Markdown格式
   */
  private exportAsMarkdown(): string {
    let md = '# MIMO Agent 知识库\n\n';
    md += `*导出时间: ${new Date().toISOString()}*\n\n`;
    md += `**总计: ${this.knowledge.length} 条知识**\n\n`;

    // 按类别分组
    const byCategory: Record<string, KnowledgeItem[]> = {};
    for (const item of this.knowledge) {
      if (!byCategory[item.category]) {
        byCategory[item.category] = [];
      }
      byCategory[item.category].push(item);
    }

    for (const [category, items] of Object.entries(byCategory)) {
      md += `## ${category} (${items.length})\n\n`;

      for (const item of items) {
        md += `### ${item.title}\n\n`;
        md += `**来源**: ${item.source} | **相关性**: ${item.relevanceScore}% | **使用次数**: ${item.usageCount}\n\n`;
        md += `**标签**: ${item.tags.join(', ')}\n\n`;
        md += `${item.content.substring(0, 200)}${item.content.length > 200 ? '...' : ''}\n\n`;
        md += `---\n\n`;
      }
    }

    return md;
  }

  /**
   * 清理过期知识
   */
  async cleanup(): Promise<void> {
    if (!this.kbConfig.autoCleanup) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.kbConfig.cleanupDays);
    const cutoffTime = cutoffDate.toISOString();

    const beforeCount = this.knowledge.length;

    // 保留高相关性或最近使用的知识
    this.knowledge = this.knowledge.filter(item => {
      // 保留相关性高的
      if (item.relevanceScore >= 70) return true;
      // 保留最近更新的
      if (item.updatedAt >= cutoffTime) return true;
      // 保留使用频率高的
      if (item.usageCount >= 5) return true;
      return false;
    });

    const afterCount = this.knowledge.length;
    const removed = beforeCount - afterCount;

    if (removed > 0) {
      printInfo(`清理完成: 移除 ${removed} 条过期知识，保留 ${afterCount} 条`);
      await this.saveData();
    }
  }

  /**
   * 获取知识库统计
   */
  getStats(): KnowledgeBaseStats {
    const byCategory: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byAgent: Record<string, number> = {};
    let totalRelevance = 0;
    let totalUsage = 0;

    for (const item of this.knowledge) {
      // 按类别统计
      byCategory[item.category] = (byCategory[item.category] || 0) + 1;

      // 按来源统计
      bySource[item.source] = (bySource[item.source] || 0) + 1;

      // 按Agent统计
      if (item.metadata.usedBy) {
        for (const agentId of item.metadata.usedBy) {
          byAgent[agentId] = (byAgent[agentId] || 0) + 1;
        }
      }

      totalRelevance += item.relevanceScore;
      totalUsage += item.usageCount;
    }

    return {
      totalItems: this.knowledge.length,
      byCategory,
      bySource,
      byAgent,
      averageRelevance: this.knowledge.length > 0 ? totalRelevance / this.knowledge.length : 0,
      totalUsage,
    };
  }

  /**
   * 生成知识库报告
   */
  generateReport(): string {
    const stats = this.getStats();

    let report = `\n  ${ORANGE('📚 Agent 知识库报告')}\n`;
    report += `  ${GRAY('═'.repeat(50))}\n\n`;

    report += `  ${GREEN('●')} 总计知识: ${stats.totalItems} 条\n`;
    report += `  ${GREEN('●')} 平均相关性: ${Math.round(stats.averageRelevance)}%\n`;
    report += `  ${GREEN('●')} 总使用次数: ${stats.totalUsage}\n\n`;

    if (Object.keys(stats.byCategory).length > 0) {
      report += `  ${ORANGE('按类别统计:')}\n`;
      for (const [category, count] of Object.entries(stats.byCategory).sort(([, a], [, b]) => b - a)) {
        report += `    ${GRAY('•')} ${category}: ${count} 条\n`;
      }
      report += '\n';
    }

    if (Object.keys(stats.bySource).length > 0) {
      report += `  ${ORANGE('按来源统计:')}\n`;
      for (const [source, count] of Object.entries(stats.bySource).sort(([, a], [, b]) => b - a)) {
        report += `    ${GRAY('•')} ${source}: ${count} 条\n`;
      }
      report += '\n';
    }

    if (Object.keys(stats.byAgent).length > 0) {
      report += `  ${ORANGE('按Agent统计:')}\n`;
      for (const [agentId, count] of Object.entries(stats.byAgent).sort(([, a], [, b]) => b - a).slice(0, 10)) {
        report += `    ${GRAY('•')} ${agentId}: ${count} 次使用\n`;
      }
      report += '\n';
    }

    report += `  ${GRAY('═'.repeat(50))}\n`;

    return report;
  }

  /**
   * 获取知识库配置
   */
  getConfig(): KnowledgeBaseConfig {
    return this.kbConfig;
  }

  /**
   * 更新知识库配置
   */
  async updateConfig(config: Partial<KnowledgeBaseConfig>): Promise<void> {
    this.kbConfig = { ...this.kbConfig, ...config };
    await this.saveData();
    printSuccess('知识库配置已更新');
  }

  /**
   * 获取所有类别
   */
  getCategories(): string[] {
    const categories = new Set(this.knowledge.map(k => k.category));
    return Array.from(categories).sort();
  }

  /**
   * 获取所有标签
   */
  getTags(): string[] {
    const tags = new Set(this.knowledge.flatMap(k => k.tags));
    return Array.from(tags).sort();
  }

  /**
   * 删除知识条目
   */
  async deleteKnowledge(id: string): Promise<boolean> {
    const index = this.knowledge.findIndex(k => k.id === id);
    if (index >= 0) {
      this.knowledge.splice(index, 1);
      await this.saveData();
      printSuccess(`删除知识: ${id}`);
      return true;
    }
    return false;
  }

  /**
   * 更新知识条目
   */
  async updateKnowledge(id: string, updates: Partial<KnowledgeItem>): Promise<KnowledgeItem | null> {
    const item = this.knowledge.find(k => k.id === id);
    if (item) {
      Object.assign(item, updates, { updatedAt: new Date().toISOString() });
      await this.saveData();
      printSuccess(`更新知识: ${item.title}`);
      return item;
    }
    return null;
  }
}
