import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ToolDefinition, ToolResult } from './registry';

const execAsync = promisify(exec);

const isWindows = os.platform() === 'win32';
const MAX_OUTPUT_CHARS = 100000; // Truncate output beyond this limit

export const shellTool: ToolDefinition = {
  name: 'shell_exec',
  description: `执行 Shell 命令。需要审批。

行为说明：
- stdout 和 stderr 都会返回（用 [stdout] [stderr] 标记）
- 非零退出码表示失败，工具会返回 isError: true
- 超时默认 30000ms，可通过 timeout 参数调整
- 命令不存在时会提示安装方式
- 构建/测试失败时会提取第一个错误的文件和行号

常用命令：
- TypeScript 类型检查: npx tsc --noEmit
- Python 语法检查: python -m py_compile file.py
- Go 构建: go build ./...
- 运行测试: npm test
- 安装依赖: npm install`,
  input_schema: {
    type: 'object' as const,
    properties: {
      command: { type: 'string', description: '要执行的 Shell 命令' },
      timeout: { type: 'number', description: '超时时间（毫秒，默认 30000）' },
      cwd: { type: 'string', description: '工作目录' },
      sandbox: { type: 'boolean', description: '是否使用沙箱隔离（默认 false）' },
      background: { type: 'boolean', description: '是否后台运行' },
    },
    required: ['command'],
  },
  permission: 'ask',
};

// 危险命令黑名单
const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+\/\b/,
  /\brm\s+\/[sg]/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /:\(\)\{/,
  /\bchmod\s+-R\s+777\s+\//,
  /\bformat\s+[a-z]:/i,
  /\bdel\s+\/[sfq]\s+[a-z]:\\/i,
];

// 后台进程跟踪
const backgroundProcesses: Map<string, { pid: number; command: string; startTime: string }> = new Map();

/** Known command-to-install suggestions */
const COMMAND_INSTALL_SUGGESTIONS: Record<string, string> = {
  tsc: 'npm install -g typescript 或 npx tsc',
  typescript: 'npm install -g typescript',
  tsx: 'npm install -g tsx',
  tsx2: 'npm install -g tsx',
  tsnd: 'npm install -g ts-node-dev',
  tsx_node: 'npm install -g tsx',
  nodemon: 'npm install -g nodemon',
  eslint: 'npm install -g eslint 或 npx eslint',
  prettier: 'npm install -g prettier 或 npx prettier',
  jest: 'npm install -D jest',
  vitest: 'npm install -D vitest',
  mocha: 'npm install -g mocha 或 npm install -D mocha',
  pm2: 'npm install -g pm2',
  pnpm: 'npm install -g pnpm',
  yarn: 'npm install -g yarn',
  bun: 'https://bun.sh',
  deno: 'https://deno.land',
  cargo: 'https://rustup.rs',
  rustc: 'https://rustup.rs',
  go: 'https://go.dev/dl/',
  python3: 'https://www.python.org/downloads/',
  pip: 'python -m ensurepip 或 https://pip.pypa.io',
  pip3: 'python3 -m ensurepip 或 https://pip.pypa.io',
  py: 'https://www.python.org/downloads/',
  gcc: 'apt install gcc 或 brew install gcc',
  gpp: 'apt install g++ 或 brew install gcc',
  clang: 'apt install clang 或 brew install llvm',
  clangpp: 'apt install clang 或 brew install llvm',
  make: 'apt install make 或 brew install make',
  cmake: 'apt install cmake 或 brew install cmake',
  docker: 'https://docs.docker.com/get-docker/',
  kubectl: 'https://kubernetes.io/docs/tasks/tools/',
  gh: 'https://cli.github.com/',
  git: 'https://git-scm.com/',
  java: 'https://adoptium.net/',
  javac: 'https://adoptium.net/',
  ruby: 'https://www.ruby-lang.org/',
  gem: 'https://www.ruby-lang.org/',
  bundle: 'gem install bundler',
  composer: 'https://getcomposer.org/',
  php: 'https://www.php.net/',
  dotnet: 'https://dotnet.microsoft.com/',
  sqlcmd: 'https://learn.microsoft.com/en-us/sql/tools/sqlcmd-utility',
  mongosh: 'https://www.mongodb.com/try/download/shell',
  redis_cli: 'apt install redis-tools 或 brew install redis',
};

/**
 * Extract error locations from common compiler/linter output formats.
 * Returns a list of { file, line, col, message } entries.
 */
function extractErrorLocations(output: string): Array<{ file: string; line: string; col: string; message: string }> {
  const locations: Array<{ file: string; line: string; col: string; message: string }> = [];

  const patterns = [
    // TypeScript: src/foo.ts(10,5): error TS2322: ...
    /\(([0-9]+),([0-9]+)\):\s*error\s+(TS\d+:\s*.+)/,
    // Go: src/foo.go:10:5: undefined: foo
    /^([^:]+):([0-9]+):([0-9]+):\s*(.+)/,
    // GCC/Clang: src/foo.c:10:5: error: ...
    /^([^:]+):([0-9]+):([0-9]+):\s*(?:fatal\s+)?error:\s*(.+)/i,
    // ESLint: src/foo.ts:10:5: error ... (ESLint format)
    /^([^:]+):([0-9]+):([0-9]+):\s*error\s+(.+)/,
    // Python: File "src/foo.py", line 10
    /File "([^"]+)", line (\d+)/,
    // Node.js stack: at Object.<anonymous> (src/foo.ts:10:5)
    /at .+?\(([^:]+):(\d+):(\d+)\)/,
    // Generic file:line:col: message
    /^([a-zA-Z]:[^:]*|\/[^:]+):(\d+):(\d+):\s*(.+Error.+)/i,
    // Generic file:line: message (no column)
    /^([a-zA-Z]:[^:]*|\/[^:]+):(\d+):\s*(.+[Ee]rror.+)/,
  ];

  const lines = output.split('\n');
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        let file = match[1];
        let lineNum = match[2];
        let col = match[3] || '-';
        let message = match[4] || trimmed;

        // Normalize file path (trim surrounding whitespace)
        file = file.trim();

        const key = `${file}:${lineNum}:${col}`;
        if (!seen.has(key)) {
          seen.add(key);
          locations.push({ file, line: lineNum, col, message: message.trim() });
        }
        break;
      }
    }
  }

  return locations;
}

/**
 * Count errors vs warnings in command output.
 */
function countErrorsWarnings(output: string): { errors: number; warnings: number } {
  const lines = output.split('\n');
  let errors = 0;
  let warnings = 0;

  for (const line of lines) {
    const lower = line.toLowerCase();
    // Match patterns like "error TS2322", "error:", "Error:", "ERROR", "warning:", "Warning:", "WARN"
    if (/\berror\b/.test(lower) || /\bfatal\b/.test(lower) || /\bfailed\b/.test(lower)) {
      errors++;
    } else if (/\bwarning\b/.test(lower) || /\bwarn\b/.test(lower)) {
      warnings++;
    }
  }

  return { errors, warnings };
}

/**
 * Detect "command not found" errors and return install suggestion.
 */
function detectCommandNotFound(output: string): string | null {
  // Patterns: "command not found", "'xxx' is not recognized", "No such file or directory" (for executable)
  const patterns = [
    /(?:command|program) not found:\s*(\S+)/i,
    /'(\S+)' is not recognized as an internal or external command/i,
    /'(\S+)' is not recognized as a name of a cmdlet/i,
    /(\S+): command not found/i,
    /bash:\s*(\S+):\s*command not found/i,
    /zsh:\s*command not found:\s*(\S+)/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      const cmd = match[1].toLowerCase().replace(/[^a-z0-9]/g, '');
      const suggestion = COMMAND_INSTALL_SUGGESTIONS[cmd];
      if (suggestion) {
        return `命令 '${match[1]}' 未找到。安装方式: ${suggestion}`;
      }
      return `命令 '${match[1]}' 未找到。请先安装该命令。`;
    }
  }

  return null;
}

/**
 * Analyze failed command output and produce an enhanced error message.
 */
function analyzeFailureOutput(exitCode: number, stdout: string, stderr: string): string {
  const combined = [stdout, stderr].filter(Boolean).join('\n');
  const parts: string[] = [];

  // 1. Exit code
  parts.push(`[exit code: ${exitCode}]`);

  // 2. Check for command not found
  const notFound = detectCommandNotFound(combined);
  if (notFound) {
    parts.push(`[提示] ${notFound}`);
  }

  // 3. Count errors and warnings
  const { errors, warnings } = countErrorsWarnings(combined);
  if (errors > 0 || warnings > 0) {
    parts.push(`[errors: ${errors}, warnings: ${warnings}]`);
  }

  // 4. Extract error locations
  const locations = extractErrorLocations(combined);
  if (locations.length > 0) {
    const first = locations[0];
    parts.push(`[首个错误位置: ${first.file}:${first.line}:${first.col}]`);
    if (locations.length > 1) {
      parts.push(`[共发现 ${locations.length} 个错误位置]`);
    }
  }

  // 5. Include full output
  parts.push('');
  if (stdout.trim()) {
    parts.push('[stdout]');
    parts.push(stdout.trim());
  }
  if (stderr.trim()) {
    parts.push('[stderr]');
    parts.push(stderr.trim());
  }

  return parts.join('\n');
}

export async function executeShell(input: Record<string, any>): Promise<ToolResult> {
  try {
    const command = input.command as string;
    const timeout = input.timeout || 30000;
    const cwd = input.cwd || process.cwd();
    const useSandbox = input.sandbox || false;
    const background = input.background || false;

    // 安全检查
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        return {
          output: `安全拒绝：命令包含被禁止的操作 (${pattern.source})`,
          isError: true,
        };
      }
    }

    // 沙箱模式
    if (useSandbox) {
      return await executeSandboxed(command, cwd, timeout);
    }

    // 后台执行
    if (background) {
      return await executeBackground(command, cwd);
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        cwd,
        maxBuffer: 1024 * 1024 * 10,
        shell: isWindows ? 'powershell.exe' : '/bin/bash',
      });

      let output = [stdout, stderr].filter(Boolean).join('\n').trim();

      // Truncate very long output
      if (output.length > MAX_OUTPUT_CHARS) {
        const truncated = output.slice(0, MAX_OUTPUT_CHARS);
        const remainingLines = output.slice(MAX_OUTPUT_CHARS).split('\n').length;
        output = truncated + `\n\n... [输出被截断，还剩约 ${remainingLines} 行未显示。使用 offset/limit 或管道限制输出]`;
      }

      return {
        output: output || '(命令执行完成，无输出)',
        isError: false,
      };
    } catch (execErr: any) {
      const stdout = execErr.stdout || '';
      const stderr = execErr.stderr || '';
      const exitCode = execErr.code || execErr.status || 1;

      // Detect timeout specifically
      if (execErr.killed || execErr.signal === 'SIGTERM') {
        const output = [stdout, stderr].filter(Boolean).join('\n').trim();
        return {
          output: `命令超时 (${timeout / 1000}秒)。可通过 timeout 参数增大超时时间。\n${output}`,
          isError: true,
        };
      }

      // Enhanced error analysis
      const enhancedOutput = analyzeFailureOutput(exitCode, stdout, stderr);

      return {
        output: enhancedOutput,
        isError: exitCode !== 0,
      };
    }
  } catch (err: any) {
    return { output: `执行错误: ${err.message}`, isError: true };
  }
}

// 沙箱执行：限制在临时目录，限制权限
async function executeSandboxed(command: string, originalCwd: string, timeout: number): Promise<ToolResult> {
  const sandboxDir = path.join(os.tmpdir(), 'mimo-sandbox', Date.now().toString());

  try {
    await fs.mkdir(sandboxDir, { recursive: true });

    // 复制当前目录的关键文件到沙箱（只复制配置文件，不复制 node_modules）
    const filesToCopy = ['package.json', 'tsconfig.json', '.env.example'];
    for (const file of filesToCopy) {
      try {
        const src = path.join(originalCwd, file);
        const dest = path.join(sandboxDir, file);
        await fs.copyFile(src, dest);
      } catch {
        // 文件不存在，跳过
      }
    }

    const { stdout, stderr } = await execAsync(command, {
      timeout,
      cwd: sandboxDir,
      maxBuffer: 1024 * 1024 * 10,
      shell: isWindows ? 'powershell.exe' : '/bin/bash',
    });

    const output = [stdout, stderr].filter(Boolean).join('\n').trim();
    return {
      output: `[沙箱:${sandboxDir}]\n${output || '(命令执行完成，无输出)'}`,
      isError: false,
    };
  } catch (execErr: any) {
    const output = [execErr.stdout, execErr.stderr].filter(Boolean).join('\n').trim();
    const exitCode = execErr.code || execErr.status || 1;
    return {
      output: `[沙箱] 命令退出码: ${exitCode}\n${output}`,
      isError: exitCode !== 0,
    };
  } finally {
    // 清理沙箱
    try {
      await fs.rm(sandboxDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  }
}

// 后台执行：启动进程并返回 PID
async function executeBackground(command: string, cwd: string): Promise<ToolResult> {
  const child = exec(command, {
    cwd,
    shell: isWindows ? 'powershell.exe' : '/bin/bash',
  });

  const pid = child.pid || 0;
  const id = `bg-${pid}`;

  backgroundProcesses.set(id, {
    pid,
    command,
    startTime: new Date().toISOString(),
  });

  // 收集输出
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (data) => { stdout += data; });
  child.stderr?.on('data', (data) => { stderr += data; });

  child.on('exit', (code) => {
    backgroundProcesses.delete(id);
  });

  return {
    output: `后台进程已启动\nPID: ${pid}\nID: ${id}\n命令: ${command}`,
    isError: false,
  };
}

// 查询后台进程状态
export function getBackgroundProcesses(): Array<{ id: string; pid: number; command: string; startTime: string }> {
  return Array.from(backgroundProcesses.entries()).map(([id, info]) => ({ id, ...info }));
}
