// ── 图片读取工具 ──────────────────────────────────

import * as fs from 'fs/promises';
import * as path from 'path';
import { ToolDefinition, ToolResult } from '../registry';

export const imageReadTool: ToolDefinition = {
  name: 'image_read',
  description: `读取图片文件，返回元信息（格式、尺寸、大小）和 base64 数据。自动批准。支持 PNG、JPEG、GIF、WebP。`,
  input_schema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: '图片文件路径' },
      maxSize: { type: 'number', description: '最大文件大小 (MB, 默认 10)' },
    },
    required: ['path'],
  },
  permission: 'auto',
};

export const fileUploadTool: ToolDefinition = {
  name: 'file_upload',
  description: `上传文件到指定路径。需审批。`,
  input_schema: {
    type: 'object' as const,
    properties: {
      sourcePath: { type: 'string', description: '本地文件路径' },
      destinationPath: { type: 'string', description: '目标路径' },
    },
    required: ['sourcePath', 'destinationPath'],
  },
  permission: 'ask',
};

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico', '.tiff'];

export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

export async function executeImageRead(input: Record<string, any>): Promise<ToolResult> {
  try {
    const filePath = input.path;
    const maxSize = (input.maxSize || 10) * 1024 * 1024;

    // Check format BEFORE reading the file into memory
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
      bmp: 'image/bmp', ico: 'image/x-icon', tiff: 'image/tiff',
    };
    const mime = mimeMap[ext];

    if (!mime) {
      return { output: `不支持的图片格式: ${path.extname(filePath)}。支持的格式: ${Object.keys(mimeMap).join(', ')}`, isError: true };
    }

    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch (statErr: any) {
      if (statErr.code === 'ENOENT') {
        return { output: `图片文件不存在: ${filePath}`, isError: true };
      }
      return { output: `无法访问图片文件: ${statErr.message}`, isError: true };
    }

    if (stat.size > maxSize) {
      return { output: `文件过大: ${(stat.size / 1024 / 1024).toFixed(1)}MB (最大 ${maxSize / 1024 / 1024}MB)`, isError: true };
    }

    const buffer = await fs.readFile(filePath);
    const base64 = buffer.toString('base64');

    // Try to detect dimensions for PNG and JPEG
    const dimensions = detectImageDimensions(buffer, ext);

    const parts = [
      `图片: ${path.basename(filePath)}`,
      `格式: ${mime}`,
      `大小: ${(stat.size / 1024).toFixed(1)}KB`,
    ];
    if (dimensions) {
      parts.push(`尺寸: ${dimensions}`);
    }
    parts.push(`base64: ${base64}`);

    return {
      output: parts.join('\n'),
      isError: false,
    };
  } catch (err: any) {
    return { output: `读取图片失败: ${err.message}`, isError: true };
  }
}

/**
 * Detect image dimensions from raw bytes for PNG and JPEG.
 * Returns "WxH" string or null if unable to detect.
 */
function detectImageDimensions(buffer: Buffer, ext: string): string | null {
  try {
    // PNG: width and height at bytes 16-23 (4 bytes each, big-endian)
    if ((ext === 'png') && buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return `${width}x${height}`;
    }

    // JPEG: search for SOF markers
    if ((ext === 'jpg' || ext === 'jpeg') && buffer.length >= 4 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
      let offset = 2;
      while (offset < buffer.length - 4) {
        if (buffer[offset] !== 0xFF) break;
        const marker = buffer[offset + 1];
        // SOF markers: C0-C3, C5-C7, C9-CB, CD-CF
        if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) ||
            (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
          if (offset + 9 < buffer.length) {
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            return `${width}x${height}`;
          }
        }
        // Skip to next marker
        if (offset + 3 < buffer.length) {
          const segLen = buffer.readUInt16BE(offset + 2);
          offset += 2 + segLen;
        } else {
          break;
        }
      }
    }
  } catch {
    // Dimension detection failed — not critical
  }
  return null;
}

export async function executeFileUpload(input: Record<string, any>): Promise<ToolResult> {
  try {
    const src = input.sourcePath;
    const dst = input.destinationPath;

    const content = await fs.readFile(src);
    const dir = path.dirname(dst);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(dst, content);

    return {
      output: `已上传: ${src} → ${dst} (${(content.length / 1024).toFixed(1)}KB)`,
      isError: false,
    };
  } catch (err: any) {
    return { output: `上传失败: ${err.message}`, isError: true };
  }
}
