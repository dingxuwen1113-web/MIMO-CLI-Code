// ── Voice / TTS / STT Type Definitions ──────────────────────────

export type VoiceEngineType = 'edge-tts' | 'openai-tts' | 'elevenlabs';

export type AudioEncoding = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
export type AudioQuality = 'standard' | 'high' | 'ultra';

export interface VoiceConfig {
  engine: VoiceEngineType;
  apiKey?: string;
  baseUrl?: string;
  defaultVoice?: string;
  defaultLanguage?: string;
  outputFormat: AudioEncoding;
  quality: AudioQuality;
  speed: number;           // 0.25 - 4.0
  pitch?: number;          // -20.0 to 20.0 (SSML semitones)
  volume?: number;         // 0.0 to 1.0
  sampleRate?: number;     // Hz, e.g. 24000, 44100
  streaming: boolean;
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  engine: 'edge-tts',
  outputFormat: 'mp3',
  quality: 'standard',
  speed: 1.0,
  streaming: false,
};

export interface TTSRequest {
  text: string;
  voice?: string;
  language?: string;
  engine?: VoiceEngineType;
  format?: AudioEncoding;
  speed?: number;
  pitch?: number;
  volume?: number;
  ssml?: boolean;
  stream?: boolean;
}

export interface STTRequest {
  audioPath?: string;
  audioBuffer?: Buffer;
  language?: string;
  model?: string;           // e.g. 'whisper-1'
  prompt?: string;          // optional context prompt
  temperature?: number;     // 0.0 - 1.0
  responseFormat?: 'json' | 'text' | 'verbose_json';
  engine?: 'openai-whisper';
}

export interface VoiceResult {
  success: boolean;
  audioData?: Buffer;
  audioPath?: string;
  mimeType: string;
  duration?: number;        // seconds
  transcript?: string;      // STT only
  voice?: string;
  engine: VoiceEngineType;
  error?: string;
}

export interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  gender: 'male' | 'female' | 'neutral';
  engine: VoiceEngineType;
  previewUrl?: string;
  styles?: string[];
}

export interface VoiceEngine {
  readonly name: VoiceEngineType;
  readonly supportedFormats: AudioEncoding[];

  /**
   * Initialize the engine (validate API key, discover voices, etc.)
   */
  init(config: VoiceConfig): Promise<void>;

  /**
   * Synthesize speech from text
   */
  synthesize(request: TTSRequest, config: VoiceConfig): Promise<VoiceResult>;

  /**
   * Stream synthesized speech (yields audio chunks)
   */
  streamSynthesize?(request: TTSRequest, config: VoiceConfig): AsyncGenerator<Buffer, void, undefined>;

  /**
   * List available voices
   */
  listVoices(language?: string): Promise<VoiceInfo[]>;

  /**
   * Engine health check
   */
  isAvailable(): Promise<boolean>;
}
