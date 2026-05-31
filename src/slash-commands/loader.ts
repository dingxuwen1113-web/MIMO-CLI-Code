// ── Slash Commands 动态加载系统 ────────────────────

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface SlashCommand {
  name: string;
  description: string;
  prompt: string;
  category?: string;
  args?: string;
}

export class SlashCommandLoader {
  private commands: Map<string, SlashCommand> = new Map();
  private searchPaths: string[];

  constructor(searchPaths?: string[]) {
    const homeDir = os.homedir();
    this.searchPaths = searchPaths || [
      path.join(process.cwd(), '.claude', 'commands'),
      path.join(process.cwd(), '.mimo', 'commands'),
      path.join(homeDir, '.claude', 'commands'),
      path.join(homeDir, '.mimo', 'commands'),
    ];
  }

  async loadAll(): Promise<void> {
    // 内置命令
    this.registerBuiltin();

    // 从文件加载
    for (const searchPath of this.searchPaths) {
      await this.loadFromDir(searchPath, '');
    }
  }

  private async loadFromDir(dir: string, prefix: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await this.loadFromDir(fullPath, prefix ? `${prefix}:${entry.name}` : entry.name);
        } else if (entry.name.endsWith('.md')) {
          const name = entry.name.replace('.md', '');
          const fullName = prefix ? `${prefix}:${name}` : name;
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const cmd = this.parseCommand(fullName, content);
            this.commands.set(cmd.name, cmd);
          } catch { /* skip */ }
        }
      }
    } catch { /* dir doesn't exist */ }
  }

  private parseCommand(name: string, content: string): SlashCommand {
    let description = '';
    let prompt = content;
    let category = '';
    let args = '';

    if (content.startsWith('---')) {
      const endIdx = content.indexOf('---', 3);
      if (endIdx !== -1) {
        const fm = content.slice(3, endIdx).trim();
        prompt = content.slice(endIdx + 3).trim();

        for (const line of fm.split('\n')) {
          const colonIdx = line.indexOf(':');
          if (colonIdx === -1) continue;
          const key = line.slice(0, colonIdx).trim();
          const value = line.slice(colonIdx + 1).trim();
          switch (key) {
            case 'description': description = value; break;
            case 'category': category = value; break;
            case 'args': args = value; break;
          }
        }
      }
    }

    return { name, description, prompt, category, args };
  }

  private registerBuiltin(): void {
    const builtins: SlashCommand[] = [
      {
        name: 'review',
        description: 'Run auto-review on the current diff for bugs, security issues, and performance problems',
        prompt: 'Use the auto_review tool to analyze the current git diff. Review for:\n1. Correctness bugs\n2. Security vulnerabilities\n3. Performance problems\n4. Style issues that affect maintainability\n\nUse the auto_review tool with target "staged" first. If no staged changes, try "unstaged". Sort findings by severity. For each finding, explain the issue and suggest a fix.',
        category: 'code',
      },
      {
        name: 'simplify',
        description: '审查变更代码，寻找简化和复用机会',
        prompt: '审查当前变更的代码，专注于：\n1. 可以复用的模式\n2. 可以简化的逻辑\n3. 可以提升的效率\n\n只关注质量改进，不寻找 bug。',
        category: 'code',
      },
      {
        name: 'security-review',
        description: '安全审计：检查 OWASP Top 10 漏洞',
        prompt: '对当前代码进行安全审计。检查 OWASP Top 10：\n1. 注入\n2. 认证失效\n3. 敏感数据暴露\n4. XXE\n5. 访问控制失效\n6. 安全配置错误\n7. XSS\n8. 不安全的反序列化\n9. 使用含已知漏洞的组件\n10. 日志和监控不足',
        category: 'security',
      },
      {
        name: 'test',
        description: '为当前变更编写测试',
        prompt: '为当前变更的代码编写全面的测试。包括：\n1. 单元测试（正常路径）\n2. 边界条件测试\n3. 错误处理测试\n4. 使用项目现有的测试框架和风格',
        category: 'testing',
      },
      {
        name: 'explain',
        description: '解释当前代码的工作原理',
        prompt: '解释当前代码的工作原理。包括：\n1. 整体架构\n2. 关键数据流\n3. 重要设计决策\n4. 潜在的改进点',
        category: 'docs',
      },
      {
        name: 'commit',
        description: '分析变更并创建语义化 commit',
        prompt: '分析当前 git diff，生成一个符合 Conventional Commits 规范的提交：\n1. 类型: feat/fix/refactor/docs/test/chore\n2. 简短描述（<72字符）\n3. 详细说明（为什么，不是什么）\n\n然后执行 git add 和 git commit。',
        category: 'git',
      },
      {
        name: 'pr',
        description: '创建 Pull Request',
        prompt: '分析当前分支相对于 main 的所有变更，创建 PR：\n1. 标题（<72字符）\n2. 摘要（3个要点）\n3. 测试计划\n\n使用 gh pr create。',
        category: 'git',
      },
      {
        name: 'debug',
        description: '系统化调试当前问题',
        prompt: '系统化调试当前问题：\n1. 收集信息（错误消息、日志、复现步骤）\n2. 形成假设\n3. 验证假设（添加日志/断点/测试）\n4. 定位根因\n5. 修复并验证',
        category: 'debug',
      },
      {
        name: 'refactor',
        description: '重构代码，保持行为不变',
        prompt: '重构当前代码：\n1. 先确保有测试覆盖\n2. 识别代码异味（重复、过长、过深嵌套）\n3. 逐步重构，每步后验证\n4. 确保行为完全不变',
        category: 'code',
      },
      {
        name: 'document',
        description: '为代码生成文档',
        prompt: '为当前代码生成文档：\n1. README 更新\n2. API 文档\n3. 使用示例\n4. 注意事项和限制\n保持简洁实用。',
        category: 'docs',
      },
    ];

    for (const cmd of builtins) {
      this.commands.set(cmd.name, cmd);
    }
  }

  getCommand(name: string): SlashCommand | undefined {
    return this.commands.get(name);
  }

  listCommands(category?: string): SlashCommand[] {
    const all = Array.from(this.commands.values());
    if (category) return all.filter((c) => c.category === category);
    return all;
  }
}
