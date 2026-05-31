import Anthropic from '@anthropic-ai/sdk';
import createDebug from 'debug';
import { MimoConfig } from '../config/schema';
import { TokenPlanAdapter } from './token-plan';
import { PayAsYouGoAdapter } from './pay-as-you-go';
import { OllamaAdapter, OpenAICompatibleAdapter } from './providers';
import { ApiAdapter, BudgetInfo } from './types';

const debug = createDebug('mimo:api');

export type { ApiAdapter, BudgetInfo } from './types';

/**
 * Create an API adapter for the configured provider.
 *
 * Provider resolution order:
 *   1. If `config.api.provider` is set to 'ollama' or 'openai-compatible',
 *      use that provider directly.
 *   2. Otherwise (default 'anthropic'), fall back to the legacy mode-based
 *      selection (token-plan / pay-as-you-go) for full backward compatibility.
 */
export function createApiClient(config: MimoConfig): ApiAdapter {
  const provider = config.api.provider || 'anthropic';
  debug('Creating API client for provider: %s', provider);

  switch (provider) {
    case 'ollama':
      return new OllamaAdapter({
        baseUrl: config.api.ollamaEndpoint || 'http://localhost:11434',
        model: config.api.model === 'auto' ? 'llama3.1' : config.api.model,
      });

    case 'openai-compatible':
      return new OpenAICompatibleAdapter({
        baseUrl: config.api.openaiEndpoint || '',
        apiKey: config.api.openaiApiKey || '',
        model: config.api.model === 'auto' ? 'gpt-4o' : config.api.model,
      });

    case 'anthropic':
    default:
      return createAnthropicClient(config);
  }
}

/**
 * Legacy Anthropic adapter selection based on api.mode.
 * Fully backward compatible with existing configs.
 */
function createAnthropicClient(config: MimoConfig): ApiAdapter {
  switch (config.api.mode) {
    case 'token-plan':
      return new TokenPlanAdapter(config);
    case 'pay-as-you-go':
      return new PayAsYouGoAdapter(config);
    default:
      return detectAndCreate(config);
  }
}

function detectAndCreate(config: MimoConfig): ApiAdapter {
  if (config.api.tokenPlan.apiKey) {
    return new TokenPlanAdapter(config);
  }
  if (config.api.payAsYouGo.apiKey) {
    return new PayAsYouGoAdapter(config);
  }
  if (config.api.mode) {
    throw new Error(
      `No API key configured for "${config.api.mode}" mode. Run "mimo init" to set up your API key, ` +
      `or set the ANTHROPIC_API_KEY environment variable.`
    );
  }
  throw new Error(
    'No API key found. Run "mimo init" to configure your API key, ' +
    'or set the ANTHROPIC_API_KEY environment variable.'
  );
}
