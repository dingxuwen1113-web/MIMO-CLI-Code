// ═══════════════════════════════════════════════════════
//  MIMO CLI — Animation System
//  ANSI-native (no chalk dependency)
// ═══════════════════════════════════════════════════════

// ── ANSI Colors ─────────────────────────────────────────

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

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

// ═══════════════════════════════════════════════════════
//  1. Spinner — Multi-frame with 3 Styles
// ═══════════════════════════════════════════════════════

const SPINNER_FRAMES_MAP: Record<string, string[]> = {
  dots: ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'],
  line: ['─', '\\', '|', '/'],
  arc:  ['◜', '◝', '◞', '◟'],
};

export interface SpinnerInstance {
  timer: NodeJS.Timeout;
  text: string;
  startTime: number;
}

export function createSpinner(
  text: string,
  style: keyof typeof SPINNER_FRAMES_MAP = 'dots',
  color: (s: string) => string = ORANGE
): SpinnerInstance {
  const frames = SPINNER_FRAMES_MAP[style] || SPINNER_FRAMES_MAP.dots;
  const startTime = Date.now();
  let frameIndex = 0;

  process.stdout.write(HIDE_CURSOR);

  const timer = setInterval(() => {
    const frame = frames[frameIndex++ % frames.length];
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(`\r  ${color(frame)} ${GRAY(text)} ${GRAY_DIM(`${elapsed}s`)}`);
  }, 80);

  return { timer, text, startTime };
}

export function stopSpinner(spinner: SpinnerInstance | null, result?: 'success' | 'error' | 'warning'): void {
  if (!spinner) return;
  clearInterval(spinner.timer);

  const elapsed = ((Date.now() - spinner.startTime) / 1000).toFixed(1);
  const icon = {
    success: GREEN('✔'),
    error: RED('✖'),
    warning: YELLOW('⚠'),
  }[result || 'success'] || GREEN('✔');

  const w = process.stdout.columns || 80;
  process.stdout.write('\r' + ' '.repeat(w) + '\r');
  console.log(`  ${icon} ${GRAY(spinner.text)} ${GRAY_DIM(`${elapsed}s`)}`);
  process.stdout.write(SHOW_CURSOR);
}

// ═══════════════════════════════════════════════════════
//  2. StreamingRenderer — Real-time Streaming Text
// ═══════════════════════════════════════════════════════

export class StreamingRenderer {
  private buffer: string = '';
  private lineBuffer: string = '';
  private inCodeBlock: boolean = false;
  private codeLanguage: string = '';
  private renderedChars: number = 0;
  private partialShown: boolean = false;

  write(chunk: string): void {
    this.buffer += chunk;
    this.flush();
  }

  private flush(): void {
    while (this.buffer.length > 0) {
      const newlineIdx = this.buffer.indexOf('\n');
      if (newlineIdx === -1) {
        // No complete line yet — accumulate and render partial
        this.lineBuffer += this.buffer;
        this.buffer = '';

        if (this.lineBuffer.length > 0 && !this.inCodeBlock) {
          const partial = this.renderInline(this.lineBuffer);
          const w = process.stdout.columns || 80;
          const cleaned = this.lineBuffer.replace(/\s+/g, ' ').slice(-60);
          if (cleaned.length > 0) {
            process.stdout.write(`\r  ${partial}`);
            this.partialShown = true;
          }
        }
        return;
      }

      const line = this.lineBuffer + this.buffer.slice(0, newlineIdx);
      this.buffer = this.buffer.slice(newlineIdx + 1);
      this.lineBuffer = '';

      // Clear any partial line
      if (this.partialShown) {
        const w = process.stdout.columns || 80;
        process.stdout.write('\r' + ' '.repeat(w) + '\r');
        this.partialShown = false;
      }

      this.renderLine(line);
    }
  }

  private renderLine(line: string): void {
    // Code block fence
    if (line.trimStart().startsWith('```')) {
      if (!this.inCodeBlock) {
        this.inCodeBlock = true;
        this.codeLanguage = line.trimStart().replace(/^```/, '').trim();
        const langLabel = this.codeLanguage ? ` ${GRAY(this.codeLanguage)}` : '';
        const w = process.stdout.columns || 80;
        console.log(`  ${ORANGE_D('┌───')}${langLabel}${ORANGE_D('─'.repeat(Math.max(0, w - 10 - this.codeLanguage.length)))}`);
      } else {
        this.inCodeBlock = false;
        this.codeLanguage = '';
        console.log(`  ${ORANGE_D('└───' + '─'.repeat((process.stdout.columns || 80) - 8))}`);
      }
      return;
    }

    // Inside code block
    if (this.inCodeBlock) {
      console.log(`  ${ORANGE_D('│')} ${WHITE(line)}`);
      return;
    }

    // Empty
    if (!line.trim()) {
      console.log('');
      return;
    }

    // Headings
    if (line.startsWith('#### ')) {
      console.log(`  ${B(ORANGE_L(line.replace('#### ', '* ')))}`);
      return;
    }
    if (line.startsWith('### ')) {
      console.log(`  ${B(ORANGE(line.replace('### ', '◆ ')))}`);
      return;
    }
    if (line.startsWith('## ')) {
      console.log('');
      console.log(`  ${B(ORANGE(line.replace('## ', '━━ ')))}`);
      return;
    }
    if (line.startsWith('# ')) {
      console.log('');
      console.log(`  ${B(ORANGE_L(line.replace('# ', '━━━ ')))}`);
      return;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      console.log(`  ${ORANGE_D('│')} ${GRAY(line.slice(2))}`);
      return;
    }

    // Horizontal rule
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) {
      console.log(`  ${GRAY('─'.repeat(process.stdout.columns || 80 - 8))}`);
      return;
    }

    // Unordered list
    if (line.match(/^\s*[-*]\s/)) {
      const indent = (line.match(/^(\s*)/)?.[1] || '').length;
      const content = line.replace(/^\s*[-*]\s/, '');
      console.log(`${' '.repeat(indent)}  ${ORANGE('●')} ${this.renderInline(content)}`);
      return;
    }

    // Ordered list
    if (line.match(/^\s*\d+\.\s/)) {
      const indent = (line.match(/^(\s*)/)?.[1] || '').length;
      const num = line.match(/(\d+)\./)?.[1] || '1';
      const content = line.replace(/^\s*\d+\.\s/, '');
      console.log(`${' '.repeat(indent)}  ${ORANGE(num + '.')} ${this.renderInline(content)}`);
      return;
    }

    // Normal line
    console.log(`  ${this.renderInline(line)}`);
  }

  private renderInline(text: string): string {
    return text
      .replace(/`([^`]+)`/g, (_, code) => ORANGE_L(` ${code} `))
      .replace(/\*\*([^*]+)\*\*/g, (_, bold) => B(WHITE(bold)))
      .replace(/\*([^*]+)\*/g, (_, italic) => GRAY(italic))
      .replace(/~~([^~]+)~~/g, (_, strike) => GRAY_DIM(strike))
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => CYAN(label) + GRAY_DIM(` (${url})`));
  }

  end(): void {
    const w = process.stdout.columns || 80;
    process.stdout.write('\r' + ' '.repeat(w) + '\r');
    if (this.lineBuffer.trim()) {
      this.renderLine(this.lineBuffer);
      this.lineBuffer = '';
    }
    if (this.inCodeBlock) {
      console.log(`  ${ORANGE_D('└───' + '─'.repeat(w - 8))}`);
      this.inCodeBlock = false;
    }
    this.buffer = '';
  }
}

// ═══════════════════════════════════════════════════════
//  3. animateToolCall — Animated Tool Execution
// ═══════════════════════════════════════════════════════

export function animateToolCall(
  toolName: string,
  description: string
): { update: (desc: string) => void; done: (isError: boolean) => void } {
  const frames = SPINNER_FRAMES_MAP.dots;
  let frameIdx = 0;
  let currentDesc = description;
  const startTime = Date.now();

  process.stdout.write(HIDE_CURSOR);
  console.log(`  ${ORANGE('╭─')} ${B(ORANGE_L(toolName))} ${GRAY_DIM(currentDesc)}`);

  const timer = setInterval(() => {
    const frame = frames[frameIdx++ % frames.length];
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(`\r  ${ORANGE('│')} ${ORANGE(frame)} ${GRAY(currentDesc)} ${GRAY_DIM(`${elapsed}s`)}`);
  }, 80);

  return {
    update: (desc: string) => {
      currentDesc = desc;
    },
    done: (isError: boolean) => {
      clearInterval(timer);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const w = process.stdout.columns || 80;
      process.stdout.write('\r' + ' '.repeat(w) + '\r');
      const icon = isError ? RED('✖') : GREEN('✔');
      console.log(`  ${ORANGE('│')} ${icon} ${GRAY(currentDesc)} ${GRAY_DIM(`${elapsed}s`)}`);
      console.log(`  ${ORANGE('╰─')} ${isError ? RED('error') : GREEN('done')}`);
      process.stdout.write(SHOW_CURSOR);
    },
  };
}

// ═══════════════════════════════════════════════════════
//  4. showToast — Toast Notification (slides in from right)
// ═══════════════════════════════════════════════════════

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export function showToast(message: string, type: ToastType = 'info', duration: number = 3000): void {
  const icons: Record<ToastType, { icon: string; color: (s: string) => string }> = {
    info:    { icon: 'ℹ', color: ORANGE },
    success: { icon: '✔', color: GREEN },
    warning: { icon: '⚠', color: YELLOW },
    error:   { icon: '✖', color: RED },
  };

  const { icon, color } = icons[type];
  const w = process.stdout.columns || 80;
  const msgLen = message.length;
  const boxW = Math.min(w - 4, msgLen + 8);

  // Animate slide-in from right
  const targetOffset = 2;
  const steps = 8;

  let step = 0;
  const slideTimer = setInterval(() => {
    step++;
    const progress = step / steps;
    const offset = Math.round((1 - progress) * (w - boxW));
    const padLeft = ' '.repeat(offset);

    // Clear previous toast lines
    if (step > 1) {
      process.stdout.write('\x1b[3A');
      process.stdout.write('\x1b[2K\n\x1b[2K\n\x1b[2K\n');
      process.stdout.write('\x1b[3A');
    }

    console.log(`${padLeft}${color('┏' + '━'.repeat(boxW) + '┓')}`);
    console.log(`${padLeft}${color('┃')} ${color(icon)} ${WHITE(message)}${' '.repeat(Math.max(0, boxW - msgLen - 4))} ${color('┃')}`);
    console.log(`${padLeft}${color('┗' + '━'.repeat(boxW) + '┛')}`);

    if (step >= steps) {
      clearInterval(slideTimer);

      // Auto-dismiss after duration
      if (duration > 0) {
        setTimeout(() => {
          process.stdout.write('\x1b[3A');
          process.stdout.write('\x1b[2K\n\x1b[2K\n\x1b[2K\n');
          process.stdout.write('\x1b[3A');
        }, duration);
      }
    }
  }, 40);
}

// ═══════════════════════════════════════════════════════
//  5. MultiStepAnimator — Multi-step Progress Display
// ═══════════════════════════════════════════════════════

export interface Step {
  label: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
}

export class MultiStepAnimator {
  private steps: Step[];
  private spinnerFrame: number = 0;
  private timer: NodeJS.Timeout | null = null;
  private lineCount: number = 0;
  private started: boolean = false;

  constructor(steps: Step[]) {
    this.steps = steps.map((s) => ({ ...s, status: s.status || 'pending' }));
  }

  render(): void {
    if (!this.started) return;

    // Move cursor up to overwrite previous render
    for (let i = 0; i < this.lineCount; i++) {
      process.stdout.write('\x1b[1A\x1b[2K');
    }

    this.lineCount = 0;
    for (const step of this.steps) {
      const icon = {
        pending: GRAY_DIM('○'),
        running: ORANGE(SPINNER_FRAMES_MAP.dots[this.spinnerFrame % SPINNER_FRAMES_MAP.dots.length]),
        done: GREEN('✔'),
        error: RED('✖'),
        skipped: YELLOW('⊘'),
      }[step.status];

      const label = step.status === 'running'
        ? B(WHITE(step.label))
        : step.status === 'done'
          ? GRAY(step.label)
          : step.status === 'error'
            ? RED(step.label)
            : GRAY(step.label);

      console.log(`  ${icon} ${label}`);
      this.lineCount++;
    }
  }

  setStep(index: number, status: Step['status']): void {
    if (index >= 0 && index < this.steps.length) {
      this.steps[index].status = status;
      if (status === 'running') {
        // All steps before this one that are still pending should stay pending
      }
    }
  }

  start(): void {
    this.started = true;
    process.stdout.write(HIDE_CURSOR);

    // Initial render
    for (const step of this.steps) {
      console.log(`  ${GRAY_DIM('○')} ${GRAY(step.label)}`);
    }
    this.lineCount = this.steps.length;

    // Start animation timer
    this.timer = setInterval(() => {
      this.spinnerFrame++;
      this.render();
    }, 100);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Final render with no spinner animation
    const runningStep = this.steps.find(s => s.status === 'running');
    if (runningStep) {
      // Don't auto-complete running steps
    }
    this.render();
    process.stdout.write(SHOW_CURSOR);
  }

  complete(message?: string): void {
    // Mark all pending/running as done
    for (const step of this.steps) {
      if (step.status === 'pending' || step.status === 'running') {
        step.status = 'done';
      }
    }
    this.stop();
    if (message) {
      confetti(message);
    }
  }
}

// ═══════════════════════════════════════════════════════
//  6. confetti — Terminal Confetti Animation
// ═══════════════════════════════════════════════════════

export function confetti(message: string = 'Done!'): void {
  const symbols = ['✦', '✧', '◆', '○', '●', '★', '☆', '▪', '▫', '◇', '⬡', '⬢'];
  const colors = [ORANGE, ORANGE_L, GREEN, YELLOW, WHITE, CYAN];

  console.log('');

  // Top confetti burst
  let line1 = '  ';
  for (let i = 0; i < 24; i++) {
    const sym = symbols[Math.floor(Math.random() * symbols.length)];
    const color = colors[Math.floor(Math.random() * colors.length)];
    line1 += color(sym) + ' ';
  }
  console.log(line1);

  // Center message
  const msgLine = `  ${B(ORANGE_L('★'))}  ${B(WHITE(message))}  ${B(ORANGE_L('★'))}`;
  console.log(msgLine);

  // Bottom confetti burst
  let line2 = '  ';
  for (let i = 0; i < 24; i++) {
    const sym = symbols[Math.floor(Math.random() * symbols.length)];
    const color = colors[Math.floor(Math.random() * colors.length)];
    line2 += color(sym) + ' ';
  }
  console.log(line2);
  console.log('');
}

// ═══════════════════════════════════════════════════════
//  7. TypewriterEffect — Character-by-character Reveal
// ═══════════════════════════════════════════════════════

export class TypewriterEffect {
  private text: string;
  private speed: number;
  private color: (s: string) => string;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    text: string,
    options: {
      speed?: number;
      color?: (s: string) => string;
    } = {}
  ) {
    this.text = text;
    this.speed = options.speed || 20;
    this.color = options.color || WHITE;
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      let i = 0;
      process.stdout.write(HIDE_CURSOR);

      this.timer = setInterval(() => {
        if (i < this.text.length) {
          const char = this.text[i];
          if (char === '\n') {
            process.stdout.write('\n');
          } else {
            process.stdout.write(this.color(char));
          }
          i++;
        } else {
          this.stop();
          process.stdout.write('\n');
          resolve();
        }
      }, this.speed);
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    process.stdout.write(SHOW_CURSOR);
  }
}

// ═══════════════════════════════════════════════════════
//  8. ProgressBar — Animated Progress with ETA
// ═══════════════════════════════════════════════════════

export class ProgressBar {
  private current: number = 0;
  private total: number;
  private label: string;
  private timer: NodeJS.Timeout | null = null;
  private startTime: number = 0;
  private animFrame: number = 0;

  constructor(total: number, label: string = '') {
    this.total = total;
    this.label = label;
  }

  start(): void {
    this.startTime = Date.now();
    process.stdout.write(HIDE_CURSOR);
    this.timer = setInterval(() => {
      this.animFrame++;
      this.render();
    }, 100);
  }

  update(current: number): void {
    this.current = Math.min(current, this.total);
  }

  increment(amount: number = 1): void {
    this.current = Math.min(this.current + amount, this.total);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.render();
    process.stdout.write('\n');
    process.stdout.write(SHOW_CURSOR);
  }

  private render(): void {
    const w = Math.min(40, (process.stdout.columns || 80) - 35);
    const pct = this.total > 0 ? this.current / this.total : 0;
    const filled = Math.round(pct * w);
    const empty = w - filled;

    // Animated shimmer on the leading edge
    const shimmerPos = this.animFrame % 3;
    const bar = Array.from({ length: w }, (_, i) => {
      if (i < filled) {
        if (i === filled - 1 && filled < w) return ORANGE_L('█');
        return ORANGE('█');
      }
      return GRAY_DIM('░');
    }).join('');

    const pctStr = B(WHITE(`${Math.round(pct * 100)}%`));

    // ETA calculation
    const elapsed = (Date.now() - this.startTime) / 1000;
    let eta = '';
    if (this.current > 0 && pct < 1) {
      const rate = this.current / elapsed;
      const remaining = (this.total - this.current) / rate;
      if (remaining < 60) {
        eta = GRAY_DIM(` ETA ${Math.round(remaining)}s`);
      } else {
        eta = GRAY_DIM(` ETA ${Math.round(remaining / 60)}m${Math.round(remaining % 60)}s`);
      }
    }

    const labelStr = this.label ? ` ${GRAY(this.label)}` : '';
    process.stdout.write(`\r  ${ORANGE('[')}${bar}${ORANGE(']')} ${pctStr}${eta}${labelStr}`);
  }
}

// ═══════════════════════════════════════════════════════
//  9. MatrixRain — Easter Egg Terminal Rain Effect
// ═══════════════════════════════════════════════════════

export function MatrixRain(durationMs: number = 5000): Promise<void> {
  return new Promise((resolve) => {
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;
    const chars = 'ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ012345789ABCDEFZ';
    const drops: number[] = Array.from({ length: cols }, () => Math.floor(Math.random() * -rows));

    process.stdout.write(HIDE_CURSOR);
    // Save cursor and clear screen
    process.stdout.write('\x1b[s\x1b[2J\x1b[H');

    const startTime = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startTime > durationMs) {
        clearInterval(timer);
        process.stdout.write('\x1b[2J\x1b[H\x1b[u');
        process.stdout.write(SHOW_CURSOR);
        resolve();
        return;
      }

      // Build frame buffer
      const grid: string[][] = Array.from({ length: rows }, () => Array(cols).fill(''));

      for (let x = 0; x < cols; x++) {
        const dropY = drops[x];
        for (let y = 0; y < rows; y++) {
          const dist = dropY - y;
          if (dist >= 0 && dist < 20) {
            const ch = chars[Math.floor(Math.random() * chars.length)];
            if (dist === 0) {
              grid[y][x] = `\x1b[97m${ch}\x1b[0m`; // bright white head
            } else if (dist < 3) {
              grid[y][x] = `\x1b[32m${ch}\x1b[0m`; // bright green
            } else {
              const dim = Math.max(0, 1 - dist / 20);
              grid[y][x] = `\x1b[38;2;0;${Math.round(100 + 155 * dim)};0m${ch}\x1b[0m`; // fading green
            }
          }
        }

        drops[x]++;
        if (drops[x] - 20 > rows && Math.random() > 0.975) {
          drops[x] = Math.floor(Math.random() * -10);
        }
      }

      // Move to top-left and render frame
      process.stdout.write('\x1b[H');
      for (let y = 0; y < rows; y++) {
        let line = '';
        for (let x = 0; x < cols; x++) {
          line += grid[y][x] || ' ';
        }
        process.stdout.write(line + (y < rows - 1 ? '\n' : ''));
      }
    }, 60);
  });
}

// ═══════════════════════════════════════════════════════
//  Utility: Animated Diff Renderer
// ═══════════════════════════════════════════════════════

export class StreamingDiffRenderer {
  private filePath: string;
  private oldLines: string[];
  private newLines: string[];
  private currentLine: number = 0;
  private timer: NodeJS.Timeout | null = null;
  private speed: number;

  constructor(filePath: string, oldContent: string, newContent: string, speed: number = 50) {
    this.filePath = filePath;
    this.oldLines = oldContent.split('\n');
    this.newLines = newContent.split('\n');
    this.speed = speed;
  }

  animate(): Promise<void> {
    return new Promise((resolve) => {
      const w = process.stdout.columns || 80;
      console.log('');
      console.log(`  ${ORANGE('┏━━')} ${B(WHITE('Diff'))} ${GRAY(this.filePath)} ${ORANGE('━'.repeat(Math.max(0, w - 14 - this.filePath.length)))}`);

      const maxLines = Math.max(this.oldLines.length, this.newLines.length);
      this.currentLine = 0;

      this.timer = setInterval(() => {
        if (this.currentLine >= maxLines) {
          this.stop();
          console.log(`  ${ORANGE('┗' + '━'.repeat(w - 4))}`);
          resolve();
          return;
        }

        const i = this.currentLine;
        const oldLine = this.oldLines[i];
        const newLine = this.newLines[i];

        if (oldLine !== newLine) {
          if (oldLine !== undefined) {
            console.log(`  ${RED('-')} ${GRAY_DIM(String(i + 1).padStart(4))} ${RED(oldLine)}`);
          }
          if (newLine !== undefined) {
            console.log(`  ${GREEN('+')} ${GRAY_DIM(String(i + 1).padStart(4))} ${GREEN(newLine)}`);
          }
        } else {
          console.log(`  ${GRAY_DIM('  ')} ${GRAY_DIM(String(i + 1).padStart(4))} ${GRAY_DIM(oldLine || '')}`);
        }

        this.currentLine++;
      }, this.speed);
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

// ═══════════════════════════════════════════════════════
//  Exports
// ═══════════════════════════════════════════════════════

export {
  ORANGE, ORANGE_L, ORANGE_D, WHITE, GRAY, GRAY_DIM, GREEN, RED, YELLOW, BLUE, CYAN, B, DIM,
};
