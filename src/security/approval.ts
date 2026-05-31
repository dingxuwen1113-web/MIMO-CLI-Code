// ── Security Approval System ─────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ApprovalRequest {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  riskLevel: RiskLevel;
  reason: string;
  preview?: string;
  timestamp: Date;
}

export interface ApprovalDecision {
  requestId: string;
  approved: boolean;
  alwaysAllow?: boolean;
  timestamp: Date;
}

export interface ApprovalRule {
  pattern: RegExp;
  riskLevel: RiskLevel;
  autoApprove: boolean;
  reason: string;
}

const DEFAULT_RULES: ApprovalRule[] = [
  { pattern: /^(ls|cat|head|tail|wc|grep|find|echo|pwd|date|whoami|which|file|stat)/, riskLevel: 'low', autoApprove: true, reason: 'Read-only command' },
  { pattern: /^(git (status|log|diff|show|branch|remote|describe|rev-parse))/, riskLevel: 'low', autoApprove: true, reason: 'Git read operation' },
  { pattern: /^(npm|yarn|pnpm) (list|info|view|outdated|audit)/, riskLevel: 'low', autoApprove: true, reason: 'Package info command' },
  { pattern: /^(tsc|vitest|jest|eslint|prettier)/, riskLevel: 'low', autoApprove: true, reason: 'Dev tool command' },
  { pattern: /^(git (push|force|reset --hard|clean -f))/, riskLevel: 'high', autoApprove: false, reason: 'Destructive git operation' },
  { pattern: /rm\s+(-[rf]+\s+|.*--recursive)/, riskLevel: 'critical', autoApprove: false, reason: 'Recursive deletion' },
  { pattern: /sudo\s+/, riskLevel: 'critical', autoApprove: false, reason: 'Elevated privileges' },
  { pattern: /(curl|wget)\s+.*\|\s*(bash|sh)/, riskLevel: 'critical', autoApprove: false, reason: 'Pipe to shell' },
  { pattern: /chmod\s+(777|a\+w)/, riskLevel: 'high', autoApprove: false, reason: 'Overly permissive chmod' },
  { pattern: />(\s*\/(etc|usr|var|sys|proc))/, riskLevel: 'critical', autoApprove: false, reason: 'Write to system directory' },
];

export class ApprovalManager {
  private rules: ApprovalRule[];
  private history: ApprovalDecision[] = [];
  private alwaysAllowSet = new Set<string>();
  private alwaysDenySet = new Set<string>();

  constructor(customRules?: ApprovalRule[]) {
    this.rules = customRules || DEFAULT_RULES;
  }

  evaluate(toolName: string, input: Record<string, unknown>): { riskLevel: RiskLevel; autoApprove: boolean; reason: string } {
    const command = input.command as string || input.content as string || '';
    const fullString = `${toolName} ${command}`;

    if (this.alwaysAllowSet.has(toolName)) return { riskLevel: 'low', autoApprove: true, reason: 'Previously allowed' };
    if (this.alwaysDenySet.has(toolName)) return { riskLevel: 'critical', autoApprove: false, reason: 'Previously denied' };

    for (const rule of this.rules) {
      if (rule.pattern.test(fullString)) {
        return { riskLevel: rule.riskLevel, autoApprove: rule.autoApprove, reason: rule.reason };
      }
    }

    return { riskLevel: 'medium', autoApprove: false, reason: 'No matching rule' };
  }

  recordDecision(toolName: string, decision: ApprovalDecision, alwaysAllow?: boolean): void {
    this.history.push(decision);
    if (alwaysAllow) this.alwaysAllowSet.add(toolName);
  }

  addRule(rule: ApprovalRule): void { this.rules.push(rule); }
  removeRule(pattern: RegExp): void { this.rules = this.rules.filter(r => r.pattern.source !== pattern.source); }
  getHistory(): ApprovalDecision[] { return [...this.history]; }
  getAlwaysAllowList(): string[] { return [...this.alwaysAllowSet]; }
  revokeAlwaysAllow(toolName: string): void { this.alwaysAllowSet.delete(toolName); }
  clearHistory(): void { this.history = []; }
}
