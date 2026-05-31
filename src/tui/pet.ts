// ── MIMO CLI Code — 米兔宠物（固定定位版）──────────
// 米兔风格：长耳朵 + 圆脸 + 小米橙色 · 固定右下角不影响对话

import chalk from 'chalk';

const O     = '#FF6900';
const O_L   = '#FF8C33';
const O_DIM = '#CC5500';
const W     = '#FFFFFF';
const G_DIM = '#606060';

const ORANGE   = chalk.hex(O);
const ORANGE_L = chalk.hex(O_L);
const ORANGE_D = chalk.hex(O_DIM);
const WHITE    = chalk.white;
const GRAY     = chalk.hex(G_DIM);

const SAVE    = '\x1b[s';
const RESTORE = '\x1b[u';
const MOVE    = (r: number, c: number) => `\x1b[${r};${c}H`;
const CLEAR   = '\x1b[K';

function ts(): { rows: number; cols: number } {
  return { rows: process.stdout.rows || 24, cols: process.stdout.columns || 80 };
}

type Mood = 'idle' | 'happy' | 'love' | 'sleep' | 'play' | 'eat' | 'wave' | 'curious';

// ═══════════════════════════════════════════════════════
//  米兔 ASCII Art（长耳朵 + 圆脸 + 身体）
// ═══════════════════════════════════════════════════════

const RABBIT: Record<Mood, string[][]> = {
  idle: [[
    '  |\\   /|',
    '  | \\ / |',
    '  |  o  |',
    ' (| o o |)',
    '  |  ^  |',
    '  | === |',
    ' /|     |\\',
    '/ |  M  | \\',
    '  |     |',
    '  |_____||',
  ], [
    '  |\\   /|',
    '  | \\ / |',
    '  |  o  |',
    ' (| o o |)',
    '  |  ^  |',
    '  | === |',
    ' /|     |\\',
    '/ |  M  | \\',
    '  |     |',
    '  ||____| ',
  ]],
  happy: [[
    '  |\\   /|',
    '  | \\ / |',
    '  |  o  |',
    ' (| ^ ^ |)',
    '  |  v  |',
    '  | === |',
    ' /|     |\\',
    '/ |  M  | \\',
    ' *|     |*',
    '  |_____| ',
  ]],
  love: [[
    '  |\\   /|',
    '  | \\ / |',
    '  |  o  |',
    ' (| @ @ |)',
    '  |  v  |',
    '  | === |',
    ' /|     |\\',
    '/ |  M  | \\',
    ' @|     |@',
    '  |_____| ',
  ]],
  sleep: [[
    '  |\\   /|',
    '  | \\ / |',
    '  |  o  |',
    ' (| - - |)',
    '  |  ^  |',
    '  | === |',
    ' /|     |\\',
    '/ |  M  | \\',
    '  |     |',
    '  |_____| z',
  ], [
    '  |\\   /|',
    '  | \\ / |',
    '  |  o  |',
    ' (| - - |)',
    '  |  ^  |',
    '  | === |',
    ' /|     |\\',
    '/ |  M  | \\',
    '  |     |',
    '  |_____|  Z',
  ]],
  play: [[
    '  |\\   /|',
    '  | \\ / |',
    '  |  o  |',
    ' (| O O |)',
    '  |  v  |',
    '  | === |',
    ' /|     |\\',
    '/ |  M  | \\',
    '  |     | *',
    '  |_____|  ',
  ], [
    '  |\\   /|',
    '  | \\ / |',
    '  |  o  |',
    ' (| O O |)',
    '  |  v  |',
    '  | === |',
    ' /|     |\\',
    '* |  M  | \\',
    '  |     | ',
    '  |_____| ',
  ]],
  eat: [[
    '  |\\   /|',
    '  | \\ / |',
    '  |  o  |',
    ' (| o o |)',
    '  | ( ) |',
    '  | === |',
    ' /|     |\\',
    '/ |  M  | \\',
    '  |     |',
    '  |_____| ',
  ]],
  wave: [[
    '  |\\   /|',
    '  | \\ / |',
    '  |  o  |',
    ' (| o o |)',
    '  |  ^  |',
    '  | === |',
    ' /|     |\\',
    '/ |  M  | \\',
    '  |     |/',
    '  |_____| ',
  ], [
    '  |\\   /|',
    '  | \\ / |',
    '  |  o  |',
    ' (| o o |)',
    '  |  ^  |',
    '  | === |',
    ' /|     |\\',
    '/ |  M  | \\',
    ' /|     |',
    '  |_____| ',
  ]],
  curious: [[
    '  |\\   /|',
    '  | \\ / |',
    '  |  o  |',
    ' (| o O |)',
    '  |  ^  |',
    '  | === |',
    ' /|     |\\',
    '/ |  M  | \\',
    '  |     |',
    '  |_____| ',
  ]],
};

const TALKS: Record<Mood, string[]> = {
  idle:    ['mi~', '...', 'need help?', 'waiting~'],
  happy:   ['happy!', 'mi mi~', 'great!', 'yeah!'],
  love:    ['love u!', 'snuggle~', 'mi love~'],
  sleep:   ['zzZ...', 'snore...', 'sleepy...', 'doze...'],
  play:    ['catch!', 'hehe~', 'again!', 'fun!'],
  eat:     ['yummy!', 'more~', 'satisfied~', 'burp~'],
  wave:    ['hello!', 'hi mi~', 'welcome!', 'hey~'],
  curious: ['hmm?', 'what this?', 'look~', 'huh?'],
};

// ═══════════════════════════════════════════════════════
//  Pet 类
// ═══════════════════════════════════════════════════════

export class Pet {
  private mood: Mood = 'idle';
  private frame: number = 0;
  private happiness: number = 60;
  private energy: number = 80;
  private lastInteract: number = Date.now();
  private animTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private visible: boolean = false;

  show(): void {
    this.visible = true;
    this.mood = 'wave';
    this.frame = 0;
    this.draw();

    setTimeout(() => {
      if (this.visible) { this.mood = 'idle'; this.frame = 0; this.draw(); }
    }, 2500);

    this.animTimer = setInterval(() => {
      if (!this.visible) return;
      this.frame++;
      this.draw();
    }, 5000);

    this.idleTimer = setInterval(() => {
      if (this.visible) this.autoUpdate();
    }, 30000);
  }

  hide(): void {
    this.visible = false;
    this.clear();
    if (this.animTimer) { clearInterval(this.animTimer); this.animTimer = null; }
    if (this.idleTimer) { clearInterval(this.idleTimer); this.idleTimer = null; }
  }

  interact(key: string): boolean {
    if (!this.visible) return false;
    this.lastInteract = Date.now();

    switch (key) {
      case 'h': this.mood = 'love';  this.happiness = Math.min(100, this.happiness + 15); this.energy = Math.max(0, this.energy - 5); break;
      case 'f': this.mood = 'eat';   this.energy = Math.min(100, this.energy + 20); this.happiness = Math.min(100, this.happiness + 5); break;
      case 'p':
        if (this.energy < 10) { this.mood = 'sleep'; this.draw(); return true; }
        this.mood = 'play'; this.happiness = Math.min(100, this.happiness + 10); this.energy = Math.max(0, this.energy - 15);
        break;
      case 's': this.mood = 'sleep'; this.energy = Math.min(100, this.energy + 30); break;
      case 'x': this.hide(); return true;
      default: return false;
    }

    this.frame = 0;
    this.draw();
    setTimeout(() => { if (this.visible) { this.mood = 'idle'; this.frame = 0; this.draw(); } }, 2000);
    return true;
  }

  isVisible(): boolean { return this.visible; }

  // ── 固定右下角绘制（ANSI 定位，不影响对话光标）──
  private draw(): void {
    if (!this.visible) return;
    const { rows, cols } = ts();

    const art = RABBIT[this.mood][this.frame % RABBIT[this.mood].length];
    const artWidth = Math.max(...art.map(l => l.length));
    const boxWidth = artWidth + 4;
    const boxHeight = art.length + 2; // art + talk only

    const startRow = rows - boxHeight - 1;
    const startCol = cols - boxWidth - 2;

    if (startRow < 1 || startCol < 1) return;

    const talk = TALKS[this.mood][this.frame % TALKS[this.mood].length];

    let out = SAVE;

    out += MOVE(startRow, startCol) + CLEAR + ORANGE_D('+-' + '-'.repeat(artWidth) + '-+');
    for (let i = 0; i < art.length; i++) {
      out += MOVE(startRow + 1 + i, startCol) + CLEAR + ORANGE_D('| ') + ORANGE_L(art[i].padEnd(artWidth)) + ORANGE_D(' |');
    }
    out += MOVE(startRow + 1 + art.length, startCol) + CLEAR + ORANGE_D('+-' + '-'.repeat(artWidth) + '-+');

    // 说话
    out += MOVE(startRow + 2 + art.length, startCol) + CLEAR + ORANGE('>') + ' ' + WHITE(talk);

    out += RESTORE;
    process.stdout.write(out);
  }

  private clear(): void {
    const { rows, cols } = ts();
    const startRow = rows - 14;
    const startCol = cols - 20;
    if (startRow < 1 || startCol < 1) return;

    let out = SAVE;
    for (let i = 0; i < 14; i++) {
      out += MOVE(startRow + i, startCol) + CLEAR;
    }
    out += RESTORE;
    process.stdout.write(out);
  }

  private autoUpdate(): void {
    const elapsed = Date.now() - this.lastInteract;
    if (elapsed > 300000 && this.mood !== 'sleep') { this.mood = 'sleep'; this.frame = 0; this.draw(); }
    if (elapsed > 600000) this.energy = Math.min(100, this.energy + 10);
    if (this.energy < 20 && this.mood !== 'sleep') { this.mood = 'sleep'; this.frame = 0; this.draw(); }
  }
}

// ═══════════════════════════════════════════════════════
//  PetManager
// ═══════════════════════════════════════════════════════

export class PetManager {
  private pet: Pet;
  constructor() { this.pet = new Pet(); }
  display(): void { this.pet.show(); }
  handleInput(input: string): boolean {
    const key = input.trim().toLowerCase();
    if (key.length === 1 && 'hfpsx'.includes(key)) return this.pet.interact(key);
    if (key === '/pet') { this.pet.isVisible() ? this.pet.hide() : this.pet.show(); return true; }
    return false;
  }
  hide(): void { this.pet.hide(); }
}
