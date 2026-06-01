// ── Direct HTTP client (bypasses Anthropic SDK) ──────────────
// The MIMO proxy's MiFE gateway rate-limits SDK User-Agent headers.
// This client sends bare minimum headers matching raw fetch (which succeeds).
// Supports both sync and SSE streaming responses.

import createDebug from 'debug';

const debug = createDebug('mimo:http');

interface RawMessage {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text?: string; thinking?: string; id?: string; name?: string; input?: any }>;
  model: string;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
}

interface StreamCallbacks {
  onText?: (text: string) => void;
  onThinking?: (delta: string) => void;
  onToolUse?: (tool: any) => void;
}

function getHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
}

export async function rawChat(
  baseUrl: string,
  apiKey: string,
  body: Record<string, any>,
): Promise<RawMessage> {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/messages`;
  debug('POST %s model=%s', url, body.model);

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(600_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const err: any = new Error(`${response.status} ${text.slice(0, 200)}`);
    err.status = response.status;
    // Extract retry-after
    const retryAfter = response.headers?.get('retry-after');
    if (retryAfter) err.headers = { 'retry-after': retryAfter };
    throw err;
  }

  return response.json() as Promise<RawMessage>;
}

export async function rawStream(
  baseUrl: string,
  apiKey: string,
  body: Record<string, any>,
  callbacks: StreamCallbacks,
): Promise<RawMessage> {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/messages`;
  debug('POST %s model=%s stream=true', url, body.model);

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(apiKey),
    body: JSON.stringify({ ...body, stream: true }),
    signal: AbortSignal.timeout(600_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const err: any = new Error(`${response.status} ${text.slice(0, 200)}`);
    err.status = response.status;
    const retryAfter = response.headers?.get('retry-after');
    if (retryAfter) err.headers = { 'retry-after': retryAfter };
    throw err;
  }

  // Parse SSE stream
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Stream returned no body');

  const decoder = new TextDecoder();
  let buffer = '';

  // Accumulate final message
  const result: RawMessage = {
    id: '', type: 'message', role: 'assistant', content: [], model: body.model,
    stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 },
  };

  // Track current content block
  let currentBlock: any = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);
          handleStreamEvent(event, result, callbacks, (block) => { currentBlock = block; });
        } catch {
          debug('Failed to parse SSE chunk: %s', data.slice(0, 100));
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Finalize: if content is empty, add empty text
  if (result.content.length === 0) {
    result.content.push({ type: 'text', text: '' });
  }

  return result;
}

function handleStreamEvent(
  event: any,
  result: RawMessage,
  callbacks: StreamCallbacks,
  setCurrentBlock: (block: any) => void,
): void {
  const type = event.type;

  if (type === 'message_start') {
    const msg = event.message;
    result.id = msg?.id || result.id;
    result.model = msg?.model || result.model;
    if (msg?.usage) {
      result.usage.input_tokens = msg.usage.input_tokens || 0;
    }
  }

  else if (type === 'content_block_start') {
    const block = event.content_block;
    if (block?.type === 'text') {
      setCurrentBlock({ type: 'text', text: '' });
    } else if (block?.type === 'thinking') {
      setCurrentBlock({ type: 'thinking', thinking: '' });
    } else if (block?.type === 'tool_use') {
      setCurrentBlock({ type: 'tool_use', id: block.id, name: block.name, input: '' });
    }
  }

  else if (type === 'content_block_delta') {
    const delta = event.delta;
    if (delta?.type === 'text_delta' && delta.text) {
      callbacks.onText?.(delta.text);
      // Find or create text block in result
      const textBlock = result.content.find(b => b.type === 'text');
      if (textBlock) textBlock.text += delta.text;
      else result.content.push({ type: 'text', text: delta.text });
    }
    else if (delta?.type === 'thinking_delta' && delta.thinking) {
      callbacks.onThinking?.(delta.thinking);
    }
    else if (delta?.type === 'input_json_delta' && delta.partial_json) {
      // Accumulate tool input JSON
      const toolBlock = result.content.find(b => b.type === 'tool_use');
      if (toolBlock) toolBlock.input = (toolBlock.input || '') + delta.partial_json;
    }
  }

  else if (type === 'content_block_stop') {
    // Finalize tool_use block
    const toolBlock = result.content.find(b => b.type === 'tool_use' && typeof b.input === 'string');
    if (toolBlock) {
      try { toolBlock.input = JSON.parse(toolBlock.input); } catch { toolBlock.input = {}; }
      callbacks.onToolUse?.({ id: toolBlock.id!, name: toolBlock.name!, input: toolBlock.input });
    }
    setCurrentBlock(null);
  }

  else if (type === 'message_delta') {
    if (event.delta?.stop_reason) result.stop_reason = event.delta.stop_reason;
    if (event.usage) {
      result.usage.output_tokens = event.usage.output_tokens || 0;
      result.usage.cache_creation_input_tokens = event.usage.cache_creation_input_tokens;
      result.usage.cache_read_input_tokens = event.usage.cache_read_input_tokens;
    }
  }
}
