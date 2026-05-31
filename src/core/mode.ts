// ── Agent Mode Manager ──────────────────────────────────────────────────────
//
// Manages the three operational modes (plan, agent, yolo) and provides
// fine-grained per-tool permission resolution with input awareness,
// MCP read-only detection, mode inheritance, and validation.

export type AgentMode = 'plan' | 'agent' | 'yolo';
export type ToolPermission = 'auto' | 'ask' | 'denied';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Detailed permission entry for a tool */
export interface ToolPermissionDetail {
  permission: ToolPermission;
  risk: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  description: string;
}

/** Valid mode transition */
type ModeTransition = { from: AgentMode; to: AgentMode };

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

/** All valid agent modes in security order (least to most permissive) */
const MODE_SECURITY_ORDER: AgentMode[] = ['plan', 'agent', 'yolo'];

/** MCP tool name patterns that indicate read-only operations */
const MCP_READ_ONLY_PATTERNS = [
  /read/i, /list/i, /get/i, /search/i, /find/i, /query/i,
  /status/i, /log/i, /info/i, /describe/i, /fetch/i,
  /view/i, /show/i, /check/i, /verify/i, /inspect/i,
];

/** Write-like patterns for MCP tool names (used to classify unknown tools) */
const MCP_WRITE_PATTERNS = [
  /write/i, /create/i, /update/i, /delete/i, /remove/i, /drop/i,
  /insert/i, /modify/i, /set/i, /post/i, /put/i, /patch/i,
  /push/i, /merge/i, /execute/i, /run/i, /send/i, /move/i,
];

// ═══════════════════════════════════════════════════════════════════════════════
// Permission Matrix (Base Layer)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Complete base permission matrix: 36 tools x 3 modes.
 *
 * These values are the "ground truth" for ModeManager.getToolPermission
 * BEFORE any input-aware overrides or ToolRegistry layering.
 *
 * Inheritance is applied at construction time:
 *   yolo inherits from agent inherits from plan
 */
function buildPermissionMatrix(): Record<AgentMode, Record<string, ToolPermission>> {
  // ── Plan mode: read-only, no mutations ──
  const plan: Record<string, ToolPermission> = {
    // File tools
    file_read:           'auto',
    file_write:          'denied',
    file_edit:           'denied',

    // Shell
    shell_exec:          'denied',

    // Search
    grep_search:         'auto',
    glob_match:          'auto',

    // Browser (read)
    browser_navigate:    'auto',
    browser_read:        'auto',
    browser_find:        'auto',
    browser_screenshot:  'auto',
    browser_network:     'auto',
    browser_console:     'auto',

    // Browser (interactive)
    browser_click:       'denied',
    browser_type:        'denied',
    browser_execute_js:  'denied',

    // Web
    web_search:          'auto',
    web_fetch:           'auto',

    // Git (read)
    git_status:          'auto',
    git_diff:            'auto',
    git_log:             'auto',
    git_blame:           'auto',

    // Git (write) - plan denies writes
    git_branch:          'auto',
    git_commit:          'denied',
    git_checkout:        'auto',
    git_stash:           'auto',
    git_pr:              'denied',
    git_issue:           'denied',
    git_release:         'denied',

    // Task
    task_create:         'auto',
    task_update:         'auto',
    task_list:           'auto',
    task_get:            'auto',

    // Notebook
    notebook_read:       'auto',
    notebook_edit:       'denied',

    // Image / Upload
    image_read:          'auto',
    file_upload:         'denied',
  };

  // ── Agent mode: write ops require approval ──
  // Inherits from plan, then overrides specific tools
  const agent: Record<string, ToolPermission> = {
    ...plan,

    // File tools: writes require approval
    file_write:          'ask',
    file_edit:           'ask',

    // Shell: requires approval
    shell_exec:          'ask',

    // Browser interactive: requires approval
    browser_click:       'ask',
    browser_type:        'ask',
    browser_execute_js:  'ask',

    // Git write: requires approval
    git_commit:          'ask',
    git_pr:              'ask',
    git_issue:           'ask',
    git_release:         'ask',

    // Notebook edit: requires approval
    notebook_edit:       'ask',

    // Upload: requires approval
    file_upload:         'ask',
  };

  // ── YOLO mode: everything is auto ──
  // Inherits from agent, then overrides everything to auto
  const yolo: Record<string, ToolPermission> = {};
  for (const key of Object.keys(agent)) {
    yolo[key] = 'auto';
  }

  return { plan, agent, yolo };
}

const PERMISSION_MATRIX = buildPermissionMatrix();

// ═══════════════════════════════════════════════════════════════════════════════
// ModeManager
// ═══════════════════════════════════════════════════════════════════════════════

export class ModeManager {
  private mode: AgentMode;
  private modeHistory: AgentMode[] = [];

  constructor(mode: AgentMode) {
    if (!MODE_SECURITY_ORDER.includes(mode)) {
      throw new Error(`Invalid mode: "${mode}". Must be one of: ${MODE_SECURITY_ORDER.join(', ')}`);
    }
    this.mode = mode;
    this.modeHistory.push(mode);
  }

  // ── Mode access ──────────────────────────────────────────────────────

  getMode(): AgentMode {
    return this.mode;
  }

  setMode(mode: AgentMode): void {
    if (!MODE_SECURITY_ORDER.includes(mode)) {
      throw new Error(`Invalid mode: "${mode}". Must be one of: ${MODE_SECURITY_ORDER.join(', ')}`);
    }
    this.mode = mode;
    this.modeHistory.push(mode);
  }

  /**
   * Switch mode with validation.
   * Returns true if the switch was successful, false if rejected.
   */
  switchMode(to: AgentMode): { success: boolean; reason?: string } {
    if (!MODE_SECURITY_ORDER.includes(to)) {
      return { success: false, reason: `Invalid mode: "${to}"` };
    }

    const fromSecurity = MODE_SECURITY_ORDER.indexOf(this.mode);
    const toSecurity = MODE_SECURITY_ORDER.indexOf(to);

    // Warn on security downgrade (plan -> agent -> yolo)
    if (toSecurity > fromSecurity) {
      const downgradeSteps = toSecurity - fromSecurity;
      if (downgradeSteps > 1) {
        // Skipping a level (e.g., plan -> yolo)
        const oldMode = this.mode;
        this.mode = to;
        this.modeHistory.push(to);
        return {
          success: true,
          reason: `Warning: skipping security level from "${oldMode}" to "${to}" (skipped ${downgradeSteps - 1} level(s))`,
        };
      }
    }

    this.mode = to;
    this.modeHistory.push(to);
    return { success: true };
  }

  /**
   * Get the full mode change history for this session.
   */
  getModeHistory(): AgentMode[] {
    return [...this.modeHistory];
  }

  // ── Permission resolution ────────────────────────────────────────────

  /**
   * Get the base permission for a tool in the current mode.
   * This uses the static permission matrix without input awareness.
   */
  getBasePermission(toolName: string): ToolPermission {
    return PERMISSION_MATRIX[this.mode][toolName] || 'ask';
  }

  /**
   * Get the permission for a tool, with input-aware overrides.
   *
   * Input awareness allows the same tool to have different permissions
   * based on the specific operation. For example:
   * - git_branch: list/read operations = auto, create/delete = write
   * - git_stash: list/show = auto, push/pop/drop = write
   * - git_checkout: branch switch = auto, file restore = write
   */
  getToolPermission(toolName: string, input?: Record<string, any>): ToolPermission {
    // ── Input-aware overrides (applied before base matrix lookup) ──
    if (input) {
      // git_branch: create/delete/switch = write, list/current = read
      if (toolName === 'git_branch') {
        const action = input.action;
        if (action === 'create' || action === 'delete' || action === 'switch') {
          return this.mode === 'yolo' ? 'auto' : 'ask';
        }
        return 'auto';
      }

      // git_checkout: file restore = write, branch switch = read
      if (toolName === 'git_checkout') {
        if (input.file) {
          return this.mode === 'yolo' ? 'auto' : 'ask';
        }
        return 'auto';
      }

      // git_stash: push/pop/drop = write, list/show = read
      if (toolName === 'git_stash') {
        const action = input.action;
        if (action === 'push' || action === 'pop' || action === 'drop') {
          return this.mode === 'yolo' ? 'auto' : 'ask';
        }
        return 'auto';
      }
    }

    // ── Base matrix lookup ──
    return PERMISSION_MATRIX[this.mode][toolName] || 'ask';
  }

  // ── MCP detection ────────────────────────────────────────────────────

  /**
   * Determine if an MCP tool is read-only based on its name.
   * MCP tools follow the naming convention: mcp__<server>__<tool_name>
   */
  isMcpReadOnlyTool(toolName: string): boolean {
    const parts = toolName.split('__');
    const realName = parts.length >= 3 ? parts.slice(2).join('__') : toolName;
    return MCP_READ_ONLY_PATTERNS.some((p) => p.test(realName));
  }

  /**
   * Determine if an MCP tool is a write operation based on its name.
   */
  isMcpWriteTool(toolName: string): boolean {
    const parts = toolName.split('__');
    const realName = parts.length >= 3 ? parts.slice(2).join('__') : toolName;
    return MCP_WRITE_PATTERNS.some((p) => p.test(realName));
  }

  /**
   * Get the permission for an MCP tool, considering its read/write classification
   * and the current mode.
   */
  getMcpToolPermission(toolName: string): ToolPermission {
    if (this.mode === 'plan') {
      return this.isMcpReadOnlyTool(toolName) ? 'auto' : 'denied';
    }
    if (this.mode === 'agent') {
      return this.isMcpReadOnlyTool(toolName) ? 'auto' : 'ask';
    }
    return 'auto'; // yolo
  }

  // ── Detailed permission info ─────────────────────────────────────────

  /**
   * Get detailed permission information for a tool including risk level
   * and category.
   */
  getToolPermissionDetail(toolName: string): ToolPermissionDetail {
    const permission = this.getBasePermission(toolName);
    const { risk, category } = getToolRiskAndCategory(toolName);

    return {
      permission,
      risk,
      category,
      description: getToolDescription(toolName, this.mode),
    };
  }

  /**
   * Get all tools with their current permissions.
   */
  getAllToolPermissions(): Record<string, ToolPermissionDetail> {
    const result: Record<string, ToolPermissionDetail> = {};
    const allTools = Object.keys(PERMISSION_MATRIX[this.mode]);
    for (const tool of allTools) {
      result[tool] = this.getToolPermissionDetail(tool);
    }
    return result;
  }

  // ── Mode info ────────────────────────────────────────────────────────

  getModeDescription(): string {
    const descriptions: Record<AgentMode, string> = {
      plan: 'Plan mode - read-only: can read files and search, cannot modify anything',
      agent: 'Agent mode - approval: write operations require user confirmation',
      yolo: 'YOLO mode - autonomous: all operations execute automatically',
    };
    return descriptions[this.mode];
  }

  /**
   * Get the security level of the current mode (0=plan, 1=agent, 2=yolo).
   */
  getSecurityLevel(): number {
    return MODE_SECURITY_ORDER.indexOf(this.mode);
  }

  /**
   * Check if the current mode is at least as permissive as the given mode.
   */
  isAtLeastAsPermissive(requiredMode: AgentMode): boolean {
    return MODE_SECURITY_ORDER.indexOf(this.mode) >= MODE_SECURITY_ORDER.indexOf(requiredMode);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════════════════════════

function getToolRiskAndCategory(toolName: string): {
  risk: 'low' | 'medium' | 'high' | 'critical';
  category: string;
} {
  const map: Record<string, { risk: 'low' | 'medium' | 'high' | 'critical'; category: string }> = {
    // File
    file_read:           { risk: 'low',      category: 'file' },
    file_write:          { risk: 'high',     category: 'file' },
    file_edit:           { risk: 'high',     category: 'file' },
    // Shell
    shell_exec:          { risk: 'critical', category: 'shell' },
    // Search
    grep_search:         { risk: 'low',      category: 'search' },
    glob_match:          { risk: 'low',      category: 'search' },
    // Browser read
    browser_navigate:    { risk: 'low',      category: 'browser' },
    browser_read:        { risk: 'low',      category: 'browser' },
    browser_find:        { risk: 'low',      category: 'browser' },
    browser_screenshot:  { risk: 'low',      category: 'browser' },
    browser_network:     { risk: 'low',      category: 'browser' },
    browser_console:     { risk: 'low',      category: 'browser' },
    // Browser interactive
    browser_click:       { risk: 'medium',   category: 'browser' },
    browser_type:        { risk: 'medium',   category: 'browser' },
    browser_execute_js:  { risk: 'high',     category: 'browser' },
    // Web
    web_search:          { risk: 'low',      category: 'web' },
    web_fetch:           { risk: 'low',      category: 'web' },
    // Git read
    git_status:          { risk: 'low',      category: 'git' },
    git_diff:            { risk: 'low',      category: 'git' },
    git_log:             { risk: 'low',      category: 'git' },
    git_blame:           { risk: 'low',      category: 'git' },
    // Git write
    git_branch:          { risk: 'medium',   category: 'git' },
    git_commit:          { risk: 'medium',   category: 'git' },
    git_checkout:        { risk: 'medium',   category: 'git' },
    git_stash:           { risk: 'medium',   category: 'git' },
    git_pr:              { risk: 'high',     category: 'git' },
    git_issue:           { risk: 'medium',   category: 'git' },
    git_release:         { risk: 'high',     category: 'git' },
    // Task
    task_create:         { risk: 'low',      category: 'task' },
    task_update:         { risk: 'low',      category: 'task' },
    task_list:           { risk: 'low',      category: 'task' },
    task_get:            { risk: 'low',      category: 'task' },
    // Notebook
    notebook_read:       { risk: 'low',      category: 'notebook' },
    notebook_edit:       { risk: 'medium',   category: 'notebook' },
    // Image / Upload
    image_read:          { risk: 'low',      category: 'image' },
    file_upload:         { risk: 'medium',   category: 'image' },
  };

  return map[toolName] || { risk: 'medium', category: 'unknown' };
}

function getToolDescription(toolName: string, mode: AgentMode): string {
  const descriptions: Record<string, string> = {
    file_read:          'Read file contents',
    file_write:         'Write/create files',
    file_edit:          'Edit existing files',
    shell_exec:         'Execute shell commands',
    grep_search:        'Search file contents with regex',
    glob_match:         'Find files by glob pattern',
    browser_navigate:   'Navigate browser to URL',
    browser_read:       'Read page content from browser',
    browser_find:       'Find elements on page',
    browser_screenshot: 'Capture page screenshot',
    browser_network:    'Read network requests',
    browser_console:    'Read console messages',
    browser_click:      'Click elements on page',
    browser_type:       'Type text into page elements',
    browser_execute_js: 'Execute JavaScript in page context',
    web_search:         'Search the web',
    web_fetch:          'Fetch content from URL',
    git_status:         'Show working tree status',
    git_diff:           'Show changes between commits',
    git_log:            'Show commit history',
    git_blame:          'Show line-by-line revision info',
    git_branch:         'List, create, or switch branches',
    git_commit:         'Record changes to repository',
    git_checkout:       'Switch branches or restore files',
    git_stash:          'Stash and restore changes',
    git_pr:             'Manage pull requests',
    git_issue:          'Manage issues',
    git_release:        'Manage releases',
    task_create:        'Create a new task',
    task_update:        'Update an existing task',
    task_list:          'List all tasks',
    task_get:           'Get task details',
    notebook_read:      'Read Jupyter notebook cells',
    notebook_edit:      'Edit Jupyter notebook cells',
    image_read:         'Read/inspect image files',
    file_upload:        'Upload files to external services',
  };

  return descriptions[toolName] || `Tool: ${toolName}`;
}
