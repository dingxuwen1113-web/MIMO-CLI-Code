# MIMO CLI SDK — Usage Guide

Use MIMO as a library from any Node.js (v18+) or TypeScript project.

## Installation

MIMO CLI must be available as a dependency. In a monorepo or local setup, reference the path directly:

```json
{
  "dependencies": {
    "mimo-cli-code": "file:../mimo—CLI"
  }
}
```

Or install it from npm once published:

```bash
npm install mimo-cli-code
```

## Quick Start

```typescript
import { MimoSDK } from 'mimo-cli-code/sdk';

async function main() {
  const sdk = new MimoSDK({
    apiKey: 'your-anthropic-api-key',   // or set ANTHROPIC_API_KEY env var
    model: 'mimo-v2.5-pro',
  });

  const result = await sdk.run('Create a simple Express hello-world server in server.js');

  console.log('Response:', result.response);
  console.log('Files modified:', result.files);
  console.log('Tokens used:', result.tokens);
  console.log('Turns:', result.turns, 'Duration:', result.duration, 'ms');

  await sdk.dispose();
}

main().catch(console.error);
```

## Configuration

`SDKConfig` is fully optional. Defaults are loaded from `~/.mimo/config.toml` and environment variables.

```typescript
const sdk = new MimoSDK({
  apiKey:   'sk-...',            // ANTHROPIC_API_KEY env var is used if omitted
  baseUrl:  'https://...',       // ANTHROPIC_BASE_URL env var is used if omitted
  model:    'mimo-v2.5-pro',     // 'mimo-v2.5-pro' | 'mimo-v2.5' | 'auto'
  mode:     'yolo',              // 'plan' | 'agent' | 'yolo' (tool auto-approval)
  maxTurns: 30,                  // max LLM turns per run/chat call (default: 50)
  thinking: true,                // enable extended thinking (default: false)
  cwd:      '/path/to/project',  // working directory (default: process.cwd())
  timeout:  120_000,             // ms, 0 = no timeout (default: 0)
});
```

**Priority order** (highest wins):
1. `SDKConfig` constructor argument
2. Environment variables: `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `MIMO_MODEL`, `MIMO_MODE`
3. `~/.mimo/config.toml` and settings.json files
4. Built-in defaults

## One-Shot Execution

`run()` executes a prompt, runs the full agent loop (LLM + tool calls), and returns a single result.

```typescript
const result = await sdk.run('Refactor utils.ts to use async/await');

console.log(result.response);   // assistant text
console.log(result.exitCode);   // 0 = success
console.log(result.tokens);     // { input: 1234, output: 567 }
console.log(result.files);      // ['/abs/path/utils.ts']
console.log(result.turns);      // 3
console.log(result.duration);   // 8432 (ms)
```

## Streaming Execution

`stream()` yields events in real time as the agent works.

```typescript
for await (const event of sdk.stream('Write unit tests for calculator.ts')) {
  switch (event.type) {
    case 'text':
      process.stdout.write(event.data);  // a chunk of assistant text
      break;
    case 'tool_call':
      console.log(`\n[tool] ${event.data.name}`, event.data.input);
      break;
    case 'tool_result':
      const status = event.data.isError ? 'FAILED' : 'OK';
      console.log(`\n[tool result] ${event.data.name}: ${status}`);
      break;
    case 'error':
      console.error('[error]', event.data.message);
      break;
    case 'done':
      console.log('\n[done]', event.data);  // full SDKResult
      break;
  }
}
```

## Multi-Turn Conversation

Use `chat()` for interactive multi-turn sessions. History is accumulated internally.

```typescript
const sdk = new MimoSDK({ apiKey: process.env.ANTHROPIC_API_KEY });

const reply1 = await sdk.chat('I have a Node.js project at /home/user/myapp');
console.log(reply1.content);

const reply2 = await sdk.chat('Add a /health endpoint to the Express server');
console.log(reply2.content);

const reply3 = await sdk.chat('Now add request logging middleware');
console.log(reply3.content);

// Inspect full history
const history = sdk.getHistory();
console.log(`Conversation has ${history.length} messages`);

// Clear to free memory
sdk.clearHistory();

await sdk.dispose();
```

## Error Handling

All SDK errors extend `MimoSDKError`. Catch specific error types for precise handling:

```typescript
import { MimoSDK, MimoAuthError, MimoTimeoutError, MimoModelError, MimoToolError } from 'mimo-cli-code/sdk';

try {
  const result = await sdk.run('Do something');
} catch (err) {
  if (err instanceof MimoAuthError) {
    // API key missing or invalid — prompt user to configure
    console.error('Auth failed:', err.message);
  } else if (err instanceof MimoTimeoutError) {
    // Execution exceeded timeout
    console.error(`Timed out after ${err.timeoutMs}ms`);
  } else if (err instanceof MimoModelError) {
    // API returned an error (rate limit, overload, etc.)
    console.error(`API error [${err.statusCode}]:`, err.message);
  } else if (err instanceof MimoToolError) {
    // A tool call failed
    console.error(`Tool ${err.toolName} failed:`, err.message);
  }
}
```

**Error codes** (on `err.code`):
| Class              | Code               | Cause                                   |
|--------------------|--------------------|-----------------------------------------|
| `MimoAuthError`    | `MIMO_AUTH_ERROR`  | No API key, or key is invalid/expired   |
| `MimoTimeoutError` | `MIMO_TIMEOUT_ERROR` | Execution exceeded `config.timeout`   |
| `MimoModelError`   | `MIMO_MODEL_ERROR` | Anthropic API error (429, 529, 500...)  |
| `MimoToolError`    | `MIMO_TOOL_ERROR`  | Tool execution failed                   |

## Runtime Configuration Changes

Change model or mode between calls without creating a new SDK instance:

```typescript
sdk.setModel('mimo-v2.5');       // switch to lighter model
sdk.setMode('agent');            // switch from yolo to agent mode
const result = await sdk.run('...');
```

## Cleanup

Always call `dispose()` to release resources:

```typescript
await sdk.dispose();
// SDK instance is now unusable — all methods will throw MimoSDKError
```

## Callback-Style Usage

Wrap in a standard callback pattern if needed:

```typescript
function runMimo(prompt: string, callback: (err: Error | null, result?: SDKResult) => void) {
  const sdk = new MimoSDK();
  sdk.run(prompt)
    .then((result) => { sdk.dispose(); callback(null, result); })
    .catch((err) => { sdk.dispose().catch(() => {}); callback(err); });
}
```

## TypeScript Types

All types are exported from the SDK entry point:

```typescript
import type { SDKConfig, SDKResult, SDKMessage, SDKStreamEvent } from 'mimo-cli-code/sdk';
import { MimoSDK, MimoSDKError, MimoAuthError, MimoTimeoutError, MimoModelError, MimoToolError } from 'mimo-cli-code/sdk';
```
