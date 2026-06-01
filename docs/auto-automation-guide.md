# 🚀 一句话全自动化操作指南

## 概述

MIMO CLI Code 现在支持**一句话全自动化操作**！您只需用自然语言描述想要完成的任务，系统就会自动将其分解为多个步骤并执行。

## 核心功能

### 🎯 `computer_auto` 工具

**功能**: 接受自然语言指令，自动执行复杂的自动化工作流

**参数**:
- `instruction` (必需): 自然语言指令（支持中文/英文）
- `dryRun` (可选): 仅解析不执行（默认false）
- `verbose` (可选): 显示详细日志（默认false）

---

## 📖 使用示例

### 1️⃣ 基础操作

#### 打开应用并输入文字
```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "打开记事本，输入Hello World"
  }
}
```

**系统自动执行**:
1. 启动记事本
2. 等待2秒
3. 切换焦点到记事本
4. 输入"Hello World"

#### 打开浏览器并搜索
```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "打开浏览器搜索天气"
  }
}
```

**系统自动执行**:
1. 启动Chrome浏览器
2. 等待加载
3. 聚焦地址栏
4. 打开Google
5. 输入"天气"
6. 执行搜索

---

### 2️⃣ 文字编辑操作

#### 复制粘贴
```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "全选，复制，粘贴"
  }
}
```

#### 保存文件
```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "保存文件"
  }
}
```

#### 撤销操作
```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "撤销上一步操作"
  }
}
```

---

### 3️⃣ 浏览器操作

#### 访问网址
```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "打开浏览器访问 https://github.com"
  }
}
```

#### 搜索并截图
```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "打开浏览器搜索MIMO，截图"
  }
}
```

---

### 4️⃣ 复杂工作流

#### 创建文档
```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "打开记事本，输入文档标题，换行，输入正文内容，保存文件"
  }
}
```

#### 网页操作
```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "打开浏览器，访问GitHub，点击登录按钮，输入用户名"
  }
}
```

---

## 🔧 高级功能

### 1. Dry Run（仅解析不执行）

查看系统如何分解指令，而不实际执行：

```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "打开记事本，输入Hello World，保存文件",
    "dryRun": true
  }
}
```

**输出示例**:
```json
{
  "parsedSteps": [
    {"step": 1, "action": "launch", "target": "记事本"},
    {"step": 2, "action": "wait", "duration": "2秒"},
    {"step": 3, "action": "focus", "target": "记事本"},
    {"step": 4, "action": "type", "content": "Hello World"},
    {"step": 5, "action": "key", "keys": "ctrl+s"}
  ]
}
```

### 2. Verbose模式（详细日志）

查看执行过程的详细信息：

```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "打开记事本，输入文字",
    "verbose": true
  }
}
```

**输出包含**:
- 每个步骤的执行时间
- 工具调用详情
- 成功/失败状态
- 性能统计

---

## 📋 支持的关键词

### 动作关键词

| 中文 | 英文 | 功能 |
|------|------|------|
| 打开 | open, launch, start | 启动应用程序 |
| 输入 | type, input | 输入文字 |
| 点击 | click | 点击坐标/元素 |
| 按下 | press | 按键 |
| 等待 | wait | 等待指定时间 |
| 截图 | screenshot, capture | 截取屏幕 |
| 切换 | focus, switch | 切换窗口焦点 |
| 滚动 | scroll | 滚动页面 |
| 保存 | save | 保存文件 |
| 复制 | copy | 复制内容 |
| 粘贴 | paste | 粘贴内容 |
| 撤销 | undo | 撤销操作 |
| 关闭 | close, exit, quit | 关闭应用 |

### 常用快捷键

| 指令 | 等效快捷键 |
|------|------------|
| 保存 | Ctrl+S |
| 复制 | Ctrl+C |
| 粘贴 | Ctrl+V |
| 撤销 | Ctrl+Z |
| 全选 | Ctrl+A |
| 关闭 | Alt+F4 |
| 回车 | Enter |
| Tab | Tab |

---

## 🎨 实际应用示例

### 示例1：快速创建笔记
```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "打开记事本，输入会议笔记：今天讨论了项目进度，下一步计划，保存为meeting-notes.txt"
  }
}
```

### 示例2：网页信息收集
```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "打开浏览器，搜索最新AI新闻，截图保存"
  }
}
```

### 示例3：代码编辑工作流
```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "打开VS Code，新建文件，输入Python代码，保存为test.py"
  }
}
```

### 示例4：文件批量操作
```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "打开资源管理器，导航到C盘，新建文件夹"
  }
}
```

---

## 🧠 智能特性

### 1. 上下文理解
系统能够理解复杂的指令结构：
- "先打开A，然后输入文字，最后保存"
- "如果窗口已存在，直接切换过去"
- "重复执行3次"

### 2. 错误恢复
- 自动重试失败的步骤
- 跳过非关键步骤
- 提供修复建议

### 3. 模板匹配
常见操作自动匹配最优模板：
- "打开记事本" → 使用记事本专用模板
- "搜索天气" → 使用浏览器搜索模板
- "截图" → 使用截图专用模板

---

## 📊 执行结果

### 成功示例
```json
{
  "success": true,
  "summary": "✅ 自动化执行完成: 5/5 个步骤成功",
  "workflowId": "auto_1234567890",
  "totalDuration": "4523ms",
  "stepCount": 5,
  "successfulSteps": 5,
  "failedSteps": 0
}
```

### 失败示例
```json
{
  "success": false,
  "summary": "❌ 自动化执行部分失败: 3/5 个步骤成功, 2 个失败",
  "steps": [
    {"step": 1, "status": "✅", "description": "启动记事本"},
    {"step": 2, "status": "✅", "description": "等待启动"},
    {"step": 3, "status": "❌", "description": "输入文字", "error": "窗口未找到"}
  ],
  "suggestions": [
    "Try breaking the instruction into smaller steps",
    "Check if the target application is already open"
  ]
}
```

---

## 💡 最佳实践

### ✅ 推荐做法

1. **使用明确的动词**
   ```
   ✅ "打开记事本，输入Hello World"
   ❌ "做点事情"
   ```

2. **指定具体目标**
   ```
   ✅ "打开Chrome浏览器"
   ❌ "打开浏览器" (可能打开默认浏览器)
   ```

3. **添加等待时间**
   ```
   ✅ "打开应用，等待2秒，输入文字"
   ❌ "打开应用，输入文字" (可能应用还没准备好)
   ```

4. **分步复杂操作**
   ```
   ✅ 先执行"打开记事本"，再执行"输入文字"
   ❌ 一次性"打开记事本输入文字保存关闭"
   ```

### ❌ 避免做法

1. **模糊指令**
   ```
   ❌ "帮我处理一下这个文件"
   ```

2. **过长指令**
   ```
   ❌ "打开A，输入B，点击C，滚动D，截图E，关闭F..." 
   (建议拆分为多个调用)
   ```

3. **矛盾指令**
   ```
   ❌ "打开记事本，关闭记事本" (逻辑矛盾)
   ```

---

## 🔍 调试技巧

### 1. 使用Dry Run预览
```json
{
  "instruction": "您的指令",
  "dryRun": true
}
```

### 2. 使用Verbose模式
```json
{
  "instruction": "您的指令",
  "verbose": true
}
```

### 3. 分步执行
将复杂指令拆分为多个简单调用

### 4. 添加等待时间
在关键步骤间添加"等待X秒"

---

## 📦 预定义模板

系统内置了多个常用工作流模板：

| 模板名称 | 描述 | 步骤数 |
|----------|------|--------|
| open-notepad-and-type | 打开记事本并输入 | 4 |
| open-browser-url | 浏览器打开网址 | 7 |
| browser-search | 浏览器搜索 | 10 |
| screenshot-save | 截图并保存 | 5 |
| copy-all-paste | 全选复制粘贴 | 3 |
| vscode-open-file | VS Code打开文件 | 4 |
| open-calculator | 打开计算器 | 3 |

---

## ⚠️ 注意事项

### 安全性
- 某些操作需要用户确认（如启动应用程序）
- 系统会记录所有操作日志
- 敏感操作（如删除）需要额外确认

### 性能
- 复杂工作流可能需要10-30秒
- 建议在关键步骤间添加等待时间
- 避免同时执行多个大型工作流

### 兼容性
- 支持Windows、macOS、Linux
- 某些功能可能因平台而异
- 建议先测试简单指令

---

## 🚀 快速开始

### 第一步：测试基础功能
```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "打开记事本"
  }
}
```

### 第二步：添加输入
```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "打开记事本，输入Hello"
  }
}
```

### 第三步：完整工作流
```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "打开记事本，输入Hello World，保存为test.txt"
  }
}
```

---

## 📚 进阶用法

### 条件执行
```
"如果Chrome已打开，切换到Chrome；否则打开Chrome"
```

### 循环执行
```
"重复3次：按下Tab键"
```

### 变量替换
```
"打开记事本，输入{{text}}"
(text会被实际值替换)
```

---

## 🎓 学习路径

1. **入门**: 基础打开/输入/保存操作
2. **进阶**: 浏览器操作和快捷键组合
3. **高级**: 复杂工作流和错误处理
4. **专家**: 自定义模板和变量系统

---

## 📞 故障排除

### 问题：应用无法启动
**解决**: 
- 检查应用名称拼写
- 确认应用已安装
- 尝试使用完整路径

### 问题：文字输入失败
**解决**:
- 确认窗口已获得焦点
- 添加"等待2秒"
- 检查输入法状态

### 问题：快捷键无效
**解决**:
- 确认目标应用支持该快捷键
- 检查是否有其他程序拦截
- 尝试使用不同的快捷键组合

---

## 🔗 相关资源

- `docs/computer-apps-guide.md` - 基础Computer工具指南
- `UPGRADE_REPORT.md` - 升级报告
- `src/tools/computer/__tests__/` - 测试示例

---

**版本**: 3.0
**更新日期**: 2026-06-01
**作者**: MIMO CLI Code Team

---

## 🎉 开始使用

现在就试试吧！

```json
{
  "tool": "computer_auto",
  "input": {
    "instruction": "打开记事本，输入'Hello from MIMO CLI Code!'"
  }
}
```
