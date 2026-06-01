# 自主进化Agent使用指南

## 快速开始

### 1. 启动软件即自动运行

```bash
# 直接启动
npm run dev

# 或构建后启动
npm run build
node dist/index.js
```

当软件启动时，Evolution Agent 会自动在后台运行。

### 2. 查看进化日志

启动后，你会看到类似输出：

```
  🧬 Evolution Agent - 自主进化系统启动
  ✓ 进化记忆加载完成

  ▶ 开始自主进化学习...

  📋 阶段1: 学习项目结构...
  ✓ 学习到: mimo-cli-code v2.0.0

  🌐 阶段2: 访问Web学习最新技术...
  ✓ 学习: TypeScript best practices 2026
  ✓ 学习: Node.js performance optimization
  ✓ 学习: AI coding assistant features

  🔍 阶段3: 分析代码模式...
  ✓ 检测到 4 种代码模式: OOP类模式, 异步编程模式...

  📚 阶段4: 读取所有文件...
  ✓ 读取了 4 个重要文件

  📝 阶段5: 更新 README.md...
  ✓ README.md 已更新

  ✓ 自主进化完成 - 已学习并更新知识库
```

### 3. 查看进化结果

进化完成后，查看以下文件：

```bash
# 查看README中的进化日志
tail -50 README.md

# 查看进化记忆
cat .mimo/evolution-memory.json

# 查看项目洞察
cat .mimo/project-insights.json
```

## 进化阶段详解

### 阶段1: 项目结构学习
- 读取 `package.json`
- 分析依赖列表
- 提取脚本配置
- 生成项目结构洞察

### 阶段2: Web技术学习
- 搜索最新编程最佳实践
- 学习工具和框架更新
- 记录技术趋势

### 阶段3: 代码模式分析
- 扫描 `src/` 目录
- 检测常见设计模式：
  - OOP类模式
  - 异步编程模式
  - TypeScript类型系统
  - 模块化导出

### 阶段4: 文件洞察提取
- 读取重要文件：
  - README.md
  - CHANGELOG.md
  - LICENSE
  - .env.example
- 统计源码文件数量

### 阶段5: README更新
- 生成进化日志部分
- 记录学习记忆
- 记录项目洞察
- 自动追加到README

## 存储结构

```
.mimo/
├── evolution-memory.json    # 进化记忆
└── project-insights.json    # 项目洞察

README.md
└── 🧬 自主进化日志部分
```

### evolution-memory.json 示例

```json
[
  {
    "id": "web-1717234567890-abc123def",
    "timestamp": "2026-06-01T10:30:00.000Z",
    "source": "web_search",
    "topic": "TypeScript best practices 2026",
    "content": "学习了关于 TypeScript best practices 2026 的最新最佳实践",
    "category": "web"
  }
]
```

### project-insights.json 示例

```json
[
  {
    "type": "file_structure",
    "content": "{\"name\":\"mimo-cli-code\",\"version\":\"2.0.0\",...}",
    "timestamp": "2026-06-01T10:30:00.000Z"
  },
  {
    "type": "patterns",
    "content": "OOP类模式, 异步编程模式, TypeScript类型系统",
    "timestamp": "2026-06-01T10:30:01.000Z"
  }
]
```

## 特性说明

### ✅ 零配置
无需任何设置，启动软件即自动运行。

### ✅ 非阻塞
在后台线程运行，不影响正常的交互式使用。

### ✅ 自动持久化
所有学习内容自动保存到 `.mimo/` 目录。

### ✅ 持续进化
每次启动都会学习新内容，知识库不断积累。

### ✅ README自动更新
学习成果自动写入 README.md，保持文档最新。

## 命令行集成

Evolution Agent 集成在 MimoAgent 的初始化流程中：

```
启动软件
  ↓
MimoAgent.init()
  ↓
1. MCP工具
2. Hooks配置
3. 动态Agent
4. 会话存储
5. 创新功能
6. LSP诊断
7. 沙箱系统
8. RLM引擎
9. 审计日志
10. 🧬 自主进化 ← 新增
    ↓
    EvolutionAgent.init()
    EvolutionAgent.startEvolution() [后台]
  ↓
显示欢迎面板
  ↓
进入交互模式
```

## 故障排除

### 进化过程卡住
Evolution Agent 在后台运行，不会阻塞主流程。如果遇到问题，会在控制台显示警告。

### README未更新
检查是否有写入权限：
```bash
ls -la README.md
```

### 记忆文件损坏
删除 `.mimo/` 目录重启：
```bash
rm -rf .mimo/
npm run dev
```

## 高级配置

### 禁用自主进化
在 `~/.mimo/config.toml` 中添加：
```toml
[evolution]
enabled = false
```

### 自定义学习主题
修改 `src/evolution/agent.ts` 中的 `topics` 数组。

---

**版本**: v2.0.0
**最后更新**: 2026-06-01
