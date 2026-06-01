# 📚 Agent知识库系统 - 完整指南

## 概述

MIMO CLI 内置了一套完整的**Agent知识库系统**，所有agents都可以通过知识库来进行升级。知识库提供了统一的知识存储、检索、学习和共享功能。

## 核心特性

### ✅ 统一知识存储
- 所有知识集中存储在 `.mimo/knowledge-base.json`
- 支持JSON和Markdown格式导出
- 自动备份和版本管理

### ✅ 智能知识推荐
- 根据Agent的专业领域推荐相关知识
- 基于使用历史和相关性排序
- 支持个性化推荐

### ✅ Agent升级机制
- Agent通过学习知识库中的内容来提升能力
- 记录每次升级的效果
- 支持批量升级

### ✅ 知识分类管理
- 按类别（前端、后端、DevOps等）组织
- 按标签（React、Node.js、Docker等）索引
- 按来源（Web、代码、文档、专家）分类

### ✅ 使用统计追踪
- 记录知识的使用频率
- 追踪Agent的学习历史
- 分析知识的有效性

### ✅ 自动清理机制
- 自动清理过期知识（默认90天）
- 保留高价值知识
- 优化存储空间

---

## 知识库架构

```
.mimo/
├── knowledge-base.json      # 知识库主文件
├── agent-upgrades.json      # Agent升级记录
├── knowledge-config.json    # 知识库配置
├── evolution-memory.json    # 进化记忆
├── project-insights.json    # 项目洞察
├── learned-skills.json      # 学习技能
└── knowledge-export.md      # 导出文件
```

---

## 知识来源

### 1. 🌐 Web学习
从网络学习最新的编程知识和最佳实践。

**示例**：
```typescript
await knowledgeManager.learnFromWeb(
  'https://react.dev/reference/react/memo',
  'React.memo 是一个高阶组件...',
  'React.memo 使用指南',
  '前端开发'
);
```

### 2. 💻 代码分析
从项目代码中提取模式和最佳实践。

**示例**：
```typescript
await knowledgeManager.learnFromCode(
  'src/components/Button.tsx',
  componentCode,
  ['React组件', 'TypeScript', 'Props设计']
);
```

### 3. 📖 文档阅读
从技术文档中学习。

**示例**：
```typescript
await knowledgeBase.addKnowledge({
  title: 'Express中间件指南',
  category: '后端开发',
  content: '中间件是Express的核心概念...',
  tags: ['Express', 'Node.js', '中间件'],
  source: 'docs',
  relevanceScore: 85,
  metadata: { type: 'guide' },
});
```

### 4. 👨‍🏫 专家知识
从行业专家的知识中学习。

**自动加载**：
- 系统启动时自动从18位专家加载知识
- 提取专家的核心专业知识
- 提取最佳实践和工具技术

### 5. 👤 用户交互
从用户交互中学习。

**自动学习**：
```typescript
await evolutionOrchestrator.learnFromInteraction(
  '帮我优化React组件性能',
  'success'
);
```

---

## 知识条目结构

```typescript
interface KnowledgeItem {
  id: string;                    // 唯一标识
  title: string;                 // 标题
  category: string;              // 类别（如：前端开发）
  content: string;               // 内容
  tags: string[];                // 标签（如：['React', '性能优化']）
  source: string;                // 来源（web/code/docs/expert/user）
  relevanceScore: number;        // 相关性分数（0-100）
  usageCount: number;            // 使用次数
  createdAt: string;             // 创建时间
  updatedAt: string;             // 更新时间
  metadata: Record<string, any>; // 元数据
}
```

---

## Agent升级机制

### 升级记录

```typescript
interface AgentUpgradeRecord {
  agentId: string;        // Agent ID
  knowledgeId: string;    // 知识条目ID
  upgradeType: string;    // 升级类型（skill/pattern/best_practice/tool/technique）
  description: string;    // 升级描述
  appliedAt: string;      // 应用时间
  effectiveness: number;  // 效果评分（0-100）
}
```

### 升级流程

```
1. Agent启动
   ↓
2. 查询知识库
   ↓
3. 获取推荐知识（基于专业领域）
   ↓
4. 学习前3个推荐知识
   ↓
5. 记录升级历史
   ↓
6. 更新效果评分
```

### 自动升级

```typescript
// Agent自动升级
await evolutionOrchestrator.autoUpgradeAgent(
  'frontend-react-expert',  // Agent ID
  '前端开发',               // 行业
  ['React', 'Next.js', 'TypeScript']  // 专业领域
);

// 批量升级所有专家
await evolutionOrchestrator.upgradeAllExperts();
```

---

## 命令行接口

### 知识库管理

```bash
# 查看知识库统计
/knowledge stats

# 搜索知识
/knowledge search <查询>

# 导出知识库
/knowledge export [json|markdown]
```

### Agent升级

```bash
# 查看可用升级
/upgrade list

# 自动升级指定Agent
/upgrade auto <agent-id>

# 批量升级所有专家
/upgrade auto-all
```

### 示例

```bash
# 查看知识库统计
/knowledge stats

输出:
📚 Agent 知识库报告
══════════════════════════════════════════════════

  ● 总计知识: 156 条
  ● 平均相关性: 78%
  ● 总使用次数: 342

  按类别统计:
    • 前端开发: 45 条
    • 后端开发: 38 条
    • DevOps: 25 条
    • 安全: 20 条
    • 人工智能: 18 条
    ...

  按来源统计:
    • expert: 90 条
    • docs: 35 条
    • web: 20 条
    • code: 11 条

  按Agent统计:
    • frontend-react-expert: 25 次使用
    • backend-nodejs-expert: 20 次使用
    • devops-expert: 15 次使用
    ...
```

```bash
# 搜索知识
/knowledge search React性能优化

输出:
搜索结果 (5 条)

  ● React.memo 使用指南
    前端开发 | 相关性: 92%
    React.memo 是一个高阶组件，用于优化函数组件的重渲染...

  ● React性能优化最佳实践
    前端开发 | 相关性: 88%
    使用useMemo和useCallback优化计算和回调...

  ● React虚拟列表实现
    前端开发 | 相关性: 85%
    使用react-window或react-virtualized实现虚拟列表...
```

```bash
# 查看可用升级
/upgrade list

输出:
可用的Agent升级选项:

  专家升级:
    ● React专家                 (5 次升级)
    ● Node.js后端专家           (3 次升级)
    ● DevOps专家                (2 次升级)
    ● 数据库专家                (1 次升级)
    ...

使用 /upgrade auto <agent-id> 自动升级指定Agent
使用 /upgrade auto-all 批量升级所有专家
```

```bash
# 自动升级指定Agent
/upgrade auto frontend-react-expert

输出:
🤖 Agent frontend-react-expert 正在从知识库学习...
✓ Agent frontend-react-expert 已升级: 学习: React性能优化最佳实践
✓ Agent frontend-react-expert 已升级: 学习: TypeScript高级类型
✓ Agent frontend-react-expert 已升级: 学习: Next.js App Router
✓ Agent frontend-react-expert 已学习 3 个新知识
```

```bash
# 批量升级所有专家
/upgrade auto-all

输出:
🚀 批量升级所有专家...
✓ Agent frontend-react-expert 已学习 3 个新知识
✓ Agent backend-nodejs-expert 已学习 2 个新知识
✓ Agent devops-expert 已学习 3 个新知识
✓ Agent database-expert 已学习 2 个新知识
...
✓ 所有专家升级完成
```

---

## API接口

### KnowledgeManager

```typescript
class KnowledgeManager {
  // 初始化
  async init(): Promise<void>;

  // 知识管理
  async addKnowledge(item): Promise<KnowledgeItem>;
  search(query: string, category?: string): KnowledgeItem[];
  getKnowledge(id: string): KnowledgeItem | null;
  async deleteKnowledge(id: string): Promise<boolean>;
  async updateKnowledge(id: string, updates): Promise<KnowledgeItem | null>;

  // Agent升级
  recommendForAgent(agentId, industry, expertise): KnowledgeItem[];
  async agentLearn(agentId, knowledgeId, upgradeType, description): Promise<AgentUpgradeRecord>;
  getAgentUpgrades(agentId): AgentUpgradeRecord[];

  // 学习功能
  async learnFromWeb(url, content, title, category): Promise<void>;
  async learnFromCode(filePath, content, patterns): Promise<void>;

  // 导入导出
  async exportKnowledge(format): Promise<string>;
  async importKnowledge(items): Promise<number>;

  // 统计报告
  getStats(): KnowledgeBaseStats;
  generateReport(): string;
  getCategories(): string[];
  getTags(): string[];

  // 清理
  async cleanup(): Promise<void>;
}
```

### EvolutionOrchestrator

```typescript
class EvolutionOrchestrator {
  // 知识库相关
  getKnowledgeManager(): KnowledgeManager;
  recommendKnowledgeForAgent(agentId, industry, expertise): KnowledgeItem[];
  async upgradeAgentFromKnowledge(agentId, knowledgeId, upgradeType, description): Promise<AgentUpgradeRecord>;
  searchKnowledge(query, category): KnowledgeItem[];
  async addKnowledge(item): Promise<KnowledgeItem>;
  getKnowledgeStats(): KnowledgeBaseStats;
  generateKnowledgeReport(): string;
  async exportKnowledge(format): Promise<string>;
  async importKnowledge(items): Promise<number>;

  // 自动升级
  async autoUpgradeAgent(agentId, industry, expertise): Promise<void>;
  async upgradeAllExperts(): Promise<void>;
}
```

---

## 配置选项

### 知识库配置

```json
{
  "maxItems": 10000,           // 最大知识条目数
  "autoCleanup": true,         // 自动清理
  "cleanupDays": 90,           // 清理天数
  "enableSharing": true,       // 启用共享
  "enableVersioning": true     // 启用版本管理
}
```

### 更新配置

```bash
# 通过API更新
await knowledgeManager.updateConfig({
  maxItems: 20000,
  cleanupDays: 120,
});
```

---

## 知识分类

### 按行业分类

| 行业 | 类别 | 示例标签 |
|------|------|----------|
| 前端开发 | frontend | React, Vue, Angular, CSS, TypeScript |
| 后端开发 | backend | Node.js, Express, NestJS, GraphQL |
| DevOps | devops | Docker, Kubernetes, CI/CD, Terraform |
| 数据工程 | database | PostgreSQL, MongoDB, Redis, SQL |
| 安全 | security | OWASP, 加密, 认证, 授权 |
| 移动端 | mobile | React Native, iOS, Android |
| 人工智能 | ai-ml | PyTorch, LLM, RAG, 深度学习 |
| 云计算 | cloud | AWS, Azure, GCP, Serverless |
| 测试 | testing | Jest, Cypress, TDD, E2E |
| 性能工程 | performance | 优化, 缓存, CDN, 监控 |
| Web3 | blockchain | Solidity, DeFi, 智能合约 |
| 游戏开发 | gaming | Unity, Unreal, 游戏设计 |
| 物联网 | iot | Arduino, MQTT, 嵌入式 |
| 产品管理 | product | 策略, 用户研究, 敏捷 |
| 技术文档 | documentation | API文档, 用户指南 |

### 按类型分类

| 类型 | 说明 | 示例 |
|------|------|------|
| core_knowledge | 核心专业知识 | 专家系统提示词 |
| best_practices | 最佳实践 | 编码规范、架构模式 |
| tools_and_technologies | 工具和技术 | 框架、库、工具 |
| technique | 技术技巧 | 性能优化、调试技巧 |
| guideline | 指南 | 安全指南、编码指南 |
| pattern | 设计模式 | 架构模式、代码模式 |

---

## 最佳实践

### 1. 知识组织
- 使用清晰的分类体系
- 添加有意义的标签
- 保持知识粒度适中

### 2. 知识质量
- 确保内容准确性
- 定期更新过期知识
- 验证代码示例

### 3. Agent升级
- 定期运行 `/upgrade auto-all`
- 监控升级效果
- 清理无效知识

### 4. 知识共享
- 启用知识共享机制
- 导出重要知识
- 团队间共享知识库

---

## 故障排除

### 问题: 知识库为空
**解决**: 系统启动时会自动加载初始知识，如果为空请重启应用

### 问题: 推荐不准确
**解决**: 
1. 检查Agent的专业领域配置
2. 添加更多相关知识
3. 调整相关性分数

### 问题: 升级失败
**解决**:
1. 检查知识ID是否存在
2. 查看错误日志
3. 手动添加知识

### 问题: 存储空间不足
**解决**:
1. 运行 `/knowledge stats` 查看使用情况
2. 调整 `maxItems` 配置
3. 手动清理过期知识

---

## 性能指标

- **知识检索**: < 10ms
- **推荐算法**: < 50ms
- **升级操作**: < 100ms
- **导出功能**: < 1s（1000条知识）
- **存储效率**: ~2KB/知识条目

---

## 扩展建议

### 短期优化
1. **真实Web学习** — 集成web_fetch访问实际网页
2. **智能去重** — 自动识别和合并重复知识
3. **知识验证** — 验证知识的准确性和时效性

### 中期扩展
4. **知识图谱** — 构建知识之间的关联关系
5. **协作学习** — 多个MIMO实例共享知识
6. **个性化推荐** — 基于用户偏好推荐知识

### 长期规划
7. **知识市场** — 社区共享知识库
8. **AI增强** — 使用AI自动提取和组织知识
9. **知识评估** — 自动评估知识的质量和价值

---

## 版本历史

- **v2.0.0** — 初始版本
  - 统一知识库系统
  - Agent升级机制
  - 智能推荐
  - 命令行接口

---

**版本**: v2.0.0
**最后更新**: 2026-06-01
**知识条目**: 156+ 条
**支持Agent**: 18位专家
**存储格式**: JSON
