// ── Feature 4: Semantic Code Search ──────────────────
import { FeatureModule, FeatureContext } from '../registry';
import { getSourceFiles, readFileSafe } from '../utils';
import * as path from 'path';
import createDebug from 'debug';
const debug = createDebug('mimo:features:semantic-search');

interface SemanticMatch { file: string; line: number; snippet: string; relevance: number; reason: string; }

interface DocumentVector {
  file: string;
  line: number;
  content: string;
  terms: Map<string, number>; // term -> TF
}

class TFIDFEngine {
  private documentVectors: DocumentVector[] = [];
  private idf: Map<string, number> = new Map();
  private totalDocuments = 0;

  /** Build TF-IDF index from text documents */
  buildIndex(documents: Array<{ file: string; line: number; content: string }>): void {
    debug('Building TF-IDF index from %d documents', documents.length);
    this.documentVectors = [];
    this.totalDocuments = documents.length;
    const docFrequency: Map<string, number> = new Map(); // term -> how many docs contain it

    for (const doc of documents) {
      const terms = this.tokenize(doc.content);
      const termFrequency = new Map<string, number>();
      for (const term of terms) {
        termFrequency.set(term, (termFrequency.get(term) || 0) + 1);
      }
      // Normalize TF by document length
      const maxFreq = Math.max(...termFrequency.values(), 1);
      const normalizedTf = new Map<string, number>();
      for (const [term, freq] of termFrequency) {
        normalizedTf.set(term, 0.5 + 0.5 * (freq / maxFreq));
      }

      this.documentVectors.push({ file: doc.file, line: doc.line, content: doc.content, terms: normalizedTf });

      // Track document frequency
      const uniqueTerms = new Set(terms);
      for (const term of uniqueTerms) {
        docFrequency.set(term, (docFrequency.get(term) || 0) + 1);
      }
    }

    // Compute IDF for all terms
    this.idf = new Map();
    for (const [term, df] of docFrequency) {
      this.idf.set(term, Math.log(this.totalDocuments / (1 + df)));
    }
    debug('TF-IDF index built: %d vectors, %d unique terms', this.documentVectors.length, this.idf.size);
  }

  /** Compute TF-IDF similarity between a query and all documents */
  search(query: string): Array<{ file: string; line: number; content: string; score: number }> {
    const queryTerms = this.tokenize(query);
    const queryTf = new Map<string, number>();
    for (const term of queryTerms) {
      queryTf.set(term, (queryTf.get(term) || 0) + 1);
    }
    const maxFreq = Math.max(...queryTf.values(), 1);
    const queryVector = new Map<string, number>();
    for (const [term, freq] of queryTf) {
      const tf = 0.5 + 0.5 * (freq / maxFreq);
      const idf = this.idf.get(term) || 0;
      queryVector.set(term, tf * idf);
    }

    const results: Array<{ file: string; line: number; content: string; score: number }> = [];
    for (const doc of this.documentVectors) {
      const score = this.cosineSimilarity(queryVector, doc);
      if (score > 0) {
        results.push({ file: doc.file, line: doc.line, content: doc.content, score });
      }
    }
    return results.sort((a, b) => b.score - a.score);
  }

  private cosineSimilarity(queryVector: Map<string, number>, doc: DocumentVector): number {
    let dotProduct = 0;
    let queryMagnitude = 0;
    let docMagnitude = 0;

    for (const [term, queryWeight] of queryVector) {
      const idf = this.idf.get(term) || 0;
      const docWeight = (doc.terms.get(term) || 0) * idf;
      dotProduct += queryWeight * docWeight;
      queryMagnitude += queryWeight * queryWeight;
    }

    for (const [term, tf] of doc.terms) {
      const idf = this.idf.get(term) || 0;
      const weight = tf * idf;
      docMagnitude += weight * weight;
    }

    const magnitude = Math.sqrt(queryMagnitude) * Math.sqrt(docMagnitude);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9_一-鿿]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);
  }
}

class SemanticSearchEngine {
  private projectDir = '';
  private symbolIndex: Map<string, Array<{ file: string; line: number; context: string }>> = new Map();
  private tfidfEngine = new TFIDFEngine();

  async init(projectDir: string) {
    this.projectDir = projectDir;
    await this.buildIndex();
  }

  async buildIndex() {
    debug('Building semantic search index for %s', this.projectDir);
    const files = await getSourceFiles(this.projectDir);
    const documents: Array<{ file: string; line: number; content: string }> = [];

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
        // Add non-empty lines to TF-IDF index
        const trimmed = lines[i].trim();
        if (trimmed.length > 5) {
          documents.push({ file: f, line: i + 1, content: trimmed });
        }
      }
    }

    // Build TF-IDF index from all document lines
    this.tfidfEngine.buildIndex(documents);
    debug('Index built: %d symbols, %d document vectors', this.symbolIndex.size, documents.length);
  }

  async search(query: string): Promise<SemanticMatch[]> {
    debug('Semantic search query: %s', query.slice(0, 80));
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

    // TF-IDF similarity search (boost relevance of semantic matches)
    const tfidfResults = this.tfidfEngine.search(query);
    for (const tr of tfidfResults.slice(0, 30)) {
      const existing = results.find(r => r.file === tr.file && r.line === tr.line);
      if (existing) {
        existing.relevance += tr.score * 5; // boost existing match
      } else {
        results.push({
          file: tr.file,
          line: tr.line,
          snippet: tr.content.slice(0, 120),
          relevance: tr.score * 10,
          reason: `tfidf:${tr.score.toFixed(3)}`,
        });
      }
    }

    // Deduplicate and sort
    const seen = new Set<string>();
    const deduplicated = results
      .filter(r => { const key = `${r.file}:${r.line}`; if (seen.has(key)) return false; seen.add(key); return true; })
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 20);
    debug('Semantic search returned %d results', deduplicated.length);
    return deduplicated;
  }
}

const engine = new SemanticSearchEngine();

export const SemanticCodeSearchFeature: FeatureModule = {
  meta: {
    id: 'semantic-code-search',
    name: 'Semantic Code Search',
    description: 'Search code by meaning and intent, not just keywords. Uses TF-IDF similarity for relevance ranking.',
    category: 'perception',
    enabled: true,
    priority: 'P1',
    maturity: 'beta',
  },
  async init(ctx: FeatureContext) {
    debug('Initializing Semantic Code Search feature');
    await engine.init(ctx.projectDir);
  },
  getTools() {
    return [{
      name: 'semantic_search',
      definition: {
        name: 'semantic_search',
        description: 'Search code by natural language intent (e.g., "find where users are authenticated", "where errors are logged"). Uses TF-IDF similarity for relevance ranking.',
        input_schema: { type: 'object' as const, properties: { query: { type: 'string', description: 'Natural language search query' } }, required: ['query'] },
      },
      execute: async (input: any) => {
        debug('Tool: semantic_search called with query: %s', input.query?.slice(0, 60));
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
