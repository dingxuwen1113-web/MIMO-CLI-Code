// ── Permission Rules Engine ──────────────────────────────────────────────────
//
// Provides glob-based path matching and rule evaluation for the permission
// system. Rules can override base permissions based on tool name patterns,
// file paths in tool input, and the current operational mode.
//
// Supports:
//   - Wildcard tool name matching (e.g. "file_*" matches file_write, file_edit)
//   - Glob path matching via the `glob` library (e.g. "src/**", ".env*")
//   - Mode-scoped rules (a rule only applies in the specified mode)
//   - Input field matching for input-aware overrides

import { minimatch } from 'minimatch';
import type { AgentMode, ToolPermission } from './mode';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A single permission rule that can override the base permission matrix.
 *
 * @property tool     - Tool name pattern. Supports "*" wildcard:
 *                      exact match ("file_write"), prefix ("file_*"),
 *                      suffix ("*_read"), or full wildcard ("*").
 * @property pattern  - Glob pattern matched against file paths in tool input.
 *                      Uses the `glob` library for matching.
 *                      Set to "*" or omit to match any path.
 * @property mode     - The mode this rule applies to. Required.
 * @property permission - The permission to grant when this rule matches.
 */
export interface PermissionRule {
  tool: string;
  pattern: string;
  mode: AgentMode;
  permission: ToolPermission;
}

/**
 * An input-aware override that refines permissions based on specific
 * input field values.
 *
 * @property tool       - Exact tool name this override applies to.
 * @property field      - The input field name to inspect (e.g. "action", "file").
 * @property match      - Array of values that trigger this override.
 *                        Use ["__any__"] to match any non-empty value for the field.
 * @property mode       - The mode this override applies to.
 * @property permission - The permission to grant when this override matches.
 */
export interface InputOverride {
  tool: string;
  field: string;
  match: string[];
  mode: AgentMode;
  permission: ToolPermission;
}

/**
 * An MCP-specific permission rule that matches MCP tool names with globs.
 *
 * @property pattern    - Glob pattern on the full MCP tool name
 *                        (e.g. "mcp__*__read*", "mcp__github__create*").
 * @property mode       - The mode this rule applies to.
 * @property permission - The permission to grant when this rule matches.
 */
export interface McpPermissionRule {
  pattern: string;
  mode: AgentMode;
  permission: ToolPermission;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Wildcard matching
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a tool name matches a pattern that may contain "*" wildcards.
 *
 * Examples:
 *   matchToolName("file_write", "file_write")  => true  (exact)
 *   matchToolName("file_write", "file_*")      => true  (prefix wildcard)
 *   matchToolName("git_commit", "*_commit")    => true  (suffix wildcard)
 *   matchToolName("any_tool",   "*")           => true  (full wildcard)
 *   matchToolName("file_read",  "file_write")  => false (no match)
 */
function matchToolName(toolName: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (!pattern.includes('*')) return toolName === pattern;

  // Convert wildcard pattern to regex: escape special chars, replace * with .*
  const regexStr = '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
  return new RegExp(regexStr).test(toolName);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Path extraction from tool input
// ═══════════════════════════════════════════════════════════════════════════════

/** Known input fields that contain file paths, checked in priority order. */
const PATH_FIELDS = ['path', 'file', 'file_path', 'filePath', 'target', 'filename'] as const;

/**
 * Extract a file path from tool input by checking common field names.
 * Returns the first non-empty string value found, or null.
 */
function extractPathFromInput(input?: Record<string, any>): string | null {
  if (!input) return null;
  for (const field of PATH_FIELDS) {
    const value = input[field];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Path matching
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a file path matches a glob pattern.
 *
 * Uses minimatch for synchronous pattern matching.
 * Paths are normalized to forward slashes before matching.
 *
 * @param filePath   - The file path from tool input (e.g. "src/core/mode.ts")
 * @param globPattern - The glob pattern (e.g. "src/**", ".env*", "config/**")
 * @returns true if the path matches the pattern
 */
function matchGlobPath(filePath: string, globPattern: string): boolean {
  // Normalize path separators to forward slashes
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedPattern = globPattern.replace(/\\/g, '/');

  // Use minimatch for synchronous pattern matching
  // dot: true ensures patterns like .env* match dotfiles
  return minimatch(normalizedPath, normalizedPattern, { dot: true });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Rule evaluation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find the first matching permission rule for a given tool, path, and mode.
 *
 * Rules are evaluated in array order (first match wins). Each rule is checked
 * against three criteria:
 *   1. Tool name matches the rule's tool pattern (wildcard-aware)
 *   2. Rule applies to the current mode
 *   3. File path matches the rule's glob pattern (if a path is available)
 *
 * @param rules     - Array of permission rules to evaluate
 * @param toolName  - The tool being invoked
 * @param toolInput - The tool's input parameters (used to extract file paths)
 * @param mode      - The current operational mode
 * @returns The permission from the first matching rule, or null if none match
 */
export function matchPermission(
  rules: PermissionRule[],
  toolName: string,
  toolInput: Record<string, any> | undefined,
  mode: AgentMode
): ToolPermission | null {
  const filePath = extractPathFromInput(toolInput);

  for (const rule of rules) {
    // Check tool name match (wildcard-aware)
    if (!matchToolName(toolName, rule.tool)) continue;

    // Check mode match
    if (rule.mode !== mode) continue;

    // Check path match
    if (rule.pattern === '*') {
      // Universal pattern: matches regardless of input path
      return rule.permission;
    }

    if (filePath && matchGlobPath(filePath, rule.pattern)) {
      return rule.permission;
    }

    // If no path in input but the rule requires a path match, skip
    // (the rule cannot be evaluated without a path)
    if (!filePath) continue;
  }

  return null;
}

/**
 * Find the first matching input-aware override for a given tool and mode.
 *
 * Input overrides refine permissions based on specific input field values.
 * This is used for tools like git_branch where sub-operations have different
 * risk levels (e.g. "list" is read-only, "create" is a write).
 *
 * @param overrides - Array of input overrides to evaluate
 * @param toolName  - The tool being invoked (exact match required)
 * @param toolInput - The tool's input parameters
 * @param mode      - The current operational mode
 * @returns The permission from the first matching override, or null if none match
 */
export function matchInputOverride(
  overrides: InputOverride[],
  toolName: string,
  toolInput: Record<string, any> | undefined,
  mode: AgentMode
): ToolPermission | null {
  if (!toolInput) return null;

  for (const override of overrides) {
    if (override.tool !== toolName) continue;
    if (override.mode !== mode) continue;

    const fieldValue = toolInput[override.field];

    // Special sentinel: "__any__" matches any non-empty value
    if (override.match.includes('__any__') && fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
      return override.permission;
    }

    // Exact value match
    if (override.match.includes(String(fieldValue))) {
      return override.permission;
    }
  }

  return null;
}

/**
 * Find the first matching MCP permission rule for an MCP tool.
 *
 * MCP tools follow the naming convention mcp__<server>__<tool_name>.
 * This function matches the full tool name against MCP-specific glob patterns.
 *
 * @param mcpRules  - Array of MCP permission rules to evaluate
 * @param toolName  - The full MCP tool name (e.g. "mcp__github__create_issue")
 * @param mode      - The current operational mode
 * @returns The permission from the first matching rule, or null if none match
 */
export function matchMcpPermission(
  mcpRules: McpPermissionRule[],
  toolName: string,
  mode: AgentMode
): ToolPermission | null {
  for (const rule of mcpRules) {
    if (rule.mode !== mode) continue;
    if (matchToolName(toolName, rule.pattern)) {
      return rule.permission;
    }
  }
  return null;
}
