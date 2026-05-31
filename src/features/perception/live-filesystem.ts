// ── Feature 5: Live Filesystem Awareness ─────────────
import { FeatureModule, FeatureContext } from '../registry';
import * as fs from 'fs';
import * as path from 'path';
import { debounce } from '../utils';

interface FileChange { path: string; type: 'created' | 'modified' | 'deleted'; timestamp: number; }

class FilesystemWatcher {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private changes: FileChange[] = [];
  private onChange?: (changes: FileChange[]) => void;
  private ignorePatterns = [/node_modules/, /\.git[/\\]/, /dist[/\\]/, /\.mimo[/\\]/, /build[/\\]/];

  start(dir: string, onChange?: (changes: FileChange[]) => void) {
    this.onChange = onChange;
    this.watchDir(dir);
  }

  private watchDir(dir: string) {
    try {
      const debouncedEmit = debounce(() => {
        if (this.onChange && this.changes.length > 0) {
          this.onChange([...this.changes]);
          this.changes = [];
        }
      }, 500);

      const watcher = fs.watch(dir, { recursive: false }, (eventType, filename) => {
        if (!filename) return;
        const fullPath = path.join(dir, filename);
        if (this.ignorePatterns.some(p => p.test(fullPath))) return;

        const change: FileChange = {
          path: fullPath,
          type: eventType === 'rename' ? 'modified' : 'modified',
          timestamp: Date.now(),
        };

        // Check if file exists to determine if created or deleted
        fs.access(fullPath, fs.constants.F_OK, (err) => {
          change.type = err ? 'deleted' : 'modified';
          this.changes.push(change);
          debouncedEmit();
        });
      });

      this.watchers.set(dir, watcher);
    } catch { /* watcher not supported */ }
  }

  getRecentChanges(limit = 20): FileChange[] {
    return this.changes.slice(-limit);
  }

  hasExternalChanges(): boolean {
    return this.changes.some(c => c.timestamp > Date.now() - 30000);
  }

  stop() {
    for (const w of this.watchers.values()) w.close();
    this.watchers.clear();
  }
}

const watcher = new FilesystemWatcher();

export const LiveFilesystemFeature: FeatureModule = {
  meta: {
    id: 'live-filesystem',
    name: 'Live Filesystem Awareness',
    description: 'Watch project directory for external file changes in real-time',
    category: 'perception',
    enabled: true,
    priority: 'P2',
  },
  async init(ctx: FeatureContext) {
    watcher.start(ctx.projectDir, (changes) => {
      ctx.emit('filesystem_changed', changes);
    });
  },
  async onEvent(event: string, data: any) {
    if (event === 'before_tool_call') {
      if (watcher.hasExternalChanges()) {
        data.warnings = data.warnings || [];
        data.warnings.push('⚠ External file changes detected since last check');
      }
    }
  },
  getTools() {
    return [{
      name: 'check_external_changes',
      definition: {
        name: 'check_external_changes',
        description: 'Check if files have been changed externally (by IDE, git, other tools)',
        input_schema: { type: 'object' as const, properties: {} },
      },
      execute: async () => {
        const changes = watcher.getRecentChanges();
        return {
          output: changes.length > 0
            ? changes.map(c => `${c.type}: ${c.path} (${new Date(c.timestamp).toLocaleTimeString()})`).join('\n')
            : '(no external changes detected)',
          isError: false,
        };
      },
    }];
  },
  async cleanup() { watcher.stop(); },
};
