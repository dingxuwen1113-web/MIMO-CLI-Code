// ── Cyber Safety Tool Definition ───────────────────────
import { ToolDefinition } from '../tools/registry';
import { ToolResult } from '../tools/registry';
import { CyberSafety, FindingCategory } from './cyber-safety';

export const cyberScanTool: ToolDefinition = {
  name: 'cyber_scan',
  description: 'Run a comprehensive security scan on the project. Detects prompt injection, data exfiltration, unsafe code patterns, and dependency risks. Returns a security report with risk score, findings, and mitigations.',
  input_schema: {
    type: 'object' as const,
    properties: {
      target: {
        type: 'string',
        enum: ['codebase', 'diff', 'input'],
        description: 'What to scan: "codebase" (project files), "diff" (git changes), "input" (last user input)',
      },
      categories: {
        type: 'array',
        items: { type: 'string', enum: ['injection', 'exfiltration', 'unsafe-code', 'dependencies'] },
        description: 'Categories to scan (default: all)',
      },
      inputText: {
        type: 'string',
        description: 'Text to scan for prompt injection (when target is "input")',
      },
    },
    required: ['target'],
  },
  permission: 'auto',
};

// ── CyberSafety instance for tool execution ────────────

let _cyberSafety: CyberSafety | null = null;

function getCyberSafety(): CyberSafety {
  if (!_cyberSafety) {
    _cyberSafety = new CyberSafety();
  }
  return _cyberSafety;
}

export async function executeCyberScan(input: Record<string, any>): Promise<ToolResult> {
  try {
    const cs = getCyberSafety();
    const target = input.target || 'codebase';
    const categories: FindingCategory[] = Array.isArray(input.categories)
      ? input.categories as FindingCategory[]
      : ['injection', 'exfiltration', 'unsafe-code', 'dependencies'];

    if (target === 'input') {
      // Scan the provided text for prompt injection
      const text = input.inputText || '';
      const findings = cs.detectPromptInjection(text);
      const filteredFindings = findings.filter((f) => categories.includes(f.category));
      const report = cs.formatReport({
        riskScore: filteredFindings.reduce((sum, f) => sum + (f.severity === 'critical' ? 25 : f.severity === 'high' ? 10 : f.severity === 'medium' ? 3 : 1), 0),
        findings: filteredFindings,
        summary: {
          critical: filteredFindings.filter((f) => f.severity === 'critical').length,
          high: filteredFindings.filter((f) => f.severity === 'high').length,
          medium: filteredFindings.filter((f) => f.severity === 'medium').length,
          low: filteredFindings.filter((f) => f.severity === 'low').length,
          byCategory: {
            injection: filteredFindings.filter((f) => f.category === 'injection').length,
            exfiltration: 0,
            'unsafe-code': 0,
            dependencies: 0,
          },
        },
        mitigations: [...new Set(filteredFindings.map((f) => f.mitigation))],
      });
      return { output: report, isError: false };
    }

    // Full scan (codebase or diff)
    const report = await cs.comprehensiveScan(target, categories);
    const formatted = cs.formatReport(report);
    return { output: formatted, isError: false };
  } catch (err: any) {
    return { output: `Security scan failed: ${err.message || String(err)}`, isError: true };
  }
}

export { CyberSafety } from './cyber-safety';
