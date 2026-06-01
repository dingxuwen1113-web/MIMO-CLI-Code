# MIMO CLI Code

**Xiaomi Terminal AI Coding Agent** — 终端 AI 编程智能体，由 MiMO AI 驱动。

MIMO CLI Code 是一个功能丰富的终端 AI 编程助手，基于 Anthropic Claude API 构建，提供交互式和非交互式两种模式，支持代码编写、调试、重构、浏览器自动化、Git 操作、安全审计等全方位开发任务。

## 功能特性

### 核心能力

- **多模式运行** — Plan / Agent / YOLO 三种模式，按需切换
- **智能模型路由** — 自动根据任务复杂度选择 `mimo-v2.5-pro` 或 `mimo-v2.5`
- **流式输出** — 实时流式显示 AI 响应
- **思考模式** — 支持 Claude extended thinking，编程任务自动启用
- **上下文管理** — 自动压缩历史对话，防止超出 token 限制
- **会话持久化** — 会话自动保存与恢复（`/resume`）
- **非交互模式** — 支持 `--print` / `--json` 用于 CI/CD 管道

### 工具系统

| 类别 | 工具 |
|------|------|
| **文件操作** | `file_read`, `file_write`, `file_edit`, `glob_match`, `grep_search` |
| **Shell** | `shell_exec` |
| **Git** | `git_status`, `git_diff`, `git_log`, `git_branch`, `git_commit`, `git_checkout`, `git_stash`, `git_blame`, `git_pr`, `git_issue`, `git_release` |
| **浏览器自动化** | `browser_navigate`, `browser_click`, `browser_type`, `browser_screenshot`, `browser_find`, `browser_execute_js`, GIF 录制等 |
| **桌面控制** | `computer_screenshot`, `computer_click`, `computer_type`, `computer_key`, `computer_drag` |
| **Web** | `web_search`, `web_fetch` |
| **Jupyter** | `notebook_read`, `notebook_edit` |
| **代码审查** | `auto_review` (自动审查 + 可选修复) |
| **安全扫描** | `cyber_scan` |
| **LSP 诊断** | 文件编辑后自动运行类型检查 |
| **RLM** | 递归 LM 会话管理 |
| **审计** | 审计日志查询与导出 |

### 55 项创新功能

MIMO CLI 内置 55 项创新功能，分为五大层级：

**感知层 (1-7)** — 预测性意图、代码 DNA 模式识别、上下文记忆图、语义搜索、实时文件系统监控、智能环境检测、上下文相关性衰减

**质量层 (8-15)** — 变异测试、技术债务评分、实时代码审查、API 契约验证、死代码检测、破坏性变更检测、智能 Lint、迁移生成器

**开发者体验层 (16-24)** — 代码考古、代码导览、时间旅行调试、会话分叉、多模态支持、命令建议、模糊导航、快捷键系统、依赖图

**DevOps 协作层 (25-34)** — CI 优化器、部署看门狗、供应链分析、容器沙箱、环境一致性、团队知识库、PR 模板、所有权追踪、异步协作、团队配置同步

**高级层 (35-55)** — 成本预测、预算拆分、并行 Diff、缓存监控、智能上下文、批处理优化、威胁建模、合规检查、泄露扫描、沙箱可视化、多 Agent 辩论、传播分析、自适应学习、回归测试、多仓库支持、ADR 生成、流式 Diff、分屏、通知系统、健康仪表盘、活跃度热力图

### 技能与 Agent 系统

- **技能注册** — 内置技能自动匹配用户意图，注入相关知识
- **动态 Agent** — 在 `.mimo/agents/` 或 `.claude/agents/` 中添加 `.md` 文件即可定义自定义 Agent
- **专家团队** — 覆盖桌面、移动、游戏、专业领域、运维等多个领域的专家 Agent
- **子代理** — `/agents spawn <任务>` 生成并行子代理执行任务

### MCP 支持

支持 Model Context Protocol，可从 `.claude/mcp.json`、`.mimo/mcp.json` 加载外部 MCP 服务器，将外部工具无缝注入到 Agent 中。

### 记忆系统

- 自动从对话中提取关键信息并持久化
- 支持按类型、标签搜索记忆
- 支持导入/导出记忆（`mimo memory export`）
- 每 5 轮自动执行记忆提取

### 🧬 自主进化系统

**Autonomous Evolution Agent** — 当软件启动时自动运行的智能学习系统：

- **自动学习项目结构** — 分析 package.json、依赖关系、脚本配置
- **Web 技术学习** — 访问网络学习最新的编程最佳实践和工具
- **代码模式分析** — 自动检测项目中的设计模式和编码规范
- **文件洞察提取** — 读取所有重要文件并提取关键信息
- **自动更新 README** — 将学习成果自动写入 README.md 的进化日志
- **记忆持久化** — 所有学习内容保存到 `.mimo/evolution-memory.json`

进化过程完全自动化，无需用户干预。启动软件即开始学习。

### 📚 Agent知识库系统

**Agent Knowledge Base** — 统一的知识库，所有Agent都可以通过知识库进行升级：

- **统一知识存储** — 所有知识集中存储在 `.mimo/knowledge-base.json`
- **智能知识推荐** — 根据Agent的专业领域推荐相关知识
- **Agent升级机制** — Agent通过学习知识库中的内容来提升能力
- **知识分类管理** — 按类别、标签、来源组织知识
- **使用统计追踪** — 记录知识的使用频率和效果
- **自动清理机制** — 自动清理过期和低价值知识

**知识来源**：
- 🌐 **Web学习** — 从网络学习最新技术
- 💻 **代码分析** — 从项目代码中提取模式
- 📖 **文档阅读** — 从技术文档中学习
- 👨‍🏫 **专家知识** — 从行业专家的知识中学习
- 👤 **用户交互** — 从用户交互中学习

**Agent升级方式**：
```bash
# 查看知识库统计
/knowledge stats

# 搜索知识
/knowledge search React性能优化

# 导出知识库
/knowledge export markdown

# 查看可用升级
/upgrade list

# 自动升级指定Agent
/upgrade auto frontend-react-expert

# 批量升级所有专家
/upgrade auto-all
```

**知识库特性**：
- ✅ **智能推荐** — 根据Agent专业领域推荐知识
- ✅ **自动学习** — Agent启动时自动从知识库学习
- ✅ **效果追踪** — 记录知识应用的效果
- ✅ **版本管理** — 知识更新时保留历史版本
- ✅ **共享机制** — 知识可在多个Agent间共享

### 🖥️ 内置代码编辑器

**Built-in Code Editor** — 在软件内部直接编程、编译、测试，通过AI智能修复错误：

- **多语言支持** — 支持12种主流编程语言
- **代码编辑** — 创建、编辑、保存代码文件
- **编译检查** — 实时编译检查，发现语法和类型错误
- **运行测试** — 直接运行代码和测试
- **AI智能修复** — 通过大模型自动分析和修复错误
- **错误诊断** — 精确定位错误位置和原因

**支持的编程语言**：

| 语言 | 扩展名 | 编译 | 运行 | 测试 |
|------|--------|------|------|------|
| TypeScript | .ts | ✅ tsc | ✅ tsx | ✅ vitest |
| JavaScript | .js | - | ✅ node | ✅ jest |
| Python | .py | - | ✅ python3 | ✅ pytest |
| Rust | .rs | ✅ cargo build | ✅ cargo run | ✅ cargo test |
| Go | .go | ✅ go build | ✅ go run | ✅ go test |
| Java | .java | ✅ javac | ✅ java | ✅ mvn test |
| C++ | .cpp | ✅ g++ | ✅ ./output | ✅ ctest |
| C# | .cs | ✅ dotnet build | ✅ dotnet run | ✅ dotnet test |
| Ruby | .rb | - | ✅ ruby | ✅ minitest |
| PHP | .php | - | ✅ php | ✅ phpunit |
| Swift | .swift | ✅ swiftc | ✅ swift | ✅ swift test |
| Kotlin | .kt | ✅ kotlinc | ✅ kotlin | ✅ gradle test |

**使用方式**：
```bash
# 创建/打开文件
/editor open main.ts              # 创建TypeScript文件
/editor open app.py python        # 创建Python文件
/editor open lib.rs rust          # 创建Rust文件

# 编辑代码
/editor edit console.log("Hello World")
/editor edit def main(): print("Hi")

# 保存文件
/editor save

# 编译检查
/editor compile                   # 检查语法和类型错误

# 运行代码
/editor run                       # 运行当前文件
/editor run arg1 arg2             # 带参数运行

# 运行测试
/editor test                      # 运行测试套件

# AI智能修复
/editor repair                    # AI分析错误并生成修复建议
/editor apply <id>                # 应用指定修复建议
/editor apply-all                 # 应用所有高置信度修复

# 查看状态
/editor status                    # 查看当前文件和编辑器状态
```

**AI智能修复功能**：
- ✅ **自动错误分析** — 分析编译错误类型和原因
- ✅ **智能修复建议** — 生成针对性的修复代码
- ✅ **置信度评估** — 评估修复建议的可靠性
- ✅ **一键应用** — 快速应用修复建议
- ✅ **批量修复** — 批量应用所有高置信度修复
- ✅ **重新编译验证** — 应用修复后自动重新编译

**错误类型支持**：
- 缺失导入 (missing_import)
- 未定义变量 (undefined_variable)
- 类型错误 (type_error)
- 语法错误 (syntax_error)
- 空引用错误 (null_reference)
- 缺失参数 (missing_argument)
- 异步错误 (async_error)

**示例工作流**：
```bash
# 1. 创建新文件
/editor open calculator.ts

# 2. 编写代码
/editor edit function add(a: number, b: number): number { return a + b; }

# 3. 编译检查
/editor compile

# 4. 发现错误？AI修复
/editor repair

# 5. 应用修复
/editor apply-all

# 6. 运行测试
/editor test

# 7. 保存
/editor save
```

### 安全体系

- **命令注入检测** — 阻止危险 shell 命令
- **路径遍历防护** — 防止越权文件访问
- **凭据扫描** — 检测泄露的密钥和凭据
- **沙箱执行** — 可选的隔离执行环境
- **权限矩阵** — 按模式（plan/agent/yolo）控制工具权限
- **Cyber Safety** — 提示注入防护、数据外泄检测

## 安装

### 前置要求

- Node.js >= 18
- Anthropic API Key（或 MIMO 代理端点）

### 安装

```bash
# 克隆项目
git clone https://github.com/dingxuwen1113-web/MIMO-CLI-Code
cd mimo-cli-code

# 安装依赖
npm install

# 构建
npm run build
```

### 配置

复制 `.env.example` 为 `.env` 并填入 API Key：

```bash
cp .env.example .env
```

```env
ANTHROPIC_API_KEY=your-api-key-here
MIMO_MODEL=auto
MIMO_MODE=agent
# ANTHROPIC_BASE_URL=https://your-proxy.example.com
```

或运行初始化向导：

```bash
npx mimo init
```

配置文件也会读取 `~/.mimo/config.toml`。

## 使用

### 交互模式

```bash
# 直接启动交互式 REPL
npm run dev

# 或构建后使用
node dist/index.js

# 带初始提示启动
node dist/index.js "帮我写一个 Express API"
```

### 非交互模式

```bash
# 文本输出
mimo --print "解释这段代码"

# JSON 输出
mimo --json "重构这个函数"

# 通过管道传入
echo "review this PR" | mimo --print

# 自定义超时
mimo --print --timeout 60 "快速任务"
```

### CLI 子命令

```bash
# 初始化配置
mimo init

# 记忆管理
mimo memory list
mimo memory show <id>
mimo memory search <query>
mimo memory remove <id>
mimo memory export
mimo memory import <path>

# 技能管理
mimo skills list
mimo skills show <id>

# 查看配置
mimo config

# MCP 服务器信息
mimo mcp

# 列出动态 Agent
mimo agents

# 列出 Slash 命令
mimo commands

# 列出 55 项创新功能
mimo features
mimo features --category "感知层"

# 定时任务
mimo schedule list
mimo schedule create <id> --prompt "任务描述" --cron "0 9 * * *"
mimo schedule remove <id>
```

### 交互式命令

在交互模式中可使用以下命令：

```
/help           显示帮助
/mode [mode]    切换模式 (plan|agent|yolo)
/model          显示当前模型
/memory         记忆统计
/skills         技能列表
/stats          Token 用量
/context        上下文窗口使用情况
/compact        压缩上下文
/clear          清空对话
/plan [cmd]     计划管理 (new|add|done|skip|approve|show|clear)
/todos [cmd]    待办事项 (add|done|clear)
/tasks [cmd]    持久任务 (add|done|clear)
/agents [cmd]   Agent 管理 (spawn|kill)
/rlm [cmd]      RLM 递归 LM 管理 (open|list|close)
/audit [cmd]    审计日志 (report|query|export)
/sandbox        沙箱状态
/diagnostics    LSP 诊断状态
/constitution   宪法系统摘要
/undo           回滚上一次文件编辑
/backtrack      回退到上一个用户 prompt
/restore [id]   恢复到指定快照
/fork [desc]    在当前点分叉会话
/timeline       显示会话时间线
/checkpoints    列出文件快照
/resume         恢复上一个会话
/sessions       列出历史会话
/chapter <name> 添加上下文章节
/thinking       切换思考模式
/team           列出专家开发团队
/commands       可用 Slash 命令
/mcp            MCP 服务器状态
/init [--force] 分析项目并生成 CLAUDE.md
/review         代码审查
/quit           退出
```

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Tab` | 切换模式 (plan → agent → yolo) |
| `Shift+Tab` | 切换推理强度 |
| `Ctrl+K` | 命令面板 |
| `Ctrl+L` | 清屏 |
| `Ctrl+C` | 中断 / 退出 |
| `F1` | Plan 模式 |
| `F2` | Agent 模式 |
| `F3` | YOLO 模式 |
| `F4` | 思考模式 |
| `F5` | mimo-v2.5-pro 模型 |
| `F6` | mimo-v2.5 模型 |

## SDK

MIMO CLI 提供编程接口，可在 Node.js 中无头调用：

```typescript
import { MimoSDK } from 'mimo-cli-code/sdk';

const sdk = new MimoSDK({ model: 'mimo-v2.5-pro' });
const result = await sdk.run('Create a hello-world Express app');
console.log(result.response);
await sdk.dispose();
```

配置优先级（从高到低）：
1. 构造函数参数
2. 环境变量 (`ANTHROPIC_API_KEY`, `MIMO_MODEL`, `MIMO_MODE`)
3. `~/.mimo/config.toml` 和 settings.json
4. 内置默认值

## 项目规则

MIMO CLI 支持多层级项目规则文件（从低到高优先级）：

1. `~/.claude/CLAUDE.md` — 全局规则
2. `~/.mimo/rules.md` — 全局 MIMO 规则
3. `CLAUDE.md` — 项目根目录
4. `.mimo/rules.md` — 项目 MIMO 规则
5. `MIMO.md` — 项目根目录
6. `.claude/CLAUDE.md` — 目录级规则

运行 `/init` 可自动分析项目并生成 `CLAUDE.md`。

## 运行模式

| 模式 | 说明 |
|------|------|
| **Plan** | 仅规划不执行，适合审查方案 |
| **Agent** | 需确认的工具调用（默认） |
| **YOLO** | 全自动执行，无需确认 |

## 开发

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 运行测试
npm test

# 监听模式测试
npm run test:watch

# 启动 MCP 记忆服务器
npm run mcp

# 清理构建产物
npm run clean
```

## 技术栈

- **运行时**: Node.js + TypeScript
- **AI SDK**: `@anthropic-ai/sdk`
- **CLI 框架**: `commander`
- **配置**: `dotenv`, `toml`, `zod`
- **终端 UI**: `chalk`, `ora`, ANSI 转义序列
- **测试**: `vitest`
- **Diff**: `diff` 库
- **浏览器自动化**: `playwright`（可选）

## 自主进化系统

MIMO CLI 内置自主进化Agent，会在每次启动时自动运行：

### 进化流程

1. **项目结构学习** — 读取 package.json，分析依赖和配置
2. **Web 技术学习** — 搜索最新的编程最佳实践
3. **代码模式分析** — 检测项目中的设计模式
4. **文件洞察提取** — 读取重要文件并提取关键信息
5. **README 更新** — 自动将学习成果写入 README.md

### 存储位置

- 进化记忆: `.mimo/evolution-memory.json`
- 项目洞察: `.mimo/project-insights.json`
- 学习技能: `.mimo/learned-skills.json`
- 知识库: `.mimo/knowledge-base.json`
- 学习目标: `.mimo/learning-goals.json`
- README 日志: `README.md` 的 `













## 🧬 自主进化日志

*最后更新: 2026-06-01T14:08:30.848Z*

### 学习记忆

- **Node.js performance optimization** (web) - 2026-06-01
- **AI coding assistant features** (web) - 2026-06-01
- **TypeScript best practices 2026** (web) - 2026-06-01
- **Node.js performance optimization** (web) - 2026-06-01
- **AI coding assistant features** (web) - 2026-06-01

### 项目洞察

- **patterns**: 异步编程模式, TypeScript类型系统, 模块化导出, OOP类模式...
- **documentation**: README.md: # MIMO CLI Code

**Xiaomi Terminal AI Coding Agent** — 终端 AI 编程智能体，由 MiMO AI 驱动。

MIM...
- **documentation**: LICENSE: MIT License

Copyright (c) 2026 酒樽

Permission is hereby granted, free of charge, to an...
- **documentation**: .env.example: # MIMO CLI 环境变量配置
# 使用官方Anthropic SDK连接方式

# API端点（必须）
ANTHROPIC_BASE_URL=https://toke...
- **file_structure**: 源码文件数量: 269 个 TypeScript 文件...

---
*由 Evolution Agent 自动生成*

## 👥 行业专家系统

MIMO CLI 内置 **18 位行业专家**，覆盖各行各业，随时可以调用：

### 可用专家列表

| 行业 | 专家 | 专业领域 |
|------|------|----------|
| **前端开发** | React 专家 | React, Next.js, Redux, SSR |
| **后端开发** | Node.js 专家 | Express, NestJS, GraphQL, 数据库 |
| **全栈开发** | Next.js 专家 | Server Components, 全栈架构 |
| **DevOps** | DevOps 专家 | Docker, K8s, CI/CD, 云原生 |
| **数据工程** | 数据库专家 | PostgreSQL, MongoDB, Redis, 优化 |
| **安全** | 网络安全专家 | OWASP, 渗透测试, 密码学 |
| **移动端** | React Native 专家 | 跨平台开发, 性能优化 |
| **人工智能** | AI/ML 专家 | PyTorch, LLM, RAG, MLOps |
| **数据工程** | 数据工程专家 | Spark, Airflow, Kafka, ETL |
| **云计算** | 云架构专家 | AWS, Azure, GCP, Serverless |
| **质量保证** | 测试工程专家 | Jest, Cypress, TDD, BDD |
| **性能工程** | 性能优化专家 | Core Web Vitals, 缓存, CDN |
| **Web3** | 区块链专家 | Solidity, DeFi, 智能合约 |
| **游戏开发** | 游戏开发专家 | Unity, Unreal, 多人游戏 |
| **物联网** | 嵌入式/IoT 专家 | Arduino, MQTT, 边缘计算 |
| **产品管理** | 产品管理专家 | 策略, 用户研究, 敏捷 |
| **技术文档** | 技术写作专家 | API 文档, 用户指南, 教程 |

### 使用方式

**自动匹配** — 输入相关关键词，系统自动匹配最佳专家：

```
"帮我优化React组件性能"  → React 专家
"设计一个RESTful API"   → Node.js 后端专家
"部署到Kubernetes"      → DevOps 专家
"修复SQL查询性能"       → 数据库专家
"进行安全审计"          → 网络安全专家
```

**手动查看** — 使用命令查看所有专家：

```
/experts    — 列出所有行业专家
/team       — 列出专家开发团队
/evolution  — 查看进化系统状态
/learn      — 查看学习报告
```

### 专家系统特性

- ✅ **智能匹配** — 根据任务关键词自动匹配最佳专家
- ✅ **专家推荐** — 推荐相关领域的其他专家
- ✅ **使用统计** — 记录专家使用频率，优化推荐
- ✅ **知识注入** — 专家知识自动注入到对话上下文
- ✅ **持续学习** — 从每次交互中学习和积累

### 专家知识库

每位专家都包含：
- **系统提示词** — 专业领域的工作原则和最佳实践
- **专业技能** — 擅长的技术栈和工具
- **行业知识** — 领域特定的知识和经验
- **代码规范** — 编码标准和质量要求

## 项目结构

```
src/
├── index.ts              # CLI 入口
├── core/                 # 核心引擎
│   ├── agent.ts          # 主 Agent 循环
│   ├── router.ts         # 智能模型路由
│   ├── charter.ts        # 宪法系统
│   ├── compressor.ts     # 上下文压缩
│   ├── checkpoint.ts     # 文件快照
│   ├── retry.ts          # 重试管理
│   ├── mode.ts           # 权限模式
│   ├── environment.ts    # 环境检测
│   └── constitution.ts   # 宪法规则
├── tools/                # 工具注册与实现
│   ├── registry.ts       # 工具注册中心
│   ├── browser/          # 浏览器自动化
│   ├── computer/         # 桌面控制
│   ├── git/              # Git 工具
│   ├── web/              # Web 搜索/抓取
│   ├── review/           # 代码审查
│   ├── lsp/              # LSP 诊断
│   ├── notebook/         # Jupyter
│   └── image/            # 图像处理
├── features/             # 55 项创新功能
│   ├── perception/       # 感知层
│   ├── quality/          # 质量层
│   ├── devex/            # 开发者体验层
│   ├── devops-collab/    # DevOps 协作层
│   └── advanced/         # 高级层
├── security/             # 安全体系
├── memory/               # 记忆系统
├── skills/               # 技能系统
├── dynamic-agents/       # 动态 Agent
├── subagent/             # 子代理管理
├── hooks/                # Hook 系统
├── mcp/                  # MCP 客户端
├── scheduler/            # 定时任务
├── session/              # 会话回滚
├── rlm/                  # 递归 LM
├── audit/                # 审计日志
├── sandbox/              # 沙箱执行
├── sdk/                  # 编程 SDK
├── task/                 # 任务管理
├── tui/                  # 终端 UI
│   ├── splash.ts         # 启动画面
│   ├── output.ts         # 输出格式化
│   └── animations.ts     # 动画效果
└── config/               # 配置加载
```

## 许可证

MIT
