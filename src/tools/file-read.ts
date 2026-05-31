import * as fs from 'fs/promises';
import { Buffer } from 'buffer';
import { ToolDefinition, ToolResult } from './registry';

export const readFileTool: ToolDefinition = {
  name: 'file_read',
  description: `读取文件内容并返回。支持读取行范围。

使用场景：
- 查看文件的完整内容或特定部分
- 在编辑文件前先读取了解当前内容
- 查看错误信息中提到的文件和行号

参数说明：
- path: 文件的绝对或相对路径
- offset: 从第几行开始（0-based），用于跳过文件头部
- limit: 读取多少行，默认全部

返回：带行号的文件内容（cat -n 格式），行号从 1 开始`,
  input_schema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: '文件路径（绝对或相对路径）' },
      offset: { type: 'number', description: '起始行号（从0开始）' },
      limit: { type: 'number', description: '读取行数（默认 2000）' },
    },
    required: ['path'],
  },
  permission: 'auto',
};

const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024; // 5MB
const MAX_LINES = 10000;

/**
 * Detect if a buffer is likely binary by checking for null bytes in the first 8KB.
 */
function isBinaryBuffer(buf: Buffer): boolean {
  const checkLen = Math.min(buf.length, 8192);
  for (let i = 0; i < checkLen; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/**
 * Format file size in a human-readable way.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export async function executeReadFile(input: Record<string, any>): Promise<ToolResult> {
  try {
    const filePath = input.path;
    const offset = Math.max(0, input.offset || 0);
    const limit = Math.min(input.limit || 2000, MAX_LINES);

    // Check file exists and get metadata before reading
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch (statErr: any) {
      if (statErr.code === 'ENOENT') {
        return { output: `文件不存在: ${filePath}`, isError: true };
      }
      if (statErr.code === 'EACCES') {
        return { output: `权限不足，无法读取: ${filePath}`, isError: true };
      }
      return { output: `无法访问文件: ${statErr.message}`, isError: true };
    }

    if (stat.isDirectory()) {
      return { output: `路径是目录而非文件: ${filePath}，请使用 glob_match 列出目录内容`, isError: true };
    }

    // Read raw buffer first for binary detection
    const rawBuf = await fs.readFile(filePath);

    // Binary file detection
    if (isBinaryBuffer(rawBuf)) {
      return {
        output: `二进制文件: ${filePath} (${formatSize(stat.size)})\n无法以文本形式显示二进制文件。如需查看，请使用 image_read 工具（如果是图片）。`,
        isError: true,
      };
    }

    // Large file warning
    let largeFileWarning = '';
    if (stat.size > LARGE_FILE_THRESHOLD) {
      largeFileWarning = `⚠ 大文件 (${formatSize(stat.size)})，建议使用 offset/limit 读取特定行范围\n\n`;
    }

    // Decode as UTF-8
    const content = rawBuf.toString('utf-8');
    const lines = content.split('\n');
    const totalLines = lines.length;

    // Validate offset bounds
    if (offset >= totalLines && totalLines > 0) {
      return {
        output: `行号 ${offset} 超出范围，文件共 ${totalLines} 行（最大索引 ${totalLines - 1}）`,
        isError: true,
      };
    }

    const selected = lines.slice(offset, offset + limit);

    const numbered = selected
      .map((line, i) => `${offset + i + 1}\t${line}`)
      .join('\n');

    return {
      output: largeFileWarning + (numbered || '(空文件)'),
      isError: false,
    };
  } catch (err: any) {
    if (err.code === 'EACCES') {
      return { output: `权限不足，无法读取: ${input.path}`, isError: true };
    }
    return { output: `读取失败: ${err.message}`, isError: true };
  }
}
