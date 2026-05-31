import * as fs from 'fs/promises';
import { ToolDefinition, ToolResult } from './registry';

/**
 * Attempt to find the closest match for old_string in the file content.
 * Splits old_string into individual lines, checks which exist in the file,
 * and returns a diagnostic message with the actual surrounding content.
 */
function findClosestMatch(oldString: string, content: string): string | null {
  const fileLines = content.split('\n');
  const oldLines = oldString.split('\n').filter(line => line.trim().length > 0);

  if (oldLines.length === 0) return null;

  // Find which old_string lines exist in the file and at what positions
  const matchedLines: { oldLine: string; fileIndex: number }[] = [];
  for (const oldLine of oldLines) {
    const trimmedOld = oldLine.trim();
    if (trimmedOld.length === 0) continue;
    for (let i = 0; i < fileLines.length; i++) {
      if (fileLines[i].trim() === trimmedOld) {
        matchedLines.push({ oldLine: trimmedOld, fileIndex: i });
        break;
      }
    }
  }

  if (matchedLines.length === 0) return null;

  // Find the best contiguous cluster of matched lines
  matchedLines.sort((a, b) => a.fileIndex - b.fileIndex);

  let bestStart = 0;
  let bestEnd = 0;
  let bestScore = 0;

  for (let i = 0; i < matchedLines.length; i++) {
    let clusterEnd = i;
    let score = 1;
    for (let j = i + 1; j < matchedLines.length; j++) {
      // Lines close together (within 5 file lines) count as a cluster
      if (matchedLines[j].fileIndex - matchedLines[clusterEnd].fileIndex <= 5) {
        clusterEnd = j;
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
      bestEnd = clusterEnd;
    }
  }

  const centerIndex = matchedLines[bestStart].fileIndex;
  const contextStart = Math.max(0, centerIndex - 3);
  const contextEnd = Math.min(fileLines.length - 1, centerIndex + 5);

  const matchedLineNumbers = matchedLines.slice(bestStart, bestEnd + 1).map(m => m.fileIndex + 1);

  let snippet = '';
  for (let i = contextStart; i <= contextEnd; i++) {
    const lineNum = String(i + 1).padStart(4, ' ');
    const marker = matchedLineNumbers.includes(i + 1) ? ' > ' : '   ';
    snippet += `${lineNum}${marker}${fileLines[i]}\n`;
  }

  return `找到 ${matchedLines.length}/${oldLines.length} 行部分匹配（行 ${matchedLineNumbers.join(', ')}）：\n` +
    `文件实际内容（行 ${contextStart + 1}-${contextEnd + 1}）：\n` +
    snippet +
    `请对照以上实际内容修正 old_string。`;
}

/**
 * Search for unique substrings of old_string in content and return locations.
 */
function findSubstringLocation(oldString: string, content: string): string | null {
  const lines = content.split('\n');
  const trimmed = oldString.trim();

  // Try progressively shorter substrings (from the middle of old_string)
  const candidates: string[] = [];
  if (trimmed.length > 20) {
    // Try the longest unique-looking line from old_string
    const meaningfulLines = oldString.split('\n').filter(l => l.trim().length > 10);
    if (meaningfulLines.length > 0) {
      candidates.push(meaningfulLines[0].trim());
      if (meaningfulLines.length > 1) {
        candidates.push(meaningfulLines[meaningfulLines.length - 1].trim());
      }
    }
    // Also try a middle chunk
    const midStart = Math.floor(trimmed.length / 4);
    candidates.push(trimmed.slice(midStart, midStart + 40).trim());
  }

  for (const candidate of candidates) {
    if (candidate.length < 5) continue;
    const locations: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(candidate)) {
        locations.push(i + 1);
      }
    }
    if (locations.length > 0 && locations.length <= 3) {
      const contextLines = locations.map(lineNum => {
        const start = Math.max(0, lineNum - 2);
        const end = Math.min(lines.length, lineNum + 3);
        let snippet = '';
        for (let j = start; j < end; j++) {
          const ln = String(j + 1).padStart(4, ' ');
          const marker = j + 1 === lineNum ? ' > ' : '   ';
          snippet += `${ln}${marker}${lines[j]}\n`;
        }
        return `  行 ${lineNum} 附近：\n${snippet}`;
      });
      return `在文件中找到子串 "${candidate.slice(0, 50)}${candidate.length > 50 ? '...' : ''}" 出现在行 ${locations.join(', ')}：\n${contextLines.join('\n')}`;
    }
  }
  return null;
}

export const editFileTool: ToolDefinition = {
  name: 'file_edit',
  description: `精确编辑文件中的文本。old_string 必须与文件中的实际文本完全匹配（包括空格和缩进）。

使用方法：
1. 先用 file_read 读取文件获取最新内容
2. 从文件内容中复制要替换的精确文本作为 old_string
3. 提供足够的上下文使匹配唯一（建议 3-5 行）
4. 如果匹配失败，工具会显示文件的实际内容帮助你修正

注意事项：
- old_string 不能为空
- 如果有多处匹配，提供更多上下文或使用 replace_all
- 建议从文件底部往上编辑（避免行号偏移）`,
  input_schema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: '文件路径' },
      old_string: { type: 'string', description: '要替换的原始文本（必须精确匹配）' },
      new_string: { type: 'string', description: '替换后的新文本' },
      replace_all: { type: 'boolean', description: '是否替换所有匹配项（默认 false）' },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  permission: 'ask',
};

export async function executeEditFile(input: Record<string, any>): Promise<ToolResult> {
  try {
    const filePath = input.path;
    const oldString = input.old_string;
    const newString = input.new_string;
    const replaceAll = input.replace_all || false;

    // Validate inputs
    if (oldString === undefined || oldString === null || oldString === '') {
      return {
        output: '错误：old_string 不能为空。请提供要替换的原始文本。',
        isError: true,
      };
    }

    if (oldString === newString) {
      return {
        output: '错误：old_string 和 new_string 相同，无需替换。',
        isError: true,
      };
    }

    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch (readErr: any) {
      if (readErr.code === 'ENOENT') {
        return { output: `文件不存在: ${filePath}`, isError: true };
      }
      if (readErr.code === 'EACCES') {
        return { output: `权限不足，无法读取: ${filePath}`, isError: true };
      }
      return { output: `读取失败: ${readErr.message}`, isError: true };
    }

    if (!content.includes(oldString)) {
      const fileLines = content.split('\n');
      const totalLines = fileLines.length;
      const totalChars = content.length;

      const parts: string[] = [];
      parts.push(`错误：在 ${filePath} 中未找到匹配的文本。`);
      parts.push(`文件统计：共 ${totalLines} 行，${totalChars} 字符`);
      parts.push('');

      // Try fuzzy matching: find which lines from old_string exist in the file
      const fuzzyResult = findClosestMatch(oldString, content);
      if (fuzzyResult) {
        parts.push('[模糊匹配结果]');
        parts.push(fuzzyResult);
        parts.push('');
      }

      // Try substring search for unique substrings
      const substringResult = findSubstringLocation(oldString, content);
      if (substringResult) {
        parts.push('[子串定位]');
        parts.push(substringResult);
        parts.push('');
      }

      if (!fuzzyResult && !substringResult) {
        parts.push('提示：old_string 与文件内容无任何相似之处，请确认是否读取了正确的文件或文件内容是否已被修改。');
        parts.push('');
      }

      parts.push('请用 file_read 重新读取文件获取最新内容，然后对照实际内容修正 old_string。');

      return {
        output: parts.join('\n'),
        isError: true,
      };
    }

    // 检查是否有多处匹配（非 replaceAll 模式）
    if (!replaceAll) {
      const occurrences = content.split(oldString).length - 1;
      if (occurrences > 1) {
        return {
          output: `错误：找到 ${occurrences} 处匹配。请提供更多上下文使匹配唯一，或使用 replace_all: true`,
          isError: true,
        };
      }
    }

    // Count occurrences before replacement
    const totalOccurrences = content.split(oldString).length - 1;

    if (replaceAll) {
      content = content.split(oldString).join(newString);
    } else {
      content = content.replace(oldString, () => newString);
    }

    try {
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (writeErr: any) {
      if (writeErr.code === 'EACCES') {
        return { output: `权限不足，无法写入: ${filePath}`, isError: true };
      }
      return { output: `写入失败: ${writeErr.message}`, isError: true };
    }

    return {
      output: `已编辑 ${filePath} (替换 ${replaceAll ? totalOccurrences : 1} 处)`,
      isError: false,
    };
  } catch (err: any) {
    return { output: `编辑失败: ${err.message}`, isError: true };
  }
}
