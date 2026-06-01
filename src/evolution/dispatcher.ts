/**
 * Expert Dispatcher - 专家调度器
 *
 * 管理和调度各行各业的专家Agent
 */

import { MimoConfig } from '../config/schema';
import {
  ExpertAgent,
  EXPERT_AGENTS,
  matchExpertByKeyword,
  getExpertsByIndustry,
  getIndustries,
  searchExperts,
} from './experts';
import { printInfo, printSuccess, printWarning, ORANGE, GRAY, GREEN, CYAN } from '../tui/output';

export class ExpertDispatcher {
  private config: MimoConfig;
  private activeExperts: Map<string, ExpertAgent> = new Map();
  private expertHistory: Array<{ expertId: string; timestamp: string; task: string }> = [];

  constructor(config: MimoConfig) {
    this.config = config;
  }

  /**
   * 根据任务自动匹配专家
   */
  matchExpert(task: string): ExpertAgent | null {
    const taskLower = task.toLowerCase();

    // 关键词映射
    const keywordMap: Record<string, string[]> = {
      'frontend-react-expert': ['react', 'hook', 'jsx', 'tsx', 'next.js', 'nextjs', 'redux', 'zustand'],
      'backend-nodejs-expert': ['node', 'express', 'nestjs', 'api', 'rest', 'graphql', '后端'],
      'fullstack-nextjs-expert': ['next.js', 'nextjs', '全栈', 'fullstack', 'server component'],
      'devops-expert': ['docker', 'kubernetes', 'k8s', 'ci/cd', 'github actions', 'devops', '部署'],
      'database-expert': ['database', 'sql', 'postgresql', 'mysql', 'mongodb', 'redis', '数据库', '查询优化'],
      'security-expert': ['security', '安全', '漏洞', 'owasp', 'sql注入', 'xss', '认证', '加密'],
      'mobile-react-native-expert': ['react native', 'mobile', 'app', 'ios', 'android', '移动端', '手机'],
      'ai-ml-expert': ['ai', 'ml', 'machine learning', 'llm', 'gpt', 'model', '人工智能', '机器学习', '模型'],
      'data-engineering-expert': ['data pipeline', 'etl', 'spark', 'airflow', 'kafka', '数据工程', '数据管道'],
      'cloud-architect-expert': ['aws', 'azure', 'gcp', 'cloud', 'serverless', '云', '架构'],
      'testing-expert': ['test', 'testing', 'jest', 'cypress', 'playwright', '测试', '单元测试', 'e2e'],
      'performance-expert': ['performance', '优化', 'lighthouse', 'web vitals', '性能', '加速'],
      'blockchain-expert': ['blockchain', 'solidity', 'ethereum', 'smart contract', 'web3', '区块链', '智能合约'],
      'game-dev-expert': ['game', 'unity', 'unreal', '游戏', 'gamedev'],
      'embedded-iot-expert': ['embedded', 'iot', 'arduino', 'raspberry pi', 'mqtt', '嵌入式', '物联网'],
      'product-manager-expert': ['product', 'roadmap', 'user story', '产品', '需求', '路线图'],
      'technical-writer-expert': ['documentation', 'docs', 'api doc', '文档', '写作', 'readme'],
    };

    // 遍历关键词映射找到匹配的专家
    for (const [expertId, keywords] of Object.entries(keywordMap)) {
      for (const keyword of keywords) {
        if (taskLower.includes(keyword)) {
          const expert = EXPERT_AGENTS.find(a => a.id === expertId);
          if (expert) {
            return expert;
          }
        }
      }
    }

    // 如果没有精确匹配，尝试模糊搜索
    const results = searchExperts(task);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * 激活专家
   */
  activateExpert(expert: ExpertAgent): void {
    this.activeExperts.set(expert.id, expert);
    printSuccess(`激活专家: ${expert.name} (${expert.industry})`);
  }

  /**
   * 停用专家
   */
  deactivateExpert(expertId: string): void {
    this.activeExperts.delete(expertId);
    printInfo(`停用专家: ${expertId}`);
  }

  /**
   * 获取专家系统提示词
   */
  getExpertSystemPrompt(expertId: string): string | null {
    const expert = this.activeExperts.get(expertId) || EXPERT_AGENTS.find(a => a.id === expertId);
    return expert ? expert.systemPrompt : null;
  }

  /**
   * 记录专家使用历史
   */
  recordUsage(expertId: string, task: string): void {
    this.expertHistory.push({
      expertId,
      timestamp: new Date().toISOString(),
      task: task.substring(0, 100),
    });

    // 保持最近100条记录
    if (this.expertHistory.length > 100) {
      this.expertHistory = this.expertHistory.slice(-100);
    }
  }

  /**
   * 获取活跃专家列表
   */
  getActiveExperts(): ExpertAgent[] {
    return Array.from(this.activeExperts.values());
  }

  /**
   * 获取专家使用统计
   */
  getUsageStats(): Record<string, number> {
    const stats: Record<string, number> = {};

    for (const record of this.expertHistory) {
      stats[record.expertId] = (stats[record.expertId] || 0) + 1;
    }

    return stats;
  }

  /**
   * 获取专家推荐（基于历史使用）
   */
  getRecommendations(currentTask: string): ExpertAgent[] {
    const recommendations: ExpertAgent[] = [];
    const usedExperts = new Set(this.expertHistory.map(r => r.expertId));

    // 1. 首先推荐直接匹配的专家
    const directMatch = this.matchExpert(currentTask);
    if (directMatch) {
      recommendations.push(directMatch);
    }

    // 2. 推荐同行业的其他专家
    if (directMatch) {
      const sameIndustry = getExpertsByIndustry(directMatch.industry);
      for (const expert of sameIndustry) {
        if (expert.id !== directMatch?.id && !recommendations.find(r => r.id === expert.id)) {
          recommendations.push(expert);
        }
      }
    }

    // 3. 推荐经常使用的专家
    const usageStats = this.getUsageStats();
    const sortedByUsage = Object.entries(usageStats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    for (const [expertId] of sortedByUsage) {
      const expert = EXPERT_AGENTS.find(a => a.id === expertId);
      if (expert && !recommendations.find(r => r.id === expert.id)) {
        recommendations.push(expert);
      }
    }

    return recommendations.slice(0, 5);
  }

  /**
   * 列出所有可用专家
   */
  listAllExperts(): ExpertAgent[] {
    return EXPERT_AGENTS;
  }

  /**
   * 按行业列出专家
   */
  listExpertsByIndustry(): Record<string, ExpertAgent[]> {
    const grouped: Record<string, ExpertAgent[]> = {};

    for (const expert of EXPERT_AGENTS) {
      if (!grouped[expert.industry]) {
        grouped[expert.industry] = [];
      }
      grouped[expert.industry].push(expert);
    }

    return grouped;
  }

  /**
   * 搜索专家
   */
  search(query: string): ExpertAgent[] {
    return searchExperts(query);
  }

  /**
   * 获取专家详情
   */
  getExpertDetails(expertId: string): ExpertAgent | null {
    return EXPERT_AGENTS.find(a => a.id === expertId) || null;
  }

  /**
   * 生成专家摘要报告
   */
  generateSummary(): string {
    const industries = getIndustries();
    const totalExperts = EXPERT_AGENTS.length;
    const activeCount = this.activeExperts.size;
    const usageStats = this.getUsageStats();
    const totalUsage = Object.values(usageStats).reduce((sum, count) => sum + count, 0);

    let report = `\n  ${ORANGE('👥 专家系统摘要')}\n`;
    report += `  ${GRAY('─'.repeat(40))}\n\n`;
    report += `  ${GREEN('●')} 总计: ${totalExperts} 位专家\n`;
    report += `  ${GREEN('●')} 活跃: ${activeCount} 位\n`;
    report += `  ${GREEN('●')} 调用次数: ${totalUsage}\n`;
    report += `  ${GREEN('●')} 覆盖行业: ${industries.length} 个\n\n`;

    report += `  ${ORANGE('行业分布:')}\n`;
    for (const industry of industries) {
      const experts = getExpertsByIndustry(industry);
      report += `    ${GRAY('•')} ${industry}: ${experts.length} 位\n`;
    }

    if (totalUsage > 0) {
      report += `\n  ${ORANGE('热门专家:')}\n`;
      const sorted = Object.entries(usageStats)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

      for (const [expertId, count] of sorted) {
        const expert = EXPERT_AGENTS.find(a => a.id === expertId);
        if (expert) {
          report += `    ${GRAY('•')} ${expert.name}: ${count} 次\n`;
        }
      }
    }

    return report;
  }
}
