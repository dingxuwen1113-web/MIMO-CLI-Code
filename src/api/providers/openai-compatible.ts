import Anthropic from '@anthropic-ai/sdk';
import createDebug from 'debug';
import { ApiAdapter, BudgetInfo, UsageStats, StreamCallbacks, OpenAICompatibleProviderConfig } from '../types';

const debug = createDebug('mimo:api:openai');

/**
 * OpenAI-compatible API adapter.
 *
 * Works with any endpoint that speaks the OpenAI Chat Completions API:
 *   - vLLM
 *   - LM Studio
 *   - Together.ai
 *   - OpenRouter
 *   - Groq
 *   - Any other compliant server
 *
 * Translates:
 *   - Anthropic Messages schema  -> OpenAI Chat Completions schema
 *   - OpenAI responses           -> Anthropic Message shape
 *   - Anthropic tool definitions -> OpenAI function-calling tools
 */
export class OpenAICompatibleAdapter implements ApiAdapter {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private usage: UsageStats = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    thinkingTokens: 0,
    totalCost: 0,
  };

  constructor(config: OpenAICompatibleProviderConfig) {
    this.baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'gpt-4o';
    debug('OpenAI-compatible adapter initialized: baseUrl=%s model=%s', this.baseUrl, this.model);
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
    const maxTokens = options.maxTokens || 4096;

    const openaiMessages = this.buildOpenAIMessages(messages, systemPrompt);
    const openaiTools = tools.length > 0 ? this.convertTools(tools) : undefined;

    const body: Record<string, any> = {
      model,
      messages: openaiMessages,
      max_tokens: maxTokens,
      stream: false,
    };
    if (openaiTools) {
      body.tools = openaiTools;
    }

    const raw = await this.rawFetch('/chat/completions', body);

    const message = this.convertOpenAIResponseToAnthropic(raw, model);
    this.trackUsage(raw.usage);
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
    const maxTokens = options.maxTokens || 4096;

    const openaiMessages = this.buildOpenAIMessages(messages, systemPrompt);
    const openaiTools = tools.length > 0 ? this.convertTools(tools) : undefined;

    const body: Record<string, any> = {
      model,
      messages: openaiMessages,
      max_tokens: maxTokens,
      stream: true,
    };
    if (openaiTools) {
      body.tools = openaiTools;
    }

    const aggregated = await this.rawStreamFetch('/chat/completions', body, callbacks);

    const message = this.convertOpenAIStreamToAnthropic(aggregated, model);
    if (aggregated.usage) this.trackUsage(aggregated.usage);
    return message;
  }

  getBudgetInfo(): BudgetInfo {
    return {
      used: this.usage.totalCost,
      remaining: Infinity,
      percentUsed: 0,
      mode: 'openai-compatible',
    };
  }

  getUsageStats(): UsageStats {
    return { ...this.usage };
  }

  countTokens(text: string): number {
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

  // ── Private: message conversion (Anthropic -> OpenAI) ────

  private buildOpenAIMessages(
    messages: Anthropic.MessageParam[],
    systemPrompt: string
  ): any[] {
    const result: any[] = [];

    // System prompt
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
            type: 'function',
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          });
        } else if (block.type === 'tool_result') {
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
          content: textParts.join('\n') || null,
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

  // ── Private: response conversion (OpenAI -> Anthropic) ───

  private convertOpenAIResponseToAnthropic(raw: any, model: string): Anthropic.Message {
    const choice = raw.choices?.[0];
    const contentBlocks: Anthropic.ContentBlock[] = [];

    if (choice?.message) {
      // Text content
      if (choice.message.content) {
        contentBlocks.push({
          type: 'text',
          text: choice.message.content,
        } as Anthropic.TextBlock);
      }

      // Tool calls
      if (choice.message.tool_calls && Array.isArray(choice.message.tool_calls)) {
        for (const tc of choice.message.tool_calls) {
          let parsedInput: any;
          try {
            parsedInput = typeof tc.function?.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : (tc.function?.arguments || {});
          } catch {
            parsedInput = {};
          }
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id || `oai_tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: tc.function?.name || 'unknown',
            input: parsedInput,
          } as Anthropic.ToolUseBlock);
        }
      }
    }

    if (contentBlocks.length === 0) {
      contentBlocks.push({ type: 'text', text: '' } as Anthropic.TextBlock);
    }

    const stopReason = this.mapFinishReason(choice?.finish_reason || 'stop');

    const usage = {
      input_tokens: raw.usage?.prompt_tokens || 0,
      output_tokens: raw.usage?.completion_tokens || 0,
    };

    return {
      id: raw.id || `oai_msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: contentBlocks,
      model: raw.model || model,
      stop_reason: stopReason,
      stop_sequence: null,
      usage,
    } as unknown as Anthropic.Message;
  }

  private convertOpenAIStreamToAnthropic(aggregated: any, model: string): Anthropic.Message {
    const contentBlocks: Anthropic.ContentBlock[] = [];

    if (aggregated.textContent) {
      contentBlocks.push({
        type: 'text',
        text: aggregated.textContent,
      } as Anthropic.TextBlock);
    }

    if (aggregated.toolCalls && Array.isArray(aggregated.toolCalls)) {
      for (const tc of aggregated.toolCalls) {
        let parsedInput: any;
        try {
          parsedInput = JSON.parse(tc.function?.arguments || '{}');
        } catch {
          parsedInput = {};
        }
        contentBlocks.push({
          type: 'tool_use',
          id: tc.id || `oai_tc_${Date.now()}`,
          name: tc.function?.name || 'unknown',
          input: parsedInput,
        } as Anthropic.ToolUseBlock);
      }
    }

    if (contentBlocks.length === 0) {
      contentBlocks.push({ type: 'text', text: '' } as Anthropic.TextBlock);
    }

    return {
      id: aggregated.id || `oai_msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: contentBlocks,
      model: aggregated.model || model,
      stop_reason: this.mapFinishReason(aggregated.finishReason || 'stop'),
      stop_sequence: null,
      usage: {
        input_tokens: aggregated.usage?.prompt_tokens || 0,
        output_tokens: aggregated.usage?.completion_tokens || 0,
      },
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

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private async rawFetch(path: string, body: Record<string, any>): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    debug('POST %s model=%s stream=false', path, body.model);

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '(no body)');
      debug('OpenAI-compatible error %d: %s', response.status, text.slice(0, 200));
      const err = this.wrapApiError(response.status, text);
      // Pass Retry-After header to rate limiter
      const retryAfter = response.headers?.get('retry-after');
      if (retryAfter) {
        (err as any).headers = { 'retry-after': retryAfter };
      }
      throw err;
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
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '(no body)');
      debug('OpenAI-compatible stream error %d: %s', response.status, text.slice(0, 200));
      const err = this.wrapApiError(response.status, text);
      const retryAfter = response.headers?.get('retry-after');
      if (retryAfter) {
        (err as any).headers = { 'retry-after': retryAfter };
      }
      throw err;
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Stream returned no body');

    const decoder = new TextDecoder();
    let aggregated: any = { textContent: '', toolCalls: [], id: '', model: '', finishReason: '', usage: null };

    try {
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const chunk = JSON.parse(data);
            aggregated.id = chunk.id || aggregated.id;
            aggregated.model = chunk.model || aggregated.model;

            const delta = chunk.choices?.[0]?.delta;
            if (delta) {
              if (delta.content) {
                aggregated.textContent += delta.content;
                callbacks.onText?.(delta.content);
              }
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!aggregated.toolCalls[idx]) {
                    aggregated.toolCalls[idx] = {
                      id: tc.id || '',
                      function: { name: '', arguments: '' },
                    };
                  }
                  if (tc.id) aggregated.toolCalls[idx].id = tc.id;
                  if (tc.function?.name) aggregated.toolCalls[idx].function.name = tc.function.name;
                  if (tc.function?.arguments) aggregated.toolCalls[idx].function.arguments += tc.function.arguments;
                }
              }
            }

            if (chunk.choices?.[0]?.finish_reason) {
              aggregated.finishReason = chunk.choices[0].finish_reason;
            }

            if (chunk.usage) {
              aggregated.usage = chunk.usage;
            }
          } catch {
            debug('Failed to parse OpenAI stream chunk: %s', data.slice(0, 100));
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
          try {
            const chunk = JSON.parse(trimmed.slice(6));
            if (chunk.choices?.[0]?.delta?.content) {
              aggregated.textContent += chunk.choices[0].delta.content;
              callbacks.onText?.(chunk.choices[0].delta.content);
            }
            if (chunk.usage) aggregated.usage = chunk.usage;
          } catch { /* ignore trailing partial */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Emit completed tool_use blocks
    for (const tc of aggregated.toolCalls) {
      if (tc.function?.name) {
        callbacks.onToolUse?.({
          type: 'tool_use',
          id: tc.id || `oai_tc_${Date.now()}`,
          name: tc.function.name,
          input: (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })(),
        } as Anthropic.ToolUseBlock);
      }
    }

    return aggregated;
  }

  // ── Private: tracking / errors ───────────────────────────

  private trackUsage(openaiUsage: { prompt_tokens?: number; completion_tokens?: number } | null): void {
    if (!openaiUsage) return;
    this.usage.inputTokens += openaiUsage.prompt_tokens || 0;
    this.usage.outputTokens += openaiUsage.completion_tokens || 0;
    // Cost tracking depends on the specific provider/pricing; left at 0 for generic endpoints
  }

  private wrapApiError(status: number, body: string): Error {
    let err: Error;
    if (status === 401) {
      err = new Error('OpenAI-compatible API key is invalid or missing. Check your configuration.');
    } else if (status === 404) {
      err = new Error(
        `OpenAI-compatible model not found. Verify the model name and that the server at ${this.baseUrl} supports it.`
      );
    } else if (status === 429) {
      err = new Error('429_rate_limit: Rate limit exceeded on OpenAI-compatible endpoint.');
    } else if (body.includes('ECONNREFUSED') || status === 0) {
      err = new Error(
        `Cannot reach OpenAI-compatible API at ${this.baseUrl}. Check that the server is running and the URL is correct.`
      );
    } else {
      err = new Error(`OpenAI-compatible API error (${status}): ${body.slice(0, 200)}`);
    }
    (err as any).status = status;
    (err as any).statusCode = status;
    return err;
  }
}
