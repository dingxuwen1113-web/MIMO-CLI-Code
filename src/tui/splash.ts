// ═══════════════════════════════════════════════════════
//  MIMO CLI — Splash Screen (CodeWhale-inspired)
//  Compact, professional, ANSI-native
// ═══════════════════════════════════════════════════════

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ── ANSI Colors ─────────────────────────────────────────

const ORANGE   = (s: string) => `\x1b[38;2;255;165;0m${s}\x1b[0m`;
const ORANGE_L = (s: string) => `\x1b[38;2;255;195;51m${s}\x1b[0m`;
const ORANGE_D = (s: string) => `\x1b[38;2;204;85;0m${s}\x1b[0m`;
const WHITE    = (s: string) => `\x1b[97m${s}\x1b[0m`;
const GRAY     = (s: string) => `\x1b[90m${s}\x1b[0m`;
const GRAY_DIM = (s: string) => `\x1b[2m\x1b[90m${s}\x1b[0m`;
const GREEN    = (s: string) => `\x1b[32m${s}\x1b[0m`;
const B        = (s: string) => `\x1b[1m${s}\x1b[0m`;

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

// ── Terminal Utilities ──────────────────────────────────

function tw(): number {
  return Math.max(60, Math.min(100, process.stdout.columns || 80));
}

function center(text: string, width: number): string {
  const stripped = text.replace(/\x1B\[[0-9;]*m/g, '');
  const pad = Math.max(0, width - stripped.length);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

async function clearScreen(): Promise<void> {
  if (process.platform === 'win32') {
    try {
      await execAsync('cls', { shell: 'cmd.exe' });
    } catch {
      process.stdout.write('\x1b[2J\x1b[H');
    }
    process.stdout.write('\x1b[2J\x1b[H');
  } else {
    process.stdout.write('\x1b[2J\x1b[H');
  }
}

// ── Compact ASCII Art ───────────────────────────────────

const LOGO = [
  '███╗   ███╗ ██╗ ███╗   ███╗  ██████╗ ',
  '████╗ ████║ ██║ ████╗ ████║ ██╔═══██╗',
  '██╔████╔██║ ██║ ██╔████╔██║ ██║   ██║',
  '██║╚██╔╝██║ ██║ ██║╚██╔╝██║ ██║   ██║',
  '██║ ╚═╝ ██║ ██║ ██║ ╚═╝ ██║ ╚██████╔╝',
  '╚═╝     ╚═╝ ╚═╝ ╚═╝     ╚═╝  ╚═════╝ ',
];

// ── Loading Frames ──────────────────────────────────────

const LOAD_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// ═══════════════════════════════════════════════════════
//  showSplashScreen — CodeWhale-style compact splash
// ═══════════════════════════════════════════════════════

export async function showSplashScreen(): Promise<void> {
  await clearScreen();

  const w = tw();
  const border = ORANGE('━'.repeat(w - 4));

  // Build splash lines
  const lines: string[] = [];

  lines.push('');
  lines.push(`  ${ORANGE('┏')}${border}${ORANGE('┓')}`);

  // Logo
  for (const line of LOGO) {
    lines.push(`  ${ORANGE('┃')}${center(ORANGE_L(line), w - 4)}${ORANGE('┃')}`);
  }

  lines.push(`  ${ORANGE('┃')}${' '.repeat(w - 4)}${ORANGE('┃')}`);

  // Tagline — compact, CodeWhale-style
  lines.push(`  ${ORANGE('┃')}${center(B(WHITE('Terminal AI Coding Agent')), w - 4)}${ORANGE('┃')}`);
  lines.push(`  ${ORANGE('┃')}${center(GRAY('v1.0.0 · MIT · Powered by MiMO AI'), w - 4)}${ORANGE('┃')}`);

  lines.push(`  ${ORANGE('┃')}${' '.repeat(w - 4)}${ORANGE('┃')}`);
  lines.push(`  ${ORANGE('┗')}${border}${ORANGE('┛')}`);
  lines.push('');

  // Print with subtle stagger on logo lines
  process.stdout.write(HIDE_CURSOR);
  for (let i = 0; i < lines.length; i++) {
    process.stdout.write(lines[i] + '\n');
    if (i >= 1 && i < 7) {
      await delay(25);
    }
  }

  // Compact loading bar
  return new Promise((resolve) => {
    let frame = 0;
    const startTime = Date.now();
    const loadDuration = 600;
    const barWidth = Math.min(32, w - 24);
    const moduleCount = 9;

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / loadDuration);
      const filled = Math.round(progress * barWidth);
      const empty = barWidth - filled;

      const spinner = LOAD_FRAMES[frame++ % LOAD_FRAMES.length];
      const bar = ORANGE_L('━'.repeat(filled)) + GRAY_DIM('─'.repeat(empty));
      const pct = String(Math.round(progress * 100)).padStart(3);

      const loaded = Math.round(progress * moduleCount);
      const info = progress < 1
        ? GRAY(`${loaded}/${moduleCount}`)
        : GREEN(`✔ ${moduleCount}/${moduleCount}`);

      process.stdout.write(
        `\r  ${ORANGE(spinner)} ${bar}  ${WHITE(pct + '%')}  ${info}   `
      );

      if (elapsed >= loadDuration) {
        clearInterval(timer);
        process.stdout.write('\n');
        setTimeout(async () => {
          process.stdout.write(SHOW_CURSOR);
          await clearScreen();
          resolve();
        }, 150);
      }
    }, 40);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
