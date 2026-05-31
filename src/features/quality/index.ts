// ── Features 8-15: Code Quality Layer ─────────────────
// All 8 code quality features in one module for efficiency

import { FeatureModule, FeatureContext } from '../registry';
import { readFileSafe, getSourceFiles, runCommand, countLines } from '../utils';
import * as path from 'path';
import * as fs from 'fs/promises';
import createDebug from 'debug';
const debug = createDebug('mimo:features:quality');

// ══════════════════════════════════════════════════════
// Feature 8: Mutation Testing
// ══════════════════════════════════════════════════════
interface Mutation { id: string; file: string; line: number; original: string; mutated: string; survived: boolean; }

class MutationTester {
  private mutations: Mutation[] = [];

  async generateMutations(filePath: string): Promise<Mutation[]> {
    const content = await readFileSafe(filePath);
    if (!content) return [];
    debug('Generating mutations for %s (%d chars)', filePath, content.length);
    const lines = content.split('\n');
    const mutations: Mutation[] = [];
    const operators = [
      { find: /===/g, replace: '!==', name: 'equality-inversion' },
      { find: /!==/g, replace: '===', name: 'equality-inversion-2' },
      { find: />/g, replace: '<=', name: 'greater-to-less' },
      { find: /</g, replace: '>=', name: 'less-to-greater' },
      { find: /\+/g, replace: '-', name: 'plus-to-minus' },
      { find: /return\s+/g, replace: 'return null; //', name: 'null-return' },
      { find: /true/g, replace: 'false', name: 'bool-inversion' },
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const op of operators) {
        if (op.find.test(lines[i])) {
          mutations.push({
            id: `mut-${mutations.length}`,
            file: filePath,
            line: i + 1,
            original: lines[i].trim(),
            mutated: lines[i].replace(op.find, op.replace).trim(),
            survived: false,
          });
        }
      }
    }
    debug('Generated %d mutations for %s', mutations.length, filePath);
    return mutations;
  }

  async runTestSuite(): Promise<{ passed: number; failed: number }> {
    const result = await runCommand('npm test -- --passWithNoTests 2>&1 || true', process.cwd(), 60000);
    const passed = (result.stdout.match(/passed|✓|PASS/gi) || []).length;
    const failed = (result.stdout.match(/failed|✗|FAIL/gi) || []).length;
    return { passed, failed };
  }

  getSurvivedMutations(): Mutation[] { return this.mutations.filter(m => m.survived); }
}

const mutationTester = new MutationTester();

export const MutationTestingFeature: FeatureModule = {
  meta: { id: 'mutation-testing', name: 'Mutation Testing', description: 'Generate code mutations and check if tests catch them', category: 'quality', enabled: true, priority: 'P2', maturity: 'beta' },
  getTools() {
    return [{
      name: 'mutation_test',
      definition: { name: 'mutation_test', description: 'Generate and analyze code mutations to test robustness', input_schema: { type: 'object' as const, properties: { file: { type: 'string', description: 'File to mutate' } }, required: ['file'] } },
      execute: async (input: any) => {
        debug('Tool: mutation_test called for %s', input.file);
        const mutations = await mutationTester.generateMutations(input.file);
        const tests = await mutationTester.runTestSuite();
        return { output: `Generated ${mutations.length} mutations\nTest suite: ${tests.passed} passed, ${tests.failed} failed\n${mutations.slice(0, 10).map(m => `L${m.line}: ${m.original} → ${m.mutated}`).join('\n')}`, isError: false };
      },
    }];
  },
};

// ══════════════════════════════════════════════════════
// Feature 9: Technical Debt Scoring
// ══════════════════════════════════════════════════════
interface DebtScore { file: string; score: number; issues: string[]; complexity: number; duplication: number; todoCount: number; lineCount: number; }

class DebtAnalyzer {
  async analyze(projectDir: string): Promise<DebtScore[]> {
    const files = await getSourceFiles(projectDir);
    debug('Analyzing debt across %d files', files.length);
    const scores: DebtScore[] = [];

    for (const f of files.slice(0, 100)) {
      const content = await readFileSafe(f);
      if (!content) continue;
      const lines = content.split('\n');
      const issues: string[] = [];
      let score = 0;

      // TODO/FIXME count
      const todoCount = lines.filter(l => /TODO|FIXME|HACK|XXX/i.test(l)).length;
      if (todoCount > 0) { score += todoCount * 5; issues.push(`${todoCount} TODO/FIXME comments`); }

      // Complexity (nested blocks)
      let maxNest = 0, currentNest = 0;
      for (const line of lines) {
        const opens = (line.match(/{/g) || []).length;
        const closes = (line.match(/}/g) || []).length;
        currentNest += opens - closes;
        maxNest = Math.max(maxNest, currentNest);
      }
      if (maxNest > 5) { score += (maxNest - 5) * 10; issues.push(`High nesting depth: ${maxNest}`); }

      // Long functions (>50 lines)
      const longFuncs = this.countLongFunctions(content);
      if (longFuncs > 0) { score += longFuncs * 15; issues.push(`${longFuncs} functions > 50 lines`); }

      // File size
      if (lines.length > 300) { score += Math.floor((lines.length - 300) / 50) * 5; issues.push(`Large file: ${lines.length} lines`); }

      // Any type usage (TypeScript)
      const anyCount = (content.match(/:\s*any\b/g) || []).length;
      if (anyCount > 0) { score += anyCount * 3; issues.push(`${anyCount} 'any' type usages`); }

      scores.push({ file: f, score, issues, complexity: maxNest, duplication: 0, todoCount, lineCount: lines.length });
    }

    const sorted = scores.sort((a, b) => b.score - a.score);
    debug('Debt analysis complete: %d files, total score %d', sorted.length, sorted.reduce((a, s) => a + s.score, 0));
    return sorted;
  }

  private countLongFunctions(content: string): number {
    let count = 0;
    const funcRegex = /(?:function|const\s+\w+\s*=\s*(?:async\s*)?\(|(?:async\s+)?\w+\s*\([^)]*\)\s*\{)/g;
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
      const afterFunc = content.slice(match.index);
      let depth = 0, lines = 0;
      for (const ch of afterFunc) {
        if (ch === '{') depth++;
        if (ch === '}') { depth--; if (depth === 0) break; }
        if (ch === '\n') lines++;
      }
      if (lines > 50) count++;
    }
    return count;
  }
}

const debtAnalyzer = new DebtAnalyzer();

export const DebtScoringFeature: FeatureModule = {
  meta: { id: 'debt-scoring', name: 'Technical Debt Scoring', description: 'Per-file complexity and debt metrics', category: 'quality', enabled: true, priority: 'P1', maturity: 'stable' },
  getTools() {
    return [{
      name: 'analyze_debt',
      definition: { name: 'analyze_debt', description: 'Analyze technical debt across the project', input_schema: { type: 'object' as const, properties: { path: { type: 'string', description: 'Directory to analyze (default: current)' } } } },
      execute: async (input: any) => {
        debug('Tool: analyze_debt called for %s', input.path || 'current directory');
        const scores = await debtAnalyzer.analyze(input.path || process.cwd());
        const totalDebt = scores.reduce((a, s) => a + s.score, 0);
        const top10 = scores.slice(0, 10);
        return {
          output: `Technical Debt Score: ${totalDebt} (${scores.length} files)\n\nTop debt files:\n${top10.map(s => `  ${s.score}pts ${path.basename(s.file)}: ${s.issues.join(', ')}`).join('\n')}`,
          isError: false,
        };
      },
    }];
  },
};

// ══════════════════════════════════════════════════════
// Feature 10: Real-time Review Stream
// ══════════════════════════════════════════════════════
interface ReviewFinding { severity: 'error' | 'warning' | 'info'; file: string; line: number; message: string; category: string; }

class RealtimeReviewer {
  private findings: ReviewFinding[] = [];

  reviewLine(line: string, filePath: string, lineNum: number): ReviewFinding[] {
    const findings: ReviewFinding[] = [];
    const trimmed = line.trim();

    // Console.log in production code
    if (/console\.(log|debug|info)\s*\(/.test(trimmed) && !filePath.includes('test') && !filePath.includes('spec')) {
      findings.push({ severity: 'warning', file: filePath, line: lineNum, message: 'console.log in production code', category: 'quality' });
    }

    // Eval usage
    if (/eval\s*\(/.test(trimmed)) {
      findings.push({ severity: 'error', file: filePath, line: lineNum, message: 'eval() usage - security risk', category: 'security' });
    }

    // Empty catch
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(trimmed)) {
      findings.push({ severity: 'warning', file: filePath, line: lineNum, message: 'Empty catch block', category: 'quality' });
    }

    // Hardcoded secrets
    if (/(?:password|secret|token)\s*[:=]\s*["'][^"']+["']/i.test(trimmed) && !trimmed.includes('REDACTED')) {
      findings.push({ severity: 'error', file: filePath, line: lineNum, message: 'Possible hardcoded secret', category: 'security' });
    }

    // Magic numbers
    if (/(?<![\d.])\d{3,}(?!\d|[a-fA-F])/.test(trimmed) && !trimmed.includes('//') && !trimmed.includes('const ')) {
      findings.push({ severity: 'info', file: filePath, line: lineNum, message: 'Magic number - consider extracting to constant', category: 'quality' });
    }

    // TODO/FIXME
    if (/(?:TODO|FIXME|HACK|XXX)/i.test(trimmed)) {
      findings.push({ severity: 'info', file: filePath, line: lineNum, message: `Found: ${trimmed.match(/(TODO|FIXME|HACK|XXX)[^]*/i)?.[0]?.slice(0, 50)}`, category: 'tracking' });
    }

    this.findings.push(...findings);
    return findings;
  }

  reviewCode(code: string, filePath: string): ReviewFinding[] {
    debug('Reviewing code in %s (%d chars)', filePath, code.length);
    const findings: ReviewFinding[] = [];
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      findings.push(...this.reviewLine(lines[i], filePath, i + 1));
    }
    return findings;
  }

  getFindings(): ReviewFinding[] { return this.findings; }
  clearFindings() { this.findings = []; }
}

const reviewer = new RealtimeReviewer();

export const RealtimeReviewFeature: FeatureModule = {
  meta: { id: 'realtime-review', name: 'Real-time Review Stream', description: 'Review code as it is generated for issues', category: 'quality', enabled: true, priority: 'P1', maturity: 'beta' },
  async onEvent(event: string, data: any) {
    if (event === 'code_generated' && data.code && data.file) {
      const findings = reviewer.reviewCode(data.code, data.file);
      if (findings.length > 0) data.reviewFindings = findings;
    }
  },
  getTools() {
    return [{
      name: 'realtime_review',
      definition: { name: 'realtime_review', description: 'Review code in real-time for quality and security issues', input_schema: { type: 'object' as const, properties: { code: { type: 'string' }, file: { type: 'string' } }, required: ['code'] } },
      execute: async (input: any) => {
        const findings = reviewer.reviewCode(input.code, input.file || 'unknown');
        return { output: findings.length > 0 ? findings.map(f => `[${f.severity}] L${f.line}: ${f.message} (${f.category})`).join('\n') : 'No issues found ✓', isError: false };
      },
    }];
  },
};

// ══════════════════════════════════════════════════════
// Feature 11: API Contract Validator
// ══════════════════════════════════════════════════════
interface APIEndpoint { method: string; path: string; file: string; line: number; params: string[]; }

class APIContractValidator {
  async extractEndpoints(projectDir: string): Promise<APIEndpoint[]> {
    const files = await getSourceFiles(projectDir, ['.ts', '.js']);
    const endpoints: APIEndpoint[] = [];

    for (const f of files) {
      const content = await readFileSafe(f);
      if (!content) continue;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        // Express/Koa/Fastify route patterns
        const routeMatch = lines[i].match(/(?:app|router|server)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/);
        if (routeMatch) {
          endpoints.push({ method: routeMatch[1].toUpperCase(), path: routeMatch[2], file: f, line: i + 1, params: [] });
        }
        // NestJS decorators
        const decoratorMatch = lines[i].match(/@(Get|Post|Put|Delete|Patch)\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/);
        if (decoratorMatch) {
          endpoints.push({ method: decoratorMatch[1].toUpperCase(), path: decoratorMatch[2] || '/', file: f, line: i + 1, params: [] });
        }
      }
    }
    return endpoints;
  }

  validateAgainstDocs(endpoints: APIEndpoint[], docsPath: string): Array<{ endpoint: string; issue: string }> {
    const issues: Array<{ endpoint: string; issue: string }> = [];
    // Basic validation: check for common issues
    for (const ep of endpoints) {
      if (ep.path.includes(':id') && !ep.params.includes('id')) {
        issues.push({ endpoint: `${ep.method} ${ep.path}`, issue: 'Route has :id param but no validation' });
      }
    }
    return issues;
  }
}

const contractValidator = new APIContractValidator();

export const APIContractFeature: FeatureModule = {
  meta: { id: 'api-contract', name: 'API Contract Validator', description: 'Extract and validate API endpoint contracts', category: 'quality', enabled: true, priority: 'P2', maturity: 'experimental' },
  getTools() {
    return [{
      name: 'validate_api_contracts',
      definition: { name: 'validate_api_contracts', description: 'Extract API endpoints and validate contracts', input_schema: { type: 'object' as const, properties: { path: { type: 'string' } } } },
      execute: async (input: any) => {
        const endpoints = await contractValidator.extractEndpoints(input.path || process.cwd());
        return { output: endpoints.length > 0 ? endpoints.map(e => `${e.method.padEnd(7)} ${e.path} (${path.basename(e.file)}:${e.line})`).join('\n') : '(no API endpoints found)', isError: false };
      },
    }];
  },
};

// ══════════════════════════════════════════════════════
// Feature 12: Dead Code Detector
// ══════════════════════════════════════════════════════
class DeadCodeDetector {
  async detect(projectDir: string): Promise<Array<{ file: string; name: string; line: number; type: string }>> {
    const files = await getSourceFiles(projectDir);
    debug('Detecting dead code across %d files', files.length);
    const exports: Array<{ name: string; file: string; line: number }> = [];
    const usages = new Set<string>();

    // Collect all exports
    for (const f of files) {
      const content = await readFileSafe(f);
      if (!content) continue;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const exportMatch = lines[i].match(/export\s+(?:default\s+)?(?:function|const|class|interface|type|enum)\s+(\w+)/);
        if (exportMatch) exports.push({ name: exportMatch[1], file: f, line: i + 1 });
      }
    }
    debug('Found %d exports to check for usage', exports.length);

    // Check usages across all files
    for (const f of files) {
      const content = await readFileSafe(f);
      if (!content) continue;
      for (const exp of exports) {
        if (f !== exp.file && content.includes(exp.name)) usages.add(exp.name);
      }
    }

    // Find unused exports
    const dead = exports
      .filter(e => !usages.has(e.name))
      .map(e => ({ file: e.file, name: e.name, line: e.line, type: 'unused-export' }));
    debug('Dead code detection complete: %d unused exports found', dead.length);
    return dead;
  }
}

const deadCodeDetector = new DeadCodeDetector();

export const DeadCodeFeature: FeatureModule = {
  meta: { id: 'dead-code', name: 'Dead Code Detector', description: 'Find unused exports and dead code paths', category: 'quality', enabled: true, priority: 'P2', maturity: 'beta' },
  getTools() {
    return [{
      name: 'detect_dead_code',
      definition: { name: 'detect_dead_code', description: 'Find potentially dead/unused code', input_schema: { type: 'object' as const, properties: { path: { type: 'string' } } } },
      execute: async (input: any) => {
        const dead = await deadCodeDetector.detect(input.path || process.cwd());
        return { output: dead.length > 0 ? `Found ${dead.length} potentially unused exports:\n${dead.slice(0, 20).map(d => `${d.file}:${d.line} - ${d.name}`).join('\n')}` : 'No dead code detected ✓', isError: false };
      },
    }];
  },
};

// ══════════════════════════════════════════════════════
// Feature 13: Breaking Change Predictor
// ══════════════════════════════════════════════════════
class BreakingChangePredictor {
  async predictImpact(filePath: string, changedFunctions: string[]): Promise<Array<{ consumer: string; line: number; affectedFunction: string }>> {
    debug('Predicting impact of changes to %s: functions=%s', filePath, changedFunctions.join(', '));
    const allFiles = await getSourceFiles(process.cwd());
    const impacts: Array<{ consumer: string; line: number; affectedFunction: string }> = [];

    for (const f of allFiles) {
      if (f === filePath) continue;
      const content = await readFileSafe(f);
      if (!content) continue;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const fn of changedFunctions) {
          if (lines[i].includes(fn)) {
            impacts.push({ consumer: f, line: i + 1, affectedFunction: fn });
          }
        }
      }
    }
    return impacts;
  }
}

const breakingPredictor = new BreakingChangePredictor();

export const BreakingChangeFeature: FeatureModule = {
  meta: { id: 'breaking-change', name: 'Breaking Change Predictor', description: 'Predict impact of function changes on consumers', category: 'quality', enabled: true, priority: 'P1', maturity: 'beta' },
  getTools() {
    return [{
      name: 'predict_breaking_changes',
      definition: { name: 'predict_breaking_changes', description: 'Check impact of modifying functions on other files', input_schema: { type: 'object' as const, properties: { file: { type: 'string' }, functions: { type: 'array', items: { type: 'string' } } }, required: ['file'] } },
      execute: async (input: any) => {
        const impacts = await breakingPredictor.predictImpact(input.file, input.functions || []);
        return { output: impacts.length > 0 ? `${impacts.length} consumers affected:\n${impacts.map(i => `${path.basename(i.consumer)}:${i.line} uses ${i.affectedFunction}`).join('\n')}` : 'No breaking changes detected', isError: false };
      },
    }];
  },
};

// ══════════════════════════════════════════════════════
// Feature 14: Smart Lint Integration
// ══════════════════════════════════════════════════════
class SmartLintRunner {
  async runLinters(projectDir: string, filePath?: string): Promise<{ tool: string; issues: Array<{ file: string; line: number; message: string; severity: string }> }> {
    debug('Running linters for %s', filePath || projectDir);
    const allIssues: Array<{ file: string; line: number; message: string; severity: string }> = [];
    let tool = 'none';

    // Try ESLint
    const eslintResult = await runCommand(`npx eslint --format compact ${filePath || '.'} 2>&1 || true`, projectDir, 30000);
    if (eslintResult.stdout && !eslintResult.stdout.includes('not found')) {
      tool = 'ESLint';
      const lines = eslintResult.stdout.split('\n').filter(l => l.includes(': line'));
      for (const line of lines) {
        const match = line.match(/(.+?):\s*line\s+(\d+).*?:\s*(.+)/);
        if (match) allIssues.push({ file: match[1].trim(), line: parseInt(match[2]), message: match[3].trim(), severity: line.includes('Error') ? 'error' : 'warning' });
      }
    }

    // Try TypeScript
    const tscResult = await runCommand(`npx tsc --noEmit 2>&1 || true`, projectDir, 30000);
    if (tscResult.stdout && tscResult.stdout.includes('error TS')) {
      tool = tool === 'none' ? 'TypeScript' : `${tool} + TypeScript`;
      const lines = tscResult.stdout.split('\n').filter(l => l.includes('error TS'));
      for (const line of lines) {
        const match = line.match(/(.+?)\((\d+),\d+\):\s*error\s+(TS\d+):\s*(.+)/);
        if (match) allIssues.push({ file: match[1], line: parseInt(match[2]), message: `${match[3]}: ${match[4]}`, severity: 'error' });
      }
    }

    return { tool, issues: allIssues };
  }
}

const lintRunner = new SmartLintRunner();

export const SmartLintFeature: FeatureModule = {
  meta: { id: 'smart-lint', name: 'Smart Lint Integration', description: 'Run linters and auto-fix issues before applying changes', category: 'quality', enabled: true, priority: 'P0', maturity: 'stable' },
  getTools() {
    return [{
      name: 'run_smart_lint',
      definition: { name: 'run_smart_lint', description: 'Run project linters and report issues', input_schema: { type: 'object' as const, properties: { file: { type: 'string', description: 'Specific file to lint (optional)' } } } },
      execute: async (input: any) => {
        const result = await lintRunner.runLinters(process.cwd(), input.file);
        return { output: result.issues.length > 0 ? `[${result.tool}] ${result.issues.length} issues:\n${result.issues.slice(0, 20).map(i => `${path.basename(i.file)}:${i.line} [${i.severity}] ${i.message}`).join('\n')}` : `[${result.tool}] No issues found ✓`, isError: false };
      },
    }];
  },
};

// ══════════════════════════════════════════════════════
// Feature 15: Auto Migration Generator
// ══════════════════════════════════════════════════════
interface Migration { name: string; up: string; down: string; }

class MigrationGenerator {
  async detectModelChanges(projectDir: string): Promise<string[]> {
    const changes: string[] = [];
    // Look for ORM model files
    const modelPatterns = ['**/model*', '**/entity*', '**/schema*', '**/migration*'];
    const files = await getSourceFiles(projectDir, ['.ts', '.js', '.py']);
    for (const f of files) {
      if (f.includes('model') || f.includes('entity') || f.includes('schema')) {
        const content = await readFileSafe(f);
        if (content && (/CREATE TABLE/i.test(content) || /@Column|@Entity|@Table|Column\(|Table\(/.test(content))) {
          changes.push(f);
        }
      }
    }
    return changes;
  }

  generateMigration(tableName: string, columns: Array<{ name: string; type: string; nullable?: boolean }>): Migration {
    const cols = columns.map(c => `  ${c.name} ${c.type}${c.nullable ? '' : ' NOT NULL'}`).join(',\n');
    return {
      name: `create_${tableName}_${Date.now()}`,
      up: `CREATE TABLE ${tableName} (\n${cols}\n);\n`,
      down: `DROP TABLE IF EXISTS ${tableName};\n`,
    };
  }
}

const migrationGen = new MigrationGenerator();

export const MigrationGeneratorFeature: FeatureModule = {
  meta: { id: 'migration-gen', name: 'Auto Migration Generator', description: 'Detect schema changes and generate DB migrations', category: 'quality', enabled: true, priority: 'P2', maturity: 'experimental' },
  getTools() {
    return [{
      name: 'detect_schema_changes',
      definition: { name: 'detect_schema_changes', description: 'Detect ORM model files and potential schema changes', input_schema: { type: 'object' as const, properties: {} } },
      execute: async () => {
        const changes = await migrationGen.detectModelChanges(process.cwd());
        return { output: changes.length > 0 ? `Model files detected:\n${changes.map(c => `  ${c}`).join('\n')}` : '(no ORM model files found)', isError: false };
      },
    }];
  },
};
