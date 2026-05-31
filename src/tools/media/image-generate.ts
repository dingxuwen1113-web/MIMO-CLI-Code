// ── Image Generation Tool ───────────────────────────────────────
// Multi-backend image generation:
// - OpenAI DALL-E 3 (/v1/images/generations)
// - Stability AI (api.stability.ai)
// - FAL.ai (fal.run)

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  ImageGenRequest, MediaResult, ImageBackendInterface,
  ImageBackend, ImageSize,
} from './types';

// ── OpenAI DALL-E 3 Backend ────────────────────────────────────

class DallE3Backend implements ImageBackendInterface {
  readonly name = 'dall-e-3';
  readonly type = 'image' as const;

  private apiKey: string = '';
  private baseUrl: string = 'https://api.openai.com';

  async init(apiKey: string, baseUrl?: string): Promise<void> {
    this.apiKey = apiKey;
    if (baseUrl) this.baseUrl = baseUrl.replace(/\/+$/, '');
    if (!this.apiKey) {
      throw new Error('DALL-E 3 requires an OpenAI API key.');
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  async generate(request: ImageGenRequest): Promise<MediaResult> {
    const size: ImageSize = request.size || '1024x1024';
    const quality = request.quality || 'standard';
    const style = request.style || 'vivid';

    // DALL-E 3 only supports n=1
    const body: Record<string, any> = {
      model: 'dall-e-3',
      prompt: request.prompt,
      n: 1,
      size,
      quality,
      style,
      response_format: 'url',
    };

    const response = await fetch(`${this.baseUrl}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown error');
      return {
        success: false,
        type: 'image',
        urls: [],
        localPaths: [],
        prompt: request.prompt,
        backend: this.name,
        metadata: {},
        error: `DALL-E 3 API error ${response.status}: ${errorBody}`,
      };
    }

    const data = await response.json() as any;
    const urls: string[] = [];
    const localPaths: string[] = [];

    for (const item of data.data || []) {
      if (item.url) urls.push(item.url);
    }

    // Save to disk if outputDir specified
    if (request.outputDir && urls.length > 0) {
      for (const url of urls) {
        const saved = await downloadImage(url, request.outputDir, request.outputFormat || 'png');
        if (saved) localPaths.push(saved);
      }
    }

    return {
      success: true,
      type: 'image',
      urls,
      localPaths,
      prompt: request.prompt,
      backend: this.name,
      model: 'dall-e-3',
      metadata: {
        revisedPrompt: data.data?.[0]?.revised_prompt,
        size,
        quality,
        style,
      },
    };
  }
}

// ── Stability AI Backend ───────────────────────────────────────

class StabilityAIBackend implements ImageBackendInterface {
  readonly name = 'stability-ai';
  readonly type = 'image' as const;

  private apiKey: string = '';
  private baseUrl: string = 'https://api.stability.ai';

  async init(apiKey: string, baseUrl?: string): Promise<void> {
    this.apiKey = apiKey || process.env.STABILITY_API_KEY || '';
    if (baseUrl) this.baseUrl = baseUrl.replace(/\/+$/, '');
    if (!this.apiKey) {
      throw new Error('Stability AI requires an API key. Set STABILITY_API_KEY.');
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.baseUrl}/v1/engines/list`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  async generate(request: ImageGenRequest): Promise<MediaResult> {
    const model = request.model || 'stable-diffusion-xl-1024-v1-0';

    // Parse size
    const [width, height] = (request.size || '1024x1024').split('x').map(Number);

    const body: Record<string, any> = {
      text_prompts: [
        { text: request.prompt, weight: 1.0 },
      ],
      cfg_scale: request.guidance || 7,
      width,
      height,
      steps: request.steps || 30,
      samples: request.n || 1,
    };

    if (request.negativePrompt) {
      body.text_prompts.push({ text: request.negativePrompt, weight: -1.0 });
    }

    if (request.seed !== undefined) {
      body.seed = request.seed;
    }

    const response = await fetch(`${this.baseUrl}/v1/generation/${model}/text-to-image`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'unknown error');
      return {
        success: false,
        type: 'image',
        urls: [],
        localPaths: [],
        prompt: request.prompt,
        backend: this.name,
        metadata: {},
        error: `Stability AI error ${response.status}: ${errorBody}`,
      };
    }

    const data = await response.json() as any;
    const urls: string[] = [];
    const localPaths: string[] = [];

    for (const artifact of data.artifacts || []) {
      if (artifact.base64) {
        const buf = Buffer.from(artifact.base64, 'base64');
        if (request.outputDir) {
          const saved = await saveBuffer(buf, request.outputDir, request.outputFormat || 'png');
          localPaths.push(saved);
        } else {
          // Provide a data URL
          const mimeType = `image/${request.outputFormat || 'png'}`;
          urls.push(`data:${mimeType};base64,${artifact.base64}`);
        }
      }
    }

    return {
      success: true,
      type: 'image',
      urls,
      localPaths,
      prompt: request.prompt,
      backend: this.name,
      model,
      metadata: {
        seed: data.artifacts?.[0]?.seed,
        finishReason: data.artifacts?.[0]?.finishReason,
        cfgScale: request.guidance || 7,
        steps: request.steps || 30,
      },
    };
  }
}

// ── FAL.ai Backend ─────────────────────────────────────────────

class FalAIBackend implements ImageBackendInterface {
  readonly name = 'fal-ai';
  readonly type = 'image' as const;

  private apiKey: string = '';
  private baseUrl: string = 'https://fal.run';

  async init(apiKey: string, baseUrl?: string): Promise<void> {
    this.apiKey = apiKey || process.env.FAL_KEY || '';
    if (baseUrl) this.baseUrl = baseUrl.replace(/\/+$/, '');
    if (!this.apiKey) {
      throw new Error('FAL.ai requires an API key. Set FAL_KEY.');
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    return true; // FAL availability is checked per-model
  }

  async generate(request: ImageGenRequest): Promise<MediaResult> {
    const model = request.model || 'fal-ai/flux/dev';

    const body: Record<string, any> = {
      prompt: request.prompt,
    };

    if (request.negativePrompt) body.negative_prompt = request.negativePrompt;
    if (request.size) {
      const [w, h] = request.size.split('x').map(Number);
      body.image_size = { width: w, height: h };
    }
    if (request.n) body.num_images = request.n;
    if (request.seed) body.seed = request.seed;
    if (request.steps) body.num_inference_steps = request.steps;
    if (request.guidance) body.guidance_scale = request.guidance;

    const url = `${this.baseUrl}/${model}`;

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
        type: 'image',
        urls: [],
        localPaths: [],
        prompt: request.prompt,
        backend: this.name,
        metadata: {},
        error: `FAL.ai error ${response.status}: ${errorBody}`,
      };
    }

    const data = await response.json() as any;
    const urls: string[] = [];
    const localPaths: string[] = [];

    // FAL returns images in data.images array
    const images = data.images || data.output || [];
    for (const img of images) {
      const imgUrl = img.url || img;
      if (typeof imgUrl === 'string') {
        urls.push(imgUrl);
      }
    }

    // Save to disk
    if (request.outputDir && urls.length > 0) {
      for (const url of urls) {
        const saved = await downloadImage(url, request.outputDir, request.outputFormat || 'png');
        if (saved) localPaths.push(saved);
      }
    }

    return {
      success: true,
      type: 'image',
      urls,
      localPaths,
      prompt: request.prompt,
      backend: this.name,
      model,
      metadata: {
        seed: data.seed,
        requestId: data.request_id || data.requestId,
      },
    };
  }
}

// ── Helper Functions ───────────────────────────────────────────

async function downloadImage(
  url: string,
  outputDir: string,
  format: string,
): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const arrayBuf = await response.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    return await saveBuffer(buf, outputDir, format);
  } catch {
    return null;
  }
}

async function saveBuffer(
  buf: Buffer,
  outputDir: string,
  format: string,
): Promise<string> {
  await fs.promises.mkdir(outputDir, { recursive: true });
  const hash = crypto.createHash('md5').update(buf).digest('hex').substring(0, 12);
  const filename = `img_${Date.now()}_${hash}.${format}`;
  const filePath = path.join(outputDir, filename);
  await fs.promises.writeFile(filePath, buf);
  return filePath;
}

// ── Public API ─────────────────────────────────────────────────

const IMAGE_BACKENDS: Record<ImageBackend, new () => ImageBackendInterface> = {
  'dall-e-3': DallE3Backend,
  'stability-ai': StabilityAIBackend,
  'fal-ai': FalAIBackend,
};

/**
 * Create an image backend instance
 */
export function createImageBackend(backend: ImageBackend): ImageBackendInterface {
  const Cls = IMAGE_BACKENDS[backend];
  if (!Cls) {
    throw new Error(`Unknown image backend: ${backend}. Available: ${Object.keys(IMAGE_BACKENDS).join(', ')}`);
  }
  return new Cls();
}

/**
 * Generate an image using the specified backend
 */
export async function generateImage(request: ImageGenRequest): Promise<MediaResult> {
  const backendType = request.backend || 'dall-e-3';
  const backend = createImageBackend(backendType);

  // Resolve API key from environment
  const apiKey = resolveApiKey(backendType);

  try {
    await backend.init(apiKey);
    return await backend.generate(request);
  } catch (err: any) {
    return {
      success: false,
      type: 'image',
      urls: [],
      localPaths: [],
      prompt: request.prompt,
      backend: backendType,
      metadata: {},
      error: err.message || String(err),
    };
  }
}

function resolveApiKey(backend: ImageBackend): string {
  const envMap: Record<ImageBackend, string[]> = {
    'dall-e-3':     ['OPENAI_API_KEY'],
    'stability-ai': ['STABILITY_API_KEY'],
    'fal-ai':       ['FAL_KEY'],
  };
  const keys = envMap[backend] || [];
  for (const envKey of keys) {
    const val = process.env[envKey];
    if (val) return val;
  }
  return '';
}

/**
 * List available image backends and their status
 */
export async function listImageBackends(): Promise<Array<{ name: ImageBackend; available: boolean }>> {
  const results: Array<{ name: ImageBackend; available: boolean }> = [];

  for (const name of Object.keys(IMAGE_BACKENDS) as ImageBackend[]) {
    try {
      const backend = createImageBackend(name);
      const apiKey = resolveApiKey(name);
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
