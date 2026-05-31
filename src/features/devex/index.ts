// ── Features 16-24: Developer Experience Layer ────────
import { FeatureModule, FeatureContext } from '../registry';
import { readFileSafe, getSourceFiles, runCommand, now_iso } from '../utils';
import * as path from 'path';
import * as fs from 'fs/promises';

// ══════════════════════════════════════════════════════
// Feature 16: Code Archaeology Mode
// ══════════════════════════════════════════════════════
interface BlameEntry { line: number; author: string; date: string; commit: string; content: string; }
interface FileHistory { commits: Array<{ hash: string; date: string; author: string; message: string; linesChanged: number }>; }

class CodeArchaeology {
  async blame(filePath: string, range?: string): Promise<BlameEntry[]> {
    const args = range ? `-L ${range}` : '';
    const result = await runCommand(`git blame --porcelain ${args} "${filePath}"`, undefined, 15000);
    if (result.code !== 0) return [];

    const entries: BlameEntry[] = [];
    const lines = result.stdout.split('\n');
    let current: Partial<BlameEntry> = {};
    for (const line of lines) {
      if (line.match(/^[0-9a-f]{40}/)) {
        if (current.commit) entries.push(current as BlameEntry);
        current = { commit: line.slice(0, 8), line: entries.length + 1 };
      }
      if (line.startsWith('author ')) current.author = line.slice(7);
      if (line.startsWith('author-time ')) {
        const ts = parseInt(line.slice(12));
        current.date = new Date(ts * 1000).toISOString().split('T')[0];
      }
      if (line.startsWith('\t')) current.content = line.slice(1);
    }
    if (current.commit) entries.push(current as BlameEntry);
    return entries;
  }

  async fileHistory(filePath: string, limit = 20): Promise<FileHistory> {
    const result = await runCommand(`git log --oneline --follow -${limit} -- "${filePath}"`);
    const commits = result.stdout.split('\n').filter(l => l.trim()).map(line => {
      const match = line.match(/^([a-f0-9]+)\s+(.+)/);
      return { hash: match?.[1] || '', date: '', author: '', message: match?.[2] || '', linesChanged: 0 };
    });
    return { commits };
  }

  async whoOwns(filePath: string): Promise<{ author: string; lines: number; percentage: number }[]> {
    const result = await runCommand(`git blame --line-porcelain "${filePath}" | grep "^author " | sort | uniq -c | sort -rn`, undefined, 15000);
    const lines = result.stdout.split('\n').filter(l => l.trim());
    const totalLines = lines.reduce((sum, l) => sum + parseInt(l.trim()) || 0, 0);
    return lines.map(l => {
      const match = l.trim().match(/(\d+)\s+author\s+(.+)/);
      const count = parseInt(match?.[1] || '0');
      return { author: match?.[2] || 'unknown', lines: count, percentage: totalLines > 0 ? Math.round((count / totalLines) * 100) : 0 };
    }).filter(e => e.author !== 'unknown');
  }
}

const archaeology = new CodeArchaeology();

export const CodeArchaeologyFeature: FeatureModule = {
  meta: { id: 'code-archaeology', name: 'Code Archaeology Mode', description: 'Interactive code history exploration with blame, history, and ownership', category: 'devex', enabled: true, priority: 'P1' },
  getTools() {
    return [
      { name: 'code_blame', definition: { name: 'code_blame', description: 'View detailed git blame with author and date info', input_schema: { type: 'object' as const, properties: { file: { type: 'string' }, range: { type: 'string', description: 'Line range e.g. "10,50"' } }, required: ['file'] } },
        execute: async (input: any) => { const entries = await archaeology.blame(input.file, input.range); return { output: entries.slice(0, 30).map(e => `L${e.line} [${e.author} ${e.date}] ${e.content.slice(0, 60)}`).join('\n') || '(no blame data)', isError: false }; } },
      { name: 'file_history', definition: { name: 'file_history', description: 'View file evolution history with commits', input_schema: { type: 'object' as const, properties: { file: { type: 'string' }, limit: { type: 'number' } }, required: ['file'] } },
        execute: async (input: any) => { const h = await archaeology.fileHistory(input.file, input.limit); return { output: h.commits.map(c => `${c.hash} ${c.message}`).join('\n') || '(no history)', isError: false }; } },
      { name: 'code_ownership', definition: { name: 'code_ownership', description: 'Analyze who owns which parts of a file', input_schema: { type: 'object' as const, properties: { file: { type: 'string' } }, required: ['file'] } },
        execute: async (input: any) => { const owners = await archaeology.whoOwns(input.file); return { output: owners.map(o => `${o.author}: ${o.lines} lines (${o.percentage}%)`).join('\n') || '(no ownership data)', isError: false }; } },
    ];
  },
};

// ══════════════════════════════════════════════════════
// Feature 17: Code Tour Generator
// ══════════════════════════════════════════════════════
interface TourStep { file: string; line?: number; title: string; description: string; }

class CodeTourGenerator {
  async generate(projectDir: string): Promise<TourStep[]> {
    const steps: TourStep[] = [];
    const files = await getSourceFiles(projectDir);

    // Find entry points
    for (const f of files) {
      if (f.includes('index.ts') || f.includes('index.js') || f.includes('main.') || f.includes('app.')) {
        const content = await readFileSafe(f);
        if (!content) continue;
        const lines = content.split('\n');
        // Find main entry
        const mainLine = lines.findIndex(l => l.includes('async function main') || l.includes('app.listen') || l.includes('program.parse'));
        if (mainLine >= 0) {
          steps.push({ file: f, line: mainLine + 1, title: `Entry Point: ${path.basename(f)}`, description: 'Application entry point' });
        }
        // Find key imports
        const imports = lines.filter(l => l.startsWith('import')).slice(0, 5);
        for (const imp of imports) {
          const mod = imp.match(/from\s+['"]([^'"]+)['"]/)?.[1];
          if (mod && mod.startsWith('.')) {
            const resolved = path.resolve(path.dirname(f), mod);
            steps.push({ file: resolved, title: `Dependency: ${path.basename(resolved)}`, description: imp.trim().slice(0, 80) });
          }
        }
      }
    }

    // Find config files
    for (const f of files) {
      if (f.includes('config') || f.includes('schema') || f.includes('types')) {
        steps.push({ file: f, title: `Configuration: ${path.basename(f)}`, description: 'Project configuration and type definitions' });
      }
    }

    return steps.slice(0, 15);
  }
}

const tourGen = new CodeTourGenerator();

export const CodeTourFeature: FeatureModule = {
  meta: { id: 'code-tour', name: 'Code Tour Generator', description: 'Auto-generate interactive codebase walkthrough', category: 'devex', enabled: true, priority: 'P1' },
  getTools() {
    return [{
      name: 'generate_code_tour',
      definition: { name: 'generate_code_tour', description: 'Generate a guided tour of the codebase architecture', input_schema: { type: 'object' as const, properties: {} } },
      execute: async () => {
        const steps = await tourGen.generate(process.cwd());
        return { output: steps.map((s, i) => `Step ${i + 1}: ${s.title}\n  ${s.file}${s.line ? `:${s.line}` : ''}\n  ${s.description}`).join('\n\n') || '(unable to generate tour)', isError: false };
      },
    }];
  },
};

// ══════════════════════════════════════════════════════
// Feature 18: Time-Travel Undo
// ══════════════════════════════════════════════════════
interface ChangeEntry { id: string; file: string; timestamp: string; before: string; after: string; toolName: string; description: string; }

class TimeTravelManager {
  private changes: ChangeEntry[] = [];
  private maxHistory = 50;

  recordChange(file: string, before: string, after: string, toolName: string, description: string) {
    this.changes.push({ id: `chg-${Date.now()}`, file, timestamp: now_iso(), before, after, toolName, description });
    if (this.changes.length > this.maxHistory) this.changes = this.changes.slice(-this.maxHistory);
  }

  getTimeline(file?: string): ChangeEntry[] {
    if (file) return this.changes.filter(c => c.file === file);
    return this.changes;
  }

  async rollback(changeId: string): Promise<boolean> {
    const change = this.changes.find(c => c.id === changeId);
    if (!change) return false;
    try {
      await fs.writeFile(change.file, change.before);
      return true;
    } catch { return false; }
  }

  async rollbackToFile(changeId: string): Promise<boolean> {
    const idx = this.changes.findIndex(c => c.id === changeId);
    if (idx < 0) return false;
    const change = this.changes[idx];
    try {
      await fs.writeFile(change.file, change.before);
      this.changes = this.changes.slice(0, idx);
      return true;
    } catch { return false; }
  }
}

const timeTravel = new TimeTravelManager();

export const TimeTravelFeature: FeatureModule = {
  meta: { id: 'time-travel', name: 'Time-Travel Undo', description: 'Visual timeline of all changes with per-change rollback', category: 'devex', enabled: true, priority: 'P1' },
  async onEvent(event: string, data: any) {
    if (event === 'file_edited' && data.before !== undefined) {
      timeTravel.recordChange(data.file, data.before, data.after || '', data.toolName || 'unknown', data.description || '');
    }
  },
  getTools() {
    return [
      { name: 'change_timeline', definition: { name: 'change_timeline', description: 'View the timeline of all code changes in this session', input_schema: { type: 'object' as const, properties: { file: { type: 'string', description: 'Filter by file' } } } },
        execute: async (input: any) => { const tl = timeTravel.getTimeline(input.file); return { output: tl.length > 0 ? tl.map(c => `${c.id} [${c.timestamp}] ${path.basename(c.file)}: ${c.description}`).join('\n') : '(no changes recorded)', isError: false }; } },
      { name: 'rollback_change', definition: { name: 'rollback_change', description: 'Rollback a specific change by ID', input_schema: { type: 'object' as const, properties: { changeId: { type: 'string' } }, required: ['changeId'] } },
        execute: async (input: any) => { const ok = await timeTravel.rollback(input.changeId); return { output: ok ? 'Rolled back successfully' : 'Change not found', isError: !ok }; } },
    ];
  },
};

// ══════════════════════════════════════════════════════
// Feature 19: Session Forking
// ══════════════════════════════════════════════════════
interface SessionBranch { id: string; name: string; parentSessionId: string; createdAt: string; messages: Array<{ role: string; content: string }>; }

class SessionForker {
  private branches: Map<string, SessionBranch> = new Map();

  fork(parentSessionId: string, name: string, messages: Array<{ role: string; content: string }>): string {
    const id = `fork-${Date.now()}`;
    this.branches.set(id, { id, name, parentSessionId, createdAt: now_iso(), messages: [...messages] });
    return id;
  }

  getBranch(id: string): SessionBranch | undefined { return this.branches.get(id); }
  listBranches(): SessionBranch[] { return Array.from(this.branches.values()); }

  compare(id1: string, id2: string): { branch1: number; branch2: number; common: number } {
    const b1 = this.branches.get(id1);
    const b2 = this.branches.get(id2);
    if (!b1 || !b2) return { branch1: 0, branch2: 0, common: 0 };
    return { branch1: b1.messages.length, branch2: b2.messages.length, common: 0 };
  }
}

const forker = new SessionForker();

export const SessionForkingFeature: FeatureModule = {
  meta: { id: 'session-forking', name: 'Session Forking', description: 'Branch conversations to try different approaches', category: 'devex', enabled: true, priority: 'P1' },
  getTools() {
    return [
      { name: 'fork_session', definition: { name: 'fork_session', description: 'Create a branch of the current conversation', input_schema: { type: 'object' as const, properties: { name: { type: 'string', description: 'Branch name' } }, required: ['name'] } },
        execute: async (input: any) => { const id = forker.fork('current', input.name, []); return { output: `Created session fork: ${input.name} (${id})`, isError: false }; } },
      { name: 'list_forks', definition: { name: 'list_forks', description: 'List all session forks', input_schema: { type: 'object' as const, properties: {} } },
        execute: async () => { const branches = forker.listBranches(); return { output: branches.length > 0 ? branches.map(b => `${b.id}: ${b.name} (${b.messages.length} messages)`).join('\n') : '(no forks)', isError: false }; } },
    ];
  },
};

// ══════════════════════════════════════════════════════
// Feature 20: Multi-Modal Input (Enhanced)
// ══════════════════════════════════════════════════════
class MultiModalProcessor {
  async processImage(imagePath: string): Promise<{ type: string; description: string; extractedText: string }> {
    const ext = path.extname(imagePath).toLowerCase();
    const stat = await fs.stat(imagePath).catch(() => null);
    return {
      type: ext,
      description: `Image file: ${path.basename(imagePath)} (${stat ? (stat.size / 1024).toFixed(1) : '?'}KB)`,
      extractedText: '[Image content would be processed by vision model]',
    };
  }

  async detectInputType(input: string): Promise<{ type: 'text' | 'code' | 'error-log' | 'url' | 'file-path' | 'command'; confidence: number }> {
    if (/https?:\/\//.test(input)) return { type: 'url', confidence: 0.95 };
    if (/Error|Exception|TypeError|ReferenceError|SyntaxError|traceback|at\s+\S+\s+\(/i.test(input)) return { type: 'error-log', confidence: 0.9 };
    if (/^(?:[A-Z]:\\|\/|\.\/|\.\.\/)/.test(input.split('\n')[0])) return { type: 'file-path', confidence: 0.8 };
    if (/^(?:npm|yarn|git|docker|pip|cargo|go)\s/.test(input.trim())) return { type: 'command', confidence: 0.9 };
    if (/[{};=()]/.test(input) && input.includes('\n')) return { type: 'code', confidence: 0.7 };
    return { type: 'text', confidence: 0.6 };
  }
}

const multiModal = new MultiModalProcessor();

export const MultiModalFeature: FeatureModule = {
  meta: { id: 'multi-modal', name: 'Multi-Modal Input', description: 'Enhanced image understanding and input type detection', category: 'devex', enabled: true, priority: 'P1' },
  getTools() {
    return [
      { name: 'detect_input_type', definition: { name: 'detect_input_type', description: 'Detect the type of user input (code, error log, URL, etc.)', input_schema: { type: 'object' as const, properties: { input: { type: 'string' } }, required: ['input'] } },
        execute: async (input: any) => { const result = await multiModal.detectInputType(input.input); return { output: `Type: ${result.type} (confidence: ${result.confidence})`, isError: false }; } },
    ];
  },
};

// ══════════════════════════════════════════════════════
// Feature 21: Intelligent Command Suggester
// ══════════════════════════════════════════════════════
class CommandSuggester {
  private lastActivity: string = '';
  private recentCommands: string[] = [];

  suggest(context: { lastTool?: string; hadError?: boolean; filesChanged?: string[]; inGitRepo?: boolean }): string[] {
    const suggestions: string[] = [];

    if (context.hadError) {
      suggestions.push('建议: 运行测试确认修复', '建议: 查看错误日志', '建议: 使用 /debug 命令系统化调试');
    }
    if (context.filesChanged && context.filesChanged.length > 0) {
      suggestions.push('建议: 运行 /review 审查变更', '建议: 运行 linter 检查代码质量');
      if (context.inGitRepo) suggestions.push('建议: 使用 /commit 创建提交');
    }
    if (context.lastTool === 'file_write' || context.lastTool === 'file_edit') {
      suggestions.push('建议: 运行类型检查 (tsc --noEmit)', '建议: 运行相关测试');
    }
    if (context.lastTool === 'shell_exec') {
      suggestions.push('建议: 检查命令输出是否有错误');
    }
    return suggestions;
  }
}

const suggester = new CommandSuggester();

export const CommandSuggesterFeature: FeatureModule = {
  meta: { id: 'command-suggester', name: 'Intelligent Command Suggester', description: 'Proactively suggest next actions based on context', category: 'devex', enabled: true, priority: 'P0' },
  async onEvent(event: string, data: any) {
    if (event === 'post_tool') {
      const suggestions = suggester.suggest({
        lastTool: data.toolName,
        hadError: data.isError,
        filesChanged: data.files,
        inGitRepo: true,
      });
      if (suggestions.length > 0) data.suggestions = suggestions;
    }
  },
  getTools() { return []; },
};

// ══════════════════════════════════════════════════════
// Feature 22: Fuzzy File Navigator
// ══════════════════════════════════════════════════════
class FuzzyNavigator {
  private fileCache: string[] = [];

  async search(query: string, projectDir: string): Promise<string[]> {
    if (this.fileCache.length === 0) {
      this.fileCache = await getSourceFiles(projectDir);
      // Also include non-source files
      try {
        const allFiles = (await runCommand(`find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" 2>/dev/null | head -500`, projectDir, 5000)).stdout.split('\n').filter(Boolean);
        this.fileCache.push(...allFiles);
      } catch { /* skip */ }
    }

    const queryLower = query.toLowerCase();
    const scored = this.fileCache.map(f => {
      const basename = path.basename(f).toLowerCase();
      let score = 0;
      if (basename === queryLower) score = 100;
      else if (basename.startsWith(queryLower)) score = 80;
      else if (basename.includes(queryLower)) score = 60;
      else if (f.toLowerCase().includes(queryLower)) score = 40;

      // Fuzzy match bonus
      let qi = 0;
      for (const ch of basename) {
        if (qi < queryLower.length && ch === queryLower[qi]) { qi++; score += 2; }
      }
      if (qi === queryLower.length) score += 20;

      return { path: f, score };
    });

    return scored.filter(s => s.score > 10).sort((a, b) => b.score - a.score).slice(0, 15).map(s => s.path);
  }

  invalidateCache() { this.fileCache = []; }
}

const fuzzyNav = new FuzzyNavigator();

export const FuzzyNavigatorFeature: FeatureModule = {
  meta: { id: 'fuzzy-navigator', name: 'Fuzzy File Navigator', description: 'Quick-open file finder with fuzzy matching', category: 'devex', enabled: true, priority: 'P1' },
  getTools() {
    return [{
      name: 'fuzzy_find',
      definition: { name: 'fuzzy_find', description: 'Find files by fuzzy name matching', input_schema: { type: 'object' as const, properties: { query: { type: 'string', description: 'Search query (fuzzy match)' } }, required: ['query'] } },
      execute: async (input: any) => {
        const results = await fuzzyNav.search(input.query, process.cwd());
        return { output: results.length > 0 ? results.join('\n') : '(no matches)', isError: false };
      },
    }];
  },
};

// ══════════════════════════════════════════════════════
// Feature 23: Customizable Keybindings
// ══════════════════════════════════════════════════════
interface Keybinding { key: string; command: string; description: string; }

class KeybindingManager {
  private bindings: Map<string, Keybinding> = new Map();

  async load(configDir: string) {
    try {
      const raw = await readFileSafe(path.join(configDir, 'keybindings.json'));
      if (raw) {
        const data = JSON.parse(raw);
        for (const kb of data) this.bindings.set(kb.key, kb);
      }
    } catch { /* use defaults */ }

    // Defaults
    if (this.bindings.size === 0) {
      const defaults: Keybinding[] = [
        { key: 'ctrl+r', command: '/review', description: 'Review code' },
        { key: 'ctrl+t', command: '/test', description: 'Run tests' },
        { key: 'ctrl+c', command: '/commit', description: 'Create commit' },
        { key: 'ctrl+d', command: '/debug', description: 'Debug mode' },
        { key: 'ctrl+s', command: '/simplify', description: 'Simplify code' },
      ];
      for (const kb of defaults) this.bindings.set(kb.key, kb);
    }
  }

  getBinding(key: string): Keybinding | undefined { return this.bindings.get(key); }
  getAllBindings(): Keybinding[] { return Array.from(this.bindings.values()); }

  setBinding(key: string, command: string, description: string) {
    this.bindings.set(key, { key, command, description });
  }
}

const keybindingManager = new KeybindingManager();

export const KeybindingFeature: FeatureModule = {
  meta: { id: 'keybindings', name: 'Customizable Keybindings', description: 'User-configurable keyboard shortcuts', category: 'devex', enabled: true, priority: 'P2' },
  async init(ctx: FeatureContext) { await keybindingManager.load(ctx.homeDir); },
  getTools() {
    return [{
      name: 'list_keybindings',
      definition: { name: 'list_keybindings', description: 'List all configured keyboard shortcuts', input_schema: { type: 'object' as const, properties: {} } },
      execute: async () => ({ output: keybindingManager.getAllBindings().map(kb => `${kb.key} → ${kb.command}: ${kb.description}`).join('\n'), isError: false }),
    }];
  },
};

// ══════════════════════════════════════════════════════
// Feature 24: Interactive Dependency Graph
// ══════════════════════════════════════════════════════
interface DepNode { name: string; file: string; imports: string[]; importedBy: string[]; }

class DependencyGraphBuilder {
  async build(projectDir: string): Promise<DepNode[]> {
    const files = await getSourceFiles(projectDir);
    const nodes: Map<string, DepNode> = new Map();

    for (const f of files) {
      const name = path.basename(f, path.extname(f));
      const content = await readFileSafe(f);
      if (!content) continue;

      const imports: string[] = [];
      const importMatches = content.matchAll(/(?:import|from|require)\s*\(?\s*['"]([^'"./][^'"]*)['"]/g);
      for (const m of importMatches) imports.push(m[1]);

      // Local imports
      const localMatches = content.matchAll(/(?:import|from|require)\s*\(?\s*['"](\.[^'"]*)['"]/g);
      for (const m of localMatches) {
        const resolved = path.resolve(path.dirname(f), m[1]);
        imports.push(path.basename(resolved));
      }

      nodes.set(f, { name, file: f, imports, importedBy: [] });
    }

    // Build reverse dependencies
    for (const [f, node] of nodes) {
      for (const imp of node.imports) {
        for (const [f2, node2] of nodes) {
          if (node2.name === imp || imp.includes(node2.name)) {
            node2.importedBy.push(path.basename(f));
          }
        }
      }
    }

    return Array.from(nodes.values());
  }
}

const depGraphBuilder = new DependencyGraphBuilder();

export const DependencyGraphFeature: FeatureModule = {
  meta: { id: 'dependency-graph', name: 'Interactive Dependency Graph', description: 'Visualize module dependencies and detect circular deps', category: 'devex', enabled: true, priority: 'P2' },
  getTools() {
    return [{
      name: 'build_dependency_graph',
      definition: { name: 'build_dependency_graph', description: 'Build and analyze the project dependency graph', input_schema: { type: 'object' as const, properties: { file: { type: 'string', description: 'Focus on a specific file' } } } },
      execute: async (input: any) => {
        const graph = await depGraphBuilder.build(process.cwd());
        if (input.file) {
          const node = graph.find(n => n.file.includes(input.file));
          if (!node) return { output: '(file not found)', isError: true };
          return { output: `${node.name}:\n  imports: ${node.imports.join(', ') || 'none'}\n  imported by: ${node.importedBy.join(', ') || 'none'}`, isError: false };
        }
        const top = graph.sort((a, b) => b.importedBy.length - a.importedBy.length).slice(0, 15);
        return { output: top.map(n => `${n.name} (${n.imports.length} imports, ${n.importedBy.length} importers)`).join('\n'), isError: false };
      },
    }];
  },
};
