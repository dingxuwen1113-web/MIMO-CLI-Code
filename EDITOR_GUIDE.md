# 🖥️ 内置代码编辑器 - 完整使用指南

## 概述

MIMO CLI 内置了一个完整的代码编辑器，支持在软件内部直接编程、编译、测试，并通过大模型进行智能错误修复。

## 核心特性

### ✅ 多语言支持
支持12种主流编程语言：
- TypeScript, JavaScript, Python
- Rust, Go, Java
- C++, C#, Ruby, PHP
- Swift, Kotlin

### ✅ 代码编辑
- 创建新文件
- 打开现有文件
- 编辑代码内容
- 保存文件
- 多文件管理

### ✅ 编译检查
- 实时编译检查
- 语法错误检测
- 类型错误检测
- 错误定位（文件、行号、列号）

### ✅ 运行测试
- 直接运行代码
- 运行测试套件
- 测试结果统计
- 错误输出捕获

### ✅ AI智能修复
- 自动错误分析
- 智能修复建议
- 置信度评估
- 一键应用修复
- 批量修复支持

---

## 命令参考

### 文件管理

#### 创建/打开文件
```bash
/editor open <文件名> [语言]

# 示例
/editor open main.ts              # 创建TypeScript文件
/editor open app.py python        # 创建Python文件
/editor open lib.rs rust          # 创建Rust文件
/editor open server.go go         # 创建Go文件
```

#### 编辑代码
```bash
/editor edit <代码内容>

# 示例
/editor edit console.log("Hello World")
/editor edit def main(): print("Hi")
/editor edit fn main() { println!("Hello"); }
```

#### 保存文件
```bash
/editor save
```

#### 关闭文件
```bash
# 关闭当前文件
/editor close

# 关闭所有文件
/editor close-all
```

### 编译和运行

#### 编译检查
```bash
/editor compile

# 输出示例
✓ 编译成功 (150ms)

# 或者
✗ 编译失败 (3 个错误)
  ● 行 5: Cannot find name 'console'
  ● 行 10: Type 'string' is not assignable to type 'number'
  ● 行 15: Expected ')' but found '}'
```

#### 运行代码
```bash
/editor run [参数...]

# 示例
/editor run                       # 运行当前文件
/editor run arg1 arg2             # 带参数运行
/editor run --verbose             # 带选项运行
```

#### 运行测试
```bash
/editor test

# 输出示例
✓ 测试通过 (15/15)

# 或者
✗ 测试失败 (2/15)
  ● Test 1: Expected 5, got 3
  ● Test 2: Timeout after 5000ms
```

### AI智能修复

#### 分析错误并生成修复建议
```bash
/editor repair

# 输出示例
发现 3 个修复建议:

  ● Cannot find name 'console'
    位置: 行 5
    建议: 添加缺失的导入语句
    置信度: 90%
    修复代码: import { console } from 'console';...

  ● Type 'string' is not assignable to type 'number'
    位置: 行 10
    建议: 修复类型不匹配错误
    置信度: 75%
    修复代码: String(value)...

使用 /editor apply <id> 应用修复建议
使用 /editor apply-all 应用所有高置信度修复
```

#### 应用修复建议
```bash
# 应用指定修复
/editor apply <suggestion-id>

# 应用所有高置信度修复（>=70%）
/editor apply-all
```

### 状态查看

#### 查看编辑器状态
```bash
/editor status

# 输出示例
当前文件:

  ● main.ts
    语言: typescript
    路径: /path/to/main.ts
    修改: 是
    保存: 2026-06-01T10:30:00.000Z

打开的文件:

    • main.ts (已修改)
    • utils.ts
    • types.ts

支持的语言:

    • TypeScript     .ts
    • JavaScript     .js
    • Python         .py
    • Rust           .rs
    • Go             .go
    • Java           .java
    • C++            .cpp
    • C#             .cs
    • Ruby           .rb
    • PHP            .php
    • Swift          .swift
    • Kotlin         .kt
```

#### 查看帮助
```bash
/editor help
```

---

## 支持的编程语言

### TypeScript
- **扩展名**: .ts
- **编译**: npx tsc --noEmit
- **运行**: npx tsx
- **测试**: npx vitest run
- **格式化**: prettier
- **Linter**: eslint

### JavaScript
- **扩展名**: .js
- **运行**: node
- **测试**: npx jest
- **格式化**: prettier
- **Linter**: eslint

### Python
- **扩展名**: .py
- **运行**: python3
- **测试**: python3 -m pytest
- **格式化**: black
- **Linter**: pylint

### Rust
- **扩展名**: .rs
- **编译**: cargo build
- **运行**: cargo run
- **测试**: cargo test
- **格式化**: rustfmt

### Go
- **扩展名**: .go
- **编译**: go build
- **运行**: go run
- **测试**: go test
- **格式化**: gofmt
- **Linter**: golangci-lint

### Java
- **扩展名**: .java
- **编译**: javac
- **运行**: java
- **测试**: mvn test
- **格式化**: google-java-format

### C++
- **扩展名**: .cpp
- **编译**: g++ -o output
- **运行**: ./output
- **测试**: ctest
- **格式化**: clang-format

### C#
- **扩展名**: .cs
- **编译**: dotnet build
- **运行**: dotnet run
- **测试**: dotnet test
- **格式化**: dotnet format

### Ruby
- **扩展名**: .rb
- **运行**: ruby
- **测试**: minitest
- **格式化**: rubocop

### PHP
- **扩展名**: .php
- **运行**: php
- **测试**: phpunit
- **格式化**: php-cs-fixer

### Swift
- **扩展名**: .swift
- **编译**: swiftc
- **运行**: swift
- **测试**: swift test
- **格式化**: swift-format

### Kotlin
- **扩展名**: .kt
- **编译**: kotlinc
- **运行**: kotlin
- **测试**: gradle test
- **格式化**: ktlint

---

## AI智能修复详解

### 支持的错误类型

#### 1. 缺失导入 (missing_import)
**错误示例**:
```
Cannot find module 'lodash'
```

**修复建议**:
```typescript
import _ from 'lodash';
```

**置信度**: 90%

#### 2. 未定义变量 (undefined_variable)
**错误示例**:
```
Cannot find name 'myVariable'
```

**修复建议**:
```typescript
let myVariable = null; // TODO: 初始化变量
```

**置信度**: 70%

#### 3. 类型错误 (type_error)
**错误示例**:
```
Type 'string' is not assignable to type 'number'
```

**修复建议**:
```typescript
String(value) // 或 Number(value)
```

**置信度**: 75%

#### 4. 语法错误 (syntax_error)
**错误示例**:
```
Expected ')' but found '}'
```

**修复建议**:
```typescript
// 添加缺失的括号
```

**置信度**: 85%

#### 5. 空引用错误 (null_reference)
**错误示例**:
```
Cannot read property 'length' of undefined
```

**修复建议**:
```typescript
// 使用可选链操作符
user?.name?.length
```

**置信度**: 65%

#### 6. 缺失参数 (missing_argument)
**错误示例**:
```
Expected 2 arguments, but got 1
```

**修复建议**:
```typescript
function(arg1, defaultValue)
```

**置信度**: 80%

#### 7. 异步错误 (async_error)
**错误示例**:
```
await is only valid in async functions
```

**修复建议**:
```typescript
async function myFunction() {
  await someAsyncOperation();
}
```

**置信度**: 60%

---

## 使用示例

### 示例1: TypeScript开发

```bash
# 1. 创建TypeScript文件
/editor open calculator.ts

# 2. 编写代码
/editor edit function add(a: number, b: number): number {
  return a + b;
}

# 3. 编译检查
/editor compile
✓ 编译成功

# 4. 运行
/editor run

# 5. 保存
/editor save
```

### 示例2: Python开发

```bash
# 1. 创建Python文件
/editor open hello.py python

# 2. 编写代码
/editor edit def greet(name):
    print(f"Hello, {name}!")

if __name__ == "__main__":
    greet("World")

# 3. 运行
/editor run
Hello, World!

# 4. 保存
/editor save
```

### 示例3: Rust开发

```bash
# 1. 创建Rust文件
/editor open main.rs rust

# 2. 编写代码
/editor edit fn main() {
    println!("Hello, world!");
}

# 3. 编译
/editor compile
✓ 编译成功

# 4. 运行
/editor run
Hello, world!

# 5. 保存
/editor save
```

### 示例4: 修复编译错误

```bash
# 1. 创建有错误的文件
/editor open buggy.ts

# 2. 编写有错误的代码
/editor edit const x: number = "hello";

# 3. 编译检查
/editor compile
✗ 编译失败 (1 个错误)
  ● 行 1: Type 'string' is not assignable to type 'number'

# 4. AI修复
/editor repair
发现 1 个修复建议:

  ● Type 'string' is not assignable to type 'number'
    位置: 行 1
    建议: 修复类型不匹配错误
    置信度: 75%
    修复代码: const x: number = Number("hello");...

# 5. 应用修复
/editor apply-all
✓ 已应用 1 个修复建议
✓ 修复成功，编译通过！

# 6. 保存
/editor save
```

### 示例5: 测试驱动开发

```bash
# 1. 创建测试文件
/editor open calculator.test.ts

# 2. 编写测试
/editor edit import { add } from './calculator';

describe('Calculator', () => {
  test('should add two numbers', () => {
    expect(add(1, 2)).toBe(3);
  });

  test('should handle negative numbers', () => {
    expect(add(-1, 1)).toBe(0);
  });
});

# 3. 运行测试
/editor test
✗ 测试失败 (0/2)

# 4. 创建实现
/editor open calculator.ts
/editor edit export function add(a: number, b: number): number {
  return a + b;
}

# 5. 再次运行测试
/editor test
✓ 测试通过 (2/2)

# 6. 保存所有文件
/editor save
```

---

## 配置选项

### 编辑器配置

```typescript
interface EditorConfig {
  defaultLanguage: string;    // 默认语言 (default: 'typescript')
  fontSize: number;           // 字体大小 (default: 14)
  tabSize: number;            // Tab大小 (default: 2)
  theme: 'light' | 'dark';   // 主题 (default: 'dark')
  autoSave: boolean;          // 自动保存 (default: true)
  autoCompile: boolean;       // 自动编译 (default: true)
  autoTest: boolean;          // 自动测试 (default: false)
  enableAIAssist: boolean;    // 启用AI辅助 (default: true)
}
```

### 更新配置

```typescript
// 通过API更新
editor.updateEditorConfig({
  autoSave: false,
  autoTest: true,
  enableAIAssist: true,
});
```

---

## 高级功能

### 代码模板

创建文件时自动生成模板：

**TypeScript模板**:
```typescript
// filename.ts
// Created: 2026-06-01T10:30:00.000Z

interface FilenameProps {
  // Define props here
}

export class Filename {
  constructor() {
    // Initialize
  }

  // Add methods here
}

export default Filename;
```

**Python模板**:
```python
#!/usr/bin/env python3
# filename.py
# Created: 2026-06-01T10:30:00.000Z

class Filename:
    """Filename class"""

    def __init__(self):
        """Initialize"""
        pass

    # Add methods here

if __name__ == "__main__":
    instance = Filename()
```

### 多文件管理

```bash
# 打开多个文件
/editor open main.ts
/editor open utils.ts
/editor open types.ts

# 查看打开的文件
/editor status

# 切换文件（通过再次打开）
/editor open utils.ts

# 关闭文件
/editor close
```

### 错误诊断

编译错误包含详细信息：
- **文件路径**: 错误所在的文件
- **行号**: 错误所在的行
- **列号**: 错误所在的列
- **错误消息**: 详细的错误描述
- **严重程度**: error/warning/info

---

## 故障排除

### 问题: 编译命令未找到
**解决**: 确保已安装相应的编译器或运行时

```bash
# TypeScript
npm install -g typescript

# Python
# 通常已预装

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Go
# 从 https://golang.org/dl/ 下载安装

# Java
# 安装JDK
```

### 问题: 测试框架未找到
**解决**: 安装相应的测试框架

```bash
# Jest (JavaScript/TypeScript)
npm install -g jest

# Pytest (Python)
pip install pytest

# Cargo test (Rust)
# 内置

# Go test
# 内置
```

### 问题: AI修复建议不准确
**解决**:
1. 检查错误类型是否被支持
2. 尝试手动修复后重新编译
3. 查看置信度，低于70%的建议谨慎使用

### 问题: 文件保存失败
**解决**:
1. 检查文件权限
2. 确保磁盘空间充足
3. 检查文件路径是否有效

---

## 最佳实践

### 1. 代码组织
- 每个文件只包含一个主要功能
- 使用清晰的文件命名
- 保持文件大小适中

### 2. 错误处理
- 编译后立即检查错误
- 使用AI修复常见错误
- 手动验证复杂错误

### 3. 测试驱动
- 先编写测试，再编写实现
- 运行测试确保代码正确
- 修复失败的测试

### 4. 版本控制
- 定期保存文件
- 使用有意义的提交消息
- 保持代码库整洁

---

## 性能指标

- **文件打开**: < 100ms
- **编译检查**: 1-5秒（取决于语言和项目大小）
- **代码运行**: 取决于程序复杂度
- **测试执行**: 1-30秒（取决于测试数量）
- **AI修复分析**: 2-5秒
- **修复应用**: < 100ms

---

## 技术架构

```
内置编辑器
├── 文件管理
│   ├── 创建文件
│   ├── 打开文件
│   ├── 保存文件
│   └── 多文件管理
├── 代码编辑
│   ├── 内容编辑
│   ├── 代码插入
│   └── 代码替换
├── 编译系统
│   ├── TypeScript编译
│   ├── Python语法检查
│   ├── Rust/Cargo编译
│   └── 其他语言编译
├── 运行系统
│   ├── 代码执行
│   ├── 参数传递
│   └── 输出捕获
├── 测试系统
│   ├── 测试执行
│   ├── 结果解析
│   └── 错误报告
└── AI修复系统
    ├── 错误分析
    ├── 修复生成
    ├── 置信度评估
    └── 修复应用
```

---

## 版本历史

- **v2.0.0** — 初始版本
  - 支持12种编程语言
  - 代码编辑功能
  - 编译检查
  - 代码运行
  - 测试执行
  - AI智能修复

---

**版本**: v2.0.0
**最后更新**: 2026-06-01
**支持语言**: 12种
**AI修复**: 支持7种错误类型
