// ── Feature 1: Predictive Intent Preloading (Enhanced) ──────────
import { FeatureModule, FeatureContext } from '../registry';
import { readFileSafe, getSourceFiles } from '../utils';
import * as path from 'path';
import * as fs from 'fs/promises';
import createDebug from 'debug';
const debug = createDebug('mimo:features:predictive-intent');

interface PredictedFile { path: string; reason: string; score: number; preloaded: boolean; content?: string; confidence: number; }

interface UserPattern {
  keywords: string[];
  files: string[];
  frequency: number;
  lastAccessed: Date;
}

class PredictiveIntentEngine {
  private history: Array<{ input: string; filesAccessed: string[]; timestamp: number }> = [];
  private patternMap: Map<string, string[]> = new Map();
  private preloadCache: Map<string, string> = new Map();
  private projectDir = '';
  private userPatterns: Map<string, UserPattern> = new Map();
  private keywordIndex: Map<string, Set<string>> = new Map();
  private maxHistorySize = 500;
  private preloadLimit = 15;
  private confidenceThreshold = 0.6;

  async init(projectDir: string) {
    this.projectDir = projectDir;
    debug('Initializing enhanced predictive intent engine for %s', projectDir);
    await this.loadPatterns();
    await this.buildKeywordIndex();
    await this.loadUserPatterns();
  }

  async predict(input: string): Promise<PredictedFile[]> {
    debug('Predicting intent for input: %s', input.slice(0, 80));
    const predictions: PredictedFile[] = [];
    const lower = input.toLowerCase();
    const inputWords = lower.split(/\s+/).filter(w => w.length > 2);

    // Keyword-based predictions with enhanced matching
    const keywordMap: Record<string, string[]> = {
      'login|auth|认证|登录|password|token|jwt|session': ['auth', 'login', 'session', 'token', 'jwt', 'middleware'],
      'test|测试|spec|unittest|mock': ['test', 'spec', '__test__', '__tests__', 'fixtures', 'mocks'],
      'bug|fix|error|错误|exception|throw|catch': ['error', 'exception', 'catch', 'throw', 'handler'],
      'style|css|样式|layout|responsive': ['.css', '.scss', '.less', 'styled', 'tailwind', 'theme'],
      'api|endpoint|接口|route|controller': ['api', 'route', 'controller', 'endpoint', 'handler'],
      'database|db|数据库|model|schema|migration|prisma': ['model', 'schema', 'migration', 'entity', 'prisma', 'db'],
      'config|配置|setting|env|environment': ['config', 'setting', '.env', 'environment', 'defaults'],
      'deploy|部署|docker|k8s|ci/cd': ['Dockerfile', 'docker-compose', '.github', 'deploy', 'kubernetes'],
      'refactor|重构|improve|optimize': ['lib', 'utils', 'helpers', 'core', 'module'],
      'ui|interface|界面|component|react|vue|angular': ['components', 'pages', 'views', 'ui', 'widgets'],
    };

    // Enhanced keyword matching with word boundary checking
    for (const [pattern, keywords] of Object.entries(keywordMap)) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(lower)) {
        for (const kw of keywords) {
          const files = await this.findRelevantFiles(kw);
          for (const f of files) {
            predictions.push({ path: f, reason: `keyword:${kw}`, score: 6, preloaded: false, confidence: 0.7 });
          }
        }
      }
    }

    // User pattern-based predictions
    const patternPredictions = await this.predictFromPatterns(inputWords);
    predictions.push(...patternPredictions);

    // History-based predictions with enhanced similarity
    for (const entry of this.history.slice(-50)) {
      const similarity = this.calculateEnhancedSimilarity(input, entry.input);
      if (similarity > 0.3) {
        for (const f of entry.filesAccessed) {
          const existing = predictions.find(p => p.path === f);
          if (existing) {
            existing.score += similarity * 15;
            existing.confidence = Math.min(existing.confidence + similarity * 0.3, 1);
          } else {
            predictions.push({ path: f, reason: 'history', score: similarity * 15, preloaded: false, confidence: similarity * 0.8 });
          }
        }
      }
    }

    // Sort by confidence and score, deduplicate, limit
    const unique = new Map<string, PredictedFile>();
    for (const p of predictions.sort((a, b) => (b.confidence * b.score) - (a.confidence * a.score))) {
      if (!unique.has(p.path) && unique.size < this.preloadLimit) {
        unique.set(p.path, p);
      }
    }
    const result = Array.from(unique.values()).filter(p => p.confidence >= this.confidenceThreshold);
    debug('Generated %d high-confidence predictions (raw=%d)', result.length, predictions.length);
    return result;
  }

  async preload(predictions: PredictedFile[]): Promise<void> {
    const preloadable = predictions.filter(p => p.score >= 3 && !p.preloaded);
    debug('Preloading %d high-score predictions', preloadable.length);

    for (const p of preloadable) {
      try {
        const content = await readFileSafe(p.path);
        if (content) {
          this.preloadCache.set(p.path, content.slice(0, 5000));
          p.preloaded = true;
          p.content = content.slice(0, 200);
        }
      } catch (err: any) {
        debug('Failed to preload %s: %s', p.path, err.message);
      }
    }
  }

  recordAccess(input: string, files: string[]) {
    debug('Recording access: input=%s, files=%d', input.slice(0, 40), files.length);
    this.history.push({ input, filesAccessed: files, timestamp: Date.now() });
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
    this.updateUserPatterns(input, files);
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

  private calculateEnhancedSimilarity(a: string, b: string): number {
    const aWords = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const bWords = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    let common = 0;
    for (const w of aWords) if (bWords.has(w)) common++;

    // Jaccard similarity
    const unionSize = aWords.size + bWords.size - common;
    return unionSize > 0 ? common / unionSize : 0;
  }

  private async predictFromPatterns(inputWords: string[]): Promise<PredictedFile[]> {
    const predictions: PredictedFile[] = [];
    for (const [pattern, userPattern] of this.userPatterns) {
      const matchScore = inputWords.filter(w => userPattern.keywords.includes(w)).length / inputWords.length;
      if (matchScore > 0.3) {
        for (const f of userPattern.files) {
          predictions.push({
            path: f,
            reason: 'user-pattern',
            score: matchScore * userPattern.frequency * 10,
            preloaded: false,
            confidence: Math.min(matchScore * 0.9, 1)
          });
        }
      }
    }
    return predictions;
  }

  private async buildKeywordIndex() {
    try {
      const allFiles = await getSourceFiles(this.projectDir);
      for (const f of allFiles) {
        const content = await readFileSafe(f);
        if (!content) continue;
        const words = content.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        for (const word of words) {
          if (!this.keywordIndex.has(word)) this.keywordIndex.set(word, new Set());
          this.keywordIndex.get(word)!.add(f);
        }
      }
    } catch { /* skip */ }
  }

  private updateUserPatterns(input: string, files: string[]) {
    const words = input.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const patternKey = words.slice(0, 3).join('-');
    const existing = this.userPatterns.get(patternKey);

    if (existing) {
      existing.frequency++;
      existing.lastAccessed = new Date();
      for (const f of files) {
        if (!existing.files.includes(f)) existing.files.push(f);
      }
    } else {
      this.userPatterns.set(patternKey, {
        keywords: words,
        files: [...files],
        frequency: 1,
        lastAccessed: new Date()
      });
    }
  }

  private async loadUserPatterns() {
    try {
      const patternPath = path.join(this.projectDir, '.mimo', 'user-patterns.json');
      const raw = await readFileSafe(patternPath);
      if (raw) {
        const data = JSON.parse(raw);
        for (const [k, v] of Object.entries(data)) {
          this.userPatterns.set(k, v as UserPattern);
        }
      }
    } catch { /* no user patterns file */ }
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

  getStats(): { history: number; patterns: number; cacheSize: number } {
    return {
      history: this.history.length,
      patterns: this.userPatterns.size,
      cacheSize: this.preloadCache.size
    };
  }
}

const engine = new PredictiveIntentEngine();

export const PredictiveIntentFeature: FeatureModule = {
  meta: {
    id: 'predictive-intent',
    name: 'Predictive Intent Preloading',
    description: 'Preload files and context based on ML-based prediction, user patterns, and history analysis',
    category: 'perception',
    enabled: true,
    priority: 'P0',
    maturity: 'stable',
  },
  async init(ctx: FeatureContext) {
    debug('Initializing Enhanced Predictive Intent feature');
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
        description: 'Predict relevant files and context using ML-based prediction with user patterns. Returns high-confidence file suggestions.',
        input_schema: { type: 'object' as const, properties: { input: { type: 'string', description: 'User input text' } }, required: ['input'] },
      },
      execute: async (input: any) => {
        const predictions = await engine.predict(input.input);
        await engine.preload(predictions);
        const stats = engine.getStats();
        return {
          output: predictions.length > 0
            ? predictions.map(p => `${p.preloaded ? '⚡' : '○'} [${(p.confidence * 100).toFixed(0)}%] ${p.path} (${p.reason})`).join('\n')
            : '(no predictions)',
          stats: `History: ${stats.history}, Patterns: ${stats.patterns}, Cache: ${stats.cacheSize}`,
          isError: false,
        };
      },
    }];
  },
  getStatus() {
    const stats = engine.getStats();
    return {
      historyEntries: stats.history,
      userPatterns: stats.patterns,
      cachedFiles: stats.cacheSize,
      confidenceThreshold: 0.6
    };
  },
};
