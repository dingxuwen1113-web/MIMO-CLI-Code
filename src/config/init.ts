import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import chalk from 'chalk';
import { saveConfig } from './loader';

// ── 小米 MIMO 色彩 ──────────────────────────────

const O     = '#FF6900';
const O_DIM = '#CC5500';
const O_L   = '#FF8C33';
const W     = '#FFFFFF';
const G     = '#A0A0A0';
const G_DIM = '#606060';
const GRN   = '#00CC66';
const Y     = '#FFD700';
const R     = '#FF4444';

const ORANGE   = chalk.hex(O);
const ORANGE_L = chalk.hex(O_L);
const ORANGE_D = chalk.hex(O_DIM);
const WHITE    = chalk.white;
const GRAY     = chalk.hex(G);
const GRAY_DIM = chalk.hex(G_DIM);
const GREEN    = chalk.hex(GRN);
const YELLOW   = chalk.hex(Y);
const RED      = chalk.hex(R);
const B        = chalk.bold;

const CONFIG_DIR = path.join(os.homedir(), '.mimo');

// ── 终端宽度 ──────────────────────────────────

function tw(): number {
  return Math.max(50, Math.min(100, process.stdout.columns || 80));
}

function box(inner: string[]): void {
  const w = tw();
  console.log(ORANGE(`  ┏${'━'.repeat(w - 4)}┓`));
  for (const line of inner) {
    const stripped = strip(line);
    const pad = Math.max(0, w - 6 - stripped.length);
    console.log(`${ORANGE('  ┃')} ${line}${' '.repeat(pad)}${ORANGE('┃')}`);
  }
  console.log(ORANGE(`  ┗${'━'.repeat(w - 4)}┛`));
}

function boxOpen(): void {
  const w = tw();
  console.log(ORANGE(`  ┏${'━'.repeat(w - 4)}┓`));
}

function boxLine(content: string): void {
  const w = tw();
  const stripped = strip(content);
  const pad = Math.max(0, w - 6 - stripped.length);
  console.log(`${ORANGE('  ┃')} ${content}${' '.repeat(pad)}${ORANGE('┃')}`);
}

function boxSep(): void {
  const w = tw();
  console.log(ORANGE(`  ┠${'─'.repeat(w - 4)}┨`));
}

function boxClose(): void {
  const w = tw();
  console.log(ORANGE(`  ┗${'━'.repeat(w - 4)}┛`));
}

function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;]*m/g, '');
}

// ── 输入提示 ──────────────────────────────────

async function prompt(rl: readline.Interface, label: string, defaultVal: string = '', mask: boolean = false): Promise<string> {
  return new Promise((resolve) => {
    const suffix = defaultVal ? GRAY(` [${defaultVal}]`) : '';
    const q = `    ${ORANGE('›')} ${WHITE(label)}${suffix}: `;

    if (mask) {
      // 掩码输入（API Key）
      process.stdout.write(q);
      let input = '';
      const onData = (char: Buffer) => {
        const c = char.toString();
        for (let i = 0; i < c.length; i++) {
          const ch = c[i];
          if (ch === '\n' || ch === '\r') {
            process.stdin.removeListener('data', onData);
            (process.stdin as any).setRawMode?.(false);
            process.stdin.pause();
            console.log('');
            resolve(input.trim() || defaultVal);
            return;
          } else if (ch === '\x03') {
            // Ctrl+C — emit SIGINT so the global handler runs
            process.kill(process.pid, 'SIGINT');
            return;
          } else if (ch === '\x7f' || ch === '\b') {
            if (input.length > 0) {
              input = input.slice(0, -1);
              process.stdout.write('\b \b');
            }
          } else {
            input += ch;
            process.stdout.write('•');
          }
        }
      };
      (process.stdin as any).setRawMode?.(true);
      process.stdin.resume();
      process.stdin.on('data', onData);
    } else {
      // 确保 stdin 在掩码输入后已恢复
      if (process.stdin.isPaused()) {
        process.stdin.resume();
      }
      rl.question(q, (answer) => {
        resolve(answer.trim() || defaultVal);
      });
    }
  });
}

async function confirm(rl: readline.Interface, label: string, defaultYes: boolean = true): Promise<boolean> {
  const suffix = defaultYes ? GREEN('[Y/n]') : RED('[y/N]');
  const answer = await prompt(rl, `${label} ${suffix}`);
  if (!answer) return defaultYes;
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

async function select(rl: readline.Interface, label: string, options: Array<{ key: string; label: string; desc: string }>, defaultKey: string): Promise<string> {
  console.log(`    ${ORANGE('›')} ${WHITE(label)}`);
  for (const opt of options) {
    const marker = opt.key === defaultKey ? ORANGE('●') : GRAY_DIM('○');
    console.log(`      ${marker} ${ORANGE_L(opt.key.padEnd(16))} ${GRAY(opt.desc)}`);
  }
  const answer = await prompt(rl, '    选择', defaultKey);
  const valid = options.find((o) => o.key === answer);
  return valid ? valid.key : defaultKey;
}

// ── 页面 1: 欢迎 ──────────────────────────────

async function showWelcomePage(): Promise<void> {
  console.log('');
  console.log(ORANGE('  ╔══════════════════════════════════════════════════════════════╗'));
  console.log(ORANGE('  ║') + '                                                            ' + ORANGE('║'));
  console.log(ORANGE('  ║') + B(ORANGE_L('          MIMO CLI Code — 首次设置向导')) + '               ' + ORANGE('║'));
  console.log(ORANGE('  ║') + '                                                            ' + ORANGE('║'));
  console.log(ORANGE('  ║') + GRAY('    Xiaomi 终端编程智能体 · Powered by MiMO AI') + '      ' + ORANGE('║'));
  console.log(ORANGE('  ║') + '                                                            ' + ORANGE('║'));
  console.log(ORANGE('  ╚══════════════════════════════════════════════════════════════╝'));
  console.log('');
  console.log(GRAY('    本向导将引导你完成以下配置：'));
  console.log('');
  console.log(GRAY('    ') + ORANGE('1.') + WHITE(' 选择 API 连接模式'));
  console.log(GRAY('    ') + ORANGE('2.') + WHITE(' 设置 API Key'));
  console.log(GRAY('    ') + ORANGE('3.') + WHITE(' 配置 API 端点 (Base URL)'));
  console.log(GRAY('    ') + ORANGE('4.') + WHITE(' 选择默认模型'));
  console.log(GRAY('    ') + ORANGE('5.') + WHITE(' 选择运行模式'));
  console.log('');
  console.log(GRAY('    配置将保存到: ') + ORANGE_L('~/.mimo/config.toml'));
  console.log('');
  console.log(GRAY_DIM('    ───────────────────────────────────────────────────────'));
  console.log('');
}

// ── 页面 2: API 连接模式 ──────────────────────

interface SetupResult {
  apiMode: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  mode: string;
  monthlyBudget: number;
  maxTokens: number;
}

async function showApiModePage(rl: readline.Interface): Promise<string> {
  boxOpen();
  boxLine(B(ORANGE_L('  步骤 1/5  选择 API 连接模式')));
  boxSep();
  boxLine('');
  boxLine(`  ${ORANGE('●')} ${WHITE('token-plan')}      ${GRAY('Token 计划模式（推荐）')}`);
  boxLine(`    ${GRAY_DIM('使用小米 MIMO Token 计划，按月度 Token 预算计费')}`);
  boxLine(`    ${GRAY_DIM('适合日常开发，有固定预算的企业/团队用户')}`);
  boxLine('');
  boxLine(`  ${ORANGE('●')} ${WHITE('pay-as-you-go')}  ${GRAY('按量付费模式')}`);
  boxLine(`    ${GRAY_DIM('使用 Anthropic 官方 API 或第三方代理，按实际用量计费')}`);
  boxLine(`    ${GRAY_DIM('适合个人开发者、测试、或使用自建代理的用户')}`);
  boxLine('');
  boxClose();
  console.log('');

  const apiMode = await select(rl, '选择连接模式', [
    { key: 'token-plan', label: 'Token Plan', desc: 'Token 计划模式（推荐）' },
    { key: 'pay-as-you-go', label: 'Pay-as-you-go', desc: '按量付费模式' },
  ], 'token-plan');

  return apiMode;
}

// ── 页面 3: API Key 设置 ──────────────────────

async function showApiKeyPage(rl: readline.Interface, apiMode: string): Promise<string> {
  console.log('');
  boxOpen();
  boxLine(B(ORANGE_L('  步骤 2/5  设置 API Key')));
  boxSep();
  boxLine('');

  if (apiMode === 'token-plan') {
    boxLine(`  ${WHITE('Token Plan 模式')}`);
    boxLine('');
    boxLine(`  ${GRAY('请获取你的 API Key：')}`);
    boxLine(`  ${ORANGE_L('  → https://console.anthropic.com/settings/keys')}`);
    boxLine('');
    boxLine(`  ${GRAY('Key 格式：')}${ORANGE_L('sk-ant-api03-xxxxxxxxxxxxxxxx')}`);
    boxLine('');
  } else {
    boxLine(`  ${WHITE('按量付费模式')}`);
    boxLine('');
    boxLine(`  ${GRAY('请获取你的 Anthropic API Key：')}`);
    boxLine(`  ${ORANGE_L('  → https://console.anthropic.com/settings/keys')}`);
    boxLine('');
    boxLine(`  ${GRAY('Key 格式：')}${ORANGE_L('sk-ant-api03-xxxxxxxxxxxxxxxx')}`);
    boxLine(`  ${GRAY('或第三方代理 Key：')}${ORANGE_L('tp-xxxxxxxx / sk-xxxxxxxx')}`);
    boxLine('');
  }

  boxLine(`  ${YELLOW('⚠ Key 将加密存储在本地，不会上传到任何服务器')}`);
  boxLine('');
  boxClose();
  console.log('');

  const apiKey = await prompt(rl, '输入 API Key', '', true);

  if (!apiKey) {
    console.log('');
    console.log(RED('    ✖ API Key 不能为空'));
    console.log(GRAY('    你可以稍后通过 ') + ORANGE('mimo init') + GRAY(' 或编辑 ') + ORANGE('~/.mimo/config.toml') + GRAY(' 设置'));
    console.log('');
  }

  return apiKey;
}

// ── 页面 4: Base URL 设置 ─────────────────────

async function showBaseUrlPage(rl: readline.Interface, apiMode: string): Promise<string> {
  console.log('');
  boxOpen();
  boxLine(B(ORANGE_L('  步骤 3/5  配置 API 端点 (Base URL)')));
  boxSep();
  boxLine('');

  if (apiMode === 'token-plan') {
    boxLine(`  ${WHITE('Token Plan 默认端点')}`);
    boxLine('');
    boxLine(`  ${GRAY('请配置你的 Token Plan API 端点')}`);
    boxLine('');
    boxLine(`  ${GRAY('如果你有自建代理，可以输入自定义 URL')}`);
    boxLine('');
    boxClose();
    console.log('');

    const customUrl = await prompt(rl, '输入 Base URL', 'https://api.anthropic.com');
    return customUrl || 'https://api.anthropic.com';
  } else {
    boxLine(`  ${WHITE('按量付费端点选项')}`);
    boxLine('');
    boxLine(`  ${ORANGE('●')} ${WHITE('官方端点')}   ${GRAY('https://api.anthropic.com')}`);
    boxLine(`  ${ORANGE('●')} ${WHITE('自定义代理')} ${GRAY('输入你自己的代理 URL')}`);
    boxLine('');
    boxClose();
    console.log('');

    const choice = await select(rl, '选择端点', [
      { key: 'official', label: '官方端点', desc: 'https://api.anthropic.com' },
      { key: 'custom', label: '自定义', desc: '输入自定义 URL' },
    ], 'official');

    if (choice === 'official') return 'https://api.anthropic.com';
  }

  console.log('');
  return await prompt(rl, '输入自定义 Base URL', 'https://api.anthropic.com');
}

// ── 页面 5: 模型选择 ──────────────────────────

async function showModelPage(rl: readline.Interface): Promise<string> {
  console.log('');
  boxOpen();
  boxLine(B(ORANGE_L('  步骤 4/5  选择默认模型')));
  boxSep();
  boxLine('');
  boxLine(`  ${ORANGE('●')} ${WHITE('auto')}             ${GRAY('智能路由：根据任务自动选择最优模型（推荐）')}`);
  boxLine('');
  boxLine(`  ${ORANGE('●')} ${WHITE('mimo-v2.5-pro')}    ${GRAY('MIMO Pro：最强推理能力，适合复杂任务')}`);
  boxLine(`    ${GRAY_DIM('高性能推理 · 成本适中')}`);
  boxLine('');
  boxLine(`  ${ORANGE('●')} ${WHITE('mimo-v2.5')}        ${GRAY('MIMO Standard：快速响应，适合简单任务')}`);
  boxLine(`    ${GRAY_DIM('轻量推理 · 成本最低')}`);
  boxLine('');
  boxClose();
  console.log('');

  const model = await select(rl, '选择默认模型', [
    { key: 'auto', label: 'Auto', desc: '智能路由（推荐）' },
    { key: 'mimo-v2.5-pro', label: 'MIMO Pro', desc: '最强推理' },
    { key: 'mimo-v2.5', label: 'MIMO Standard', desc: '快速响应' },
  ], 'auto');

  return model;
}

// ── 页面 6: 运行模式 ──────────────────────────

async function showModePage(rl: readline.Interface): Promise<string> {
  console.log('');
  boxOpen();
  boxLine(B(ORANGE_L('  步骤 5/5  选择运行模式')));
  boxSep();
  boxLine('');
  boxLine(`  ${ORANGE('●')} ${WHITE('agent')}  ${GREEN('审批模式（推荐）')}`);
  boxLine(`    ${GRAY('文件编辑和 Shell 命令需要你确认后执行')}`);
  boxLine(`    ${GRAY('适合日常开发：安全与效率的最佳平衡')}`);
  boxLine('');
  boxLine(`  ${ORANGE('●')} ${WHITE('plan')}   ${YELLOW('只读模式')}`);
  boxLine(`    ${GRAY('只能读取文件和搜索，不能修改任何内容')}`);
  boxLine(`    ${GRAY('适合代码审查、架构分析、方案设计')}`);
  boxLine('');
  boxLine(`  ${ORANGE('●')} ${WHITE('yolo')}   ${RED('自动模式')}`);
  boxLine(`    ${GRAY('所有操作自动执行，无需确认')}`);
  boxLine(`    ${GRAY('⚠ 适合信任环境，谨慎使用')}`);
  boxLine('');
  boxClose();
  console.log('');

  const mode = await select(rl, '选择运行模式', [
    { key: 'agent', label: 'Agent', desc: '审批模式（推荐）' },
    { key: 'plan', label: 'Plan', desc: '只读模式' },
    { key: 'yolo', label: 'YOLO', desc: '自动模式' },
  ], 'agent');

  return mode;
}

// ── 完成页 ──────────────────────────────────

async function showCompletePage(result: SetupResult): Promise<void> {
  console.log('');
  console.log(ORANGE('  ╔══════════════════════════════════════════════════════════════╗'));
  console.log(ORANGE('  ║') + '                                                            ' + ORANGE('║'));
  console.log(ORANGE('  ║') + B(GREEN('           ✔ 配置完成！')) + '                                  ' + ORANGE('║'));
  console.log(ORANGE('  ║') + '                                                            ' + ORANGE('║'));
  console.log(ORANGE('  ╚══════════════════════════════════════════════════════════════╝'));
  console.log('');

  const maskKey = (key: string) => {
    if (!key) return RED('未设置');
    if (key.length > 12) return key.slice(0, 8) + '••••••••' + key.slice(-4);
    return '••••••••';
  };

  boxOpen();
  boxLine(B(WHITE('  配置摘要')));
  boxSep();
  boxLine('');
  boxLine(`  ${GRAY('连接模式'.padEnd(12))}  ${ORANGE(result.apiMode)}`);
  boxLine(`  ${GRAY('API Key'.padEnd(12))}  ${ORANGE_L(maskKey(result.apiKey))}`);
  boxLine(`  ${GRAY('Base URL'.padEnd(12))}  ${ORANGE_L(result.baseUrl)}`);
  boxLine(`  ${GRAY('模型'.padEnd(12))}  ${ORANGE(result.model)}`);
  boxLine(`  ${GRAY('运行模式'.padEnd(12))}  ${ORANGE(result.mode)}`);
  boxLine('');
  boxSep();
  boxLine('');
  boxLine(`  ${GRAY('配置文件:')} ${ORANGE_L('~/.mimo/config.toml')}`);
  boxLine(`  ${GRAY('记忆目录:')} ${ORANGE_L('~/.mimo/memory/')}`);
  boxLine(`  ${GRAY('任务目录:')} ${ORANGE_L('~/.mimo/tasks/')}`);
  boxLine('');
  boxSep();
  boxLine('');
  boxLine(`  ${B(WHITE('快速开始:'))}`);
  boxLine('');
  boxLine(`  ${ORANGE('mimo')}                          ${GRAY('启动交互模式')}`);
  boxLine(`  ${ORANGE('mimo "你的问题"')}                ${GRAY('单次执行')}`);
  boxLine(`  ${ORANGE('mimo --help')}                    ${GRAY('查看所有命令')}`);
  boxLine(`  ${ORANGE('/team')}                         ${GRAY('查看专家开发团队')}`);
  boxLine(`  ${ORANGE('/skills')}                       ${GRAY('查看所有技能')}`);
  boxLine('');
  boxClose();
  console.log('');
}

// ── 连接测试 ──────────────────────────────────

async function testConnection(apiKey: string, baseUrl: string): Promise<boolean> {
  process.stdout.write(GRAY('    测试 API 连接...'));

  try {
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'mimo-v2.5',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok || response.status === 400) {
      // 400 也说明连接成功（只是参数问题）
      process.stdout.write('\r');
      console.log(GREEN('    ✔ API 连接成功'));
      return true;
    }

    if (response.status === 401) {
      process.stdout.write('\r');
      console.log(RED('    ✖ API Key 无效 (401 Unauthorized)'));
      return false;
    }

    if (response.status === 403) {
      process.stdout.write('\r');
      console.log(RED('    ✖ API Key 无权限 (403 Forbidden)'));
      return false;
    }

    if (response.status === 429) {
      process.stdout.write('\r');
      console.log(YELLOW('    ⚠ API 请求频率超限 (429)，但连接正常'));
      return true;
    }

    process.stdout.write('\r');
    console.log(YELLOW(`    ⚠ API 返回 ${response.status}，但连接正常`));
    return true;
  } catch (err: any) {
    process.stdout.write('\r');
    if (err.name === 'AbortError' || err.message?.includes('timeout')) {
      console.log(RED('    ✖ 连接超时 (15秒)'));
    } else if (err.message?.includes('ECONNREFUSED')) {
      console.log(RED('    ✖ 连接被拒绝，请检查 Base URL'));
    } else if (err.message?.includes('ENOTFOUND')) {
      console.log(RED('    ✖ DNS 解析失败，请检查 Base URL'));
    } else {
      console.log(RED(`    ✖ 连接失败: ${err.message}`));
    }
    return false;
  }
}

// ── 主入口 ──────────────────────────────────────

export async function initConfig(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.mkdir(path.join(CONFIG_DIR, 'memory'), { recursive: true });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Graceful Ctrl+C at any step
  let cancelled = false;
  const sigintHandler = () => {
    cancelled = true;
    console.log('\n');
    console.log(GRAY('    设置已取消。你可以稍后通过 ') + ORANGE('mimo init') + GRAY(' 重新配置。'));
    console.log('');
    rl.close();
    process.exit(0);
  };
  process.on('SIGINT', sigintHandler);

  try {
    // 页面 1: 欢迎
    await showWelcomePage();

    // 页面 2: API 连接模式
    const apiMode = await showApiModePage(rl);

    // 页面 3: API Key (retry on empty)
    let apiKey = await showApiKeyPage(rl, apiMode);
    while (!apiKey && !cancelled) {
      console.log(RED('    API Key 不能为空，请重新输入。'));
      apiKey = await showApiKeyPage(rl, apiMode);
    }

    // 页面 4: Base URL
    const baseUrl = await showBaseUrlPage(rl, apiMode);

    // URL format validation
    if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      console.log('');
      console.log(RED(`    ✖ 无效的 URL: ${baseUrl}`));
      console.log(GRAY('    URL 必须以 http:// 或 https:// 开头'));
      console.log('');
    }

    // 连接测试
    if (apiKey) {
      console.log('');
      await testConnection(apiKey, baseUrl);
    }

    // 页面 5: 模型选择
    const model = await showModelPage(rl);

    // 页面 6: 运行模式
    const mode = await showModePage(rl);

    // 保存配置
    const monthlyBudget = 999_999_999_999;
    const maxTokens = 32768;

    const config = {
      api: {
        mode: apiMode as 'token-plan' | 'pay-as-you-go',
        model,
        tokenPlan: {
          apiKey: apiKey,
          baseUrl: baseUrl,
          monthlyBudget,
        },
        payAsYouGo: {
          apiKey: apiKey,
          baseUrl: baseUrl,
          maxTokensPerTurn: maxTokens,
        },
        stream: true,
      },
      agent: {
        mode,
        maxTurns: 50,
        autoApproveReads: true,
      },
      promptCaching: {
        enabled: true,
        cacheTtl: 300,
      },
      features: {
        enabled: true,
        disabledFeatures: [],
      },
    };

    await saveConfig(config as any);

    // 创建记忆目录结构
    for (const dir of ['user', 'project', 'reference', 'sessions']) {
      await fs.mkdir(path.join(CONFIG_DIR, 'memory', dir), { recursive: true });
    }

    // 创建默认记忆索引
    const indexPath = path.join(CONFIG_DIR, 'memory', 'MEMORY.md');
    try {
      await fs.access(indexPath);
    } catch {
      await fs.writeFile(
        indexPath,
        '# MIMO Memory Index\n\n| ID | Type | Name | Description | File | Updated |\n|---|---|---|---|---|---|\n',
        'utf-8'
      );
    }

    // 完成页
    await showCompletePage({
      apiMode,
      apiKey,
      baseUrl,
      model,
      mode,
      monthlyBudget,
      maxTokens,
    });
  } finally {
    process.removeListener('SIGINT', sigintHandler);
    rl.close();
  }
}
