/**
 * MIMO CLI SDK — programmatic, headless interface to the MIMO coding agent.
 *
 * @example
 * ```typescript
 * import { MimoSDK } from 'mimo-cli-code/sdk';
 *
 * const sdk = new MimoSDK({ model: 'mimo-v2.5-pro' });
 * const result = await sdk.run('Explain this codebase');
 * console.log(result.response);
 * await sdk.dispose();
 * ```
 *
 * @module sdk
 */

export { MimoSDK } from './mimo-sdk';
export type { SDKConfig, SDKResult, SDKMessage, SDKStreamEvent } from './types';
export {
  MimoSDKError,
  MimoAuthError,
  MimoTimeoutError,
  MimoModelError,
  MimoToolError,
} from './errors';
