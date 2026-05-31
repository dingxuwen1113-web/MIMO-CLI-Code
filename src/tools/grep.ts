import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import { ToolDefinition, ToolResult } from './registry';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const isWindows = os.platform() === 'win32';

export const grepTool: ToolDefinition = {
  name: 'grep_search',
  description: `使用正则表达式搜索文件内容。基于 ripgrep，速度快。

使用场景：
- 查找某个函数/变量在哪些文件中被使用
- 搜索错误信息的来源
- 查找特定模式的代码

参数说明：
- pattern: 正则表达式（不是 glob，是 regex）
- path: 搜索目录，默认当前目录
- glob: 文件过滤（如 "*.ts", "*.{js,ts}"）
- context_lines: 显示匹配行的上下文行数

返回：匹配的文件路径和行号。默认最多 250 条结果。`,
  input_schema: {
    type: 'object' as const,
    properties: {
      pattern: { type: 'string', description: '正则表达式模式' },
      path: { type: 'string', description: '搜索路径（默认当前目录）' },
      glob: { type: 'string', description: '文件过滤 (如 "*.ts")' },
      max_results: { type: 'number', description: '最大结果数（默认 50）' },
      context_lines: { type: 'number', description: '匹配行前后显示的上下文行数（默认 0）' },
      context_before: { type: 'number', description: '匹配行前显示的行数（覆盖 context_lines）' },
      context_after: { type: 'number', description: '匹配行后显示的行数（覆盖 context_lines）' },
    },
    required: ['pattern'],
  },
  permission: 'auto',
};

export async function executeGrep(input: Record<string, any>): Promise<ToolResult> {
  try {
    const pattern = input.pattern as string;
    const searchPath = input.path || '.';
    const glob = input.glob as string | undefined;
    const maxResults = input.max_results || 50;
    const contextLines = input.context_lines || 0;
    const contextBefore = input.context_before ?? contextLines;
    const contextAfter = input.context_after ?? contextLines;

    // Validate regex pattern
    try {
      new RegExp(pattern);
    } catch {
      return { output: `无效的正则表达式: ${pattern}`, isError: true };
    }

    let output = '';

    // 优先尝试 ripgrep
    const hasRg = await checkCommand('rg');
    if (hasRg) {
      const args = ['-n', `--max-count=${maxResults}`];
      if (contextBefore > 0) args.push('-B', String(contextBefore));
      if (contextAfter > 0) args.push('-A', String(contextAfter));
      if (glob) args.push('-g', glob);
      args.push(pattern, searchPath);

      try {
        const result = await execFileAsync('rg', args, { timeout: 10000, maxBuffer: 1024 * 1024 });
        output = String(result.stdout).trim();
      } catch {
        // rg exits non-zero when no matches found; treat as empty
        output = '';
      }
    } else if (isWindows) {
      // Windows: 使用 findstr 或 Select-String
      const fileFilter = glob || '*';
      const contextFlag = contextBefore > 0 ? `-Context ${contextBefore}` : '';
      // findstr 不支持完整正则，使用 PowerShell Select-String
      const psCommand = `Get-ChildItem -Path "${searchPath}" -Recurse -Include "${fileFilter}" -File | Select-String -Pattern "${escapeArg(pattern)}" ${contextFlag} -List | Select-Object -First ${maxResults} | ForEach-Object { $_.RelativePath + ':' + $_.LineNumber + ':' + $_.Line }`;
      try {
        const result = await execAsync(`powershell.exe -Command "${psCommand}"`, {
          timeout: 15000,
          maxBuffer: 1024 * 1024,
        });
        output = String(result.stdout).trim();
      } catch {
        // 回退到 findstr
        const cmd = `findstr /r /s /n "${escapeArg(pattern)}" "${searchPath}\\${fileFilter}" 2>nul`;
        const result = await execAsync(cmd, { timeout: 10000, maxBuffer: 1024 * 1024 });
        output = String(result.stdout).trim();
      }
    } else {
      // Linux/Mac: 使用 grep
      const fileFilter = glob || '*';
      const contextFlag = contextBefore > 0 ? `-A ${contextAfter} -B ${contextBefore}` : '';
      const cmd = `grep -rn ${contextFlag} --include="${fileFilter}" "${escapeArg(pattern)}" "${escapeArg(searchPath)}" 2>/dev/null | head -${maxResults * (1 + contextBefore + contextAfter)} || true`;
      const result = await execAsync(cmd, { timeout: 10000, maxBuffer: 1024 * 1024 });
      output = String(result.stdout).trim();
    }

    return {
      output: output || '(未找到匹配结果)',
      isError: false,
    };
  } catch (err: any) {
    return { output: `搜索错误: ${err.message}`, isError: true };
  }
}

async function checkCommand(cmd: string): Promise<boolean> {
  try {
    const check = isWindows ? `where ${cmd}` : `which ${cmd}`;
    await execAsync(check, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function escapeArg(arg: string): string {
  if (isWindows) {
    return arg.replace(/"/g, '`"').replace(/\$/g, '`$');
  }
  return arg.replace(/"/g, '\\"').replace(/\$/g, '\\$');
}
