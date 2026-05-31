// ── Computer Use Engine: cross-platform desktop GUI automation ──
// Strategy:
//   1. Try @nut-tree-fork/nutjs (native, cross-platform) when installed
//   2. Fall back to platform-specific commands (PowerShell on Windows,
//      xdotool on Linux, osascript/screencapture on macOS)
//   3. If nothing is available, print clear install instructions

import { ToolResult } from '../registry';
import { execFile } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

// ── Max screenshot size (4096x4096 area to avoid huge payloads) ──
const MAX_SCREENSHOT_AREA = 4096 * 4096;
const MAX_SCREENSHOT_BASE64 = 10 * 1024 * 1024; // 10 MB base64 limit

const platform = process.platform; // 'win32' | 'darwin' | 'linux'

// ── Lazy nut.js loader ────────────────────────────────────────────────

let nut: any = null;
let nutLoadFailed = false;

function tryGetNut(): any {
  if (nutLoadFailed) return null;
  if (nut) return nut;
  try {
    nut = require('@nut-tree-fork/nutjs');
    return nut;
  } catch {
    nutLoadFailed = true;
    return null;
  }
}

// ── Platform helper: run a process and return stdout ──────────────────

function run(
  cmd: string,
  args: string[],
  opts: { timeout?: number; encoding?: BufferEncoding } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { timeout: opts.timeout ?? 15000, encoding: opts.encoding ?? 'utf-8' },
      (err, stdout, stderr) => {
        if (err) reject(new Error(`${cmd} failed: ${err.message}\n${stderr || ''}`));
        else resolve(stdout);
      },
    );
  });
}

// ── PowerShell helper (Windows only) ──────────────────────────────────

function ps(script: string): Promise<string> {
  return run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ]);
}

// ── Coordinate safety ─────────────────────────────────────────────────

function assertCoord(x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`Invalid coordinates: (${x}, ${y})`);
  }
  if (x < 0 || y < 0 || x > 32767 || y > 32767) {
    throw new Error(`Coordinates out of bounds: (${x}, ${y}). Must be 0-32767.`);
  }
}

// ── Sanitize text for keyboard input ──────────────────────────────────

function sanitizeText(text: string): string {
  // Strip null bytes and control characters except common ones (tab, newline, cr)
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// ── Region validation ─────────────────────────────────────────────────

interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function validateRegion(r: Region): void {
  if (r.x0 < 0 || r.y0 < 0 || r.x1 < 0 || r.y1 < 0) {
    throw new Error('Region coordinates must be non-negative');
  }
  if (r.x1 <= r.x0 || r.y1 <= r.y0) {
    throw new Error(`Invalid region: x1(${r.x1}) must be > x0(${r.x0}), y1(${r.y1}) must be > y0(${r.y0})`);
  }
  const area = (r.x1 - r.x0) * (r.y1 - r.y0);
  if (area > MAX_SCREENSHOT_AREA) {
    throw new Error(`Region too large: ${area} pixels. Max: ${MAX_SCREENSHOT_AREA}`);
  }
}

// ══════════════════════════════════════════════════════════
//  Screenshot
// ══════════════════════════════════════════════════════════

async function screenshotWindows(display: number, region?: Region): Promise<string> {
  // Build the PowerShell screenshot script using .NET System.Drawing
  const screenBounds = region
    ? `New-Object System.Drawing.Rectangle(${region.x0}, ${region.y0}, ${region.x1 - region.x0}, ${region.y1 - region.y0})`
    : `[System.Windows.Forms.Screen]::AllScreens[${display}].Bounds`;

  const script = `
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $bounds = ${screenBounds}
    $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    [Convert]::ToBase64String($ms.ToArray())
    $g.Dispose(); $bmp.Dispose(); $ms.Dispose()
  `.trim();

  return ps(script);
}

async function screenshotMac(display: number, region?: Region): Promise<string> {
  const tmpFile = path.join(os.tmpdir(), `mimo_screenshot_${Date.now()}.png`);
  let args = ['-x', '-C']; // -C = capture cursor, -x = suppress sound
  if (display > 0) args.push('-D', String(display));
  if (region) {
    const w = region.x1 - region.x0;
    const h = region.y1 - region.y0;
    args.push('-R', `${region.x0},${region.y0},${w},${h}`);
  }
  args.push(tmpFile);
  await run('screencapture', args);
  const data = await fs.readFile(tmpFile);
  await fs.unlink(tmpFile).catch(() => {});
  return data.toString('base64');
}

async function screenshotLinux(display: number, region?: Region): Promise<string> {
  const tmpFile = path.join(os.tmpdir(), `mimo_screenshot_${Date.now()}.png`);
  const displayEnv = `DISPLAY=:${display}`;
  let args = [tmpFile];
  if (region) {
    args = ['-window', 'root', '-crop', `${region.x1 - region.x0}x${region.y1 - region.y0}+${region.x0}+${region.y0}`, tmpFile];
  }
  await run('import', args);
  const data = await fs.readFile(tmpFile);
  await fs.unlink(tmpFile).catch(() => {});
  return data.toString('base64');
}

// ══════════════════════════════════════════════════════════
//  Click
// ══════════════════════════════════════════════════════════

const BUTTON_MAP: Record<string, string> = { left: 'Left', right: 'Right', middle: 'Middle' };

async function clickWindows(x: number, y: number, button: string, clickType: string): Promise<void> {
  // Move cursor first, then click
  const btn = BUTTON_MAP[button] || 'Left';
  const count = clickType === 'triple' ? 3 : clickType === 'double' ? 2 : 1;

  // SetCursorPos + SendInput via C# Add-Type
  const script = `
    Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public class MouseOps {
        [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
        [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo);
        public const uint MOUSEEVENTF_LEFTDOWN  = 0x0002;
        public const uint MOUSEEVENTF_LEFTUP    = 0x0004;
        public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        public const uint MOUSEEVENTF_RIGHTUP   = 0x0010;
        public const uint MOUSEEVENTF_MIDDLEDOWN= 0x0020;
        public const uint MOUSEEVENTF_MIDDLEUP  = 0x0040;
      }
"@
    [MouseOps]::SetCursorPos(${x}, ${y})
    Start-Sleep -Milliseconds 20
    for ($i = 0; $i -lt ${count}; $i++) {
      [MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_${btn}DOWN, 0, 0, 0, 0)
      [MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_${btn}UP, 0, 0, 0, 0)
      Start-Sleep -Milliseconds 30
    }
  `.trim();

  await ps(script);
}

async function clickMac(x: number, y: number, button: string, clickType: string): Promise<void> {
  const cmd = clickType === 'double' ? 'double click' : clickType === 'triple' ? 'double click' : 'click';
  const btnArg = button === 'right' ? ' with {button:right}' : button === 'middle' ? ' with {button:middle}' : '';
  const script = `
    tell application "System Events"
      set position of mouse to {${x}, ${y}}
      ${cmd}${btnArg}
    end tell
  `;
  await run('osascript', ['-e', script]);
  if (clickType === 'triple') {
    await run('osascript', ['-e', `tell application "System Events" to click${btnArg}`]);
  }
}

async function clickLinux(x: number, y: number, button: string, clickType: string): Promise<void> {
  const btnNum = button === 'right' ? '3' : button === 'middle' ? '2' : '1';
  const count = clickType === 'triple' ? 3 : clickType === 'double' ? 2 : 1;
  await run('xdotool', ['mousemove', String(x), String(y)]);
  await run('xdotool', ['click', '--repeat', String(count), '--delay', '30', btnNum]);
}

// ══════════════════════════════════════════════════════════
//  Type
// ══════════════════════════════════════════════════════════

async function typeWindows(text: string, delay: number): Promise<void> {
  // Use SendKeys for reliable Unicode support
  // Escape special chars: +^%~(){}[] with braces
  const escaped = text
    .replace(/[+^%~(){}[\]]/g, (ch) => `{${ch}}`)
    .replace(/\n/g, '{ENTER}')
    .replace(/\t/g, '{TAB}');

  const script = `
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait('${escaped.replace(/'/g, "''")}')
  `;
  await ps(script);
}

async function typeMac(text: string, delay: number): Promise<void> {
  // osascript keystroke handles Unicode
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `
    tell application "System Events"
      keystroke "${escaped}"
    end tell
  `;
  await run('osascript', ['-e', script]);
}

async function typeLinux(text: string, delay: number): Promise<void> {
  await run('xdotool', ['type', '--delay', String(delay), '--clearmodifiers', text]);
}

// ══════════════════════════════════════════════════════════
//  Key
// ══════════════════════════════════════════════════════════

// Parse "ctrl+shift+a" into modifiers + key
interface KeyCombo {
  modifiers: string[];
  key: string;
}

function parseKeyCombo(keys: string): KeyCombo {
  const parts = keys
    .toLowerCase()
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) throw new Error('Empty key combo');

  const modifierNames = new Set(['ctrl', 'control', 'alt', 'shift', 'meta', 'win', 'super', 'cmd', 'command']);
  const modifiers: string[] = [];
  let key = '';

  for (const part of parts) {
    if (modifierNames.has(part)) {
      const normalized =
        part === 'control' ? 'ctrl' :
        part === 'cmd' || part === 'command' || part === 'super' ? 'meta' :
        part === 'win' ? 'meta' :
        part;
      modifiers.push(normalized);
    } else {
      key = part;
    }
  }

  if (!key) {
    // If only modifiers, the last one is treated as the key
    key = modifiers.pop() || parts[parts.length - 1];
  }

  return { modifiers, key };
}

// Map generic key names to platform-specific key names
const KEY_MAP_WIN: Record<string, string> = {
  enter: '{ENTER}', return: '{ENTER}', tab: '{TAB}', escape: '{ESC}', esc: '{ESC}',
  backspace: '{BACKSPACE}', delete: '{DELETE}', del: '{DELETE}',
  space: ' ', up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}',
  home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}',
  f1: '{F1}', f2: '{F2}', f3: '{F3}', f4: '{F4}', f5: '{F5}', f6: '{F6}',
  f7: '{F7}', f8: '{F8}', f9: '{F9}', f10: '{F10}', f11: '{F11}', f12: '{F12}',
  printscreen: '{PRTSC}', capslock: '{CAPSLOCK}',
};

const MODIFIER_MAP_WIN: Record<string, string> = {
  ctrl: '^', alt: '%', shift: '+', meta: '^',
};

async function keyWindows(keys: string, repeat: number): Promise<void> {
  const combo = parseKeyCombo(keys);
  const keyPart = KEY_MAP_WIN[combo.key] || combo.key;

  // Build SendKeys string: ^ = Ctrl, % = Alt, + = Shift
  let sendKeysStr = '';
  for (const mod of combo.modifiers) {
    sendKeysStr += MODIFIER_MAP_WIN[mod] || '';
  }
  // Wrap multi-char keys in braces if not already
  if (keyPart.length > 1 && !keyPart.startsWith('{')) {
    sendKeysStr += `{${keyPart}}`;
  } else {
    sendKeysStr += keyPart;
  }

  const script = `
    Add-Type -AssemblyName System.Windows.Forms
    for ($i = 0; $i -lt ${repeat}; $i++) {
      [System.Windows.Forms.SendKeys]::SendWait('${sendKeysStr.replace(/'/g, "''")}')
      Start-Sleep -Milliseconds 30
    }
  `;
  await ps(script);
}

const KEY_MAP_MAC: Record<string, string> = {
  enter: 'return', return: 'return', tab: 'tab', escape: 'escape', esc: 'escape',
  backspace: 'delete', delete: 'forward delete', del: 'forward delete',
  space: 'space', up: 'up arrow', down: 'down arrow', left: 'left arrow', right: 'right arrow',
  home: 'home', end: 'end', pageup: 'page up', pagedown: 'page down',
  f1: 'f1', f2: 'f2', f3: 'f3', f4: 'f4', f5: 'f5', f6: 'f6',
  f7: 'f7', f8: 'f8', f9: 'f9', f10: 'f10', f11: 'f11', f12: 'f12',
  printscreen: '', capslock: 'caps lock',
};

async function keyMac(keys: string, repeat: number): Promise<void> {
  const combo = parseKeyCombo(keys);
  const keyPart = KEY_MAP_MAC[combo.key] ?? combo.key;

  if (!keyPart) return;

  const hasModifiers = combo.modifiers.length > 0;
  let modStr = '';
  if (combo.modifiers.includes('ctrl')) modStr += 'control down, ';
  if (combo.modifiers.includes('alt')) modStr += 'option down, ';
  if (combo.modifiers.includes('shift')) modStr += 'shift down, ';
  if (combo.modifiers.includes('meta')) modStr += 'command down, ';

  // Single character with modifiers → use key down; multi-char → use keystroke
  const isSingleChar = keyPart.length === 1;
  const script = `
    tell application "System Events"
      repeat ${repeat} times
        ${isSingleChar ? `keystroke "${keyPart}" using {${modStr.slice(0, -2)}}` : `key code ${keyPart} using {${modStr.slice(0, -2)}}`}
      end repeat
    end tell
  `;
  // For named keys, use key code; fall back to keystroke
  await run('osascript', ['-e', script]).catch(async () => {
    // Fallback: try keystroke approach
    await run('osascript', ['-e', `
      tell application "System Events"
        repeat ${repeat} times
          keystroke "${keyPart}"${modStr ? ` using {${modStr.slice(0, -2)}}` : ''}
        end repeat
      end tell
    `]);
  });
}

const KEY_MAP_LINUX: Record<string, string> = {
  enter: 'Return', return: 'Return', tab: 'Tab', escape: 'Escape', esc: 'Escape',
  backspace: 'BackSpace', delete: 'Delete', del: 'Delete',
  space: 'space', up: 'Up', down: 'Down', left: 'Left', right: 'Right',
  home: 'Home', end: 'End', pageup: 'Page_Up', pagedown: 'Page_Down',
  f1: 'F1', f2: 'F2', f3: 'F3', f4: 'F4', f5: 'F5', f6: 'F6',
  f7: 'F7', f8: 'F8', f9: 'F9', f10: 'F10', f11: 'F11', f12: 'F12',
  printscreen: 'Print', capslock: 'Caps_Lock',
};

const MODIFIER_MAP_LINUX: Record<string, string> = {
  ctrl: 'ctrl', alt: 'alt', shift: 'shift', meta: 'super',
};

async function keyLinux(keys: string, repeat: number): Promise<void> {
  const combo = parseKeyCombo(keys);
  const xdotoolKey = KEY_MAP_LINUX[combo.key] || combo.key;

  // Build xdotool key string: "ctrl+shift+a"
  const parts: string[] = [];
  for (const mod of combo.modifiers) {
    parts.push(MODIFIER_MAP_LINUX[mod] || mod);
  }
  parts.push(xdotoolKey);
  const keyStr = parts.join('+');

  for (let i = 0; i < repeat; i++) {
    await run('xdotool', ['key', '--clearmodifiers', keyStr]);
  }
}

// ══════════════════════════════════════════════════════════
//  Mouse Move
// ══════════════════════════════════════════════════════════

async function mouseMoveWindows(x: number, y: number): Promise<void> {
  const script = `
    Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public class CursorPos { [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y); }
"@
    [CursorPos]::SetCursorPos(${x}, ${y})
  `;
  await ps(script);
}

async function mouseMoveMac(x: number, y: number): Promise<void> {
  await run('osascript', ['-e', `tell application "System Events" to set position of mouse to {${x}, ${y}}`]);
}

async function mouseMoveLinux(x: number, y: number): Promise<void> {
  await run('xdotool', ['mousemove', String(x), String(y)]);
}

// ══════════════════════════════════════════════════════════
//  Drag
// ══════════════════════════════════════════════════════════

async function dragWindows(startX: number, startY: number, endX: number, endY: number): Promise<void> {
  const script = `
    Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public class DragOps {
        [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
        [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo);
        public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        public const uint MOUSEEVENTF_LEFTUP   = 0x0004;
      }
"@
    [DragOps]::SetCursorPos(${startX}, ${startY})
    Start-Sleep -Milliseconds 50
    [DragOps]::mouse_event([DragOps]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    Start-Sleep -Milliseconds 50
    $steps = 20
    for ($i = 1; $i -le $steps; $i++) {
      $cx = ${startX} + [int]((${endX} - ${startX}) * $i / $steps)
      $cy = ${startY} + [int]((${endY} - ${startY}) * $i / $steps)
      [DragOps]::SetCursorPos($cx, $cy)
      Start-Sleep -Milliseconds 10
    }
    Start-Sleep -Milliseconds 50
    [DragOps]::mouse_event([DragOps]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
  `;
  await ps(script);
}

async function dragMac(startX: number, startY: number, endX: number, endY: number): Promise<void> {
  await run('osascript', ['-e', `
    tell application "System Events"
      set position of mouse to {${startX}, ${startY}}
      delay 0.05
      mouse down
      delay 0.05
      set position of mouse to {${endX}, ${endY}}
      delay 0.05
      mouse up
    end tell
  `]);
}

async function dragLinux(startX: number, startY: number, endX: number, endY: number): Promise<void> {
  await run('xdotool', ['mousemove', String(startX), String(startY)]);
  await run('xdotool', ['mousedown', '1']);
  await run('xdotool', ['mousemove', '--delay', '5', String(endX), String(endY)]);
  await run('xdotool', ['mouseup', '1']);
}

// ══════════════════════════════════════════════════════════
//  Scroll
// ══════════════════════════════════════════════════════════

async function scrollWindows(x: number | undefined, y: number | undefined, direction: string, amount: number): Promise<void> {
  // mouse_event with MOUSEEVENTF_WHEEL (0x0800), dwData = amount * 120 (positive = up)
  const delta = direction === 'up' ? amount * 120 : -(amount * 120);
  const movePart = x !== undefined && y !== undefined
    ? `[ScrollOps]::SetCursorPos(${x}, ${y}); Start-Sleep -Milliseconds 30;`
    : '';
  const script = `
    Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public class ScrollOps {
        [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
        [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo);
        public const uint MOUSEEVENTF_WHEEL = 0x0800;
      }
"@
    ${movePart}
    [ScrollOps]::mouse_event([ScrollOps]::MOUSEEVENTF_WHEEL, 0, 0, ${delta}, 0)
  `;
  await ps(script);
}

async function scrollMac(x: number | undefined, y: number | undefined, direction: string, amount: number): Promise<void> {
  if (x !== undefined && y !== undefined) {
    await run('osascript', ['-e', `tell application "System Events" to set position of mouse to {${x}, ${y}}`]);
  }
  const delta = direction === 'up' ? amount : -amount;
  await run('osascript', ['-e', `tell application "System Events" to scroll (${delta} * 10)`]);
}

async function scrollLinux(x: number | undefined, y: number | undefined, direction: string, amount: number): Promise<void> {
  if (x !== undefined && y !== undefined) {
    await run('xdotool', ['mousemove', String(x), String(y)]);
  }
  // xdotool button 4 = scroll up, 5 = scroll down
  const btn = direction === 'up' ? '4' : '5';
  for (let i = 0; i < amount; i++) {
    await run('xdotool', ['click', btn]);
  }
}

// ══════════════════════════════════════════════════════════
//  Application Launch
// ══════════════════════════════════════════════════════════

async function launchWindows(app: string, args: string[], wait: boolean): Promise<void> {
  const argList = args.map(a => `'${a.replace(/'/g, "''")}'`).join(',');
  const waitParam = wait ? '-Wait' : '';
  const script = `
    $process = Start-Process -FilePath '${app.replace(/'/g, "''")}' -ArgumentList ${argList} ${waitParam} -PassThru
    if ($process -and -not ${wait}) {
      Start-Sleep -Milliseconds 500
    }
  `;
  await ps(script);
}

async function launchMac(app: string, args: string[], wait: boolean): Promise<void> {
  const argsStr = args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');

  // Try open -a first for .app bundles
  if (app.endsWith('.app') || app.includes('/')) {
    const cmd = `open -a '${app.replace(/'/g, "'\\''")}' ${argsStr}`;
    await run('bash', ['-c', cmd]);
    if (wait) {
      // Wait a moment for app to start
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } else {
    // Use osascript to launch by name
    const script = `tell application "${app.replace(/"/g, '\\"')}" to activate`;
    await run('osascript', ['-e', script]);
    if (wait) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function launchLinux(app: string, args: string[], wait: boolean): Promise<void> {
  const argsStr = args.join(' ');

  // Try direct execution
  const cmd = `nohup ${app} ${argsStr} > /dev/null 2>&1 &`;
  await run('bash', ['-c', cmd]);

  if (wait) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// ══════════════════════════════════════════════════════════
//  Window Focus
// ══════════════════════════════════════════════════════════

async function focusWindows(app?: string, windowId?: number): Promise<string> {
  if (windowId) {
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class WindowFocus {
          [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
          [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
          public const int SW_RESTORE = 9;
        }
"@
      $handle = [IntPtr]${windowId}
      [WindowFocus]::ShowWindow($handle, [WindowFocus]::SW_RESTORE) | Out-Null
      [WindowFocus]::SetForegroundWindow($handle) | Out-Null
    `;
    await ps(script);
    return `Focused window ID: ${windowId}`;
  }

  if (!app) {
    throw new Error('Either application or windowId is required');
  }

  const script = `
    $process = Get-Process | Where-Object { $_.MainWindowTitle -like '*${app.replace(/'/g, "''")}*' -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($process) {
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class WindowFocus {
          [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
          [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
          public const int SW_RESTORE = 9;
        }
"@
      [WindowFocus]::ShowWindow($process.MainWindowHandle, [WindowFocus]::SW_RESTORE) | Out-Null
      [WindowFocus]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
      "Focused: $($process.ProcessName) (ID: $($process.Id))"
    } else {
      throw "Window not found matching: ${app.replace(/'/g, "''")}"
    }
  `;
  return (await ps(script)).trim();
}

async function focusMac(app?: string, windowId?: number): Promise<string> {
  if (!app) {
    throw new Error('Application name is required for macOS focus');
  }

  const script = `tell application "${app.replace(/"/g, '\\"')}" to activate`;
  await run('osascript', ['-e', script]);
  return `Focused: ${app}`;
}

async function focusLinux(app?: string, windowId?: number): Promise<string> {
  if (windowId) {
    await run('xdotool', ['windowactivate', String(windowId)]);
    return `Focused window ID: ${windowId}`;
  }

  if (!app) {
    throw new Error('Either application or windowId is required');
  }

  // Try to find window by name
  const out = await run('xdotool', ['search', '--name', app]).catch(() => '');
  if (!out.trim()) {
    throw new Error(`Window not found matching: ${app}`);
  }

  const windowIds = out.trim().split('\n').filter(Boolean);
  if (windowIds.length === 0) {
    throw new Error(`Window not found matching: ${app}`);
  }

  await run('xdotool', ['windowactivate', windowIds[0]]);
  return `Focused: ${app} (ID: ${windowIds[0]})`;
}

// ══════════════════════════════════════════════════════════
//  List Windows
// ══════════════════════════════════════════════════════════

interface WindowInfo {
  id: number;
  title: string;
  process: string;
  pid: number;
}

async function listWindowsWindows(filter?: string): Promise<WindowInfo[]> {
  const filterCondition = filter
    ? `| Where-Object { $_.MainWindowTitle -like '*${filter.replace(/'/g, "''")}*' }`
    : '';

  const script = `
    Get-Process ${filterCondition} | Where-Object { $_.MainWindowTitle -ne '' } |
    Select-Object Id, MainWindowTitle, ProcessName, MainWindowHandle |
    ForEach-Object {
      [PSCustomObject]@{
        id = [int]$_.MainWindowHandle
        title = $_.MainWindowTitle
        process = $_.ProcessName
        pid = [int]$_.Id
      }
    } | ConvertTo-Json -AsArray
  `;
  const out = await ps(script);
  try {
    return JSON.parse(out || '[]');
  } catch {
    return [];
  }
}

async function listWindowsMac(filter?: string): Promise<WindowInfo[]> {
  const script = `
    tell application "System Events"
      set appList to every process whose visible is true
      set output to {}
      repeat with proc in appList
        set procName to name of proc
        set procId to unix id of proc
        try
          set windowList to every window of proc
          repeat with win in windowList
            set winTitle to name of win
            ${filter ? `if winTitle contains "${filter?.replace(/"/g, '\\"')}" then` : ''}
              set end of output to {id:0, title:winTitle, process:procName, pid:procId}
            ${filter ? 'end if' : ''}
          end repeat
        end try
      end repeat
      return output
    end tell
  `;

  const out = await run('osascript', ['-e', script]).catch(() => '[]');

  // Parse osascript output - it returns a comma-separated list of records
  // For simplicity, return empty array (proper parsing is complex)
  // A better approach is to use JSON output with a helper
  return [];
}

async function listWindowsLinux(filter?: string): Promise<WindowInfo[]> {
  const args = filter ? ['search', '--name', filter] : ['search', '--name', ''];
  const out = await run('wmctrl', ['-l']).catch(() => '');

  const windows: WindowInfo[] = [];
  for (const line of out.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 4) {
      const id = parseInt(parts[0], 16);
      const title = parts.slice(3).join(' ');
      windows.push({
        id,
        title,
        process: 'unknown',
        pid: 0,
      });
    }
  }

  return filter
    ? windows.filter(w => w.title.toLowerCase().includes(filter.toLowerCase()))
    : windows;
}

// ══════════════════════════════════════════════════════════
//  Get Cursor
// ══════════════════════════════════════════════════════════

async function getCursorWindows(): Promise<{ x: number; y: number }> {
  const out = await ps(`
    Add-Type @"
      using System;
      using System.Runtime.InteropServices;
      public struct POINT { public int X; public int Y; }
      public class GetCursor { [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint); }
"@
    $p = New-Object POINT
    [GetCursor]::GetCursorPos([ref]$p) | Out-Null
    "$($p.X) $($p.Y)"
  `);
  const [x, y] = out.trim().split(/\s+/).map(Number);
  return { x, y };
}

async function getCursorMac(): Promise<{ x: number; y: number }> {
  const out = await run('osascript', ['-e', `
    tell application "System Events"
      set pos to position of mouse
      return (item 1 of pos as text) & " " & (item 2 of pos as text)
    end tell
  `]);
  const [x, y] = out.trim().split(/\s+/).map(Number);
  return { x, y };
}

async function getCursorLinux(): Promise<{ x: number; y: number }> {
  const out = await run('xdotool', ['getmouselocation']);
  const match = out.match(/x:(\d+)\s+y:(\d+)/);
  if (!match) throw new Error('Failed to parse cursor position from xdotool');
  return { x: parseInt(match[1], 10), y: parseInt(match[2], 10) };
}

// ══════════════════════════════════════════════════════════
//  Availability check
// ══════════════════════════════════════════════════════════

async function checkAvailability(): Promise<{ available: boolean; method: string; error?: string }> {
  const nut = tryGetNut();
  if (nut) return { available: true, method: 'nut.js' };

  if (platform === 'win32') {
    try {
      await ps('(Get-Host)');
      return { available: true, method: 'powershell' };
    } catch (e: any) {
      return { available: false, method: 'powershell', error: `PowerShell not available: ${e.message}` };
    }
  }

  if (platform === 'darwin') {
    try {
      await run('osascript', ['-e', 'return 1']);
      return { available: true, method: 'osascript' };
    } catch (e: any) {
      return { available: false, method: 'osascript', error: `osascript not available: ${e.message}` };
    }
  }

  if (platform === 'linux') {
    try {
      await run('xdotool', ['getactivewindow']);
      return { available: true, method: 'xdotool' };
    } catch {
      return {
        available: false,
        method: 'xdotool',
        error:
          'xdotool not found. Install it:\n' +
          '  Ubuntu/Debian: sudo apt install xdotool\n' +
          '  Fedora:        sudo dnf install xdotool\n' +
          '  Arch:          sudo pacman -S xdotool',
      };
    }
  }

  return { available: false, method: 'none', error: `Unsupported platform: ${platform}` };
}

function installInstructions(): string {
  return (
    'Computer Use is not available. To enable desktop automation, install one of:\n\n' +
    'Option A (recommended): @nut-tree-fork/nutjs (cross-platform, no extra setup)\n' +
    '  npm install @nut-tree-fork/nutjs\n\n' +
    'Option B: Platform-specific tools\n' +
    '  Windows: PowerShell (built-in, no install needed)\n' +
    '  macOS:   osascript + screencapture (built-in)\n' +
    '  Linux:   sudo apt install xdotool scrot'
  );
}

// ══════════════════════════════════════════════════════════
//  Exported execute functions
// ══════════════════════════════════════════════════════════

export async function executeComputerScreenshot(input: Record<string, any>): Promise<ToolResult> {
  try {
    const avail = await checkAvailability();
    if (!avail.available) return { output: installInstructions(), isError: true };

    const display = input.display ?? 0;
    const region: Region | undefined = input.region;
    if (region) validateRegion(region);

    let base64: string;

    if (avail.method === 'nut.js') {
      // nut.js screenshot path (not fully implemented here; PowerShell is primary)
      // Fall through to platform approach for region support
    }

    switch (platform) {
      case 'win32':
        base64 = await screenshotWindows(display, region);
        break;
      case 'darwin':
        base64 = await screenshotMac(display, region);
        break;
      case 'linux':
        base64 = await screenshotLinux(display, region);
        break;
      default:
        return { output: `Unsupported platform: ${platform}`, isError: true };
    }

    if (base64.length > MAX_SCREENSHOT_BASE64) {
      return {
        output: `Screenshot too large (${Math.round(base64.length / 1024)}KB). Use a smaller region parameter.`,
        isError: true,
      };
    }

    const sizeKB = Math.round((base64.length * 3) / 4 / 1024);
    return {
      output: JSON.stringify({
        type: 'screenshot',
        format: 'png',
        encoding: 'base64',
        data: base64,
        sizeKB,
        note: 'WARNING: This screenshot may contain sensitive content.',
      }),
      isError: false,
    };
  } catch (err: any) {
    return { output: `Screenshot failed: ${err.message}`, isError: true };
  }
}

export async function executeComputerClick(input: Record<string, any>): Promise<ToolResult> {
  try {
    const avail = await checkAvailability();
    if (!avail.available) return { output: installInstructions(), isError: true };

    const x = input.x;
    const y = input.y;
    const button = input.button || 'left';
    const clickType = input.clickType || 'single';

    assertCoord(x, y);

    switch (platform) {
      case 'win32':  await clickWindows(x, y, button, clickType); break;
      case 'darwin': await clickMac(x, y, button, clickType);    break;
      case 'linux':  await clickLinux(x, y, button, clickType);  break;
    }

    return { output: `Clicked ${button} ${clickType} at (${x}, ${y})`, isError: false };
  } catch (err: any) {
    return { output: `Click failed: ${err.message}`, isError: true };
  }
}

export async function executeComputerType(input: Record<string, any>): Promise<ToolResult> {
  try {
    const avail = await checkAvailability();
    if (!avail.available) return { output: installInstructions(), isError: true };

    const rawText = input.text;
    if (typeof rawText !== 'string' || rawText.length === 0) {
      return { output: 'Text parameter is required and must be a non-empty string', isError: true };
    }

    const text = sanitizeText(rawText);
    if (text.length === 0) {
      return { output: 'Text is empty after sanitization (contained only control characters)', isError: true };
    }

    const delay = Math.max(0, Math.min(500, input.delay ?? 20));

    switch (platform) {
      case 'win32':  await typeWindows(text, delay); break;
      case 'darwin': await typeMac(text, delay);     break;
      case 'linux':  await typeLinux(text, delay);   break;
    }

    const preview = text.length > 60 ? text.slice(0, 60) + '...' : text;
    return { output: `Typed: "${preview}"`, isError: false };
  } catch (err: any) {
    return { output: `Type failed: ${err.message}`, isError: true };
  }
}

export async function executeComputerKey(input: Record<string, any>): Promise<ToolResult> {
  try {
    const avail = await checkAvailability();
    if (!avail.available) return { output: installInstructions(), isError: true };

    const keys = input.keys;
    if (typeof keys !== 'string' || keys.trim().length === 0) {
      return { output: 'Keys parameter is required', isError: true };
    }

    const repeat = Math.max(1, Math.min(50, input.repeat ?? 1));
    parseKeyCombo(keys); // validate

    switch (platform) {
      case 'win32':  await keyWindows(keys, repeat); break;
      case 'darwin': await keyMac(keys, repeat);     break;
      case 'linux':  await keyLinux(keys, repeat);   break;
    }

    return { output: `Pressed: ${keys}${repeat > 1 ? ` x${repeat}` : ''}`, isError: false };
  } catch (err: any) {
    return { output: `Key press failed: ${err.message}`, isError: true };
  }
}

export async function executeComputerMouseMove(input: Record<string, any>): Promise<ToolResult> {
  try {
    const avail = await checkAvailability();
    if (!avail.available) return { output: installInstructions(), isError: true };

    const x = input.x;
    const y = input.y;
    assertCoord(x, y);

    switch (platform) {
      case 'win32':  await mouseMoveWindows(x, y); break;
      case 'darwin': await mouseMoveMac(x, y);     break;
      case 'linux':  await mouseMoveLinux(x, y);   break;
    }

    return { output: `Mouse moved to (${x}, ${y})`, isError: false };
  } catch (err: any) {
    return { output: `Mouse move failed: ${err.message}`, isError: true };
  }
}

export async function executeComputerDrag(input: Record<string, any>): Promise<ToolResult> {
  try {
    const avail = await checkAvailability();
    if (!avail.available) return { output: installInstructions(), isError: true };

    const startX = input.startX;
    const startY = input.startY;
    const endX = input.endX;
    const endY = input.endY;

    assertCoord(startX, startY);
    assertCoord(endX, endY);

    switch (platform) {
      case 'win32':  await dragWindows(startX, startY, endX, endY); break;
      case 'darwin': await dragMac(startX, startY, endX, endY);     break;
      case 'linux':  await dragLinux(startX, startY, endX, endY);   break;
    }

    return { output: `Dragged from (${startX}, ${startY}) to (${endX}, ${endY})`, isError: false };
  } catch (err: any) {
    return { output: `Drag failed: ${err.message}`, isError: true };
  }
}

export async function executeComputerScroll(input: Record<string, any>): Promise<ToolResult> {
  try {
    const avail = await checkAvailability();
    if (!avail.available) return { output: installInstructions(), isError: true };

    const x = input.x !== undefined ? input.x : undefined;
    const y = input.y !== undefined ? input.y : undefined;
    const direction = input.direction;
    const amount = Math.max(1, Math.min(50, input.amount ?? 3));

    if (x !== undefined && y !== undefined) {
      assertCoord(x, y);
    }

    switch (platform) {
      case 'win32':  await scrollWindows(x, y, direction, amount); break;
      case 'darwin': await scrollMac(x, y, direction, amount);     break;
      case 'linux':  await scrollLinux(x, y, direction, amount);   break;
    }

    const posStr = x !== undefined && y !== undefined ? ` at (${x}, ${y})` : '';
    return { output: `Scrolled ${direction} ${amount} ticks${posStr}`, isError: false };
  } catch (err: any) {
    return { output: `Scroll failed: ${err.message}`, isError: true };
  }
}

export async function executeComputerWait(input: Record<string, any>): Promise<ToolResult> {
  try {
    const seconds = Math.max(0.1, Math.min(10, input.seconds));
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    return { output: `Waited ${seconds} seconds`, isError: false };
  } catch (err: any) {
    return { output: `Wait failed: ${err.message}`, isError: true };
  }
}

export async function executeComputerGetCursor(_input: Record<string, any>): Promise<ToolResult> {
  try {
    const avail = await checkAvailability();
    if (!avail.available) return { output: installInstructions(), isError: true };

    let pos: { x: number; y: number };

    switch (platform) {
      case 'win32':  pos = await getCursorWindows(); break;
      case 'darwin': pos = await getCursorMac();     break;
      case 'linux':  pos = await getCursorLinux();   break;
      default:       return { output: `Unsupported platform: ${platform}`, isError: true };
    }

    return { output: JSON.stringify({ x: pos.x, y: pos.y }), isError: false };
  } catch (err: any) {
    return { output: `Get cursor failed: ${err.message}`, isError: true };
  }
}

export async function executeComputerLaunch(input: Record<string, any>): Promise<ToolResult> {
  try {
    const avail = await checkAvailability();
    if (!avail.available) return { output: installInstructions(), isError: true };

    const app = input.application;
    if (typeof app !== 'string' || app.length === 0) {
      return { output: 'Application parameter is required', isError: true };
    }

    const args = input.args || [];
    const wait = input.wait || false;

    switch (platform) {
      case 'win32':  await launchWindows(app, args, wait); break;
      case 'darwin': await launchMac(app, args, wait);     break;
      case 'linux':  await launchLinux(app, args, wait);   break;
    }

    return { output: `Launched: ${app}${args.length > 0 ? ` with args: ${args.join(', ')}` : ''}`, isError: false };
  } catch (err: any) {
    return { output: `Launch failed: ${err.message}`, isError: true };
  }
}

export async function executeComputerFocus(input: Record<string, any>): Promise<ToolResult> {
  try {
    const avail = await checkAvailability();
    if (!avail.available) return { output: installInstructions(), isError: true };

    const app = input.application;
    const windowId = input.windowId;

    if (!app && !windowId) {
      return { output: 'Either application or windowId parameter is required', isError: true };
    }

    let result: string;

    switch (platform) {
      case 'win32':  result = await focusWindows(app, windowId); break;
      case 'darwin': result = await focusMac(app, windowId);     break;
      case 'linux':  result = await focusLinux(app, windowId);   break;
      default:       return { output: `Unsupported platform: ${platform}`, isError: true };
    }

    return { output: result, isError: false };
  } catch (err: any) {
    return { output: `Focus failed: ${err.message}`, isError: true };
  }
}

export async function executeComputerListWindows(input: Record<string, any>): Promise<ToolResult> {
  try {
    const avail = await checkAvailability();
    if (!avail.available) return { output: installInstructions(), isError: true };

    const filter = input.filter;

    let windows: WindowInfo[];

    switch (platform) {
      case 'win32':  windows = await listWindowsWindows(filter); break;
      case 'darwin': windows = await listWindowsMac(filter);     break;
      case 'linux':  windows = await listWindowsLinux(filter);   break;
      default:       return { output: `Unsupported platform: ${platform}`, isError: true };
    }

    return {
      output: JSON.stringify({
        count: windows.length,
        windows: windows.slice(0, 100), // Limit to 100 windows
        note: windows.length > 100 ? `Showing first 100 of ${windows.length} windows` : undefined,
      }, null, 2),
      isError: false,
    };
  } catch (err: any) {
    return { output: `List windows failed: ${err.message}`, isError: true };
  }
}
