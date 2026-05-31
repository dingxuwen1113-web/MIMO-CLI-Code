import { glob as globFn } from 'glob';
import { ToolDefinition, ToolResult } from './registry';

export const globTool: ToolDefinition = {
  name: 'glob_match',
  description: `使用 glob 模式查找文件。比 grep 更快，只匹配文件名/路径。

使用场景：
- 查找项目中有哪些 .ts 文件
- 查找特定目录结构
- 确认某个文件是否存在

参数说明：
- pattern: glob 模式（如 "src/**/*.ts", "test/**/*"）
- path: 搜索根目录

返回：匹配的文件路径列表，按修改时间排序（最新在前）。自动忽略 node_modules、.git、dist。`,
  input_schema: {
    type: 'object' as const,
    properties: {
      pattern: { type: 'string', description: 'glob 模式 (如 "src/**/*.ts")' },
      path: { type: 'string', description: '搜索路径（默认当前目录）' },
      ignore: { type: 'array', items: { type: 'string' }, description: '要忽略的 glob 模式数组 (如 ["node_modules/**"])' },
    },
    required: ['pattern'],
  },
  permission: 'auto',
};

export async function executeGlob(input: Record<string, any>): Promise<ToolResult> {
  try {
    const pattern = input.pattern;
    const searchPath = input.path || '.';

    // Default ignore patterns to skip common non-useful directories
    const defaultIgnore = ['node_modules/**', '.git/**', 'dist/**', '.next/**'];
    const userIgnore: string[] = input.ignore || [];
    const ignorePatterns = [...defaultIgnore, ...userIgnore];

    let files: string[];
    try {
      files = await globFn(pattern, {
        cwd: searchPath,
        absolute: false,
        nodir: true,
        ignore: ignorePatterns,
      });
    } catch (globErr: any) {
      return { output: `Glob 模式错误: ${globErr.message}`, isError: true };
    }

    // Sort by modification time (most recent first) with fallback to alphabetical
    const sorted = await sortFilesByMtime(files, searchPath);
    const limited = sorted.slice(0, 200);

    const matchCount = files.length;
    let warning = '';
    if (matchCount > 200) {
      warning = `共 ${matchCount} 个匹配，显示前 200 个。使用更具体的 pattern 缩小范围。\n\n`;
    }

    return {
      output: limited.length > 0
        ? warning + limited.join('\n')
        : '(未找到匹配文件)',
      isError: false,
    };
  } catch (err: any) {
    return { output: `匹配错误: ${err.message}`, isError: true };
  }
}

/**
 * Sort files by modification time (newest first), falling back to alphabetical.
 * Silently skips files that can't be stat'd (e.g., permission errors).
 */
async function sortFilesByMtime(files: string[], cwd: string): Promise<string[]> {
  const path = await import('path');
  const fs = await import('fs/promises');

  const statPromises = files.map(async (file) => {
    try {
      const stat = await fs.stat(path.join(cwd, file));
      return { file, mtime: stat.mtimeMs };
    } catch {
      return { file, mtime: 0 };
    }
  });

  const resolved = await Promise.all(statPromises);
  resolved.sort((a, b) => b.mtime - a.mtime || a.file.localeCompare(b.file));
  return resolved.map((e) => e.file);
}
