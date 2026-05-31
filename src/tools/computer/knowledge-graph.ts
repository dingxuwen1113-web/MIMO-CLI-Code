/**
 * 知识图谱系统
 * 行业知识库、最佳实践、案例库
 */

// ── 类型定义 ─────────────────────────────────────────────────────────

export interface KnowledgeNode {
  id: string;
  type: 'concept' | 'skill' | 'tool' | 'method' | 'case' | 'best-practice';
  name: string;
  description: string;
  category: string;
  tags: string[];
  relations: KnowledgeRelation[];
  metadata: Record<string, any>;
}

export interface KnowledgeRelation {
  type: 'is-a' | 'has-part' | 'requires' | 'enables' | 'similar-to' | 'opposite-of' | 'used-in';
  targetId: string;
  weight: number; // 0-1, 关系强度
}

export interface KnowledgeQuery {
  query: string;
  category?: string;
  type?: string;
  tags?: string[];
  limit?: number;
}

export interface KnowledgeResult {
  nodes: KnowledgeNode[];
  paths: string[][];
  suggestions: string[];
  confidence: number;
}

// ── 知识图谱 ─────────────────────────────────────────────────────────

export class KnowledgeGraph {
  private nodes: Map<string, KnowledgeNode> = new Map();
  private categoryIndex: Map<string, string[]> = new Map();
  private tagIndex: Map<string, string[]> = new Map();

  constructor() {
    this.initializeKnowledge();
  }

  private initializeKnowledge(): void {
    // ── 软件开发知识 ───────────────────────────────────────────────

    this.addNode({
      id: 'programming',
      type: 'concept',
      name: '编程',
      description: '使用编程语言创建软件的过程',
      category: 'software-development',
      tags: ['coding', 'development', 'software'],
      relations: [
        { type: 'has-part', targetId: 'algorithms', weight: 0.9 },
        { type: 'has-part', targetId: 'data-structures', weight: 0.9 },
        { type: 'requires', targetId: 'logic', weight: 0.8 },
      ],
      metadata: { importance: 'core' },
    });

    this.addNode({
      id: 'algorithms',
      type: 'concept',
      name: '算法',
      description: '解决问题的步骤序列',
      category: 'computer-science',
      tags: ['algorithm', 'problem-solving', 'efficiency'],
      relations: [
        { type: 'is-a', targetId: 'programming', weight: 0.9 },
        { type: 'requires', targetId: 'mathematics', weight: 0.7 },
      ],
      metadata: { complexity: 'intermediate' },
    });

    this.addNode({
      id: 'data-structures',
      type: 'concept',
      name: '数据结构',
      description: '组织和存储数据的方式',
      category: 'computer-science',
      tags: ['data', 'structure', 'organization'],
      relations: [
        { type: 'is-a', targetId: 'programming', weight: 0.9 },
        { type: 'requires', targetId: 'algorithms', weight: 0.8 },
      ],
      metadata: { importance: 'core' },
    });

    this.addNode({
      id: 'design-patterns',
      type: 'best-practice',
      name: '设计模式',
      description: '解决常见软件设计问题的可重用方案',
      category: 'software-development',
      tags: ['pattern', 'design', 'architecture'],
      relations: [
        { type: 'used-in', targetId: 'object-oriented', weight: 0.9 },
        { type: 'enables', targetId: 'maintainability', weight: 0.8 },
      ],
      metadata: { patterns: ['singleton', 'factory', 'observer', 'strategy'] },
    });

    this.addNode({
      id: 'agile',
      type: 'method',
      name: '敏捷开发',
      description: '迭代和增量的软件开发方法',
      category: 'software-development',
      tags: ['agile', 'scrum', 'methodology'],
      relations: [
        { type: 'enables', targetId: 'flexibility', weight: 0.9 },
        { type: 'requires', targetId: 'teamwork', weight: 0.8 },
      ],
      metadata: { frameworks: ['scrum', 'kanban', 'xp'] },
    });

    // ── 数学知识 ───────────────────────────────────────────────────

    this.addNode({
      id: 'mathematics',
      type: 'concept',
      name: '数学',
      description: '研究数量、结构、变化和空间的学科',
      category: 'mathematics',
      tags: ['math', 'science', 'logic'],
      relations: [
        { type: 'has-part', targetId: 'algebra', weight: 0.9 },
        { type: 'has-part', targetId: 'calculus', weight: 0.9 },
        { type: 'has-part', targetId: 'statistics', weight: 0.9 },
      ],
      metadata: { importance: 'foundational' },
    });

    this.addNode({
      id: 'algebra',
      type: 'concept',
      name: '代数',
      description: '研究数学符号和规则的学科',
      category: 'mathematics',
      tags: ['algebra', 'equations', 'variables'],
      relations: [
        { type: 'is-a', targetId: 'mathematics', weight: 0.9 },
        { type: 'requires', targetId: 'arithmetic', weight: 0.7 },
      ],
      metadata: { topics: ['linear-algebra', 'abstract-algebra', 'polynomials'] },
    });

    this.addNode({
      id: 'calculus',
      type: 'concept',
      name: '微积分',
      description: '研究变化的数学分支',
      category: 'mathematics',
      tags: ['calculus', 'derivatives', 'integrals'],
      relations: [
        { type: 'is-a', targetId: 'mathematics', weight: 0.9 },
        { type: 'requires', targetId: 'algebra', weight: 0.8 },
      ],
      metadata: { topics: ['limits', 'derivatives', 'integrals', 'series'] },
    });

    this.addNode({
      id: 'statistics',
      type: 'concept',
      name: '统计学',
      description: '收集、分析、解释和呈现数据的学科',
      category: 'mathematics',
      tags: ['statistics', 'probability', 'data-analysis'],
      relations: [
        { type: 'is-a', targetId: 'mathematics', weight: 0.9 },
        { type: 'enables', targetId: 'data-science', weight: 0.9 },
      ],
      metadata: { topics: ['descriptive', 'inferential', 'probability'] },
    });

    // ── 商业知识 ───────────────────────────────────────────────────

    this.addNode({
      id: 'business-strategy',
      type: 'concept',
      name: '商业战略',
      description: '组织实现长期目标的计划',
      category: 'business',
      tags: ['strategy', 'business', 'planning'],
      relations: [
        { type: 'has-part', targetId: 'market-analysis', weight: 0.9 },
        { type: 'has-part', targetId: 'competitive-advantage', weight: 0.9 },
      ],
      metadata: { frameworks: ['porter-five-forces', 'swot', 'pestel'] },
    });

    this.addNode({
      id: 'marketing',
      type: 'concept',
      name: '市场营销',
      description: '推广和销售产品或服务的活动',
      category: 'business',
      tags: ['marketing', 'sales', 'promotion'],
      relations: [
        { type: 'requires', targetId: 'market-research', weight: 0.9 },
        { type: 'enables', targetId: 'revenue', weight: 0.8 },
      ],
      metadata: { channels: ['digital', 'traditional', 'social-media'] },
    });

    this.addNode({
      id: 'finance',
      type: 'concept',
      name: '金融',
      description: '管理资金和投资的学科',
      category: 'business',
      tags: ['finance', 'investment', 'banking'],
      relations: [
        { type: 'requires', targetId: 'mathematics', weight: 0.8 },
        { type: 'enables', targetId: 'wealth-creation', weight: 0.9 },
      ],
      metadata: { areas: ['corporate-finance', 'investments', 'banking'] },
    });

    // ── 创意设计知识 ───────────────────────────────────────────────

    this.addNode({
      id: 'design-thinking',
      type: 'method',
      name: '设计思维',
      description: '以用户为中心的创新方法',
      category: 'design',
      tags: ['design', 'innovation', 'user-centered'],
      relations: [
        { type: 'enables', targetId: 'innovation', weight: 0.9 },
        { type: 'requires', targetId: 'empathy', weight: 0.8 },
      ],
      metadata: { phases: ['empathize', 'define', 'ideate', 'prototype', 'test'] },
    });

    this.addNode({
      id: 'ui-ux',
      type: 'skill',
      name: 'UI/UX设计',
      description: '用户界面和用户体验设计',
      category: 'design',
      tags: ['ui', 'ux', 'design', 'user-experience'],
      relations: [
        { type: 'is-a', targetId: 'design-thinking', weight: 0.8 },
        { type: 'enables', targetId: 'user-satisfaction', weight: 0.9 },
      ],
      metadata: { tools: ['figma', 'sketch', 'adobe-xd'] },
    });

    // ── 人工智能知识 ───────────────────────────────────────────────

    this.addNode({
      id: 'artificial-intelligence',
      type: 'concept',
      name: '人工智能',
      description: '模拟人类智能的计算机系统',
      category: 'technology',
      tags: ['ai', 'machine-learning', 'deep-learning'],
      relations: [
        { type: 'has-part', targetId: 'machine-learning', weight: 0.9 },
        { type: 'has-part', targetId: 'natural-language-processing', weight: 0.8 },
        { type: 'requires', targetId: 'mathematics', weight: 0.9 },
      ],
      metadata: { subfields: ['ml', 'nlp', 'computer-vision', 'robotics'] },
    });

    this.addNode({
      id: 'machine-learning',
      type: 'skill',
      name: '机器学习',
      description: '让计算机从数据中学习的算法',
      category: 'technology',
      tags: ['ml', 'supervised', 'unsupervised', 'reinforcement'],
      relations: [
        { type: 'is-a', targetId: 'artificial-intelligence', weight: 0.9 },
        { type: 'requires', targetId: 'statistics', weight: 0.9 },
      ],
      metadata: { types: ['supervised', 'unsupervised', 'reinforcement'] },
    });

    this.addNode({
      id: 'deep-learning',
      type: 'skill',
      name: '深度学习',
      description: '使用神经网络的机器学习',
      category: 'technology',
      tags: ['dl', 'neural-networks', 'tensorflow', 'pytorch'],
      relations: [
        { type: 'is-a', targetId: 'machine-learning', weight: 0.9 },
        { type: 'requires', targetId: 'linear-algebra', weight: 0.8 },
      ],
      metadata: { architectures: ['cnn', 'rnn', 'transformer', 'gan'] },
    });

    this.addNode({
      id: 'natural-language-processing',
      type: 'skill',
      name: '自然语言处理',
      description: '让计算机理解和生成人类语言',
      category: 'technology',
      tags: ['nlp', 'text', 'language', 'chatbot'],
      relations: [
        { type: 'is-a', targetId: 'artificial-intelligence', weight: 0.8 },
        { type: 'requires', targetId: 'machine-learning', weight: 0.9 },
      ],
      metadata: { tasks: ['classification', 'translation', 'summarization', 'generation'] },
    });

    // ── 最佳实践 ───────────────────────────────────────────────────

    this.addNode({
      id: 'clean-code',
      type: 'best-practice',
      name: '整洁代码',
      description: '编写易读、易维护代码的原则',
      category: 'software-development',
      tags: ['clean-code', 'readability', 'maintainability'],
      relations: [
        { type: 'enables', targetId: 'maintainability', weight: 0.9 },
        { type: 'requires', targetId: 'programming', weight: 0.7 },
      ],
      metadata: { principles: ['single-responsibility', 'dry', 'kiss', 'yagni'] },
    });

    this.addNode({
      id: 'test-driven-development',
      type: 'method',
      name: '测试驱动开发',
      description: '先写测试再写代码的开发方法',
      category: 'software-development',
      tags: ['tdd', 'testing', 'quality'],
      relations: [
        { type: 'enables', targetId: 'code-quality', weight: 0.9 },
        { type: 'requires', targetId: 'unit-testing', weight: 0.9 },
      ],
      metadata: { cycle: ['red', 'green', 'refactor'] },
    });

    // ── 案例 ───────────────────────────────────────────────────────

    this.addNode({
      id: 'startup-success',
      type: 'case',
      name: '创业成功案例',
      description: '成功的创业公司案例分析',
      category: 'business',
      tags: ['startup', 'success', 'case-study'],
      relations: [
        { type: 'used-in', targetId: 'business-strategy', weight: 0.8 },
      ],
      metadata: { companies: ['airbnb', 'uber', 'stripe'] },
    });

    this.addNode({
      id: 'scale-up',
      type: 'case',
      name: '规模化扩展案例',
      description: '公司规模化扩展的案例分析',
      category: 'business',
      tags: ['scaling', 'growth', 'case-study'],
      relations: [
        { type: 'used-in', targetId: 'business-strategy', weight: 0.8 },
      ],
      metadata: { companies: ['google', 'amazon', 'netflix'] },
    });
  }

  private addNode(node: KnowledgeNode): void {
    this.nodes.set(node.id, node);

    // 更新分类索引
    if (!this.categoryIndex.has(node.category)) {
      this.categoryIndex.set(node.category, []);
    }
    this.categoryIndex.get(node.category)!.push(node.id);

    // 更新标签索引
    for (const tag of node.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, []);
      }
      this.tagIndex.get(tag)!.push(node.id);
    }
  }

  // ── 查询方法 ─────────────────────────────────────────────────────

  async query(query: KnowledgeQuery): Promise<KnowledgeResult> {
    const { query: searchQuery, category, type, tags, limit = 10 } = query;
    let results: KnowledgeNode[] = [];

    // 搜索所有节点
    for (const [id, node] of this.nodes) {
      let matches = false;

      // 名称匹配
      if (node.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        matches = true;
      }

      // 描述匹配
      if (node.description.toLowerCase().includes(searchQuery.toLowerCase())) {
        matches = true;
      }

      // 标签匹配
      if (tags && tags.some((tag) => node.tags.includes(tag))) {
        matches = true;
      }

      // 分类过滤
      if (category && node.category !== category) {
        matches = false;
      }

      // 类型过滤
      if (type && node.type !== type) {
        matches = false;
      }

      if (matches) {
        results.push(node);
      }
    }

    // 限制结果数量
    results = results.slice(0, limit);

    // 计算路径
    const paths = this.findPaths(results);

    // 生成建议
    const suggestions = this.generateSuggestions(results);

    // 计算置信度
    const confidence = this.calculateConfidence(results, searchQuery);

    return {
      nodes: results,
      paths,
      suggestions,
      confidence,
    };
  }

  private findPaths(nodes: KnowledgeNode[]): string[][] {
    const paths: string[][] = [];

    for (const node of nodes) {
      const path = [node.id];
      let current = node;

      // 向上遍历关系
      while (current.relations.length > 0) {
        const parentRelation = current.relations.find((r) => r.type === 'is-a');
        if (parentRelation) {
          const parent = this.nodes.get(parentRelation.targetId);
          if (parent) {
            path.push(parent.id);
            current = parent;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      paths.push(path.reverse());
    }

    return paths;
  }

  private generateSuggestions(nodes: KnowledgeNode[]): string[] {
    const suggestions: string[] = [];
    const relatedIds = new Set<string>();

    for (const node of nodes) {
      for (const relation of node.relations) {
        if (!relatedIds.has(relation.targetId)) {
          relatedIds.add(relation.targetId);
          const related = this.nodes.get(relation.targetId);
          if (related) {
            suggestions.push(`探索相关主题: ${related.name}`);
          }
        }
      }
    }

    return suggestions.slice(0, 5);
  }

  private calculateConfidence(nodes: KnowledgeNode[], query: string): number {
    if (nodes.length === 0) return 0;

    let totalScore = 0;
    for (const node of nodes) {
      let score = 0;

      // 名称完全匹配
      if (node.name.toLowerCase() === query.toLowerCase()) {
        score += 1.0;
      }
      // 名称部分匹配
      else if (node.name.toLowerCase().includes(query.toLowerCase())) {
        score += 0.8;
      }
      // 描述匹配
      else if (node.description.toLowerCase().includes(query.toLowerCase())) {
        score += 0.6;
      }
      // 标签匹配
      else if (node.tags.some((tag) => query.toLowerCase().includes(tag))) {
        score += 0.4;
      }

      totalScore += score;
    }

    return Math.min(totalScore / nodes.length, 1.0);
  }

  // ── 推荐方法 ─────────────────────────────────────────────────────

  async getRecommendations(context: string): Promise<string[]> {
    const recommendations: string[] = [];

    // 基于上下文推荐
    const keywords = context.toLowerCase().split(/\s+/);

    for (const [id, node] of this.nodes) {
      const matches = keywords.filter((kw) =>
        node.tags.some((tag) => tag.includes(kw)) ||
        node.name.toLowerCase().includes(kw)
      );

      if (matches.length > 0) {
        recommendations.push(`${node.name}: ${node.description}`);
      }
    }

    return recommendations.slice(0, 10);
  }

  // ── 知识图谱遍历 ─────────────────────────────────────────────────

  async traverse(startId: string, depth: number = 2): Promise<Map<string, KnowledgeNode>> {
    const visited = new Map<string, KnowledgeNode>();
    const queue: Array<{ id: string; level: number }> = [{ id: startId, level: 0 }];

    while (queue.length > 0) {
      const { id, level } = queue.shift()!;

      if (visited.has(id) || level > depth) continue;

      const node = this.nodes.get(id);
      if (!node) continue;

      visited.set(id, node);

      // 添加相关节点到队列
      for (const relation of node.relations) {
        if (!visited.has(relation.targetId)) {
          queue.push({ id: relation.targetId, level: level + 1 });
        }
      }
    }

    return visited;
  }

  // ── 统计信息 ─────────────────────────────────────────────────────

  getStats(): any {
    return {
      totalNodes: this.nodes.size,
      categories: this.categoryIndex.size,
      tags: this.tagIndex.size,
      nodeTypes: this.getNodeTypeStats(),
    };
  }

  private getNodeTypeStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [id, node] of this.nodes) {
      stats[node.type] = (stats[node.type] || 0) + 1;
    }
    return stats;
  }
}

// ── 导出 ─────────────────────────────────────────────────────────────

export const createKnowledgeGraph = () => new KnowledgeGraph();
