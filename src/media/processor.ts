import createDebug from 'debug';

const debug = createDebug('mimo:media');

// ─── Media Types ───────────────────────────────────────────────────

export type MediaType = 'image' | 'video' | 'music' | 'audio' | 'document';

export interface MediaResult {
  data: Buffer;
  format: string;
  metadata: Record<string, any>;
  provider: string;
}

export interface ImageOptions {
  width?: number;
  height?: number;
  quality?: number;
  style?: 'natural' | 'vivid';
  model?: string;
}

export interface VideoOptions {
  duration?: number;
  fps?: number;
  resolution?: string;
  model?: string;
}

export interface MusicOptions {
  duration?: number;
  genre?: string;
  model?: string;
}

export interface PDFExtractResult {
  text: string;
  pages: number;
  metadata: Record<string, any>;
}

// ─── Media Provider Interface ──────────────────────────────────────

export interface MediaProvider {
  id: string;
  type: MediaType;
  generate?(prompt: string, options?: any): Promise<MediaResult>;
  extract?(input: Buffer, format: string): Promise<any>;
}

// ─── Image Generation ──────────────────────────────────────────────

export class DallEImageProvider implements MediaProvider {
  id = 'dall-e';
  type = 'image' as MediaType;
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.openai.com') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async generate(prompt: string, options: ImageOptions = {}): Promise<MediaResult> {
    const https = require('https');
    const body = JSON.stringify({
      model: options.model || 'dall-e-3',
      prompt,
      n: 1,
      size: `${options.width || 1024}x${options.height || 1024}`,
      quality: options.quality === 1 ? 'hd' : 'standard',
      style: options.style || 'vivid',
      response_format: 'b64_json',
    });

    return new Promise((resolve, reject) => {
      const req = https.request(`${this.baseUrl}/v1/images/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      }, (res: any) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString();
          if (res.statusCode === 200) {
            const json = JSON.parse(raw);
            const imgData = json.data[0].b64_json;
            resolve({
              data: Buffer.from(imgData, 'base64'),
              format: 'png',
              metadata: { revisedPrompt: json.data[0].revised_prompt },
              provider: 'dall-e',
            });
          } else {
            reject(new Error(`DALL-E error ${res.statusCode}: ${raw.slice(0, 200)}`));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  extract = undefined;
}

// ─── PDF Extraction ────────────────────────────────────────────────

export class PDFExtractor implements MediaProvider {
  id = 'pdf-extractor';
  type = 'document' as MediaType;
  generate = undefined;

  async extract(input: Buffer, _format: string): Promise<PDFExtractResult> {
    // Use dynamic import for pdf-parse
    try {
      const pdfParse = require('pdf-parse');
      const result = await pdfParse(input);
      return {
        text: result.text,
        pages: result.numpages,
        metadata: result.info || {},
      };
    } catch {
      // Fallback: extract text from PDF manually
      const text = input.toString('utf-8')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        .replace(/BT[\s\S]*?ET/g, '')
        .replace(/\/Type\s*\/Page[^s]/g, '\n--- Page ---\n');
      return {
        text: text.slice(0, 50000),
        pages: (input.toString().match(/\/Type\s*\/Page[^s]/g) || []).length,
        metadata: {},
      };
    }
  }
}

// ─── QR Code Generator ─────────────────────────────────────────────

export class QRCodeGenerator implements MediaProvider {
  id = 'qrcode';
  type = 'image' as MediaType;
  extract = undefined;

  async generate(text: string, options: { width?: number } = {}): Promise<MediaResult> {
    // Minimal QR code SVG generation
    const size = options.width || 256;
    const svg = this.generateQRSVG(text, size);
    return {
      data: Buffer.from(svg, 'utf-8'),
      format: 'svg',
      metadata: { content: text, size },
      provider: 'qrcode',
    };
  }

  private generateQRSVG(text: string, size: number): string {
    // Simplified QR representation as SVG placeholder
    const encoded = Buffer.from(text).toString('base64');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="white"/>
  <text x="${size/2}" y="${size/2}" text-anchor="middle" font-size="12" fill="black">QR: ${text.slice(0, 30)}</text>
  <text x="${size/2}" y="${size/2 + 20}" text-anchor="middle" font-size="8" fill="gray">${encoded.slice(0, 40)}</text>
</svg>`;
  }
}

// ─── Audio Transcoder ──────────────────────────────────────────────

export class AudioTranscoder implements MediaProvider {
  id = 'audio-transcoder';
  type = 'audio' as MediaType;
  generate = undefined;

  async extract(input: Buffer, format: string): Promise<{ data: Buffer; format: string; durationMs: number }> {
    const { execSync } = require('child_process');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `mimo-audio-input.${format}`);
    const outputPath = path.join(tmpDir, `mimo-audio-output.mp3`);

    try {
      fs.writeFileSync(inputPath, input);
      execSync(`ffmpeg -i "${inputPath}" -acodec libmp3lame -ab 128k "${outputPath}" -y`, {
        timeout: 60000,
        stdio: 'pipe',
      });
      const output = fs.readFileSync(outputPath);
      return { data: output, format: 'mp3', durationMs: 0 };
    } finally {
      try { fs.unlinkSync(inputPath); } catch {}
      try { fs.unlinkSync(outputPath); } catch {}
    }
  }
}

// ─── Media Processor (orchestrator) ────────────────────────────────

export class MediaProcessor {
  private providers: Map<string, MediaProvider> = new Map();

  registerProvider(provider: MediaProvider): void {
    this.providers.set(provider.id, provider);
    debug('Registered media provider: %s (%s)', provider.id, provider.type);
  }

  async generateImage(prompt: string, options?: ImageOptions): Promise<MediaResult> {
    const provider = this.findProvider('image');
    if (!provider?.generate) throw new Error('No image generation provider available');
    return provider.generate(prompt, options);
  }

  async generateVideo(prompt: string, options?: VideoOptions): Promise<MediaResult> {
    const provider = this.findProvider('video');
    if (!provider?.generate) throw new Error('No video generation provider available');
    return provider.generate(prompt, options);
  }

  async generateMusic(prompt: string, options?: MusicOptions): Promise<MediaResult> {
    const provider = this.findProvider('music');
    if (!provider?.generate) throw new Error('No music generation provider available');
    return provider.generate(prompt, options);
  }

  async extractPDF(input: Buffer): Promise<PDFExtractResult> {
    const provider = this.providers.get('pdf-extractor') || this.findProvider('document');
    if (!provider?.extract) throw new Error('No PDF extraction provider available');
    return provider.extract(input, 'pdf');
  }

  async generateQR(text: string, options?: { width?: number }): Promise<MediaResult> {
    const provider = this.providers.get('qrcode');
    if (!provider?.generate) throw new Error('No QR code provider available');
    return provider.generate(text, options);
  }

  async transcodeAudio(input: Buffer, format: string): Promise<MediaResult> {
    const provider = this.providers.get('audio-transcoder') || this.findProvider('audio');
    if (!provider?.extract) throw new Error('No audio transcoder available');
    const result = await provider.extract(input, format);
    return { ...result, metadata: {}, provider: provider.id };
  }

  listProviders(): Array<{ id: string; type: string }> {
    return Array.from(this.providers.values()).map(p => ({ id: p.id, type: p.type }));
  }

  private findProvider(type: string): MediaProvider | undefined {
    for (const p of this.providers.values()) {
      if (p.type === type) return p;
    }
    return undefined;
  }
}
