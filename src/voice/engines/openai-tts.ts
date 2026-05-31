// ── OpenAI TTS Engine ───────────────────────────────────────────
// Uses OpenAI's /v1/audio/speech API.
// Models: tts-1 (fast), tts-1-hd (high quality)
// Voices: alloy, echo, fable, onyx, nova, shimmer

import * as fs from 'fs';
import * as path from 'path';
import {
  VoiceEngine, VoiceConfig, VoiceEngineType, VoiceInfo,
  TTSRequest, VoiceResult, AudioEncoding, AudioQuality,
} from '../types';

const OPENAI_TTS_API = '/v1/audio/speech';

export type OpenAITTSModel = 'tts-1' | 'tts-1-hd';
export type OpenAITTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type OpenAITTSResponseFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';

const VOICE_DESCRIPTIONS: Record<OpenAITTSVoice, { gender: 'male' | 'female' | 'neutral'; description: string }> = {
  'alloy':  { gender: 'neutral', description: 'Balanced, versatile voice' },
  'echo':   { gender: 'male',    description: 'Warm, resonant voice' },
  'fable':  { gender: 'neutral', description: 'Expressive, animated voice' },
  'onyx':   { gender: 'male',    description: 'Deep, authoritative voice' },
  'nova':   { gender: 'female',  description: 'Friendly, upbeat voice' },
  'shimmer':{ gender: 'female',  description: 'Soft, soothing voice' },
};

const FORMAT_MAP: Record<AudioEncoding, OpenAITTSResponseFormat> = {
  'mp3': 'mp3',
  'opus': 'opus',
  'aac': 'aac',
  'flac': 'flac',
  'wav': 'wav',
  'pcm': 'pcm',
};

const MIME_MAP: Record<AudioEncoding, string> = {
  'mp3': 'audio/mpeg',
  'opus': 'audio/ogg',
  'aac': 'audio/aac',
  'wav': 'audio/wav',
  'pcm': 'audio/pcm',
  'flac': 'audio/flac',
};

// ── Engine Implementation ───────────────────────────────────────

export class OpenAITTSEngine implements VoiceEngine {
  readonly name: VoiceEngineType = 'openai-tts';
  readonly supportedFormats: AudioEncoding[] = ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'];

  private baseUrl: string = 'https://api.openai.com';
  private apiKey: string = '';

  async init(config: VoiceConfig): Promise<void> {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('OpenAI TTS requires an API key. Set OPENAI_API_KEY or provide it in config.');
    }
    if (config.baseUrl) {
      this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    }
  }

  async synthesize(request: TTSRequest, config: VoiceConfig): Promise<VoiceResult> {
    if (!this.apiKey) {
      throw new Error('OpenAI TTS engine not initialized. Call init() first.');
    }

    const voice: OpenAITTSVoice = (request.voice as OpenAITTSVoice) || (config.defaultVoice as OpenAITTSVoice) || 'alloy';
    const format: AudioEncoding = request.format || config.outputFormat || 'mp3';
    const speed = Math.min(4.0, Math.max(0.25, request.speed ?? config.speed ?? 1.0));

    // Choose model based on quality
    const model: OpenAITTSModel = config.quality === 'high' || config.quality === 'ultra'
      ? 'tts-1-hd'
      : 'tts-1';

    const requestBody = {
      model,
      input: request.text,
      voice,
      response_format: FORMAT_MAP[format] || 'mp3',
      speed,
    };

    const url = `${this.baseUrl}${OPENAI_TTS_API}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown error');
      return {
        success: false,
        mimeType: '',
        engine: this.name,
        voice,
        error: `OpenAI TTS API error ${response.status}: ${errorBody}`,
      };
    }

    const arrayBuf = await response.arrayBuffer();
    const audioData = Buffer.from(arrayBuf);

    return {
      success: true,
      audioData,
      mimeType: MIME_MAP[format] || 'audio/mpeg',
      voice,
      engine: this.name,
    };
  }

  async *streamSynthesize(
    request: TTSRequest,
    config: VoiceConfig,
  ): AsyncGenerator<Buffer, void, undefined> {
    if (!this.apiKey) {
      throw new Error('OpenAI TTS engine not initialized. Call init() first.');
    }

    const voice: OpenAITTSVoice = (request.voice as OpenAITTSVoice) || (config.defaultVoice as OpenAITTSVoice) || 'alloy';
    const format: AudioEncoding = request.format || config.outputFormat || 'mp3';
    const speed = Math.min(4.0, Math.max(0.25, request.speed ?? config.speed ?? 1.0));

    const model: OpenAITTSModel = config.quality === 'high' || config.quality === 'ultra'
      ? 'tts-1-hd'
      : 'tts-1';

    const requestBody = {
      model,
      input: request.text,
      voice,
      response_format: FORMAT_MAP[format] || 'mp3',
      speed,
    };

    const url = `${this.baseUrl}${OPENAI_TTS_API}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown error');
      throw new Error(`OpenAI TTS API error ${response.status}: ${errorBody}`);
    }

    if (!response.body) {
      throw new Error('OpenAI TTS API returned no body');
    }

    const reader = (response.body as any).getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield Buffer.from(value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  async listVoices(language?: string): Promise<VoiceInfo[]> {
    // OpenAI has a fixed set of voices
    const voices: VoiceInfo[] = (Object.keys(VOICE_DESCRIPTIONS) as OpenAITTSVoice[]).map(v => ({
      id: v,
      name: `${v.charAt(0).toUpperCase()}${v.slice(1)}`,
      language: language || 'en-US',
      gender: VOICE_DESCRIPTIONS[v].gender,
      engine: this.name,
    }));
    return voices;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Save synthesized audio to a file
   */
  async synthesizeToFile(
    request: TTSRequest,
    config: VoiceConfig,
    outputPath: string,
  ): Promise<VoiceResult> {
    const result = await this.synthesize(request, config);
    if (result.success && result.audioData) {
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.promises.writeFile(outputPath, result.audioData);
      result.audioPath = outputPath;
    }
    return result;
  }
}

export function createOpenAITTSEngine(): VoiceEngine {
  return new OpenAITTSEngine();
}
