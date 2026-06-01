/**
 * API Authentication - 官方MIMO API连接
 *
 * 使用官方环境变量配置方式：
 * ANTHROPIC_BASE_URL - API端点
 * ANTHROPIC_AUTH_TOKEN - API Key
 * ANTHROPIC_MODEL - 模型名称
 */

import Anthropic from '@anthropic-ai/sdk';
import * as readline from 'readline';
import createDebug from 'debug';
import { MimoConfig } from '../config/schema';
import { ApiAdapter, BudgetInfo, UsageStats, StreamCallbacks } from './types';

const debug = createDebug('mimo:api');

export type { ApiAdapter, BudgetInfo } from './types';

/**
 * 交互式配置API
 */
async function promptForConfig(): Promise<{ baseUrl: string; apiKey: string; model: string }> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });
  };

  console.log('\n==================================');
  console.log('  MIMO API 配置');
  console.log('==================================\n');

  // 获取Base URL
  const defaultBaseUrl = 'https://token-plan-sgp.xiaomimimo.com/anthropic';
  const baseUrlInput = await question(`API端点 (默认: ${defaultBaseUrl}): `);
  const baseUrl = baseUrlInput || defaultBaseUrl;

  // 获取API Key
  const apiKey = await question('API Key: ');
  if (!apiKey) {
    rl.close();
    throw new Error('API Key不能为空');
  }

  // 获取模型
  const defaultModel = 'mimo-v2.5-pro';
  const modelInput = await question(`模型 (默认: ${defaultModel}): `);
  const model = modelInput || defaultModel;

  rl.close();

  // 设置环境变量
  process.env.ANTHROPIC_BASE_URL = baseUrl;
  process.env.ANTHROPIC_AUTH_TOKEN = apiKey;
  process.env.ANTHROPIC_MODEL = model;
  process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = model;
  process.env.ANTHROPIC_DEFAULT_OPUS_MODEL = model;
  process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model;

  console.log('\n✓ 配置已保存到环境变量\n');

  return { baseUrl, apiKey, model };
}

/**
 * 创建API客户端
 * 使用官方Anthropic SDK + 环境变量配置
 */
export async function createApiClient(config: MimoConfig): Promise<ApiAdapter> {
  debug('Creating API client with official Anthropic SDK');

  // 检查环境变量是否已设置
  let baseURL = process.env.ANTHROPIC_BASE_URL;
  let apiKey = process.env.ANTHROPIC_AUTH_TOKEN;
  let model = process.env.ANTHROPIC_MODEL || process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || 'mimo-v2.5-pro';

  // 如果未设置，提示用户配置
  if (!baseURL || !apiKey) {
    console.log('\n⚠ 未检测到API配置，需要进行初始配置...\n');
    const configResult = await promptForConfig();
    baseURL = configResult.baseUrl;
    apiKey = configResult.apiKey;
    model = configResult.model;
  }

  debug('Base URL: %s', baseURL);
  debug('Model: %s', model);
  debug('API Key: %s...', apiKey.substring(0, 20));

  return new AnthropicAdapter({
    baseURL,
    apiKey,
    model,
  });
}

interface AnthropicAdapterConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

class AnthropicAdapter implements ApiAdapter {
  private client: Anthropic;
  private config: AnthropicAdapterConfig;
  private usage: UsageStats = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    thinkingTokens: 0,
    totalCost: 0,
  };
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private minIntervalMs: number = 1000;  // 最小请求间隔1秒

  constructor(config: AnthropicAdapterConfig) {
    this.config = config;

    // 使用官方Anthropic SDK，增加重试次数和超时
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      maxRetries: 5,  // 增加到5次重试
      timeout: 900_000,  // 15分钟超时
    });

    debug('Anthropic SDK initialized with enhanced retry');
  }

  resolveModel(requestedModel: string): string {
    if (requestedModel === 'auto') {
      return this.config.model;
    }
    return requestedModel;
  }

  /**
   * 等待请求间隔
   */
  private async waitForInterval(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - timeSinceLastRequest;
      debug('Waiting %dms for rate limit', waitTime);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  async chat(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    systemPrompt: string,
    options: { stream?: boolean; maxTokens?: number; model?: string; thinking?: boolean } = {}
  ): Promise<Anthropic.Message> {
    // 等待请求间隔
    await this.waitForInterval();

    const model = this.resolveModel(options.model || this.config.model);
    const maxTokens = options.maxTokens || 200000;  // 最大200K tokens

    debug('chat: model=%s, maxTokens=%d, requestCount=%d', model, maxTokens, this.requestCount);

    const params: Anthropic.MessageCreateParams = {
      model,
      max_tokens: maxTokens,
      messages,
      system: systemPrompt,
    };

    if (tools && tools.length > 0) {
      params.tools = tools;
    }

    if (options.thinking) {
      (params as any).thinking = {
        type: 'enabled',
        budget_tokens: Math.min(maxTokens * 2, 200000),  // 最大200K thinking tokens
      };
      params.max_tokens = Math.max(maxTokens, 200000);  // 最大200K tokens
    }

    try {
      const response = await this.client.messages.create(params);

      // 更新使用统计
      if (response.usage) {
        this.usage.inputTokens += response.usage.input_tokens || 0;
        this.usage.outputTokens += response.usage.output_tokens || 0;
        if ('cache_creation_input_tokens' in response.usage) {
          this.usage.cacheCreationTokens += (response.usage as any).cache_creation_input_tokens || 0;
        }
        if ('cache_read_input_tokens' in response.usage) {
          this.usage.cacheReadTokens += (response.usage as any).cache_read_input_tokens || 0;
        }
      }

      // 成功后减少间隔
      this.minIntervalMs = Math.max(500, this.minIntervalMs - 100);

      return response;
    } catch (error: any) {
      debug('chat error: %s', error.message);

      // 429错误特殊处理
      if (error.status === 429 || error.message?.includes('429')) {
        // 增加请求间隔
        this.minIntervalMs = Math.min(10000, this.minIntervalMs + 2000);
        debug('Rate limited, increasing interval to %dms', this.minIntervalMs);

        // 等待更长时间
        const waitTime = Math.min(60000, this.minIntervalMs * 2);
        console.log(`\n⏳ 请求过于频繁，等待 ${Math.round(waitTime / 1000)}秒后重试...\n`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      throw error;
    }
  }

  async chatStream(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    systemPrompt: string,
    callbacks: StreamCallbacks,
    options: { model?: string; thinking?: boolean } = {}
  ): Promise<Anthropic.Message> {
    // 等待请求间隔
    await this.waitForInterval();

    const model = this.resolveModel(options.model || this.config.model);

    debug('chatStream: model=%s, requestCount=%d', model, this.requestCount);

    const params: Anthropic.MessageCreateParams = {
      model,
      max_tokens: 4096,
      messages,
      system: systemPrompt,
    };

    if (tools && tools.length > 0) {
      params.tools = tools;
    }

    if (options.thinking) {
      (params as any).thinking = {
        type: 'enabled',
        budget_tokens: 128000,
      };
      params.max_tokens = 64000;
    }

    try {
      const stream = this.client.messages.stream(params);

      let fullText = '';
      let fullThinking = '';

      stream.on('text', (text) => {
        fullText += text;
        callbacks.onText?.(text);
      });

      if (callbacks.onThinking) {
        stream.on('thinking', (thinking) => {
          fullThinking += thinking;
          callbacks.onThinking?.(thinking);
        });
      }

      const response = await stream.finalMessage();

      // 更新使用统计
      if (response.usage) {
        this.usage.inputTokens += response.usage.input_tokens || 0;
        this.usage.outputTokens += response.usage.output_tokens || 0;
      }

      // 成功后减少间隔
      this.minIntervalMs = Math.max(500, this.minIntervalMs - 100);

      return response;
    } catch (error: any) {
      debug('chatStream error: %s', error.message);

      // 429错误特殊处理
      if (error.status === 429 || error.message?.includes('429')) {
        // 增加请求间隔
        this.minIntervalMs = Math.min(10000, this.minIntervalMs + 2000);
        debug('Rate limited, increasing interval to %dms', this.minIntervalMs);

        // 等待更长时间
        const waitTime = Math.min(60000, this.minIntervalMs * 2);
        console.log(`\n⏳ 请求过于频繁，等待 ${Math.round(waitTime / 1000)}秒后重试...\n`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      throw error;
    }
  }

  getUsageStats(): UsageStats {
    return { ...this.usage };
  }

  getBudgetInfo(): BudgetInfo {
    return {
      used: this.usage.inputTokens + this.usage.outputTokens,
      remaining: 999999999999 - (this.usage.inputTokens + this.usage.outputTokens),
      percentUsed: 0,
      mode: 'mimo',
    };
  }

  countTokens(text: string): number {
    // 粗略估算：1 token ≈ 4 字符
    return Math.ceil(text.length / 4);
  }

  countMessageTokens(messages: Anthropic.MessageParam[]): number {
    let totalChars = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        totalChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            totalChars += block.text.length;
          }
        }
      }
    }
    return Math.ceil(totalChars / 4);
  }
}
