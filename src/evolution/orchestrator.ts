/**
 * Evolution Orchestrator - 进化协调器
 *
 * 协调自主进化、专家调度和自我学习系统
 */

import { MimoConfig } from '../config/schema';
import { EvolutionAgent } from './agent';
import { ExpertDispatcher } from './dispatcher';
import { SelfLearningSystem, LearnedSkill, KnowledgeEntry } from './self-learning';
import { WebLearningModule } from './web-learning';
import { KnowledgeManager } from './knowledge-manager';
import { ExpertAgent, EXPERT_AGENTS } from './experts';
import { printInfo, printSuccess, printWarning, ORANGE, GRAY, GREEN, CYAN } from '../tui/output';

export interface EvolutionConfig {
  enabled: boolean;
  autoLearn: boolean;
  autoUpdateReadme: boolean;
  learningInterval: number; // 分钟
  maxSkills: number;
  maxKnowledge: number;
}

export class EvolutionOrchestrator {
  private config: MimoConfig;
  private evolutionAgent: EvolutionAgent;
  private expertDispatcher: ExpertDispatcher;
  private selfLearning: SelfLearningSystem;
  private webLearning: WebLearningModule;
  private knowledgeManager: KnowledgeManager;
  private evolutionConfig: EvolutionConfig;
  private isInitialized: boolean = false;

  constructor(config: MimoConfig) {
    this.config = config;
    this.evolutionAgent = new EvolutionAgent(config);
    this.expertDispatcher = new ExpertDispatcher(config);
    this.selfLearning = new SelfLearningSystem(config);
    this.webLearning = new WebLearningModule(config);
    this.knowledgeManager = new KnowledgeManager(config);

    this.evolutionConfig = {
      enabled: true,
      autoLearn: true,
      autoUpdateReadme: true,
      learningInterval: 60, // 每小时学习一次
      maxSkills: 1000,
      maxKnowledge: 5000,
    };
  }

  /**
   * 初始化进化系统
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    console.log(`\n  ${ORANGE('🧬')} ${ORANGE('Evolution Orchestrator')} - 进化协调系统启动\n`);

    try {
      // 初始化所有子系统
      await this.evolutionAgent.init();
      await this.selfLearning.init();
      await this.knowledgeManager.init();

      this.isInitialized = true;
      printSuccess('进化协调系统初始化完成');
    } catch (err: any) {
      printWarning(`进化系统初始化失败: ${err.message}`);
    }
  }

  /**
   * 启动完整进化流程
   */
  async startFullEvolution(): Promise<void> {
    if (!this.evolutionConfig.enabled) {
      printInfo('进化系统已禁用');
      return;
    }

    console.log(`\n  ${ORANGE('▶')} 启动完整进化流程...\n`);

    // 阶段1: 自主进化
    await this.evolutionAgent.startEvolution();

    // 阶段2: 专家知识学习（含行业网页学习）
    await this.learnFromExperts();

    // 阶段3: 技能积累
    await this.accumulateSkills();

    // 阶段4: 知识库构建
    await this.buildKnowledgeBase();

    // 保存所有学习成果
    await this.selfLearning.saveData();

    console.log(`\n  ${GREEN('✓')} 完整进化流程完成\n`);
  }

  /**
   * 从专家学习（含行业限制的网页学习）
   */
  private async learnFromExperts(): Promise<void> {
    printInfo('👨‍🏫 阶段2: 从专家学习（含网页学习）...');

    for (const expert of EXPERT_AGENTS) {
      try {
        // 学习专家的核心知识
        const skill: Omit<LearnedSkill, 'id' | 'learnedAt' | 'usageCount' | 'lastUsed'> = {
          name: `${expert.name} 核心知识`,
          category: expert.industry,
          description: expert.description,
          source: 'code',
          examples: expert.expertise.slice(0, 3),
          confidence: 60,
        };

        await this.selfLearning.learnSkill(skill);

        // 添加专家知识到知识库
        const knowledge: Omit<KnowledgeEntry, 'id' | 'learnedAt'> = {
          topic: `${expert.industry} - ${expert.name}`,
          content: expert.systemPrompt.substring(0, 500),
          source: 'expert-system',
          relevanceScore: 80,
          tags: expert.expertise,
        };

        await this.selfLearning.addKnowledge(knowledge);

        // 行业网页学习 - 只学习该专家行业相关的内容
        await this.learnFromIndustryWeb(expert);
      } catch (err: any) {
        printWarning(`学习专家 ${expert.name} 失败: ${err.message}`);
      }
    }

    printSuccess(`从 ${EXPERT_AGENTS.length} 位专家学习完成`);
  }

  /**
   * 从行业网页学习 - 严格限制只能访问本行业内容
   */
  private async learnFromIndustryWeb(expert: ExpertAgent): Promise<void> {
    if (!expert.industryKey || !expert.learningTopics || expert.learningTopics.length === 0) {
      return;
    }

    printInfo(`  🌐 ${expert.name} 正在学习行业网页...`);

    // 生成行业相关的搜索查询
    const queries = this.webLearning.generateSearchQueries(expert.industryKey);
    if (queries.length === 0) {
      return;
    }

    // 学习前3个主题
    for (const topic of expert.learningTopics.slice(0, 3)) {
      try {
        // 生成模拟的网页内容（实际环境中会使用web_search和web_fetch）
        const mockContent = this.generateMockWebContent(topic, expert.industry);
        const mockUrl = `https://${expert.allowedDomains[0] || 'example.com'}/learn/${topic.toLowerCase().replace(/\s+/g, '-')}`;

        // 验证URL是否属于该行业
        if (this.webLearning.isUrlAllowedForIndustry(mockUrl, expert.industryKey)) {
          await this.webLearning.learnFromWeb(
            expert.industryKey,
            mockUrl,
            mockContent,
            `${topic} - ${expert.industry} 最佳实践`
          );
        }
      } catch (err: any) {
        // 网页学习失败不影响主流程
      }
    }
  }

  /**
   * 生成模拟网页内容（实际环境中会调用web_fetch）
   */
  private generateMockWebContent(topic: string, industry: string): string {
    return `
# ${topic} 最佳实践 - ${industry}

## 概述
本文介绍${industry}领域中${topic}的最新最佳实践和优化技巧。

## 核心要点
1. 性能优化策略
2. 代码质量保证
3. 架构设计原则
4. 安全性考虑
5. 可维护性

## 实际案例
通过实际案例学习如何应用这些最佳实践。

## 总结
掌握${topic}的核心概念和最佳实践，提升${industry}开发能力。
    `.trim();
  }

  /**
   * 积累技能
   */
  private async accumulateSkills(): Promise<void> {
    printInfo('🎯 阶段3: 积累技能...');

    // 从当前项目中提取技能
    const projectSkills = this.extractProjectSkills();

    for (const skill of projectSkills) {
      await this.selfLearning.learnSkill(skill);
    }

    printSuccess(`积累了 ${projectSkills.length} 个项目技能`);
  }

  /**
   * 从项目中提取技能
   */
  private extractProjectSkills(): Array<Omit<LearnedSkill, 'id' | 'learnedAt' | 'usageCount' | 'lastUsed'>> {
    const skills: Array<Omit<LearnedSkill, 'id' | 'learnedAt' | 'usageCount' | 'lastUsed'>> = [];

    // 基于项目结构提取技能
    const cwd = process.cwd();

    // TypeScript技能
    skills.push({
      name: 'TypeScript 开发',
      category: '编程语言',
      description: '使用TypeScript进行类型安全的开发',
      source: 'code',
      examples: ['类型注解', '接口定义', '泛型'],
      confidence: 90,
    });

    // Node.js技能
    skills.push({
      name: 'Node.js 后端开发',
      category: '后端开发',
      description: '使用Node.js构建后端服务',
      source: 'code',
      examples: ['Express', '异步编程', '流处理'],
      confidence: 85,
    });

    // CLI开发技能
    skills.push({
      name: 'CLI 工具开发',
      category: '工具开发',
      description: '构建命令行工具和交互式界面',
      source: 'code',
      examples: ['Commander.js', 'Inquirer', 'Chalk'],
      confidence: 80,
    });

    // AI集成技能
    skills.push({
      name: 'AI SDK 集成',
      category: '人工智能',
      description: '集成Anthropic Claude API',
      source: 'code',
      examples: ['Anthropic SDK', '工具调用', '流式响应'],
      confidence: 75,
    });

    return skills;
  }

  /**
   * 构建知识库
   */
  private async buildKnowledgeBase(): Promise<void> {
    printInfo('📚 阶段4: 构建知识库...');

    // 添加编程最佳实践
    const bestPractices = [
      {
        topic: '代码质量最佳实践',
        content: '遵循SOLID原则、DRY原则、KISS原则。编写清晰、可维护的代码。',
        source: 'knowledge-base',
        relevanceScore: 90,
        tags: ['代码质量', '最佳实践', '编程原则'],
      },
      {
        topic: 'TypeScript 类型安全',
        content: '使用严格的类型检查、避免any、使用泛型提高代码复用性。',
        source: 'knowledge-base',
        relevanceScore: 85,
        tags: ['TypeScript', '类型安全', '编程'],
      },
      {
        topic: '性能优化策略',
        content: '使用缓存、减少数据库查询、优化算法复杂度、使用CDN。',
        source: 'knowledge-base',
        relevanceScore: 80,
        tags: ['性能优化', '最佳实践'],
      },
    ];

    for (const practice of bestPractices) {
      await this.selfLearning.addKnowledge(practice);
    }

    printSuccess('知识库构建完成');
  }

  /**
   * 处理用户请求（自动匹配专家）
   */
  async processRequest(request: string): Promise<{
    expert: ExpertAgent | null;
    systemPrompt: string | null;
    recommendations: ExpertAgent[];
  }> {
    // 匹配专家
    const expert = this.expertDispatcher.matchExpert(request);

    // 获取专家系统提示词
    const systemPrompt = expert ? this.expertDispatcher.getExpertSystemPrompt(expert.id) : null;

    // 获取推荐专家
    const recommendations = this.expertDispatcher.getRecommendations(request);

    // 如果匹配到专家，记录使用
    if (expert) {
      this.expertDispatcher.recordUsage(expert.id, request);
      await this.expertDispatcher.activateExpert(expert);
    }

    return {
      expert,
      systemPrompt,
      recommendations,
    };
  }

  /**
   * 学习新技能（从用户交互中）
   */
  async learnFromInteraction(task: string, outcome: 'success' | 'failure'): Promise<void> {
    if (!this.evolutionConfig.autoLearn) return;

    // 分析任务类型
    const taskType = this.analyzeTaskType(task);

    // 学习技能
    const skill: Omit<LearnedSkill, 'id' | 'learnedAt' | 'usageCount' | 'lastUsed'> = {
      name: `${taskType} 处理`,
      category: taskType,
      description: `处理 ${taskType} 类型的任务`,
      source: 'user',
      examples: [task.substring(0, 100)],
      confidence: outcome === 'success' ? 70 : 30,
    };

    await this.selfLearning.learnSkill(skill);

    // 更新相关学习目标
    const relatedGoals = this.selfLearning.getGoals('in_progress');
    for (const goal of relatedGoals) {
      if (goal.description.toLowerCase().includes(taskType.toLowerCase())) {
        const newProgress = Math.min(100, goal.progress + 10);
        await this.selfLearning.updateGoal(goal.id, newProgress, `完成任务: ${task.substring(0, 50)}`);
      }
    }
  }

  /**
   * 分析任务类型
   */
  private analyzeTaskType(task: string): string {
    const taskLower = task.toLowerCase();

    const typeKeywords: Record<string, string[]> = {
      '前端开发': ['react', 'vue', 'angular', 'css', 'html', '前端', 'ui', 'component'],
      '后端开发': ['api', 'server', 'database', 'backend', '后端', '接口'],
      'DevOps': ['docker', 'deploy', 'ci/cd', 'kubernetes', '部署'],
      '测试': ['test', 'testing', 'jest', 'cypress', '测试'],
      '安全': ['security', 'vulnerability', '安全', '漏洞'],
      '性能优化': ['performance', 'optimize', '性能', '优化'],
      '文档': ['documentation', 'readme', 'docs', '文档'],
      '重构': ['refactor', 'cleanup', '重构', '优化代码'],
      '调试': ['debug', 'fix', 'error', 'bug', '调试', '修复'],
    };

    for (const [type, keywords] of Object.entries(typeKeywords)) {
      for (const keyword of keywords) {
        if (taskLower.includes(keyword)) {
          return type;
        }
      }
    }

    return '通用编程';
  }

  /**
   * 获取专家调度器
   */
  getExpertDispatcher(): ExpertDispatcher {
    return this.expertDispatcher;
  }

  /**
   * 获取自我学习系统
   */
  getSelfLearningSystem(): SelfLearningSystem {
    return this.selfLearning;
  }

  /**
   * 获取进化Agent
   */
  getEvolutionAgent(): EvolutionAgent {
    return this.evolutionAgent;
  }

  /**
   * 生成综合报告
   */
  generateComprehensiveReport(): string {
    let report = `\n  ${ORANGE('🧬')} ${ORANGE('MIMO 进化系统综合报告')}\n`;
    report += `  ${GRAY('═'.repeat(50))}\n`;

    // 进化Agent状态
    const evolutionStatus = this.evolutionAgent.getStatus();
    report += `\n  ${CYAN('自主进化:')}\n`;
    report += `    记忆: ${evolutionStatus.memories} 条\n`;
    report += `    洞察: ${evolutionStatus.insights} 条\n`;

    // 专家系统状态
    report += this.expertDispatcher.generateSummary();

    // 学习系统状态
    report += this.selfLearning.generateLearningReport();

    report += `\n  ${GRAY('═'.repeat(50))}\n`;

    return report;
  }

  /**
   * 获取进化配置
   */
  getEvolutionConfig(): EvolutionConfig {
    return this.evolutionConfig;
  }

  /**
   * 更新进化配置
   */
  updateEvolutionConfig(config: Partial<EvolutionConfig>): void {
    this.evolutionConfig = {
      ...this.evolutionConfig,
      ...config,
    };
    printSuccess('进化配置已更新');
  }

  /**
   * 重置进化系统
   */
  async reset(): Promise<void> {
    this.evolutionAgent = new EvolutionAgent(this.config);
    this.selfLearning = new SelfLearningSystem(this.config);
    this.knowledgeManager = new KnowledgeManager(this.config);
    await this.init();
    printSuccess('进化系统已重置');
  }

  // ═══════════════════════════════════════════════════════════════
  // 知识库相关方法
  // ═══════════════════════════════════════════════════════════════

  /**
   * 获取知识管理器
   */
  getKnowledgeManager(): KnowledgeManager {
    return this.knowledgeManager;
  }

  /**
   * 为Agent推荐知识
   */
  recommendKnowledgeForAgent(agentId: string, industry: string, expertise: string[]) {
    return this.knowledgeManager.recommendForAgent(agentId, industry, expertise);
  }

  /**
   * Agent通过知识库升级
   */
  async upgradeAgentFromKnowledge(
    agentId: string,
    knowledgeId: string,
    upgradeType: 'skill' | 'pattern' | 'best_practice' | 'tool' | 'technique',
    description: string
  ) {
    return this.knowledgeManager.agentLearn(agentId, knowledgeId, upgradeType, description);
  }

  /**
   * 搜索知识库
   */
  searchKnowledge(query: string, category?: string) {
    return this.knowledgeManager.search(query, category);
  }

  /**
   * 添加知识到知识库
   */
  async addKnowledge(item: {
    title: string;
    category: string;
    content: string;
    tags: string[];
    source: string;
    relevanceScore: number;
    metadata?: Record<string, any>;
  }) {
    return this.knowledgeManager.getKnowledgeBase().addKnowledge({
      ...item,
      metadata: item.metadata || {},
    });
  }

  /**
   * 获取知识库统计
   */
  getKnowledgeStats() {
    return this.knowledgeManager.getStats();
  }

  /**
   * 生成知识库报告
   */
  generateKnowledgeReport(): string {
    return this.knowledgeManager.generateReport();
  }

  /**
   * 导出知识库
   */
  async exportKnowledge(format: 'json' | 'markdown' = 'json'): Promise<string> {
    return this.knowledgeManager.exportKnowledge(format);
  }

  /**
   * 导入知识
   */
  async importKnowledge(items: Array<any>): Promise<number> {
    return this.knowledgeManager.importKnowledge(items);
  }

  /**
   * Agent自动升级 - 从知识库学习
   */
  async autoUpgradeAgent(agentId: string, industry: string, expertise: string[]): Promise<void> {
    printInfo(`🤖 Agent ${agentId} 正在从知识库学习...`);

    // 获取推荐知识
    const recommended = this.recommendKnowledgeForAgent(agentId, industry, expertise);

    if (recommended.length === 0) {
      printInfo('没有可用的新知识');
      return;
    }

    // 学习前3个推荐知识
    let learned = 0;
    for (const knowledge of recommended.slice(0, 3)) {
      try {
        await this.upgradeAgentFromKnowledge(
          agentId,
          knowledge.id,
          'best_practice',
          `学习: ${knowledge.title}`
        );
        learned++;
      } catch (err: any) {
        printWarning(`学习失败: ${knowledge.title} - ${err.message}`);
      }
    }

    if (learned > 0) {
      printSuccess(`Agent ${agentId} 已学习 ${learned} 个新知识`);
    }
  }

  /**
   * 批量升级所有专家
   */
  async upgradeAllExperts(): Promise<void> {
    printInfo('🚀 批量升级所有专家...');

    for (const expert of EXPERT_AGENTS) {
      try {
        await this.autoUpgradeAgent(expert.id, expert.industry, expert.expertise);
      } catch (err: any) {
        printWarning(`升级专家 ${expert.name} 失败: ${err.message}`);
      }
    }

    printSuccess('所有专家升级完成');
  }
}
