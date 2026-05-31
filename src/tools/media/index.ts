// ── Media Module Exports ────────────────────────────────────────

export {
  // Types
  ImageGenRequest,
  VideoGenRequest,
  MediaResult,
  MediaBackend,
  ImageBackendInterface,
  VideoBackendInterface,
  ImageBackend,
  VideoBackend,
  ImageSize,
  ImageQuality,
  ImageStyle,
  VideoResolution,
  PollConfig,
  DEFAULT_POLL_CONFIG,
} from './types';

export {
  // Image Generation
  generateImage,
  createImageBackend,
  listImageBackends,
} from './image-generate';

export {
  // Video Generation
  generateVideo,
  createVideoBackend,
  listVideoBackends,
} from './video-generate';

export {
  // Tool Definitions
  imageGenerateTool,
  videoGenerateTool,
  getMediaToolDefinitions,
} from './definitions';
