// ── Edge TTS Engine ──────────────────────────────────────────────
// Free Microsoft Edge TTS service via HTTP (no API key required).
// Uses the same service as Microsoft Edge's Read Aloud feature.

import * as crypto from 'crypto';
import {
  VoiceEngine, VoiceConfig, VoiceEngineType, VoiceInfo,
  TTSRequest, VoiceResult, AudioEncoding,
} from '../types';

const EDGE_TTS_TRUST_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_TTS_WSS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const EDGE_TTS_VOICE_LIST_URL = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list';

const FORMATS: Record<string, string> = {
  'mp3':  'audio-24khz-48kbitrate-mono-mp3',
  'opus': 'ogg-24khz-16bit-mono-opus',
  'aac':  'aac-24khz-64kbitrate-mono',
  'wav':  'riff-24khz-16bit-mono-pcm',
  'pcm':  'raw-24khz-16bit-mono-pcm',
  'flac': 'audio-24khz-16bit-mono-flac',
};

// ── Helpers ─────────────────────────────────────────────────────

function generateSecMsGecTimestamp(): string {
  const epoch = 11644473600;  // Jan 1, 1601 -> Jan 1, 1970 in seconds
  const nowSec = Math.floor(Date.now() / 1000);
  const ticks = (nowSec + epoch) * 10000000;
  return ticks.toString();
}

function generateSecMsGec(): string {
  const ticks = generateSecMsGecTimestamp();
  const str = ticks + EDGE_TTS_TRUST_TOKEN;
  const hash = crypto.createHash('sha256').update(str).digest('hex');
  return hash.toUpperCase();
}

function buildSsml(text: string, voice: string, speed: number, pitch?: number, volume?: number): string {
  const ratePercent = Math.round((speed - 1) * 100);
  const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
  const pitchStr = pitch !== undefined ? `${pitch >= 0 ? '+' : ''}${Math.round(pitch)}Hz` : '+0Hz';
  const volumeStr = volume !== undefined ? Math.round(volume * 100).toString() : '100';

  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
  <voice name='${voice}'>
    <prosody rate='${rateStr}' pitch='${pitchStr}' volume='${volumeStr}'>
      ${escapeXml(text)}
    </prosody>
  </voice>
</speak>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatToContentType(fmt: AudioEncoding): string {
  const map: Record<AudioEncoding, string> = {
    'mp3': 'audio/mpeg',
    'opus': 'audio/ogg',
    'aac': 'audio/aac',
    'wav': 'audio/wav',
    'pcm': 'audio/pcm',
    'flac': 'audio/flac',
  };
  return map[fmt] || 'audio/mpeg';
}

// ── WebSocket-based synthesis ───────────────────────────────────

async function synthesizeViaWss(
  ssml: string,
  outputFormat: string,
): Promise<Buffer> {
  // Edge TTS uses a WebSocket but we can use the HTTP endpoint instead
  // The HTTP API is simpler and does not require a WebSocket library
  const requestId = crypto.randomUUID().replace(/-/g, '');

  const url = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TTS_TRUST_TOKEN}&ConnectionId=${requestId}`;

  const secMsGec = generateSecMsGec();

  const headers: Record<string, string> = {
    'Content-Type': 'application/ssml+xml',
    'X-Microsoft-OutputFormat': outputFormat,
    'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Sec-MS-GEC': secMsGec,
    'Sec-MS-GEC-Version': '1-130.0.2849.68',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: ssml,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown error');
    throw new Error(`Edge TTS HTTP ${response.status}: ${errText}`);
  }

  const arrayBuf = await response.arrayBuffer();
  return Buffer.from(arrayBuf);
}

// ── Engine Implementation ───────────────────────────────────────

export class EdgeTTSEngine implements VoiceEngine {
  readonly name: VoiceEngineType = 'edge-tts';
  readonly supportedFormats: AudioEncoding[] = ['mp3', 'opus', 'aac', 'wav', 'pcm', 'flac'];

  private voicesCache: VoiceInfo[] | null = null;

  async init(_config: VoiceConfig): Promise<void> {
    // Edge TTS requires no API key
    // Pre-fetch voice list to validate connectivity
    try {
      await this.listVoices();
    } catch (err: any) {
      throw new Error(`Edge TTS init failed: ${err.message}`);
    }
  }

  async synthesize(request: TTSRequest, config: VoiceConfig): Promise<VoiceResult> {
    const voice = request.voice || config.defaultVoice || 'en-US-AriaNeural';
    const format = request.format || config.outputFormat || 'mp3';
    const speed = request.speed ?? config.speed ?? 1.0;
    const pitch = request.pitch ?? config.pitch;
    const volume = request.volume ?? config.volume;

    let ssml: string;
    if (request.ssml) {
      // User provided raw SSML
      ssml = request.text;
    } else {
      ssml = buildSsml(request.text, voice, speed, pitch, volume);
    }

    const outputFormat = FORMATS[format] || FORMATS['mp3'];

    const audioData = await synthesizeViaWss(ssml, outputFormat);

    return {
      success: true,
      audioData,
      mimeType: formatToContentType(format),
      voice,
      engine: this.name,
    };
  }

  async *streamSynthesize(
    request: TTSRequest,
    config: VoiceConfig,
  ): AsyncGenerator<Buffer, void, undefined> {
    // Edge TTS does not support chunked streaming via the HTTP API.
    // We synthesize in full and yield in chunks.
    const result = await this.synthesize(request, config);

    if (result.audioData) {
      const chunkSize = 16384; // 16KB chunks
      for (let offset = 0; offset < result.audioData.length; offset += chunkSize) {
        yield result.audioData.subarray(offset, Math.min(offset + chunkSize, result.audioData.length));
      }
    }
  }

  async listVoices(language?: string): Promise<VoiceInfo[]> {
    if (this.voicesCache) {
      return language
        ? this.voicesCache.filter(v => v.language.startsWith(language))
        : this.voicesCache;
    }

    const url = `${EDGE_TTS_VOICE_LIST_URL}?trustedclienttoken=${EDGE_TTS_TRUST_TOKEN}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      },
    });

    if (!response.ok) {
      throw new Error(`Edge TTS voice list HTTP ${response.status}`);
    }

    const raw = (await response.json()) as any[];

    this.voicesCache = raw.map((v: any) => ({
      id: v.ShortName || v.Name,
      name: v.FriendlyName || v.ShortName || v.Name,
      language: v.Locale || 'unknown',
      gender: (v.Gender || '').toLowerCase() === 'female' ? 'female'
        : (v.Gender || '').toLowerCase() === 'male' ? 'male'
        : 'neutral',
      engine: this.name,
      styles: v.VoiceTag?.VoicePersonalities || [],
    }));

    return language
      ? this.voicesCache.filter(v => v.language.startsWith(language))
      : this.voicesCache;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(
        `${EDGE_TTS_VOICE_LIST_URL}?trustedclienttoken=${EDGE_TTS_TRUST_TOKEN}`,
        {
          method: 'HEAD',
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        },
      );
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export function createEdgeTTSEngine(): VoiceEngine {
  return new EdgeTTSEngine();
}
