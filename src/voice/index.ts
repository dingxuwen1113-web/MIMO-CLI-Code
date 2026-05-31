// ── Voice Module Exports ────────────────────────────────────────

export {
  // Types
  VoiceConfig,
  TTSRequest,
  STTRequest,
  VoiceEngine,
  VoiceEngineType,
  VoiceResult,
  VoiceInfo,
  AudioEncoding,
  AudioQuality,
  DEFAULT_VOICE_CONFIG,
} from './types';

export {
  // Voice Manager
  VoiceManager,
  VoiceManagerOptions,
  createVoiceManager,
} from './manager';

export {
  // Speech-to-Text
  transcribeAudio,
  transcribeFile,
  getSupportedSTTFormats,
  STTConfig,
} from './stt';

export {
  // Edge TTS Engine (free)
  EdgeTTSEngine,
  createEdgeTTSEngine,
} from './engines/edge-tts';

export {
  // OpenAI TTS Engine
  OpenAITTSEngine,
  createOpenAITTSEngine,
} from './engines/openai-tts';

export {
  // ElevenLabs TTS Engine
  ElevenLabsEngine,
  createElevenLabsEngine,
} from './engines/elevenlabs';
