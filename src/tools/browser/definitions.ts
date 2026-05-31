import { ToolDefinition } from '../registry';

// ── Navigation & Reading ────────────────────────────────────────────

export const browserNavigateTool: ToolDefinition = {
  name: 'browser_navigate',
  description: 'Navigate to a URL in the browser. Handles redirects transparently and returns the final URL, page title, and a text summary.',
  input_schema: {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'The URL to navigate to' },
      waitUntil: {
        type: 'string',
        enum: ['load', 'domcontentloaded', 'networkidle'],
        description: 'Wait condition (default: networkidle)',
      },
      tabId: { type: 'number', description: 'Tab ID to navigate (defaults to active tab)' },
    },
    required: ['url'],
  },
  permission: 'auto',
};

export const browserReadTool: ToolDefinition = {
  name: 'browser_read',
  description: 'Read the text content of the current page. Prioritizes article/main content areas. Returns a message if the page has no text content (e.g. SPA or media-only page).',
  input_schema: {
    type: 'object' as const,
    properties: {
      selector: { type: 'string', description: 'CSS selector (optional, defaults to full page)' },
      maxChars: { type: 'number', description: 'Maximum characters (default: 50000)', minimum: 100 },
      tabId: { type: 'number', description: 'Tab ID to read from (defaults to active tab)' },
    },
    required: [],
  },
  permission: 'auto',
};

export const browserFindTool: ToolDefinition = {
  name: 'browser_find',
  description: 'Find elements on the page by CSS selector, text content, or aria-label. Returns matching element text and reference IDs for use in click/type/form_input.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Natural language description or CSS selector' },
      tabId: { type: 'number', description: 'Tab ID to search in (defaults to active tab)' },
    },
    required: ['query'],
  },
  permission: 'auto',
};

// ── Interaction ─────────────────────────────────────────────────────

export const browserClickTool: ToolDefinition = {
  name: 'browser_click',
  description: 'Click an element on the page by CSS selector or element reference. Automatically waits for navigation if the click triggers a page load.',
  input_schema: {
    type: 'object' as const,
    properties: {
      selector: { type: 'string', description: 'CSS selector or element text' },
      ref: { type: 'string', description: 'Element reference ID (from browser_find)' },
      tabId: { type: 'number', description: 'Tab ID to click in (defaults to active tab)' },
    },
    required: [],
  },
  permission: 'ask',
};

export const browserTypeTool: ToolDefinition = {
  name: 'browser_type',
  description: 'Type text into an input field.',
  input_schema: {
    type: 'object' as const,
    properties: {
      selector: { type: 'string', description: 'CSS selector' },
      ref: { type: 'string', description: 'Element reference ID' },
      text: { type: 'string', description: 'Text to type' },
      tabId: { type: 'number', description: 'Tab ID (defaults to active tab)' },
    },
    required: ['text'],
  },
  permission: 'ask',
};

export const browserHoverTool: ToolDefinition = {
  name: 'browser_hover',
  description: 'Hover over an element at the specified coordinates or by selector. Useful for revealing tooltips, dropdown menus, or triggering hover states.',
  input_schema: {
    type: 'object' as const,
    properties: {
      selector: { type: 'string', description: 'CSS selector of the element to hover' },
      ref: { type: 'string', description: 'Element reference ID (from browser_find)' },
      coordinate: {
        type: 'array',
        items: { type: 'number' },
        minItems: 2,
        maxItems: 2,
        description: '[x, y] viewport coordinates to hover at',
      },
      tabId: { type: 'number', description: 'Tab ID (defaults to active tab)' },
    },
    required: [],
  },
  permission: 'auto',
};

export const browserScrollTool: ToolDefinition = {
  name: 'browser_scroll',
  description: 'Scroll the page or a specific element up/down/left/right.',
  input_schema: {
    type: 'object' as const,
    properties: {
      direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Scroll direction' },
      amount: { type: 'number', description: 'Number of scroll ticks (default: 3, min: 1)', minimum: 1 },
      selector: { type: 'string', description: 'CSS selector of element to scroll (optional)' },
      coordinate: {
        type: 'array',
        items: { type: 'number' },
        minItems: 2,
        maxItems: 2,
        description: '[x, y] coordinates to scroll at (optional)',
      },
      tabId: { type: 'number', description: 'Tab ID (defaults to active tab)' },
    },
    required: ['direction'],
  },
  permission: 'auto',
};

export const browserDragTool: ToolDefinition = {
  name: 'browser_drag',
  description: 'Drag from one coordinate to another. Useful for drag-and-drop operations, sliders, and rearranging elements.',
  input_schema: {
    type: 'object' as const,
    properties: {
      startCoordinate: {
        type: 'array',
        items: { type: 'number' },
        minItems: 2,
        maxItems: 2,
        description: '[x, y] starting coordinates',
      },
      endCoordinate: {
        type: 'array',
        items: { type: 'number' },
        minItems: 2,
        maxItems: 2,
        description: '[x, y] ending coordinates',
      },
      startSelector: { type: 'string', description: 'CSS selector of the drag source element' },
      endSelector: { type: 'string', description: 'CSS selector of the drag target element' },
      tabId: { type: 'number', description: 'Tab ID (defaults to active tab)' },
    },
    required: [],
  },
  permission: 'ask',
};

// ── Screenshot ──────────────────────────────────────────────────────

export const browserScreenshotTool: ToolDefinition = {
  name: 'browser_screenshot',
  description: 'Take a screenshot of the current page or a specific element. Returns base64-encoded image.',
  input_schema: {
    type: 'object' as const,
    properties: {
      selector: { type: 'string', description: 'CSS selector (optional, defaults to full page)' },
      fullPage: { type: 'boolean', description: 'Capture full scrollable page (default: false)' },
      outputPath: { type: 'string', description: 'File path to save the screenshot (optional)' },
      tabId: { type: 'number', description: 'Tab ID (defaults to active tab)' },
    },
    required: [],
  },
  permission: 'auto',
};

// ── JavaScript ──────────────────────────────────────────────────────

export const browserExecuteJsTool: ToolDefinition = {
  name: 'browser_execute_js',
  description: 'Execute JavaScript code in the current page context. Returns the result.',
  input_schema: {
    type: 'object' as const,
    properties: {
      code: { type: 'string', description: 'JavaScript code to execute' },
      tabId: { type: 'number', description: 'Tab ID (defaults to active tab)' },
    },
    required: ['code'],
  },
  permission: 'ask',
};

// ── Forms ───────────────────────────────────────────────────────────

export const browserFormInputTool: ToolDefinition = {
  name: 'browser_form_input',
  description: 'Fill form fields by CSS selector or element reference with a value. Supports text inputs, textareas, select dropdowns, checkboxes, and radio buttons. Rejects disabled/readonly inputs unless force is set.',
  input_schema: {
    type: 'object' as const,
    properties: {
      selector: { type: 'string', description: 'CSS selector of the form element' },
      ref: { type: 'string', description: 'Element reference ID (from browser_find)' },
      value: { type: 'string', description: 'Value to set (for selects: match by value attribute or visible text)' },
      force: { type: 'boolean', description: 'Force write even on readonly inputs (default: false)' },
      tabId: { type: 'number', description: 'Tab ID (defaults to active tab)' },
    },
    required: ['value'],
  },
  permission: 'ask',
};

export const browserFileUploadTool: ToolDefinition = {
  name: 'browser_file_upload',
  description: 'Upload files to a file input element. Validates that all files exist before upload. Do not click file inputs directly; use this tool instead.',
  input_schema: {
    type: 'object' as const,
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Absolute file paths to upload',
      },
      selector: { type: 'string', description: 'CSS selector of the file input element' },
      ref: { type: 'string', description: 'Element reference ID (from browser_find)' },
      tabId: { type: 'number', description: 'Tab ID (defaults to active tab)' },
    },
    required: ['paths'],
  },
  permission: 'ask',
};

// ── Tabs ────────────────────────────────────────────────────────────

export const browserTabsListTool: ToolDefinition = {
  name: 'browser_tabs_list',
  description: 'List all open browser tabs with their id, url, and title.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
  permission: 'auto',
};

export const browserTabsCreateTool: ToolDefinition = {
  name: 'browser_tabs_create',
  description: 'Open a new browser tab, optionally navigating to a URL.',
  input_schema: {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'URL to open in the new tab (optional)' },
    },
    required: [],
  },
  permission: 'auto',
};

export const browserTabsCloseTool: ToolDefinition = {
  name: 'browser_tabs_close',
  description: 'Close a browser tab by its ID.',
  input_schema: {
    type: 'object' as const,
    properties: {
      tabId: { type: 'number', description: 'ID of the tab to close' },
    },
    required: ['tabId'],
  },
  permission: 'ask',
};

export const browserTabsSwitchTool: ToolDefinition = {
  name: 'browser_tabs_switch',
  description: 'Switch to a different browser tab, making it the active tab.',
  input_schema: {
    type: 'object' as const,
    properties: {
      tabId: { type: 'number', description: 'ID of the tab to switch to' },
    },
    required: ['tabId'],
  },
  permission: 'auto',
};

// ── GIF Recording ───────────────────────────────────────────────────

export const browserGifStartTool: ToolDefinition = {
  name: 'browser_gif_start',
  description: 'Start recording browser actions for GIF export. Captures screenshots as frames at regular intervals.',
  input_schema: {
    type: 'object' as const,
    properties: {
      intervalMs: { type: 'number', description: 'Screenshot interval in milliseconds (default: 500, min: 100)', minimum: 100 },
      tabId: { type: 'number', description: 'Tab ID to record (defaults to active tab)' },
    },
    required: [],
  },
  permission: 'auto',
};

export const browserGifStopTool: ToolDefinition = {
  name: 'browser_gif_stop',
  description: 'Stop GIF recording and return frame count and metadata.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
  permission: 'auto',
};

export const browserGifExportTool: ToolDefinition = {
  name: 'browser_gif_export',
  description: 'Export the recorded browser actions as an animated GIF file.',
  input_schema: {
    type: 'object' as const,
    properties: {
      outputPath: { type: 'string', description: 'File path for the output GIF (required)' },
      quality: { type: 'number', description: 'GIF quality 1-30, lower = better (default: 10)', minimum: 1, maximum: 30 },
      showClickIndicators: { type: 'boolean', description: 'Show click indicators on frames (default: true)' },
    },
    required: ['outputPath'],
  },
  permission: 'ask',
};

// ── Network & Console ───────────────────────────────────────────────

export const browserNetworkTool: ToolDefinition = {
  name: 'browser_network',
  description: 'Monitor or read network requests from the page. Useful for debugging API calls.',
  input_schema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['start', 'stop', 'read', 'clear'], description: 'Action type' },
      urlPattern: { type: 'string', description: 'URL filter pattern' },
      tabId: { type: 'number', description: 'Tab ID (defaults to active tab)' },
    },
    required: ['action'],
  },
  permission: 'auto',
};

export const browserConsoleTool: ToolDefinition = {
  name: 'browser_console',
  description: 'Read browser console output. Useful for debugging JavaScript errors.',
  input_schema: {
    type: 'object' as const,
    properties: {
      level: { type: 'string', enum: ['all', 'error', 'warn', 'info', 'debug'], description: 'Log level filter' },
      limit: { type: 'number', description: 'Maximum entries to return (default: 50)', minimum: 1 },
      pattern: { type: 'string', description: 'Regex pattern to filter messages' },
      clear: { type: 'boolean', description: 'Clear console messages after reading (default: false)' },
      tabId: { type: 'number', description: 'Tab ID (defaults to active tab)' },
    },
    required: [],
  },
  permission: 'auto',
};

export const browserConsoleReadTool: ToolDefinition = {
  name: 'browser_console_read',
  description: 'Read browser console messages with pattern filtering. Returns console.log, console.error, console.warn, etc.',
  input_schema: {
    type: 'object' as const,
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to filter messages (e.g., "error|warning")' },
      limit: { type: 'number', description: 'Maximum messages to return (default: 100)', minimum: 1 },
      onlyErrors: { type: 'boolean', description: 'Only return error/exception messages (default: false)' },
      clear: { type: 'boolean', description: 'Clear messages after reading (default: false)' },
      tabId: { type: 'number', description: 'Tab ID (defaults to active tab)' },
    },
    required: [],
  },
  permission: 'auto',
};

export const browserNetworkReadTool: ToolDefinition = {
  name: 'browser_network_read',
  description: 'Read HTTP network requests (XHR, Fetch, documents, images, etc.) with optional URL filtering.',
  input_schema: {
    type: 'object' as const,
    properties: {
      urlPattern: { type: 'string', description: 'Only return requests whose URL contains this string' },
      limit: { type: 'number', description: 'Maximum requests to return (default: 100)', minimum: 1 },
      clear: { type: 'boolean', description: 'Clear requests after reading (default: false)' },
      filter: { type: 'string', enum: ['all', 'failed'], description: 'Filter: "all" shows all, "failed" shows only errors (default: all)' },
      tabId: { type: 'number', description: 'Tab ID (defaults to active tab)' },
    },
    required: [],
  },
  permission: 'auto',
};

// ── Browser Selection & Viewport ────────────────────────────────────

export const browserSelectBrowserTool: ToolDefinition = {
  name: 'browser_select_browser',
  description: 'Select or configure which browser instance to use. Allows switching between browser profiles or restarting with different settings.',
  input_schema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: ['list', 'restart', 'use'], description: 'Action: list profiles, restart browser, or use a specific profile' },
      profile: { type: 'string', description: 'Browser profile name (for "use" action)' },
      headless: { type: 'boolean', description: 'Whether to run headless (for "restart" action, default: true)' },
    },
    required: ['action'],
  },
  permission: 'ask',
};

export const browserResizeTool: ToolDefinition = {
  name: 'browser_resize',
  description: 'Resize the browser viewport to test responsive layouts. Presets: mobile (375x812), tablet (768x1024), desktop (1280x800). Also supports custom dimensions.',
  input_schema: {
    type: 'object' as const,
    properties: {
      width: { type: 'number', description: 'Target width in pixels (min: 100, max: 7680)', minimum: 100, maximum: 7680 },
      height: { type: 'number', description: 'Target height in pixels (min: 100, max: 4320)', minimum: 100, maximum: 4320 },
      preset: { type: 'string', enum: ['mobile', 'tablet', 'desktop'], description: 'Device preset (overrides width/height)' },
      tabId: { type: 'number', description: 'Tab ID (defaults to active tab)' },
    },
    required: [],
  },
  permission: 'auto',
};

// ── Aggregate array of all browser tools ────────────────────────────

export const allBrowserTools: ToolDefinition[] = [
  browserNavigateTool,
  browserReadTool,
  browserFindTool,
  browserClickTool,
  browserTypeTool,
  browserHoverTool,
  browserScrollTool,
  browserDragTool,
  browserScreenshotTool,
  browserExecuteJsTool,
  browserFormInputTool,
  browserFileUploadTool,
  browserTabsListTool,
  browserTabsCreateTool,
  browserTabsCloseTool,
  browserTabsSwitchTool,
  browserGifStartTool,
  browserGifStopTool,
  browserGifExportTool,
  browserNetworkTool,
  browserConsoleTool,
  browserConsoleReadTool,
  browserNetworkReadTool,
  browserSelectBrowserTool,
  browserResizeTool,
];
