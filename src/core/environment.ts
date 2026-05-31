import * as os from 'os';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface EnvironmentInfo {
  os: string;
  shell: string;
  nodeVersion: string;
  npmVersion: string;
  packageManager: string;
  gitBranch: string;
  gitClean: boolean;
  projectType: string;
  hasTests: boolean;
  testCommand: string;
  buildCommand: string;
}

function safeExec(cmd: string, cwd?: string): string {
  try {
    return execSync(cmd, {
      cwd: cwd || process.cwd(),
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    }).trim();
  } catch {
    return '';
  }
}

function fileExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function detectOS(): string {
  const platform = os.platform();
  const release = os.release();

  if (platform === 'win32') {
    const match = release.match(/^(\d+\.\d+)/);
    const ver = match ? match[1] : release;
    const versions: Record<string, string> = {
      '10.0': 'Windows 10/11',
      '6.3': 'Windows 8.1',
      '6.2': 'Windows 8',
      '6.1': 'Windows 7',
    };
    return versions[ver] || `Windows ${release}`;
  } else if (platform === 'darwin') {
    const match = release.match(/^(\d+)\./);
    const major = match ? parseInt(match[1], 10) : 0;
    const macVersions: Record<number, string> = {
      23: 'macOS 14',
      22: 'macOS 13',
      21: 'macOS 12',
      20: 'macOS 11',
    };
    return macVersions[major] || `macOS (Darwin ${release})`;
  } else if (platform === 'linux') {
    try {
      const osRelease = fs.readFileSync('/etc/os-release', 'utf-8');
      const nameMatch = osRelease.match(/PRETTY_NAME="([^"]+)"/);
      if (nameMatch) return nameMatch[1];
      const idMatch = osRelease.match(/^ID=(.+)$/m);
      const verMatch = osRelease.match(/^VERSION_ID="?(.+?)"?$/m);
      if (idMatch && verMatch) return `${idMatch[1]} ${verMatch[1]}`;
    } catch {}
    return `Linux ${release}`;
  }

  return `${platform} ${release}`;
}

function detectShell(): string {
  if (os.platform() === 'win32') {
    const shell = process.env.ComSpec || '';
    if (shell.toLowerCase().includes('powershell') || shell.toLowerCase().includes('pwsh')) {
      return 'powershell';
    }
    if (shell.toLowerCase().includes('cmd')) return 'cmd';
    return 'powershell';
  }

  const shellEnv = process.env.SHELL || '';
  if (shellEnv.includes('zsh')) return 'zsh';
  if (shellEnv.includes('bash')) return 'bash';
  if (shellEnv.includes('fish')) return 'fish';
  return 'sh';
}

function detectPackageManager(projectDir: string): string {
  if (fileExists(path.join(projectDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fileExists(path.join(projectDir, 'yarn.lock'))) return 'yarn';
  if (fileExists(path.join(projectDir, 'package-lock.json'))) return 'npm';
  if (fileExists(path.join(projectDir, 'bun.lockb'))) return 'bun';
  return 'npm';
}

function detectProjectType(projectDir: string): string {
  if (fileExists(path.join(projectDir, 'tsconfig.json'))) return 'typescript-node';
  if (fileExists(path.join(projectDir, 'package.json'))) return 'javascript-node';
  if (fileExists(path.join(projectDir, 'pyproject.toml')) ||
      fileExists(path.join(projectDir, 'setup.py')) ||
      fileExists(path.join(projectDir, 'requirements.txt'))) return 'python';
  if (fileExists(path.join(projectDir, 'go.mod'))) return 'go';
  if (fileExists(path.join(projectDir, 'Cargo.toml'))) return 'rust';
  if (fileExists(path.join(projectDir, 'Gemfile'))) return 'ruby';
  if (fileExists(path.join(projectDir, 'pom.xml')) ||
      fileExists(path.join(projectDir, 'build.gradle'))) return 'java';
  if (fileExists(path.join(projectDir, 'CMakeLists.txt'))) return 'cpp';
  if (fileExists(path.join(projectDir, 'pubspec.yaml'))) return 'dart';
  return 'unknown';
}

function detectHasTests(projectDir: string): boolean {
  if (fileExists(path.join(projectDir, 'jest.config.js')) ||
      fileExists(path.join(projectDir, 'jest.config.ts')) ||
      fileExists(path.join(projectDir, 'jest.config.mjs'))) return true;
  if (fileExists(path.join(projectDir, 'vitest.config.ts')) ||
      fileExists(path.join(projectDir, 'vitest.config.js'))) return true;
  if (fileExists(path.join(projectDir, 'pytest.ini')) ||
      fileExists(path.join(projectDir, 'conftest.py'))) return true;
  if (fileExists(path.join(projectDir, '__tests__'))) return true;
  if (fileExists(path.join(projectDir, 'test'))) return true;
  if (fileExists(path.join(projectDir, 'tests'))) return true;
  if (fileExists(path.join(projectDir, 'spec'))) return true;

  try {
    const pkgRaw = fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    if (pkg.scripts?.test && !pkg.scripts.test.includes('no test specified')) return true;
  } catch {}

  return false;
}

function detectTestCommand(projectDir: string): string {
  try {
    const pkgRaw = fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    if (pkg.scripts?.test && !pkg.scripts.test.includes('no test specified')) {
      return pkg.scripts.test;
    }
  } catch {}

  if (fileExists(path.join(projectDir, 'pytest.ini')) ||
      fileExists(path.join(projectDir, 'conftest.py'))) return 'pytest';
  if (fileExists(path.join(projectDir, 'go.mod'))) return 'go test ./...';

  return '';
}

function detectBuildCommand(projectDir: string, projectType: string): string {
  try {
    const pkgRaw = fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    if (pkg.scripts?.build) return pkg.scripts.build;
  } catch {}

  if (projectType === 'typescript-node' && fileExists(path.join(projectDir, 'tsconfig.json'))) {
    return 'npx tsc';
  }
  if (projectType === 'go') return 'go build ./...';
  if (projectType === 'rust') return 'cargo build';
  if (projectType === 'python') return '';

  return '';
}

export async function detectEnvironment(projectDir?: string): Promise<EnvironmentInfo> {
  const cwd = projectDir || process.cwd();

  const osName = detectOS();
  const shell = detectShell();
  const nodeVersion = process.version;
  const npmVersion = safeExec('npm --version');
  const packageManager = detectPackageManager(cwd);
  const gitBranch = safeExec('git branch --show-current', cwd);
  const gitStatus = safeExec('git status --porcelain', cwd);
  const gitClean = gitStatus === '';
  const projectType = detectProjectType(cwd);
  const hasTests = detectHasTests(cwd);
  const testCommand = detectTestCommand(cwd);
  const buildCommand = detectBuildCommand(cwd, projectType);

  return {
    os: osName,
    shell,
    nodeVersion,
    npmVersion,
    packageManager,
    gitBranch,
    gitClean,
    projectType,
    hasTests,
    testCommand,
    buildCommand,
  };
}

export function formatEnvironment(info: EnvironmentInfo): string {
  const lines: string[] = ['## Environment'];

  lines.push(`- OS: ${info.os} (${os.arch()})`);
  lines.push(`- Shell: ${info.shell}`);
  lines.push(`- Node: ${info.nodeVersion}`);
  if (info.npmVersion) lines.push(`- npm: ${info.npmVersion}`);
  lines.push(`- Package manager: ${info.packageManager}`);

  if (info.gitBranch) {
    lines.push(`- Git branch: ${info.gitBranch}${info.gitClean ? ' (clean)' : ' (dirty)'}`);
  }

  const projectLabels: Record<string, string> = {
    'typescript-node': 'TypeScript/Node.js',
    'javascript-node': 'JavaScript/Node.js',
    'python': 'Python',
    'go': 'Go',
    'rust': 'Rust',
    'ruby': 'Ruby',
    'java': 'Java',
    'cpp': 'C/C++',
    'dart': 'Dart/Flutter',
  };
  lines.push(`- Project: ${projectLabels[info.projectType] || info.projectType}`);

  if (info.buildCommand) lines.push(`- Build: ${info.buildCommand}`);
  if (info.testCommand) lines.push(`- Test: ${info.testCommand}`);

  return lines.join('\n');
}

/**
 * Returns a shell command that performs type-checking for the current project,
 * or empty string if no type-check command is available.
 */
export function getTypeCheckCommand(info: EnvironmentInfo): string {
  if (info.projectType === 'typescript-node') {
    return 'npx tsc --noEmit';
  }
  if (info.projectType === 'python') {
    if (fileExists(path.join(process.cwd(), 'mypy.ini')) ||
        fileExists(path.join(process.cwd(), 'setup.cfg'))) {
      return 'mypy .';
    }
  }
  return '';
}
