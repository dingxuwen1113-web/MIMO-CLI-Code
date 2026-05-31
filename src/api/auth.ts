import Anthropic from '@anthropic-ai/sdk';
import { MimoConfig } from '../config/schema';
import { TokenPlanAdapter } from './token-plan';
import { PayAsYouGoAdapter } from './pay-as-you-go';
import { ApiAdapter, BudgetInfo } from './types';

export type { ApiAdapter, BudgetInfo } from './types';

export function createApiClient(config: MimoConfig): ApiAdapter {
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
