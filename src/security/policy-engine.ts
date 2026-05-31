// ── Security Policy Engine ──────────────────────────────────────

export type PolicyAction = 'allow' | 'deny' | 'ask';

export interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  rules: PolicyRule[];
  enabled: boolean;
  priority: number;
}

export interface PolicyRule {
  resource: string;
  action: PolicyAction;
  conditions?: PolicyCondition[];
  reason?: string;
}

export interface PolicyCondition {
  type: 'tool' | 'path' | 'pattern' | 'time' | 'user';
  operator: 'equals' | 'contains' | 'matches' | 'in' | 'not_in';
  value: string | string[];
}

export interface PolicyEvaluation {
  action: PolicyAction;
  policyId: string;
  rule: PolicyRule;
  reason: string;
}

const DEFAULT_POLICIES: SecurityPolicy[] = [
  {
    id: 'system-protection',
    name: 'System Directory Protection',
    description: 'Prevent writes to critical system directories',
    enabled: true,
    priority: 100,
    rules: [
      { resource: 'path', action: 'deny', conditions: [{ type: 'path', operator: 'matches', value: '^/(etc|sys|proc|boot|dev)/' }], reason: 'System directory access blocked' },
      { resource: 'path', action: 'deny', conditions: [{ type: 'path', operator: 'matches', value: 'C:\\\\Windows\\\\(System32|SysWOW64)' }], reason: 'Windows system directory blocked' },
    ],
  },
  {
    id: 'credential-protection',
    name: 'Credential File Protection',
    description: 'Prevent reading/writing credential files',
    enabled: true,
    priority: 95,
    rules: [
      { resource: 'path', action: 'deny', conditions: [{ type: 'path', operator: 'matches', value: '\\.(env|pem|key|p12|pfx|keystore)$' }], reason: 'Credential file access blocked' },
      { resource: 'content', action: 'deny', conditions: [{ type: 'pattern', operator: 'matches', value: '(sk-[a-zA-Z0-9]{48}|AKIA[A-Z0-9]{16})' }], reason: 'Credential content detected' },
    ],
  },
  {
    id: 'network-safety',
    name: 'Network Safety',
    description: 'Prevent dangerous network operations',
    enabled: true,
    priority: 90,
    rules: [
      { resource: 'command', action: 'deny', conditions: [{ type: 'pattern', operator: 'matches', value: '(curl|wget).*\\|\\s*(bash|sh|python|node)' }], reason: 'Pipe to shell blocked' },
      { resource: 'command', action: 'ask', conditions: [{ type: 'pattern', operator: 'matches', value: '(curl|wget)\\s+https?://' }], reason: 'Network download requires approval' },
    ],
  },
];

export class PolicyEngine {
  private policies: SecurityPolicy[];
  private auditLog: Array<{ timestamp: Date; evaluation: PolicyEvaluation; input: string }> = [];

  constructor(customPolicies?: SecurityPolicy[]) {
    this.policies = [...DEFAULT_POLICIES, ...(customPolicies || [])];
    this.policies.sort((a, b) => b.priority - a.priority);
  }

  evaluate(toolName: string, input: Record<string, unknown>): PolicyEvaluation {
    const inputStr = JSON.stringify(input);

    for (const policy of this.policies) {
      if (!policy.enabled) continue;
      for (const rule of policy.rules) {
        if (this.matchConditions(rule.conditions || [], toolName, input, inputStr)) {
          const evaluation: PolicyEvaluation = {
            action: rule.action,
            policyId: policy.id,
            rule,
            reason: rule.reason || `Matched policy: ${policy.name}`,
          };
          this.auditLog.push({ timestamp: new Date(), evaluation, input: inputStr });
          if (evaluation.action === 'deny') return evaluation;
        }
      }
    }

    return { action: 'allow', policyId: 'default', rule: { resource: '*', action: 'allow' }, reason: 'No policy violation' };
  }

  private matchConditions(conditions: PolicyCondition[], toolName: string, input: Record<string, unknown>, inputStr: string): boolean {
    return conditions.every(c => {
      let target = '';
      if (c.type === 'tool') target = toolName;
      else if (c.type === 'path') target = (input.path as string) || (input.file_path as string) || '';
      else if (c.type === 'pattern') target = inputStr;
      else target = '';

      switch (c.operator) {
        case 'equals': return target === c.value;
        case 'contains': return target.includes(c.value as string);
        case 'matches': return new RegExp(c.value as string).test(target);
        case 'in': return (c.value as string[]).includes(target);
        case 'not_in': return !(c.value as string[]).includes(target);
        default: return false;
      }
    });
  }

  addPolicy(policy: SecurityPolicy): void { this.policies.push(policy); this.policies.sort((a, b) => b.priority - a.priority); }
  removePolicy(id: string): void { this.policies = this.policies.filter(p => p.id !== id); }
  enablePolicy(id: string): void { const p = this.policies.find(pol => pol.id === id); if (p) p.enabled = true; }
  disablePolicy(id: string): void { const p = this.policies.find(pol => pol.id === id); if (p) p.enabled = false; }
  getAuditLog(): typeof this.auditLog { return [...this.auditLog]; }
  listPolicies(): SecurityPolicy[] { return [...this.policies]; }
}
