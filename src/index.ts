#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig } from './config/loader';
import { MimoAgent } from './core/agent';
import { createApiClient } from './api/auth';
import { MemoryStore } from './memory/store';
import { MemoryExtractor } from './memory/extractor';
import { ToolRegistry } from './tools/registry';
import { SkillRegistry } from './skills/registry';
import { ModelRouter } from './core/router';
import { Charter } from './core/charter';
import { DynamicAgentLoader } from './dynamic-agents/loader';
import { SlashCommandLoader } from './slash-commands/loader';
import { HookManager } from './hooks/manager';
import { MCPClient } from './mcp/client';
import { Scheduler } from './scheduler/manager';
import { createFeatureRegistry } from './features';
import { printBanner, printError, printSuccess, printInfo, printWarning } from './tui/output';
import { showSplashScreen } from './tui/splash';
import { NonInteractiveRunner } from './core/non-interactive';
import { EXIT_SUCCESS, EXIT_ERROR, EXIT_AUTH_ERROR } from './core/exit-codes';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

dotenv.config({ override: true });

// ── 首次启动检测 ──────────────────────────────
async function needsSetup(): Promise<boolean> {
  // 环境变量有 API Key → 不需要 setup
  if (process.env.ANTHROPIC_API_KEY) return false;

  const configPath = path.join(os.homedir(), '.mimo', 'config.toml');
  try {
    const content = await fs.promises.readFile(configPath, 'utf-8');
    // 文件存在且有非空 API Key → 不需要 setup
    if (content.includes('apiKey = "') && !content.includes('apiKey = ""')) {
      return false;
    }
    return true;
  } catch {
    // 文件不存在 → 首次启动
    return true;
  }
}

// ── Read stdin (for piped input in non-interactive mode) ──
async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8').trim()));
    process.stdin.on('error', reject);
  });
}

const program = new Command();

program
  .name('mimo')
  .description('MIMO CLI Code - Xiaomi 终端编程智能体 (MiMO AI)')
  .version('1.0.0');

// ── 全局 pre-action hook：每次命令执行前清除屏幕 + 显示加载画面 ──
let splashShown = false;
program.hook('preAction', async () => {
  // Skip splash screen in non-interactive mode (--print or --json)
  const args = process.argv.slice(2);
  const isNonInteractive = args.includes('--print') || args.includes('--json');
  if (!splashShown && !isNonInteractive) {
    splashShown = true;
    await showSplashScreen();
  }
});

// ── 主命令 ──────────────────────────────────────────
program
  .argument('[prompt]', '初始提示')
  .option('-m, --model <model>', '模型 (auto|mimo-v2.5-pro|mimo-v2.5)', 'auto')
  .option('--mode <mode>', '模式 (plan|agent|yolo)', 'agent')
  .option('--api-mode <apiMode>', 'API (token-plan|pay-as-you-go)', 'token-plan')
  .option('--max-turns <n>', '最大轮数', '50')
  .option('--no-stream', '禁用流式')
  .option('--thinking', '启用思考模式')
  .option('--print', '非交互模式：输出响应并退出')
  .option('--json', '非交互模式：JSON 输出并退出')
  .option('--timeout <sec>', '非交互模式超时（秒）', '300')
  .option('--quiet', '抑制非必要输出')
  .action(async (prompt: string | undefined, options: any) => {
    try {
      const isNonInteractive = !!(options.print || options.json);

      // In non-interactive mode, read prompt from stdin if not provided as argument
      if (isNonInteractive && !prompt) {
        if (process.stdin.isTTY) {
          // No piped input and no argument — error
          printError('No prompt provided. Usage: mimo --print "your prompt" or echo "prompt" | mimo --print');
          process.exit(EXIT_ERROR);
        }
        // Read from stdin (piped input)
        prompt = await readStdin();
        if (!prompt) {
          printError('No input received from stdin');
          process.exit(EXIT_ERROR);
        }
      }

      // 首次启动或 API Key 缺失时自动进入设置向导
      if (await needsSetup()) {
        if (isNonInteractive) {
          printError('API key not configured. Run "mimo init" first.');
          process.exit(EXIT_AUTH_ERROR);
        }
        const { initConfig } = await import('./config/init');
        await initConfig();
        console.log('');
        // 配置完成，继续加载主界面（不退出）
      }

      const config = await loadConfig(options);

      // ── Non-interactive mode ──────────────────────────
      if (isNonInteractive) {
        const apiClient = createApiClient(config);
        const memory = new MemoryStore(path.join(os.homedir(), '.mimo', 'memory'));
        await memory.init();
        const extractor = new MemoryExtractor(apiClient);
        const tools = new ToolRegistry('yolo');
        const skills = new SkillRegistry();
        await skills.init();
        const router = new ModelRouter(config.api.model, config.api.tokenPlan.baseUrl || config.api.payAsYouGo.baseUrl);
        const charter = new Charter();

        const dynamicAgents = new DynamicAgentLoader();
        await dynamicAgents.loadAll();

        const slashCommands = new SlashCommandLoader();
        await slashCommands.loadAll();

        const hooks = new HookManager();
        await hooks.loadFromConfig();

        const mcpClient = new MCPClient();
        const mcpConfigPaths = [
          path.join(process.cwd(), '.claude', 'mcp.json'),
          path.join(process.cwd(), '.mimo', 'mcp.json'),
          path.join(os.homedir(), '.claude', 'mcp.json'),
          path.join(os.homedir(), '.mimo', 'mcp.json'),
        ];
        for (const mcpPath of mcpConfigPaths) {
          await mcpClient.loadFromConfig(mcpPath);
        }

        // Load features (for tool registration only)
        const featureRegistry = createFeatureRegistry();
        if (config.features?.enabled !== false) {
          for (const id of config.features?.disabledFeatures || []) {
            featureRegistry.setEnabled(id, false);
          }
          await featureRegistry.init({
            projectDir: process.cwd(),
            homeDir: os.homedir(),
            memoryDir: path.join(os.homedir(), '.mimo', 'memory'),
            config: config as any,
            emit: (event: string, data: any) => { featureRegistry.emitEvent(event, data); },
          });
          const featureToolDefs = featureRegistry.getAllTools();
          tools.setFeatureTools(featureToolDefs);
        }

        const runner = new NonInteractiveRunner(
          {
            config,
            apiClient,
            memory,
            extractor,
            tools,
            router,
            charter,
            skills,
            dynamicAgents,
            slashCommands,
            hooks,
            mcpClient,
          },
          {
            format: options.json ? 'json' : 'text',
            timeout: parseInt(options.timeout || '300', 10),
            quiet: !!options.quiet,
          }
        );

        const result = await runner.run(prompt!);

        // Output result
        if (options.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        } else if (result.response) {
          process.stdout.write(result.response + '\n');
        }

        // Cleanup
        try { await mcpClient.disconnectAll(); } catch {}
        try { await featureRegistry.cleanup(); } catch {}

        process.exit(result.exitCode);
        return;
      }

      // ── Interactive mode (original flow) ──────────────
      printBanner(config);

      const apiClient = createApiClient(config);
      const memory = new MemoryStore(path.join(os.homedir(), '.mimo', 'memory'));
      await memory.init();

      const extractor = new MemoryExtractor(apiClient);
      const tools = new ToolRegistry(config.agent.mode);
      const skills = new SkillRegistry();
      await skills.init();
      const router = new ModelRouter(config.api.model);
      const charter = new Charter();

      // 动态 Agent 加载
      const dynamicAgents = new DynamicAgentLoader();
      await dynamicAgents.loadAll();

      // Slash 命令加载
      const slashCommands = new SlashCommandLoader();
      await slashCommands.loadAll();

      // Hooks 加载（从 settings.json 自动读取）
      const hooks = new HookManager();
      await hooks.loadFromConfig();

      // MCP Client（从 .claude/mcp.json 和 ~/.claude/mcp.json 加载）
      const mcpClient = new MCPClient();
      const mcpConfigPaths = [
        path.join(process.cwd(), '.claude', 'mcp.json'),
        path.join(process.cwd(), '.mimo', 'mcp.json'),
        path.join(os.homedir(), '.claude', 'mcp.json'),
        path.join(os.homedir(), '.mimo', 'mcp.json'),
      ];
      for (const mcpPath of mcpConfigPaths) {
        await mcpClient.loadFromConfig(mcpPath);
      }

      // 定时任务系统
      const scheduler = new Scheduler(async (task) => {
        printInfo(`定时任务触发: ${task.id} - ${task.description}`);
      });
      await scheduler.init();

      // 55 项创新功能系统
      const featureRegistry = createFeatureRegistry();
      if (config.features?.enabled !== false) {
        // Disable explicitly disabled features
        for (const id of config.features?.disabledFeatures || []) {
          featureRegistry.setEnabled(id, false);
        }
        await featureRegistry.init({
          projectDir: process.cwd(),
          homeDir: os.homedir(),
          memoryDir: path.join(os.homedir(), '.mimo', 'memory'),
          config: config as any,
          emit: (event: string, data: any) => { featureRegistry.emitEvent(event, data); },
        });
        // Inject feature tools into ToolRegistry
        const featureToolDefs = featureRegistry.getAllTools();
        tools.setFeatureTools(featureToolDefs);
        printInfo(`已加载 ${featureRegistry.getEnabled().length} 项创新功能 (${featureToolDefs.length} 个工具)`);
      }

      const agent = new MimoAgent({
        config,
        apiClient,
        memory,
        extractor,
        tools,
        router,
        charter,
        skills,
        dynamicAgents,
        slashCommands,
        hooks,
        mcpClient,
      });

      if (prompt) {
        await agent.run(prompt);
      } else {
        await agent.startInteractive();
      }

      await agent.onSessionEnd();
      await mcpClient.disconnectAll();
      scheduler.stop();
      await featureRegistry.cleanup();
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

// ── init ────────────────────────────────────────────
program.command('init').description('初始化配置').action(async () => {
  const { initConfig } = await import('./config/init');
  await initConfig();
});

// ── memory ──────────────────────────────────────────
const memoryCmd = program.command('memory').description('记忆管理');
memoryCmd.command('list').option('-t, --type <type>', '类型过滤').action(async (opts: any) => {
  const m = new MemoryStore(path.join(os.homedir(), '.mimo', 'memory'));
  await m.init();
  const list = await m.list(opts.type ? [opts.type] : undefined);
  if (!list.length) { console.log('暂无记忆'); return; }
  for (const e of list) console.log(`  [${e.type}] ${e.id} - ${e.description}`);
});
memoryCmd.command('show <id>').action(async (id: string) => {
  const m = new MemoryStore(path.join(os.homedir(), '.mimo', 'memory'));
  await m.init();
  const c = await m.read(id);
  c ? console.log(c) : printError(`记忆 "${id}" 不存在`);
});
memoryCmd.command('search <query>').action(async (q: string) => {
  const m = new MemoryStore(path.join(os.homedir(), '.mimo', 'memory'));
  await m.init();
  const r = await m.search(q);
  if (!r.length) { console.log('未找到'); return; }
  for (const e of r) console.log(`  [${e.type}] ${e.id} - ${e.description}`);
});
memoryCmd.command('remove <id>').action(async (id: string) => {
  const m = new MemoryStore(path.join(os.homedir(), '.mimo', 'memory'));
  await m.init();
  await m.remove(id);
  printSuccess(`已删除: ${id}`);
});
memoryCmd.command('export').option('-o, --output <path>', '输出', './mimo-memory-backup.json').action(async (opts: any) => {
  const m = new MemoryStore(path.join(os.homedir(), '.mimo', 'memory'));
  await m.init();
  await m.exportAll(opts.output);
  printSuccess(`已导出到: ${opts.output}`);
});
memoryCmd.command('import <path>').action(async (p: string) => {
  const m = new MemoryStore(path.join(os.homedir(), '.mimo', 'memory'));
  await m.init();
  const n = await m.importAll(p);
  printSuccess(`已导入 ${n} 条`);
});

// ── skills ──────────────────────────────────────────
const skillsCmd = program.command('skills').description('技能管理');
skillsCmd.command('list').option('-c, --category <cat>', '类别').action(async (opts: any) => {
  const s = new SkillRegistry();
  await s.init();
  for (const cat of s.getCategories()) {
    if (opts.category && cat !== opts.category) continue;
    console.log(`\n  \x1b[1m${cat}\x1b[0m`);
    for (const sk of s.listSkills(cat)) {
      console.log(`    ${sk.icon} ${sk.id} - ${sk.description}`);
    }
  }
});
skillsCmd.command('show <id>').action(async (id: string) => {
  const s = new SkillRegistry();
  await s.init();
  const sk = s.getSkill(id);
  if (!sk) { printError(`技能 "${id}" 不存在`); return; }
  console.log(`\n  ${sk.icon} ${sk.name}\n  ${sk.description}\n  类别: ${sk.category}\n  触发: ${sk.triggers.join(', ')}`);
});

// ── config ──────────────────────────────────────────
program.command('config').description('查看配置').action(async () => {
  console.log(JSON.stringify(await loadConfig({}), null, 2));
});

// ── mcp ─────────────────────────────────────────────
program.command('mcp').description('MCP 信息').action(() => {
  const serverPath = path.resolve(__dirname, 'mcp', 'memory-server.js');
  const memDir = path.join(os.homedir(), '.mimo', 'memory');
  console.log(`
  MIMO Memory MCP Server

  Claude Code 配置 (添加到 .claude/mcp.json):
  {
    "mcpServers": {
      "mimo-memory": {
        "command": "node",
        "args": ["${serverPath}"],
        "env": { "MIMO_MEMORY_DIR": "${memDir}" }
      }
    }
  }

  工具: memory_save/read/search/list/delete/context
        session_list/read
        memory_export/import
`);
});

// ── agents ──────────────────────────────────────────
program.command('agents').description('列出动态 Agent').action(async () => {
  const loader = new DynamicAgentLoader();
  await loader.loadAll();
  const agents = loader.listAgents();
  if (!agents.length) { console.log('无自定义 Agent。在 .mimo/agents/ 或 .claude/agents/ 中添加 .md 文件'); return; }
  for (const a of agents) {
    console.log(`  ${a.name} - ${a.description}`);
  }
});

// ── commands ────────────────────────────────────────
program.command('commands').description('列出 Slash 命令').action(async () => {
  const loader = new SlashCommandLoader();
  await loader.loadAll();
  const cmds = loader.listCommands();
  console.log(`\n  共 ${cmds.length} 个命令\n`);
  for (const c of cmds) {
    const cat = c.category ? `[${c.category}]` : '';
    console.log(`  /${c.name} ${cat} - ${c.description}`);
  }
});

// ── features ────────────────────────────────────────
program.command('features').description('列出 55 项创新功能').option('-c, --category <cat>', '类别过滤').action(async (opts: any) => {
  const registry = createFeatureRegistry();
  const all = registry.getAll();
  const categories: Record<string, typeof all> = {};
  for (const f of all) {
    if (opts.category && f.meta.category !== opts.category) continue;
    if (!categories[f.meta.category]) categories[f.meta.category] = [];
    categories[f.meta.category].push(f);
  }
  console.log(`\n  MIMO 创新功能系统 — 共 ${all.length} 项\n`);
  for (const [cat, features] of Object.entries(categories)) {
    console.log(`  \x1b[1m${cat}\x1b[0m`);
    for (const f of features) {
      const icon = f.meta.enabled ? '✓' : '○';
      const tools = f.getTools ? f.getTools().length : 0;
      console.log(`    ${icon} [${f.meta.priority}] ${f.meta.name} (${tools} tools)`);
      console.log(`      ${f.meta.description}`);
    }
    console.log('');
  }
});

// ── schedule ────────────────────────────────────────
const scheduleCmd = program.command('schedule').description('定时任务管理');
scheduleCmd.command('list').action(async () => {
  const scheduler = new Scheduler();
  await scheduler.init();
  const tasks = scheduler.list();
  if (!tasks.length) { console.log('无定时任务'); return; }
  for (const t of tasks) {
    const status = t.enabled ? '🟢' : '🔴';
    const schedule = t.cronExpression || t.fireAt || '手动';
    console.log(`  ${status} ${t.id} [${schedule}] - ${t.description}`);
  }
  scheduler.stop();
});
scheduleCmd.command('create <id>').requiredOption('--prompt <prompt>', '执行提示').option('--cron <cron>', 'Cron 表达式').option('--at <time>', '一次性执行时间 (ISO)').option('--desc <desc>', '描述').action(async (id: string, opts: any) => {
  const scheduler = new Scheduler();
  await scheduler.init();
  await scheduler.create({
    id,
    prompt: opts.prompt,
    description: opts.desc || id,
    cronExpression: opts.cron,
    fireAt: opts.at,
    recurring: !!opts.cron,
  });
  printSuccess(`已创建定时任务: ${id}`);
  scheduler.stop();
});
scheduleCmd.command('remove <id>').action(async (id: string) => {
  const scheduler = new Scheduler();
  await scheduler.init();
  await scheduler.remove(id);
  printSuccess(`已删除: ${id}`);
  scheduler.stop();
});

program.parse(process.argv);
