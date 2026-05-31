import { ToolDefinition } from '../registry';

// ── Screenshot ────────────────────────────────────────────────────────

export const computerScreenshotTool: ToolDefinition = {
  name: 'computer_screenshot',
  description:
    'Take a screenshot of the desktop or a specific region. Returns a base64-encoded PNG image. ' +
    'WARNING: Screenshots may capture sensitive content (passwords, personal data). ' +
    'Use the region parameter to limit capture area when possible.',
  input_schema: {
    type: 'object' as const,
    properties: {
      region: {
        type: 'object',
        properties: {
          x0: { type: 'number', description: 'Left edge (pixels)' },
          y0: { type: 'number', description: 'Top edge (pixels)' },
          x1: { type: 'number', description: 'Right edge (pixels)' },
          y1: { type: 'number', description: 'Bottom edge (pixels)' },
        },
        description: 'Region to capture (optional). If omitted, captures full screen.',
      },
      display: {
        type: 'number',
        description: 'Monitor index to capture (default: 0, the primary monitor)',
        minimum: 0,
      },
    },
    required: [],
  },
  permission: 'auto',
};

// ── Click ─────────────────────────────────────────────────────────────

export const computerClickTool: ToolDefinition = {
  name: 'computer_click',
  description:
    'Click at specific screen coordinates. Supports left, right, and middle mouse buttons, ' +
    'and single, double, or triple clicks.',
  input_schema: {
    type: 'object' as const,
    properties: {
      x: { type: 'number', description: 'Horizontal coordinate (pixels from left edge)' },
      y: { type: 'number', description: 'Vertical coordinate (pixels from top edge)' },
      button: {
        type: 'string',
        enum: ['left', 'right', 'middle'],
        description: 'Mouse button (default: left)',
      },
      clickType: {
        type: 'string',
        enum: ['single', 'double', 'triple'],
        description: 'Click type (default: single)',
      },
    },
    required: ['x', 'y'],
  },
  permission: 'ask',
};

// ── Type ──────────────────────────────────────────────────────────────

export const computerTypeTool: ToolDefinition = {
  name: 'computer_type',
  description:
    'Type text at the current cursor position using keyboard simulation. ' +
    'The text is sanitized before typing. For key combinations (ctrl+c, alt+tab), use computer_key instead.',
  input_schema: {
    type: 'object' as const,
    properties: {
      text: { type: 'string', description: 'Text to type' },
      delay: {
        type: 'number',
        description: 'Delay in milliseconds between each keystroke (default: 20, min: 0, max: 500)',
        minimum: 0,
        maximum: 500,
      },
    },
    required: ['text'],
  },
  permission: 'ask',
};

// ── Key ───────────────────────────────────────────────────────────────

export const computerKeyTool: ToolDefinition = {
  name: 'computer_key',
  description:
    'Press keyboard keys or key combinations. Use "+" for combos: "ctrl+c", "alt+tab", "ctrl+shift+s". ' +
    'Special keys: enter, tab, escape, backspace, delete, space, up, down, left, right, ' +
    'home, end, pageup, pagedown, f1-f12, printscreen.',
  input_schema: {
    type: 'object' as const,
    properties: {
      keys: {
        type: 'string',
        description:
          'Key or combo to press. Examples: "enter", "ctrl+c", "alt+tab", "ctrl+shift+s"',
      },
      repeat: {
        type: 'number',
        description: 'Number of times to repeat (default: 1, max: 50)',
        minimum: 1,
        maximum: 50,
      },
    },
    required: ['keys'],
  },
  permission: 'ask',
};

// ── Mouse Move ────────────────────────────────────────────────────────

export const computerMouseMoveTool: ToolDefinition = {
  name: 'computer_mouse_move',
  description: 'Move the mouse cursor to specific screen coordinates without clicking.',
  input_schema: {
    type: 'object' as const,
    properties: {
      x: { type: 'number', description: 'Horizontal coordinate (pixels)' },
      y: { type: 'number', description: 'Vertical coordinate (pixels)' },
    },
    required: ['x', 'y'],
  },
  permission: 'auto',
};

// ── Drag ──────────────────────────────────────────────────────────────

export const computerDragTool: ToolDefinition = {
  name: 'computer_drag',
  description: 'Click and drag from one screen position to another.',
  input_schema: {
    type: 'object' as const,
    properties: {
      startX: { type: 'number', description: 'Starting X coordinate' },
      startY: { type: 'number', description: 'Starting Y coordinate' },
      endX: { type: 'number', description: 'Ending X coordinate' },
      endY: { type: 'number', description: 'Ending Y coordinate' },
    },
    required: ['startX', 'startY', 'endX', 'endY'],
  },
  permission: 'ask',
};

// ── Scroll ────────────────────────────────────────────────────────────

export const computerScrollTool: ToolDefinition = {
  name: 'computer_scroll',
  description: 'Scroll at a specific screen position (or current cursor if no coordinates given).',
  input_schema: {
    type: 'object' as const,
    properties: {
      x: { type: 'number', description: 'Horizontal coordinate (pixels). Optional.' },
      y: { type: 'number', description: 'Vertical coordinate (pixels). Optional.' },
      direction: {
        type: 'string',
        enum: ['up', 'down'],
        description: 'Scroll direction',
      },
      amount: {
        type: 'number',
        description: 'Number of scroll ticks (default: 3, min: 1, max: 50)',
        minimum: 1,
        maximum: 50,
      },
    },
    required: ['direction'],
  },
  permission: 'auto',
};

// ── Wait ──────────────────────────────────────────────────────────────

export const computerWaitTool: ToolDefinition = {
  name: 'computer_wait',
  description: 'Wait for a specified number of seconds. Useful for waiting for animations or UI transitions.',
  input_schema: {
    type: 'object' as const,
    properties: {
      seconds: {
        type: 'number',
        description: 'Seconds to wait (max 10)',
        minimum: 0.1,
        maximum: 10,
      },
    },
    required: ['seconds'],
  },
  permission: 'auto',
};

// ── Get Cursor ────────────────────────────────────────────────────────

export const computerGetCursorTool: ToolDefinition = {
  name: 'computer_get_cursor',
  description: 'Get the current mouse cursor position. Returns x and y coordinates.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
  permission: 'auto',
};

// ── Aggregate array of all computer tools ─────────────────────────────

export const allComputerTools: ToolDefinition[] = [
  computerScreenshotTool,
  computerClickTool,
  computerTypeTool,
  computerKeyTool,
  computerMouseMoveTool,
  computerDragTool,
  computerScrollTool,
  computerWaitTool,
  computerGetCursorTool,
];
