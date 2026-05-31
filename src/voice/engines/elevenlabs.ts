// ── ElevenLabs TTS Engine ───────────────────────────────────────
// Uses ElevenLabs API v1 for high-quality text-to-speech synthesis.
// Supports 29+ languages, voice cloning, and custom voice models.

import * as fs from 'fs';
import * as path from 'path';
import {
  VoiceEngine, VoiceConfig, VoiceEngineType, VoiceInfo,
  TTSRequest, VoiceResult, AudioEncoding,
} from '../types';

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

const DEFAULT_MODELS = [
  'eleven_multilingual_v2',
  'eleven_monolingual_v1',
  'eleven_turbo_v2',
  'eleven_turbo_v2_5',
];

interface ElevenLabsVoiceData {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
  available_for_tiers?: string[];
  settings?: {
    stability: number;
    similarity_boost: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
}

interface ElevenLabsVoiceSettings {
  stability: number;        // 0.0 - 1.0
  similarity_boost: number; // 0.0 - 1.0
  style?: number;           // 0.0 - 1.0 (only for v2 models)
  use_speaker_boost?: boolean;
  speed?: number;           // 0.25 - 4.0
}

const FORMAT_MAP: Record<AudioEncoding, string> = {
  'mp3':  'mp3_44100_128',
  'opus': 'opus_44100_128',
  'aac':  'aac_44100_128',
  'wav':  'pcm_24000',
  'pcm':  'pcm_16000',
  'flac': 'pcm_24000',  // ElevenLabs does not support flac directly, use PCM
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

export class ElevenLabsEngine implements VoiceEngine {
  readonly name: VoiceEngineType = 'elevenlabs';
  readonly supportedFormats: AudioEncoding[] = ['mp3', 'opus', 'aac', 'wav', 'pcm'];

  private apiKey: string = '';
  private baseUrl: string = ELEVENLABS_BASE_URL;
  private voicesCache: VoiceInfo[] | null = null;
  private voiceSettings: Partial<ElevenLabsVoiceSettings> = {};

  async init(config: VoiceConfig): Promise<void> {
    this.apiKey = config.apiKey || process.env.ELEVENLABS_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('ElevenLabs requires an API key. Set ELEVENLABS_API_KEY or provide it in config.');
    }
    if (config.baseUrl) {
      this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    }

    // Apply config-based voice settings
    this.voiceSettings = {
      stability: 0.5,
      similarity_boost: 0.75,
      use_speaker_boost: true,
    };

    // Validate the API key by fetching user info
    try {
      const response = await fetch(`${this.baseUrl}/user`, {
        headers: { 'xi-api-key': this.apiKey },
      });
      if (!response.ok) {
        throw new Error(`ElevenLabs API returned ${response.status}`);
      }
    } catch (err: any) {
      throw new Error(`ElevenLabs init failed: ${err.message}`);
    }
  }

  async synthesize(request: TTSRequest, config: VoiceConfig): Promise<VoiceResult> {
    if (!this.apiKey) {
      throw new Error('ElevenLabs engine not initialized. Call init() first.');
    }

    const voiceId = request.voice || config.defaultVoice || 'JBFqnCBsd6RMkjVDRZzb'; // "George" default
    const format: AudioEncoding = request.format || config.outputFormat || 'mp3';
    const model = this.selectModel(request.language || config.defaultLanguage);

    const settings: ElevenLabsVoiceSettings = {
      stability: this.voiceSettings.stability ?? 0.5,
      similarity_boost: this.voiceSettings.similarity_boost ?? 0.75,
      use_speaker_boost: this.voiceSettings.use_speaker_boost ?? true,
      speed: request.speed ?? config.speed,
    };

    if (model.includes('_v2')) {
      settings.style = 0;
    }

    let text = request.text;
    if (request.ssml) {
      // ElevenLabs doesn't support SSML natively; strip tags for plain text
      text = text.replace(/<[^>]+>/g, '');
    }

    const outputFormat = FORMAT_MAP[format] || FORMAT_MAP['mp3'];
    const url = `${this.baseUrl}/text-to-speech/${voiceId}?output_format=${outputFormat}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: settings,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown error');
      return {
        success: false,
        mimeType: '',
        engine: this.name,
        voice: voiceId,
        error: `ElevenLabs API error ${response.status}: ${errorBody}`,
      };
    }

    const arrayBuf = await response.arrayBuffer();
    const audioData = Buffer.from(arrayBuf);

    return {
      success: true,
      audioData,
      mimeType: MIME_MAP[format] || 'audio/mpeg',
      voice: voiceId,
      engine: this.name,
    };
  }

  async *streamSynthesize(
    request: TTSRequest,
    config: VoiceConfig,
  ): AsyncGenerator<Buffer, void, undefined> {
    if (!this.apiKey) {
      throw new Error('ElevenLabs engine not initialized. Call init() first.');
    }

    const voiceId = request.voice || config.defaultVoice || 'JBFqnCBsd6RMkjVDRZzb';
    const format: AudioEncoding = request.format || config.outputFormat || 'mp3';
    const model = this.selectModel(request.language || config.defaultLanguage);

    const settings: ElevenLabsVoiceSettings = {
      stability: this.voiceSettings.stability ?? 0.5,
      similarity_boost: this.voiceSettings.similarity_boost ?? 0.75,
      use_speaker_boost: this.voiceSettings.use_speaker_boost ?? true,
      speed: request.speed ?? config.speed,
    };

    if (model.includes('_v2')) {
      settings.style = 0;
    }

    let text = request.text;
    if (request.ssml) {
      text = text.replace(/<[^>]+>/g, '');
    }

    const outputFormat = FORMAT_MAP[format] || FORMAT_MAP['mp3'];
    const url = `${this.baseUrl}/text-to-speech/${voiceId}/stream?output_format=${outputFormat}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: settings,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown error');
      throw new Error(`ElevenLabs stream error ${response.status}: ${errorBody}`);
    }

    if (!response.body) {
      throw new Error('ElevenLabs API returned no body for streaming');
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
    if (this.voicesCache) {
      return language
        ? this.voicesCache.filter(v => v.language.startsWith(language))
        : this.voicesCache;
    }

    const response = await fetch(`${this.baseUrl}/voices`, {
      headers: { 'xi-api-key': this.apiKey },
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs voice list error ${response.status}`);
    }

    const data = await response.json() as { voices: ElevenLabsVoiceData[] };

    this.voicesCache = data.voices.map(v => ({
      id: v.voice_id,
      name: v.name,
      language: v.labels?.language || 'en',
      gender: inferGender(v),
      engine: this.name,
      previewUrl: v.preview_url,
      styles: v.labels ? Object.values(v.labels) : [],
    }));

    return language
      ? this.voicesCache.filter(v => v.language.startsWith(language))
      : this.voicesCache;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.baseUrl}/user`, {
        headers: { 'xi-api-key': this.apiKey },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get usage/quota information
   */
  async getUsage(): Promise<{ charactersUsed: number; charactersLimit: number; tier: string } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/user/subscription`, {
        headers: { 'xi-api-key': this.apiKey },
      });
      if (!response.ok) return null;
      const data = await response.json() as any;
      return {
        charactersUsed: data.character_count || 0,
        charactersLimit: data.character_limit || 0,
        tier: data.tier || 'unknown',
      };
    } catch {
      return null;
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

  private selectModel(language?: string): string {
    // Use multilingual model for non-English languages
    if (language && !language.startsWith('en')) {
      return 'eleven_multilingual_v2';
    }
    return 'eleven_turbo_v2';
  }
}

function inferGender(voice: ElevenLabsVoiceData): 'male' | 'female' | 'neutral' {
  const g = (voice.labels?.gender || '').toLowerCase();
  if (g === 'male' || g === 'female') return g;
  // Infer from category
  if (voice.category === 'premade') {
    const name = voice.name.toLowerCase();
    const femaleNames = ['rachel', 'domi', 'bella', 'elli', 'nova', 'shimmer'];
    const maleNames = ['adam', 'sam', 'josh', 'arnold', 'daniel'];
    if (femaleNames.some(n => name.includes(n))) return 'female';
    if (maleNames.some(n => name.includes(n))) return 'male';
  }
  return 'neutral';
}

export function createElevenLabsEngine(): VoiceEngine {
  return new ElevenLabsEngine();
}
