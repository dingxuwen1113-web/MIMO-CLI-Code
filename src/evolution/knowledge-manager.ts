/**
 * Knowledge Manager - 知识库管理器
 *
 * 协调知识库和agents之间的交互
 * 管理知识的获取、学习和应用
 */

import { MimoConfig } from '../config/schema';
import { AgentKnowledgeBase, KnowledgeItem, AgentUpgradeRecord } from './knowledge-base';
import { ExpertAgent, EXPERT_AGENTS } from './experts';
import { printInfo, printSuccess, printWarning, ORANGE, GRAY, GREEN, CYAN } from '../tui/output';

export interface KnowledgeSource {
  id: string;
  name: string;
  type: 'web' | 'code' | 'docs' | 'expert' | 'user';
  url?: string;
  description: string;
}

export class KnowledgeManager {
  private config: MimoConfig;
  private knowledgeBase: AgentKnowledgeBase;
  private sources: Map<string, KnowledgeSource> = new Map();
  private isInitialized: boolean = false;

  constructor(config: MimoConfig) {
    this.config = config;
    this.knowledgeBase = new AgentKnowledgeBase(config);

    // 注册默认知识源
    this.registerDefaultSources();
  }

  /**
   * 初始化知识管理器
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.knowledgeBase.init();
      await this.loadInitialKnowledge();
      this.isInitialized = true;
      printSuccess('知识管理器初始化完成');
    } catch (err: any) {
      printWarning(`知识管理器初始化失败: ${err.message}`);
    }
  }

  /**
   * 注册默认知识源
   */
  private registerDefaultSources(): void {
    const defaultSources: KnowledgeSource[] = [
      {
        id: 'web-learn',
        name: 'Web学习',
        type: 'web',
        description: '从网络学习最新的编程知识和最佳实践',
      },
      {
        id: 'code-analysis',
        name: '代码分析',
        type: 'code',
        description: '从项目代码中提取模式和最佳实践',
      },
      {
        id: 'docs-reader',
        name: '文档阅读',
        type: 'docs',
        description: '从技术文档中学习',
      },
      {
        id: 'expert-knowledge',
        name: '专家知识',
        type: 'expert',
        description: '从行业专家的知识中学习',
      },
      {
        id: 'user-interaction',
        name: '用户交互',
        type: 'user',
        description: '从用户交互中学习',
      },
    ];

    for (const source of defaultSources) {
      this.sources.set(source.id, source);
    }
  }

  /**
   * 加载初始知识
   */
  private async loadInitialKnowledge(): Promise<void> {
    // 检查是否已有知识
    const stats = this.knowledgeBase.getStats();
    if (stats.totalItems > 0) {
      printInfo(`知识库已有 ${stats.totalItems} 条知识`);
      return;
    }

    printInfo('加载初始知识库...');

    // 从专家系统加载知识
    await this.loadFromExperts();

    // 加载通用编程知识
    await this.loadGeneralKnowledge();

    printSuccess('初始知识库加载完成');
  }

  /**
   * 从专家系统加载知识
   */
  private async loadFromExperts(): Promise<void> {
    for (const expert of EXPERT_AGENTS) {
      try {
        // 提取专家的核心知识
        const knowledgeItems = this.extractExpertKnowledge(expert);

        for (const item of knowledgeItems) {
          await this.knowledgeBase.addKnowledge(item);
        }
      } catch (err: any) {
        printWarning(`加载专家 ${expert.name} 知识失败: ${err.message}`);
      }
    }
  }

  /**
   * 从专家中提取知识
   */
  private extractExpertKnowledge(expert: ExpertAgent): Array<Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>> {
    const items: Array<Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>> = [];

    // 1. 核心专业知识
    items.push({
      title: `${expert.name} 核心知识`,
      category: expert.industry,
      content: expert.systemPrompt.substring(0, 1000),
      tags: expert.expertise,
      source: 'expert',
      relevanceScore: 80,
      metadata: {
        expertId: expert.id,
        industryKey: expert.industryKey,
        type: 'core_knowledge',
      },
    });

    // 2. 最佳实践
    items.push({
      title: `${expert.industry} 最佳实践`,
      category: expert.industry,
      content: this.extractBestPractices(expert.systemPrompt),
      tags: [...expert.expertise, 'best_practices'],
      source: 'expert',
      relevanceScore: 75,
      metadata: {
        expertId: expert.id,
        type: 'best_practices',
      },
    });

    // 3. 工具和技术
    items.push({
      title: `${expert.industry} 工具和技术`,
      category: expert.industry,
      content: `专业工具: ${expert.expertise.join(', ')}`,
      tags: expert.expertise,
      source: 'expert',
      relevanceScore: 70,
      metadata: {
        expertId: expert.id,
        type: 'tools_and_technologies',
      },
    });

    return items;
  }

  /**
   * 从系统提示词中提取最佳实践
   */
  private extractBestPractices(systemPrompt: string): string {
    const lines = systemPrompt.split('\n');
    const bestPractices: string[] = [];
    let inBestPractices = false;

    for (const line of lines) {
      if (line.includes('最佳实践') || line.includes('Best Practice') || line.includes('原则')) {
        inBestPractices = true;
        continue;
      }

      if (inBestPractices && (line.startsWith('- ') || line.startsWith('* ') || line.match(/^\d+\./))) {
        bestPractices.push(line);
      }

      if (inBestPractices && line.trim() === '') {
        break;
      }
    }

    return bestPractices.length > 0
      ? bestPractices.join('\n')
      : '遵循行业标准和最佳实践';
  }

  /**
   * 加载通用编程知识
   */
  private async loadGeneralKnowledge(): Promise<void> {
    const generalKnowledge: Array<Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>> = [
      {
        title: '代码质量最佳实践',
        category: '软件工程',
        content: `# 代码质量最佳实践

## SOLID原则
1. **单一职责原则** - 一个类应该只有一个引起变化的原因
2. **开放封闭原则** - 对扩展开放，对修改封闭
3. **里氏替换原则** - 子类必须能够替换其基类
4. **接口隔离原则** - 不应该强迫客户依赖它们不使用的接口
5. **依赖倒置原则** - 依赖于抽象而不是具体实现

## DRY原则
- Don't Repeat Yourself
- 避免代码重复
- 提取公共逻辑

## KISS原则
- Keep It Simple, Stupid
- 保持代码简单
- 避免过度设计`,
        tags: ['SOLID', 'DRY', 'KISS', '代码质量', '软件工程'],
        source: 'docs',
        relevanceScore: 90,
        metadata: { type: 'principle' },
      },
      {
        title: '性能优化策略',
        category: '性能工程',
        content: `# 性能优化策略

## 前端性能
1. 代码分割和懒加载
2. 图片优化（WebP、懒加载）
3. 缓存策略（浏览器缓存、CDN）
4. 减少HTTP请求
5. 使用Web Workers

## 后端性能
1. 数据库查询优化
2. 索引优化
3. 缓存策略（Redis、内存缓存）
4. 异步处理
5. 负载均衡

## 监控指标
- 响应时间
- 吞吐量
- 错误率
- 资源使用率`,
        tags: ['性能优化', '前端', '后端', '缓存', '数据库'],
        source: 'docs',
        relevanceScore: 85,
        metadata: { type: 'technique' },
      },
      {
        title: '安全编码指南',
        category: '安全',
        content: `# 安全编码指南

## 输入验证
- 始终验证用户输入
- 使用白名单而非黑名单
- 参数化查询防止SQL注入
- 输出编码防止XSS

## 认证授权
- 使用强密码策略
- 实施多因素认证
- 最小权限原则
- 会话管理安全

## 数据保护
- 加密敏感数据
- 使用HTTPS
- 安全的密钥管理
- 定期安全审计`,
        tags: ['安全', '输入验证', '认证', '加密', 'OWASP'],
        source: 'docs',
        relevanceScore: 88,
        metadata: { type: 'guideline' },
      },
    ];

    for (const item of generalKnowledge) {
      await this.knowledgeBase.addKnowledge(item);
    }
  }

  /**
   * 为Agent推荐知识
   */
  recommendForAgent(agentId: string, agentIndustry: string, agentExpertise: string[]): KnowledgeItem[] {
    return this.knowledgeBase.recommendKnowledgeForAgent(agentId, agentIndustry, agentExpertise);
  }

  /**
   * Agent学习知识
   */
  async agentLearn(
    agentId: string,
    knowledgeId: string,
    upgradeType: AgentUpgradeRecord['upgradeType'],
    description: string
  ): Promise<AgentUpgradeRecord> {
    return this.knowledgeBase.upgradeAgent(agentId, knowledgeId, upgradeType, description);
  }

  /**
   * 从网页学习
   */
  async learnFromWeb(url: string, content: string, title: string, category: string): Promise<void> {
    const item: Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
      title,
      category,
      content: content.substring(0, 2000),
      tags: this.extractTagsFromContent(content),
      source: 'web',
      relevanceScore: this.calculateRelevance(content, category),
      metadata: {
        url,
        learnedAt: new Date().toISOString(),
      },
    };

    await this.knowledgeBase.addKnowledge(item);
  }

  /**
   * 从代码中学习
   */
  async learnFromCode(filePath: string, content: string, patterns: string[]): Promise<void> {
    const item: Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
      title: `代码模式: ${filePath}`,
      category: '代码模式',
      content: patterns.join('\n'),
      tags: ['code', 'pattern', ...patterns.slice(0, 5)],
      source: 'code',
      relevanceScore: 70,
      metadata: {
        filePath,
        patterns,
        learnedAt: new Date().toISOString(),
      },
    };

    await this.knowledgeBase.addKnowledge(item);
  }

  /**
   * 从内容中提取标签
   */
  private extractTagsFromContent(content: string): string[] {
    const tags: string[] = [];
    const contentLower = content.toLowerCase();

    // 常见技术关键词
    const keywords = [
      'react', 'vue', 'angular', 'node', 'express', 'typescript', 'javascript',
      'python', 'java', 'golang', 'rust', 'docker', 'kubernetes', 'aws', 'azure',
      'database', 'sql', 'nosql', 'api', 'rest', 'graphql', 'microservices',
      'testing', 'ci/cd', 'devops', 'security', 'performance', 'optimization',
    ];

    for (const keyword of keywords) {
      if (contentLower.includes(keyword)) {
        tags.push(keyword);
      }
    }

    return [...new Set(tags)].slice(0, 10);
  }

  /**
   * 计算内容相关性
   */
  private calculateRelevance(content: string, category: string): number {
    let score = 50;

    // 内容长度加分
    if (content.length > 500) score += 10;
    if (content.length > 1000) score += 10;

    // 包含代码示例加分
    if (content.includes('```')) score += 15;

    // 包含最佳实践加分
    if (content.toLowerCase().includes('best practice')) score += 10;

    return Math.min(100, score);
  }

  /**
   * 搜索知识
   */
  search(query: string, category?: string): KnowledgeItem[] {
    return this.knowledgeBase.searchKnowledge(query, category);
  }

  /**
   * 获取知识详情
   */
  getKnowledge(id: string): KnowledgeItem | null {
    return this.knowledgeBase.getKnowledge(id);
  }

  /**
   * 获取Agent升级历史
   */
  getAgentUpgrades(agentId: string): AgentUpgradeRecord[] {
    return this.knowledgeBase.getAgentUpgrades(agentId);
  }

  /**
   * 获取知识库统计
   */
  getStats() {
    return this.knowledgeBase.getStats();
  }

  /**
   * 生成报告
   */
  generateReport(): string {
    return this.knowledgeBase.generateReport();
  }

  /**
   * 导出知识库
   */
  async exportKnowledge(format: 'json' | 'markdown' = 'json'): Promise<string> {
    return this.knowledgeBase.exportKnowledge(format);
  }

  /**
   * 导入知识
   */
  async importKnowledge(items: Array<Omit<KnowledgeItem, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>>): Promise<number> {
    return this.knowledgeBase.importKnowledge(items);
  }

  /**
   * 获取知识库实例
   */
  getKnowledgeBase(): AgentKnowledgeBase {
    return this.knowledgeBase;
  }

  /**
   * 获取所有类别
   */
  getCategories(): string[] {
    return this.knowledgeBase.getCategories();
  }

  /**
   * 获取所有标签
   */
  getTags(): string[] {
    return this.knowledgeBase.getTags();
  }

  /**
   * 清理知识库
   */
  async cleanup(): Promise<void> {
    await this.knowledgeBase.cleanup();
  }
}
