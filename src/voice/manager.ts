// ── Voice Manager ───────────────────────────────────────────────
// Orchestrates TTS/STT engines, manages configuration,
// and provides a unified interface for voice operations.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  VoiceConfig, VoiceEngine, VoiceEngineType, VoiceInfo,
  TTSRequest, STTRequest, VoiceResult,
  DEFAULT_VOICE_CONFIG,
} from './types';
import { transcribeAudio } from './stt';

// Lazy engine imports to avoid loading unnecessary modules
type EngineFactory = () => VoiceEngine;

const ENGINE_FACTORIES: Record<VoiceEngineType, EngineFactory> = {
  'edge-tts':    () => { const { EdgeTTSEngine } = require('./engines/edge-tts'); return new EdgeTTSEngine(); },
  'openai-tts':  () => { const { OpenAITTSEngine } = require('./engines/openai-tts'); return new OpenAITTSEngine(); },
  'elevenlabs':  () => { const { ElevenLabsEngine } = require('./engines/elevenlabs'); return new ElevenLabsEngine(); },
};

export interface VoiceManagerOptions {
  configDir?: string;     // default: ~/.mimo
  autoInit?: boolean;     // default: true
}

export class VoiceManager {
  private config: VoiceConfig;
  private engines: Map<VoiceEngineType, VoiceEngine> = new Map();
  private initialized: Set<VoiceEngineType> = new Set();
  private configDir: string;

  constructor(config?: Partial<VoiceConfig>, options?: VoiceManagerOptions) {
    this.config = { ...DEFAULT_VOICE_CONFIG, ...config };
    this.configDir = options?.configDir || path.join(os.homedir(), '.mimo');
  }

  // ── Configuration ──────────────────────────────────────────

  /**
   * Update voice configuration
   */
  updateConfig(config: Partial<VoiceConfig>): void {
    this.config = { ...this.config, ...config };
    // Clear initialized engines if config changed
    this.initialized.clear();
  }

  /**
   * Get current configuration
   */
  getConfig(): VoiceConfig {
    return { ...this.config };
  }

  /**
   * Load configuration from file
   */
  async loadConfig(): Promise<void> {
    const configPath = path.join(this.configDir, 'voice.json');
    try {
      const raw = await fs.promises.readFile(configPath, 'utf-8');
      const saved = JSON.parse(raw);
      this.config = { ...DEFAULT_VOICE_CONFIG, ...saved };
      this.initialized.clear();
    } catch {
      // Config file doesn't exist, use defaults
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfig(): Promise<void> {
    const configPath = path.join(this.configDir, 'voice.json');
    await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
    await fs.promises.writeFile(configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  // ── Engine Management ──────────────────────────────────────

  /**
   * Get or create an engine
   */
  private async getEngine(engineType?: VoiceEngineType): Promise<VoiceEngine> {
    const type = engineType || this.config.engine;

    if (this.engines.has(type)) {
      return this.engines.get(type)!;
    }

    const factory = ENGINE_FACTORIES[type];
    if (!factory) {
      throw new Error(`Unknown voice engine: ${type}. Available: ${Object.keys(ENGINE_FACTORIES).join(', ')}`);
    }

    const engine = factory();

    // Auto-initialize if not done
    if (!this.initialized.has(type)) {
      await engine.init(this.config);
      this.initialized.add(type);
    }

    this.engines.set(type, engine);
    return engine;
  }

  /**
   * Pre-initialize a specific engine
   */
  async initEngine(engineType: VoiceEngineType): Promise<void> {
    const engine = await this.getEngine(engineType);
    if (!this.initialized.has(engineType)) {
      await engine.init(this.config);
      this.initialized.add(engineType);
    }
  }

  /**
   * List available engines and their status
   */
  async listEngines(): Promise<Array<{ engine: VoiceEngineType; available: boolean; initialized: boolean }>> {
    const results: Array<{ engine: VoiceEngineType; available: boolean; initialized: boolean }> = [];

    for (const type of Object.keys(ENGINE_FACTORIES) as VoiceEngineType[]) {
      try {
        const engine = await this.getEngine(type);
        const available = await engine.isAvailable();
        results.push({
          engine: type,
          available,
          initialized: this.initialized.has(type),
        });
      } catch {
        results.push({
          engine: type,
          available: false,
          initialized: false,
        });
      }
    }

    return results;
  }

  // ── TTS Operations ─────────────────────────────────────────

  /**
   * Synthesize text to speech
   */
  async speak(request: TTSRequest): Promise<VoiceResult> {
    const engineType = request.engine || this.config.engine;

    try {
      const engine = await this.getEngine(engineType);
      return await engine.synthesize(request, this.config);
    } catch (err: any) {
      // Try fallback engine
      if (engineType !== 'edge-tts') {
        try {
          const fallback = await this.getEngine('edge-tts');
          return await fallback.synthesize(request, this.config);
        } catch {
          // Fall through to error
        }
      }

      return {
        success: false,
        mimeType: '',
        engine: engineType,
        error: err.message || String(err),
      };
    }
  }

  /**
   * Synthesize text and save to file
   */
  async speakToFile(request: TTSRequest, outputPath: string): Promise<VoiceResult> {
    const result = await this.speak(request);
    if (result.success && result.audioData) {
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.promises.writeFile(outputPath, result.audioData);
      result.audioPath = outputPath;
    }
    return result;
  }

  /**
   * Stream synthesized audio
   */
  async *speakStream(request: TTSRequest): AsyncGenerator<Buffer, void, undefined> {
    const engineType = request.engine || this.config.engine;
    const engine = await this.getEngine(engineType);

    if (!engine.streamSynthesize) {
      // Fall back to non-streaming and yield in chunks
      const result = await engine.synthesize(request, this.config);
      if (result.audioData) {
        const chunkSize = 16384;
        for (let offset = 0; offset < result.audioData.length; offset += chunkSize) {
          yield result.audioData.subarray(offset, Math.min(offset + chunkSize, result.audioData.length));
        }
      }
      return;
    }

    yield* engine.streamSynthesize(request, this.config);
  }

  // ── STT Operations ─────────────────────────────────────────

  /**
   * Transcribe audio to text
   */
  async listen(request: STTRequest): Promise<VoiceResult> {
    const sttConfig = {
      apiKey: this.config.apiKey || process.env.OPENAI_API_KEY || '',
      baseUrl: this.config.baseUrl,
    };

    if (!sttConfig.apiKey) {
      return {
        success: false,
        mimeType: 'text/plain',
        engine: 'openai-tts' as VoiceEngineType,
        error: 'STT requires an OpenAI API key. Set OPENAI_API_KEY in environment or config.',
      };
    }

    return transcribeAudio(request, sttConfig);
  }

  /**
   * Transcribe a file
   */
  async listenToFile(filePath: string, options?: Partial<STTRequest>): Promise<VoiceResult> {
    return this.listen({ audioPath: filePath, ...options });
  }

  // ── Voice Discovery ────────────────────────────────────────

  /**
   * List voices for a given engine
   */
  async listVoices(engineType?: VoiceEngineType, language?: string): Promise<VoiceInfo[]> {
    const type = engineType || this.config.engine;
    try {
      const engine = await this.getEngine(type);
      return await engine.listVoices(language);
    } catch (err: any) {
      return [];
    }
  }

  /**
   * List all voices across all engines
   */
  async listAllVoices(language?: string): Promise<VoiceInfo[]> {
    const allVoices: VoiceInfo[] = [];

    for (const type of Object.keys(ENGINE_FACTORIES) as VoiceEngineType[]) {
      try {
        const engine = await this.getEngine(type);
        const voices = await engine.listVoices(language);
        allVoices.push(...voices);
      } catch {
        // Skip engines that fail
      }
    }

    return allVoices;
  }

  /**
   * Find voices matching criteria
   */
  async findVoices(criteria: {
    language?: string;
    gender?: 'male' | 'female' | 'neutral';
    engine?: VoiceEngineType;
  }): Promise<VoiceInfo[]> {
    let voices = await this.listAllVoices(criteria.language);

    if (criteria.gender) {
      voices = voices.filter(v => v.gender === criteria.gender);
    }
    if (criteria.engine) {
      voices = voices.filter(v => v.engine === criteria.engine);
    }

    return voices;
  }

  // ── Utility ────────────────────────────────────────────────

  /**
   * Quick speak: simple text-to-speech with defaults
   */
  async quickSpeak(text: string): Promise<VoiceResult> {
    return this.speak({ text });
  }

  /**
   * Get the default voice for a given language
   */
  getDefaultVoice(language: string): string {
    const defaults: Record<string, string> = {
      'en':    'en-US-AriaNeural',
      'en-US': 'en-US-AriaNeural',
      'en-GB': 'en-GB-SoniaNeural',
      'zh':    'zh-CN-XiaoxiaoNeural',
      'zh-CN': 'zh-CN-XiaoxiaoNeural',
      'zh-TW': 'zh-TW-HsiaoChenNeural',
      'ja':    'ja-JP-NanamiNeural',
      'ko':    'ko-KR-SunHiNeural',
      'fr':    'fr-FR-DeniseNeural',
      'de':    'de-DE-KatjaNeural',
      'es':    'es-ES-ElviraNeural',
      'it':    'it-IT-ElsaNeural',
      'pt':    'pt-BR-FranciscaNeural',
      'ru':    'ru-RU-SvetlanaNeural',
      'ar':    'ar-SA-ZariyahNeural',
      'hi':    'hi-IN-SwaraNeural',
    };

    // Exact match first, then prefix match
    return defaults[language]
      || defaults[language.split('-')[0]]
      || this.config.defaultVoice
      || 'en-US-AriaNeural';
  }
}

/**
 * Create a VoiceManager with default configuration
 */
export function createVoiceManager(config?: Partial<VoiceConfig>): VoiceManager {
  return new VoiceManager(config);
}
