// ── Shared Utilities for Features ────────────────────

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Token estimation (shared across features)
export function estimateTokens(text: string): number {
  const chinese = (text.match(/[一-鿿]/g) || []).length;
  const other = text.length - chinese;
  return Math.ceil(chinese / 1.5 + other / 4);
}

// Safe JSON parse
export function safeJsonParse<T>(text: string, fallback: T): T {
  try { return JSON.parse(text); } catch { return fallback; }
}

// File hash for change detection
export async function fileHash(filePath: string): Promise<string> {
  const crypto = await import('crypto');
  const content = await fs.readFile(filePath).catch(() => Buffer.from(''));
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 12);
}

// Run shell command safely
export async function runCommand(cmd: string, cwd?: string, timeout = 15000): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: cwd || process.cwd(), timeout, maxBuffer: 5 * 1024 * 1024 });
    return { stdout: String(stdout).trim(), stderr: String(stderr).trim(), code: 0 };
  } catch (err: any) {
    return { stdout: String(err.stdout || '').trim(), stderr: String(err.stderr || '').trim(), code: err.code || 1 };
  }
}

// Read file safely (returns null on error)
export async function readFileSafe(filePath: string): Promise<string | null> {
  try { return await fs.readFile(filePath, 'utf-8'); } catch { return null; }
}

// Get all source files in a directory
export async function getSourceFiles(dir: string, extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs']): Promise<string[]> {
  const results: string[] = [];
  async function walk(d: string) {
    try {
      const entries = await fs.readdir(d, { withFileTypes: true });
      for (const e of entries) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name === 'build') continue;
        const full = path.join(d, e.name);
        if (e.isDirectory()) await walk(full);
        else if (extensions.includes(path.extname(e.name))) results.push(full);
      }
    } catch { /* skip */ }
  }
  await walk(dir);
  return results;
}

// Count lines of code
export function countLines(content: string): { total: number; code: number; comments: number; blank: number } {
  const lines = content.split('\n');
  let code = 0, comments = 0, blank = 0;
  let inBlockComment = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { blank++; continue; }
    if (inBlockComment) { comments++; if (trimmed.includes('*/')) inBlockComment = false; continue; }
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) { comments++; continue; }
    if (trimmed.startsWith('/*')) { comments++; if (!trimmed.includes('*/')) inBlockComment = true; continue; }
    code++;
  }
  return { total: lines.length, code, comments, blank };
}

// Timestamp helpers
export function now_iso(): string { return new Date().toISOString(); }
export function now_date(): string { return new Date().toISOString().split('T')[0]; }

// Debounce
export function debounce<F extends (...args: any[]) => void>(fn: F, ms: number): F {
  let timer: NodeJS.Timeout;
  return ((...args: any[]) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); }) as any;
}

// Deep merge
export function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source || {})) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key] && typeof target[key] === 'object') {
      result[key] = deepMerge(target[key], source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}
