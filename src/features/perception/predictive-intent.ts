// ── Feature 1: Predictive Intent Preloading ──────────
import { FeatureModule, FeatureContext } from '../registry';
import { readFileSafe, getSourceFiles } from '../utils';
import * as path from 'path';
import * as fs from 'fs/promises';
import createDebug from 'debug';
const debug = createDebug('mimo:features:predictive-intent');

interface PredictedFile { path: string; reason: string; score: number; preloaded: boolean; content?: string; }

class PredictiveIntentEngine {
  private history: Array<{ input: string; filesAccessed: string[]; timestamp: number }> = [];
  private patternMap: Map<string, string[]> = new Map();
  private preloadCache: Map<string, string> = new Map();
  private projectDir = '';

  async init(projectDir: string) {
    this.projectDir = projectDir;
    debug('Initializing predictive intent engine for %s', projectDir);
    await this.loadPatterns();
  }

  async predict(input: string): Promise<PredictedFile[]> {
    debug('Predicting intent for input: %s', input.slice(0, 80));
    const predictions: PredictedFile[] = [];
    const lower = input.toLowerCase();

    // Keyword-based predictions
    const keywordMap: Record<string, string[]> = {
      'login|auth|认证|登录': ['auth', 'login', 'session', 'token', 'jwt'],
      'test|测试': ['test', 'spec', '__test__', '__tests__'],
      'bug|fix|error|错误': ['error', 'exception', 'catch', 'throw'],
      'style|css|样式': ['.css', '.scss', '.less', 'styled', 'tailwind'],
      'api|endpoint|接口': ['api', 'route', 'controller', 'endpoint'],
      'database|db|数据库': ['model', 'schema', 'migration', 'entity', 'prisma'],
      'config|配置': ['config', 'setting', '.env', 'environment'],
      'deploy|部署': ['Dockerfile', 'docker-compose', '.github', 'deploy'],
    };

    for (const [pattern, keywords] of Object.entries(keywordMap)) {
      if (new RegExp(pattern, 'i').test(lower)) {
        for (const kw of keywords) {
          const files = await this.findRelevantFiles(kw);
          for (const f of files) {
            predictions.push({ path: f, reason: `keyword:${kw}`, score: 5, preloaded: false });
          }
        }
      }
    }

    // History-based predictions
    for (const entry of this.history.slice(-20)) {
      const similarity = this.stringSimilarity(input, entry.input);
      if (similarity > 0.3) {
        for (const f of entry.filesAccessed) {
          const existing = predictions.find(p => p.path === f);
          if (existing) existing.score += similarity * 10;
          else predictions.push({ path: f, reason: 'history', score: similarity * 10, preloaded: false });
        }
      }
    }

    // Sort by score, deduplicate, limit
    const unique = new Map<string, PredictedFile>();
    for (const p of predictions.sort((a, b) => b.score - a.score)) {
      if (!unique.has(p.path) && unique.size < 10) unique.set(p.path, p);
    }
    const result = Array.from(unique.values());
    debug('Generated %d predictions (raw=%d)', result.length, predictions.length);
    return result;
  }

  async preload(predictions: PredictedFile[]): Promise<void> {
    const preloadable = predictions.filter(p => p.score >= 3 && !p.preloaded);
    debug('Preloading %d high-score predictions', preloadable.length);
    for (const p of preloadable) {
      const content = await readFileSafe(p.path);
      if (content) {
        this.preloadCache.set(p.path, content.slice(0, 5000));
        p.preloaded = true;
        p.content = content.slice(0, 200);
      }
    }
  }

  recordAccess(input: string, files: string[]) {
    debug('Recording access: input=%s, files=%d', input.slice(0, 40), files.length);
    this.history.push({ input, filesAccessed: files, timestamp: Date.now() });
    if (this.history.length > 200) this.history = this.history.slice(-200);
  }

  getCached(path: string): string | undefined { return this.preloadCache.get(path); }

  private async findRelevantFiles(keyword: string): Promise<string[]> {
    const files: string[] = [];
    try {
      const allFiles = await getSourceFiles(this.projectDir);
      for (const f of allFiles) {
        if (f.toLowerCase().includes(keyword.toLowerCase())) files.push(f);
        if (files.length >= 5) break;
      }
    } catch { /* skip */ }
    return files;
  }

  private stringSimilarity(a: string, b: string): number {
    const aWords = new Set(a.toLowerCase().split(/\s+/));
    const bWords = new Set(b.toLowerCase().split(/\s+/));
    let common = 0;
    for (const w of aWords) if (bWords.has(w)) common++;
    return common / Math.max(aWords.size, bWords.size);
  }

  private async loadPatterns() {
    try {
      const raw = await readFileSafe(path.join(this.projectDir, '.mimo', 'patterns.json'));
      if (raw) {
        const data = JSON.parse(raw);
        for (const [k, v] of Object.entries(data)) this.patternMap.set(k, v as string[]);
      }
    } catch { /* no patterns file */ }
  }
}

const engine = new PredictiveIntentEngine();

export const PredictiveIntentFeature: FeatureModule = {
  meta: {
    id: 'predictive-intent',
    name: 'Predictive Intent Preloading',
    description: 'Preload files and context based on partial user input and history patterns',
    category: 'perception',
    enabled: true,
    priority: 'P0',
    maturity: 'stable',
  },
  async init(ctx: FeatureContext) {
    debug('Initializing Predictive Intent feature');
    await engine.init(ctx.projectDir);
  },
  async onEvent(event: string, data: any) {
    debug('Event received: %s', event);
    if (event === 'user_input_changed') await engine.predict(data.input);
    if (event === 'tool_executed' && data.files) engine.recordAccess(data.input || '', data.files);
  },
  getTools() {
    return [{
      name: 'predict_intent',
      definition: {
        name: 'predict_intent',
        description: 'Predict relevant files and context based on user input. Returns preloaded file suggestions.',
        input_schema: { type: 'object' as const, properties: { input: { type: 'string', description: 'User input text' } }, required: ['input'] },
      },
      execute: async (input: any) => {
        const predictions = await engine.predict(input.input);
        await engine.preload(predictions);
        return {
          output: predictions.length > 0
            ? predictions.map(p => `${p.preloaded ? '⚡' : '○'} [${p.score.toFixed(1)}] ${p.path} (${p.reason})`).join('\n')
            : '(no predictions)',
          isError: false,
        };
      },
    }];
  },
  getStatus() { return { historyEntries: (engine as any).history?.length || 0, cachedFiles: (engine as any).preloadCache?.size || 0 }; },
};
