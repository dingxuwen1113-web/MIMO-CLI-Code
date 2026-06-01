/**
 * Web Learning Module - 行业限制的网页学习
 *
 * 为每个专家Agent提供行业相关的网页学习功能
 * 只能访问与自身行业相关的内容
 */

import { MimoConfig } from '../config/schema';
import { printInfo, printSuccess, printWarning, ORANGE, GRAY, GREEN } from '../tui/output';

export interface WebLearningConfig {
  enabled: boolean;
  maxRequestsPerSession: number;
  timeout: number;
  allowedDomains: string[];
}

export interface LearningResource {
  url: string;
  title: string;
  content: string;
  relevanceScore: number;
  learnedAt: string;
}

export interface IndustryWebConfig {
  industry: string;
  allowedDomains: string[];
  searchQueries: string[];
  blockedDomains: string[];
}

// 行业网页访问配置 - 严格限制只能访问行业相关内容
const INDUSTRY_WEB_CONFIGS: Record<string, IndustryWebConfig> = {
  'frontend': {
    industry: '前端开发',
    allowedDomains: [
      'reactjs.org', 'react.dev', 'nextjs.org', 'vuejs.org', 'angular.io',
      'developer.mozilla.org', 'web.dev', 'css-tricks.com', 'smashingmagazine.com',
      'javascript.info', 'typescriptlang.org', 'webpack.js.org', 'vitejs.dev',
    ],
    searchQueries: [
      'React best practices 2026',
      'Next.js performance optimization',
      'TypeScript advanced patterns',
      'Frontend architecture',
      'Web performance optimization',
    ],
    blockedDomains: ['backend-specific.com', 'devops-only.com'],
  },
  'backend': {
    industry: '后端开发',
    allowedDomains: [
      'nodejs.org', 'expressjs.com', 'nestjs.com', 'graphql.org',
      'postgresql.org', 'mongodb.com', 'redis.io', 'prisma.io',
      'typeorm.io', 'sequelize.org', 'fastify.io', 'koajs.com',
    ],
    searchQueries: [
      'Node.js best practices 2026',
      'Express performance optimization',
      'NestJS architecture patterns',
      'Database optimization techniques',
      'API design best practices',
    ],
    blockedDomains: ['frontend-only.com', 'mobile-specific.com'],
  },
  'devops': {
    industry: 'DevOps',
    allowedDomains: [
      'docker.com', 'kubernetes.io', 'github.com/features/actions',
      'terraform.io', 'ansible.com', 'jenkins.io', 'gitlab.com',
      'aws.amazon.com', 'cloud.google.com', 'azure.microsoft.com',
      'prometheus.io', 'grafana.com', 'datadog.com',
    ],
    searchQueries: [
      'Docker best practices 2026',
      'Kubernetes deployment strategies',
      'CI/CD pipeline optimization',
      'Infrastructure as Code',
      'Cloud native architecture',
    ],
    blockedDomains: ['frontend-specific.com', 'mobile-only.com'],
  },
  'database': {
    industry: '数据工程',
    allowedDomains: [
      'postgresql.org', 'mysql.com', 'mongodb.com', 'redis.io',
      'elastic.co', 'influxdata.com', 'neo4j.com', 'cassandra.apache.org',
      'snowflake.com', 'databricks.com', 'airflow.apache.org',
    ],
    searchQueries: [
      'PostgreSQL performance tuning',
      'MongoDB schema design',
      'Redis caching strategies',
      'Database indexing best practices',
      'Query optimization techniques',
    ],
    blockedDomains: ['frontend-only.com', 'mobile-specific.com'],
  },
  'security': {
    industry: '安全',
    allowedDomains: [
      'owasp.org', 'portswigger.net', 'kali.org', 'metasploit.com',
      'security.google', 'auth0.com', 'jwt.io', 'letsencrypt.org',
      'crowdstrike.com', 'paloaltonetworks.com',
    ],
    searchQueries: [
      'OWASP Top 10 2026',
      'Web application security',
      'Authentication best practices',
      'Encryption standards',
      'Security audit checklist',
    ],
    blockedDomains: ['frontend-specific.com', 'game-dev.com'],
  },
  'mobile': {
    industry: '移动端开发',
    allowedDomains: [
      'reactnative.dev', 'expo.dev', 'developer.android.com',
      'developer.apple.com', 'flutter.dev', 'ionic.io', 'capacitorjs.com',
      'firebase.google.com', 'appcenter.ms',
    ],
    searchQueries: [
      'React Native performance 2026',
      'Mobile app optimization',
      'iOS/Android best practices',
      'Cross-platform development',
      'Mobile UI/UX patterns',
    ],
    blockedDomains: ['backend-only.com', 'devops-specific.com'],
  },
  'ai-ml': {
    industry: '人工智能',
    allowedDomains: [
      'pytorch.org', 'tensorflow.org', 'huggingface.co', 'openai.com',
      'anthropic.com', 'langchain.com', 'llamaindex.ai', 'mlflow.org',
      'wandb.ai', 'paperswithcode.com', 'arxiv.org',
    ],
    searchQueries: [
      'LLM fine-tuning techniques',
      'RAG system design',
      'Machine learning best practices',
      'AI application architecture',
      'Model deployment strategies',
    ],
    blockedDomains: ['frontend-only.com', 'mobile-specific.com'],
  },
  'data-engineering': {
    industry: '数据工程',
    allowedDomains: [
      'spark.apache.org', 'airflow.apache.org', 'kafka.apache.org',
      'dbt.com', 'snowflake.com', 'databricks.com', 'fivetran.com',
      'prefect.io', 'dagster.io',
    ],
    searchQueries: [
      'Data pipeline best practices',
      'Apache Spark optimization',
      'ETL/ELT patterns',
      'Data warehouse design',
      'Stream processing',
    ],
    blockedDomains: ['frontend-only.com', 'mobile-specific.com'],
  },
  'cloud': {
    industry: '云计算',
    allowedDomains: [
      'aws.amazon.com', 'cloud.google.com', 'azure.microsoft.com',
      'serverless.com', 'vercel.com', 'netlify.com', 'heroku.com',
      'digitalocean.com', 'linode.com',
    ],
    searchQueries: [
      'Cloud architecture patterns',
      'Serverless best practices',
      'AWS Well-Architected',
      'Cost optimization strategies',
      'Multi-cloud strategies',
    ],
    blockedDomains: ['frontend-only.com', 'mobile-specific.com'],
  },
  'testing': {
    industry: '质量保证',
    allowedDomains: [
      'jestjs.io', 'cypress.io', 'playwright.dev', 'testing-library.com',
      'vitest.dev', 'mochajs.org', 'k6.io', 'artillery.io',
      'browserstack.com', 'saucelabs.com',
    ],
    searchQueries: [
      'Testing best practices 2026',
      'E2E testing strategies',
      'Test automation frameworks',
      'Performance testing',
      'Test-driven development',
    ],
    blockedDomains: ['frontend-only.com', 'backend-specific.com'],
  },
  'performance': {
    industry: '性能工程',
    allowedDomains: [
      'web.dev', 'developers.google.com', 'lighthouse-ci.appspot.com',
      'webpagetest.org', 'gtmetrix.com', 'pagespeed.web.dev',
      'newrelic.com', 'datadog.com', 'sentry.io',
    ],
    searchQueries: [
      'Core Web Vitals optimization',
      'Web performance techniques',
      'Lighthouse audit best practices',
      'CDN optimization',
      'Caching strategies',
    ],
    blockedDomains: ['backend-only.com', 'mobile-specific.com'],
  },
  'blockchain': {
    industry: 'Web3',
    allowedDomains: [
      'ethereum.org', 'soliditylang.org', 'openzeppelin.com',
      'uniswap.org', 'aave.com', 'compound.finance',
      'docs.alchemy.com', 'infura.io', 'etherscan.io',
    ],
    searchQueries: [
      'Solidity best practices',
      'Smart contract security',
      'DeFi protocol design',
      'Gas optimization',
      'Web3 development',
    ],
    blockedDomains: ['frontend-only.com', 'mobile-specific.com'],
  },
  'gaming': {
    industry: '游戏开发',
    allowedDomains: [
      'unity.com', 'unrealengine.com', 'godotengine.org',
      'gamedev.net', 'gamasutra.com', 'indiedb.com',
      'store.steampowered.com', 'itch.io',
    ],
    searchQueries: [
      'Unity optimization techniques',
      'Unreal Engine best practices',
      'Game design patterns',
      'Multiplayer architecture',
      'Game performance optimization',
    ],
    blockedDomains: ['backend-only.com', 'devops-specific.com'],
  },
  'iot': {
    industry: '物联网',
    allowedDomains: [
      'arduino.cc', 'raspberrypi.org', 'mqtt.org', 'espressif.com',
      'platformio.org', 'thingsboard.io', 'home-assistant.io',
      'particle.io', 'tigase.io',
    ],
    searchQueries: [
      'IoT architecture patterns',
      'MQTT best practices',
      'Embedded systems design',
      'Edge computing',
      'Sensor data processing',
    ],
    blockedDomains: ['frontend-only.com', 'backend-specific.com'],
  },
  'product': {
    industry: '产品管理',
    allowedDomains: [
      'productplan.com', 'mindtheproduct.com', 'svpg.com',
      'intercom.com', 'amplitude.com', 'mixpanel.com',
      'producthunt.com', 'medium.com/@product',
    ],
    searchQueries: [
      'Product management best practices',
      'User research methods',
      'Agile product development',
      'Product metrics',
      'Growth strategies',
    ],
    blockedDomains: ['technical-specific.com', 'code-only.com'],
  },
  'documentation': {
    industry: '技术文档',
    allowedDomains: [
      'docusaurus.io', 'vuepress.vuejs.org', 'mkdocs.org',
      'readthedocs.io', 'gitbook.io', 'notion.so',
      'swagger.io', 'openapis.org', 'readme.io',
    ],
    searchQueries: [
      'Technical writing best practices',
      'API documentation standards',
      'Documentation tools',
      'Developer experience',
      'Knowledge base design',
    ],
    blockedDomains: ['backend-only.com', 'frontend-specific.com'],
  },
};

export class WebLearningModule {
  private config: MimoConfig;
  private learningConfig: WebLearningConfig;
  private learnedResources: Map<string, LearningResource[]> = new Map();

  constructor(config: MimoConfig) {
    this.config = config;
    this.learningConfig = {
      enabled: true,
      maxRequestsPerSession: 10,
      timeout: 30000,
      allowedDomains: [],
    };
  }

  /**
   * 获取行业网页配置
   */
  getIndustryConfig(industryKey: string): IndustryWebConfig | null {
    return INDUSTRY_WEB_CONFIGS[industryKey] || null;
  }

  /**
   * 获取所有行业配置
   */
  getAllIndustryConfigs(): Record<string, IndustryWebConfig> {
    return INDUSTRY_WEB_CONFIGS;
  }

  /**
   * 验证URL是否属于指定行业
   */
  isUrlAllowedForIndustry(url: string, industryKey: string): boolean {
    const config = INDUSTRY_WEB_CONFIGS[industryKey];
    if (!config) return false;

    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.toLowerCase();

      // 检查是否在黑名单
      for (const blocked of config.blockedDomains) {
        if (domain.includes(blocked.toLowerCase())) {
          return false;
        }
      }

      // 检查是否在白名单
      for (const allowed of config.allowedDomains) {
        if (domain.includes(allowed.toLowerCase())) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * 生成行业相关的搜索查询
   */
  generateSearchQueries(industryKey: string, topic?: string): string[] {
    const config = INDUSTRY_WEB_CONFIGS[industryKey];
    if (!config) return [];

    const queries = [...config.searchQueries];

    if (topic) {
      queries.unshift(`${topic} ${config.industry} best practices`);
      queries.unshift(`${topic} ${config.industry} tutorial`);
    }

    return queries;
  }

  /**
   * 学习网页内容
   */
  async learnFromWeb(
    industryKey: string,
    url: string,
    content: string,
    title: string
  ): Promise<boolean> {
    // 验证URL是否属于该行业
    if (!this.isUrlAllowedForIndustry(url, industryKey)) {
      printWarning(`URL不属于${industryKey}行业，拒绝访问: ${url}`);
      return false;
    }

    const resource: LearningResource = {
      url,
      title,
      content: content.substring(0, 2000), // 限制内容长度
      relevanceScore: this.calculateRelevance(content, industryKey),
      learnedAt: new Date().toISOString(),
    };

    // 存储学习资源
    if (!this.learnedResources.has(industryKey)) {
      this.learnedResources.set(industryKey, []);
    }
    this.learnedResources.get(industryKey)!.push(resource);

    printSuccess(`学习完成: ${title} (${industryKey})`);
    return true;
  }

  /**
   * 计算内容相关性分数
   */
  private calculateRelevance(content: string, industryKey: string): number {
    const config = INDUSTRY_WEB_CONFIGS[industryKey];
    if (!config) return 50;

    const contentLower = content.toLowerCase();
    let score = 50;

    // 检查行业关键词出现次数
    const industryKeywords = config.industry.split(' ');
    for (const keyword of industryKeywords) {
      const count = (contentLower.match(new RegExp(keyword.toLowerCase(), 'g')) || []).length;
      score += Math.min(count * 5, 20);
    }

    // 检查搜索查询关键词
    for (const query of config.searchQueries.slice(0, 3)) {
      const queryWords = query.toLowerCase().split(' ');
      for (const word of queryWords) {
        if (contentLower.includes(word)) {
          score += 5;
        }
      }
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * 获取行业学习资源
   */
  getLearnedResources(industryKey: string): LearningResource[] {
    return this.learnedResources.get(industryKey) || [];
  }

  /**
   * 获取所有学习资源统计
   */
  getLearningStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [industry, resources] of this.learnedResources.entries()) {
      stats[industry] = resources.length;
    }
    return stats;
  }

  /**
   * 生成学习报告
   */
  generateLearningReport(): string {
    const stats = this.getLearningStats();
    const totalResources = Object.values(stats).reduce((sum, count) => sum + count, 0);

    let report = `\n  ${ORANGE('🌐 网页学习报告')}\n`;
    report += `  ${GRAY('─'.repeat(40))}\n\n`;
    report += `  ${GREEN('●')} 总计学习: ${totalResources} 个资源\n\n`;

    if (Object.keys(stats).length > 0) {
      report += `  ${ORANGE('按行业统计:')}\n`;
      for (const [industry, count] of Object.entries(stats).sort(([, a], [, b]) => b - a)) {
        report += `    ${GRAY('•')} ${industry}: ${count} 个\n`;
      }
    }

    return report;
  }

  /**
   * 清理过期学习资源
   */
  cleanup(maxAgeDays: number = 30): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
    const cutoffTime = cutoffDate.toISOString();

    for (const [industry, resources] of this.learnedResources.entries()) {
      const filtered = resources.filter(r => r.learnedAt >= cutoffTime);
      this.learnedResources.set(industry, filtered);
    }

    printInfo('网页学习资源清理完成');
  }
}
