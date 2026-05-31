// ── Feature 2: Code Pattern DNA ──────────────────────
import { FeatureModule, FeatureContext } from '../registry';
import { getSourceFiles, readFileSafe } from '../utils';
import * as path from 'path';

interface ProjectDNA {
  namingStyle: 'camelCase' | 'snake_case' | 'PascalCase' | 'mixed';
  indentStyle: 'tabs' | 'spaces';
  indentSize: number;
  quoteStyle: 'single' | 'double' | 'mixed';
  semicolons: boolean;
  errorHandling: 'try-catch' | 'result-type' | 'mixed';
  importStyle: 'named' | 'default' | 'mixed';
  averageLineLength: number;
  maxFunctionLength: number;
  commentDensity: number;
  typeStrictness: 'strict' | 'moderate' | 'loose';
  patterns: string[];
}

function detectPatterns(content: string): string[] {
  const patterns: string[] = [];
  if (/class\s+\w+[\s\S]*private\s+static\s+instance/.test(content)) patterns.push('Singleton');
  if (/new\s+\w+\([^)]*\)\s*;?\s*$/gm.test(content) && /class\s+\w+/.test(content)) patterns.push('Factory');
  if (/\.on\(|\.emit\(|EventEmitter|addEventListener/.test(content)) patterns.push('EventEmitter');
  if (/app\.use\(|middleware|next\(\)/.test(content)) patterns.push('Middleware chain');
  if (/interface\s+\w+[\s\S]*implements\s+/.test(content)) patterns.push('Interface-based polymorphism');
  if (/extends\s+\w+/.test(content) && /super\(/.test(content)) patterns.push('Class inheritance');
  if (/async\s+\w+[\s\S]*await\s+/.test(content)) patterns.push('Async/await');
  if (/\.map\(|\.filter\(|\.reduce\(|\.forEach\(/.test(content)) patterns.push('Functional iteration');
  if (/export\s+(?:default\s+)?(?:function|class|const)\s+/.test(content)) patterns.push('Module exports');
  if (/new\s+Promise|\.then\(|\.catch\(/.test(content)) patterns.push('Promise-based');
  if (/try\s*\{[\s\S]*catch\s*\(/.test(content)) patterns.push('Try-catch error handling');
  if (/Result<|\.unwrap\(\)|Either</.test(content)) patterns.push('Result-type error handling');
  return [...new Set(patterns)];
}

class CodeDNAnalyzer {
  private dna: ProjectDNA | null = null;
  private analyzed = false;

  async analyze(projectDir: string): Promise<ProjectDNA> {
    if (this.dna && this.analyzed) return this.dna;

    const files = await getSourceFiles(projectDir);
    const samples = files.slice(0, 50);

    let camelCount = 0, snakeCount = 0, pascalCount = 0;
    let tabCount = 0, spaceCount = 0, indentSizes: number[] = [];
    let singleQ = 0, doubleQ = 0;
    let semicolons = 0, noSemicolons = 0;
    let tryCatch = 0, resultType = 0;
    let totalLines = 0, totalCodeLines = 0, totalCommentLines = 0;
    let lineLengths: number[] = [];
    let funcLengths: number[] = [];
    let totalNamedImports = 0, totalDefaultImports = 0, totalRequireImports = 0;
    let totalAnyUsage = 0, totalTsIgnore = 0;
    const allPatterns = new Set<string>();

    for (const filePath of samples) {
      const content = await readFileSafe(filePath);
      if (!content) continue;
      const lines = content.split('\n');
      totalLines += lines.length;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Indent detection
        const indent = line.match(/^(\s+)/)?.[1] || '';
        if (indent.startsWith('\t')) tabCount++;
        else if (indent.startsWith('  ')) { spaceCount++; indentSizes.push(indent.length); }

        // Quote detection
        const singleMatches = (trimmed.match(/(?<!=)'/g) || []).length;
        const doubleMatches = (trimmed.match(/(?<!=)"/g) || []).length;
        singleQ += singleMatches;
        doubleQ += doubleMatches;

        // Semicolons
        if (trimmed.endsWith(';')) semicolons++;
        else if (trimmed.match(/^[a-zA-Z]/)) noSemicolons++;

        // Comment detection
        if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          totalCommentLines++;
        } else {
          totalCodeLines++;
        }

        lineLengths.push(line.length);

        // Naming detection
        const identifiers = trimmed.match(/\b[a-z][a-zA-Z0-9]*\b/g) || [];
        for (const id of identifiers) {
          if (id.includes('_')) snakeCount++;
          else if (id[0] === id[0].toLowerCase()) camelCount++;
        }
        const pascalIds = trimmed.match(/\b[A-Z][a-zA-Z0-9]*\b/g) || [];
        pascalCount += pascalIds.length;

        // Error handling
        if (trimmed.includes('try') || trimmed.includes('catch')) tryCatch++;
        if (trimmed.includes('Result<') || trimmed.includes('.unwrap()')) resultType++;
      }

      // Function length detection — count brace depth to find function boundaries
      let namedImportCount = 0, defaultImportCount = 0, requireCount = 0;
      let anyCount = 0, tsIgnoreCount = 0;
      const lines2 = content.split('\n');
      for (let fi = 0; fi < lines2.length; fi++) {
        const l = lines2[fi];
        // Import style
        if (/^import\s+\{/.test(l)) namedImportCount++;
        else if (/^import\s+\w+/.test(l) && !/^import\s+\{/.test(l) && !/^import\s+\*/.test(l)) defaultImportCount++;
        if (/require\s*\(/.test(l)) requireCount++;
        // Type strictness
        if (/:\s*any\b/.test(l) || /<any>/.test(l) || /as\s+any\b/.test(l)) anyCount++;
        if (/@ts-ignore|@ts-expect-error|@ts-nocheck/.test(l)) tsIgnoreCount++;

        // Function body length measurement
        const funcStartMatch = l.match(/(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\(|(?:async\s+)?(?:\w+\s*)?\w+\s*\([^)]*\)\s*(?::\s*[\w<>\[\]|\s]+)?\s*\{)/);
        if (funcStartMatch) {
          let depth = 0;
          let funcLen = 0;
          for (let j = fi; j < lines2.length; j++) {
            const fl = lines2[j];
            for (const ch of fl) {
              if (ch === '{') depth++;
              if (ch === '}') depth--;
            }
            funcLen++;
            if (depth === 0 && j > fi) break;
          }
          funcLengths.push(funcLen);
        }
      }
      totalNamedImports += namedImportCount;
      totalDefaultImports += defaultImportCount;
      totalRequireImports += requireCount;
      totalAnyUsage += anyCount;
      totalTsIgnore += tsIgnoreCount;
      for (const p of detectPatterns(content)) allPatterns.add(p);
    }

    this.dna = {
      namingStyle: snakeCount > camelCount && snakeCount > pascalCount ? 'snake_case'
        : pascalCount > camelCount ? 'PascalCase'
        : camelCount > snakeCount * 2 ? 'camelCase' : 'mixed',
      indentStyle: tabCount > spaceCount ? 'tabs' : 'spaces',
      indentSize: indentSizes.length > 0 ? Math.round(indentSizes.reduce((a, b) => a + b, 0) / indentSizes.length) : 2,
      quoteStyle: singleQ > doubleQ * 1.5 ? 'single' : doubleQ > singleQ * 1.5 ? 'double' : 'mixed',
      semicolons: semicolons > noSemicolons,
      errorHandling: resultType > tryCatch * 2 ? 'result-type' : tryCatch > resultType * 2 ? 'try-catch' : 'mixed',
      importStyle: totalRequireImports > totalNamedImports && totalRequireImports > totalDefaultImports ? 'default'
        : totalNamedImports > totalDefaultImports * 2 ? 'named'
        : totalDefaultImports > totalNamedImports * 2 ? 'default' : 'mixed',
      averageLineLength: lineLengths.length > 0 ? Math.round(lineLengths.reduce((a, b) => a + b, 0) / lineLengths.length) : 80,
      maxFunctionLength: funcLengths.length > 0 ? Math.max(...funcLengths) : 0,
      commentDensity: totalLines > 0 ? Math.round((totalCommentLines / totalLines) * 100) : 0,
      typeStrictness: totalAnyUsage + totalTsIgnore > totalCodeLines * 0.05 ? 'loose'
        : totalAnyUsage + totalTsIgnore > totalCodeLines * 0.01 ? 'moderate' : 'strict',
      patterns: [...allPatterns],
    };

    this.analyzed = true;
    return this.dna;
  }

  checkConsistency(code: string): Array<{ line: number; issue: string; suggestion: string }> {
    if (!this.dna) return [];
    const issues: Array<{ line: number; issue: string; suggestion: string }> = [];
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check quote style
      if (this.dna.quoteStyle === 'single' && (trimmed.match(/(?<!=)"/g) || []).length > 0) {
        if (!trimmed.includes('`') && !trimmed.includes('\\"')) {
          issues.push({ line: i + 1, issue: '使用了双引号', suggestion: '项目惯例使用单引号' });
        }
      }
      if (this.dna.quoteStyle === 'double' && (trimmed.match(/(?<!=)'/g) || []).length > 0) {
        issues.push({ line: i + 1, issue: '使用了单引号', suggestion: '项目惯例使用双引号' });
      }

      // Check semicolons
      if (this.dna.semicolons && trimmed.match(/^[a-zA-Z]/) && !trimmed.endsWith(';') && !trimmed.endsWith('{') && !trimmed.endsWith('}') && !trimmed.endsWith(',') && !trimmed.startsWith('//') && !trimmed.startsWith('import') && !trimmed.startsWith('export')) {
        issues.push({ line: i + 1, issue: '缺少分号', suggestion: '项目惯例使用分号' });
      }

      // Check line length
      if (line.length > this.dna.averageLineLength * 2) {
        issues.push({ line: i + 1, issue: `行过长 (${line.length} 字符)`, suggestion: '考虑拆分' });
      }
    }
    return issues;
  }

  getDNA(): ProjectDNA | null { return this.dna; }
}

const analyzer = new CodeDNAnalyzer();

export const CodePatternDNAFeature: FeatureModule = {
  meta: {
    id: 'code-pattern-dna',
    name: 'Code Pattern DNA',
    description: 'Analyze project coding conventions and enforce consistency',
    category: 'perception',
    enabled: true,
    priority: 'P0',
  },
  async init(ctx: FeatureContext) { await analyzer.analyze(ctx.projectDir); },
  getTools() {
    return [
      {
        name: 'analyze_dna',
        definition: {
          name: 'analyze_dna',
          description: 'Analyze the project coding conventions (naming, style, patterns)',
          input_schema: { type: 'object' as const, properties: {} },
        },
        execute: async () => {
          const dna = analyzer.getDNA();
          return { output: dna ? JSON.stringify(dna, null, 2) : '(not analyzed)', isError: false };
        },
      },
      {
        name: 'check_code_consistency',
        definition: {
          name: 'check_code_consistency',
          description: 'Check if code follows project conventions',
          input_schema: { type: 'object' as const, properties: { code: { type: 'string', description: 'Code to check' } }, required: ['code'] },
        },
        execute: async (input: any) => {
          const issues = analyzer.checkConsistency(input.code);
          return {
            output: issues.length > 0
              ? issues.map(i => `L${i.line}: ${i.issue} → ${i.suggestion}`).join('\n')
              : '代码符合项目规范 ✓',
            isError: false,
          };
        },
      },
    ];
  },
};
