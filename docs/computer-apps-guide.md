# Computer Application Tools - 使用指南

## 概述

MIMO CLI Code 现在支持完整的桌面应用程序自动化。除了基本的鼠标和键盘操作，新增了**应用程序启动**、**窗口焦点控制**和**窗口列表**功能。

## 新增功能

### 1. 🚀 启动应用程序 (`computer_launch`)

打开或启动桌面应用程序。

**参数：**
- `application` (必需): 应用程序名称或路径
- `args` (可选): 命令行参数数组
- `wait` (可选): 是否等待应用程序退出

**示例：**

```json
// 启动记事本
{
  "application": "notepad"
}

// 启动计算器
{
  "application": "Calculator"
}

// 启动浏览器并打开URL
{
  "application": "firefox",
  "args": ["https://example.com"]
}

// macOS - 启动Safari
{
  "application": "/Applications/Safari.app"
}

// Linux - 启动终端
{
  "application": "gnome-terminal"
}
```

**平台支持：**
- Windows: 使用 `Start-Process`
- macOS: 使用 `open -a` 或 `osascript`
- Linux: 使用直接执行

### 2. 🎯 切换窗口焦点 (`computer_focus`)

切换到特定应用程序窗口，使后续操作针对该窗口。

**参数：**
- `application` (可选): 应用程序名称（支持部分匹配）
- `windowId` (可选): 窗口ID

**示例：**

```json
// 切换到记事本
{
  "application": "Notepad"
}

// 切换到特定窗口（通过ID）
{
  "windowId": 12345678
}

// 切换到VS Code
{
  "application": "Visual Studio Code"
}

// 切换到Chrome浏览器
{
  "application": "Chrome"
}
```

**使用场景：**
1. 启动应用程序后，切换到该窗口
2. 在多个窗口间快速切换
3. 自动化流程中的窗口管理

### 3. 📋 列出打开的窗口 (`computer_list_windows`)

获取当前所有打开的窗口信息。

**参数：**
- `filter` (可选): 按标题过滤（不区分大小写）

**示例：**

```json
// 列出所有窗口
{}

// 搜索包含"Chrome"的窗口
{
  "filter": "Chrome"
}

// 搜索包含"文档"的窗口
{
  "filter": "文档"
}
```

**返回信息：**
```json
{
  "count": 5,
  "windows": [
    {
      "id": 12345678,
      "title": "My Document - Notepad",
      "process": "notepad",
      "pid": 1234
    },
    ...
  ]
}
```

## 使用工作流

### 完整示例：打开应用并输入文字

```json
// 1. 启动记事本
{
  "tool": "computer_launch",
  "input": {
    "application": "notepad"
  }
}

// 2. 等待应用启动
{
  "tool": "computer_wait",
  "input": {
    "seconds": 2
  }
}

// 3. 切换到记事本窗口
{
  "tool": "computer_focus",
  "input": {
    "application": "Notepad"
  }
}

// 4. 输入文字
{
  "tool": "computer_type",
  "input": {
    "text": "Hello, World!"
  }
}

// 5. 保存文件（Ctrl+S）
{
  "tool": "computer_key",
  "input": {
    "keys": "ctrl+s"
  }
}
```

### 示例：自动化浏览器操作

```json
// 1. 列出所有Chrome窗口
{
  "tool": "computer_list_windows",
  "input": {
    "filter": "Chrome"
  }
}

// 2. 切换到Chrome
{
  "tool": "computer_focus",
  "input": {
    "application": "Chrome"
  }
}

// 3. 在地址栏输入URL（Ctrl+L聚焦地址栏）
{
  "tool": "computer_key",
  "input": {
    "keys": "ctrl+l"
  }
}

// 4. 输入URL
{
  "tool": "computer_type",
  "input": {
    "text": "https://github.com"
  }
}

// 5. 按Enter打开
{
  "tool": "computer_key",
  "input": {
    "keys": "enter"
  }
}
```

### 示例：批量文件操作

```json
// 1. 启动文件管理器
{
  "tool": "computer_launch",
  "input": {
    "application": "explorer"
  }
}

// 2. 等待
{
  "tool": "computer_wait",
  "input": {
    "seconds": 1
  }
}

// 3. 切换到文件管理器
{
  "tool": "computer_focus",
  "input": {
    "application": "File Explorer"
  }
}

// 4. 导航到特定文件夹（在地址栏输入路径）
{
  "tool": "computer_key",
  "input": {
    "keys": "ctrl+l"
  }
}

// 5. 输入路径
{
  "tool": "computer_type",
  "input": {
    "text": "C:\\Projects"
  }
}

// 6. 按Enter
{
  "tool": "computer_key",
  "input": {
    "keys": "enter"
  }
}
```

## 最佳实践

### 1. 等待应用程序启动
```json
// 启动后等待足够时间
{
  "tool": "computer_wait",
  "input": {
    "seconds": 2
  }
}
```

### 2. 验证窗口已打开
```json
// 先列出窗口确认应用已启动
{
  "tool": "computer_list_windows",
  "input": {
    "filter": "MyApp"
  }
}
```

### 3. 使用窗口ID精确控制
```json
// 获取窗口ID后进行精确切换
{
  "tool": "computer_list_windows",
  "input": {
    "filter": "Notepad"
  }
}
// 假设返回窗口ID为12345
{
  "tool": "computer_focus",
  "input": {
    "windowId": 12345
  }
}
```

### 4. 错误处理
在自动化流程中，建议在关键步骤后检查状态：
- 确认应用程序已启动
- 确认窗口已获取焦点
- 确认文字输入成功

## 权限系统

| 操作 | 权限 | 说明 |
|------|------|------|
| `computer_launch` | ask (agent模式) / auto (yolo模式) | 需要用户确认，因为会启动应用程序 |
| `computer_focus` | auto | 只读操作，自动批准 |
| `computer_list_windows` | auto | 只读操作，自动批准 |

## 平台兼容性

| 功能 | Windows | macOS | Linux |
|------|---------|-------|-------|
| 启动应用 | ✅ PowerShell | ✅ osascript/open | ✅ bash |
| 窗口焦点 | ✅ Win32 API | ✅ osascript | ✅ xdotool |
| 窗口列表 | ✅ Get-Process | ⚠️ 部分支持 | ✅ wmctrl |

## 故障排除

### 应用程序无法启动
1. 检查应用程序名称是否正确
2. 确认应用程序路径在系统PATH中
3. 尝试使用完整路径

### 窗口焦点切换失败
1. 使用 `computer_list_windows` 确认窗口存在
2. 尝试使用窗口ID而不是应用程序名称
3. 确认应用程序窗口未最小化

### 窗口列表为空
1. 确认有应用程序正在运行
2. 检查应用程序是否有可见窗口
3. Linux系统需要安装 `wmctrl`

## 性能提示

- 使用 `computer_wait` 给应用程序足够时间启动
- 避免频繁切换窗口，批量处理操作
- 使用窗口ID进行精确控制，避免名称匹配问题

## 示例项目

查看 `src/tools/computer/__tests__/computer-apps.test.ts` 获取更多使用示例。

---

**版本**: 2.0
**更新日期**: 2026-06-01
**作者**: MIMO CLI Code Team
