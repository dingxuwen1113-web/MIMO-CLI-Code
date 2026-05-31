// ── Speech-to-Text (STT) via OpenAI Whisper API ─────────────────
// Uses /v1/audio/transcriptions endpoint.
// Supports multiple audio formats: mp3, mp4, mpeg, mpga, m4a, wav, webm

import * as fs from 'fs';
import * as path from 'path';
import {
  STTRequest, VoiceResult, VoiceEngineType,
} from './types';

const WHISPER_API_PATH = '/v1/audio/transcriptions';

export interface STTConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  language?: string;
}

/**
 * Transcribe audio using OpenAI Whisper API
 */
export async function transcribeAudio(
  request: STTRequest,
  config: STTConfig,
): Promise<VoiceResult> {
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    return {
      success: false,
      mimeType: 'text/plain',
      engine: 'openai-tts' as VoiceEngineType,
      error: 'STT requires an OpenAI API key. Set OPENAI_API_KEY or provide it in config.',
    };
  }

  const baseUrl = (config.baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
  const url = `${baseUrl}${WHISPER_API_PATH}`;

  // Build form data
  const formData = new FormData();

  // Attach audio
  if (request.audioBuffer) {
    const ab = toArrayBuffer(request.audioBuffer);
    const blob = new Blob([ab], { type: detectAudioMimeType(request.audioPath) });
    formData.append('file', blob, request.audioPath || 'audio.mp3');
  } else if (request.audioPath) {
    try {
      const audioData = await fs.promises.readFile(request.audioPath);
      const mimeType = detectAudioMimeType(request.audioPath);
      const ab = toArrayBuffer(audioData);
      const blob = new Blob([ab], { type: mimeType });
      formData.append('file', blob, path.basename(request.audioPath));
    } catch (err: any) {
      return {
        success: false,
        mimeType: 'text/plain',
        engine: 'openai-tts' as VoiceEngineType,
        error: `Failed to read audio file: ${err.message}`,
      };
    }
  } else {
    return {
      success: false,
      mimeType: 'text/plain',
      engine: 'openai-tts' as VoiceEngineType,
      error: 'STT requires either audioPath or audioBuffer.',
    };
  }

  // Model
  formData.append('model', request.model || config.model || 'whisper-1');

  // Language (optional)
  if (request.language || config.language) {
    formData.append('language', request.language || config.language!);
  }

  // Prompt (optional, for context)
  if (request.prompt) {
    formData.append('prompt', request.prompt);
  }

  // Temperature
  if (request.temperature !== undefined) {
    formData.append('temperature', request.temperature.toString());
  }

  // Response format
  formData.append('response_format', request.responseFormat || 'verbose_json');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'unknown error');
    return {
      success: false,
      mimeType: 'text/plain',
      engine: 'openai-tts' as VoiceEngineType,
      error: `Whisper API error ${response.status}: ${errorBody}`,
    };
  }

  const result = await response.json() as any;

  return {
    success: true,
    mimeType: 'text/plain',
    engine: 'openai-tts' as VoiceEngineType,
    transcript: result.text || '',
    duration: result.duration,
  };
}

/**
 * Transcribe a local audio file
 */
export async function transcribeFile(
  filePath: string,
  options: Partial<STTRequest> & { apiKey?: string; baseUrl?: string } = {},
): Promise<VoiceResult> {
  return transcribeAudio(
    { audioPath: filePath, ...options },
    { apiKey: options.apiKey || '', baseUrl: options.baseUrl },
  );
}

/**
 * Convert a Node.js Buffer to an ArrayBuffer (TS strict-safe)
 */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  const copy = new ArrayBuffer(buf.byteLength);
  const view = new Uint8Array(copy);
  view.set(buf);
  return copy;
}

/**
 * Detect MIME type from file extension
 */
function detectAudioMimeType(filePath?: string): string {
  if (!filePath) return 'audio/mpeg';
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.mp4': 'audio/mp4',
    '.mpeg': 'audio/mpeg',
    '.mpga': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.webm': 'audio/webm',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.opus': 'audio/ogg',
  };
  return mimeMap[ext] || 'audio/mpeg';
}

/**
 * List supported audio formats for STT
 */
export function getSupportedSTTFormats(): string[] {
  return ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'flac'];
}
