// ── Agent Mode Manager ──────────────────────────────────────────────────────
//
// Manages the four operational modes (plan, agent, custom, yolo) and provides
// fine-grained per-tool permission resolution with input awareness,
// MCP read-only detection, mode inheritance, validation, and external
// TOML-based permission configuration.
//
// External configuration is loaded from config/permissions.toml. When absent,
// the hardcoded defaults below are used as fallback.

import fs from 'node:fs';
import path from 'node:path';
import toml from 'toml';
import {
  matchPermission,
  matchInputOverride,
  matchMcpPermission,
} from './permission-rules';
import type { PermissionRule, InputOverride, McpPermissionRule } from './permission-rules';

export type AgentMode = 'plan' | 'agent' | 'custom' | 'yolo';
export type ToolPermission = 'auto' | 'ask' | 'denied';

// Re-export PermissionRule so consumers can import from a single location
export type { PermissionRule, InputOverride, McpPermissionRule } from './permission-rules';

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

/** Parsed external permission configuration */
interface ExternalPermissions {
  matrix: Record<AgentMode, Record<string, ToolPermission>>;
  directoryRules: PermissionRule[];
  inputOverrides: InputOverride[];
  mcpRules: McpPermissionRule[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * All valid agent modes in security order (least to most permissive).
 *
 * custom mode sits between agent and yolo: file operations are auto-approved,
 * but shell, git writes, and other destructive actions still require approval.
 */
const MODE_SECURITY_ORDER: AgentMode[] = ['plan', 'agent', 'custom', 'yolo'];

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
// Permission Matrix (Hardcoded Fallback Layer)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Complete base permission matrix: 36 tools x 4 modes.
 *
 * These values are the "ground truth" for ModeManager.getToolPermission
 * BEFORE any external TOML overrides, input-aware overrides, or ToolRegistry layering.
 *
 * Inheritance is applied at construction time:
 *   yolo inherits from custom inherits from agent inherits from plan
 *
 * When an external permissions.toml is loaded, its values override these defaults.
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

  // ── Custom mode: middle ground between agent and yolo ──
  // Inherits from agent, then auto-approves file ops and browser interactions
  // while keeping destructive operations (shell, git writes) at ask.
  const custom: Record<string, ToolPermission> = {
    ...agent,

    // File tools: auto-approve in custom mode
    file_write:          'auto',
    file_edit:           'auto',

    // Browser interactive: auto-approve (except JS execution)
    browser_click:       'auto',
    browser_type:        'auto',

    // Notebook edit: auto-approve
    notebook_edit:       'auto',
  };

  // ── YOLO mode: everything is auto ──
  // Inherits from custom, then overrides everything to auto
  const yolo: Record<string, ToolPermission> = {};
  for (const key of Object.keys(custom)) {
    yolo[key] = 'auto';
  }

  return { plan, agent, custom, yolo };
}

const PERMISSION_MATRIX = buildPermissionMatrix();

// ═══════════════════════════════════════════════════════════════════════════════
// TOML Config Parsing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valid permission values accepted by the parser.
 */
const VALID_PERMISSIONS: ToolPermission[] = ['auto', 'ask', 'denied'];

/**
 * Valid mode values accepted by the parser.
 */
const VALID_MODES: AgentMode[] = ['plan', 'agent', 'custom', 'yolo'];

/**
 * Validate and coerce a permission string from TOML.
 * Returns null if the value is invalid.
 */
function parsePermissionValue(value: unknown): ToolPermission | null {
  if (typeof value === 'string' && (VALID_PERMISSIONS as string[]).includes(value)) {
    return value as ToolPermission;
  }
  return null;
}

/**
 * Validate and coerce a mode string from TOML.
 * Returns null if the value is invalid.
 */
function parseModeValue(value: unknown): AgentMode | null {
  if (typeof value === 'string' && (VALID_MODES as string[]).includes(value)) {
    return value as AgentMode;
  }
  return null;
}

/**
 * Parse a TOML config file into an ExternalPermissions structure.
 *
 * Unknown or invalid entries are silently skipped (logged to stderr).
 * This ensures a partially-valid config still works.
 */
function parsePermissionsToml(configPath: string): ExternalPermissions | null {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = toml.parse(content);

    const result: ExternalPermissions = {
      matrix: {} as Record<AgentMode, Record<string, ToolPermission>>,
      directoryRules: [],
      inputOverrides: [],
      mcpRules: [],
    };

    // Initialize matrix with empty objects for each mode
    for (const mode of VALID_MODES) {
      result.matrix[mode] = {};
    }

    // Parse [[tool_permissions]]
    if (Array.isArray(parsed.tool_permissions)) {
      for (const entry of parsed.tool_permissions) {
        const name = entry.name;
        const mode = parseModeValue(entry.mode);
        const permission = parsePermissionValue(entry.value);

        if (!name || !mode || !permission) {
          continue; // Skip invalid entries
        }

        result.matrix[mode][name] = permission;
      }
    }

    // Parse [[directory_rules]]
    if (Array.isArray(parsed.directory_rules)) {
      for (const entry of parsed.directory_rules) {
        const tool = entry.tool;
        const pattern = entry.pattern;
        const mode = parseModeValue(entry.mode);
        const permission = parsePermissionValue(entry.permission);

        if (!tool || !pattern || !mode || !permission) {
          continue;
        }

        result.directoryRules.push({ tool, pattern, mode, permission });
      }
    }

    // Parse [[input_overrides]]
    if (Array.isArray(parsed.input_overrides)) {
      for (const entry of parsed.input_overrides) {
        const tool = entry.tool;
        const field = entry.field;
        const match = entry.match;
        const mode = parseModeValue(entry.mode);
        const permission = parsePermissionValue(entry.permission);

        if (!tool || !field || !Array.isArray(match) || !mode || !permission) {
          continue;
        }

        result.inputOverrides.push({ tool, field, match: match.map(String), mode, permission });
      }
    }

    // Parse [[mcp_permissions]]
    if (Array.isArray(parsed.mcp_permissions)) {
      for (const entry of parsed.mcp_permissions) {
        const pattern = entry.pattern;
        const mode = parseModeValue(entry.mode);
        const permission = parsePermissionValue(entry.permission);

        if (!pattern || !mode || !permission) {
          continue;
        }

        result.mcpRules.push({ pattern, mode, permission });
      }
    }

    return result;
  } catch (err) {
    // File not found, parse error, etc. - return null to trigger fallback
    return null;
  }
}

/**
 * Merge the external TOML matrix into the hardcoded matrix.
 * External values take precedence; missing entries keep the hardcoded default.
 */
function mergeMatrix(
  hardcoded: Record<AgentMode, Record<string, ToolPermission>>,
  external: Record<AgentMode, Record<string, ToolPermission>>
): Record<AgentMode, Record<string, ToolPermission>> {
  const merged = {} as Record<AgentMode, Record<string, ToolPermission>>;

  for (const mode of VALID_MODES) {
    merged[mode] = {
      ...hardcoded[mode],
      ...external[mode],
    };
  }

  return merged;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ModeManager
// ═══════════════════════════════════════════════════════════════════════════════

export class ModeManager {
  private mode: AgentMode;
  private modeHistory: AgentMode[] = [];

  /** Effective permission matrix (merged from hardcoded + external TOML) */
  private permissionMatrix: Record<AgentMode, Record<string, ToolPermission>>;

  /** Dynamically added directory-based permission rules */
  private directoryRules: PermissionRule[] = [];

  /** Input-aware overrides (loaded from TOML or hardcoded) */
  private inputOverrides: InputOverride[] = [];

  /** MCP-specific permission rules (loaded from TOML) */
  private mcpRules: McpPermissionRule[] = [];

  /** Path to the loaded external config, if any */
  private loadedConfigPath: string | null = null;

  constructor(mode: AgentMode) {
    if (!MODE_SECURITY_ORDER.includes(mode)) {
      throw new Error(`Invalid mode: "${mode}". Must be one of: ${MODE_SECURITY_ORDER.join(', ')}`);
    }
    this.mode = mode;
    this.modeHistory.push(mode);

    // Start with hardcoded defaults
    this.permissionMatrix = PERMISSION_MATRIX;

    // Try to auto-load the default config file
    const defaultConfigPath = path.resolve(process.cwd(), 'config', 'permissions.toml');
    this.loadPermissions(defaultConfigPath);
  }

  // ── External config loading ───────────────────────────────────────────

  /**
   * Load permission configuration from an external TOML file.
   *
   * The TOML file can define:
   *   - [[tool_permissions]]: per-tool per-mode overrides for the base matrix
   *   - [[directory_rules]]: glob-based path matching rules
   *   - [[input_overrides]]: input-field-aware permission refinements
   *   - [[mcp_permissions]]: MCP tool-specific permission rules
   *
   * External values are merged on top of the hardcoded defaults.
   * If the file does not exist or cannot be parsed, the hardcoded defaults
   * are used (backward compatible).
   *
   * @param configPath - Absolute or relative path to the TOML config file
   * @returns true if the config was loaded successfully, false on fallback
   */
  loadPermissions(configPath: string): boolean {
    const resolved = path.resolve(configPath);
    const external = parsePermissionsToml(resolved);

    if (!external) {
      return false;
    }

    this.loadedConfigPath = resolved;
    this.permissionMatrix = mergeMatrix(PERMISSION_MATRIX, external.matrix);
    this.directoryRules = external.directoryRules;
    this.inputOverrides = external.inputOverrides;
    this.mcpRules = external.mcpRules;

    return true;
  }

  /**
   * Get the path to the currently loaded external config, if any.
   */
  getLoadedConfigPath(): string | null {
    return this.loadedConfigPath;
  }

  // ── Dynamic rule management ───────────────────────────────────────────

  /**
   * Add a dynamic permission rule at runtime.
   *
   * Dynamic rules are evaluated before the permission matrix lookup.
   * Rules added later have lower priority (evaluated after earlier rules).
   *
   * @param rule - The permission rule to add
   */
  addRule(rule: PermissionRule): void {
    if (!MODE_SECURITY_ORDER.includes(rule.mode)) {
      throw new Error(`Invalid mode in rule: "${rule.mode}". Must be one of: ${MODE_SECURITY_ORDER.join(', ')}`);
    }
    if (!(VALID_PERMISSIONS as string[]).includes(rule.permission)) {
      throw new Error(`Invalid permission in rule: "${rule.permission}". Must be one of: ${VALID_PERMISSIONS.join(', ')}`);
    }
    this.directoryRules.push(rule);
  }

  /**
   * Remove all dynamically added rules (does not affect TOML-loaded rules).
   */
  clearDynamicRules(): void {
    // Only remove rules that were added after construction
    // We track this by noting the initial count from TOML loading
    // For simplicity, this clears all directory rules and reloads from TOML
    if (this.loadedConfigPath) {
      this.loadPermissions(this.loadedConfigPath);
    } else {
      this.directoryRules = [];
    }
  }

  /**
   * Get all currently active directory rules (TOML-loaded + dynamic).
   */
  getDirectoryRules(): PermissionRule[] {
    return [...this.directoryRules];
  }

  /**
   * Get all currently active input overrides.
   */
  getInputOverrides(): InputOverride[] {
    return [...this.inputOverrides];
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

    // Warn on security downgrade (plan -> agent -> custom -> yolo)
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
   * This uses the (possibly TOML-overridden) permission matrix
   * without input awareness or directory rules.
   */
  getBasePermission(toolName: string): ToolPermission {
    return this.permissionMatrix[this.mode][toolName] || 'ask';
  }

  /**
   * Get the permission for a tool, with full resolution:
   *
   * 1. Input-aware overrides (TOML-loaded, then hardcoded)
   * 2. Directory-based rules (TOML-loaded + dynamic)
   * 3. Base matrix lookup (TOML-overridden or hardcoded fallback)
   *
   * Input awareness allows the same tool to have different permissions
   * based on the specific operation. For example:
   * - git_branch: list/read operations = auto, create/delete = write
   * - git_stash: list/show = auto, push/pop/drop = write
   * - git_checkout: branch switch = auto, file restore = write
   */
  getToolPermission(toolName: string, input?: Record<string, any>): ToolPermission {
    // ── Step 1: Input-aware overrides (external TOML first, then hardcoded) ──
    if (input) {
      // Check external input overrides from TOML
      const externalOverride = matchInputOverride(this.inputOverrides, toolName, input, this.mode);
      if (externalOverride !== null) {
        return externalOverride;
      }

      // Hardcoded input-aware overrides (backward compatible fallback)
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

    // ── Step 2: Directory-based rules (external TOML + dynamic) ──
    const rulePermission = matchPermission(
      this.directoryRules,
      toolName,
      input,
      this.mode
    );
    if (rulePermission !== null) {
      return rulePermission;
    }

    // ── Step 3: Base matrix lookup ──
    return this.permissionMatrix[this.mode][toolName] || 'ask';
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
   * Get the permission for an MCP tool.
   *
   * Resolution order:
   * 1. External MCP rules from TOML (glob pattern matching)
   * 2. Hardcoded read/write classification based on tool name patterns
   */
  getMcpToolPermission(toolName: string): ToolPermission {
    // ── External MCP rules (from TOML) ──
    const mcpRulePermission = matchMcpPermission(this.mcpRules, toolName, this.mode);
    if (mcpRulePermission !== null) {
      return mcpRulePermission;
    }

    // ── Hardcoded classification fallback ──
    if (this.mode === 'plan') {
      return this.isMcpReadOnlyTool(toolName) ? 'auto' : 'denied';
    }
    if (this.mode === 'agent' || this.mode === 'custom') {
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
    const allTools = Object.keys(this.permissionMatrix[this.mode]);
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
      custom: 'Custom mode - selective: file ops are auto-approved, destructive ops still require approval',
      yolo: 'YOLO mode - autonomous: all operations execute automatically',
    };
    return descriptions[this.mode];
  }

  /**
   * Get the security level of the current mode (0=plan, 1=agent, 2=custom, 3=yolo).
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
