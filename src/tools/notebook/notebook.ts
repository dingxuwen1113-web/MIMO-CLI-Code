// ── Jupyter Notebook 工具 ─────────────────────────

import * as fs from 'fs/promises';
import { ToolDefinition, ToolResult } from '../registry';

export const notebookReadTool: ToolDefinition = {
  name: 'notebook_read',
  description: `读取 Jupyter Notebook 的 cells。返回代码和 markdown cells 及其输出。自动批准。`,
  input_schema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Notebook 文件路径' },
      cellRange: { type: 'string', description: 'Cell 范围 (如 "0-5" 或 "3")' },
    },
    required: ['path'],
  },
  permission: 'auto',
};

export const notebookEditTool: ToolDefinition = {
  name: 'notebook_edit',
  description: `编辑 Notebook 中的 cell。支持替换、插入、删除操作。需审批。`,
  input_schema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Notebook 文件路径' },
      cellIndex: { type: 'number', description: 'Cell 索引 (0-based)' },
      newSource: { type: 'string', description: '新的 cell 源码' },
      cellType: { type: 'string', enum: ['code', 'markdown'], description: 'Cell 类型' },
      editMode: { type: 'string', enum: ['replace', 'insert', 'delete'], description: '编辑模式' },
    },
    required: ['path', 'cellIndex'],
  },
  permission: 'ask',
};

interface NotebookCell {
  cell_type: string;
  source: string[];
  outputs?: any[];
  execution_count?: number | null;
}

interface Notebook {
  cells: NotebookCell[];
  metadata: any;
  nbformat: number;
  nbformat_minor: number;
}

export async function executeNotebookRead(input: Record<string, any>): Promise<ToolResult> {
  try {
    const filePath = input.path;

    // Validate file exists
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch (readErr: any) {
      if (readErr.code === 'ENOENT') {
        return { output: `Notebook 文件不存在: ${filePath}`, isError: true };
      }
      if (readErr.code === 'EACCES') {
        return { output: `权限不足，无法读取: ${filePath}`, isError: true };
      }
      return { output: `读取 Notebook 失败: ${readErr.message}`, isError: true };
    }

    let nb: Notebook;
    try {
      nb = JSON.parse(raw);
    } catch {
      return { output: `无效的 Notebook JSON 格式: ${filePath}`, isError: true };
    }

    if (!nb.cells || !Array.isArray(nb.cells)) {
      return { output: `文件不是有效的 Jupyter Notebook (缺少 cells 数组): ${filePath}`, isError: true };
    }

    let startCell = 0;
    let endCell = nb.cells.length;

    if (input.cellRange) {
      const parts = input.cellRange.split('-').map(Number);
      if (parts.some(isNaN)) {
        return { output: `无效的 cellRange 格式: "${input.cellRange}"。请使用 "0-5" 或 "3" 格式。`, isError: true };
      }
      startCell = parts[0] || 0;
      endCell = parts.length > 1 ? (parts[1] + 1) : startCell + 1;

      if (startCell < 0 || startCell >= nb.cells.length) {
        return { output: `Cell 起始索引 ${startCell} 超出范围 (0-${nb.cells.length - 1})`, isError: true };
      }
      if (endCell > nb.cells.length) {
        endCell = nb.cells.length;
      }
    }

    const cells = nb.cells.slice(startCell, endCell);
    const output = cells.map((cell, i) => {
      const idx = startCell + i;
      const type = cell.cell_type === 'code' ? '```python' : '```markdown';
      const source = cell.source.join('');
      const outputs = cell.outputs?.length
        ? `\n[输出]: ${cell.outputs.map((o: any) => o.text?.join('') || o.data?.['text/plain']?.join('') || '').join('\n')}`
        : '';
      return `[Cell ${idx}] (${cell.cell_type})\n${type}\n${source}\n\`\`\`${outputs}`;
    }).join('\n\n');

    return {
      output: `Notebook: ${filePath} (${nb.cells.length} cells)\n\n${output}`,
      isError: false,
    };
  } catch (err: any) {
    return { output: `读取 Notebook 失败: ${err.message}`, isError: true };
  }
}

export async function executeNotebookEdit(input: Record<string, any>): Promise<ToolResult> {
  try {
    const filePath = input.path;
    const cellIndex = input.cellIndex;
    const editMode = input.editMode || 'replace';

    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch (readErr: any) {
      if (readErr.code === 'ENOENT') {
        return { output: `Notebook 文件不存在: ${filePath}`, isError: true };
      }
      if (readErr.code === 'EACCES') {
        return { output: `权限不足，无法读取: ${filePath}`, isError: true };
      }
      return { output: `读取 Notebook 失败: ${readErr.message}`, isError: true };
    }

    let nb: Notebook;
    try {
      nb = JSON.parse(raw);
    } catch {
      return { output: `无效的 Notebook JSON 格式: ${filePath}`, isError: true };
    }

    if (!nb.cells || !Array.isArray(nb.cells)) {
      return { output: `文件不是有效的 Jupyter Notebook (缺少 cells 数组): ${filePath}`, isError: true };
    }

    switch (editMode) {
      case 'replace': {
        if (cellIndex < 0 || cellIndex >= nb.cells.length) {
          return { output: `Cell 索引 ${cellIndex} 超出范围 (0-${nb.cells.length - 1})`, isError: true };
        }
        if (input.newSource !== undefined) {
          nb.cells[cellIndex].source = input.newSource.split('\n').map((line: string, i: number, arr: string[]) =>
            i < arr.length - 1 ? line + '\n' : line
          );
        }
        if (input.cellType) {
          nb.cells[cellIndex].cell_type = input.cellType;
        }
        break;
      }
      case 'insert': {
        const newCell: NotebookCell = {
          cell_type: input.cellType || 'code',
          source: (input.newSource || '').split('\n').map((line: string, i: number, arr: string[]) =>
            i < arr.length - 1 ? line + '\n' : line
          ),
          outputs: [],
          execution_count: null,
        };
        nb.cells.splice(cellIndex, 0, newCell);
        break;
      }
      case 'delete': {
        if (cellIndex < 0 || cellIndex >= nb.cells.length) {
          return { output: `Cell 索引 ${cellIndex} 超出范围`, isError: true };
        }
        nb.cells.splice(cellIndex, 1);
        break;
      }
    }

    await fs.writeFile(filePath, JSON.stringify(nb, null, 1), 'utf-8');

    return {
      output: `已${editMode === 'replace' ? '修改' : editMode === 'insert' ? '插入' : '删除'} Cell ${cellIndex}`,
      isError: false,
    };
  } catch (err: any) {
    return { output: `编辑 Notebook 失败: ${err.message}`, isError: true };
  }
}
