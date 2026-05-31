import Anthropic from '@anthropic-ai/sdk';
import { MemoryType } from './store';
import { ApiAdapter } from '../api/types';

export interface ExtractionResult {
  shouldSave: boolean;
  memories: Array<{
    type: MemoryType;
    id: string;
    name: string;
    description: string;
    content: string;
  }>;
}

export class MemoryExtractor {
  private apiClient: ApiAdapter;

  constructor(apiClient: ApiAdapter) {
    this.apiClient = apiClient;
  }

  async extractFromConversation(
    messages: Array<{ role: string; content: string }>,
    existingMemoryIds: string[]
  ): Promise<ExtractionResult> {
    // Skip extraction for very short conversations (less than 3 messages)
    if (messages.length < 3) {
      return { shouldSave: false, memories: [] };
    }

    // 只取最近 10 条消息
    const recentMessages = messages.slice(-10);

    const conversationText = recentMessages
      .map((m) => `[${m.role}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
      .join('\n');

    const extractPrompt = `分析以下对话，提取值得长期记忆的信息。

已有记忆 ID（避免重复）：${existingMemoryIds.join(', ')}

对话内容：
${conversationText}

提取规则：
1. user 类型：用户角色、技术栈、沟通偏好
2. feedback 类型：用户纠正过的行为（"不要X"、"别Y"）、确认有效的做法（"就这样"、"对的"）
3. project 类型：项目决策、截止日期、技术选型、踩坑经验
4. reference 类型：外部系统地址、文档链接

只提取非显而易见的信息。代码模式、文件路径、git 历史不要提取。

返回 JSON（不要包含其他文字）：
{
  "shouldSave": true/false,
  "memories": [
    {
      "type": "user|feedback|project|reference",
      "id": "kebab-case-id",
      "name": "短标题",
      "description": "一行描述",
      "content": "记忆正文（markdown）"
    }
  ]
}`;

    try {
      const response = await this.apiClient.chat(
        [{ role: 'user', content: extractPrompt }],
        [],
        '你是一个记忆提取助手。分析对话内容，提取值得长期保存的信息。只返回 JSON。',
        { model: 'mimo-v2.5', maxTokens: 1024 }
      );

      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        return { shouldSave: false, memories: [] };
      }

      // 提取 JSON
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { shouldSave: false, memories: [] };
      }

      return JSON.parse(jsonMatch[0]) as ExtractionResult;
    } catch {
      return { shouldSave: false, memories: [] };
    }
  }
}
