// ── Context 自动压缩系统（增强版 v2）──────────────────

import Anthropic from '@anthropic-ai/sdk';
import { ApiAdapter } from '../api/types';

interface CompressionResult {
  summary: string;
  preservedMessages: Anthropic.MessageParam[];
  compressedCount: number;
}

export class ContextCompressor {
  private apiClient: ApiAdapter;
  private maxHistoryMessages: number;
  private compressionThreshold: number;
  private maxTokens: number;
  private autoCompactTokens: number;

  constructor(apiClient: ApiAdapter, maxHistory = 50, threshold = 40) {
    this.apiClient = apiClient;
    this.maxHistoryMessages = maxHistory;
    this.compressionThreshold = threshold;
    this.maxTokens = 180000; // 留 20K 给系统 prompt + 工具
    this.autoCompactTokens = 150000; // 150K 时触发自动压缩
  }

  // 检查是否需要压缩（基于消息数 + token 估算）
  needsCompression(messages: Anthropic.MessageParam[]): boolean {
    if (messages.length >= this.compressionThreshold) return true;
    const estimatedTokens = this.estimateTokens(messages);
    if (estimatedTokens > this.autoCompactTokens) return true;
    return false;
  }

  // 获取当前 token 估算
  getCurrentTokenEstimate(messages: Anthropic.MessageParam[]): number {
    return this.estimateTokens(messages);
  }

  // 执行压缩（三级策略）
  async compress(messages: Anthropic.MessageParam[]): Promise<CompressionResult> {
    if (!this.needsCompression(messages)) {
      return { summary: '', preservedMessages: messages, compressedCount: 0 };
    }

    const currentTokens = this.estimateTokens(messages);

    // 第一级：裁剪大型工具输出（不调用 API，零成本）
    let trimmed = this.trimLargeToolOutputs(messages, 2000);
    const trimTokens = this.estimateTokens(trimmed);

    if (trimTokens <= this.autoCompactTokens * 0.8) {
      return {
        summary: `[裁剪了 ${messages.length - trimmed.length} 个大型工具输出]`,
        preservedMessages: trimmed,
        compressedCount: messages.length - trimmed.length,
      };
    }

    // 第二级：智能压缩（保留工具对，压缩纯文本对话）
    return this.smartCompress(trimmed, Math.floor(this.autoCompactTokens * 0.7));
  }

  // 第一级：裁剪大型工具输出
  private trimLargeToolOutputs(messages: Anthropic.MessageParam[], maxOutputLen: number): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];
    let trimmedCount = 0;

    for (const msg of messages) {
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        const newBlocks: any[] = [];
        let changed = false;
        for (const block of msg.content as any[]) {
          if (block.type === 'tool_result' && typeof block.content === 'string' && block.content.length > maxOutputLen) {
            // 保留开头和结尾，中间用摘要替代
            const head = block.content.slice(0, maxOutputLen / 2);
            const tail = block.content.slice(-maxOutputLen / 4);
            const omitted = block.content.length - head.length - tail.length;
            newBlocks.push({
              ...block,
              content: `${head}\n\n... [省略 ${omitted} 字符] ...\n\n${tail}`,
            });
            changed = true;
            trimmedCount++;
          } else {
            newBlocks.push(block);
          }
        }
        result.push(changed ? { ...msg, content: newBlocks } : msg);
      } else {
        result.push(msg);
      }
    }

    return result;
  }

  // 第二级：智能压缩
  async smartCompress(messages: Anthropic.MessageParam[], targetTokens: number): Promise<CompressionResult> {
    const currentTokens = this.estimateTokens(messages);
    if (currentTokens <= targetTokens) {
      return { summary: '', preservedMessages: messages, compressedCount: 0 };
    }

    // 预扫描：标记哪些消息包含 tool_use 或 tool_result，确保配对保留
    const pairedIndices = this.findPairedToolIndices(messages);

    // 提取关键信息（文件修改、决策、错误）不压缩
    const criticalIndices = this.findCriticalMessages(messages);

    // 策略：从最早的消息开始，跳过工具结果对和关键消息，只压缩纯文本对话
    const earlyPreserved: Anthropic.MessageParam[] = [];
    const finalMessages: Anthropic.MessageParam[] = [];
    let tokensSaved = 0;
    const toCompress: Anthropic.MessageParam[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const msgTokens = this.estimateTokens([msg]);

      // 最近的 15 条消息始终保留
      if (i >= messages.length - 15) {
        finalMessages.push(msg);
        continue;
      }

      // 保留工具调用对
      if (pairedIndices.has(i)) {
        earlyPreserved.push(msg);
        continue;
      }

      // 保留关键消息（文件修改、错误、决策）
      if (criticalIndices.has(i)) {
        earlyPreserved.push(msg);
        continue;
      }

      if (currentTokens - tokensSaved > targetTokens) {
        toCompress.push(msg);
        tokensSaved += msgTokens;
      } else {
        finalMessages.push(msg);
      }
    }

    if (toCompress.length === 0) {
      return { summary: '', preservedMessages: messages, compressedCount: 0 };
    }

    // 生成摘要
    const summary = await this.generateSummary(toCompress, earlyPreserved);

    // 维护时间顺序：摘要 → 早期保留 → 最终消息
    const result: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `[智能压缩 — 省略 ${toCompress.length} 条消息，节省 ~${tokensSaved} tokens]\n\n${summary}`,
      },
      { role: 'assistant', content: '已了解上下文摘要，继续对话。' },
      ...earlyPreserved,
      ...finalMessages,
    ];

    return { summary, preservedMessages: result, compressedCount: toCompress.length };
  }

  // 找出关键消息（包含文件修改、错误、决策）
  private findCriticalMessages(messages: Anthropic.MessageParam[]): Set<number> {
    const critical = new Set<number>();

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

      // 包含文件写入/编辑的工具结果
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        for (const block of msg.content as any[]) {
          if (block.type === 'tool_result') {
            const toolContent = typeof block.content === 'string' ? block.content : '';
            // 文件修改成功的消息
            if (toolContent.includes('已写入') || toolContent.includes('已编辑') ||
                toolContent.includes('written') || toolContent.includes('edited') ||
                toolContent.includes('lines changed')) {
              critical.add(i);
            }
            // 错误消息
            if (block.is_error || toolContent.includes('Error') || toolContent.includes('错误')) {
              critical.add(i);
            }
          }
        }
      }

      // 包含文件操作的 assistant 消息
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content as any[]) {
          if (block.type === 'tool_use') {
            const toolName = block.name || '';
            if (['file_write', 'file_edit', 'git_commit', 'shell_exec'].includes(toolName)) {
              critical.add(i);
            }
          }
        }
      }
    }

    return critical;
  }

  // 生成摘要（增强版）
  private async generateSummary(
    messages: Anthropic.MessageParam[],
    preservedMessages: Anthropic.MessageParam[] = [],
  ): Promise<string> {
    const conversationText = messages
      .map((m) => {
        const content = typeof m.content === 'string'
          ? m.content
          : JSON.stringify(m.content).slice(0, 3000);
        return `[${m.role}]: ${content}`;
      })
      .join('\n');

    // 从保留的消息中提取文件变更信息
    const fileChanges = this.extractFileChanges(preservedMessages);
    const fileChangeHint = fileChanges.length > 0
      ? `\n\n以下文件已被修改（请在摘要中提及）：\n${fileChanges.join('\n')}`
      : '';

    try {
      const response = await this.apiClient.chat(
        [{
          role: 'user',
          content: `将以下对话压缩为结构化摘要。必须包含以下部分：

## 用户目标
用户最初想要做什么，当前进度如何

## 已完成的操作
列出已完成的关键操作（文件修改、命令执行等）

## 文件变更
已修改/创建/删除的文件列表

## 决策与结论
做出的技术决策和原因

## 未完成任务
尚未完成的工作、待修复的错误

## 上下文线索
当前正在处理的具体文件、函数、行号等${fileChangeHint}

要求：
- 保留所有技术细节（文件路径、函数名、错误信息）
- 保留用户的具体偏好和约束
- 最多 800 字

对话内容：
${conversationText}`,
        }],
        [],
        'You are a precise conversation summarizer for a coding agent. Generate structured summaries that preserve ALL technical details: file paths, function names, line numbers, error messages, git status, and user decisions. Never omit specific technical information. Output in the exact structure requested.',
        { model: 'mimo-v2.5', maxTokens: 2048 }
      );

      const textBlock = response.content.find((b) => b.type === 'text');
      return textBlock && textBlock.type === 'text' ? textBlock.text : this.fallbackSummary(messages);
    } catch {
      return this.fallbackSummary(messages);
    }
  }

  // 增强的回退摘要（API 不可用时）
  private fallbackSummary(messages: Anthropic.MessageParam[]): string {
    const parts: string[] = [];

    // 提取用户目标
    const userMsgs = messages.filter(m => m.role === 'user');
    const firstUserMsg = userMsgs.find(m => typeof m.content === 'string');
    if (firstUserMsg && typeof firstUserMsg.content === 'string') {
      parts.push(`用户目标: ${firstUserMsg.content.slice(0, 200)}`);
    }

    // 提取文件操作
    const fileOps: string[] = [];
    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content as any[]) {
          if (block.type === 'tool_use' && block.name) {
            if (block.name === 'file_write' || block.name === 'file_edit') {
              fileOps.push(`${block.name}: ${block.input?.path || '(unknown)'}`);
            } else if (block.name === 'shell_exec') {
              fileOps.push(`shell: ${(block.input?.command || '').slice(0, 60)}`);
            }
          }
        }
      }
    }
    if (fileOps.length > 0) {
      parts.push(`文件操作:\n${fileOps.map(f => `  - ${f}`).join('\n')}`);
    }

    // 提取错误
    const errors: string[] = [];
    for (const msg of messages) {
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        for (const block of msg.content as any[]) {
          if (block.type === 'tool_result' && block.is_error && typeof block.content === 'string') {
            errors.push(block.content.slice(0, 150));
          }
        }
      }
    }
    if (errors.length > 0) {
      parts.push(`遇到的错误:\n${errors.slice(-3).map(e => `  - ${e}`).join('\n')}`);
    }

    // 最近话题
    const lastTopics = userMsgs.slice(-3).map(m => {
      const content = typeof m.content === 'string' ? m.content : '';
      return content.slice(0, 150);
    }).filter(Boolean);
    if (lastTopics.length > 0) {
      parts.push(`最近话题: ${lastTopics.join(' | ')}`);
    }

    return parts.join('\n\n') || `对话包含 ${messages.length} 条消息`;
  }

  // 从消息中提取文件变更列表
  private extractFileChanges(messages: Anthropic.MessageParam[]): string[] {
    const files = new Set<string>();
    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content as any[]) {
          if (block.type === 'tool_use' && block.input?.path) {
            const action = block.name === 'file_write' ? '写入' :
                          block.name === 'file_edit' ? '编辑' :
                          block.name === 'file_read' ? '读取' : block.name;
            files.add(`${action}: ${block.input.path}`);
          }
        }
      }
    }
    return Array.from(files);
  }

  // 找出 tool_use / tool_result 配对的索引
  private findPairedToolIndices(messages: Anthropic.MessageParam[]): Set<number> {
    const paired = new Set<number>();
    for (let i = 0; i < messages.length - 1; i++) {
      const msg = messages[i];
      const next = messages[i + 1];
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        const hasToolUse = msg.content.some((b: any) => b.type === 'tool_use');
        if (hasToolUse && next.role === 'user') {
          paired.add(i);
          paired.add(i + 1);
        }
      }
    }
    return paired;
  }

  // Token 估算（增强版）
  estimateTokens(messages: Anthropic.MessageParam[]): number {
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += this.estimateTextTokens(msg.content) + 4;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            total += this.estimateTextTokens((block as any).text || '') + 4;
          } else if (block.type === 'tool_use') {
            total += this.estimateTextTokens(JSON.stringify((block as any).input)) + 20;
          } else if (block.type === 'tool_result') {
            const content = typeof (block as any).content === 'string'
              ? (block as any).content
              : JSON.stringify((block as any).content);
            total += this.estimateTextTokens(content) + 10;
          }
        }
      }
    }
    return total;
  }

  private estimateTextTokens(text: string): number {
    const chineseChars = (text.match(/[一-鿿㐀-䶿豈-﫿]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  // 智能裁剪（保留工具配对）
  smartTrim(messages: Anthropic.MessageParam[], maxTokens: number): Anthropic.MessageParam[] {
    let estimated = this.estimateTokens(messages);
    if (estimated <= maxTokens) return messages;

    const pairedIndices = this.findPairedToolIndices(messages);
    const result = [...messages];
    let removeIdx = 0;

    while (estimated > maxTokens && removeIdx < result.length - 8) {
      // 跳过配对的工具消息
      if (pairedIndices.has(removeIdx)) {
        removeIdx++;
        continue;
      }
      const removed = result[removeIdx];
      const removedTokens = this.estimateTokens([removed]);
      result.splice(removeIdx, 1);
      estimated -= removedTokens;
    }

    if (result.length < messages.length) {
      result.unshift({
        role: 'user',
        content: `[已裁剪 ${messages.length - result.length} 条历史消息以控制上下文大小]`,
      });
      result.splice(1, 0, {
        role: 'assistant',
        content: '了解，继续。',
      });
    }

    return result;
  }
}
