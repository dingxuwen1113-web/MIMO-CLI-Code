/**
 * Built-in Code Editor - 内置代码编辑器
 *
 * 支持在软件内部直接编程、编译、测试
 * 集成大模型进行智能错误修复
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import { MimoConfig } from '../config/schema';
import { printInfo, printSuccess, printWarning, printError, ORANGE, GRAY, GREEN, CYAN, RED } from '../tui/output';

// 编辑器配置
export interface EditorConfig {
  defaultLanguage: string;
  fontSize: number;
  tabSize: number;
  theme: 'light' | 'dark';
  autoSave: boolean;
  autoCompile: boolean;
  autoTest: boolean;
  enableAIAssist: boolean;
}

// 语言配置
export interface LanguageConfig {
  id: string;
  name: string;
  extension: string;
  compileCommand?: string;
  runCommand: string;
  testCommand?: string;
  lspServer?: string;
  formatter?: string;
  linter?: string;
}

// 文件信息
export interface FileInfo {
  path: string;
  name: string;
  language: string;
  content: string;
  modified: boolean;
  savedAt?: string;
}

// 编译结果
export interface CompileResult {
  success: boolean;
  output: string;
  errors: CompileError[];
  warnings: CompileWarning[];
  duration: number;
}

// 编译错误
export interface CompileError {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

// 编译警告
export interface CompileWarning {
  file: string;
  line: number;
  column: number;
  message: string;
}

// 测试结果
export interface TestResult {
  success: boolean;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  output: string;
  errors: string[];
  duration: number;
}

// AI修复建议
export interface AIRepairSuggestion {
  id: string;
  error: CompileError;
  suggestion: string;
  fixedCode: string;
  confidence: number;
  applied: boolean;
}

// 支持的编程语言
const SUPPORTED_LANGUAGES: Record<string, LanguageConfig> = {
  typescript: {
    id: 'typescript',
    name: 'TypeScript',
    extension: '.ts',
    compileCommand: 'npx tsc --noEmit',
    runCommand: 'npx tsx',
    testCommand: 'npx vitest run',
    lspServer: 'typescript-language-server',
    formatter: 'prettier',
    linter: 'eslint',
  },
  javascript: {
    id: 'javascript',
    name: 'JavaScript',
    extension: '.js',
    runCommand: 'node',
    testCommand: 'npx jest',
    lspServer: 'typescript-language-server',
    formatter: 'prettier',
    linter: 'eslint',
  },
  python: {
    id: 'python',
    name: 'Python',
    extension: '.py',
    runCommand: 'python3',
    testCommand: 'python3 -m pytest',
    lspServer: 'pylsp',
    formatter: 'black',
    linter: 'pylint',
  },
  rust: {
    id: 'rust',
    name: 'Rust',
    extension: '.rs',
    compileCommand: 'cargo build',
    runCommand: 'cargo run',
    testCommand: 'cargo test',
    lspServer: 'rust-analyzer',
    formatter: 'rustfmt',
  },
  go: {
    id: 'go',
    name: 'Go',
    extension: '.go',
    compileCommand: 'go build',
    runCommand: 'go run',
    testCommand: 'go test',
    lspServer: 'gopls',
    formatter: 'gofmt',
    linter: 'golangci-lint',
  },
  java: {
    id: 'java',
    name: 'Java',
    extension: '.java',
    compileCommand: 'javac',
    runCommand: 'java',
    testCommand: 'mvn test',
    lspServer: 'jdtls',
    formatter: 'google-java-format',
  },
  cpp: {
    id: 'cpp',
    name: 'C++',
    extension: '.cpp',
    compileCommand: 'g++ -o output',
    runCommand: './output',
    testCommand: 'ctest',
    lspServer: 'clangd',
    formatter: 'clang-format',
  },
  csharp: {
    id: 'csharp',
    name: 'C#',
    extension: '.cs',
    compileCommand: 'dotnet build',
    runCommand: 'dotnet run',
    testCommand: 'dotnet test',
    lspServer: 'omnisharp',
    formatter: 'dotnet format',
  },
  ruby: {
    id: 'ruby',
    name: 'Ruby',
    extension: '.rb',
    runCommand: 'ruby',
    testCommand: 'ruby -e "require \'minitest/autorun\'"',
    lspServer: 'solargraph',
    formatter: 'rubocop',
  },
  php: {
    id: 'php',
    name: 'PHP',
    extension: '.php',
    runCommand: 'php',
    testCommand: 'vendor/bin/phpunit',
    lspServer: 'intelephense',
    formatter: 'php-cs-fixer',
  },
  swift: {
    id: 'swift',
    name: 'Swift',
    extension: '.swift',
    compileCommand: 'swiftc',
    runCommand: 'swift',
    testCommand: 'swift test',
    lspServer: 'sourcekit-lsp',
    formatter: 'swift-format',
  },
  kotlin: {
    id: 'kotlin',
    name: 'Kotlin',
    extension: '.kt',
    compileCommand: 'kotlinc',
    runCommand: 'kotlin',
    testCommand: 'gradle test',
    lspServer: 'kotlin-language-server',
    formatter: 'ktlint',
  },
};

export class BuiltInEditor {
  private config: MimoConfig;
  private editorConfig: EditorConfig;
  private currentFile: FileInfo | null = null;
  private openFiles: Map<string, FileInfo> = new Map();
  private compileHistory: CompileResult[] = [];
  private testHistory: TestResult[] = [];
  private repairSuggestions: AIRepairSuggestion[] = [];
  private workspaceDir: string;

  constructor(config: MimoConfig) {
    this.config = config;
    this.workspaceDir = process.cwd();

    this.editorConfig = {
      defaultLanguage: 'typescript',
      fontSize: 14,
      tabSize: 2,
      theme: 'dark',
      autoSave: true,
      autoCompile: true,
      autoTest: false,
      enableAIAssist: true,
    };
  }

  /**
   * 初始化编辑器
   */
  async init(): Promise<void> {
    try {
      // 创建工作区目录
      await fs.mkdir(path.join(this.workspaceDir, '.editor'), { recursive: true });
      printSuccess('内置编辑器初始化完成');
    } catch (err: any) {
      printWarning(`编辑器初始化失败: ${err.message}`);
    }
  }

  /**
   * 创建新文件
   */
  async createFile(fileName: string, language?: string): Promise<FileInfo> {
    const lang = language || this.detectLanguage(fileName);
    const langConfig = SUPPORTED_LANGUAGES[lang];

    if (!langConfig) {
      throw new Error(`不支持的语言: ${lang}`);
    }

    const filePath = path.join(this.workspaceDir, fileName);
    const content = this.getTemplate(lang, fileName);

    await fs.writeFile(filePath, content, 'utf-8');

    const fileInfo: FileInfo = {
      path: filePath,
      name: fileName,
      language: lang,
      content,
      modified: false,
      savedAt: new Date().toISOString(),
    };

    this.openFiles.set(filePath, fileInfo);
    this.currentFile = fileInfo;

    printSuccess(`创建文件: ${fileName} (${langConfig.name})`);
    return fileInfo;
  }

  /**
   * 打开文件
   */
  async openFile(filePath: string): Promise<FileInfo> {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workspaceDir, filePath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const fileName = path.basename(fullPath);
      const language = this.detectLanguage(fileName);

      const fileInfo: FileInfo = {
        path: fullPath,
        name: fileName,
        language,
        content,
        modified: false,
        savedAt: new Date().toISOString(),
      };

      this.openFiles.set(fullPath, fileInfo);
      this.currentFile = fileInfo;

      printSuccess(`打开文件: ${fileName}`);
      return fileInfo;
    } catch (err: any) {
      throw new Error(`无法打开文件: ${err.message}`);
    }
  }

  /**
   * 保存文件
   */
  async saveFile(filePath?: string): Promise<void> {
    const targetPath = filePath || this.currentFile?.path;

    if (!targetPath) {
      throw new Error('没有打开的文件');
    }

    const fileInfo = this.openFiles.get(targetPath);
    if (!fileInfo) {
      throw new Error(`文件未打开: ${targetPath}`);
    }

    await fs.writeFile(targetPath, fileInfo.content, 'utf-8');
    fileInfo.modified = false;
    fileInfo.savedAt = new Date().toISOString();

    printSuccess(`保存文件: ${fileInfo.name}`);
  }

  /**
   * 保存所有文件
   */
  async saveAll(): Promise<void> {
    for (const [filePath, fileInfo] of this.openFiles.entries()) {
      if (fileInfo.modified) {
        await fs.writeFile(filePath, fileInfo.content, 'utf-8');
        fileInfo.modified = false;
        fileInfo.savedAt = new Date().toISOString();
      }
    }
    printSuccess('所有文件已保存');
  }

  /**
   * 编辑文件内容
   */
  editContent(newContent: string): void {
    if (!this.currentFile) {
      throw new Error('没有打开的文件');
    }

    this.currentFile.content = newContent;
    this.currentFile.modified = true;
  }

  /**
   * 插入代码片段
   */
  insertCode(code: string, line?: number): void {
    if (!this.currentFile) {
      throw new Error('没有打开的文件');
    }

    const lines = this.currentFile.content.split('\n');
    const insertLine = line !== undefined ? line : lines.length;

    lines.splice(insertLine, 0, code);
    this.currentFile.content = lines.join('\n');
    this.currentFile.modified = true;
  }

  /**
   * 替换代码
   */
  replaceCode(search: string, replace: string): void {
    if (!this.currentFile) {
      throw new Error('没有打开的文件');
    }

    this.currentFile.content = this.currentFile.content.replace(search, replace);
    this.currentFile.modified = true;
  }

  /**
   * 编译当前文件
   */
  async compile(): Promise<CompileResult> {
    if (!this.currentFile) {
      throw new Error('没有打开的文件');
    }

    // 自动保存
    if (this.currentFile.modified && this.editorConfig.autoSave) {
      await this.saveFile();
    }

    const langConfig = SUPPORTED_LANGUAGES[this.currentFile.language];
    if (!langConfig?.compileCommand) {
      return {
        success: true,
        output: '该语言不需要编译',
        errors: [],
        warnings: [],
        duration: 0,
      };
    }

    printInfo(`编译 ${this.currentFile.name}...`);
    const startTime = Date.now();

    try {
      const output = execSync(`${langConfig.compileCommand} ${this.currentFile.path}`, {
        cwd: this.workspaceDir,
        encoding: 'utf-8',
        timeout: 60000,
      });

      const duration = Date.now() - startTime;
      const result: CompileResult = {
        success: true,
        output,
        errors: [],
        warnings: [],
        duration,
      };

      this.compileHistory.push(result);
      printSuccess(`编译成功 (${duration}ms)`);
      return result;
    } catch (err: any) {
      const duration = Date.now() - startTime;
      const errorOutput = err.stderr || err.stdout || err.message;
      const errors = this.parseErrors(errorOutput);

      const result: CompileResult = {
        success: false,
        output: errorOutput,
        errors,
        warnings: [],
        duration,
      };

      this.compileHistory.push(result);
      printError(`编译失败 (${errors.length} 个错误)`);
      return result;
    }
  }

  /**
   * 运行当前文件
   */
  async run(args?: string[]): Promise<{ success: boolean; output: string; exitCode: number }> {
    if (!this.currentFile) {
      throw new Error('没有打开的文件');
    }

    // 自动保存
    if (this.currentFile.modified && this.editorConfig.autoSave) {
      await this.saveFile();
    }

    const langConfig = SUPPORTED_LANGUAGES[this.currentFile.language];
    const command = `${langConfig.runCommand} ${this.currentFile.path}${args ? ' ' + args.join(' ') : ''}`;

    printInfo(`运行 ${this.currentFile.name}...`);

    return new Promise((resolve) => {
      const child = spawn(command, [], {
        cwd: this.workspaceDir,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
        process.stdout.write(data);
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
        process.stderr.write(data);
      });

      child.on('close', (code) => {
        const success = code === 0;
        if (success) {
          printSuccess('运行完成');
        } else {
          printError(`运行失败 (退出码: ${code})`);
        }

        resolve({
          success,
          output: stdout + stderr,
          exitCode: code || 0,
        });
      });

      child.on('error', (err) => {
        printError(`运行错误: ${err.message}`);
        resolve({
          success: false,
          output: err.message,
          exitCode: 1,
        });
      });
    });
  }

  /**
   * 运行测试
   */
  async test(): Promise<TestResult> {
    if (!this.currentFile) {
      throw new Error('没有打开的文件');
    }

    // 自动保存
    if (this.currentFile.modified && this.editorConfig.autoSave) {
      await this.saveFile();
    }

    const langConfig = SUPPORTED_LANGUAGES[this.currentFile.language];
    if (!langConfig?.testCommand) {
      return {
        success: true,
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        output: '该语言没有配置测试命令',
        errors: [],
        duration: 0,
      };
    }

    printInfo(`运行测试 ${this.currentFile.name}...`);
    const startTime = Date.now();

    try {
      const output = execSync(langConfig.testCommand, {
        cwd: this.workspaceDir,
        encoding: 'utf-8',
        timeout: 120000,
      });

      const duration = Date.now() - startTime;
      const testResult = this.parseTestOutput(output, duration);

      this.testHistory.push(testResult);

      if (testResult.success) {
        printSuccess(`测试通过 (${testResult.passed}/${testResult.total})`);
      } else {
        printError(`测试失败 (${testResult.failed}/${testResult.total})`);
      }

      return testResult;
    } catch (err: any) {
      const duration = Date.now() - startTime;
      const output = err.stderr || err.stdout || err.message;

      const testResult: TestResult = {
        success: false,
        total: 0,
        passed: 0,
        failed: 1,
        skipped: 0,
        output,
        errors: [output],
        duration,
      };

      this.testHistory.push(testResult);
      printError('测试执行失败');
      return testResult;
    }
  }

  /**
   * AI智能修复
   */
  async aiRepair(): Promise<AIRepairSuggestion[]> {
    if (!this.currentFile) {
      throw new Error('没有打开的文件');
    }

    if (!this.editorConfig.enableAIAssist) {
      printWarning('AI辅助已禁用');
      return [];
    }

    // 先编译获取错误
    const compileResult = await this.compile();

    if (compileResult.success) {
      printSuccess('没有编译错误，无需修复');
      return [];
    }

    printInfo(`发现 ${compileResult.errors.length} 个错误，正在生成修复建议...`);

    const suggestions: AIRepairSuggestion[] = [];

    for (const error of compileResult.errors) {
      try {
        const suggestion = await this.generateRepairSuggestion(error);
        suggestions.push(suggestion);
      } catch (err: any) {
        printWarning(`生成修复建议失败: ${error.message}`);
      }
    }

    this.repairSuggestions = suggestions;

    if (suggestions.length > 0) {
      printSuccess(`生成了 ${suggestions.length} 个修复建议`);
    }

    return suggestions;
  }

  /**
   * 生成修复建议
   */
  private async generateRepairSuggestion(error: CompileError): Promise<AIRepairSuggestion> {
    // 分析错误类型
    const errorType = this.analyzeErrorType(error.message);

    // 生成修复代码
    const fixedCode = this.generateFixedCode(error, errorType);

    const suggestion: AIRepairSuggestion = {
      id: `repair-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      error,
      suggestion: this.generateSuggestionText(error, errorType),
      fixedCode,
      confidence: this.calculateConfidence(errorType),
      applied: false,
    };

    return suggestion;
  }

  /**
   * 分析错误类型
   */
  private analyzeErrorType(errorMessage: string): string {
    const message = errorMessage.toLowerCase();

    if (message.includes('cannot find module') || message.includes('module not found')) {
      return 'missing_import';
    }
    if (message.includes('is not defined') || message.includes('undeclared')) {
      return 'undefined_variable';
    }
    if (message.includes('type') && (message.includes('not assignable') || message.includes('mismatch'))) {
      return 'type_error';
    }
    if (message.includes('expected') && message.includes('but found')) {
      return 'syntax_error';
    }
    if (message.includes('cannot read property') || message.includes('undefined is not an object')) {
      return 'null_reference';
    }
    if (message.includes('argument') && message.includes('not provided')) {
      return 'missing_argument';
    }
    if (message.includes('async') || message.includes('await') || message.includes('promise')) {
      return 'async_error';
    }
    if (message.includes('permission') || message.includes('access denied')) {
      return 'permission_error';
    }

    return 'unknown';
  }

  /**
   * 生成修复代码
   */
  private generateFixedCode(error: CompileError, errorType: string): string {
    const lines = this.currentFile!.content.split('\n');
    const errorLine = lines[error.line - 1] || '';

    switch (errorType) {
      case 'missing_import':
        return this.generateImportFix(error.message);

      case 'undefined_variable':
        return this.generateVariableFix(errorLine, error.message);

      case 'type_error':
        return this.generateTypeFix(errorLine, error.message);

      case 'syntax_error':
        return this.generateSyntaxFix(errorLine, error.message);

      case 'null_reference':
        return this.generateNullCheckFix(errorLine);

      case 'missing_argument':
        return this.generateArgumentFix(errorLine, error.message);

      case 'async_error':
        return this.generateAsyncFix(errorLine, error.message);

      default:
        return errorLine;
    }
  }

  /**
   * 生成导入修复
   */
  private generateImportFix(errorMessage: string): string {
    const moduleMatch = errorMessage.match(/['"]([^'"]+)['"]/);
    const moduleName = moduleMatch ? moduleMatch[1] : 'module';

    return `import { } from '${moduleName}';`;
  }

  /**
   * 生成变量修复
   */
  private generateVariableFix(line: string, errorMessage: string): string {
    const varMatch = errorMessage.match(/['"]([^'"]+)['"]/);
    const varName = varMatch ? varMatch[1] : 'variable';

    if (line.includes(varName)) {
      return `let ${varName} = null; // TODO: 初始化变量\n${line}`;
    }

    return line;
  }

  /**
   * 生成类型修复
   */
  private generateTypeFix(line: string, errorMessage: string): string {
    if (errorMessage.includes('string') && errorMessage.includes('number')) {
      return line.replace(/(\w+)/, 'String($1)');
    }
    if (errorMessage.includes('undefined') || errorMessage.includes('null')) {
      return line + ' // TODO: 添加空值检查';
    }

    return line + ' // TODO: 修复类型错误';
  }

  /**
   * 生成语法修复
   */
  private generateSyntaxFix(line: string, errorMessage: string): string {
    if (errorMessage.includes('expected ;')) {
      return line + ';';
    }
    if (errorMessage.includes('expected }')) {
      return line + '\n}';
    }
    if (errorMessage.includes('expected )')) {
      return line + ')';
    }

    return line + ' // TODO: 修复语法错误';
  }

  /**
   * 生成空值检查修复
   */
  private generateNullCheckFix(line: string): string {
    if (line.includes('.')) {
      const parts = line.split('.');
      if (parts.length >= 2) {
        return line.replace(/\.(\w+)/g, '?.$1');
      }
    }

    return line + ' // TODO: 添加空值检查';
  }

  /**
   * 生成参数修复
   */
  private generateArgumentFix(line: string, errorMessage: string): string {
    const funcMatch = errorMessage.match(/['"]([^'"]+)['"]/);
    const funcName = funcMatch ? funcMatch[1] : 'function';

    if (line.includes(funcName)) {
      return line.replace(/\(([^)]*)\)/, '($1, defaultValue)');
    }

    return line;
  }

  /**
   * 生成异步修复
   */
  private generateAsyncFix(line: string, errorMessage: string): string {
    if (errorMessage.includes('await') && !line.includes('async')) {
      return line.replace(/(\w+)\s*\(/, 'async $1(');
    }
    if (errorMessage.includes('promise')) {
      return line + '.then(result => result)';
    }

    return line;
  }

  /**
   * 生成建议文本
   */
  private generateSuggestionText(error: CompileError, errorType: string): string {
    const suggestions: Record<string, string> = {
      missing_import: `添加缺失的导入语句`,
      undefined_variable: `定义未声明的变量`,
      type_error: `修复类型不匹配错误`,
      syntax_error: `修复语法错误`,
      null_reference: `添加空值检查`,
      missing_argument: `添加缺失的函数参数`,
      async_error: `修复异步/等待错误`,
      permission_error: `修复权限错误`,
      unknown: `检查代码并手动修复`,
    };

    return suggestions[errorType] || suggestions.unknown;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(errorType: string): number {
    const confidenceMap: Record<string, number> = {
      missing_import: 90,
      syntax_error: 85,
      type_error: 75,
      undefined_variable: 70,
      null_reference: 65,
      missing_argument: 80,
      async_error: 60,
      permission_error: 50,
      unknown: 40,
    };

    return confidenceMap[errorType] || 40;
  }

  /**
   * 应用修复建议
   */
  async applyRepair(suggestionId: string): Promise<boolean> {
    const suggestion = this.repairSuggestions.find(s => s.id === suggestionId);

    if (!suggestion) {
      printWarning(`未找到修复建议: ${suggestionId}`);
      return false;
    }

    if (!this.currentFile) {
      throw new Error('没有打开的文件');
    }

    // 应用修复
    const lines = this.currentFile.content.split('\n');
    lines[suggestion.error.line - 1] = suggestion.fixedCode;
    this.currentFile.content = lines.join('\n');
    this.currentFile.modified = true;

    suggestion.applied = true;

    printSuccess(`已应用修复: ${suggestion.suggestion}`);

    // 自动重新编译
    if (this.editorConfig.autoCompile) {
      const result = await this.compile();
      if (result.success) {
        printSuccess('修复成功，编译通过！');
      } else {
        printWarning('修复后仍有错误，可能需要手动调整');
      }
    }

    return true;
  }

  /**
   * 应用所有修复建议
   */
  async applyAllRepairs(): Promise<number> {
    let applied = 0;

    for (const suggestion of this.repairSuggestions) {
      if (!suggestion.applied && suggestion.confidence >= 70) {
        const success = await this.applyRepair(suggestion.id);
        if (success) applied++;
      }
    }

    printSuccess(`已应用 ${applied} 个修复建议`);
    return applied;
  }

  /**
   * 解析编译错误
   */
  private parseErrors(output: string): CompileError[] {
    const errors: CompileError[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // TypeScript/JavaScript 错误格式
      const tsMatch = line.match(/^(.+)\((\d+),(\d+)\): error TS(\d+): (.+)$/);
      if (tsMatch) {
        errors.push({
          file: tsMatch[1],
          line: parseInt(tsMatch[2]),
          column: parseInt(tsMatch[3]),
          message: tsMatch[5],
          severity: 'error',
        });
        continue;
      }

      // Python 错误格式
      const pyMatch = line.match(/^(.+):(\d+):(\d+): (error|warning|note): (.+)$/);
      if (pyMatch) {
        errors.push({
          file: pyMatch[1],
          line: parseInt(pyMatch[2]),
          column: parseInt(pyMatch[3]),
          message: pyMatch[5],
          severity: pyMatch[4] as 'error' | 'warning' | 'info',
        });
        continue;
      }

      // 通用错误格式
      const genericMatch = line.match(/^(.+):(\d+): (.+)$/);
      if (genericMatch) {
        errors.push({
          file: genericMatch[1],
          line: parseInt(genericMatch[2]),
          column: 0,
          message: genericMatch[3],
          severity: 'error',
        });
      }
    }

    return errors;
  }

  /**
   * 解析测试输出
   */
  private parseTestOutput(output: string, duration: number): TestResult {
    const lines = output.split('\n');

    let total = 0;
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const line of lines) {
      // Vitest/Jest 格式
      if (line.includes('Tests:') || line.includes('tests:')) {
        const match = line.match(/(\d+) passed|(\d+) failed|(\d+) skipped/);
        if (match) {
          if (line.includes('passed')) passed = parseInt(match[1] || '0');
          if (line.includes('failed')) failed = parseInt(match[2] || '0');
          if (line.includes('skipped')) skipped = parseInt(match[3] || '0');
        }
      }

      // pytest 格式
      if (line.includes('passed') && line.includes('failed')) {
        const passMatch = line.match(/(\d+) passed/);
        const failMatch = line.match(/(\d+) failed/);
        if (passMatch) passed = parseInt(passMatch[1]);
        if (failMatch) failed = parseInt(failMatch[1]);
      }
    }

    total = passed + failed + skipped;

    return {
      success: failed === 0,
      total,
      passed,
      failed,
      skipped,
      output,
      errors: failed > 0 ? [output] : [],
      duration,
    };
  }

  /**
   * 检测语言
   */
  private detectLanguage(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();

    for (const [langId, langConfig] of Object.entries(SUPPORTED_LANGUAGES)) {
      if (langConfig.extension === ext) {
        return langId;
      }
    }

    return this.editorConfig.defaultLanguage;
  }

  /**
   * 获取代码模板
   */
  private getTemplate(language: string, fileName: string): string {
    const baseName = path.basename(fileName, path.extname(fileName));

    const templates: Record<string, string> = {
      typescript: `// ${fileName}
// Created: ${new Date().toISOString()}

interface ${this.toPascalCase(baseName)}Props {
  // Define props here
}

export class ${this.toPascalCase(baseName)} {
  constructor() {
    // Initialize
  }

  // Add methods here
}

export default ${this.toPascalCase(baseName)};
`,
      javascript: `// ${fileName}
// Created: ${new Date().toISOString()}

class ${this.toPascalCase(baseName)} {
  constructor() {
    // Initialize
  }

  // Add methods here
}

module.exports = ${this.toPascalCase(baseName)};
`,
      python: `#!/usr/bin/env python3
# ${fileName}
# Created: ${new Date().toISOString()}

class ${this.toPascalCase(baseName)}:
    """${this.toPascalCase(baseName)} class"""

    def __init__(self):
        """Initialize"""
        pass

    # Add methods here

if __name__ == "__main__":
    instance = ${this.toPascalCase(baseName)}()
`,
      rust: `// ${fileName}
// Created: ${new Date().toISOString()}

pub struct ${this.toPascalCase(baseName)} {
    // Define fields here
}

impl ${this.toPascalCase(baseName)} {
    pub fn new() -> Self {
        Self {}
    }

    // Add methods here
}

fn main() {
    let instance = ${this.toPascalCase(baseName)}::new();
}
`,
      go: `// ${fileName}
// Created: ${new Date().toISOString()}

package main

import "fmt"

type ${this.toPascalCase(baseName)} struct {
    // Define fields here
}

func New${this.toPascalCase(baseName)}() *${this.toPascalCase(baseName)} {
    return &${this.toPascalCase(baseName)}{}
}

// Add methods here

func main() {
    instance := New${this.toPascalCase(baseName)}()
    fmt.Println(instance)
}
`,
      java: `// ${fileName}
// Created: ${new Date().toISOString()}

public class ${this.toPascalCase(baseName)} {
    // Define fields here

    public ${this.toPascalCase(baseName)}() {
        // Initialize
    }

    // Add methods here

    public static void main(String[] args) {
        ${this.toPascalCase(baseName)} instance = new ${this.toPascalCase(baseName)}();
    }
}
`,
    };

    return templates[language] || `// ${fileName}\n// Created: ${new Date().toISOString()}\n`;
  }

  /**
   * 转换为PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .split(/[-_\s]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  /**
   * 获取当前文件
   */
  getCurrentFile(): FileInfo | null {
    return this.currentFile;
  }

  /**
   * 获取所有打开的文件
   */
  getOpenFiles(): FileInfo[] {
    return Array.from(this.openFiles.values());
  }

  /**
   * 获取编译历史
   */
  getCompileHistory(): CompileResult[] {
    return this.compileHistory;
  }

  /**
   * 获取测试历史
   */
  getTestHistory(): TestResult[] {
    return this.testHistory;
  }

  /**
   * 获取修复建议
   */
  getRepairSuggestions(): AIRepairSuggestion[] {
    return this.repairSuggestions;
  }

  /**
   * 获取支持的语言列表
   */
  getSupportedLanguages(): LanguageConfig[] {
    return Object.values(SUPPORTED_LANGUAGES);
  }

  /**
   * 获取编辑器配置
   */
  getEditorConfig(): EditorConfig {
    return this.editorConfig;
  }

  /**
   * 更新编辑器配置
   */
  updateEditorConfig(config: Partial<EditorConfig>): void {
    this.editorConfig = { ...this.editorConfig, ...config };
    printSuccess('编辑器配置已更新');
  }

  /**
   * 关闭文件
   */
  closeFile(filePath?: string): void {
    const targetPath = filePath || this.currentFile?.path;

    if (targetPath) {
      this.openFiles.delete(targetPath);

      if (this.currentFile?.path === targetPath) {
        const remaining = Array.from(this.openFiles.values());
        this.currentFile = remaining.length > 0 ? remaining[remaining.length - 1] : null;
      }

      printInfo(`关闭文件: ${path.basename(targetPath)}`);
    }
  }

  /**
   * 关闭所有文件
   */
  closeAll(): void {
    this.openFiles.clear();
    this.currentFile = null;
    printInfo('所有文件已关闭');
  }
}
