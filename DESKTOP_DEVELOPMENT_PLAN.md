# MIMO CLI Code 桌面版开发方案

**极简风格 · 小米橙黄色主题 · 一看就懂**

---

## 🎯 项目概述

将 MIMO CLI Code（终端AI编程智能体）转换为桌面应用程序，保留所有核心功能，提供更友好的GUI界面。

---

## 🎨 UI 色彩方案（小米橙黄色）

### 核心色板

```
┌─────────────────────────────────────────────┐
│  主色调（橙色系）                             │
├─────────────────────────────────────────────┤
│  ORANGE:     #FFA500 (255,165,0)   - 主橙色  │
│  ORANGE_L:   #FFC333 (255,195,51) - 浅橙色  │
│  ORANGE_D:   #CC5500 (204,85,0)   - 深橙色  │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  辅助色                                      │
├─────────────────────────────────────────────┤
│  WHITE:      #FFFFFF (97亮度)    - 白色文字  │
│  GRAY:       #808080 (90亮度)    - 灰色文字  │
│  GRAY_DIM:   #4A4A4A (暗灰)      - 次要信息  │
│  BACKGROUND: #1A1A1A (深黑灰)    - 背景色   │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  状态色                                      │
├─────────────────────────────────────────────┤
│  SUCCESS:    #32CD32 (绿色)      - 成功     │
│  ERROR:      #FF4444 (红色)      - 错误     │
│  WARNING:    #FFD700 (黄色)      - 警告     │
│  INFO:       #00BFFF (蓝色)      - 信息     │
└─────────────────────────────────────────────┘
```

### 色彩应用原则

- **主背景**: 深色模式 (#1A1A1A) — 减少视觉疲劳
- **主强调**: 橙色 (#FFA500) — 用于按钮、边框、活跃状态
- **文字层级**: 白色(主要) → 灰色(次要) → 暗灰(最弱)
- **极简原则**: 最多3种主要颜色，保持视觉统一

---

## 🏗️ 技术栈选择

### 推荐方案：Electron + React + TypeScript

```
┌─────────────────────────────────────────────┐
│  前端框架                                    │
├─────────────────────────────────────────────┤
│  • Electron 20+      - 桌面容器              │
│  • React 18          - UI组件库              │
│  • TypeScript 5+     - 类型安全              │
│  • Tailwind CSS 3+   - 快速样式              │
│  • Lucide Icons      - 图标库               │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  状态管理                                    │
├─────────────────────────────────────────────┤
│  • Zustand           - 轻量级状态管理        │
│  • React Query       - 数据请求管理          │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  桌面集成                                    │
├─────────────────────────────────────────────┤
│  • @electron/remote   - 进程通信            │
│  • electron-store     - 本地配置存储         │
└─────────────────────────────────────────────┘
```

### 备选方案

- **Tauri + React**: 更轻量、更现代（但生态稍弱）
- **VS Code Extension**: 直接集成到VS Code（适合编辑器深度用户）

---

## 📦 项目结构

```
mimo-desktop/
├── 📁 electron/                    # Electron 主进程
│   ├── main.ts                    # 主进程入口
│   ├── preload.ts                 # 预加载脚本
│   └── ipc-handlers.ts           # IPC 处理器
│
├── 📁 src/                         # React 前端
│   ├── 📁 components/             # UI组件库
│   │   ├── 📁 common/            # 通用组件
│   │   │   ├── Button.tsx        # 橙色按钮
│   │   │   ├── Input.tsx         # 输入框
│   │   │   ├── Panel.tsx         # 面板容器
│   │   │   └── StatusBar.tsx     # 状态栏
│   │   │
│   │   ├── 📁 chat/             # 聊天界面
│   │   │   ├── ChatWindow.tsx   # 聊天窗口
│   │   │   ├── MessageBubble.tsx # 消息气泡
│   │   │   ├── ToolCall.tsx     # 工具调用展示
│   │   │   └── CodeBlock.tsx    # 代码块
│   │   │
│   │   ├── 📁 sidebar/          # 侧边栏
│   │   │   ├── Sidebar.tsx      # 侧边栏主容器
│   │   │   ├── SessionList.tsx  # 会话列表
│   │   │   ├── FileManager.tsx  # 文件管理
│   │   │   └── ToolsPanel.tsx   # 工具面板
│   │   │
│   │   ├── 📁 toolbar/          # 工具栏
│   │   │   ├── Toolbar.tsx      # 顶部工具栏
│   │   │   ├── ModeSwitch.tsx   # 模式切换
│   │   │   └── ModelSelector.tsx # 模型选择
│   │   │
│   │   └── 📁 terminal/         # 终端集成
│   │       ├── Terminal.tsx     # 终端组件
│   │       └── OutputViewer.tsx # 输出查看器
│   │
│   ├── 📁 hooks/                # React Hooks
│   │   ├── useChat.ts          # 聊天功能
│   │   ├── useTools.ts         # 工具管理
│   │   ├── useMimo.ts          # MIMO SDK封装
│   │   └── useTheme.ts         # 主题管理
│   │
│   ├── 📁 stores/              # 状态管理
│   │   ├── chatStore.ts        # 聊天状态
│   │   ├── sessionStore.ts     # 会话状态
│   │   └── settingsStore.ts    # 设置状态
│   │
│   ├── 📁 styles/              # 样式系统
│   │   ├── globals.css         # 全局样式
│   │   ├── theme.ts           # 主题定义
│   │   └── animations.css     # 动画效果
│   │
│   ├── 📁 utils/               # 工具函数
│   │   ├── ipc.ts             # IPC通信
│   │   ├── parser.ts          # 输出解析
│   │   └── formatter.ts       # 格式化工具
│   │
│   ├── App.tsx                # 根组件
│   └── main.tsx              # 入口文件
│
├── 📁 assets/                  # 静态资源
│   ├── icons/               # 应用图标
│   ├── fonts/               # 字体文件
│   └── images/              # 图片资源
│
├── 📁 dist/                    # 构建产物
├── 📄 package.json
├── 📄 tsconfig.json
├── 📄 electron-builder.json    # Electron打包配置
├── 📄 vite.config.ts          # Vite构建配置
├── 📄 tailwind.config.js      # Tailwind配置
└── 📄 README.md
```

---

## 🎨 UI 设计规范

### 极简风格设计原则

```
┌─────────────────────────────────────────────┐
│  布局结构                                    │
├─────────────────────────────────────────────┤
│  ┌──────────┬──────────────────────────┐    │
│  │  Sidebar │     Chat/Content Area    │    │
│  │  (左侧)  │         (主区域)         │    │
│  │  200px   │          Flex           │    │
│  └──────────┴──────────────────────────┘    │
│  ┌──────────────────────────────────────┐   │
│  │           Toolbar (顶部)             │   │
│  │      60px 高，含模式/模型选择         │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │           Input (底部)               │   │
│  │    80px 高，大输入框+发送按钮         │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 组件设计规范

#### 1. 按钮设计

```
┌─────────────────────────────────────────────┐
│  主按钮 (Primary)                           │
├─────────────────────────────────────────────┤
│  背景: ORANGE (#FFA500)                     │
│  文字: WHITE (#FFFFFF)                      │
│  圆角: 6px                                  │
│  阴影: 0 2px 4px rgba(255,165,0,0.3)       │
│  悬停: ORANGE_L (#FFC333)                   │
│  按下: ORANGE_D (#CC5500)                   │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  次要按钮 (Secondary)                       │
├─────────────────────────────────────────────┤
│  背景: transparent                          │
│  边框: 1px ORANGE (#FFA500)                 │
│  文字: ORANGE (#FFA500)                     │
│  悬停: rgba(255,165,0,0.1) 背景             │
└─────────────────────────────────────────────┘
```

#### 2. 输入框设计

```
┌─────────────────────────────────────────────┐
│  输入框样式                                  │
├─────────────────────────────────────────────┤
│  背景: #2A2A2A (深灰)                       │
│  边框: 1px #3A3A3A                          │
│  圆角: 8px                                  │
│  内边距: 12px                               │
│  聚焦: 边框变 ORANGE，发光效果               │
│  占位符: GRAY_DIM                           │
└─────────────────────────────────────────────┘
```

#### 3. 面板设计

```
┌─────────────────────────────────────────────┐
│  Panel/卡片                                  │
├─────────────────────────────────────────────┤
│  背景: #1E1E1E                              │
│  边框: 1px #2A2A2A                          │
│  圆角: 8px                                  │
│  阴影: 0 2px 8px rgba(0,0,0,0.3)           │
│  顶部高亮: 2px ORANGE（活跃状态）            │
└─────────────────────────────────────────────┘
```

#### 4. 文字层级

```
┌─────────────────────────────────────────────┐
│  Typography                                 │
├─────────────────────────────────────────────┤
│  主标题:   18px, Bold, WHITE               │
│  副标题:   14px, Medium, WHITE             │
│  正文:     14px, Regular, GRAY (#CCCCCC)    │
│  辅助文字: 12px, Regular, GRAY_DIM (#808080)│
│  代码:     Monospace, 14px, 浅黄背景        │
└─────────────────────────────────────────────┘
```

---

## 🎯 核心功能模块

### 1. 聊天窗口 (ChatWindow.tsx)

```
功能点：
✅ 消息流显示（Markdown渲染）
✅ 代码块高亮 + 复制按钮
✅ 工具调用可视化（折叠/展开）
✅ 思考过程展示（可折叠）
✅ 流式打字机效果
✅ 消息搜索

设计细节：
- 消息气泡：圆角8px，用户消息右对齐（橙色边框），AI消息左对齐（灰色背景）
- 时间戳：显示在消息下方，小号灰色文字
- 代码块：左橙色边框指示器，深色背景，右上角复制按钮
```

### 2. 工具调用展示 (ToolCall.tsx)

```
功能点：
✅ 工具名称显示（带图标）
✅ 参数展示（可折叠JSON）
✅ 执行状态指示器（spinner/success/error）
✅ 执行结果预览
✅ 展开查看详情

设计细节：
- 折叠状态：橙色左边框 + 工具名称 + 状态图标
- 展开状态：完整参数和结果，代码格式化
- 执行中：橙色加载动画
```

### 3. 侧边栏 (Sidebar.tsx)

```
功能点：
✅ 会话列表（支持搜索）
✅ 文件浏览器（可选）
✅ 快捷操作面板
✅ 会话信息（token用量、模型）

设计细节：
- 宽度：200px，可折叠到48px（只显示图标）
- 背景：#1A1A1A
- 选中状态：橙色左边框 + 浅橙背景
- 底部：固定显示设置、帮助按钮
```

### 4. 工具栏 (Toolbar.tsx)

```
功能点：
✅ 模式切换（Plan/Agent/YOLO）
✅ 模型选择
✅ 新建会话
✅ 清空对话
✅ 会话信息

设计细节：
- 高度：60px
- 模式按钮：橙色填充表示当前模式
- 右侧：模型下拉菜单 + 设置图标
```

### 5. 输入区 (InputArea.tsx)

```
功能点：
✅ 多行输入（支持Shift+Enter换行）
✅ 快捷命令（/help等）
✅ 发送按钮（橙色）
✅ 文件拖拽上传
✅ 历史记录（上下箭头）

设计细节：
- 高度：自适应（最大200px）
- 发送按钮：橙色圆形，带纸飞机图标
- 底部：显示token估算
```

---

## 📐 界面线框图

### 主界面布局

```
┌────────────────────────────────────────────────────────────┐
│ ┌──────────┐ ┌────────────────────────────────────────┐    │
│ │          │ │  📁 Session 1  │  📁 Session 2  │  +   │    │
│ │ SIDEBAR  │ ├────────────────────────────────────────┤    │
│ │          │ │  Mode: [Plan] [Agent] [YOLO]           │    │
│ │ Sessions │ │  Model: mimo-v2.5-pro  ▼               │    │
│ │ -------- │ ├────────────────────────────────────────┤    │
│ │ 📁 Files │ │                                        │    │
│ │ 🛠 Tools │ │  User: 帮我创建一个Express API          │    │
│ │ ⚙️ Config│ │                                        │    │
│ │          │ │  MiMO: 我来帮你创建Express API...       │    │
│ │          │ │  ┌─────────────────────────────────┐   │    │
│ │          │ │  │ 🛠 file_write                   │   │    │
│ │          │ │  │    path: src/index.ts            │   │    │
│ │          │ │  │    ✓ 完成                       │   │    │
│ │          │ │  └─────────────────────────────────┘   │    │
│ │          │ │                                        │    │
│ ├──────────┤ ├────────────────────────────────────────┤    │
│ │          │ │  [Type your message...            ] [↑]│    │
│ └──────────┘ └────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────┘
```

### 工具调用展开视图

```
┌─────────────────────────────────────────┐
│  🛠 file_write                     [▼] │
│                                         │
│  Path: src/index.ts                    │
│                                         │
│  Content:                               │
│  ┌──────────────────────────────────┐  │
│  │ import express from 'express';   │  │
│  │ const app = express();           │  │
│  │ ...                              │  │
│  └──────────────────────────────────┘  │
│                                         │
│  Status: ✓ 已完成                       │
└─────────────────────────────────────────┘
```

---

## 🚀 开发步骤（4阶段）

### 阶段 1：基础框架搭建（2周）

```typescript
// 目标：搭建Electron + React项目骨架

1. 初始化项目
   - npx create-electron-vite mimo-desktop --template react-ts
   - 配置Vite、TypeScript、Tailwind CSS
   - 设置Electron打包（electron-builder）

2. 创建基础主题系统
   - 定义色彩常量（colors.ts）
   - 创建CSS变量（theme.css）
   - 实现深色/浅色模式切换

3. 搭建基础布局
   - AppLayout.tsx（主布局）
   - Sidebar.tsx（侧边栏骨架）
   - Toolbar.tsx（工具栏骨架）

4. Electron主进程设置
   - 窗口配置（尺寸、标题栏）
   - IPC通信基础
   - 系统托盘支持
```

### 阶段 2：核心聊天功能（3周）

```typescript
// 目标：实现AI聊天核心功能

1. MIMO SDK集成
   - 封装MimoSDK为React Hook（useMimo）
   - 实现流式消息处理
   - 支持多会话管理

2. 聊天组件开发
   - ChatWindow.tsx（消息列表）
   - MessageBubble.tsx（消息气泡）
   - InputArea.tsx（输入框）

3. 消息渲染系统
   - Markdown渲染器（使用react-markdown）
   - 代码块高亮（Prism.js或highlight.js）
   - 数学公式支持（可选）

4. 工具调用可视化
   - ToolCall.tsx（工具调用卡片）
   - 参数/结果展示
   - 执行状态动画

5. 流式输出
   - 实现打字机效果
   - 支持中断生成
```

### 阶段 3：高级功能（3周）

```typescript
// 目标：实现所有CLI功能的GUI版本

1. 会话管理系统
   - 会话列表（搜索、过滤）
   - 会话持久化
   - 会话导入/导出

2. 文件管理集成
   - 文件浏览器组件
   - 文件预览（代码、图片、Markdown）
   - 文件拖拽支持

3. 工具集成面板
   - Git操作界面
   - 浏览器自动化控制
   - 浏览器预览窗口

4. 配置管理
   - 设置界面（模型、API Key、主题等）
   - 配置文件编辑
   - 环境变量管理

5. 快捷键系统
   - 全局快捷键
   - 自定义快捷键
   - 命令面板（Cmd/Ctrl+K）
```

### 阶段 4：优化与发布（2周）

```typescript
// 目标：优化性能、测试、打包发布

1. 性能优化
   - 虚拟滚动（长对话）
   - 懒加载组件
   - 状态管理优化

2. 测试
   - 单元测试（Jest/Vitest）
   - E2E测试（Playwright）
   - 用户体验测试

3. 打包发布
   - Electron打包（Windows、macOS、Linux）
   - 自动更新（electron-updater）
   - 安装包签名

4. 文档与示例
   - 用户手册
   - 开发者文档
   - 示例项目
```

---

## 📝 开发任务清单

### Week 1-2：基础框架
- [ ] 项目初始化（Electron + React + Vite + TypeScript）
- [ ] 色彩系统实现（theme.ts + CSS变量）
- [ ] 基础布局组件（AppLayout、Sidebar、Toolbar）
- [ ] Electron主进程和IPC设置
- [ ] 基础主题切换功能

### Week 3-5：核心聊天
- [ ] MimoSDK封装（useMimo hook）
- [ ] ChatWindow组件（消息列表）
- [ ] MessageBubble组件（消息渲染）
- [ ] InputArea组件（输入框）
- [ ] Markdown/代码渲染
- [ ] ToolCall组件（工具调用）
- [ ] 流式输出实现

### Week 6-8：高级功能
- [ ] 会话管理系统
- [ ] 文件浏览器组件
- [ ] Git操作界面
- [ ] 设置界面
- [ ] 快捷键系统
- [ ] 命令面板

### Week 9-10：优化发布
- [ ] 性能优化
- [ ] 测试覆盖
- [ ] 打包配置
- [ ] 用户文档

---

## 🔧 技术实现细节

### 1. 主题系统实现

```typescript
// src/styles/theme.ts

export const theme = {
  colors: {
    // 主色调
    primary: {
      main: '#FFA500',
      light: '#FFC333',
      dark: '#CC5500',
    },

    // 背景色
    background: {
      default: '#1A1A1A',
      paper: '#1E1E1E',
      elevated: '#2A2A2A',
    },

    // 文字色
    text: {
      primary: '#FFFFFF',
      secondary: '#CCCCCC',
      disabled: '#808080',
    },

    // 状态色
    status: {
      success: '#32CD32',
      error: '#FF4444',
      warning: '#FFD700',
      info: '#00BFFF',
    },
  },

  typography: {
    fontFamily: {
      sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      mono: '"Fira Code", "JetBrains Mono", Consolas, monospace',
    },
    fontSize: {
      xs: '12px',
      sm: '14px',
      base: '14px',
      lg: '16px',
      xl: '18px',
    },
  },

  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
  },

  borderRadius: {
    sm: '4px',
    md: '6px',
    lg: '8px',
    full: '9999px',
  },
};
```

### 2. React Hook - useMimo

```typescript
// src/hooks/useMimo.ts

import { useState, useCallback } from 'react';
import { MimoSDK } from 'mimo-cli-code/sdk';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  timestamp: Date;
}

interface ToolCall {
  id: string;
  name: string;
  params: any;
  result?: any;
  status: 'pending' | 'running' | 'success' | 'error';
}

export function useMimo() {
  const [sdk] = useState(() => new MimoSDK({ model: 'mimo-v2.5-pro' }));
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const sendMessage = useCallback(async (content: string) => {
    setIsGenerating(true);

    // 添加用户消息
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    // 添加AI消息占位
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, assistantMessage]);

    // 流式生成
    const stream = sdk.stream(content);
    for await (const chunk of stream) {
      if (chunk.type === 'text') {
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessage.id
            ? { ...msg, content: msg.content + chunk.text }
            : msg
        ));
      } else if (chunk.type === 'tool_call') {
        // 处理工具调用
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessage.id
            ? {
                ...msg,
                toolCalls: [...(msg.toolCalls || []), {
                  id: chunk.id,
                  name: chunk.name,
                  params: chunk.params,
                  status: 'running'
                }]
              }
            : msg
        ));
      }
    }

    setIsGenerating(false);
  }, [sdk]);

  return {
    messages,
    isGenerating,
    sendMessage,
    clearMessages: () => setMessages([]),
  };
}
```

### 3. Electron IPC 通信

```typescript
// electron/preload.ts

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // 文件操作
  readFile: (path: string) => ipcRenderer.invoke('file:read', path),
  writeFile: (path: string, content: string) =>
    ipcRenderer.invoke('file:write', path, content),

  // 配置
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (config: any) => ipcRenderer.invoke('config:set', config),

  // 系统
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => ipcRenderer.invoke('app:platform'),
});
```

### 4. 主要组件示例

```tsx
// src/components/chat/ChatWindow.tsx

import React from 'react';
import { useMimo } from '../../hooks/useMimo';
import { MessageBubble } from './MessageBubble';
import { InputArea } from './InputArea';

export function ChatWindow() {
  const { messages, isGenerating, sendMessage } = useMimo();

  return (
    <div className="flex flex-col h-full">
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* 输入区 */}
      <div className="border-t border-[#2A2A2A] p-4">
        <InputArea
          onSend={sendMessage}
          disabled={isGenerating}
        />
      </div>
    </div>
  );
}
```

---

## 📚 参考资源

### 设计参考
- [Linear](https://linear.app) - 极简界面设计
- [Arc Browser](https://arc.net) - 侧边栏设计
- [Claude Web](https://claude.ai) - 聊天界面设计

### 技术文档
- [Electron Docs](https://www.electronjs.org/docs)
- [React Docs](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)

### 开源示例
- [ChatGPT Desktop](https://github.com/lencx/ChatGPT)
- [Continue](https://github.com/continuedev/continue) - AI代码助手

---

## ✅ 成功标准

### 功能完整性
- ✅ 所有CLI功能在GUI中可访问
- ✅ 支持所有55项创新功能
- ✅ 多会话支持
- ✅ 配置管理

### 性能指标
- ✅ 启动时间 < 2秒
- ✅ 内存占用 < 200MB
- ✅ 60fps 滚动流畅
- ✅ 响应延迟 < 100ms

### 用户体验
- ✅ 极简风格，无视觉噪音
- ✅ 清晰的信息层级
- ✅ 直观的工具调用展示
- ✅ 快捷键支持

### 代码质量
- ✅ TypeScript 100%覆盖
- ✅ 单元测试 > 80%覆盖
- ✅ 无Lint警告
- ✅ 文档完整

---

## 🎉 总结

这个方案提供了：

1. **清晰的UI设计** - 小米橙黄色主题，极简风格
2. **完整的技术栈** - Electron + React + TypeScript
3. **详细的任务分解** - 4阶段，10周完成
4. **实用的代码示例** - 可直接使用
5. **明确的成功标准** - 可度量的目标

**现在就开始开发吧！** 🚀

---

*文档版本: 1.0*
*创建时间: 2026-05-31*
*作者: MiMO Code*
