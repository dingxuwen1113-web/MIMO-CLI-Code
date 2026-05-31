// ── Media Type Definitions ──────────────────────────────────────

export type ImageBackend = 'dall-e-3' | 'stability-ai' | 'fal-ai';
export type VideoBackend = 'fal-ai' | 'runway' | 'luma';
export type ImageSize = '1024x1024' | '1792x1024' | '1024x1792' | '256x256' | '512x512';
export type ImageQuality = 'standard' | 'hd';
export type ImageStyle = 'vivid' | 'natural';
export type VideoResolution = '720p' | '1080p' | '4k';

export interface ImageGenRequest {
  prompt: string;
  negativePrompt?: string;
  backend?: ImageBackend;
  model?: string;
  size?: ImageSize;
  quality?: ImageQuality;
  style?: ImageStyle;
  n?: number;              // 1-10 images
  seed?: number;
  steps?: number;          // diffusion steps
  guidance?: number;       // guidance scale / cfg
  outputDir?: string;      // directory to save image(s)
  outputFormat?: 'png' | 'jpg' | 'webp';
}

export interface VideoGenRequest {
  prompt: string;
  negativePrompt?: string;
  backend?: VideoBackend;
  model?: string;
  duration?: number;       // seconds (typically 4-10)
  resolution?: VideoResolution;
  fps?: number;            // frames per second
  seed?: number;
  imageUrl?: string;       // image-to-video input
  outputDir?: string;
  outputFormat?: 'mp4' | 'webm' | 'gif';
}

export interface MediaResult {
  success: boolean;
  type: 'image' | 'video';
  urls: string[];          // remote URLs
  localPaths: string[];    // saved file paths
  prompt: string;
  backend: string;
  model?: string;
  metadata: Record<string, any>;
  error?: string;
}

export interface MediaBackend {
  readonly name: string;
  readonly type: 'image' | 'video';

  /**
   * Initialize the backend (validate API key, etc.)
   */
  init(apiKey: string, baseUrl?: string): Promise<void>;

  /**
   * Check if the backend is available
   */
  isAvailable(): Promise<boolean>;
}

export interface ImageBackendInterface extends MediaBackend {
  readonly type: 'image';
  generate(request: ImageGenRequest): Promise<MediaResult>;
}

export interface VideoBackendInterface extends MediaBackend {
  readonly type: 'video';
  generate(request: VideoGenRequest): Promise<MediaResult>;
}

/**
 * Poll configuration for async generation APIs
 */
export interface PollConfig {
  maxAttempts: number;     // max polling attempts
  intervalMs: number;      // initial poll interval
  backoffMultiplier: number; // exponential backoff factor
  maxIntervalMs: number;   // max poll interval cap
}

export const DEFAULT_POLL_CONFIG: PollConfig = {
  maxAttempts: 60,
  intervalMs: 2000,
  backoffMultiplier: 1.5,
  maxIntervalMs: 15000,
};
