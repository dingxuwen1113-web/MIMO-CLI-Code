// ── Video Generation Tool ───────────────────────────────────────
// Multi-backend video generation:
// - FAL.ai video generation
// - Runway Gen-3 (api.runwayml.com)
// - Luma AI (api.lumalabs.ai)

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  VideoGenRequest, MediaResult, VideoBackendInterface,
  VideoBackend, DEFAULT_POLL_CONFIG, PollConfig,
} from './types';

// ── Polling Helper ─────────────────────────────────────────────

async function pollForResult<T>(
  checkFn: () => Promise<{ done: boolean; result?: T; error?: string }>,
  config: PollConfig = DEFAULT_POLL_CONFIG,
): Promise<T> {
  let interval = config.intervalMs;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    const { done, result, error } = await checkFn();

    if (error) {
      throw new Error(error);
    }

    if (done && result !== undefined) {
      return result;
    }

    await new Promise(resolve => setTimeout(resolve, interval));
    interval = Math.min(interval * config.backoffMultiplier, config.maxIntervalMs);
  }

  throw new Error(`Video generation timed out after ${config.maxAttempts} attempts`);
}

async function downloadVideo(url: string, outputDir: string, format: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const arrayBuf = await response.arrayBuffer();
    const buf = Buffer.from(arrayBuf);

    await fs.promises.mkdir(outputDir, { recursive: true });
    const hash = crypto.createHash('md5').update(buf).digest('hex').substring(0, 12);
    const filename = `video_${Date.now()}_${hash}.${format}`;
    const filePath = path.join(outputDir, filename);
    await fs.promises.writeFile(filePath, buf);
    return filePath;
  } catch {
    return null;
  }
}

// ── FAL.ai Video Backend ───────────────────────────────────────

class FalAIVideoBackend implements VideoBackendInterface {
  readonly name = 'fal-ai';
  readonly type = 'video' as const;

  private apiKey: string = '';
  private baseUrl: string = 'https://fal.run';
  private queueUrl: string = 'https://queue.fal.run';

  async init(apiKey: string, baseUrl?: string): Promise<void> {
    this.apiKey = apiKey || process.env.FAL_KEY || '';
    if (baseUrl) this.baseUrl = baseUrl.replace(/\/+$/, '');
    if (!this.apiKey) {
      throw new Error('FAL.ai requires an API key. Set FAL_KEY.');
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async generate(request: VideoGenRequest): Promise<MediaResult> {
    const model = request.model || 'fal-ai/fast-svd';

    const body: Record<string, any> = {
      prompt: request.prompt,
    };

    if (request.negativePrompt) body.negative_prompt = request.negativePrompt;
    if (request.duration) body.num_frames = Math.round(request.duration * (request.fps || 24));
    if (request.fps) body.fps = request.fps;
    if (request.seed) body.seed = request.seed;
    if (request.imageUrl) body.image_url = request.imageUrl;

    // Try the queue endpoint for longer-running tasks
    const useQueue = model.includes('luma') || model.includes('minimax') || model.includes('kling');
    const baseUrl = useQueue ? this.queueUrl : this.baseUrl;
    const url = `${baseUrl}/${model}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown error');
      return {
        success: false,
        type: 'video',
        urls: [],
        localPaths: [],
        prompt: request.prompt,
        backend: this.name,
        metadata: {},
        error: `FAL.ai video error ${response.status}: ${errorBody}`,
      };
    }

    let data = await response.json() as any;

    // If using queue, poll for result
    if (useQueue && data.status_url) {
      data = await pollForResult(async () => {
        const statusRes = await fetch(data.status_url, {
          headers: { 'Authorization': `Key ${this.apiKey}` },
        });
        if (!statusRes.ok) {
          return { done: false, error: `Poll failed: ${statusRes.status}` };
        }
        const statusData = await statusRes.json() as any;
        if (statusData.status === 'COMPLETED' || statusData.status === 'completed') {
          return { done: true, result: statusData };
        }
        if (statusData.status === 'FAILED' || statusData.status === 'failed') {
          return { done: false, error: `Generation failed: ${statusData.error || 'unknown'}` };
        }
        return { done: false };
      });
    }

    const urls: string[] = [];
    const localPaths: string[] = [];

    // Extract video URL
    const videos = data.videos || data.output || [];
    for (const vid of videos) {
      const videoUrl = vid.url || vid;
      if (typeof videoUrl === 'string') {
        urls.push(videoUrl);
      }
    }

    // Also check top-level video/url fields
    if (data.video?.url) urls.push(data.video.url);
    if (data.url && typeof data.url === 'string' && data.url.includes('video')) {
      urls.push(data.url);
    }

    // Deduplicate
    const seen = new Map<string, boolean>();
    const uniqueUrls = urls.filter(u => { if (seen.has(u)) return false; seen.set(u, true); return true; });

    // Save to disk
    if (request.outputDir && uniqueUrls.length > 0) {
      for (const videoUrl of uniqueUrls) {
        const saved = await downloadVideo(
          videoUrl,
          request.outputDir,
          request.outputFormat || 'mp4',
        );
        if (saved) localPaths.push(saved);
      }
    }

    return {
      success: true,
      type: 'video',
      urls: uniqueUrls,
      localPaths,
      prompt: request.prompt,
      backend: this.name,
      model,
      metadata: {
        requestId: data.request_id || data.requestId,
        seed: data.seed,
        duration: request.duration,
      },
    };
  }
}

// ── Runway Gen-3 Backend ───────────────────────────────────────

class RunwayBackend implements VideoBackendInterface {
  readonly name = 'runway';
  readonly type = 'video' as const;

  private apiKey: string = '';
  private baseUrl: string = 'https://api.runwayml.com/v1';

  async init(apiKey: string, baseUrl?: string): Promise<void> {
    this.apiKey = apiKey || process.env.RUNWAY_API_KEY || '';
    if (baseUrl) this.baseUrl = baseUrl.replace(/\/+$/, '');
    if (!this.apiKey) {
      throw new Error('Runway requires an API key. Set RUNWAY_API_KEY.');
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  async generate(request: VideoGenRequest): Promise<MediaResult> {
    const model = request.model || 'gen3a_turbo';

    // Create generation task
    const body: Record<string, any> = {
      model,
      prompt_text: request.prompt,
    };

    if (request.imageUrl) {
      body.prompt_image = request.imageUrl;
    }

    // Map resolution to Runway format
    const resolutionMap: Record<string, string> = {
      '720p':  '1280x720',
      '1080p': '1920x1080',
      '4k':    '3840x2160',
    };
    if (request.resolution) {
      body.resolution = resolutionMap[request.resolution] || '1280x720';
    }

    // Duration (Runway expects specific values)
    const duration = request.duration || 5;
    body.duration = duration <= 5 ? 5 : 10;

    // Ratio
    body.ratio = '16:9';

    const createResponse = await fetch(`${this.baseUrl}/image_to_video`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!createResponse.ok) {
      const errorBody = await createResponse.text().catch(() => 'unknown error');
      return {
        success: false,
        type: 'video',
        urls: [],
        localPaths: [],
        prompt: request.prompt,
        backend: this.name,
        metadata: {},
        error: `Runway API error ${createResponse.status}: ${errorBody}`,
      };
    }

    const taskData = await createResponse.json() as any;
    const taskId = taskData.id;

    if (!taskId) {
      return {
        success: false,
        type: 'video',
        urls: [],
        localPaths: [],
        prompt: request.prompt,
        backend: this.name,
        metadata: {},
        error: 'Runway API did not return a task ID',
      };
    }

    // Poll for result
    const result = await pollForResult<{ videoUrl: string }>(async () => {
      const statusRes = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });

      if (!statusRes.ok) {
        return { done: false, error: `Runway poll error ${statusRes.status}` };
      }

      const statusData = await statusRes.json() as any;

      if (statusData.status === 'SUCCEEDED') {
        const videoUrl = statusData.output?.[0] || '';
        return { done: true, result: { videoUrl } };
      }

      if (statusData.status === 'FAILED') {
        return { done: false, error: `Runway generation failed: ${statusData.failure || 'unknown'}` };
      }

      return { done: false };
    });

    const urls: string[] = result.videoUrl ? [result.videoUrl] : [];
    const localPaths: string[] = [];

    if (request.outputDir && urls.length > 0) {
      for (const url of urls) {
        const saved = await downloadVideo(url, request.outputDir, request.outputFormat || 'mp4');
        if (saved) localPaths.push(saved);
      }
    }

    return {
      success: true,
      type: 'video',
      urls,
      localPaths,
      prompt: request.prompt,
      backend: this.name,
      model,
      metadata: {
        taskId,
        duration: body.duration,
        resolution: body.resolution,
      },
    };
  }
}

// ── Luma AI Backend ────────────────────────────────────────────

class LumaAIBackend implements VideoBackendInterface {
  readonly name = 'luma';
  readonly type = 'video' as const;

  private apiKey: string = '';
  private baseUrl: string = 'https://api.lumalabs.ai/dream-machine/v1';

  async init(apiKey: string, baseUrl?: string): Promise<void> {
    this.apiKey = apiKey || process.env.LUMA_API_KEY || '';
    if (baseUrl) this.baseUrl = baseUrl.replace(/\/+$/, '');
    if (!this.apiKey) {
      throw new Error('Luma AI requires an API key. Set LUMA_API_KEY.');
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.baseUrl}/generations`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok || response.status === 401; // endpoint exists even if unauthorized
    } catch {
      return false;
    }
  }

  async generate(request: VideoGenRequest): Promise<MediaResult> {
    // Create generation
    const body: Record<string, any> = {
      prompt: request.prompt,
    };

    if (request.negativePrompt) {
      body.negative_prompt = request.negativePrompt;
    }

    // Aspect ratio from resolution
    const aspectMap: Record<string, string> = {
      '720p':  '16:9',
      '1080p': '16:9',
      '4k':    '16:9',
    };
    body.aspect_ratio = request.resolution ? (aspectMap[request.resolution] || '16:9') : '16:9';

    // Keyframes (image-to-video)
    if (request.imageUrl) {
      body.keyframes = {
        frame0: {
          type: 'image',
          url: request.imageUrl,
        },
      };
    }

    // Duration
    body.loop = false;

    const endpoint = request.imageUrl
      ? `${this.baseUrl}/generations/image-to-video`
      : `${this.baseUrl}/generations`;

    const createResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!createResponse.ok) {
      const errorBody = await createResponse.text().catch(() => 'unknown error');
      return {
        success: false,
        type: 'video',
        urls: [],
        localPaths: [],
        prompt: request.prompt,
        backend: this.name,
        metadata: {},
        error: `Luma AI error ${createResponse.status}: ${errorBody}`,
      };
    }

    const taskData = await createResponse.json() as any;
    const generationId = taskData.id;

    if (!generationId) {
      return {
        success: false,
        type: 'video',
        urls: [],
        localPaths: [],
        prompt: request.prompt,
        backend: this.name,
        metadata: {},
        error: 'Luma AI did not return a generation ID',
      };
    }

    // Poll for result
    const result = await pollForResult<{ videoUrl: string }>(async () => {
      const statusRes = await fetch(`${this.baseUrl}/generations/${generationId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });

      if (!statusRes.ok) {
        return { done: false, error: `Luma poll error ${statusRes.status}` };
      }

      const statusData = await statusRes.json() as any;

      if (statusData.state === 'completed' || statusData.state === 'dreaming_complete') {
        const videoUrl = statusData.assets?.video || '';
        return { done: true, result: { videoUrl } };
      }

      if (statusData.state === 'failed') {
        return { done: false, error: `Luma generation failed: ${statusData.failure_reason || 'unknown'}` };
      }

      return { done: false };
    });

    const urls: string[] = result.videoUrl ? [result.videoUrl] : [];
    const localPaths: string[] = [];

    if (request.outputDir && urls.length > 0) {
      for (const url of urls) {
        const saved = await downloadVideo(url, request.outputDir, request.outputFormat || 'mp4');
        if (saved) localPaths.push(saved);
      }
    }

    return {
      success: true,
      type: 'video',
      urls,
      localPaths,
      prompt: request.prompt,
      backend: this.name,
      model: 'dream-machine',
      metadata: {
        generationId,
        state: 'completed',
        aspectRatio: body.aspect_ratio,
      },
    };
  }
}

// ── Public API ─────────────────────────────────────────────────

const VIDEO_BACKENDS: Record<VideoBackend, new () => VideoBackendInterface> = {
  'fal-ai': FalAIVideoBackend,
  'runway': RunwayBackend,
  'luma':   LumaAIBackend,
};

/**
 * Create a video backend instance
 */
export function createVideoBackend(backend: VideoBackend): VideoBackendInterface {
  const Cls = VIDEO_BACKENDS[backend];
  if (!Cls) {
    throw new Error(`Unknown video backend: ${backend}. Available: ${Object.keys(VIDEO_BACKENDS).join(', ')}`);
  }
  return new Cls();
}

/**
 * Generate a video using the specified backend
 */
export async function generateVideo(request: VideoGenRequest): Promise<MediaResult> {
  const backendType = request.backend || 'fal-ai';
  const backend = createVideoBackend(backendType);

  const apiKey = resolveVideoApiKey(backendType);

  try {
    await backend.init(apiKey);
    return await backend.generate(request);
  } catch (err: any) {
    return {
      success: false,
      type: 'video',
      urls: [],
      localPaths: [],
      prompt: request.prompt,
      backend: backendType,
      metadata: {},
      error: err.message || String(err),
    };
  }
}

function resolveVideoApiKey(backend: VideoBackend): string {
  const envMap: Record<VideoBackend, string[]> = {
    'fal-ai': ['FAL_KEY'],
    'runway': ['RUNWAY_API_KEY'],
    'luma':   ['LUMA_API_KEY'],
  };
  const keys = envMap[backend] || [];
  for (const envKey of keys) {
    const val = process.env[envKey];
    if (val) return val;
  }
  return '';
}

/**
 * List available video backends and their status
 */
export async function listVideoBackends(): Promise<Array<{ name: VideoBackend; available: boolean }>> {
  const results: Array<{ name: VideoBackend; available: boolean }> = [];

  for (const name of Object.keys(VIDEO_BACKENDS) as VideoBackend[]) {
    try {
      const backend = createVideoBackend(name);
      const apiKey = resolveVideoApiKey(name);
      if (apiKey) {
        await backend.init(apiKey);
        const available = await backend.isAvailable();
        results.push({ name, available });
      } else {
        results.push({ name, available: false });
      }
    } catch {
      results.push({ name, available: false });
    }
  }

  return results;
}
