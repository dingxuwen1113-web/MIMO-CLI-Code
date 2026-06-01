# 行业专家系统使用指南

## 概述

MIMO CLI 内置了 **18 位行业专家**，覆盖前端、后端、DevOps、安全、AI/ML、移动开发等各行各业。这些专家会在你工作时自动匹配并提供专业指导。

## 可用专家

### 前端开发

#### React 专家 (`frontend-react-expert`)
- **专业领域**: React 18+, Next.js, Redux, Zustand, React Query
- **适用场景**: React组件开发、状态管理、性能优化、SSR
- **触发关键词**: react, hook, jsx, next.js, redux

### 后端开发

#### Node.js 后端专家 (`backend-nodejs-expert`)
- **专业领域**: Node.js, Express, NestJS, GraphQL, 数据库
- **适用场景**: API设计、后端架构、数据库优化、认证授权
- **触发关键词**: node, express, api, rest, graphql, 后端

### 全栈开发

#### Next.js 全栈专家 (`fullstack-nextjs-expert`)
- **专业领域**: Next.js 14+, Server Components, Server Actions
- **适用场景**: 全栈应用、SSR/SSG、API Routes、部署
- **触发关键词**: next.js, 全栈, fullstack, server component

### DevOps

#### DevOps 专家 (`devops-expert`)
- **专业领域**: Docker, Kubernetes, CI/CD, Terraform, AWS
- **适用场景**: 容器化、编排、自动化部署、基础设施
- **触发关键词**: docker, kubernetes, ci/cd, 部署, devops

### 数据工程

#### 数据库专家 (`database-expert`)
- **专业领域**: PostgreSQL, MongoDB, Redis, MySQL, Elasticsearch
- **适用场景**: 数据库设计、查询优化、索引策略、高可用
- **触发关键词**: database, sql, postgresql, mongodb, redis, 数据库

### 安全

#### 网络安全专家 (`security-expert`)
- **专业领域**: OWASP, 渗透测试, 密码学, 认证授权
- **适用场景**: 安全审计、漏洞修复、加密、合规性
- **触发关键词**: security, 安全, 漏洞, owasp, 认证

### 移动端开发

#### React Native 专家 (`mobile-react-native-expert`)
- **专业领域**: React Native, Expo, iOS, Android
- **适用场景**: 跨平台移动应用、性能优化、原生模块
- **触发关键词**: react native, mobile, app, ios, android, 移动端

### 人工智能

#### AI/ML 专家 (`ai-ml-expert`)
- **专业领域**: PyTorch, TensorFlow, LLM, RAG, MLOps
- **适用场景**: 机器学习、深度学习、LLM应用、模型部署
- **触发关键词**: ai, ml, llm, gpt, model, 人工智能, 机器学习

### 数据工程

#### 数据工程专家 (`data-engineering-expert`)
- **专业领域**: Apache Spark, Airflow, Kafka, dbt
- **适用场景**: 数据管道、ETL、流处理、数据仓库
- **触发关键词**: data pipeline, etl, spark, airflow, kafka, 数据工程

### 云计算

#### 云架构专家 (`cloud-architect-expert`)
- **专业领域**: AWS, Azure, GCP, Serverless, 微服务
- **适用场景**: 云架构设计、成本优化、高可用、灾备
- **触发关键词**: aws, azure, gcp, cloud, serverless, 云, 架构

### 质量保证

#### 测试工程专家 (`testing-expert`)
- **专业领域**: Jest, Cypress, Playwright, TDD, BDD
- **适用场景**: 自动化测试、测试策略、性能测试、安全测试
- **触发关键词**: test, jest, cypress, playwright, 测试, 单元测试

### 性能工程

#### 性能优化专家 (`performance-expert`)
- **专业领域**: Core Web Vitals, Lighthouse, 缓存, CDN
- **适用场景**: Web性能优化、数据库优化、网络优化
- **触发关键词**: performance, 优化, lighthouse, 性能, 加速

### Web3

#### 区块链专家 (`blockchain-expert`)
- **专业领域**: Solidity, Ethereum, DeFi, NFT, 智能合约
- **适用场景**: 智能合约开发、DeFi协议、安全审计
- **触发关键词**: blockchain, solidity, ethereum, web3, 区块链

### 游戏开发

#### 游戏开发专家 (`game-dev-expert`)
- **专业领域**: Unity, Unreal Engine, C#, C++, 游戏设计
- **适用场景**: 游戏开发、性能优化、多人游戏、物理引擎
- **触发关键词**: game, unity, unreal, 游戏, gamedev

### 物联网

#### 嵌入式/IoT 专家 (`embedded-iot-expert`)
- **专业领域**: Arduino, Raspberry Pi, MQTT, RTOS
- **适用场景**: 嵌入式系统、IoT设备、边缘计算、传感器
- **触发关键词**: embedded, iot, arduino, mqtt, 嵌入式, 物联网

### 产品管理

#### 产品管理专家 (`product-manager-expert`)
- **专业领域**: 产品策略, 用户研究, 敏捷开发, 数据分析
- **适用场景**: 需求分析、产品规划、用户画像、增长策略
- **触发关键词**: product, roadmap, user story, 产品, 需求

### 技术文档

#### 技术写作专家 (`technical-writer-expert`)
- **专业领域**: API文档, 用户指南, Markdown, Docusaurus
- **适用场景**: 技术文档、API文档、教程、变更日志
- **触发关键词**: documentation, docs, api doc, 文档, readme

## 使用方式

### 1. 自动匹配（推荐）

直接输入你的问题或任务，系统会自动匹配最佳专家：

```bash
# 示例
"帮我优化React组件的性能"
"设计一个用户认证系统"
"部署应用到Kubernetes"
"修复这个SQL查询的性能问题"
"审查这段代码的安全性"
```

系统会：
1. 分析你的问题关键词
2. 匹配最相关的专家
3. 将专家知识注入到对话上下文
4. 推荐相关领域的其他专家

### 2. 手动查看专家

使用命令查看所有可用专家：

```bash
# 列出所有行业专家
/experts

# 列出专家开发团队
/team

# 查看进化系统状态
/evolution

# 查看学习报告
/learn
```

### 3. 查看专家详情

```bash
# 在对话中询问
"介绍一下React专家"
"DevOps专家能做什么"
"有哪些AI相关的专家"
```

## 工作原理

### 智能匹配算法

1. **关键词提取** — 从用户输入中提取关键词
2. **权重计算** — 根据关键词匹配度计算权重
3. **专家排序** — 按权重排序推荐专家
4. **知识注入** — 将专家的系统提示词注入上下文

### 专家知识体系

每位专家包含：

```typescript
interface ExpertAgent {
  id: string;           // 唯一标识
  name: string;         // 显示名称
  industry: string;     // 所属行业
  description: string;  // 简短描述
  expertise: string[];  // 专业技能列表
  systemPrompt: string; // 详细的专业知识
  tools: string[];      // 常用工具
}
```

### 学习与进化

专家系统会从每次交互中学习：

1. **使用统计** — 记录哪些专家被频繁使用
2. **成功模式** — 学习成功的解决方案
3. **推荐优化** — 根据使用模式优化推荐算法
4. **知识积累** — 将新知识添加到知识库

## 实际应用场景

### 场景1: React性能优化

**输入**: "我的React应用渲染很慢，怎么优化？"

**匹配专家**: React 专家

**专家知识**:
- React.memo 和 useMemo 的使用
- 虚拟列表优化
- 代码分割和懒加载
- 状态管理优化

### 场景2: API设计

**输入**: "帮我设计一个RESTful API"

**匹配专家**: Node.js 后端专家

**专家知识**:
- RESTful设计原则
- 认证授权方案
- 错误处理规范
- API版本管理

### 场景3: 容器化部署

**输入**: "把应用部署到Docker"

**匹配专家**: DevOps 专家

**专家知识**:
- 多阶段Docker构建
- Docker Compose配置
- 镜像优化
- 安全最佳实践

### 场景4: 数据库优化

**输入**: "这个SQL查询执行很慢"

**匹配专家**: 数据库专家

**专家知识**:
- EXPLAIN分析
- 索引优化
- 查询重写
- 分区策略

### 场景5: 安全审查

**输入**: "帮我检查这段代码的安全性"

**匹配专家**: 网络安全专家

**专家知识**:
- OWASP Top 10
- 常见漏洞检测
- 安全编码规范
- 加密最佳实践

## 高级功能

### 专家推荐

当匹配到一个专家时，系统会推荐相关领域的其他专家：

```
用户: "优化React组件性能"
匹配: React 专家
推荐: 
  - 性能优化专家 (性能工程)
  - 测试工程专家 (质量保证)
```

### 多专家协作

对于复杂任务，可以同时参考多个专家的建议：

```
用户: "开发一个电商网站"
涉及专家:
  - React专家 (前端)
  - Node.js专家 (后端)
  - 数据库专家 (数据层)
  - 安全专家 (支付安全)
  - DevOps专家 (部署)
```

### 学习报告

查看专家系统的使用情况和学习成果：

```bash
/learn

# 输出示例
📚 学习报告
────────────────────────────────────────

  ● 技能: 45 个 (高置信度: 32)
  ● 知识: 128 条
  ● 目标: 5 个 (已完成: 3)

  技能分类:
    • 前端开发: 12 个
    • 后端开发: 8 个
    • DevOps: 6 个
    • 安全: 5 个

  最常用技能:
    • React开发: 25 次 (置信度: 95%)
    • API设计: 18 次 (置信度: 88%)
    • Docker部署: 12 次 (置信度: 82%)
```

## 配置选项

### 启用/禁用专家系统

在 `~/.mimo/config.toml`:

```toml
[evolution]
enabled = true
autoLearn = true
```

### 自定义专家匹配

可以通过修改 `src/evolution/experts.ts` 添加自定义专家。

## 故障排除

### 专家未匹配

1. 检查关键词是否准确
2. 尝试使用不同的表述
3. 查看 `/experts` 确认专家存在

### 专家知识不准确

1. 使用 `/learn` 查看学习报告
2. 清理过期知识: 系统会自动清理低置信度知识
3. 重置进化系统: 删除 `.mimo/` 目录

### 性能问题

专家系统在后台运行，不会影响正常使用。如果遇到性能问题：
1. 检查 `.mimo/` 目录大小
2. 减少学习频率
3. 清理旧的学习数据

## 最佳实践

1. **明确问题** — 问题越具体，专家匹配越准确
2. **提供上下文** — 包含相关技术栈和环境信息
3. **逐步细化** — 从大问题逐步细化到具体问题
4. **参考推荐** — 查看系统推荐的相关专家
5. **学习反馈** — 系统会从成功的解决方案中学习

## 更新日志

- **v2.0.0** — 初始版本，包含18位行业专家
- 支持智能匹配和专家推荐
- 支持学习和进化功能
- 支持使用统计和报告

---

**版本**: v2.0.0
**最后更新**: 2026-06-01
