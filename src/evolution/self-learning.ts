/**
 * Self-Learning System - 自主学习系统
 *
 * 让Agent能够自主学习新技能、积累知识、持续进化
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MimoConfig } from '../config/schema';
import { printInfo, printSuccess, printWarning, ORANGE, GRAY, GREEN } from '../tui/output';

export interface LearnedSkill {
  id: string;
  name: string;
  category: string;
  description: string;
  learnedAt: string;
  source: 'web' | 'code' | 'docs' | 'user' | 'experiment';
  examples: string[];
  confidence: number; // 0-100
  usageCount: number;
  lastUsed: string;
}

export interface KnowledgeEntry {
  id: string;
  topic: string;
  content: string;
  source: string;
  learnedAt: string;
  relevanceScore: number;
  tags: string[];
}

export interface LearningGoal {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  startedAt: string;
  completedAt?: string;
  outcomes: string[];
}

export class SelfLearningSystem {
  private config: MimoConfig;
  private skillsFile: string;
  private knowledgeFile: string;
  private goalsFile: string;
  private skills: LearnedSkill[] = [];
  private knowledge: KnowledgeEntry[] = [];
  private goals: LearningGoal[] = [];

  constructor(config: MimoConfig) {
    this.config = config;
    this.skillsFile = path.join(process.cwd(), '.mimo', 'learned-skills.json');
    this.knowledgeFile = path.join(process.cwd(), '.mimo', 'knowledge-base.json');
    this.goalsFile = path.join(process.cwd(), '.mimo', 'learning-goals.json');
  }

  /**
   * 初始化学习系统
   */
  async init(): Promise<void> {
    try {
      await fs.mkdir(path.join(process.cwd(), '.mimo'), { recursive: true });
      await this.loadData();
      printSuccess('自主学习系统初始化完成');
    } catch {
      printInfo('初始化学习系统...');
      this.skills = [];
      this.knowledge = [];
      this.goals = [];
    }
  }

  /**
   * 加载学习数据
   */
  private async loadData(): Promise<void> {
    try {
      const skillsData = await fs.readFile(this.skillsFile, 'utf-8');
      this.skills = JSON.parse(skillsData);
    } catch {
      this.skills = [];
    }

    try {
      const knowledgeData = await fs.readFile(this.knowledgeFile, 'utf-8');
      this.knowledge = JSON.parse(knowledgeData);
    } catch {
      this.knowledge = [];
    }

    try {
      const goalsData = await fs.readFile(this.goalsFile, 'utf-8');
      this.goals = JSON.parse(goalsData);
    } catch {
      this.goals = [];
    }
  }

  /**
   * 保存学习数据
   */
  async saveData(): Promise<void> {
    try {
      await fs.writeFile(this.skillsFile, JSON.stringify(this.skills, null, 2), 'utf-8');
      await fs.writeFile(this.knowledgeFile, JSON.stringify(this.knowledge, null, 2), 'utf-8');
      await fs.writeFile(this.goalsFile, JSON.stringify(this.goals, null, 2), 'utf-8');
    } catch (err: any) {
      printWarning(`保存学习数据失败: ${err.message}`);
    }
  }

  /**
   * 学习新技能
   */
  async learnSkill(skill: Omit<LearnedSkill, 'id' | 'learnedAt' | 'usageCount' | 'lastUsed'>): Promise<LearnedSkill> {
    const newSkill: LearnedSkill = {
      ...skill,
      id: `skill-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      learnedAt: new Date().toISOString(),
      usageCount: 0,
      lastUsed: new Date().toISOString(),
    };

    // 检查是否已存在相似技能
    const existingIndex = this.skills.findIndex(s =>
      s.name.toLowerCase() === skill.name.toLowerCase() ||
      s.category === skill.category && s.description.includes(skill.description.substring(0, 50))
    );

    if (existingIndex >= 0) {
      // 更新现有技能
      this.skills[existingIndex] = {
        ...this.skills[existingIndex],
        ...newSkill,
        id: this.skills[existingIndex].id,
        usageCount: this.skills[existingIndex].usageCount,
        confidence: Math.min(100, this.skills[existingIndex].confidence + 10),
      };
      printSuccess(`更新技能: ${skill.name}`);
      await this.saveData();
      return this.skills[existingIndex];
    }

    this.skills.push(newSkill);
    printSuccess(`学习新技能: ${skill.name} (${skill.category})`);
    await this.saveData();
    return newSkill;
  }

  /**
   * 使用技能（更新使用统计）
   */
  async useSkill(skillId: string): Promise<void> {
    const skill = this.skills.find(s => s.id === skillId);
    if (skill) {
      skill.usageCount++;
      skill.lastUsed = new Date().toISOString();
      skill.confidence = Math.min(100, skill.confidence + 5);
      await this.saveData();
    }
  }

  /**
   * 添加知识条目
   */
  async addKnowledge(entry: Omit<KnowledgeEntry, 'id' | 'learnedAt'>): Promise<KnowledgeEntry> {
    const newEntry: KnowledgeEntry = {
      ...entry,
      id: `knowledge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      learnedAt: new Date().toISOString(),
    };

    // 检查是否已存在相似知识
    const existingIndex = this.knowledge.findIndex(k =>
      k.topic.toLowerCase() === entry.topic.toLowerCase()
    );

    if (existingIndex >= 0) {
      // 更新现有知识
      this.knowledge[existingIndex] = {
        ...this.knowledge[existingIndex],
        ...newEntry,
        id: this.knowledge[existingIndex].id,
        relevanceScore: Math.min(100, this.knowledge[existingIndex].relevanceScore + 10),
      };
      printSuccess(`更新知识: ${entry.topic}`);
      await this.saveData();
      return this.knowledge[existingIndex];
    }

    this.knowledge.push(newEntry);
    printSuccess(`添加知识: ${entry.topic}`);
    await this.saveData();
    return newEntry;
  }

  /**
   * 创建学习目标
   */
  async createGoal(description: string): Promise<LearningGoal> {
    const goal: LearningGoal = {
      id: `goal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      description,
      status: 'pending',
      progress: 0,
      startedAt: new Date().toISOString(),
      outcomes: [],
    };

    this.goals.push(goal);
    printSuccess(`创建学习目标: ${description}`);
    await this.saveData();
    return goal;
  }

  /**
   * 更新学习目标进度
   */
  async updateGoal(goalId: string, progress: number, outcome?: string): Promise<void> {
    const goal = this.goals.find(g => g.id === goalId);
    if (goal) {
      goal.progress = Math.min(100, progress);
      if (outcome) {
        goal.outcomes.push(outcome);
      }
      if (progress >= 100) {
        goal.status = 'completed';
        goal.completedAt = new Date().toISOString();
        printSuccess(`完成学习目标: ${goal.description}`);
      } else if (progress > 0) {
        goal.status = 'in_progress';
      }
      await this.saveData();
    }
  }

  /**
   * 搜索技能
   */
  searchSkills(query: string): LearnedSkill[] {
    const queryLower = query.toLowerCase();

    return this.skills.filter(skill => {
      const searchText = [
        skill.name,
        skill.category,
        skill.description,
        ...skill.examples,
      ].join(' ').toLowerCase();

      return searchText.includes(queryLower);
    });
  }

  /**
   * 获取相关技能
   */
  getRelatedSkills(category: string): LearnedSkill[] {
    return this.skills.filter(s => s.category === category);
  }

  /**
   * 获取高置信度技能
   */
  getHighConfidenceSkills(minConfidence: number = 70): LearnedSkill[] {
    return this.skills.filter(s => s.confidence >= minConfidence);
  }

  /**
   * 获取最常用技能
   */
  getMostUsedSkills(limit: number = 10): LearnedSkill[] {
    return [...this.skills]
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  }

  /**
   * 搜索知识库
   */
  searchKnowledge(query: string): KnowledgeEntry[] {
    const queryLower = query.toLowerCase();

    return this.knowledge.filter(entry => {
      const searchText = [
        entry.topic,
        entry.content,
        entry.source,
        ...entry.tags,
      ].join(' ').toLowerCase();

      return searchText.includes(queryLower);
    });
  }

  /**
   * 获取相关知识
   */
  getRelatedKnowledge(topic: string): KnowledgeEntry[] {
    const topicLower = topic.toLowerCase();

    return this.knowledge.filter(entry =>
      entry.topic.toLowerCase().includes(topicLower) ||
      entry.tags.some(tag => tag.toLowerCase().includes(topicLower))
    ).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * 获取学习目标列表
   */
  getGoals(status?: LearningGoal['status']): LearningGoal[] {
    if (status) {
      return this.goals.filter(g => g.status === status);
    }
    return this.goals;
  }

  /**
   * 生成学习报告
   */
  generateLearningReport(): string {
    const totalSkills = this.skills.length;
    const totalKnowledge = this.knowledge.length;
    const totalGoals = this.goals.length;
    const completedGoals = this.goals.filter(g => g.status === 'completed').length;
    const highConfidenceSkills = this.getHighConfidenceSkills().length;

    const categoryStats: Record<string, number> = {};
    for (const skill of this.skills) {
      categoryStats[skill.category] = (categoryStats[skill.category] || 0) + 1;
    }

    let report = `\n  ${ORANGE('📚 学习报告')}\n`;
    report += `  ${GRAY('─'.repeat(40))}\n\n`;
    report += `  ${GREEN('●')} 技能: ${totalSkills} 个 (高置信度: ${highConfidenceSkills})\n`;
    report += `  ${GREEN('●')} 知识: ${totalKnowledge} 条\n`;
    report += `  ${GREEN('●')} 目标: ${totalGoals} 个 (已完成: ${completedGoals})\n\n`;

    if (Object.keys(categoryStats).length > 0) {
      report += `  ${ORANGE('技能分类:')}\n`;
      for (const [category, count] of Object.entries(categoryStats).sort(([, a], [, b]) => b - a)) {
        report += `    ${GRAY('•')} ${category}: ${count} 个\n`;
      }
    }

    const topSkills = this.getMostUsedSkills(5);
    if (topSkills.length > 0) {
      report += `\n  ${ORANGE('最常用技能:')}\n`;
      for (const skill of topSkills) {
        report += `    ${GRAY('•')} ${skill.name}: ${skill.usageCount} 次 (置信度: ${skill.confidence}%)\n`;
      }
    }

    return report;
  }

  /**
   * 获取技能数量
   */
  getSkillCount(): number {
    return this.skills.length;
  }

  /**
   * 获取知识数量
   */
  getKnowledgeCount(): number {
    return this.knowledge.length;
  }

  /**
   * 清理过期数据
   */
  async cleanup(maxAgeDays: number = 90): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
    const cutoffTime = cutoffDate.toISOString();

    // 清理低置信度且长期未使用的技能
    this.skills = this.skills.filter(skill => {
      if (skill.confidence < 30 && skill.lastUsed < cutoffTime) {
        return false;
      }
      return true;
    });

    // 清理低相关性的知识
    this.knowledge = this.knowledge.filter(entry => {
      if (entry.relevanceScore < 20 && entry.learnedAt < cutoffTime) {
        return false;
      }
      return true;
    });

    await this.saveData();
    printInfo(`清理完成，保留 ${this.skills.length} 个技能和 ${this.knowledge.length} 条知识`);
  }
}
