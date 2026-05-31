import createDebug from 'debug';
import * as https from 'https';

const debug = createDebug('mimo:tts');

// ─── TTS Types ─────────────────────────────────────────────────────

export interface TTSProvider {
  id: string;
  name: string;
  supportsStreaming: boolean;
  voices: TTSVoice[];
  synthesize(text: string, options: TTSOptions): Promise<Buffer>;
}

export interface TTSVoice {
  id: string;
  name: string;
  language: string;
  gender?: 'male' | 'female' | 'neutral';
  preview?: string;
}

export interface TTSOptions {
  voice?: string;
  speed?: number;       // 0.5 - 2.0
  pitch?: number;       // -20 to 20 (semitones)
  format?: 'mp3' | 'wav' | 'ogg' | 'pcm';
  sampleRate?: number;  // 8000 - 48000
}

export interface TTSResult {
  audio: Buffer;
  format: string;
  durationMs: number;
  provider: string;
}

// ─── ElevenLabs Provider ───────────────────────────────────────────

export class ElevenLabsTTS implements TTSProvider {
  id = 'elevenlabs';
  name = 'ElevenLabs';
  supportsStreaming = true;
  voices: TTSVoice[] = [
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', language: 'en', gender: 'female' },
    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', language: 'en', gender: 'male' },
    { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', language: 'en', gender: 'female' },
    { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', language: 'en', gender: 'male' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', language: 'en', gender: 'male' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', language: 'en', gender: 'male' },
    { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', language: 'en', gender: 'male' },
  ];

  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async synthesize(text: string, options: TTSOptions = {}): Promise<Buffer> {
    const voiceId = options.voice || '21m00Tcm4TlvDq8ikWAM';
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const body = JSON.stringify({
      text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        speed: options.speed || 1.0,
      },
    });

    return new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(Buffer.concat(chunks));
          } else {
            reject(new Error(`ElevenLabs error ${res.statusCode}: ${Buffer.concat(chunks).toString()}`));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

// ─── OpenAI TTS Provider ───────────────────────────────────────────

export class OpenAITTS implements TTSProvider {
  id = 'openai-tts';
  name = 'OpenAI TTS';
  supportsStreaming = false;
  voices: TTSVoice[] = [
    { id: 'alloy', name: 'Alloy', language: 'en', gender: 'neutral' },
    { id: 'echo', name: 'Echo', language: 'en', gender: 'male' },
    { id: 'fable', name: 'Fable', language: 'en', gender: 'male' },
    { id: 'onyx', name: 'Onyx', language: 'en', gender: 'male' },
    { id: 'nova', name: 'Nova', language: 'en', gender: 'female' },
    { id: 'shimmer', name: 'Shimmer', language: 'en', gender: 'female' },
  ];

  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.openai.com') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async synthesize(text: string, options: TTSOptions = {}): Promise<Buffer> {
    const url = `${this.baseUrl}/v1/audio/speech`;
    const body = JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: options.voice || 'alloy',
      response_format: options.format || 'mp3',
      speed: options.speed || 1.0,
    });

    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const req = https.request({
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(Buffer.concat(chunks));
          } else {
            reject(new Error(`OpenAI TTS error ${res.statusCode}: ${Buffer.concat(chunks).toString()}`));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

// ─── System TTS Provider (fallback) ────────────────────────────────

export class SystemTTS implements TTSProvider {
  id = 'system';
  name = 'System TTS';
  supportsStreaming = false;
  voices: TTSVoice[] = [];

  async synthesize(text: string, options: TTSOptions = {}): Promise<Buffer> {
    const { execSync } = require('child_process');
    const os = require('os');
    const platform = os.platform();

    try {
      if (platform === 'darwin') {
        execSync(`say "${text.replace(/"/g, '\\"')}"`, { timeout: 30000 });
      } else if (platform === 'win32') {
        const ps = `Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.Speak('${text.replace(/'/g, "''")}')`;
        execSync(`powershell -Command "${ps}"`, { timeout: 30000 });
      } else {
        execSync(`espeak "${text.replace(/"/g, '\\"')}"`, { timeout: 30000 });
      }
      return Buffer.alloc(0);
    } catch (err: any) {
      throw new Error(`System TTS failed: ${err.message}`);
    }
  }
}

// ─── TTS Engine (orchestrator) ─────────────────────────────────────

export class TTSEngine {
  private providers: Map<string, TTSProvider> = new Map();
  private preferredProvider: string | null = null;
  private preferredVoice: string | null = null;

  registerProvider(provider: TTSProvider): void {
    this.providers.set(provider.id, provider);
    debug('Registered TTS provider: %s (%d voices)', provider.id, provider.voices.length);
  }

  setPreferred(providerId: string, voiceId?: string): void {
    this.preferredProvider = providerId;
    this.preferredVoice = voiceId || null;
  }

  async speak(text: string, options: TTSOptions = {}): Promise<TTSResult> {
    const providerId = this.preferredProvider || this.selectBestProvider();
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`TTS provider not found: ${providerId}`);

    const opts: TTSOptions = {
      ...options,
      voice: options.voice || this.preferredVoice || undefined,
    };

    debug('Speaking via %s: %s', providerId, text.slice(0, 50));
    const start = Date.now();
    const audio = await provider.synthesize(text, opts);

    return {
      audio,
      format: opts.format || 'mp3',
      durationMs: Date.now() - start,
      provider: providerId,
    };
  }

  listProviders(): Array<{ id: string; name: string; voices: number }> {
    return Array.from(this.providers.values()).map(p => ({
      id: p.id,
      name: p.name,
      voices: p.voices.length,
    }));
  }

  listVoices(providerId?: string): TTSVoice[] {
    if (providerId) {
      return this.providers.get(providerId)?.voices || [];
    }
    const all: TTSVoice[] = [];
    for (const p of this.providers.values()) all.push(...p.voices);
    return all;
  }

  private selectBestProvider(): string {
    // Prefer ElevenLabs > OpenAI > System
    if (this.providers.has('elevenlabs')) return 'elevenlabs';
    if (this.providers.has('openai-tts')) return 'openai-tts';
    if (this.providers.has('system')) return 'system';
    throw new Error('No TTS providers available');
  }
}
