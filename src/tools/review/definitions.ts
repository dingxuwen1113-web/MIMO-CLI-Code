// ── Auto Review Tool Definition ────────────────────────
import { ToolDefinition } from '../registry';

export const autoReviewTool: ToolDefinition = {
  name: 'auto_review',
  description: 'Review git diff or specific files for correctness bugs, security issues, performance problems, and style issues. Returns structured findings sorted by severity.',
  input_schema: {
    type: 'object' as const,
    properties: {
      target: {
        type: 'string',
        enum: ['staged', 'unstaged', 'all'],
        description: 'What to review: "staged" (git diff --staged), "unstaged" (git diff), "all" (both). Alternatively, provide file paths as a comma-separated string.',
      },
      severity: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: 'Minimum severity to report (default: low, reports all)',
      },
      categories: {
        type: 'array',
        items: { type: 'string', enum: ['bugs', 'security', 'performance', 'style'] },
        description: 'Categories to check (default: all)',
      },
      fix: {
        type: 'boolean',
        description: 'Auto-apply safe fixes for critical/high findings (default: false)',
      },
      crossReference: {
        type: 'boolean',
        description: 'Also check for cross-file issues like broken callers (default: true)',
      },
    },
    required: [],
  },
  permission: 'auto',
};
