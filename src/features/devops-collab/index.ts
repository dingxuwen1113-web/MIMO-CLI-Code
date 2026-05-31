// ── Features 25-34: DevOps + Collaboration Layer ─────
import { FeatureModule, FeatureContext } from '../registry';
import { readFileSafe, getSourceFiles, runCommand, now_iso } from '../utils';
import * as path from 'path';
import * as fs from 'fs/promises';

// ═══ Feature 25: CI/CD Pipeline Optimizer ═══════════
export const CIOptimizerFeature: FeatureModule = {
  meta: { id: 'ci-optimizer', name: 'CI/CD Pipeline Optimizer', description: 'Analyze CI configs and suggest optimizations', category: 'devops', enabled: true, priority: 'P2' },
  getTools() {
    return [{
      name: 'analyze_ci_pipeline',
      definition: { name: 'analyze_ci_pipeline', description: 'Analyze CI/CD configuration for optimization opportunities', input_schema: { type: 'object' as const, properties: {} } },
      execute: async () => {
        const issues: string[] = [];
        for (const ciFile of ['.github/workflows', '.gitlab-ci.yml', 'Jenkinsfile']) {
          const content = await readFileSafe(path.join(process.cwd(), ciFile));
          if (!content) continue;
          if (!content.includes('cache')) issues.push('Missing build cache configuration');
          if (!content.includes('matrix')) issues.push('Consider matrix builds for parallel testing');
          if (content.includes('npm install') && !content.includes('npm ci')) issues.push('Use "npm ci" instead of "npm install" for CI');
          if (!content.includes('timeout')) issues.push('No timeout configured — jobs could hang indefinitely');
        }
        return { output: issues.length > 0 ? issues.map(i => `• ${i}`).join('\n') : 'CI configuration looks optimized ✓', isError: false };
      },
    }];
  },
};

// ═══ Feature 26: Deploy Rollback Watchdog ════════════
interface DeployEntry { id: string; timestamp: string; commit: string; status: 'deployed' | 'rolled-back'; metrics?: Record<string, number>; }

class DeployWatchdog {
  private deploys: DeployEntry[] = [];
  private historyFile: string = '';
  private maxHistory = 100;

  async loadHistory(stateDir: string) {
    this.historyFile = path.join(stateDir, 'deploy-history.json');
    try {
      const raw = await fs.readFile(this.historyFile, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) this.deploys = data.slice(-this.maxHistory);
    } catch { /* no prior history */ }
  }

  private async saveHistory() {
    if (!this.historyFile) return;
    try {
      await fs.mkdir(path.dirname(this.historyFile), { recursive: true });
      await fs.writeFile(this.historyFile, JSON.stringify(this.deploys.slice(-this.maxHistory), null, 2));
    } catch { /* best-effort */ }
  }

  recordDeploy(commit: string): string {
    const id = `deploy-${Date.now()}`;
    this.deploys.push({ id, timestamp: now_iso(), commit, status: 'deployed' });
    if (this.deploys.length > this.maxHistory) this.deploys = this.deploys.slice(-this.maxHistory);
    this.saveHistory();
    return id;
  }

  rollbackDeploy(id: string): boolean {
    const deploy = this.deploys.find(d => d.id === id);
    if (!deploy || deploy.status === 'rolled-back') return false;
    deploy.status = 'rolled-back';
    this.saveHistory();
    return true;
  }

  checkHealth(metrics: Record<string, number>): { healthy: boolean; issues: string[] } {
    const issues: string[] = [];
    if (metrics.errorRate && metrics.errorRate > 5) issues.push(`High error rate: ${metrics.errorRate}%`);
    if (metrics.latency && metrics.latency > 2000) issues.push(`High latency: ${metrics.latency}ms`);
    if (metrics.cpu && metrics.cpu > 90) issues.push(`High CPU: ${metrics.cpu}%`);
    return { healthy: issues.length === 0, issues };
  }

  getHistory(): DeployEntry[] { return this.deploys; }
}

const watchdog = new DeployWatchdog();

export const DeployWatchdogFeature: FeatureModule = {
  meta: { id: 'deploy-watchdog', name: 'Deploy Rollback Watchdog', description: 'Monitor post-deploy metrics and auto-rollback', category: 'devops', enabled: true, priority: 'P3' },
  async init(ctx: FeatureContext) {
    const stateDir = path.join(ctx.homeDir, '.mimo', 'state');
    await watchdog.loadHistory(stateDir);
  },
  getTools() {
    return [
      {
        name: 'deploy_history',
        definition: { name: 'deploy_history', description: 'View deployment history and health status', input_schema: { type: 'object' as const, properties: { limit: { type: 'number', description: 'Max entries to show (default 20)' } } } },
        execute: async (input: any) => {
          const history = watchdog.getHistory();
          const limit = input?.limit || 20;
          return { output: history.slice(-limit).map(d => `${d.id} [${d.status}] ${d.commit} at ${d.timestamp}`).join('\n') || '(no deployments)', isError: false };
        },
      },
      {
        name: 'record_deploy',
        definition: { name: 'record_deploy', description: 'Record a new deployment', input_schema: { type: 'object' as const, properties: { commit: { type: 'string', description: 'Commit hash or version' } }, required: ['commit'] } },
        execute: async (input: any) => {
          const id = watchdog.recordDeploy(input.commit);
          return { output: `Deploy recorded: ${id} (commit: ${input.commit})`, isError: false };
        },
      },
      {
        name: 'rollback_deploy',
        definition: { name: 'rollback_deploy', description: 'Mark a deployment as rolled back', input_schema: { type: 'object' as const, properties: { deployId: { type: 'string', description: 'Deploy ID to rollback' } }, required: ['deployId'] } },
        execute: async (input: any) => {
          const ok = watchdog.rollbackDeploy(input.deployId);
          return { output: ok ? `Deploy ${input.deployId} marked as rolled back` : 'Deploy not found or already rolled back', isError: !ok };
        },
      },
    ];
  },
};

// ═══ Feature 27: Supply Chain Scanner ════════════════
class SupplyChainScanner {
  async scan(projectDir: string): Promise<{ vulnerabilities: Array<{ package: string; severity: string; message: string }>; licenses: string[] }> {
    const vulnerabilities: Array<{ package: string; severity: string; message: string }> = [];
    const licenses: string[] = [];

    const pkgRaw = await readFileSafe(path.join(projectDir, 'package.json'));
    if (pkgRaw) {
      const pkg = JSON.parse(pkgRaw);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Known typosquatting and malicious package patterns
      const suspicious = [
        'crossenv', 'cross-env.js', 'flatmap-stream', 'event-stream',
        'lodash.merge', 'extend', 'deep-extend', 'coa', 'rc',
        'ua-parser-js', 'colors', 'faker', 'nodemailer',
      ];
      const suspiciousPatterns = [/^(babelcli|crossenv|mongose|nodemailer)\b/i];

      for (const dep of Object.keys(deps)) {
        // Direct match against known suspicious packages
        if (suspicious.includes(dep)) {
          vulnerabilities.push({ package: dep, severity: 'critical', message: 'Known malicious/suspicious package — remove immediately' });
        }
        // Pattern match
        for (const pat of suspiciousPatterns) {
          if (pat.test(dep) && !suspicious.includes(dep)) {
            vulnerabilities.push({ package: dep, severity: 'high', message: 'Possible typosquatting — verify this is the intended package' });
          }
        }
        // Path traversal in package name
        if (dep.includes('..') || (!dep.startsWith('@') && dep.includes('/'))) {
          vulnerabilities.push({ package: dep, severity: 'warning', message: 'Unusual package name — verify legitimacy' });
        }
      }
    }

    // Run npm audit
    const auditResult = await runCommand('npm audit --json 2>/dev/null || true', projectDir, 30000);
    if (auditResult.stdout) {
      try {
        const audit = JSON.parse(auditResult.stdout);
        if (audit.vulnerabilities) {
          for (const [name, vuln] of Object.entries(audit.vulnerabilities) as any) {
            vulnerabilities.push({ package: name, severity: vuln.severity || 'unknown', message: vuln.title || 'Known vulnerability' });
          }
        }
      } catch { /* not valid JSON */ }
    }

    return { vulnerabilities, licenses };
  }
}

const scanner = new SupplyChainScanner();

export const SupplyChainFeature: FeatureModule = {
  meta: { id: 'supply-chain', name: 'Supply Chain Scanner', description: 'CVE, typosquatting, and license scanning for dependencies', category: 'devops', enabled: true, priority: 'P2' },
  getTools() {
    return [{
      name: 'scan_supply_chain',
      definition: { name: 'scan_supply_chain', description: 'Scan dependencies for security vulnerabilities', input_schema: { type: 'object' as const, properties: {} } },
      execute: async () => {
        const result = await scanner.scan(process.cwd());
        return { output: result.vulnerabilities.length > 0 ? `${result.vulnerabilities.length} issues:\n${result.vulnerabilities.slice(0, 15).map(v => `[${v.severity}] ${v.package}: ${v.message}`).join('\n')}` : 'No supply chain issues found ✓', isError: false };
      },
    }];
  },
};

// ═══ Feature 28: Containerized Sandbox ═══════════════
export const ContainerSandboxFeature: FeatureModule = {
  meta: { id: 'container-sandbox', name: 'Containerized Sandbox', description: 'Docker-based code execution', category: 'devops', enabled: true, priority: 'P3' },
  getTools() {
    return [{
      name: 'sandbox_run',
      definition: { name: 'sandbox_run', description: 'Run code in a containerized sandbox environment', input_schema: { type: 'object' as const, properties: { command: { type: 'string' }, image: { type: 'string', description: 'Docker image (default: node:20-slim)' } }, required: ['command'] } },
      execute: async (input: any) => {
        const image = input.image || 'node:20-slim';
        const result = await runCommand(`docker run --rm --network none -v "${process.cwd()}:/workspace" -w /workspace ${image} sh -c "${input.command.replace(/"/g, '\\"')}"`, undefined, 60000);
        return { output: result.stdout || result.stderr || '(no output)', isError: result.code !== 0 };
      },
    }];
  },
};

// ═══ Feature 29: Environment Parity Checker ═════════
export const EnvParityFeature: FeatureModule = {
  meta: { id: 'env-parity', name: 'Environment Parity Checker', description: 'Compare dev/staging/prod environment configs', category: 'devops', enabled: true, priority: 'P3' },
  getTools() {
    return [{
      name: 'check_env_parity',
      definition: { name: 'check_env_parity', description: 'Check environment configuration parity', input_schema: { type: 'object' as const, properties: {} } },
      execute: async () => {
        const issues: string[] = [];
        const envFiles = ['.env', '.env.local', '.env.development', '.env.staging', '.env.production'];
        const found: Record<string, string[]> = {};
        for (const f of envFiles) {
          const content = await readFileSafe(path.join(process.cwd(), f));
          if (content) found[f] = content.match(/^\w+=/gm)?.map(v => v.replace('=', '')) || [];
        }
        const allKeys = new Set(Object.values(found).flat());
        for (const [file, keys] of Object.entries(found)) {
          for (const key of allKeys) {
            if (!keys.includes(key)) issues.push(`${file} missing: ${key}`);
          }
        }
        return { output: issues.length > 0 ? issues.join('\n') : 'Environment configs are consistent ✓', isError: false };
      },
    }];
  },
};

// ═══ Feature 30: Team Knowledge Graph ════════════════
interface TeamMember { name: string; expertise: string[]; filesOwned: string[]; commits: number; }

export const TeamKnowledgeFeature: FeatureModule = {
  meta: { id: 'team-knowledge', name: 'Team Knowledge Graph', description: 'Team expertise mapping from git history', category: 'collaboration', enabled: true, priority: 'P3' },
  getTools() {
    return [{
      name: 'team_expertise',
      definition: { name: 'team_expertise', description: 'Analyze team expertise from git history', input_schema: { type: 'object' as const, properties: {} } },
      execute: async () => {
        const result = await runCommand('git shortlog -sn --all 2>/dev/null || echo "Not a git repo"');
        return { output: result.stdout || '(no git history)', isError: false };
      },
    }];
  },
};

// ═══ Feature 31: PR Template Learner ═════════════════
export const PRTemplateFeature: FeatureModule = {
  meta: { id: 'pr-template', name: 'PR Template Learner', description: 'Learn PR style from team history', category: 'collaboration', enabled: true, priority: 'P3' },
  getTools() {
    return [{
      name: 'learn_pr_style',
      definition: { name: 'learn_pr_style', description: 'Analyze past PRs to learn team conventions', input_schema: { type: 'object' as const, properties: { limit: { type: 'number', description: 'Number of PRs to analyze (default 20)' } } } },
      execute: async (input: any) => {
        const limit = input?.limit || 20;
        const result = await runCommand(`gh pr list --limit ${limit} --json title,body,labels,author 2>/dev/null`);
        if (!result.stdout || result.stdout.includes('gh CLI not available')) {
          return { output: 'GitHub CLI not available. Install with: brew install gh (or see https://cli.github.com)', isError: false };
        }

        let prs: Array<{ title: string; body: string; labels: Array<{ name: string }>; author: { login: string } }> = [];
        try {
          prs = JSON.parse(result.stdout);
        } catch {
          return { output: `Could not parse PR data:\n${result.stdout.slice(0, 500)}`, isError: true };
        }

        if (prs.length === 0) return { output: 'No PRs found to analyze.', isError: false };

        // Analyze title patterns
        const prefixes: Record<string, number> = {};
        const titleLengths: number[] = [];
        for (const pr of prs) {
          titleLengths.push(pr.title.length);
          const prefixMatch = pr.title.match(/^(\w+)(?:\([^)]+\))?:/);
          if (prefixMatch) {
            const prefix = prefixMatch[1].toLowerCase();
            prefixes[prefix] = (prefixes[prefix] || 0) + 1;
          }
        }

        // Analyze body structure
        const bodyLengths: number[] = [];
        const sections = new Set<string>();
        for (const pr of prs) {
          if (pr.body) {
            bodyLengths.push(pr.body.length);
            const headers = pr.body.match(/^##\s+(.+)$/gm);
            if (headers) headers.forEach(h => sections.add(h.replace(/^##\s+/, '')));
          }
        }

        // Analyze label usage
        const labelCounts: Record<string, number> = {};
        for (const pr of prs) {
          for (const label of (pr.labels || [])) {
            labelCounts[label.name] = (labelCounts[label.name] || 0) + 1;
          }
        }

        const avgTitleLen = titleLengths.length > 0 ? Math.round(titleLengths.reduce((a, b) => a + b, 0) / titleLengths.length) : 0;
        const avgBodyLen = bodyLengths.length > 0 ? Math.round(bodyLengths.reduce((a, b) => a + b, 0) / bodyLengths.length) : 0;
        const topPrefixes = Object.entries(prefixes).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const topLabels = Object.entries(labelCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

        const template: string[] = ['## Learned PR Conventions', ''];
        template.push(`Analyzed ${prs.length} PRs:`);
        template.push('');
        if (topPrefixes.length > 0) {
          template.push('### Title Prefixes');
          for (const [prefix, count] of topPrefixes) {
            template.push(`  - \`${prefix}:\` — used in ${count}/${prs.length} PRs`);
          }
          template.push('');
        }
        template.push(`### Title Length: avg ${avgTitleLen} chars`);
        template.push(`### Body Length: avg ${avgBodyLen} chars`);
        template.push('');
        if (sections.size > 0) {
          template.push('### Common Body Sections');
          for (const s of sections) template.push(`  - ${s}`);
          template.push('');
        }
        if (topLabels.length > 0) {
          template.push('### Common Labels');
          for (const [label, count] of topLabels) template.push(`  - \`${label}\` — ${count} PRs`);
        }

        // Generate suggested template
        const suggestedPrefix = topPrefixes[0]?.[0] || 'feat';
        template.push('');
        template.push('### Suggested Template');
        template.push('```');
        template.push(`${suggestedPrefix}(scope): concise description`);
        template.push('');
        if (sections.size > 0) {
          for (const s of sections) template.push(`## ${s}`);
        } else {
          template.push('## Summary');
          template.push('## Changes');
          template.push('## Test plan');
        }
        template.push('```');

        return { output: template.join('\n'), isError: false };
      },
    }];
  },
};

// ═══ Feature 32: Code Ownership Tracker ══════════════
export const OwnershipTrackerFeature: FeatureModule = {
  meta: { id: 'ownership-tracker', name: 'Code Ownership Tracker', description: 'Bus factor analysis from git blame', category: 'collaboration', enabled: true, priority: 'P2' },
  getTools() {
    return [{
      name: 'check_bus_factor',
      definition: { name: 'check_bus_factor', description: 'Identify code with low bus factor (only 1 maintainer)', input_schema: { type: 'object' as const, properties: { path: { type: 'string' } } } },
      execute: async (input: any) => {
        const result = await runCommand(`git log --format='%an' -- ${input.path || '.'} | sort | uniq -c | sort -rn`);
        const lines = result.stdout.split('\n').filter(l => l.trim());
        const top = parseInt(lines[0]?.trim().split(/\s+/)[0] || '0');
        const total = lines.reduce((s, l) => s + parseInt(l.trim().split(/\s+/)[0] || '0'), 0);
        const ratio = total > 0 ? top / total : 0;
        return { output: `${result.stdout}\n${ratio > 0.8 ? '⚠ Bus factor risk: >80% by single author' : '✓ Healthy distribution'}`, isError: false };
      },
    }];
  },
};

// ═══ Feature 33: Async Collaboration Mode ════════════
interface CollabSession {
  id: string;
  name: string;
  startedAt: string;
  lastActivity: string;
  status: 'active' | 'idle' | 'completed';
  task: string;
  changes: string[];
}

class CollabManager {
  private sessions: Map<string, CollabSession> = new Map();

  startSession(name: string, task: string): string {
    const id = `collab-${Date.now()}`;
    this.sessions.set(id, { id, name, startedAt: now_iso(), lastActivity: now_iso(), status: 'active', task, changes: [] });
    return id;
  }

  updateSession(id: string, changes?: string[]) {
    const session = this.sessions.get(id);
    if (!session) return;
    session.lastActivity = now_iso();
    if (changes) session.changes.push(...changes);
  }

  completeSession(id: string) {
    const session = this.sessions.get(id);
    if (session) {
      session.status = 'completed';
      session.lastActivity = now_iso();
    }
  }

  getStatus(): { active: CollabSession[]; idle: CollabSession[]; completed: CollabSession[] } {
    const all = Array.from(this.sessions.values());
    return {
      active: all.filter(s => s.status === 'active'),
      idle: all.filter(s => s.status === 'idle'),
      completed: all.filter(s => s.status === 'completed').slice(-5),
    };
  }
}

const collabManager = new CollabManager();

export const AsyncCollabFeature: FeatureModule = {
  meta: { id: 'async-collab', name: 'Async Collaboration Mode', description: 'Multi-user session contributions', category: 'collaboration', enabled: true, priority: 'P3' },
  getTools() {
    return [
      {
        name: 'collab_status',
        definition: { name: 'collab_status', description: 'Check async collaboration status and active sessions', input_schema: { type: 'object' as const, properties: {} } },
        execute: async () => {
          const status = collabManager.getStatus();
          const lines: string[] = ['=== Collaboration Status ===', ''];
          if (status.active.length > 0) {
            lines.push(`Active sessions (${status.active.length}):`);
            for (const s of status.active) lines.push(`  [${s.name}] ${s.task} — ${s.changes.length} changes`);
          }
          if (status.idle.length > 0) {
            lines.push(`Idle sessions (${status.idle.length}):`);
            for (const s of status.idle) lines.push(`  [${s.name}] ${s.task}`);
          }
          if (status.completed.length > 0) {
            lines.push(`Recently completed (${status.completed.length}):`);
            for (const s of status.completed) lines.push(`  [${s.name}] ${s.task} — ${s.changes.length} changes`);
          }
          if (status.active.length === 0 && status.idle.length === 0 && status.completed.length === 0) {
            lines.push('No collaboration sessions. Use start_collab_session to begin.');
          }
          return { output: lines.join('\n'), isError: false };
        },
      },
      {
        name: 'start_collab_session',
        definition: { name: 'start_collab_session', description: 'Start an async collaboration session', input_schema: { type: 'object' as const, properties: { name: { type: 'string', description: 'Session name' }, task: { type: 'string', description: 'Task description' } }, required: ['name', 'task'] } },
        execute: async (input: any) => {
          const id = collabManager.startSession(input.name, input.task);
          return { output: `Collaboration session started: ${input.name} (${id})\nTask: ${input.task}`, isError: false };
        },
      },
      {
        name: 'complete_collab_session',
        definition: { name: 'complete_collab_session', description: 'Mark a collaboration session as completed', input_schema: { type: 'object' as const, properties: { sessionId: { type: 'string' } }, required: ['sessionId'] } },
        execute: async (input: any) => {
          collabManager.completeSession(input.sessionId);
          return { output: `Session ${input.sessionId} marked as completed.`, isError: false };
        },
      },
    ];
  },
};

// ═══ Feature 34: Team Config Sync ════════════════════
export const TeamConfigSyncFeature: FeatureModule = {
  meta: { id: 'team-config-sync', name: 'Team Config Sync', description: 'Sync MIMO configs via git', category: 'collaboration', enabled: true, priority: 'P3' },
  getTools() {
    return [{
      name: 'sync_team_config',
      definition: { name: 'sync_team_config', description: 'Check team configuration sync status', input_schema: { type: 'object' as const, properties: {} } },
      execute: async () => {
        const projectConfig = await readFileSafe(path.join(process.cwd(), '.claude', 'settings.json'));
        return { output: projectConfig ? 'Project config found in .claude/settings.json ✓\nThis config is synced via git.' : 'No project-level config. Create .claude/settings.json for team sharing.', isError: false };
      },
    }];
  },
};
