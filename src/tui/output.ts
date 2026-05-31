// ═══════════════════════════════════════════════════════
//  MIMO CLI — Core Terminal Output System
//  ANSI-native (no chalk dependency)
// ═══════════════════════════════════════════════════════

// ── ANSI Color System ──────────────────────────────────

const ORANGE    = (s: string) => `\x1b[38;2;255;165;0m${s}\x1b[0m`;
const ORANGE_L  = (s: string) => `\x1b[38;2;255;195;51m${s}\x1b[0m`;
const ORANGE_D  = (s: string) => `\x1b[38;2;204;85;0m${s}\x1b[0m`;
const WHITE     = (s: string) => `\x1b[97m${s}\x1b[0m`;
const GRAY      = (s: string) => `\x1b[90m${s}\x1b[0m`;
const GRAY_DIM  = (s: string) => `\x1b[2m\x1b[90m${s}\x1b[0m`;
const RED       = (s: string) => `\x1b[31m${s}\x1b[0m`;
const YELLOW    = (s: string) => `\x1b[33m${s}\x1b[0m`;
const GREEN     = (s: string) => `\x1b[32m${s}\x1b[0m`;
const CYAN      = (s: string) => `\x1b[36m${s}\x1b[0m`;
const BLUE      = (s: string) => `\x1b[38;2;0;191;255m${s}\x1b[0m`;
const B         = (s: string) => `\x1b[1m${s}\x1b[0m`;
const DIM       = (s: string) => `\x1b[2m${s}\x1b[0m`;
const ITALIC    = (s: string) => `\x1b[3m${s}\x1b[0m`;
const RESET     = '\x1b[0m';

// ── Terminal Utilities ──────────────────────────────────

function termWidth(): number {
  return Math.max(40, Math.min(120, process.stdout.columns || 80));
}

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[mGKHFJ]/g, '');
}

function visibleLen(str: string): number {
  return stripAnsi(str).length;
}

function padRight(str: string, width: number, fill = ' '): string {
  const vis = visibleLen(str);
  if (vis >= width) return str;
  return str + fill.repeat(width - vis);
}

function hr(char = '─'): string {
  return GRAY_DIM(char.repeat(termWidth() - 4));
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function boxLine(left: string, content: string, right: string, totalWidth: number): string {
  const contentVis = visibleLen(content);
  const inner = totalWidth - 4;
  const padLen = Math.max(0, inner - contentVis);
  return `  ${ORANGE(left)}${content}${' '.repeat(padLen)}${ORANGE(right)}`;
}

// ═══════════════════════════════════════════════════════
//  1. printAssistantText — Markdown-like Terminal Renderer
// ═══════════════════════════════════════════════════════

let inCodeBlock = false;
let codeLanguage = '';

export function printAssistantText(text: string): void {
  if (!text.trim()) return;

  const lines = text.split('\n');
  for (const line of lines) {
    // Code block fences
    if (line.trimStart().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLanguage = line.trimStart().replace(/^```/, '').trim();
        const langLabel = codeLanguage ? ` ${GRAY_DIM(codeLanguage)}` : '';
        const w = termWidth();
        console.log(`  ${ORANGE_D('┌───')}${langLabel}${ORANGE_D('─'.repeat(Math.max(0, w - 10 - codeLanguage.length)))}`);
      } else {
        inCodeBlock = false;
        codeLanguage = '';
        console.log(`  ${ORANGE_D('└───' + '─'.repeat(termWidth() - 8))}`);
      }
      continue;
    }

    // Inside code blocks
    if (inCodeBlock) {
      console.log(`  ${ORANGE_D('│')} ${WHITE(line)}`);
      continue;
    }

    // Headings
    if (line.startsWith('#### ')) {
      console.log(`  ${B(ORANGE_L(line.replace('#### ', '* ')))}`);
      continue;
    }
    if (line.startsWith('### ')) {
      console.log(`  ${B(ORANGE(line.replace('### ', '◆ ')))}`);
      continue;
    }
    if (line.startsWith('## ')) {
      console.log('');
      console.log(`  ${B(ORANGE(line.replace('## ', '━━ ')))}`);
      continue;
    }
    if (line.startsWith('# ')) {
      console.log('');
      console.log(`  ${B(ORANGE_L(line.replace('# ', '━━━ ')))}`);
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      console.log(`  ${ORANGE_D('│')} ${GRAY(line.slice(2))}`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) {
      console.log(`  ${GRAY_DIM('─'.repeat(termWidth() - 8))}`);
      continue;
    }

    // Unordered list
    if (line.match(/^\s*[-*]\s/)) {
      const indent = (line.match(/^(\s*)/)?.[1] || '').length;
      const content = line.replace(/^\s*[-*]\s/, '');
      console.log(`${' '.repeat(indent)}  ${ORANGE('●')} ${renderInline(content)}`);
      continue;
    }

    // Ordered list
    if (line.match(/^\s*\d+\.\s/)) {
      const indent = (line.match(/^(\s*)/)?.[1] || '').length;
      const num = line.match(/(\d+)\./)?.[1] || '1';
      const content = line.replace(/^\s*\d+\.\s/, '');
      console.log(`${' '.repeat(indent)}  ${ORANGE(num + '.')} ${renderInline(content)}`);
      continue;
    }

    // Empty line
    if (!line.trim()) {
      console.log('');
      continue;
    }

    // Normal text with inline formatting
    console.log(`  ${renderInline(line)}`);
  }
}

function renderInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, (_, code) => ORANGE_L(` ${code} `))
    .replace(/\*\*([^*]+)\*\*/g, (_, bold) => B(WHITE(bold)))
    .replace(/\*([^*]+)\*/g, (_, italic) => GRAY(italic))
    .replace(/~~([^~]+)~~/g, (_, strike) => GRAY_DIM(strike))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => CYAN(label) + GRAY_DIM(` (${url})`));
}

// ═══════════════════════════════════════════════════════
//  2. printToolCall — Animated Tool Call Display
// ═══════════════════════════════════════════════════════

export function printToolCall(toolName: string, input: Record<string, any>): void {
  const icon = toolIcon(toolName);
  const desc = toolDescFormatted(toolName, input);
  console.log(`  ${ORANGE('╭─')} ${icon} ${B(ORANGE_L(toolName))} ${GRAY_DIM(desc)}`);
}

function toolIcon(name: string): string {
  if (name.startsWith('mcp__'))    return CYAN('\u{1F50C}');
  if (name.startsWith('git_'))     return GREEN('\u{1F4CB}');
  if (name.startsWith('browser_')) return BLUE('\u{1F310}');
  if (name.startsWith('task_'))    return YELLOW('\u{1F4DD}');
  const icons: Record<string, string> = {
    file_read: ORANGE('[R]'), file_write: ORANGE('[W]'), file_edit: ORANGE('[E]'),
    shell_exec: YELLOW('⚡'), grep_search: ORANGE('[S]'), glob_match: ORANGE('[G]'),
    web_search: ORANGE('[Q]'), web_fetch: ORANGE('[F]'),
    notebook_read: GRAY('\u{1F4D3}'), notebook_edit: GRAY('\u{1F4D3}'),
    image_read: GRAY('\u{1F5BC}️'), file_upload: GREEN('\u{1F4E4}'),
  };
  return icons[name] || GRAY('⚙️');
}

function toolDescFormatted(name: string, input: Record<string, any>): string {
  switch (name) {
    case 'file_read':   return input.path || '';
    case 'file_write':  return `${input.path} · ${(input.content || '').split('\n').length} lines`;
    case 'file_edit':   return input.path || '';
    case 'shell_exec':  return (input.command || '').slice(0, 50);
    case 'grep_search': return `"${input.pattern}" -> ${input.path || '.'}`;
    case 'glob_match':  return input.pattern || '';
    case 'web_search':  return `"${input.query}"`;
    case 'web_fetch':   return input.url || '';
    case 'git_commit':  return (input.message || '').slice(0, 40);
    case 'git_pr':      return input.action || '';
    default:
      if (name.startsWith('mcp__')) return name.split('__').slice(1).join('__');
      if (name.startsWith('git_'))  return input.action || input.path || '';
      return '';
  }
}

// ═══════════════════════════════════════════════════════
//  3. printToolResult — Collapsible Tool Result Display
// ═══════════════════════════════════════════════════════

export function printToolResult(output: string, isError: boolean): void {
  if (!output) {
    console.log(`  ${ORANGE('╰─')} ${GREEN('done')}`);
    return;
  }

  const lines = output.split('\n');
  const maxShow = 3;
  const borderColor = isError ? RED : ORANGE_D;

  for (const line of lines.slice(0, maxShow)) {
    const truncated = line.length > termWidth() - 8 ? line.slice(0, termWidth() - 11) + '...' : line;
    console.log(`  ${borderColor('│')} ${GRAY(truncated)}`);
  }
  if (lines.length > maxShow) {
    console.log(`  ${borderColor('│')} ${GRAY_DIM(`… +${lines.length - maxShow} lines (click to expand)`)}`);
  }
  console.log(`  ${ORANGE('╰─')} ${isError ? RED('error') : GREEN('done')}`);
}

// ═══════════════════════════════════════════════════════
//  4. Status Messages
// ═══════════════════════════════════════════════════════

export function printError(msg: string): void {
  console.log(`  ${RED('✖')} ${msg}`);
}

export function printSuccess(msg: string): void {
  console.log(`  ${GREEN('✔')} ${msg}`);
}

export function printInfo(msg: string): void {
  console.log(`  ${ORANGE('▶')} ${GRAY(msg)}`);
}

export function printWarning(msg: string): void {
  console.log(`  ${YELLOW('⚠')} ${msg}`);
}

// ═══════════════════════════════════════════════════════
//  5. printMemorySaved — Memory Save Notification
// ═══════════════════════════════════════════════════════

export function printMemorySaved(name: string): void {
  console.log(`  ${ORANGE('☆')} ${GRAY('remembered:')} ${WHITE(name)}`);
}

// ═══════════════════════════════════════════════════════
//  6. printUsageStats — Token Usage Bar Chart
// ═══════════════════════════════════════════════════════

export function printUsageStats(stats: any, budgetInfo: any): void {
  const w = termWidth();
  console.log('');
  console.log(`  ${ORANGE('┏━━')} ${B(WHITE('Usage'))} ${ORANGE('━'.repeat(w - 12))}`);

  const row = (label: string, value: string, color: (s: string) => string = WHITE) => {
    console.log(`  ${ORANGE('┃')}  ${GRAY(label.padStart(12))}  ${GRAY_DIM('│')}  ${color(value)}`);
  };

  // Mini bar chart for each token type
  const maxTokens = Math.max(
    stats.inputTokens || 1,
    stats.outputTokens || 1,
    stats.cacheReadTokens || 1
  );
  const barW = 16;

  const barRow = (label: string, value: number, color: (s: string) => string) => {
    const filled = Math.round((value / maxTokens) * barW);
    const bar = color('█'.repeat(filled)) + GRAY_DIM('░'.repeat(barW - filled));
    console.log(`  ${ORANGE('┃')}  ${GRAY(label.padStart(12))}  ${GRAY_DIM('│')}  ${bar} ${WHITE(fmtNum(value))}`);
  };

  barRow('Input', stats.inputTokens || 0, CYAN);
  barRow('Output', stats.outputTokens || 0, ORANGE);

  if ((stats.cacheReadTokens || 0) > 0) {
    barRow('Cache Hit', stats.cacheReadTokens, GREEN);
  }
  if ((stats.cacheCreationTokens || 0) > 0) {
    barRow('Cache Write', stats.cacheCreationTokens, GRAY);
  }
  if ((stats.thinkingTokens || 0) > 0) {
    barRow('Thinking', stats.thinkingTokens, ORANGE_L);
  }

  console.log(`  ${ORANGE('┃')}`);

  if (budgetInfo && budgetInfo.mode === 'token-plan') {
    const total = budgetInfo.used + budgetInfo.remaining;
    const pct = budgetInfo.percentUsed;
    const pb = renderProgressBar(pct / 100, 24);
    row('Budget', `${pb} ${pct.toFixed(1)}%`, WHITE);
    row('', `${fmtNum(budgetInfo.used)} / ${fmtNum(total)}`, GRAY);
  } else if (stats.totalCost !== undefined) {
    row('Cost', `$${stats.totalCost.toFixed(4)}`, YELLOW);
  }

  console.log(`  ${ORANGE('┗' + '━'.repeat(w - 4))}`);
}

// ═══════════════════════════════════════════════════════
//  7. printTurnInfo — Turn Header with Model/Mode
// ═══════════════════════════════════════════════════════

export function printTurnInfo(model: string, mode: string, yoloOverride: boolean): void {
  const effectiveMode = yoloOverride ? 'yolo' : mode;
  const modelShort = model
    .replace('claude-', '')
    .replace(/-\d{8}$/, '')
    .replace('mimo-', '');

  const modeColorMap: Record<string, (s: string) => string> = {
    yolo: RED,
    plan: YELLOW,
    agent: GREEN,
  };
  const modeColor = modeColorMap[effectiveMode] || GRAY;

  console.log(`  ${ORANGE_D('╭─')} ${modeColor(effectiveMode)} ${GRAY_DIM('·')} ${BLUE(modelShort)} ${ORANGE_D('─'.repeat(Math.max(0, termWidth() - 10 - effectiveMode.length - modelShort.length)))}`);
}

// ═══════════════════════════════════════════════════════
//  8. printSeparator
// ═══════════════════════════════════════════════════════

export function printSeparator(): void {
  console.log(`  ${hr()}`);
}

// ═══════════════════════════════════════════════════════
//  9. printThinking — Collapsed Thinking Block
// ═══════════════════════════════════════════════════════

export function printThinking(thinking: string): void {
  if (!thinking.trim()) return;
  const lines = thinking.split('\n');
  console.log('');
  console.log(`  ${ORANGE_L('☆')} ${GRAY_DIM('Thinking')}`);
  console.log(`  ${GRAY_DIM('│')}`);
  for (const line of lines.slice(0, 15)) {
    console.log(`  ${GRAY_DIM('│')} ${GRAY_DIM(line)}`);
  }
  if (lines.length > 15) {
    console.log(`  ${GRAY_DIM('│')} ${GRAY_DIM(`… +${lines.length - 15} lines`)}`);
  }
  console.log(`  ${GRAY_DIM('│')}`);
}

// ═══════════════════════════════════════════════════════
//  10. printChapter — Chapter Divider
// ═══════════════════════════════════════════════════════

export function printChapter(title: string, summary?: string): void {
  console.log('');
  console.log(`  ${ORANGE('┏━━')} ${B(WHITE(title))} ${ORANGE('━'.repeat(Math.max(0, termWidth() - 10 - title.length)))}`);
  if (summary) {
    console.log(`  ${ORANGE('┃')}  ${GRAY(summary)}`);
  }
  console.log('');
}

// ═══════════════════════════════════════════════════════
//  11. printSpinner — Animated Spinner
// ═══════════════════════════════════════════════════════

const SPINNER_FRAMES = ['⣾', '⣽', '⣻', '⢿', '⡿', '⡾', '⡻', '⣷'];

export function printSpinner(text: string): NodeJS.Timeout | null {
  let i = 0;
  const timer = setInterval(() => {
    const frame = SPINNER_FRAMES[i++ % SPINNER_FRAMES.length];
    process.stdout.write(`\r  ${ORANGE(frame)} ${GRAY(text)}`);
  }, 80);
  return timer;
}

export function stopSpinner(timer: NodeJS.Timeout | null): void {
  if (timer) {
    clearInterval(timer);
    const w = process.stdout.columns || 80;
    process.stdout.write('\r' + ' '.repeat(w) + '\r');
  }
}

// ═══════════════════════════════════════════════════════
//  12. printBottomBar — Fixed Bottom Status Bar
// ═══════════════════════════════════════════════════════

export interface BottomBarState {
  mode: 'plan' | 'agent' | 'yolo';
  model: string;
  thinking: boolean;
  turnCount: number;
  tokenUsed: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
  costEstimate?: number;
  tasksCompleted?: number;
  tasksTotal?: number;
  activeAgents?: number;
  planProgress?: string;
}

export function printBottomBar(state: BottomBarState): void {
  const cols = process.stdout.columns || 80;

  const thinkingStr = state.thinking
    ? `${GREEN('high')}`
    : `${GRAY_DIM('off')}`;

  const isPro = state.model.includes('pro');
  const modelStr = isPro ? ORANGE_L('pro') : GRAY('std');
  const tokenStr = state.tokenUsed > 0 ? fmtNum(state.tokenUsed) : '-';

  const segments: string[] = [
    `${ORANGE('Tab')}${GRAY_DIM(':')}${YELLOW('P')}${GRAY_DIM('/')}${GREEN('A')}${GRAY_DIM('/')}${RED('Y')}`,
    `${GRAY_DIM('·')} ${ORANGE('T')}${GRAY_DIM(':')}${thinkingStr}`,
    `${GRAY_DIM('·')} ${modelStr}`,
    `${GRAY_DIM('·')} ${GRAY('#' + state.turnCount)}`,
  ];

  if (tokenStr !== '-') {
    segments.push(`${GRAY_DIM('·')} ${tokenStr}tok`);
  }

  const bar = ' ' + segments.join(' ');

  console.log(ORANGE_D('  ' + '─'.repeat(cols - 4)));
  console.log(bar);
}

// ═══════════════════════════════════════════════════════
//  13. drawBottomBar — Redraw Bottom Bar (Cursor-Save)
// ═══════════════════════════════════════════════════════

const MOVE = (row: number, col: number) => `\x1b[${row};${col}H`;
const SAVE = '\x1b[s';
const RESTORE = '\x1b[u';
const CLEAR_LINE = '\x1b[K';

export function drawBottomBar(state: BottomBarState): void {
  const rows = process.stdout.rows || 24;
  const cols = process.stdout.columns || 80;
  const barRow = rows;

  const modeColors: Record<string, (s: string) => string> = {
    plan: YELLOW,
    agent: GREEN,
    yolo: RED,
  };
  const modeColor = modeColors[state.mode] || GRAY;
  const modeLabel = state.mode.toUpperCase();
  const thinkingStr = state.thinking
    ? `${GREEN('high')}`
    : `${GRAY_DIM('off')}`;

  const isPro = state.model.includes('pro');
  const modelStr = isPro ? ORANGE_L('pro') : GRAY('std');

  // Tab cycle indicator: plan → agent → yolo
  const modeCycle = `${YELLOW('P')}${GRAY_DIM('/')}${GREEN('A')}${GRAY_DIM('/')}${RED('Y')}`;

  // Live cost tracking (CodeWhale-style)
  const tokenStr = state.tokenUsed > 0 ? fmtNum(state.tokenUsed) : '-';
  const costStr = state.costEstimate ? `$${state.costEstimate.toFixed(4)}` : '';
  const cacheStr = state.cacheHitTokens
    ? `${GREEN(fmtNum(state.cacheHitTokens))}${GRAY_DIM('/')}${GRAY(fmtNum(state.cacheMissTokens || 0))}`
    : '';

  const extras: string[] = [];
  if (state.planProgress) {
    extras.push(`${YELLOW('P')}${state.planProgress}`);
  }
  if (state.tasksTotal !== undefined && state.tasksTotal > 0) {
    extras.push(`${GREEN(String(state.tasksCompleted || 0))}/${state.tasksTotal}`);
  }
  if (state.activeAgents !== undefined && state.activeAgents > 0) {
    extras.push(`${CYAN(state.activeAgents + 'a')}`);
  }
  const extrasStr = extras.length > 0 ? ` ${GRAY_DIM('·')} ${extras.join(' ')}` : '';

  // Build bar: compact, CodeWhale-style
  const segments: string[] = [
    `${ORANGE('Tab')}${GRAY_DIM(':')}${modeCycle}`,
    `${GRAY_DIM('·')} ${ORANGE('T')}${GRAY_DIM(':')}${thinkingStr}`,
    `${GRAY_DIM('·')} ${modelStr}`,
    `${GRAY_DIM('·')} ${GRAY('#' + state.turnCount)}`,
  ];

  if (tokenStr !== '-') {
    segments.push(`${GRAY_DIM('·')} ${tokenStr}tok`);
  }
  if (cacheStr) {
    segments.push(`${GRAY_DIM('·')} cache ${cacheStr}`);
  }
  if (costStr) {
    segments.push(`${GRAY_DIM('·')} ${costStr}`);
  }
  if (extrasStr) {
    segments.push(extrasStr);
  }

  const bar = ' ' + segments.join(' ');

  const stripped = stripAnsi(bar);
  const padLen = Math.max(0, cols - stripped.length - 2);

  const output =
    SAVE +
    MOVE(barRow, 1) +
    CLEAR_LINE +
    ORANGE_D('─'.repeat(cols)) +
    MOVE(barRow, 1) +
    bar + ' '.repeat(padLen) +
    RESTORE;

  process.stdout.write(output);
}

// ═══════════════════════════════════════════════════════
//  14. Multi-Select Permission Prompt with Arrow Keys
// ═══════════════════════════════════════════════════════

export interface PermissionOption {
  key: string;
  label: string;
  description: string;
  color: (s: string) => string;
}

const DEFAULT_PERMISSION_OPTIONS: PermissionOption[] = [
  { key: 'y', label: '[y]', description: 'Allow this', color: GREEN },
  { key: 'n', label: '[n]', description: 'Deny', color: RED },
  { key: 'a', label: '[a]', description: 'Allow all (YOLO mode)', color: ORANGE },
  { key: 'd', label: '[d]', description: 'Show diff', color: CYAN },
  { key: 'p', label: '[p]', description: 'Create plan', color: YELLOW },
];

export function askPermissionMulti(
  toolName: string,
  description: string,
  options: PermissionOption[] = DEFAULT_PERMISSION_OPTIONS
): Promise<string> {
  return new Promise((resolve) => {
    const w = termWidth();

    console.log('');
    console.log(`  ${YELLOW('┏━━')} ${B(WHITE('Permission Required'))} ${YELLOW('━'.repeat(Math.max(0, w - 28)))}`);
    console.log(`  ${YELLOW('┃')}  ${B(WHITE(toolName))}`);
    console.log(`  ${YELLOW('┃')}  ${GRAY(description)}`);
    console.log(`  ${YELLOW('┃')}`);

    let selectedIndex = 0;

    const renderOptions = () => {
      const items = options.map((opt, i) => {
        const selected = i === selectedIndex;
        const prefix = selected ? ORANGE_L(' ▶ ') : '   ';
        return `${prefix}${opt.color(opt.label)} ${opt.description}`;
      });
      console.log(`  ${YELLOW('┃')}  ${items.join('  ' + GRAY_DIM('│') + '  ')}`);
    };

    renderOptions();
    console.log(`  ${YELLOW('┗' + '━'.repeat(w - 4))}`);

    const rl = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const onKeypress = (_chunk: string, key: any) => {
      if (!key) return;
      if (key.name === 'left') {
        selectedIndex = (selectedIndex - 1 + options.length) % options.length;
        process.stdout.write('\x1b[1A\x1b[2K');
        renderOptions();
      } else if (key.name === 'right') {
        selectedIndex = (selectedIndex + 1) % options.length;
        process.stdout.write('\x1b[1A\x1b[2K');
        renderOptions();
      } else if (key.name === 'return') {
        cleanup();
        resolve(options[selectedIndex].key);
      }
    };

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKeypress);
      rl.close();
    };

    process.stdin.on('keypress', onKeypress);

    rl.question(`  ${CYAN('Choose:')} `, (answer: string) => {
      cleanup();
      const a = answer.trim().toLowerCase();
      if (options.find(o => o.key === a)) {
        resolve(a);
      } else {
        resolve(options[selectedIndex].key);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════
//  15. Progress Bar Renderer
// ═══════════════════════════════════════════════════════

export function renderProgressBar(current: number, total: number, width: number = 24): string {
  const pct = total > 0 ? Math.min(1, current / total) : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;

  const fillColor = pct > 0.8 ? GREEN : pct > 0.5 ? ORANGE : YELLOW;
  return ORANGE('[') + fillColor('━'.repeat(filled)) + GRAY_DIM('─'.repeat(empty)) + ORANGE(']');
}

// ═══════════════════════════════════════════════════════
//  16. Table Renderer
// ═══════════════════════════════════════════════════════

export function renderTable(headers: string[], rows: string[][]): void {
  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const maxRow = rows.reduce((max, row) => Math.max(max, visibleLen(row[i] || '')), 0);
    return Math.max(visibleLen(h), maxRow) + 2;
  });

  const totalW = colWidths.reduce((a, b) => a + b, 0) + (headers.length - 1) * 3;
  const w = Math.min(totalW + 4, termWidth());

  // Header
  const headerLine = headers.map((h, i) => B(WHITE(h.padEnd(colWidths[i])))).join(` ${GRAY_DIM('│')} `);
  console.log(`  ${headerLine}`);

  // Separator
  const sep = colWidths.map(w => '─'.repeat(w)).join('┼');
  console.log(`  ${GRAY_DIM(sep)}`);

  // Rows
  for (const row of rows) {
    const line = row.map((cell, i) => GRAY((cell || '').padEnd(colWidths[i]))).join(` ${GRAY_DIM('│')} `);
    console.log(`  ${line}`);
  }
}

// ═══════════════════════════════════════════════════════
//  17. Tree Renderer
// ═══════════════════════════════════════════════════════

export interface TreeNode {
  label: string;
  icon?: string;
  status?: 'running' | 'done' | 'error' | 'pending';
  children?: TreeNode[];
}

export function renderTree(items: TreeNode[], depth = 0): void {
  for (let idx = 0; idx < items.length; idx++) {
    const node = items[idx];
    const isLast = idx === items.length - 1;
    const indent = depth === 0 ? '' : '  '.repeat(depth);
    const connector = depth === 0 ? '' : isLast ? '└─ ' : '├─ ';

    let icon: string;
    if (node.status) {
      icon = {
        running: ORANGE('●'),
        done:    GREEN('✔'),
        error:   RED('✖'),
        pending: GRAY_DIM('○'),
      }[node.status];
    } else {
      icon = node.icon || ORANGE('●');
    }

    const label = node.status === 'running' ? B(WHITE(node.label)) : GRAY(node.label);
    console.log(`  ${indent}${connector}${icon} ${label}`);

    if (node.children?.length) {
      renderTree(node.children, depth + 1);
    }
  }
}

// ═══════════════════════════════════════════════════════
//  Legacy Exports (for agent.ts compatibility)
// ═══════════════════════════════════════════════════════

// Alias: some callers pass { output, isError } object
export function printToolResultCompat(result: { output: string; isError: boolean }): void {
  printToolResult(result.output, result.isError);
}

// Alias: WorkflowNode is compatible with TreeNode
export interface WorkflowNode {
  label: string;
  status: 'running' | 'done' | 'error' | 'pending';
  children?: WorkflowNode[];
}

export function printWorkflowTree(nodes: WorkflowNode[], depth = 0): void {
  renderTree(nodes as TreeNode[], depth);
}

export function printProgress(current: number, total: number, label?: string): void {
  const bar = renderProgressBar(current, total);
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const text = label ? ` ${GRAY(label)}` : '';
  console.log(`  ${bar} ${B(WHITE(pct + '%'))}${text} ${GRAY_DIM(`${current}/${total}`)}`);
}

export function printBanner(config: any): void {
  const w = termWidth();
  const line = (inner: string) => {
    const padLen = Math.max(0, w - 6 - visibleLen(inner));
    return `  ${ORANGE('┃')} ${inner}${' '.repeat(padLen)}${ORANGE('┃')}`;
  };

  console.log('');
  console.log(`  ${ORANGE('┏' + '━'.repeat(w - 4) + '┓')}`);
  console.log(line(''));
  console.log(line(`${B(ORANGE('MIMO'))} ${WHITE('CLI Code')}  ${GRAY_DIM('v1.0.0')}  ${GRAY('·')}  ${GRAY('Xiaomi Terminal AI')}`));
  console.log(line(''));
  console.log(`  ${ORANGE('┠' + '─'.repeat(w - 4) + '┨')}`);

  const model = config?.api?.model || 'auto';
  const mode = config?.agent?.mode || 'agent';
  const rows = [
    ['Model', model === 'auto' ? `${ORANGE('auto')} -> ${BLUE('mimo-v2.5-pro')}` : ORANGE(model)],
    ['Mode', modeLabel(mode)],
    ['API', config?.api?.mode === 'token-plan' ? GREEN('Token Plan') : BLUE('Pay-as-you-go')],
    ['Cache', config?.promptCaching?.enabled ? GREEN('enabled') : GRAY('disabled')],
  ];

  for (const [k, v] of rows) {
    console.log(line(`  ${GRAY(k!.padStart(6))}  ${GRAY_DIM('│')}  ${v}`));
  }

  console.log(line(''));
  console.log(`  ${ORANGE('┗' + '━'.repeat(w - 4) + '┛')}`);
  console.log('');
  console.log(`  ${GRAY('Type')} ${ORANGE('/help')} ${GRAY('for commands')}  ${GRAY_DIM('·')}  ${GRAY('Ctrl+C')} ${GRAY('to exit')}`);
  console.log(`  ${hr()}`);
  console.log('');
}

function modeLabel(mode: string): string {
  switch (mode) {
    case 'plan':  return `${YELLOW('plan')} ${GRAY('· read-only')}`;
    case 'agent': return `${GREEN('agent')} ${GRAY('· approval')}`;
    case 'yolo':  return `${RED('yolo')} ${GRAY('· auto')}`;
    default:      return GRAY(mode);
  }
}

export function printHelp(): void {
  const w = termWidth();
  const row = (cmd: string, desc: string) => {
    console.log(`  ${ORANGE('┃')}  ${ORANGE_L(cmd.padEnd(18))} ${GRAY(desc)}`);
  };

  console.log('');
  console.log(`  ${ORANGE('┏━━')} ${B(WHITE('Commands'))} ${ORANGE('━'.repeat(w - 16))}`);
  console.log(`  ${ORANGE('┃')}`);
  row('/help',           'Show this help');
  row('/mode [plan|agent|yolo]', 'View or switch mode');
  row('/model',          'Show current model');
  row('/memory',         'Show memory stats');
  row('/skills',         'List all skills');
  row('/stats',          'Show token usage');
  row('/clear',          'Clear conversation');
  row('/compact',        'Compress context');
  row('/resume',         'Resume last session');
  row('/quit',           'Exit');
  console.log(`  ${ORANGE('┃')}`);
  console.log(`  ${ORANGE('┠━━')} ${B(WHITE('Keyboard'))} ${ORANGE('━'.repeat(w - 16))}`);
  console.log(`  ${ORANGE('┃')}`);
  row('Ctrl+C',          'Interrupt / Double-press to exit');
  row('Ctrl+D',          'Exit');
  console.log(`  ${ORANGE('┃')}`);
  console.log(`  ${ORANGE('┗' + '━'.repeat(w - 4))}`);
}

export function printSkillsPage(skills: Array<{ id: string; icon: string; name: string; description: string; category: string }>): void {
  const w = termWidth();
  const byCategory: Record<string, typeof skills> = {};
  for (const s of skills) {
    (byCategory[s.category] ||= []).push(s);
  }

  console.log('');
  console.log(`  ${ORANGE('┏━━')} ${B(WHITE('Skills'))} ${GRAY_DIM(`(${skills.length})`)} ${ORANGE('━'.repeat(w - 18 - String(skills.length).length))}`);

  for (const [cat, list] of Object.entries(byCategory)) {
    console.log(`  ${ORANGE('┃')}`);
    console.log(`  ${ORANGE('┃')}  ${B(ORANGE(cat!.toUpperCase()))}`);
    for (const s of list) {
      console.log(`  ${ORANGE('┃')}    ${s.icon} ${ORANGE_L(s.id.padEnd(22))} ${GRAY(s.description)}`);
    }
  }

  console.log(`  ${ORANGE('┃')}`);
  console.log(`  ${ORANGE('┗' + '━'.repeat(w - 4))}`);
}

export function printMemoryPage(memories: Array<{ type: string; id: string; description: string }>): void {
  const w = termWidth();
  console.log('');
  console.log(`  ${ORANGE('┏━━')} ${B(WHITE('Memory'))} ${GRAY_DIM(`(${memories.length})`)} ${ORANGE('━'.repeat(w - 18 - String(memories.length).length))}`);

  if (memories.length === 0) {
    console.log(`  ${ORANGE('┃')}  ${GRAY_DIM('No memories stored yet')}`);
  }

  for (const m of memories) {
    const typeIcon: Record<string, string> = { user: '\u{1F464}', feedback: '\u{1F4AC}', project: '\u{1F4C1}', reference: '\u{1F517}' };
    console.log(`  ${ORANGE('┃')}  ${typeIcon[m.type] || '\u{1F4DD}'} ${ORANGE_L(m.id)} ${GRAY_DIM('·')} ${GRAY(m.description)}`);
  }

  console.log(`  ${ORANGE('┃')}`);
  console.log(`  ${ORANGE('┗' + '━'.repeat(w - 4))}`);
}

export function printTaskPage(tasks: Array<{ id: string; status: string; subject: string; owner?: string }>, progress: { total: number; completed: number; percent: number }): void {
  const w = termWidth();
  console.log('');
  console.log(`  ${ORANGE('┏━━')} ${B(WHITE('Tasks'))} ${GRAY_DIM(`${progress.completed}/${progress.total}`)} ${ORANGE('━'.repeat(w - 20 - String(progress.total).length))}`);

  printProgress(progress.completed, progress.total);
  console.log(`  ${ORANGE('┃')}`);

  for (const t of tasks) {
    const statusIcon: Record<string, string> = {
      pending: GRAY_DIM('○'),
      in_progress: ORANGE('●'),
      completed: GREEN('✔'),
    };
    const owner = t.owner ? ` ${GRAY('@' + t.owner)}` : '';
    console.log(`  ${ORANGE('┃')}  ${statusIcon[t.status] || '?'} ${GRAY(t.subject)}${owner}`);
  }

  console.log(`  ${ORANGE('┃')}`);
  console.log(`  ${ORANGE('┗' + '━'.repeat(w - 4))}`);
}

export function printApprovalBox(toolName: string, description: string): void {
  const w = termWidth();
  console.log('');
  console.log(`  ${YELLOW('┏━━')} ${B(WHITE('Approval Required'))} ${YELLOW('━'.repeat(w - 25))}`);
  console.log(`  ${YELLOW('┃')}  ${B(WHITE(toolName))}`);
  console.log(`  ${YELLOW('┃')}  ${GRAY(description)}`);
  console.log(`  ${YELLOW('┃')}`);
  console.log(`  ${YELLOW('┃')}  ${GREEN('[y]')} ${GRAY('allow')}  ${RED('[n]')} ${GRAY('deny')}  ${ORANGE('[a]')} ${GRAY('allow all (yolo mode)')}`);
  console.log(`  ${YELLOW('┗' + '━'.repeat(w - 4))}`);
}

export function printDiffPreview(filePath: string, oldContent: string, newContent: string): void {
  console.log('');
  console.log(`  ${ORANGE('┏━━')} ${B(WHITE('Diff'))} ${GRAY_DIM(filePath)} ${ORANGE('━'.repeat(Math.max(0, termWidth() - 14 - filePath.length)))}`);

  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const maxLines = Math.max(oldLines.length, newLines.length);
  let shown = 0;

  for (let i = 0; i < maxLines && shown < 20; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    if (oldLine !== newLine) {
      if (oldLine !== undefined) {
        console.log(`  ${RED('-')} ${GRAY_DIM(String(i + 1).padStart(4))} ${RED(oldLine)}`);
        shown++;
      }
      if (newLine !== undefined) {
        console.log(`  ${GREEN('+')} ${GRAY_DIM(String(i + 1).padStart(4))} ${GREEN(newLine)}`);
        shown++;
      }
    }
  }

  if (maxLines > 20) {
    console.log(`  ${GRAY_DIM(`… +${maxLines - shown} lines`)}`);
  }
  console.log(`  ${ORANGE('┗' + '━'.repeat(termWidth() - 4))}`);
}

// ═══════════════════════════════════════════════════════
//  Exports
// ═══════════════════════════════════════════════════════

export { ORANGE, ORANGE_L, ORANGE_D as ORANGE_DIM, WHITE, GRAY, GRAY_DIM, RED, YELLOW, GREEN, BLUE, CYAN, B, DIM, ITALIC, hr, fmtNum };
