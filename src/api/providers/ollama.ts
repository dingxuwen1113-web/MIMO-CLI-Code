import Anthropic from '@anthropic-ai/sdk';
import createDebug from 'debug';
import { ApiAdapter, BudgetInfo, UsageStats, StreamCallbacks, OllamaProviderConfig } from '../types';

const debug = createDebug('mimo:api:ollama');

/**
 * Ollama local model adapter.
 *
 * Connects to a local Ollama instance (default http://localhost:11434)
 * and maps its REST API to the internal ApiAdapter interface.
 *
 * Ollama does not natively support the Anthropic Messages schema, so
 * this adapter translates:
 *   - Anthropic messages  -> Ollama chat format
 *   - Ollama responses    -> Anthropic Message shape
 *   - Tool definitions    -> Ollama tool definitions
 */
export class OllamaAdapter implements ApiAdapter {
  private baseUrl: string;
  private model: string;
  private usage: UsageStats = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    thinkingTokens: 0,
    totalCost: 0,
  };

  constructor(config: OllamaProviderConfig) {
    this.baseUrl = (config.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
    this.model = config.model || 'llama3.1';
    debug('Ollama adapter initialized: baseUrl=%s model=%s', this.baseUrl, this.model);
  }

  resolveModel(requestedModel: string): string {
    if (requestedModel === 'auto') return this.model;
    return requestedModel;
  }

  async chat(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    systemPrompt: string,
    options: { stream?: boolean; maxTokens?: number; model?: string; thinking?: boolean } = {}
  ): Promise<Anthropic.Message> {
    const model = this.resolveModel(options.model || 'auto');

    const ollamaMessages = this.buildOllamaMessages(messages, systemPrompt);
    const ollamaTools = tools.length > 0 ? this.convertTools(tools) : undefined;

    const body: Record<string, any> = {
      model,
      messages: ollamaMessages,
      stream: false,
    };
    if (ollamaTools) {
      body.tools = ollamaTools;
    }

    const raw = await this.rawFetch('/api/chat', body);

    const message = this.convertOllamaResponseToAnthropic(raw, model);
    this.trackUsage(raw);
    return message;
  }

  async chatStream(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    systemPrompt: string,
    callbacks: StreamCallbacks,
    options: { maxTokens?: number; model?: string; thinking?: boolean } = {}
  ): Promise<Anthropic.Message> {
    const model = this.resolveModel(options.model || 'auto');

    const ollamaMessages = this.buildOllamaMessages(messages, systemPrompt);
    const ollamaTools = tools.length > 0 ? this.convertTools(tools) : undefined;

    const body: Record<string, any> = {
      model,
      messages: ollamaMessages,
      stream: true,
    };
    if (ollamaTools) {
      body.tools = ollamaTools;
    }

    const aggregated = await this.rawStreamFetch('/api/chat', body, callbacks);

    const message = this.convertOllamaResponseToAnthropic(aggregated, model);
    this.trackUsage(aggregated);
    return message;
  }

  getBudgetInfo(): BudgetInfo {
    return {
      used: 0,
      remaining: Infinity,
      percentUsed: 0,
      mode: 'ollama',
    };
  }

  getUsageStats(): UsageStats {
    return { ...this.usage };
  }

  countTokens(text: string): number {
    // Rough estimate: ~4 chars per token for English, ~1.5 for CJK
    const chineseChars = (text.match(/[一-鿿]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  countMessageTokens(messages: Anthropic.MessageParam[]): number {
    let total = 0;
    for (const msg of messages) {
      const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      total += this.countTokens(text) + 4;
    }
    return total;
  }

  // ── Private: message conversion ──────────────────────────

  private buildOllamaMessages(
    messages: Anthropic.MessageParam[],
    systemPrompt: string
  ): Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string }> {
    const result: Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string }> = [];

    // System message
    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        result.push({ role: msg.role, content: msg.content });
        continue;
      }

      // Multi-part content
      let textParts: string[] = [];
      let toolCalls: any[] = [];
      let toolResults: any[] = [];

      for (const block of msg.content) {
        if (block.type === 'text') {
          textParts.push(block.text);
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            function: {
              name: block.name,
              arguments: block.input,
            },
          });
        } else if (block.type === 'tool_result') {
          // This will be added as a separate 'tool' role message
          let resultContent = '';
          if (typeof block.content === 'string') {
            resultContent = block.content;
          } else if (Array.isArray(block.content)) {
            resultContent = block.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join('\n');
          }
          toolResults.push({
            role: 'tool',
            tool_call_id: block.tool_use_id,
            content: resultContent,
          });
        }
      }

      if (toolResults.length > 0) {
        result.push(...toolResults);
      } else if (msg.role === 'assistant' && toolCalls.length > 0) {
        result.push({
          role: 'assistant',
          content: textParts.join('\n') || '',
          tool_calls: toolCalls,
        });
      } else {
        result.push({ role: msg.role, content: textParts.join('\n') });
      }
    }

    return result;
  }

  private convertTools(tools: Anthropic.Tool[]): any[] {
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.input_schema,
      },
    }));
  }

  // ── Private: response conversion ─────────────────────────

  private convertOllamaResponseToAnthropic(raw: any, model: string): Anthropic.Message {
    const contentBlocks: Anthropic.ContentBlock[] = [];

    const assistantMsg = raw.message;
    if (assistantMsg) {
      if (assistantMsg.content) {
        contentBlocks.push({
          type: 'text',
          text: assistantMsg.content,
        } as Anthropic.TextBlock);
      }

      if (assistantMsg.tool_calls && Array.isArray(assistantMsg.tool_calls)) {
        for (const tc of assistantMsg.tool_calls) {
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id || `ollama_tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: tc.function?.name || 'unknown',
            input: typeof tc.function?.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : (tc.function?.arguments || {}),
          } as Anthropic.ToolUseBlock);
        }
      }
    }

    // If no content was produced, add an empty text block
    if (contentBlocks.length === 0) {
      contentBlocks.push({ type: 'text', text: '' } as Anthropic.TextBlock);
    }

    const stopReason = this.mapFinishReason(raw.done_reason || (raw.done ? 'stop' : 'length'));

    const usage = {
      input_tokens: raw.prompt_eval_count || 0,
      output_tokens: raw.eval_count || 0,
    };

    return {
      id: `ollama_msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: contentBlocks,
      model,
      stop_reason: stopReason,
      stop_sequence: null,
      usage,
    } as unknown as Anthropic.Message;
  }

  private mapFinishReason(reason: string): string {
    switch (reason) {
      case 'stop': return 'end_turn';
      case 'length': return 'max_tokens';
      case 'tool_calls': return 'tool_use';
      default: return 'end_turn';
    }
  }

  // ── Private: HTTP transport ──────────────────────────────

  private async rawFetch(path: string, body: Record<string, any>): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    debug('POST %s model=%s stream=false', path, body.model);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '(no body)');
      debug('Ollama error %d: %s', response.status, text.slice(0, 200));
      throw this.wrapOllamaError(response.status, text);
    }

    return response.json();
  }

  private async rawStreamFetch(
    path: string,
    body: Record<string, any>,
    callbacks: StreamCallbacks
  ): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    debug('POST %s model=%s stream=true', path, body.model);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '(no body)');
      debug('Ollama stream error %d: %s', response.status, text.slice(0, 200));
      throw this.wrapOllamaError(response.status, text);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Ollama stream returned no body');

    const decoder = new TextDecoder();
    let aggregated: any = {};

    try {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete last line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            aggregated = chunk; // last chunk contains totals

            // Emit text deltas
            if (chunk.message?.content) {
              callbacks.onText?.(chunk.message.content);
            }

            // Emit tool calls
            if (chunk.message?.tool_calls) {
              for (const tc of chunk.message.tool_calls) {
                callbacks.onToolUse?.({
                  type: 'tool_use',
                  id: tc.id || `ollama_tc_${Date.now()}`,
                  name: tc.function?.name || 'unknown',
                  input: typeof tc.function?.arguments === 'string'
                    ? JSON.parse(tc.function.arguments)
                    : (tc.function?.arguments || {}),
                } as Anthropic.ToolUseBlock);
              }
            }
          } catch {
            debug('Failed to parse Ollama stream chunk: %s', line.slice(0, 100));
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return aggregated;
  }

  // ── Private: tracking / errors ───────────────────────────

  private trackUsage(raw: any): void {
    const inputTokens = raw.prompt_eval_count || 0;
    const outputTokens = raw.eval_count || 0;
    this.usage.inputTokens += inputTokens;
    this.usage.outputTokens += outputTokens;
    // Ollama is free/local — no cost to track
  }

  private wrapOllamaError(status: number, body: string): Error {
    let err: Error;
    if (status === 404) {
      err = new Error(
        `Ollama model not found. Ensure the model is pulled: ollama pull ${this.model}`
      );
    } else if (status === 429) {
      err = new Error('429_rate_limit: Rate limit exceeded on Ollama endpoint.');
    } else if (body.includes('ECONNREFUSED') || status === 0) {
      err = new Error(
        `Cannot reach Ollama at ${this.baseUrl}. Is Ollama running? Start it with: ollama serve`
      );
    } else {
      err = new Error(`Ollama API error (${status}): ${body.slice(0, 200)}`);
    }
    (err as any).status = status;
    (err as any).statusCode = status;
    return err;
  }
}
