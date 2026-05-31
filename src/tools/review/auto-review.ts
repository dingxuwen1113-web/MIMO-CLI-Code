// ── Auto Code Reviewer ─────────────────────────────────
// Analyzes git diffs and file contents for bugs, security issues,
// performance problems, and style issues using the API client.

import Anthropic from '@anthropic-ai/sdk';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ToolResult } from '../registry';
import { ApiAdapter } from '../../api/types';
import {
  CODE_REVIEW_SYSTEM_PROMPT,
  CROSS_REFERENCE_PROMPT,
  FIX_GENERATION_PROMPT,
} from './prompt';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// ── Types ────────────────────────────────────────────

export interface ReviewFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'bug' | 'security' | 'performance' | 'style';
  file: string;
  line: number;
  description: string;
  suggestion: string;
}

interface ReviewOptions {
  target: string;
  severity: string;
  categories: string[];
  fix: boolean;
  crossReference: boolean;
}

// Severity ordering for filtering and sorting
const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const CATEGORY_MAP: Record<string, string> = {
  bugs: 'bug',
  security: 'security',
  performance: 'performance',
  style: 'style',
};

// ── AutoReviewer Class ───────────────────────────────

export class AutoReviewer {
  private apiClient: ApiAdapter;

  constructor(apiClient: ApiAdapter) {
    this.apiClient = apiClient;
  }

  /**
   * Main entry point: run a code review and return structured findings.
   */
  async review(input: Record<string, any>): Promise<ToolResult> {
    try {
      const options = this.parseOptions(input);

      // Step 1: Gather the diff(s)
      const diffs = await this.gatherDiffs(options);
      if (!diffs || diffs.length === 0) {
        return { output: 'No changes to review. Ensure there are staged or unstaged changes, or provide valid file paths.', isError: false };
      }

      // Step 2: Analyze each diff chunk with the API
      const allFindings: ReviewFinding[] = [];
      for (const diffEntry of diffs) {
        const findings = await this.analyzeDiff(diffEntry, options);
        allFindings.push(...findings);
      }

      // Step 3: Cross-reference analysis (if enabled and multiple files changed)
      if (options.crossReference && diffs.length > 1) {
        const crossFindings = await this.crossReferenceAnalyze(diffs, options);
        allFindings.push(...crossFindings);
      }

      // Step 4: Filter by minimum severity
      const minSev = SEVERITY_ORDER[options.severity] || 1;
      const filteredFindings = allFindings.filter(
        (f) => SEVERITY_ORDER[f.severity] >= minSev
      );

      // Step 5: Filter by categories (if specified)
      const categoryFilters = options.categories.map((c) => CATEGORY_MAP[c] || c);
      const categoryFiltered = categoryFilters.length > 0
        ? filteredFindings.filter((f) => categoryFilters.includes(f.category))
        : filteredFindings;

      // Step 6: Sort by severity (highest first)
      const sortedFindings = categoryFiltered.sort(
        (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]
      );

      // Step 7: Auto-fix (if requested)
      let fixResults: string[] = [];
      if (options.fix && sortedFindings.length > 0) {
        fixResults = await this.applyFixes(sortedFindings);
      }

      // Step 8: Format output
      const output = this.formatFindings(sortedFindings, fixResults);
      return { output, isError: false };
    } catch (err: any) {
      return { output: `Review failed: ${err.message || String(err)}`, isError: true };
    }
  }

  // ── Option Parsing ──────────────────────────────

  private parseOptions(input: Record<string, any>): ReviewOptions {
    return {
      target: input.target || 'staged',
      severity: input.severity || 'low',
      categories: Array.isArray(input.categories) ? input.categories : [],
      fix: !!input.fix,
      crossReference: input.crossReference !== false,
    };
  }

  // ── Diff Gathering ──────────────────────────────

  private async gatherDiffs(options: ReviewOptions): Promise<Array<{ file: string; diff: string }>> {
    const results: Array<{ file: string; diff: string }> = [];

    // If target is a file path (not staged/unstaged/all), read file contents
    if (!['staged', 'unstaged', 'all'].includes(options.target)) {
      const filePaths = options.target.split(',').map((f) => f.trim());
      for (const filePath of filePaths) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const diff = await this.getGitDiffForFile(filePath);
          results.push({
            file: filePath,
            diff: diff || `Full file content:\n${content}`,
          });
        } catch (err: any) {
          results.push({
            file: filePath,
            diff: `Error reading file: ${err.message}`,
          });
        }
      }
      return results;
    }

    // Gather git diffs based on target
    try {
      if (options.target === 'staged' || options.target === 'all') {
        const staged = await this.git('diff --staged --no-color');
        if (staged.stdout) {
          const files = this.splitDiffByFile(staged.stdout);
          results.push(...files);
        }
      }

      if (options.target === 'unstaged' || options.target === 'all') {
        const unstaged = await this.git('diff --no-color');
        if (unstaged.stdout) {
          const files = this.splitDiffByFile(unstaged.stdout);
          results.push(...files);
        }
      }

      // Also check for untracked files
      if (options.target === 'all') {
        const untracked = await this.git('ls-files --others --exclude-standard');
        if (untracked.stdout) {
          const files = untracked.stdout.split('\n').filter(Boolean);
          for (const file of files.slice(0, 20)) { // limit to 20 untracked files
            try {
              const content = await fs.readFile(file, 'utf-8');
              results.push({
                file,
                diff: `New file:\n${content}`,
              });
            } catch { /* skip binary or unreadable files */ }
          }
        }
      }
    } catch (err: any) {
      throw new Error(`Failed to gather diffs: ${err.message}`);
    }

    return results;
  }

  private async getGitDiffForFile(filePath: string): Promise<string | null> {
    try {
      const r = await this.git(`diff --no-color -- "${filePath}"`);
      return r.stdout || null;
    } catch {
      return null;
    }
  }

  /**
   * Split a combined diff output into per-file segments.
   */
  private splitDiffByFile(diffOutput: string): Array<{ file: string; diff: string }> {
    const results: Array<{ file: string; diff: string }> = [];
    const fileHeaderPattern = /^diff --git a\/(.+?) b\/(.+?)$/gm;

    const matches: Array<{ file: string; index: number }> = [];
    let match: RegExpExecArray | null;

    while ((match = fileHeaderPattern.exec(diffOutput)) !== null) {
      matches.push({ file: match[2], index: match.index });
    }

    if (matches.length === 0) {
      // Single file or unrecognized format
      const firstLine = diffOutput.split('\n')[0];
      const fileMatch = firstLine?.match(/(?:b\/|--- )(.+)$/);
      const fileName = fileMatch ? fileMatch[1] : 'unknown';
      results.push({ file: fileName, diff: diffOutput });
      return results;
    }

    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index;
      const end = i + 1 < matches.length ? matches[i + 1].index : diffOutput.length;
      results.push({
        file: matches[i].file,
        diff: diffOutput.slice(start, end),
      });
    }

    return results;
  }

  // ── API Analysis ────────────────────────────────

  private async analyzeDiff(
    diffEntry: { file: string; diff: string },
    options: ReviewOptions
  ): Promise<ReviewFinding[]> {
    // Limit diff size to stay within context window
    const maxDiffSize = 30000;
    const truncatedDiff = diffEntry.diff.length > maxDiffSize
      ? diffEntry.diff.slice(0, maxDiffSize) + '\n... [diff truncated]'
      : diffEntry.diff;

    const userMessage = `Review the following code change for ${diffEntry.file}:\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\``;

    try {
      const response = await this.apiClient.chat(
        [{ role: 'user', content: userMessage }],
        [],
        CODE_REVIEW_SYSTEM_PROMPT,
        { maxTokens: 4096 }
      );

      return this.parseFindings(response, diffEntry.file);
    } catch (err: any) {
      // Return a finding about the analysis failure
      return [{
        severity: 'low',
        category: 'bug',
        file: diffEntry.file,
        line: 0,
        description: `Could not analyze this file: ${err.message}`,
        suggestion: 'Review manually',
      }];
    }
  }

  private async crossReferenceAnalyze(
    diffs: Array<{ file: string; diff: string }>,
    options: ReviewOptions
  ): Promise<ReviewFinding[]> {
    // Combine diffs for cross-reference analysis
    const combined = diffs
      .map((d) => `--- ${d.file} ---\n${d.diff}`)
      .join('\n\n')
      .slice(0, 50000); // limit total size

    const userMessage = `Analyze these ${diffs.length} changed files for cross-reference issues:\n\n${combined}`;

    try {
      const response = await this.apiClient.chat(
        [{ role: 'user', content: userMessage }],
        [],
        CROSS_REFERENCE_PROMPT,
        { maxTokens: 4096 }
      );

      return this.parseFindings(response, '[cross-reference]');
    } catch {
      return [];
    }
  }

  // ── Fix Generation ──────────────────────────────

  private async applyFixes(findings: ReviewFinding[]): Promise<string[]> {
    const results: string[] = [];
    const fixableFindings = findings.filter(
      (f) => SEVERITY_ORDER[f.severity] >= SEVERITY_ORDER['medium']
    );

    for (const finding of fixableFindings.slice(0, 5)) { // max 5 auto-fixes
      try {
        const response = await this.apiClient.chat(
          [{
            role: 'user',
            content: `Generate a fix for this finding:\n\nFile: ${finding.file}\nLine: ${finding.line}\nIssue: ${finding.description}\nSuggestion: ${finding.suggestion}`,
          }],
          [],
          FIX_GENERATION_PROMPT,
          { maxTokens: 2048 }
        );

        const responseText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('');
        const fixData = this.parseJsonFromResponse(responseText);
        if (fixData && fixData.safe !== false && fixData.file && fixData.old_code && fixData.new_code) {
          try {
            const content = await fs.readFile(fixData.file, 'utf-8');
            if (content.includes(fixData.old_code)) {
              const newContent = content.replace(fixData.old_code, fixData.new_code);
              await fs.writeFile(fixData.file, newContent, 'utf-8');
              results.push(`Fixed: ${finding.file}:${finding.line} -- ${finding.description}`);
            } else {
              results.push(`Skipped fix for ${finding.file}:${finding.line} -- code changed since review`);
            }
          } catch (err: any) {
            results.push(`Failed to apply fix for ${finding.file}:${finding.line} -- ${err.message}`);
          }
        } else if (fixData?.safe === false) {
          results.push(`Unsafe to auto-fix: ${finding.file}:${finding.line} -- ${fixData.reason || 'manual review needed'}`);
        }
      } catch {
        results.push(`Could not generate fix for ${finding.file}:${finding.line}`);
      }
    }

    return results;
  }

  // ── Response Parsing ────────────────────────────

  private parseFindings(response: any, defaultFile: string): ReviewFinding[] {
    const text = this.extractTextFromResponse(response);
    const findings = this.parseJsonFromResponse(text);

    if (!Array.isArray(findings)) return [];

    return findings.map((f: any) => ({
      severity: this.validateSeverity(f.severity),
      category: this.validateCategory(f.category),
      file: f.file || defaultFile,
      line: typeof f.line === 'number' ? f.line : 0,
      description: f.description || 'No description',
      suggestion: f.suggestion || 'No suggestion',
    }));
  }

  private extractTextFromResponse(response: any): string {
    if (typeof response === 'string') return response;
    if (response?.content && Array.isArray(response.content)) {
      return response.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
    }
    return '';
  }

  private parseJsonFromResponse(text: string): any {
    // Try to find JSON array or object in the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch { /* try object format */ }
    }
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch { /* give up */ }
    }
    return null;
  }

  private validateSeverity(s: string): ReviewFinding['severity'] {
    if (['critical', 'high', 'medium', 'low'].includes(s)) return s as ReviewFinding['severity'];
    return 'medium';
  }

  private validateCategory(c: string): ReviewFinding['category'] {
    if (['bug', 'security', 'performance', 'style'].includes(c)) return c as ReviewFinding['category'];
    return 'bug';
  }

  // ── Output Formatting ───────────────────────────

  private formatFindings(findings: ReviewFinding[], fixResults: string[]): string {
    if (findings.length === 0) {
      return 'No issues found. The code looks good!';
    }

    const lines: string[] = [];
    lines.push(`Found ${findings.length} issue(s):\n`);

    const severityIcons: Record<string, string> = {
      critical: '[CRITICAL]',
      high: '[HIGH]',
      medium: '[MEDIUM]',
      low: '[LOW]',
    };

    for (const finding of findings) {
      lines.push(`${severityIcons[finding.severity]} [${finding.category}] ${finding.file}:${finding.line}`);
      lines.push(`  ${finding.description}`);
      lines.push(`  Fix: ${finding.suggestion}`);
      lines.push('');
    }

    // Summary
    const bySev: Record<string, number> = {};
    for (const f of findings) {
      bySev[f.severity] = (bySev[f.severity] || 0) + 1;
    }
    const summary = Object.entries(bySev)
      .map(([sev, count]) => `${count} ${sev}`)
      .join(', ');
    lines.push(`Summary: ${summary}`);

    // Fix results
    if (fixResults.length > 0) {
      lines.push('\nAuto-fix results:');
      for (const r of fixResults) {
        lines.push(`  ${r}`);
      }
    }

    return lines.join('\n');
  }

  // ── Git Helper ──────────────────────────────────

  private async git(args: string): Promise<{ stdout: string; stderr: string; code: number }> {
    try {
      const { stdout, stderr } = await execAsync(`git ${args}`, {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024,
        timeout: 15000,
      });
      return { stdout: String(stdout).trim(), stderr: String(stderr).trim(), code: 0 };
    } catch (err: any) {
      return {
        stdout: String(err.stdout || '').trim(),
        stderr: String(err.stderr || '').trim(),
        code: err.code || 1,
      };
    }
  }
}

// ── Tool Execution Entry Point ──────────────────────

let _reviewer: AutoReviewer | null = null;

export function setAutoReviewerApi(apiClient: ApiAdapter): void {
  _reviewer = new AutoReviewer(apiClient);
}

export async function executeAutoReview(input: Record<string, any>): Promise<ToolResult> {
  if (!_reviewer) {
    return { output: 'Auto-review not initialized. API client not available.', isError: true };
  }
  return _reviewer.review(input);
}
