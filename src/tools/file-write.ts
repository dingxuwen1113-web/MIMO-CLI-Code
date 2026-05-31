import * as fs from 'fs/promises';
import * as path from 'path';
import { ToolDefinition, ToolResult } from './registry';

export const writeFileTool: ToolDefinition = {
  name: 'file_write',
  description: `创建新文件或完全覆盖现有文件。需要审批。

使用场景：
- 创建全新的文件
- 需要完全重写一个文件时（如生成配置文件）

注意：
- 这会覆盖文件的全部内容！如果只想修改部分内容，请使用 file_edit
- 如果父目录不存在，会自动创建
- 返回写入的行数和字节数`,
  input_schema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: '文件路径' },
      content: { type: 'string', description: '文件内容' },
    },
    required: ['path', 'content'],
  },
  permission: 'ask',
};

export async function executeWriteFile(input: Record<string, any>): Promise<ToolResult> {
  try {
    const filePath = input.path;
    const content = input.content;

    // Validate path is not an existing directory
    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        return { output: `无法写入: ${filePath} 是一个目录`, isError: true };
      }
    } catch {
      // File doesn't exist yet — that's fine, we'll create it
    }

    // 自动创建父目录
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(filePath, content, 'utf-8');

    const lineCount = content.split('\n').length;
    const byteSize = Buffer.byteLength(content, 'utf-8');
    const sizeStr = byteSize < 1024 ? `${byteSize}B` : `${(byteSize / 1024).toFixed(1)}KB`;

    return {
      output: `已写入 ${filePath} (${lineCount} 行, ${sizeStr})`,
      isError: false,
    };
  } catch (err: any) {
    if (err.code === 'EACCES') {
      return { output: `权限不足，无法写入: ${input.path}`, isError: true };
    }
    if (err.code === 'ENOSPC') {
      return { output: `磁盘空间不足，无法写入: ${input.path}`, isError: true };
    }
    return { output: `写入失败: ${err.message}`, isError: true };
  }
}
