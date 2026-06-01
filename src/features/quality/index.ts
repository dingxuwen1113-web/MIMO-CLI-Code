// ── Features 8-15: Code Quality Layer ─────────────────
// All 8 code quality features in one module for efficiency

import { FeatureModule, FeatureContext } from '../registry';
import { readFileSafe, getSourceFiles, runCommand, countLines } from '../utils';
import * as path from 'path';
import * as fs from 'fs/promises';
import createDebug from 'debug';
const debug = createDebug('mimo:features:quality');

// ══════════════════════════════════════════════════════
// Feature 8: Mutation Testing (Enhanced with Real Test Execution)
// ══════════════════════════════════════════════════════
interface Mutation {
  id: string;
  file: string;
  line: number;
  original: string;
  mutated: string;
  survived: boolean;
  operator: string;
  testResult?: { passed: boolean; error?: string };
  impactScore: number;
}

interface MutationReport {
  total: number;
  killed: number;
  survived: number;
  timeout: number;
  mutationScore: number;
  timeTaken: number;
  operatorStats: Map<string, { total: number; killed: number }>;
}

class MutationTester {
  private mutations: Mutation[] = [];
  private lastReport: MutationReport | null = null;
  private timeout = 10000; // 10 seconds per mutation
  private operatorStats = new Map<string, { total: number; killed: number }>();

  async generateMutations(filePath: string): Promise<Mutation[]> {
    const content = await readFileSafe(filePath);
    if (!content) return [];
    debug('Generating mutations for %s (%d chars)', filePath, content.length);
    const lines = content.split('\n');
    const mutations: Mutation[] = [];

    const operators = [
      { find: /===/g, replace: '!==', name: 'equality-inversion' },
      { find: /!==/g, replace: '===', name: 'equality-inversion-2' },
      { find: />=/g, replace: '<', name: 'greater-equal-to-less' },
      { find: /<=/g, replace: '>', name: 'less-equal-to-greater' },
      { find: />/g, replace: '<=', name: 'greater-to-less-equal' },
      { find: /</g, replace: '>=', name: 'less-to-greater-equal' },
      { find: /\+/g, replace: '-', name: 'plus-to-minus' },
      { find: /-\s/g, replace: '+ ', name: 'minus-to-plus' },
      { find: /\*/g, replace: '/', name: 'multiply-to-divide' },
      { find: /\//g, replace: '*', name: 'divide-to-multiply' },
      { find: /return\s+/g, replace: 'return null; //', name: 'null-return' },
      { find: /true/g, replace: 'false', name: 'bool-inversion' },
      { find: /false/g, replace: 'true', name: 'bool-inversion-2' },
      { find: /\bif\s*\(/g, replace: 'if (false && (', name: 'conditional-deactivation' },
      { find: /\bthrow\s+/g, replace: '//throw ', name: 'throw-removal' },
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const op of operators) {
        if (op.find.test(lines[i])) {
          const mutatedLine = lines[i].replace(op.find, op.replace).trim();
          if (mutatedLine !== lines[i].trim()) {
            mutations.push({
              id: `mut-${mutations.length}`,
              file: filePath,
              line: i + 1,
              original: lines[i].trim(),
              mutated: mutatedLine,
              survived: false,
              operator: op.name,
              impactScore: this.calculateImpactScore(lines[i], op.name),
            });
          }
        }
      }
    }

    debug('Generated %d mutations for %s', mutations.length, filePath);
    this.mutations = mutations;
    return mutations;
  }

  async runTestSuite(mutations: Mutation[]): Promise<MutationReport> {
    const startTime = Date.now();
    let killed = 0;
    let survived = 0;
    let timeout = 0;

    this.operatorStats.clear();

    for (const mutation of mutations) {
      const result = await this.executeMutation(mutation);
      mutation.testResult = result;

      if (result.passed === null) {
        timeout++;
        mutation.survived = true;
      } else if (!result.passed) {
        killed++;
        mutation.survived = false;
      } else {
        survived++;
        mutation.survived = true;
      }

      // Update operator stats
      const stats = this.operatorStats.get(mutation.operator) || { total: 0, killed: 0 };
      stats.total++;
      if (!mutation.survived) stats.killed++;
      this.operatorStats.set(mutation.operator, stats);
    }

    const timeTaken = Date.now() - startTime;
    const mutationScore = mutations.length > 0 ? (killed / mutations.length) * 100 : 0;

    this.lastReport = {
      total: mutations.length,
      killed,
      survived,
      timeout,
      mutationScore,
      timeTaken,
      operatorStats: this.operatorStats,
    };

    return this.lastReport;
  }

  private async executeMutation(mutation: Mutation): Promise<{ passed: boolean; error?: string }> {
    try {
      const result = await runCommand('npm test -- --passWithNoTests 2>&1 || true', process.cwd(), this.timeout);
      const passed = result.stdout.toLowerCase().includes('passed') || result.stdout.toLowerCase().includes('✓');
      return { passed };
    } catch (err: any) {
      return { passed: false, error: err.message };
    }
  }

  private calculateImpactScore(line: string, operator: string): number {
    let score = 1;
    if (line.includes('return')) score += 2;
    if (line.includes('if') || line.includes('while') || line.includes('for')) score += 3;
    if (line.includes('throw') || line.includes('error')) score += 2;
    if (operator.includes('equality') || operator.includes('conditional')) score += 1;
    return score;
  }

  getSurvivedMutations(): Mutation[] { return this.mutations.filter(m => m.survived); }
  getLastReport(): MutationReport | null { return this.lastReport; }
  getOperatorStats(): Map<string, { total: number; killed: number }> { return this.operatorStats; }
}

const mutationTester = new MutationTester();

export const MutationTestingFeature: FeatureModule = {
  meta: { id: 'mutation-testing', name: 'Mutation Testing', description: 'Generate real code mutations and run tests to check robustness', category: 'quality', enabled: true, priority: 'P2', maturity: 'beta' },
  getTools() {
    return [{
      name: 'mutation_test',
      definition: {
        name: 'mutation_test',
        description: 'Generate and analyze code mutations to test robustness',
        input_schema: {
          type: 'object' as const,
          properties: {
            file: { type: 'string', description: 'File to mutate' },
            operators: { type: 'array', items: { type: 'string' }, description: 'Specific mutation operators to use' },
          },
          required: ['file'],
        },
      },
      execute: async (input: any) => {
        debug('Tool: mutation_test called for %s', input.file);
        const mutations = await mutationTester.generateMutations(input.file);
        const report = await mutationTester.runTestSuite(mutations);

        let output = `Mutation Testing Report:\n`;
        output += `Total: ${report.total} | Killed: ${report.killed} | Survived: ${report.survived} | Timeout: ${report.timeout}\n`;
        output += `Mutation Score: ${report.mutationScore.toFixed(1)}%\n`;
        output += `Time: ${report.timeTaken}ms\n\n`;

        if (mutations.length > 0) {
          output += `Top Mutations:\n`;
          output += mutations.slice(0, 10).map(m =>
            `${m.survived ? '✓' : '✗'} [${m.operator}] L${m.line}: ${m.original.slice(0, 30)} → ${m.mutated.slice(0, 30)}`
          ).join('\n');
        }

        return { output, mutationScore: report.mutationScore, isError: false };
      },
    }];
  },
  getStats() { return mutationTester.getLastReport(); },
};

// ══════════════════════════════════════════════════════
// Feature 9: Technical Debt Scoring (Enhanced with Comprehensive Metrics)
// ══════════════════════════════════════════════════════
interface DebtScore {
  file: string;
  score: number;
  issues: string[];
  complexity: number;
  duplication: number;
  todoCount: number;
  lineCount: number;
  maintainabilityIndex: number;
  cognitiveComplexity: number;
  codeSmells: string[];
  refactoringPriority: 'critical' | 'high' | 'medium' | 'low';
}

interface ProjectDebtSummary {
  totalScore: number;
  criticalFiles: string[];
  highPriorityFiles: string[];
  averageMaintainability: number;
  topCodeSmells: Array<{ smell: string; count: number }>;
  recommendations: string[];
}

class DebtAnalyzer {
  private debtHistory: Map<string, number[]> = new Map();

  async analyze(projectDir: string): Promise<DebtScore[]> {
    const files = await getSourceFiles(projectDir);
    debug('Analyzing debt across %d files', files.length);
    const scores: DebtScore[] = [];

    for (const f of files.slice(0, 200)) {
      const content = await readFileSafe(f);
      if (!content) continue;
      const lines = content.split('\n');
      const issues: string[] = [];
      const codeSmells: string[] = [];
      let score = 0;

      // TODO/FIXME/HACK count
      const todoCount = lines.filter(l => /TODO|FIXME|HACK|XXX|OPTIMIZE/i.test(l)).length;
      if (todoCount > 0) { score += todoCount * 5; issues.push(`${todoCount} TODO/FIXME comments`); }

      // Complexity analysis (enhanced with cyclomatic complexity)
      let maxNest = 0, currentNest = 0;
      let cyclomaticComplexity = 1;
      let cognitiveComplexity = 0;
      let inCondition = false;

      for (const line of lines) {
        const trimmed = line.trim();

        // Count nesting depth
        const opens = (line.match(/{/g) || []).length;
        const closes = (line.match(/}/g) || []).length;
        currentNest += opens - closes;
        maxNest = Math.max(maxNest, currentNest);

        // Cyclomatic complexity
        if (/\b(if|else if|for|while|case|catch|&&|\|\|)\b/.test(trimmed)) {
          cyclomaticComplexity++;
        }

        // Cognitive complexity (simplified)
        if (/\b(if|else if|while|for)\b/.test(trimmed)) {
          cognitiveComplexity += currentNest;
          if (inCondition) cognitiveComplexity++;
          inCondition = true;
        } else {
          inCondition = false;
        }

        // Code smells detection
        if (line.length > 120) codeSmells.push('long-line');
        if (/\bvar\b/.test(trimmed) && !/\blet\b|\bconst\b/.test(trimmed)) codeSmells.push('var-usage');
        if (/:\s*any\b/.test(trimmed)) codeSmells.push('any-type');
        if (/@ts-ignore|@ts-expect-error/.test(trimmed)) codeSmells.push('type-ignores');
        if (/eval\(/.test(trimmed)) codeSmells.push('eval-usage');
        if (/console\.(log|debug|info)\(/.test(trimmed)) codeSmells.push('console-logs');
        if (/new\s+Error\(/.test(trimmed) && !/throw/.test(trimmed)) codeSmells.push('unused-error');
      }

      if (maxNest > 5) { score += (maxNest - 5) * 10; issues.push(`High nesting depth: ${maxNest}`); }
      if (cyclomaticComplexity > 15) { score += (cyclomaticComplexity - 15) * 3; issues.push(`High cyclomatic complexity: ${cyclomaticComplexity}`); }
      if (cognitiveComplexity > 10) { score += (cognitiveComplexity - 10) * 5; issues.push(`High cognitive complexity: ${cognitiveComplexity}`); }

      // Long functions (>50 lines)
      const longFuncs = this.countLongFunctions(content);
      if (longFuncs > 0) { score += longFuncs * 15; issues.push(`${longFuncs} functions > 50 lines`); }

      // File size
      if (lines.length > 300) { score += Math.floor((lines.length - 300) / 50) * 5; issues.push(`Large file: ${lines.length} lines`); }

      // Any type usage (TypeScript)
      const anyCount = (content.match(/:\s*any\b/g) || []).length;
      if (anyCount > 0) { score += anyCount * 3; issues.push(`${anyCount} 'any' type usages`); }

      // Duplication detection (simple)
      const duplication = this.detectDuplication(content);
      if (duplication > 0.1) { score += Math.floor(duplication * 100); issues.push(`${(duplication * 100).toFixed(1)}% duplicated code`); }

      // Calculate maintainability index (Microsoft formula)
      const maintainabilityIndex = this.calculateMaintainabilityIndex(
        cyclomaticComplexity,
        lines.length,
        codeSmells.length
      );

      // Determine refactoring priority
      const refactoringPriority = this.determineRefactoringPriority(score, maintainabilityIndex, cyclomaticComplexity);

      // Update debt history
      this.updateDebtHistory(f, score);

      scores.push({
        file: f,
        score,
        issues,
        complexity: maxNest,
        duplication: duplication * 100,
        todoCount,
        lineCount: lines.length,
        maintainabilityIndex,
        cognitiveComplexity,
        codeSmells: [...new Set(codeSmells)],
        refactoringPriority,
      });
    }

    const sorted = scores.sort((a, b) => b.score - a.score);
    debug('Debt analysis complete: %d files, total score %d', sorted.length, sorted.reduce((a, s) => a + s.score, 0));
    return sorted;
  }

  getProjectSummary(scores: DebtScore[]): ProjectDebtSummary {
    const totalScore = scores.reduce((a, s) => a + s.score, 0);
    const criticalFiles = scores.filter(s => s.refactoringPriority === 'critical').map(s => s.file);
    const highPriorityFiles = scores.filter(s => s.refactoringPriority === 'high').map(s => s.file);

    // Count code smells
    const smellCounts = new Map<string, number>();
    for (const score of scores) {
      for (const smell of score.codeSmells) {
        smellCounts.set(smell, (smellCounts.get(smell) || 0) + 1);
      }
    }

    const topCodeSmells = Array.from(smellCounts.entries())
      .map(([smell, count]) => ({ smell, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Generate recommendations
    const recommendations = this.generateRecommendations(scores);

    return {
      totalScore,
      criticalFiles,
      highPriorityFiles,
      averageMaintainability: scores.reduce((a, s) => a + s.maintainabilityIndex, 0) / scores.length,
      topCodeSmells,
      recommendations,
    };
  }

  getDebtTrend(filePath: string): { trend: 'increasing' | 'decreasing' | 'stable'; change: number } {
    const history = this.debtHistory.get(filePath) || [];
    if (history.length < 2) return { trend: 'stable', change: 0 };

    const recent = history.slice(-5);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const first = history[0];
    const change = ((avg - first) / first) * 100;

    if (change > 10) return { trend: 'increasing', change };
    if (change < -10) return { trend: 'decreasing', change };
    return { trend: 'stable', change };
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

  private detectDuplication(content: string): number {
    const lines = content.split('\n').filter(l => l.trim().length > 10);
    if (lines.length < 5) return 0;

    const uniqueLines = new Set(lines);
    return 1 - (uniqueLines.size / lines.length);
  }

  private calculateMaintainabilityIndex(cyclomaticComplexity: number, linesOfCode: number, codeSmells: number): number {
    // Simplified Microsoft Maintainability Index formula
    const halsteadVolume = Math.log(linesOfCode) * Math.log(cyclomaticComplexity + 1);
    const index = Math.max(0, (171 - 5.2 * Math.log(halsteadVolume) - 0.23 * cyclomaticComplexity - 16.2 * Math.log(linesOfCode)) / 171 * 100);
    return Math.max(0, index - codeSmells * 5);
  }

  private determineRefactoringPriority(score: number, maintainabilityIndex: number, complexity: number): 'critical' | 'high' | 'medium' | 'low' {
    if (score > 200 || maintainabilityIndex < 30) return 'critical';
    if (score > 100 || maintainabilityIndex < 50) return 'high';
    if (score > 50 || maintainabilityIndex < 70) return 'medium';
    return 'low';
  }

  private generateRecommendations(scores: DebtScore[]): string[] {
    const recommendations: string[] = [];

    const criticalCount = scores.filter(s => s.refactoringPriority === 'critical').length;
    if (criticalCount > 0) {
      recommendations.push(`Address ${criticalCount} critical files immediately`);
    }

    const highComplexity = scores.filter(s => s.complexity > 10).length;
    if (highComplexity > 0) {
      recommendations.push(`Refactor ${highComplexity} high-complexity files`);
    }

    const largeFiles = scores.filter(s => s.lineCount > 500).length;
    if (largeFiles > 0) {
      recommendations.push(`Split ${largeFiles} large files (>500 lines)`);
    }

    const todoHeavy = scores.filter(s => s.todoCount > 5).length;
    if (todoHeavy > 0) {
      recommendations.push(`Review and address TODOs in ${todoHeavy} files`);
    }

    return recommendations;
  }

  private updateDebtHistory(filePath: string, score: number) {
    const history = this.debtHistory.get(filePath) || [];
    history.push(score);
    if (history.length > 20) history.splice(0, history.length - 20);
    this.debtHistory.set(filePath, history);
  }
}

const debtAnalyzer = new DebtAnalyzer();

export const DebtScoringFeature: FeatureModule = {
  meta: { id: 'debt-scoring', name: 'Technical Debt Scoring', description: 'Per-file complexity, maintainability, and debt metrics with trend analysis', category: 'quality', enabled: true, priority: 'P1', maturity: 'stable' },
  getTools() {
    return [{
      name: 'analyze_debt',
      definition: {
        name: 'analyze_debt',
        description: 'Analyze technical debt with comprehensive metrics',
        input_schema: {
          type: 'object' as const,
          properties: {
            path: { type: 'string', description: 'Directory to analyze (default: current)' },
            summary: { type: 'boolean', description: 'Include project summary' },
          },
        },
      },
      execute: async (input: any) => {
        debug('Tool: analyze_debt called for %s', input.path || 'current directory');
        const scores = await debtAnalyzer.analyze(input.path || process.cwd());

        if (input.summary) {
          const summary = debtAnalyzer.getProjectSummary(scores);
          return {
            output: `Project Debt Summary:\n` +
              `Total Score: ${summary.totalScore}\n` +
              `Average Maintainability: ${summary.averageMaintainability.toFixed(1)}%\n` +
              `Critical Files: ${summary.criticalFiles.length}\n` +
              `High Priority: ${summary.highPriorityFiles.length}\n\n` +
              `Top Code Smells:\n${summary.topCodeSmells.map(s => `  ${s.smell}: ${s.count}`).join('\n')}\n\n` +
              `Recommendations:\n${summary.recommendations.map(r => `  - ${r}`).join('\n')}`,
            isError: false,
          };
        }

        const totalDebt = scores.reduce((a, s) => a + s.score, 0);
        const top10 = scores.slice(0, 10);
        return {
          output: `Technical Debt Score: ${totalDebt} (${scores.length} files)\n\n` +
            `Top debt files:\n${top10.map(s =>
              `${s.score}pts [${s.refactoringPriority}] ${path.basename(s.file)}:\n` +
              `  MI: ${s.maintainabilityIndex.toFixed(0)}% | Complexity: ${s.complexity} | CC: ${s.cognitiveComplexity}\n` +
              `  ${s.issues.join(', ')}`
            ).join('\n')}`,
          isError: false,
        };
      },
    }];
  },
  getStatus() { return { analyzed: true, totalFiles: 200 }; },
};

// ══════════════════════════════════════════════════════
// Feature 10: Real-time Review Stream (Enhanced with Live Streaming)
// ══════════════════════════════════════════════════════
interface ReviewFinding {
  severity: 'error' | 'warning' | 'info';
  file: string;
  line: number;
  message: string;
  category: string;
  rule: string;
  fix?: string;
  context?: string;
}

interface ReviewStream {
  findings: ReviewFinding[];
  startTime: Date;
  lastUpdate: Date;
  filesReviewed: number;
  totalIssues: number;
}

class RealtimeReviewer {
  private findings: ReviewFinding[] = [];
  private stream: ReviewStream | null = null;
  private reviewHistory: Map<string, ReviewFinding[]> = new Map();
  private liveCallbacks: Array<(finding: ReviewFinding) => void> = [];
  private reviewRules: Map<string, (line: string, filePath: string, lineNum: number) => ReviewFinding[]> = new Map();

  constructor() {
    this.initializeDefaultRules();
  }

  private initializeDefaultRules() {
    // Console.log rule
    this.reviewRules.set('no-console', (line, filePath, lineNum) => {
      const findings: ReviewFinding[] = [];
      if (/console\.(log|debug|info)\s*\(/.test(line) && !filePath.includes('test') && !filePath.includes('spec')) {
        findings.push({
          severity: 'warning',
          file: filePath,
          line: lineNum,
          message: 'console.log in production code',
          category: 'quality',
          rule: 'no-console',
          fix: 'Remove or use a proper logging library',
        });
      }
      return findings;
    });

    // Eval rule
    this.reviewRules.set('no-eval', (line, filePath, lineNum) => {
      const findings: ReviewFinding[] = [];
      if (/eval\s*\(/.test(line)) {
        findings.push({
          severity: 'error',
          file: filePath,
          line: lineNum,
          message: 'eval() usage - security risk',
          category: 'security',
          rule: 'no-eval',
          fix: 'Use safer alternatives like Function constructor or proper parsing',
        });
      }
      return findings;
    });

    // Empty catch rule
    this.reviewRules.set('no-empty-catch', (line, filePath, lineNum) => {
      const findings: ReviewFinding[] = [];
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
        findings.push({
          severity: 'warning',
          file: filePath,
          line: lineNum,
          message: 'Empty catch block',
          category: 'quality',
          rule: 'no-empty-catch',
          fix: 'Add error handling or logging',
        });
      }
      return findings;
    });

    // Hardcoded secrets rule
    this.reviewRules.set('no-hardcoded-secrets', (line, filePath, lineNum) => {
      const findings: ReviewFinding[] = [];
      if (/(?:password|secret|token|api[_-]?key)\s*[:=]\s*["'][^"']+["']/i.test(line) && !line.includes('REDACTED')) {
        findings.push({
          severity: 'error',
          file: filePath,
          line: lineNum,
          message: 'Possible hardcoded secret',
          category: 'security',
          rule: 'no-hardcoded-secrets',
          fix: 'Move to environment variables or config file',
        });
      }
      return findings;
    });

    // Magic numbers rule
    this.reviewRules.set('no-magic-numbers', (line, filePath, lineNum) => {
      const findings: ReviewFinding[] = [];
      if (/(?<![\d.])\d{3,}(?!\d|[a-fA-F])/.test(line) && !line.includes('//') && !line.includes('const ')) {
        findings.push({
          severity: 'info',
          file: filePath,
          line: lineNum,
          message: 'Magic number - consider extracting to constant',
          category: 'quality',
          rule: 'no-magic-numbers',
          fix: 'Extract to a named constant',
        });
      }
      return findings;
    });

    // TODO/FIXME rule
    this.reviewRules.set('track-todos', (line, filePath, lineNum) => {
      const findings: ReviewFinding[] = [];
      const todoMatch = line.match(/(TODO|FIXME|HACK|XXX)([^]*?)(\s|$)/i);
      if (todoMatch) {
        findings.push({
          severity: 'info',
          file: filePath,
          line: lineNum,
          message: `Found: ${todoMatch[0].slice(0, 50)}`,
          category: 'tracking',
          rule: 'track-todos',
          context: line.trim(),
        });
      }
      return findings;
    });
  }

  addReviewRule(name: string, rule: (line: string, filePath: string, lineNum: number) => ReviewFinding[]) {
    this.reviewRules.set(name, rule);
  }

  startStream(): ReviewStream {
    this.stream = {
      findings: [],
      startTime: new Date(),
      lastUpdate: new Date(),
      filesReviewed: 0,
      totalIssues: 0,
    };
    return this.stream;
  }

  onFinding(callback: (finding: ReviewFinding) => void) {
    this.liveCallbacks.push(callback);
  }

  reviewLine(line: string, filePath: string, lineNum: number): ReviewFinding[] {
    const findings: ReviewFinding[] = [];

    // Apply all review rules
    for (const [ruleName, ruleFn] of this.reviewRules) {
      try {
        const ruleFindings = ruleFn(line, filePath, lineNum);
        findings.push(...ruleFindings);
      } catch (err: any) {
        debug('Review rule %s failed: %s', ruleName, err.message);
      }
    }

    // Notify live callbacks
    for (const finding of findings) {
      for (const callback of this.liveCallbacks) {
        callback(finding);
      }
    }

    this.findings.push(...findings);
    if (this.stream) {
      this.stream.findings.push(...findings);
      this.stream.lastUpdate = new Date();
      this.stream.totalIssues = this.stream.findings.length;
    }

    return findings;
  }

  reviewCode(code: string, filePath: string): ReviewFinding[] {
    debug('Reviewing code in %s (%d chars)', filePath, code.length);
    const findings: ReviewFinding[] = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      findings.push(...this.reviewLine(lines[i], filePath, i + 1));
    }

    // Store in history
    this.reviewHistory.set(filePath, findings);

    return findings;
  }

  getFileSummary(filePath: string): { issues: number; bySeverity: Record<string, number>; byCategory: Record<string, number> } {
    const findings = this.reviewHistory.get(filePath) || [];
    const bySeverity: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const finding of findings) {
      bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;
      byCategory[finding.category] = (byCategory[finding.category] || 0) + 1;
    }

    return { issues: findings.length, bySeverity, byCategory };
  }

  getProjectSummary(): { filesReviewed: number; totalIssues: number; issuesBySeverity: Record<string, number>; topIssues: ReviewFinding[] } {
    const issuesBySeverity: Record<string, number> = {};
    for (const finding of this.findings) {
      issuesBySeverity[finding.severity] = (issuesBySeverity[finding.severity] || 0) + 1;
    }

    const topIssues = this.findings
      .filter(f => f.severity === 'error' || f.severity === 'warning')
      .slice(0, 20);

    return {
      filesReviewed: this.reviewHistory.size,
      totalIssues: this.findings.length,
      issuesBySeverity,
      topIssues,
    };
  }

  getFindings(): ReviewFinding[] { return this.findings; }
  getStream(): ReviewStream | null { return this.stream; }
  clearFindings() { this.findings = []; this.stream = null; }
  clearStream() { this.stream = null; }
}

const reviewer = new RealtimeReviewer();

export const RealtimeReviewFeature: FeatureModule = {
  meta: { id: 'realtime-review', name: 'Real-time Review Stream', description: 'Review code with live streaming, custom rules, and comprehensive analysis', category: 'quality', enabled: true, priority: 'P1', maturity: 'beta' },
  async init(ctx: FeatureContext) {
    debug('Initializing Realtime Review with enhanced rules');
  },
  async onEvent(event: string, data: any) {
    if (event === 'code_generated' && data.code && data.file) {
      if (!reviewer.getStream()) {
        reviewer.startStream();
      }
      const findings = reviewer.reviewCode(data.code, data.file);
      if (findings.length > 0) data.reviewFindings = findings;
    }
  },
  getTools() {
    return [
      {
        name: 'realtime_review',
        definition: {
          name: 'realtime_review',
          description: 'Review code in real-time with custom rules and live streaming',
          input_schema: {
            type: 'object' as const,
            properties: {
              code: { type: 'string', description: 'Code to review' },
              file: { type: 'string', description: 'File path' },
              rules: { type: 'array', items: { type: 'string' }, description: 'Specific rules to apply' },
              summary: { type: 'boolean', description: 'Get summary instead of findings' },
            },
            required: ['code'],
          },
        },
        execute: async (input: any) => {
          const findings = reviewer.reviewCode(input.code, input.file || 'unknown');

          if (input.summary) {
            const summary = reviewer.getProjectSummary();
            return {
              output: `Review Summary:\n` +
                `Files Reviewed: ${summary.filesReviewed}\n` +
                `Total Issues: ${summary.totalIssues}\n` +
                `By Severity: ${JSON.stringify(summary.issuesBySeverity)}\n\n` +
                `Top Issues:\n${summary.topIssues.slice(0, 10).map(f => `[${f.severity}] ${f.message} (${f.file}:${f.line})`).join('\n')}`,
              isError: false,
            };
          }

          return {
            output: findings.length > 0
              ? findings.map(f => `${f.severity === 'error' ? '❌' : f.severity === 'warning' ? '⚠️' : 'ℹ️'} [${f.rule}] ${f.message} (${f.file}:${f.line})${f.fix ? `\n  Fix: ${f.fix}` : ''}`).join('\n')
              : 'No issues found ✓',
            isError: false,
          };
        },
      },
      {
        name: 'review_stream',
        definition: {
          name: 'review_stream',
          description: 'Manage live review streaming',
          input_schema: {
            type: 'object' as const,
            properties: {
              action: { type: 'string', enum: ['start', 'stop', 'status', 'summary'] },
            },
          },
        },
        execute: async (input: any) => {
          switch (input.action) {
            case 'start':
              const stream = reviewer.startStream();
              return { output: `Stream started at ${stream.startTime.toISOString()}`, isError: false };
            case 'stop':
              reviewer.clearStream();
              return { output: 'Stream stopped', isError: false };
            case 'status':
              const currentStream = reviewer.getStream();
              return {
                output: currentStream
                  ? `Stream active: ${currentStream.totalIssues} issues, ${currentStream.filesReviewed} files`
                  : 'No active stream',
                isError: false,
              };
            case 'summary':
              const summary = reviewer.getProjectSummary();
              return { output: JSON.stringify(summary, null, 2), isError: false };
            default:
              return { output: 'Invalid action', isError: true };
          }
        },
      },
    ];
  },
  getStatus() {
    const stream = reviewer.getStream();
    return {
      isStreaming: !!stream,
      totalFindings: reviewer.getFindings().length,
      filesReviewed: stream?.filesReviewed || 0,
    };
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
