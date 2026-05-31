import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { ToolDefinition, ToolResult } from '../registry';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// Cache for gh CLI availability
let _ghAvailable: boolean | null = null;
async function isGhAvailable(): Promise<boolean> {
  if (_ghAvailable !== null) return _ghAvailable;
  try {
    await execFileAsync('gh', ['--version'], { timeout: 5000 });
    _ghAvailable = true;
  } catch {
    _ghAvailable = false;
  }
  return _ghAvailable;
}

// Validate git branch name (disallow invalid characters per git-check-ref-format)
function isValidBranchName(name: string): boolean {
  if (!name || name.trim().length === 0) return false;
  // Git disallows: spaces, ~, ^, :, ?, *, [, \, .., @{, leading/trailing dots or slashes, etc.
  const invalid = /[\s~^:?*[\\]|(\.\.)|@{|\.\.|^[./]|[./]$|\.lock$|^@$|"/;
  return !invalid.test(name);
}

async function git(args: string, cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execAsync(`git ${args}`, {
      cwd: cwd || process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
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

async function gitExecFile(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd: cwd || process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
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

// ── 工具定义 ──────────────────────────────────────

export const gitStatusTool: ToolDefinition = {
  name: 'git_status',
  description: `显示工作区状态：已修改、已暂存、未跟踪的文件。相当于 \`git status\`。自动批准。`,
  input_schema: {
    type: 'object' as const,
    properties: {
      short: { type: 'boolean', description: '简短格式（默认 true）' },
    },
  },
  permission: 'auto',
};

export const gitDiffTool: ToolDefinition = {
  name: 'git_diff',
  description: `显示文件差异。可比较工作区/暂存区/提交之间。相当于 \`git diff\`。自动批准。`,
  input_schema: {
    type: 'object' as const,
    properties: {
      staged: { type: 'boolean', description: '查看暂存区差异（默认 false）' },
      path: { type: 'string', description: '指定文件路径' },
      branch: { type: 'string', description: '与指定分支对比' },
      stat: { type: 'boolean', description: '仅显示统计信息' },
    },
  },
  permission: 'auto',
};

export const gitLogTool: ToolDefinition = {
  name: 'git_log',
  description: `显示提交历史。支持限制数量和格式化。相当于 \`git log\`。自动批准。`,
  input_schema: {
    type: 'object' as const,
    properties: {
      limit: { type: 'number', description: '显示条数（默认 20）' },
      path: { type: 'string', description: '指定文件路径' },
      author: { type: 'string', description: '按作者过滤' },
      since: { type: 'string', description: '起始日期 (如 "2024-01-01" 或 "7 days ago")' },
      grep: { type: 'string', description: '搜索提交消息' },
      oneline: { type: 'boolean', description: '单行格式（默认 true）' },
    },
  },
  permission: 'auto',
};

export const gitBranchTool: ToolDefinition = {
  name: 'git_branch',
  description: `分支管理。list/current 操作自动批准，create/delete/switch 需审批。`,
  input_schema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['list', 'create', 'delete', 'switch', 'current'], description: '操作类型' },
      name: { type: 'string', description: '分支名（create/delete/switch 时需要）' },
      remote: { type: 'boolean', description: '列出远程分支' },
    },
    required: ['action'],
  },
  permission: 'auto',
};

export const gitCommitTool: ToolDefinition = {
  name: 'git_commit',
  description: `创建提交。需要审批。必须提供 message。先 git_status 确认暂存区。`,
  input_schema: {
    type: 'object' as const,
    properties: {
      message: { type: 'string', description: '提交消息' },
      files: { type: 'array', items: { type: 'string' }, description: '要暂存的文件列表（默认全部修改）' },
      all: { type: 'boolean', description: '暂存所有修改（git add -A）' },
      amend: { type: 'boolean', description: '修改上一次提交' },
    },
    required: ['message'],
  },
  permission: 'ask',
};

export const gitCheckoutTool: ToolDefinition = {
  name: 'git_checkout',
  description: `切换分支或恢复文件。切换分支自动批准，恢复文件需审批。`,
  input_schema: {
    type: 'object' as const,
    properties: {
      target: { type: 'string', description: '分支名或文件路径' },
      create: { type: 'boolean', description: '创建并切换新分支' },
      file: { type: 'boolean', description: '恢复文件而非切换分支' },
    },
    required: ['target'],
  },
  permission: 'ask',
};

export const gitStashTool: ToolDefinition = {
  name: 'git_stash',
  description: `暂存未提交的修改。list/show 自动批准，push/pop/drop 需审批。`,
  input_schema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['push', 'pop', 'list', 'drop', 'show'], description: '操作类型' },
      message: { type: 'string', description: '暂存消息（push 时）' },
      index: { type: 'number', description: '暂存索引（pop/drop/show 时）' },
    },
    required: ['action'],
  },
  permission: 'ask',
};

export const gitPrTool: ToolDefinition = {
  name: 'git_pr',
  description: `Pull Request 操作（需要 gh CLI）。create/view/list/merge。需审批。`,
  input_schema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['create', 'view', 'list', 'merge'], description: '操作类型' },
      title: { type: 'string', description: 'PR 标题（create 时）' },
      body: { type: 'string', description: 'PR 描述（create 时）' },
      base: { type: 'string', description: '目标分支（默认 main）' },
      number: { type: 'number', description: 'PR 编号（view/merge 时）' },
    },
    required: ['action'],
  },
  permission: 'ask',
};

export const gitBlameTool: ToolDefinition = {
  name: 'git_blame',
  description: `查看文件每行的最后修改提交。自动批准。`,
  input_schema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: '文件路径' },
      range: { type: 'string', description: '行范围 (如 "10,20")' },
    },
    required: ['path'],
  },
  permission: 'auto',
};

// ── 执行函数 ──────────────────────────────────────

export async function executeGitStatus(input: Record<string, any>): Promise<ToolResult> {
  const flag = input.short !== false ? '-sb' : '';
  const r = await git(`status ${flag}`);
  if (r.code !== 0) {
    if (r.stderr.includes('not a git repository')) {
      return { output: '当前目录不是 Git 仓库', isError: true };
    }
    return { output: `git status 失败: ${r.stderr}`, isError: true };
  }
  return { output: r.stdout || '(工作区干净)', isError: false };
}

export async function executeGitDiff(input: Record<string, any>): Promise<ToolResult> {
  let args = 'diff';
  if (input.staged) args += ' --staged';
  if (input.stat) args += ' --stat';
  if (input.branch) args += ` ${input.branch}`;
  // Show binary diff info when not using --stat
  if (!input.stat) args += ' --binary';
  if (input.path) args += ` -- ${input.path}`;

  const r = await git(args);
  if (r.code !== 0) {
    if (r.stderr.includes('not a git repository')) {
      return { output: '当前目录不是 Git 仓库', isError: true };
    }
    return { output: `git diff 失败: ${r.stderr}`, isError: true };
  }
  if (r.stdout.includes('Binary files') && !r.stdout.includes('GIT binary patch')) {
    return { output: r.stdout || '(二进制文件有差异)', isError: false };
  }
  return { output: r.stdout || '(无差异)', isError: false };
}

export async function executeGitLog(input: Record<string, any>): Promise<ToolResult> {
  const limit = input.limit || 20;
  const args = ['log', `-${limit}`];
  if (input.oneline !== false) args.push('--oneline');
  args.push('--graph', '--decorate');
  if (input.author) args.push(`--author=${input.author}`);
  if (input.since) args.push(`--since=${input.since}`);
  if (input.grep) args.push(`--grep=${input.grep}`);
  if (input.path) args.push('--', input.path);

  const r = await gitExecFile(args);
  if (r.code !== 0) {
    if (r.stderr.includes('not a git repository')) {
      return { output: '当前目录不是 Git 仓库', isError: true };
    }
    if (r.stderr.includes('does not have any commits') || r.stderr.includes('bad default revision')) {
      return { output: '(空仓库，暂无提交历史)', isError: false };
    }
    return { output: `git log 失败: ${r.stderr}`, isError: true };
  }
  return { output: r.stdout || '(无提交历史)', isError: false };
}

export async function executeGitBranch(input: Record<string, any>): Promise<ToolResult> {
  switch (input.action) {
    case 'list': {
      const flag = input.remote ? '-r' : '';
      const r = await git(`branch ${flag} -v`);
      if (r.code !== 0) {
        if (r.stderr.includes('not a git repository')) {
          return { output: '当前目录不是 Git 仓库', isError: true };
        }
        return { output: `列出分支失败: ${r.stderr}`, isError: true };
      }
      return { output: r.stdout || '(无分支)', isError: false };
    }
    case 'create': {
      if (!input.name) return { output: '创建分支需要指定 name 参数', isError: true };
      if (!isValidBranchName(input.name)) {
        return { output: `无效的分支名: "${input.name}"。分支名不能包含空格、~、^、:、?、*、[、\\、.. 等字符`, isError: true };
      }
      const r = await git(`branch ${input.name}`);
      return { output: r.code === 0 ? `已创建分支: ${input.name}` : r.stderr, isError: r.code !== 0 };
    }
    case 'delete': {
      if (!input.name) return { output: '删除分支需要指定 name 参数', isError: true };
      const r = await git(`branch -d ${input.name}`);
      return { output: r.code === 0 ? `已删除分支: ${input.name}` : r.stderr, isError: r.code !== 0 };
    }
    case 'switch': {
      if (!input.name) return { output: '切换分支需要指定 name 参数', isError: true };
      const r = await git(`checkout ${input.name}`);
      return { output: r.stdout || r.stderr, isError: r.code !== 0 };
    }
    case 'current': {
      const r = await git('branch --show-current');
      if (r.code !== 0) {
        if (r.stderr.includes('not a git repository')) {
          return { output: '当前目录不是 Git 仓库', isError: true };
        }
        return { output: `获取当前分支失败: ${r.stderr}`, isError: true };
      }
      return { output: r.stdout || '(detached HEAD)', isError: false };
    }
    default:
      return { output: `未知操作: ${input.action}`, isError: true };
  }
}

export async function executeGitCommit(input: Record<string, any>): Promise<ToolResult> {
  // 暂存文件
  if (input.all) {
    await git('add -A');
  } else if (input.files && input.files.length > 0) {
    for (const file of input.files) {
      await git(`add "${file}"`);
    }
  }

  const args = ['commit', '-m', input.message];
  if (input.amend) args.push('--amend');
  const r = await gitExecFile(args);

  if (r.code !== 0) {
    if (r.stderr.includes('nothing to commit') || r.stderr.includes('no changes added')) {
      return { output: '没有可提交的更改', isError: true };
    }
    if (r.stderr.includes('nothing staged')) {
      return { output: '没有暂存的更改。请先 git add 文件或使用 all: true', isError: true };
    }
    return { output: `提交失败: ${r.stderr}`, isError: true };
  }

  return {
    output: r.stdout || r.stderr,
    isError: false,
  };
}

export async function executeGitCheckout(input: Record<string, any>): Promise<ToolResult> {
  // Warn about uncommitted changes before switching branches
  if (!input.file && !input.create) {
    const status = await git('status --porcelain');
    if (status.stdout.length > 0) {
      const changedCount = status.stdout.split('\n').filter(Boolean).length;
      // Include the warning in the output but still proceed
      const args = `checkout ${input.target}`;
      const r = await git(args);
      if (r.code !== 0) {
        return { output: `切换失败（有 ${changedCount} 个未提交的更改）: ${r.stderr}`, isError: true };
      }
      return { output: `${r.stdout || r.stderr}\n(注意: 有 ${changedCount} 个未提交的更改)`, isError: false };
    }
  }

  if (input.file) {
    const r = await git(`checkout -- ${input.target}`);
    if (r.code !== 0) {
      if (r.stderr.includes('did not match')) {
        return { output: `文件未找到: ${input.target}`, isError: true };
      }
      return { output: `恢复文件失败: ${r.stderr}`, isError: true };
    }
    return { output: r.stdout || `已恢复文件: ${input.target}`, isError: false };
  }

  let args = 'checkout';
  if (input.create) args += ' -b';
  args += ` ${input.target}`;

  const r = await git(args);
  if (r.code !== 0) {
    if (r.stderr.includes('already exists')) {
      return { output: `分支已存在: ${input.target}`, isError: true };
    }
    if (r.stderr.includes('did not match')) {
      return { output: `分支或路径不存在: ${input.target}`, isError: true };
    }
    return { output: `checkout 失败: ${r.stderr}`, isError: true };
  }
  return { output: r.stdout || r.stderr, isError: false };
}

export async function executeGitStash(input: Record<string, any>): Promise<ToolResult> {
  switch (input.action) {
    case 'push': {
      const args = ['stash', 'push'];
      if (input.message) args.push('-m', input.message);
      const r = await gitExecFile(args);
      if (r.code !== 0) {
        if (r.stderr.includes('No local changes')) {
          return { output: '没有本地更改可暂存', isError: false };
        }
        return { output: `stash push 失败: ${r.stderr}`, isError: true };
      }
      return { output: r.stdout || r.stderr, isError: false };
    }
    case 'pop': {
      const idx = input.index !== undefined ? ` stash@{${input.index}}` : '';
      const r = await git(`stash pop${idx}`);
      if (r.code !== 0) {
        if (r.stderr.includes('is not a stash')) {
          return { output: `暂存索引不存在: ${input.index}`, isError: true };
        }
        return { output: `stash pop 失败: ${r.stderr}`, isError: true };
      }
      return { output: r.stdout || r.stderr, isError: false };
    }
    case 'list': {
      const r = await git('stash list');
      return { output: r.stdout || '(无暂存)', isError: r.code !== 0 };
    }
    case 'drop': {
      const idx = input.index !== undefined ? ` stash@{${input.index}}` : '';
      const r = await git(`stash drop${idx}`);
      if (r.code !== 0) {
        return { output: `stash drop 失败: ${r.stderr}`, isError: true };
      }
      return { output: r.stdout || '已删除', isError: false };
    }
    case 'show': {
      const idx = input.index !== undefined ? ` stash@{${input.index}}` : '';
      const r = await git(`stash show -p${idx}`);
      return { output: r.stdout || '(无暂存)', isError: r.code !== 0 };
    }
    default:
      return { output: `未知操作: ${input.action}`, isError: true };
  }
}

export async function executeGitPr(input: Record<string, any>): Promise<ToolResult> {
  // 检查 gh CLI (cached)
  if (!(await isGhAvailable())) {
    return { output: '需要安装 GitHub CLI (gh)。安装: https://cli.github.com/', isError: true };
  }

  switch (input.action) {
    case 'create': {
      const args = ['pr', 'create'];
      if (input.title) args.push('--title', input.title);
      if (input.body) args.push('--body', input.body);
      if (input.base) args.push('--base', input.base);
      const r = await gh(args);
      if (r.code !== 0) {
        if (r.stderr.includes('no commits between')) {
          return { output: `创建 PR 失败: 目标分支与当前分支之间没有差异`, isError: true };
        }
        return { output: `创建 PR 失败: ${r.stderr}`, isError: true };
      }
      return { output: r.stdout, isError: false };
    }
    case 'view': {
      const args = ['pr', 'view'];
      if (input.number) args.push(String(input.number));
      const r = await gh(args);
      if (r.code !== 0) {
        if (r.stderr.includes('no pull requests')) {
          return { output: '当前仓库没有 PR', isError: true };
        }
        return { output: `查看 PR 失败: ${r.stderr}`, isError: true };
      }
      return { output: r.stdout, isError: false };
    }
    case 'list': {
      const r = await gh(['pr', 'list', '--limit', '20']);
      return { output: r.stdout || '(无 PR)', isError: r.code !== 0 };
    }
    case 'merge': {
      const args = ['pr', 'merge'];
      if (input.number) args.push(String(input.number));
      args.push('--merge');
      const r = await gh(args);
      if (r.code !== 0) {
        if (r.stderr.includes('not mergeable')) {
          return { output: 'PR 无法合并，可能有冲突或检查未通过', isError: true };
        }
        return { output: `合并 PR 失败: ${r.stderr}`, isError: true };
      }
      return { output: r.stdout || 'PR 已合并', isError: false };
    }
    default:
      return { output: `未知操作: ${input.action}`, isError: true };
  }
}

export async function executeGitBlame(input: Record<string, any>): Promise<ToolResult> {
  if (!input.path) return { output: 'blame 需要指定 path 参数', isError: true };

  // Check if file is binary
  const check = await git(`check-attr binary -- "${input.path}"`);
  if (check.stdout.includes('binary: set') || check.stdout.includes('binary: true')) {
    return { output: `无法对二进制文件执行 blame: ${input.path}`, isError: true };
  }

  // Warn about large files (check line count if no range specified)
  if (!input.range) {
    const lineCount = await git(`wc -l < "${input.path}"`);
    const lines = parseInt(lineCount.stdout, 10);
    if (!isNaN(lines) && lines > 5000) {
      // Auto-limit to first 500 lines for large files
      let args = `blame -L 1,500 "${input.path}"`;
      const r = await git(args);
      return {
        output: `文件有 ${lines} 行，仅显示前 500 行。使用 range 参数指定范围。\n${r.stdout || r.stderr}`,
        isError: r.code !== 0,
      };
    }
  }

  let args = `blame`;
  if (input.range) args += ` -L ${input.range}`;
  args += ` "${input.path}"`;

  const r = await git(args);
  return { output: r.stdout || r.stderr, isError: r.code !== 0 };
}

// ── GitHub Issue 管理 ──────────────────────────────

export const gitIssueTool: ToolDefinition = {
  name: 'git_issue',
  description: `GitHub Issue 操作（需要 gh CLI）。create/view/list/comment。需审批。`,
  input_schema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['create', 'view', 'list', 'close', 'comment', 'reopen'], description: '操作类型' },
      number: { type: 'number', description: 'Issue 编号（view/close/comment/reopen 时）' },
      title: { type: 'string', description: 'Issue 标题（create 时）' },
      body: { type: 'string', description: 'Issue 内容或评论内容' },
      labels: { type: 'array', items: { type: 'string' }, description: '标签列表（create 时）' },
      assignees: { type: 'array', items: { type: 'string' }, description: '指派人列表' },
      limit: { type: 'number', description: '列表条数（默认 20）' },
      state: { type: 'string', enum: ['open', 'closed', 'all'], description: '状态过滤（list 时）' },
    },
    required: ['action'],
  },
  permission: 'ask',
};

export const gitReleaseTool: ToolDefinition = {
  name: 'git_release',
  description: `GitHub Release 操作（需要 gh CLI）。create/view/list。需审批。`,
  input_schema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['create', 'list', 'view'], description: '操作类型' },
      tag: { type: 'string', description: 'Release tag（create/view 时）' },
      title: { type: 'string', description: 'Release 标题' },
      notes: { type: 'string', description: 'Release 说明' },
      draft: { type: 'boolean', description: '是否为草稿' },
      prerelease: { type: 'boolean', description: '是否为预发布' },
    },
    required: ['action'],
  },
  permission: 'ask',
};

async function gh(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('gh', args, {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
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

export async function executeGitIssue(input: Record<string, any>): Promise<ToolResult> {
  if (!(await isGhAvailable())) {
    return { output: '需要安装 GitHub CLI (gh)。安装: https://cli.github.com/', isError: true };
  }

  switch (input.action) {
    case 'create': {
      if (!input.title) return { output: '创建 Issue 需要指定 title 参数', isError: true };
      const args = ['issue', 'create'];
      args.push('--title', input.title);
      if (input.body) args.push('--body', input.body);
      if (input.labels?.length) args.push('--label', input.labels.join(','));
      if (input.assignees?.length) args.push('--assignee', input.assignees.join(','));
      const r = await gh(args);
      return { output: r.code === 0 ? r.stdout : `创建 Issue 失败: ${r.stderr}`, isError: r.code !== 0 };
    }
    case 'view': {
      if (!input.number) return { output: '查看 Issue 需要指定 number 参数', isError: true };
      const r = await gh(['issue', 'view', String(input.number)]);
      if (r.code !== 0) return { output: `查看 Issue #${input.number} 失败: ${r.stderr}`, isError: true };
      return { output: r.stdout, isError: false };
    }
    case 'list': {
      const limit = input.limit || 20;
      const state = input.state || 'open';
      const r = await gh(['issue', 'list', '--limit', String(limit), '--state', state]);
      return { output: r.stdout || '(无 Issue)', isError: r.code !== 0 };
    }
    case 'close': {
      if (!input.number) return { output: '关闭 Issue 需要指定 number 参数', isError: true };
      const r = await gh(['issue', 'close', String(input.number)]);
      return { output: r.code === 0 ? '已关闭' : `关闭失败: ${r.stderr}`, isError: r.code !== 0 };
    }
    case 'reopen': {
      if (!input.number) return { output: '重新打开 Issue 需要指定 number 参数', isError: true };
      const r = await gh(['issue', 'reopen', String(input.number)]);
      return { output: r.code === 0 ? '已重新打开' : `重新打开失败: ${r.stderr}`, isError: r.code !== 0 };
    }
    case 'comment': {
      if (!input.number) return { output: '评论需要指定 number 参数', isError: true };
      if (!input.body) return { output: '评论需要指定 body 参数', isError: true };
      const r = await gh(['issue', 'comment', String(input.number), '--body', input.body]);
      return { output: r.code === 0 ? '已评论' : `评论失败: ${r.stderr}`, isError: r.code !== 0 };
    }
    default:
      return { output: `未知操作: ${input.action}`, isError: true };
  }
}

export async function executeGitRelease(input: Record<string, any>): Promise<ToolResult> {
  if (!(await isGhAvailable())) {
    return { output: '需要安装 GitHub CLI (gh)。安装: https://cli.github.com/', isError: true };
  }

  switch (input.action) {
    case 'create': {
      if (!input.tag) return { output: '创建 Release 需要指定 tag 参数', isError: true };
      const args = ['release', 'create', input.tag];
      if (input.title) args.push('--title', input.title);
      if (input.notes) args.push('--notes', input.notes);
      if (input.draft) args.push('--draft');
      if (input.prerelease) args.push('--prerelease');
      const r = await gh(args);
      return { output: r.code === 0 ? r.stdout : `创建 Release 失败: ${r.stderr}`, isError: r.code !== 0 };
    }
    case 'list': {
      const r = await gh(['release', 'list', '--limit', '20']);
      return { output: r.stdout || '(无 Release)', isError: r.code !== 0 };
    }
    case 'view': {
      if (!input.tag) return { output: '查看 Release 需要指定 tag 参数', isError: true };
      const r = await gh(['release', 'view', input.tag]);
      if (r.code !== 0) return { output: `查看 Release ${input.tag} 失败: ${r.stderr}`, isError: true };
      return { output: r.stdout, isError: false };
    }
    default:
      return { output: `未知操作: ${input.action}`, isError: true };
  }
}
