// ── Feature 6: Smart Environment Detector ────────────
import { FeatureModule, FeatureContext } from '../registry';
import { readFileSafe, runCommand, now_iso } from '../utils';
import * as path from 'path';
import * as fs from 'fs/promises';

interface EnvIssue { severity: 'error' | 'warning' | 'info'; category: string; message: string; fix?: string; }
interface TechStack { language: string; framework: string; packageManager: string; runtime: string; tools: string[]; }

class EnvironmentDetector {
  private projectDir = '';
  private techStack: TechStack | null = null;

  async detect(projectDir: string): Promise<{ stack: TechStack; issues: EnvIssue[] }> {
    this.projectDir = projectDir;
    const issues: EnvIssue[] = [];

    // Detect tech stack
    const stack = await this.detectTechStack();
    this.techStack = stack;

    // Check package.json
    const pkgRaw = await readFileSafe(path.join(projectDir, 'package.json'));
    if (pkgRaw) {
      const pkg = JSON.parse(pkgRaw);
      if (!pkg.engines) issues.push({ severity: 'info', category: 'engines', message: 'No engines field in package.json', fix: 'Add "engines": {"node": ">=18"}' });
      if (!pkg.scripts?.test) issues.push({ severity: 'warning', category: 'testing', message: 'No test script defined' });
      if (!pkg.scripts?.lint) issues.push({ severity: 'info', category: 'linting', message: 'No lint script defined' });
    }

    // Check .env vs .env.example
    const envExample = await readFileSafe(path.join(projectDir, '.env.example'));
    const envFile = await readFileSafe(path.join(projectDir, '.env'));
    if (envExample && !envFile) {
      issues.push({ severity: 'warning', category: 'env', message: '.env.example exists but .env is missing', fix: 'Copy .env.example to .env and fill in values' });
    }
    if (envExample && envFile) {
      const exampleVars = envExample.match(/^\w+=/gm)?.map(v => v.replace('=', '')) || [];
      const envVars = envFile.match(/^\w+=/gm)?.map(v => v.replace('=', '')) || [];
      const missing = exampleVars.filter(v => !envVars.includes(v));
      if (missing.length > 0) {
        issues.push({ severity: 'warning', category: 'env', message: `Missing env vars: ${missing.join(', ')}` });
      }
    }

    // Check git
    try {
      await runCommand('git status', projectDir, 5000);
    } catch {
      issues.push({ severity: 'info', category: 'git', message: 'Not a git repository', fix: 'Run git init' });
    }

    // Check Dockerfile
    try {
      await fs.access(path.join(projectDir, 'Dockerfile'));
    } catch {
      issues.push({ severity: 'info', category: 'docker', message: 'No Dockerfile found' });
    }

    // Check CI/CD
    for (const ciPath of ['.github/workflows', '.gitlab-ci.yml', 'Jenkinsfile']) {
      try { await fs.access(path.join(projectDir, ciPath)); } catch {
        issues.push({ severity: 'info', category: 'ci', message: `No CI configuration (${ciPath})` });
      }
    }

    return { stack, issues };
  }

  private async detectTechStack(): Promise<TechStack> {
    const stack: TechStack = { language: 'unknown', framework: 'unknown', packageManager: 'npm', runtime: 'node', tools: [] };

    // Package manager
    for (const [file, pm] of [['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['package-lock.json', 'npm'], ['bun.lockb', 'bun']]) {
      try { await fs.access(path.join(this.projectDir, file)); stack.packageManager = pm; break; } catch { /* */ }
    }

    // Language/Framework
    const pkgRaw = await readFileSafe(path.join(this.projectDir, 'package.json'));
    if (pkgRaw) {
      const pkg = JSON.parse(pkgRaw);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.react || deps.next) stack.framework = deps.next ? 'Next.js' : 'React';
      else if (deps.vue || deps.nuxt) stack.framework = deps.nuxt ? 'Nuxt' : 'Vue';
      else if (deps.svelte || deps['@sveltejs/kit']) stack.framework = 'Svelte';
      else if (deps.express || deps.fastify) stack.framework = deps.fastify ? 'Fastify' : 'Express';
      else if (deps.nestjs || deps['@nestjs/core']) stack.framework = 'NestJS';
      stack.language = deps.typescript || deps.typescript ? 'TypeScript' : 'JavaScript';
      if (deps.vitest || deps.jest) stack.tools.push(deps.vitest ? 'Vitest' : 'Jest');
      if (deps.eslint) stack.tools.push('ESLint');
      if (deps.prettier) stack.tools.push('Prettier');
      if (deps.tailwindcss) stack.tools.push('Tailwind CSS');
    }

    // Python
    for (const f of ['requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py']) {
      try { await fs.access(path.join(this.projectDir, f)); stack.language = 'Python'; stack.runtime = 'python'; break; } catch { /* */ }
    }

    // Go
    try { await fs.access(path.join(this.projectDir, 'go.mod')); stack.language = 'Go'; stack.runtime = 'go'; } catch { /* */ }

    // Rust
    try { await fs.access(path.join(this.projectDir, 'Cargo.toml')); stack.language = 'Rust'; stack.runtime = 'cargo'; } catch { /* */ }

    return stack;
  }

  getStack(): TechStack | null { return this.techStack; }
}

const detector = new EnvironmentDetector();

export const SmartEnvironmentFeature: FeatureModule = {
  meta: {
    id: 'smart-environment',
    name: 'Smart Environment Detector',
    description: 'Auto-detect tech stack, missing configs, and suggest setup',
    category: 'perception',
    enabled: true,
    priority: 'P0',
  },
  async init(ctx: FeatureContext) { await detector.detect(ctx.projectDir); },
  getTools() {
    return [{
      name: 'detect_environment',
      definition: {
        name: 'detect_environment',
        description: 'Detect project tech stack and environment issues',
        input_schema: { type: 'object' as const, properties: {} },
      },
      execute: async () => {
        const { stack, issues } = await detector.detect(process.cwd());
        const lines = [
          `Language: ${stack.language}`,
          `Framework: ${stack.framework}`,
          `Package Manager: ${stack.packageManager}`,
          `Runtime: ${stack.runtime}`,
          `Tools: ${stack.tools.join(', ') || 'none detected'}`,
          '',
          ...issues.map(i => `[${i.severity}] ${i.category}: ${i.message}${i.fix ? ` → ${i.fix}` : ''}`),
        ];
        return { output: lines.join('\n'), isError: false };
      },
    }];
  },
};
