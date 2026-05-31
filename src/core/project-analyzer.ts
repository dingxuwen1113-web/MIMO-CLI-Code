// ── /init 命令：分析项目并生成 CLAUDE.md ──────────

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ProjectInfo {
  name: string;
  languages: string[];
  frameworks: string[];
  packageManager: string;
  buildCommand: string;
  testCommand: string;
  lintCommand: string;
  hasGit: boolean;
  hasDocker: boolean;
  hasCI: boolean;
  structure: string[];
  existingRules: string[];
}

export async function analyzeProject(projectDir: string): Promise<ProjectInfo> {
  const info: ProjectInfo = {
    name: path.basename(projectDir),
    languages: [],
    frameworks: [],
    packageManager: 'unknown',
    buildCommand: '',
    testCommand: '',
    lintCommand: '',
    hasGit: false,
    hasDocker: false,
    hasCI: false,
    structure: [],
    existingRules: [],
  };

  // 检测 Git
  try {
    await fs.access(path.join(projectDir, '.git'));
    info.hasGit = true;
  } catch { /* no git */ }

  // 检测 Docker
  try {
    await fs.access(path.join(projectDir, 'Dockerfile'));
    info.hasDocker = true;
  } catch { /* no docker */ }

  // 检测 CI
  try {
    await fs.access(path.join(projectDir, '.github', 'workflows'));
    info.hasCI = true;
  } catch {
    try {
      await fs.access(path.join(projectDir, '.gitlab-ci.yml'));
      info.hasCI = true;
    } catch { /* no ci */ }
  }

  // 检测 package.json (Node.js)
  try {
    const pkgRaw = await fs.readFile(path.join(projectDir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    info.languages.push('JavaScript/TypeScript');
    info.packageManager = 'npm';

    // 检测包管理器
    try { await fs.access(path.join(projectDir, 'pnpm-lock.yaml')); info.packageManager = 'pnpm'; } catch {}
    try { await fs.access(path.join(projectDir, 'yarn.lock')); info.packageManager = 'yarn'; } catch {}
    try { await fs.access(path.join(projectDir, 'bun.lockb')); info.packageManager = 'bun'; } catch {}

    // 检测脚本
    if (pkg.scripts) {
      if (pkg.scripts.build) info.buildCommand = `${info.packageManager} run build`;
      if (pkg.scripts.test) info.testCommand = `${info.packageManager} test`;
      if (pkg.scripts.lint) info.lintCommand = `${info.packageManager} run lint`;
    }

    // 检测框架
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.react) info.frameworks.push('React');
    if (deps.vue) info.frameworks.push('Vue');
    if (deps.svelte) info.frameworks.push('Svelte');
    if (deps['solid-js']) info.frameworks.push('Solid.js');
    if (deps.next) info.frameworks.push('Next.js');
    if (deps.nuxt) info.frameworks.push('Nuxt');
    if (deps['@angular/core']) info.frameworks.push('Angular');
    if (deps.astro) info.frameworks.push('Astro');
    if (deps.express) info.frameworks.push('Express');
    if (deps.fastify) info.frameworks.push('Fastify');
    if (deps['@nestjs/core']) info.frameworks.push('NestJS');
    if (deps.koa) info.frameworks.push('Koa');
    if (deps.hono) info.frameworks.push('Hono');
    if (deps.typescript) info.languages.push('TypeScript');
    if (deps.tailwindcss) info.frameworks.push('Tailwind CSS');
    if (deps.electron) info.frameworks.push('Electron');
    if (deps.reactnative || deps['react-native']) info.frameworks.push('React Native');
    if (deps.expo) info.frameworks.push('Expo');
    if (deps.tauri || deps['@tauri-apps/api']) info.frameworks.push('Tauri');
    if (deps.prisma) info.frameworks.push('Prisma');
    if (deps.drizzleorm || deps['drizzle-orm']) info.frameworks.push('Drizzle');
    if (deps.vitest) info.testCommand = 'npx vitest run';
    if (deps.jest) info.testCommand = 'npx jest';
    if (deps.eslint) info.lintCommand = `${info.packageManager} run lint`;
  } catch (err: any) {
    // Handle malformed package.json (syntax errors)
    if (err instanceof SyntaxError) {
      // File exists but is not valid JSON
      info.languages.push('JavaScript/TypeScript');
    }
  }

  // 检测 Python
  try {
    await fs.access(path.join(projectDir, 'pyproject.toml'));
    info.languages.push('Python');
    info.packageManager = 'pip';
    info.buildCommand = 'python -m build';
    info.testCommand = 'pytest';
  } catch {}
  try {
    await fs.access(path.join(projectDir, 'requirements.txt'));
    if (!info.languages.includes('Python')) info.languages.push('Python');
  } catch {}

  // 检测 Go
  try {
    await fs.access(path.join(projectDir, 'go.mod'));
    info.languages.push('Go');
    info.buildCommand = 'go build ./...';
    info.testCommand = 'go test ./...';
  } catch {}

  // 检测 Rust
  try {
    await fs.access(path.join(projectDir, 'Cargo.toml'));
    info.languages.push('Rust');
    info.buildCommand = 'cargo build';
    info.testCommand = 'cargo test';
  } catch {}

  // 检测 Java / Kotlin
  try {
    await fs.access(path.join(projectDir, 'pom.xml'));
    info.languages.push('Java');
    info.buildCommand = 'mvn package';
    info.testCommand = 'mvn test';
    info.packageManager = 'maven';
  } catch {}
  try {
    let hasGradle = false;
    try { await fs.access(path.join(projectDir, 'build.gradle')); hasGradle = true; } catch {}
    try { await fs.access(path.join(projectDir, 'build.gradle.kts')); hasGradle = true; } catch {}
    if (hasGradle) {
      if (!info.languages.includes('Java')) info.languages.push('Java');
      info.buildCommand = info.buildCommand || './gradlew build';
      info.testCommand = info.testCommand || './gradlew test';
      info.packageManager = 'gradle';
    }
  } catch {}
  try {
    const entries = await fs.readdir(projectDir);
    const hasCsproj = entries.some(e => e.endsWith('.csproj') || e.endsWith('.sln'));
    if (hasCsproj) {
      info.languages.push('C#');
      info.buildCommand = 'dotnet build';
      info.testCommand = 'dotnet test';
    }
  } catch {}

  // 检测 Ruby (Rails)
  try {
    await fs.access(path.join(projectDir, 'Gemfile'));
    info.languages.push('Ruby');
    info.testCommand = 'bundle exec rspec';
  } catch {}
  try {
    await fs.access(path.join(projectDir, 'Rakefile'));
    if (!info.languages.includes('Ruby')) info.languages.push('Ruby');
  } catch {}

  // 检测 PHP (Laravel)
  try {
    await fs.access(path.join(projectDir, 'composer.json'));
    info.languages.push('PHP');
    info.buildCommand = 'composer install';
    info.testCommand = 'php artisan test';
  } catch {}

  // 检测 Swift / Xcode
  try {
    const entries = await fs.readdir(projectDir);
    const hasXcode = entries.some(e => e.endsWith('.xcodeproj') || e.endsWith('.xcworkspace'));
    if (hasXcode) {
      info.languages.push('Swift');
    }
    if (entries.some(e => e === 'Package.swift')) {
      if (!info.languages.includes('Swift')) info.languages.push('Swift');
      info.buildCommand = 'swift build';
      info.testCommand = 'swift test';
    }
  } catch {}

  // 检测现有规则文件
  const ruleFiles = ['CLAUDE.md', 'AGENTS.md', '.cursorrules', '.windsurfrules', 'MIMO.md'];
  for (const f of ruleFiles) {
    try {
      await fs.access(path.join(projectDir, f));
      info.existingRules.push(f);
    } catch { /* not found */ }
  }

  // 目录结构
  try {
    const entries = await fs.readdir(projectDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (entry.isDirectory()) {
        info.structure.push(`${entry.name}/`);
      }
    }
  } catch { /* ignore */ }

  return info;
}

export function generateClaudeMd(info: ProjectInfo): string {
  const lines: string[] = [];

  lines.push(`# ${info.name}`);
  lines.push('');

  // 技术栈
  if (info.languages.length || info.frameworks.length) {
    lines.push('## Tech Stack');
    if (info.languages.length) lines.push(`- Languages: ${info.languages.join(', ')}`);
    if (info.frameworks.length) lines.push(`- Frameworks: ${info.frameworks.join(', ')}`);
    lines.push(`- Package Manager: ${info.packageManager}`);
    lines.push('');
  }

  // 常用命令
  lines.push('## Commands');
  if (info.buildCommand) lines.push(`- Build: \`${info.buildCommand}\``);
  if (info.testCommand) lines.push(`- Test: \`${info.testCommand}\``);
  if (info.lintCommand) lines.push(`- Lint: \`${info.lintCommand}\``);
  lines.push('');

  // 项目结构
  if (info.structure.length) {
    lines.push('## Project Structure');
    for (const dir of info.structure.slice(0, 15)) {
      lines.push(`- \`${dir}\``);
    }
    lines.push('');
  }

  // 规范
  lines.push('## Conventions');
  if (info.languages.includes('TypeScript') || info.languages.includes('JavaScript/TypeScript')) {
    lines.push('- Use TypeScript strict mode');
  }
  if (info.languages.includes('Python')) {
    lines.push('- Follow PEP 8 style guide');
    lines.push('- Use type hints where applicable');
  }
  if (info.languages.includes('Go')) {
    lines.push('- Follow standard Go conventions (gofmt)');
  }
  if (info.languages.includes('Rust')) {
    lines.push('- Follow Rust API guidelines');
    lines.push('- Run `cargo clippy` before committing');
  }
  lines.push('- Run tests before committing');
  lines.push('- Keep changes focused and minimal');
  lines.push('');

  return lines.join('\n');
}
