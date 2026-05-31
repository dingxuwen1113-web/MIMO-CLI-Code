// ── Media Tool Definitions ──────────────────────────────────────
// Anthropic API format tool definitions for image_generate and video_generate

import { ToolDefinition } from '../../tools/registry';

/**
 * image_generate tool definition
 */
export const imageGenerateTool: ToolDefinition = {
  name: 'image_generate',
  description: `Generate images from text prompts using AI image generation backends.
Supports multiple backends:
- dall-e-3: OpenAI DALL-E 3 (best quality, supports 1024x1024, 1792x1024, 1024x1792)
- stability-ai: Stability AI SDXL (flexible sizes, negative prompts, seed control)
- fal-ai: FAL.ai (FLUX and other models, fast generation)
The generated image will be saved to the specified output directory.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      prompt: {
        type: 'string',
        description: 'Detailed text description of the image to generate',
      },
      negative_prompt: {
        type: 'string',
        description: 'What to exclude from the image (Stability AI and FAL only)',
      },
      backend: {
        type: 'string',
        enum: ['dall-e-3', 'stability-ai', 'fal-ai'],
        description: 'Image generation backend to use. Default: dall-e-3',
      },
      model: {
        type: 'string',
        description: 'Specific model ID (backend-dependent). e.g., "stable-diffusion-xl-1024-v1-0", "fal-ai/flux/dev"',
      },
      size: {
        type: 'string',
        enum: ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'],
        description: 'Image dimensions. Default: 1024x1024',
      },
      quality: {
        type: 'string',
        enum: ['standard', 'hd'],
        description: 'Image quality (DALL-E 3 only). Default: standard',
      },
      style: {
        type: 'string',
        enum: ['vivid', 'natural'],
        description: 'Image style (DALL-E 3 only). Default: vivid',
      },
      n: {
        type: 'number',
        description: 'Number of images to generate (1-10, DALL-E 3 only supports 1)',
      },
      seed: {
        type: 'number',
        description: 'Random seed for reproducible generation',
      },
      steps: {
        type: 'number',
        description: 'Number of diffusion steps (Stability AI and FAL)',
      },
      guidance: {
        type: 'number',
        description: 'Guidance scale / CFG (Stability AI and FAL)',
      },
      output_dir: {
        type: 'string',
        description: 'Directory to save the generated image(s). Default: current directory',
      },
      output_format: {
        type: 'string',
        enum: ['png', 'jpg', 'webp'],
        description: 'Output image format. Default: png',
      },
    },
    required: ['prompt'],
  },
  permission: 'auto',
};

/**
 * video_generate tool definition
 */
export const videoGenerateTool: ToolDefinition = {
  name: 'video_generate',
  description: `Generate videos from text prompts (and optionally an image) using AI video generation backends.
Supports multiple backends:
- fal-ai: FAL.ai (fast, multiple models including SVD, Kling, MiniMax)
- runway: Runway Gen-3 (high quality, image-to-video)
- luma: Luma AI Dream Machine (text-to-video, image-to-video)
Note: Video generation is asynchronous and may take several minutes.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      prompt: {
        type: 'string',
        description: 'Detailed text description of the video to generate',
      },
      negative_prompt: {
        type: 'string',
        description: 'What to exclude from the video',
      },
      backend: {
        type: 'string',
        enum: ['fal-ai', 'runway', 'luma'],
        description: 'Video generation backend. Default: fal-ai',
      },
      model: {
        type: 'string',
        description: 'Specific model ID (backend-dependent)',
      },
      duration: {
        type: 'number',
        description: 'Video duration in seconds (typically 4-10)',
      },
      resolution: {
        type: 'string',
        enum: ['720p', '1080p', '4k'],
        description: 'Video resolution. Default: 720p',
      },
      fps: {
        type: 'number',
        description: 'Frames per second. Default: 24',
      },
      seed: {
        type: 'number',
        description: 'Random seed for reproducible generation',
      },
      image_url: {
        type: 'string',
        description: 'URL of a source image for image-to-video generation',
      },
      output_dir: {
        type: 'string',
        description: 'Directory to save the generated video. Default: current directory',
      },
      output_format: {
        type: 'string',
        enum: ['mp4', 'webm', 'gif'],
        description: 'Output video format. Default: mp4',
      },
    },
    required: ['prompt'],
  },
  permission: 'auto',
};

/**
 * Get all media tool definitions
 */
export function getMediaToolDefinitions(): ToolDefinition[] {
  return [imageGenerateTool, videoGenerateTool];
}
