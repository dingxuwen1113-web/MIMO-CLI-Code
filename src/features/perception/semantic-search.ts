// ── Feature 4: Semantic Code Search ──────────────────
import { FeatureModule, FeatureContext } from '../registry';
import { getSourceFiles, readFileSafe } from '../utils';
import * as path from 'path';

interface SemanticMatch { file: string; line: number; snippet: string; relevance: number; reason: string; }

class SemanticSearchEngine {
  private projectDir = '';
  private symbolIndex: Map<string, Array<{ file: string; line: number; context: string }>> = new Map();

  async init(projectDir: string) {
    this.projectDir = projectDir;
    await this.buildIndex();
  }

  async buildIndex() {
    const files = await getSourceFiles(this.projectDir);
    for (const f of files.slice(0, 100)) {
      const content = await readFileSafe(f);
      if (!content) continue;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        // Index function/class/const declarations
        const funcs = lines[i].match(/(?:function|class|const|let|var|interface|type|enum|export)\s+(\w+)/g) || [];
        for (const fn of funcs) {
          const name = fn.split(/\s+/).pop() || '';
          if (!this.symbolIndex.has(name)) this.symbolIndex.set(name, []);
          this.symbolIndex.get(name)!.push({ file: f, line: i + 1, context: lines[i].trim() });
        }
        // Index comments (they contain intent)
        if (lines[i].match(/\/\/.*|\/\*|\*|#/)) {
          const words = lines[i].replace(/[^a-zA-Z一-鿿\s]/g, '').split(/\s+/).filter(w => w.length > 2);
          for (const w of words) {
            const key = w.toLowerCase();
            if (!this.symbolIndex.has(key)) this.symbolIndex.set(key, []);
            this.symbolIndex.get(key)!.push({ file: f, line: i + 1, context: lines[i].trim() });
          }
        }
      }
    }
  }

  async search(query: string): Promise<SemanticMatch[]> {
    const results: SemanticMatch[] = [];
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);

    // Intent-based patterns
    const intentPatterns: Record<string, RegExp[]> = {
      'authentication': [/auth/i, /login/i, /session/i, /token/i, /jwt/i, /password/i],
      'error-handling': [/catch/i, /error/i, /exception/i, /throw/i, /reject/i],
      'database': [/query/i, /select/i, /insert/i, /update/i, /delete/i, /model/i, /schema/i],
      'api-endpoint': [/router/i, /endpoint/i, /api/i, /get\s*\(/i, /post\s*\(/i, /put\s*\(/i],
      'configuration': [/config/i, /setting/i, /env/i, /process\.env/i],
      'testing': [/test/i, /describe/i, /expect/i, /assert/i, /mock/i],
      'security': [/encrypt/i, /hash/i, /sanitize/i, /validate/i, /xss/i, /csrf/i, /inject/i],
    };

    // Search by symbol index
    for (const term of queryTerms) {
      for (const [key, entries] of this.symbolIndex) {
        if (key.toLowerCase().includes(term)) {
          for (const e of entries.slice(0, 5)) {
            results.push({ file: e.file, line: e.line, snippet: e.context, relevance: 8, reason: `symbol:${key}` });
          }
        }
      }
    }

    // Search by intent
    for (const [intent, patterns] of Object.entries(intentPatterns)) {
      if (patterns.some(p => p.test(query))) {
        const files = await getSourceFiles(this.projectDir);
        for (const f of files.slice(0, 50)) {
          const content = await readFileSafe(f);
          if (!content) continue;
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (patterns.some(p => p.test(lines[i]))) {
              results.push({ file: f, line: i + 1, snippet: lines[i].trim(), relevance: 7, reason: `intent:${intent}` });
            }
          }
        }
      }
    }

    // Deduplicate and sort
    const seen = new Set<string>();
    return results
      .filter(r => { const key = `${r.file}:${r.line}`; if (seen.has(key)) return false; seen.add(key); return true; })
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 20);
  }
}

const engine = new SemanticSearchEngine();

export const SemanticCodeSearchFeature: FeatureModule = {
  meta: {
    id: 'semantic-code-search',
    name: 'Semantic Code Search',
    description: 'Search code by meaning and intent, not just keywords',
    category: 'perception',
    enabled: true,
    priority: 'P1',
  },
  async init(ctx: FeatureContext) { await engine.init(ctx.projectDir); },
  getTools() {
    return [{
      name: 'semantic_search',
      definition: {
        name: 'semantic_search',
        description: 'Search code by natural language intent (e.g., "find where users are authenticated", "where errors are logged")',
        input_schema: { type: 'object' as const, properties: { query: { type: 'string', description: 'Natural language search query' } }, required: ['query'] },
      },
      execute: async (input: any) => {
        const results = await engine.search(input.query);
        return {
          output: results.length > 0
            ? results.map(r => `${r.file}:${r.line} [${r.reason}] ${r.snippet}`).join('\n')
            : '(no semantic matches)',
          isError: false,
        };
      },
    }];
  },
};
