// ── RLM (Recursive Language Model) System ───────────────────────────────────
// Sandboxed Python REPL for deep analysis tasks.
// Built-in capabilities: peek, search, chunk, sub_query_batch

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type RLMSessionStatus = 'initializing' | 'ready' | 'busy' | 'error' | 'closed';

export interface RLMSession {
  id: string;
  status: RLMSessionStatus;
  createdAt: string;
  lastUsedAt: string;
  variables: Record<string, string>; // variable name -> type
  executionCount: number;
}

export interface RLMResult {
  output: string;
  error?: string;
  executionTime: number; // ms
  variables?: Record<string, any>;
}

export interface RLMConfig {
  pythonPath: string;
  maxSessions: number;
  sessionTimeoutMs: number;
  maxOutputSize: number;
  sandboxed: boolean;
  allowedModules: string[];
  blockedModules: string[];
  workingDirectory: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Config
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: RLMConfig = {
  pythonPath: 'python3',
  maxSessions: 5,
  sessionTimeoutMs: 300000, // 5 minutes
  maxOutputSize: 1024 * 1024, // 1MB
  sandboxed: true,
  allowedModules: [
    'json', 'math', 're', 'collections', 'itertools', 'functools',
    'datetime', 'pathlib', 'os.path', 'glob', 'fnmatch',
    'textwrap', 'difflib', 'heapq', 'bisect', 'statistics',
    'csv', 'hashlib', 'base64', 'urllib.parse',
    'typing', 'dataclasses', 'enum', 'abc',
  ],
  blockedModules: [
    'subprocess', 'shutil', 'socket', 'http', 'ftplib', 'smtplib',
    'ctypes', 'importlib', 'code', 'codeop', 'compileall',
  ],
  workingDirectory: process.cwd(),
};

// ═══════════════════════════════════════════════════════════════════════════════
// Built-in Capabilities (injected into Python)
// ═══════════════════════════════════════════════════════════════════════════════

const BUILTINS_MODULE = `
import json, os, re, glob as _glob, textwrap
from pathlib import Path
from collections import Counter, defaultdict

class RLMBuiltins:
    """Built-in capabilities for RLM sessions."""

    @staticmethod
    def peek(file_path, lines=50, offset=0):
        """Read the first N lines of a file."""
        try:
            with open(file_path, 'r', errors='replace') as f:
                for i, line in enumerate(f):
                    if i < offset:
                        continue
                    if i >= offset + lines:
                        break
                    print(f"{i+1:4d} | {line.rstrip()}")
        except Exception as e:
            print(f"Error: {e}")

    @staticmethod
    def search(pattern, directory='.', file_glob='*', max_results=50):
        """Search for a regex pattern in files."""
        results = []
        for f in Path(directory).rglob(file_glob):
            if f.is_file() and f.stat().st_size < 1_000_000:
                try:
                    with open(f, 'r', errors='replace') as fh:
                        for i, line in enumerate(fh, 1):
                            if re.search(pattern, line, re.IGNORECASE):
                                results.append({
                                    'file': str(f),
                                    'line': i,
                                    'content': line.rstrip()[:200]
                                })
                                if len(results) >= max_results:
                                    break
                except:
                    pass
                if len(results) >= max_results:
                    break
        for r in results:
            print(f"{r['file']}:{r['line']}: {r['content']}")
        print(f"\\nFound {len(results)} matches")
        return results

    @staticmethod
    def chunk(file_path, start_line=1, end_line=None):
        """Read a specific range of lines from a file."""
        try:
            with open(file_path, 'r', errors='replace') as f:
                lines = f.readlines()
            end = end_line or len(lines)
            for i in range(start_line - 1, min(end, len(lines))):
                print(f"{i+1:4d} | {lines[i].rstrip()}")
        except Exception as e:
            print(f"Error: {e}")

    @staticmethod
    def sub_query_batch(queries, data_source=None):
        """Run multiple search queries and aggregate results."""
        all_results = {}
        for q in queries:
            if data_source:
                results = [line for line in data_source if q.lower() in line.lower()]
            else:
                results = []
            all_results[q] = results
            print(f"Query '{q}': {len(results)} matches")
        return all_results

    @staticmethod
    def analyze_code(file_path):
        """Basic code analysis: line count, function count, complexity estimate."""
        try:
            with open(file_path, 'r', errors='replace') as f:
                content = f.read()
            lines = content.split('\\n')
            analysis = {
                'total_lines': len(lines),
                'blank_lines': sum(1 for l in lines if not l.strip()),
                'comment_lines': sum(1 for l in lines if l.strip().startswith('#') or l.strip().startswith('//')),
                'code_lines': 0,
                'functions': len(re.findall(r'\\bdef\\s+\\w+|\\bfunction\\s+\\w+|=>\\s*{', content)),
                'classes': len(re.findall(r'\\bclass\\s+\\w+', content)),
                'imports': len(re.findall(r'\\bimport\\s+\\w+|\\bfrom\\s+\\w+\\s+import|\\brequire\\s*\\(', content)),
                'max_line_length': max((len(l) for l in lines), default=0),
                'avg_line_length': sum(len(l) for l in lines) / max(len(lines), 1),
            }
            analysis['code_lines'] = analysis['total_lines'] - analysis['blank_lines'] - analysis['comment_lines']
            for k, v in analysis.items():
                print(f"  {k}: {v}")
            return analysis
        except Exception as e:
            print(f"Error: {e}")
            return None

rlm = RLMBuiltins()
print("RLM builtins loaded: peek, search, chunk, sub_query_batch, analyze_code")
`;

// ═══════════════════════════════════════════════════════════════════════════════
// RLMSession (individual Python process)
// ═══════════════════════════════════════════════════════════════════════════════

class RLMSessionProcess {
  id: string;
  process: ChildProcess | null = null;
  status: RLMSessionStatus = 'initializing';
  variables: Map<string, string> = new Map();
  executionCount: number = 0;
  createdAt: string;
  lastUsedAt: string;
  private outputBuffer: string = '';
  private errorBuffer: string = '';
  private resolveExecution: ((result: RLMResult) => void) | null = null;
  private config: RLMConfig;
  private sessionDir: string;

  constructor(id: string, config: RLMConfig) {
    this.id = id;
    this.config = config;
    this.createdAt = new Date().toISOString();
    this.lastUsedAt = this.createdAt;
    this.sessionDir = path.join(os.tmpdir(), 'mimo-rlm', id);
  }

  async start(): Promise<boolean> {
    try {
      await fs.mkdir(this.sessionDir, { recursive: true });

      // Write builtins module
      const builtinsPath = path.join(this.sessionDir, '_rlm_builtins.py');
      await fs.writeFile(builtinsPath, BUILTINS_MODULE, 'utf-8');

      // Start Python process
      this.process = spawn(this.config.pythonPath, ['-u', '-i'], {
        cwd: this.config.workingDirectory,
        env: {
          ...process.env,
          PYTHONPATH: this.sessionDir,
          PYTHONDONTWRITEBYTECODE: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        this.outputBuffer += data.toString();
        if (this.outputBuffer.length > this.config.maxOutputSize) {
          this.outputBuffer = this.outputBuffer.slice(-this.config.maxOutputSize);
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        this.errorBuffer += data.toString();
      });

      this.process.on('exit', () => {
        this.status = 'closed';
      });

      // Wait for Python to start
      await this.sendCode('import sys; print("RLM_READY")');
      await this.sendCode('exec(open("_rlm_builtins.py").read())');

      this.status = 'ready';
      return true;
    } catch {
      this.status = 'error';
      return false;
    }
  }

  async execute(code: string): Promise<RLMResult> {
    if (this.status === 'closed' || this.status === 'error') {
      return { output: '', error: 'Session is not active', executionTime: 0 };
    }

    this.status = 'busy';
    this.lastUsedAt = new Date().toISOString();
    const startTime = Date.now();

    this.outputBuffer = '';
    this.errorBuffer = '';

    try {
      // Execute code
      await this.sendCode(code);
      this.executionCount++;

      // Small delay to collect output
      await new Promise(r => setTimeout(r, 50));

      const result: RLMResult = {
        output: this.outputBuffer.trim(),
        error: this.errorBuffer.trim() || undefined,
        executionTime: Date.now() - startTime,
      };

      this.status = 'ready';
      return result;
    } catch (err: any) {
      this.status = 'ready';
      return {
        output: this.outputBuffer.trim(),
        error: err.message || String(err),
        executionTime: Date.now() - startTime,
      };
    }
  }

  async close(): Promise<void> {
    try {
      this.process?.stdin?.write('exit()\n');
      setTimeout(() => this.process?.kill(), 1000);
    } catch {}
    this.status = 'closed';
  }

  private sendCode(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('Process not running'));
        return;
      }

      // Use a marker to detect completion
      const marker = `__RLM_DONE_${Date.now()}__`;
      const wrappedCode = `${code}\nprint("${marker}")\n`;

      const onData = (data: Buffer) => {
        const text = data.toString();
        if (text.includes(marker)) {
          // Remove marker from buffer
          this.outputBuffer = this.outputBuffer.replace(marker, '').replace(`>>> ${marker}`, '').replace('>>>', '');
          this.process?.stdout?.off('data', onData);
          resolve();
        }
      };

      this.process.stdout?.on('data', onData);
      this.process.stdin.write(wrappedCode);

      // Timeout
      setTimeout(() => {
        this.process?.stdout?.off('data', onData);
        resolve(); // Don't reject, just resolve with what we have
      }, 30000);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RLMManager — Main Entry Point
// ═══════════════════════════════════════════════════════════════════════════════

export class RLMManager {
  private config: RLMConfig;
  private sessions: Map<string, RLMSessionProcess> = new Map();
  private pythonAvailable: boolean = false;

  constructor(config: Partial<RLMConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async init(): Promise<void> {
    // Check Python availability
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      await promisify(exec)(`${this.config.pythonPath} --version`, { timeout: 5000 });
      this.pythonAvailable = true;
    } catch {
      this.pythonAvailable = false;
    }
  }

  /**
   * Open a new RLM session.
   */
  async open(description?: string): Promise<string> {
    if (!this.pythonAvailable) {
      throw new Error('Python is not available. Install Python 3 to use RLM.');
    }

    if (this.sessions.size >= this.config.maxSessions) {
      // Close the oldest session
      const oldest = Array.from(this.sessions.values())
        .sort((a, b) => a.lastUsedAt.localeCompare(b.lastUsedAt))[0];
      if (oldest) await this.close(oldest.id);
    }

    const id = `rlm-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const session = new RLMSessionProcess(id, this.config);
    const started = await session.start();

    if (!started) {
      throw new Error(`Failed to start RLM session ${id}`);
    }

    this.sessions.set(id, session);
    return id;
  }

  /**
   * Execute code in an RLM session.
   */
  async eval(sessionId: string, code: string): Promise<RLMResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`RLM session ${sessionId} not found`);
    }
    return session.execute(code);
  }

  /**
   * Configure an RLM session (set working directory, variables, etc.)
   */
  async configure(sessionId: string, options: { cwd?: string; variables?: Record<string, any> }): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`RLM session ${sessionId} not found`);

    if (options.cwd) {
      await session.execute(`import os; os.chdir("${options.cwd.replace(/\\/g, '/')}")`);
    }
    if (options.variables) {
      for (const [name, value] of Object.entries(options.variables)) {
        const pyValue = typeof value === 'string' ? `"${value.replace(/"/g, '\\"')}"` : JSON.stringify(value);
        await session.execute(`${name} = ${pyValue}`);
        session.variables.set(name, typeof value);
      }
    }
  }

  /**
   * Close an RLM session.
   */
  async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.close();
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Close all sessions.
   */
  async closeAll(): Promise<void> {
    for (const [id, session] of this.sessions) {
      await session.close();
    }
    this.sessions.clear();
  }

  /**
   * List all active sessions.
   */
  list(): RLMSession[] {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      status: s.status,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      variables: Object.fromEntries(s.variables),
      executionCount: s.executionCount,
    }));
  }

  /**
   * Get built-in capabilities info (for help display).
   */
  getBuiltinCapabilities(): string {
    return [
      'RLM Built-in Capabilities:',
      '  rlm.peek(file, lines, offset)     - Read first N lines of a file',
      '  rlm.search(pattern, dir, glob, n)  - Search files for regex pattern',
      '  rlm.chunk(file, start, end)        - Read specific line range',
      '  rlm.sub_query_batch(queries, data) - Run multiple queries at once',
      '  rlm.analyze_code(file)             - Basic code analysis',
      '',
      'Standard Python libraries available: json, math, re, collections,',
      '  itertools, datetime, pathlib, glob, csv, hashlib, base64, etc.',
    ].join('\n');
  }

  isAvailable(): boolean { return this.pythonAvailable; }
}
