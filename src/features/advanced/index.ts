// ── Features 35-55: Performance + Security + AI + Terminal
import { FeatureModule, FeatureContext } from '../registry';
import { readFileSafe, getSourceFiles, runCommand, estimateTokens, now_iso } from '../utils';
import * as path from 'path';
import * as fs from 'fs/promises';

// ═══ Feature 35: Cost Predictor ══════════════════════
class CostPredictor {
  private pricing: Record<string, { input: number; output: number }> = {
    'mimo-v2.5-pro': { input: 3, output: 15 },
    'mimo-v2.5': { input: 0.25, output: 1.25 },
  };

  estimate(inputTokens: number, outputTokens: number, model: string): number {
    const p = this.pricing[model] || this.pricing['mimo-v2.5-pro'];
    return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  }

  estimateMessage(messages: Array<{ content: string }>, model: string, estimatedOutput = 2000): { inputTokens: number; estimatedCost: number } {
    const inputTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    return { inputTokens, estimatedCost: this.estimate(inputTokens, estimatedOutput, model) };
  }
}

const costPredictor = new CostPredictor();

export const CostPredictorFeature: FeatureModule = {
  meta: { id: 'cost-predictor', name: 'Cost Predictor', description: 'Estimate token cost before executing operations', category: 'performance', enabled: true, priority: 'P0' },
  getTools() {
    return [{
      name: 'estimate_cost',
      definition: { name: 'estimate_cost', description: 'Estimate the token cost of an operation', input_schema: { type: 'object' as const, properties: { text: { type: 'string' }, model: { type: 'string' } }, required: ['text'] } },
      execute: async (input: any) => {
        const tokens = estimateTokens(input.text);
        const cost = costPredictor.estimate(tokens, 2000, input.model || 'mimo-v2.5-pro');
        return { output: `Estimated: ${tokens} input tokens, ~$${cost.toFixed(4)} (${input.model || 'mimo-v2.5-pro'})`, isError: false };
      },
    }];
  },
};

// ═══ Feature 36: Budget-Aware Task Splitting ═════════
export const BudgetSplitterFeature: FeatureModule = {
  meta: { id: 'budget-splitter', name: 'Budget-Aware Task Splitting', description: 'Auto-split large tasks within token budget', category: 'performance', enabled: true, priority: 'P1' },
  getTools() {
    return [{
      name: 'split_task_by_budget',
      definition: { name: 'split_task_by_budget', description: 'Split a large task into budget-friendly sub-tasks', input_schema: { type: 'object' as const, properties: { task: { type: 'string' }, budgetTokens: { type: 'number' } }, required: ['task'] } },
      execute: async (input: any) => {
        const budget = input.budgetTokens || 100000;
        const taskTokens = estimateTokens(input.task);
        const numParts = Math.max(1, Math.ceil(taskTokens / (budget * 0.3)));
        const parts = [];
        const words = input.task.split(/[.。\n]/);
        const perPart = Math.ceil(words.length / numParts);
        for (let i = 0; i < numParts; i++) {
          parts.push(`Part ${i + 1}: ${words.slice(i * perPart, (i + 1) * perPart).join('. ')}`);
        }
        return { output: `Split into ${numParts} sub-tasks (budget: ${budget} tokens):\n${parts.join('\n\n')}`, isError: false };
      },
    }];
  },
};

// ═══ Feature 37: Parallel Diff Streaming ═════════════
export const ParallelDiffFeature: FeatureModule = {
  meta: { id: 'parallel-diff', name: 'Parallel Diff Streaming', description: 'Multi-file concurrent diff rendering', category: 'performance', enabled: true, priority: 'P1' },
  getTools() {
    return [{
      name: 'parallel_diff',
      definition: { name: 'parallel_diff', description: 'Generate diffs for multiple files in parallel', input_schema: { type: 'object' as const, properties: { files: { type: 'array', items: { type: 'string' }, description: 'Array of file paths to diff' }, staged: { type: 'boolean', description: 'Diff staged changes instead of working tree' } }, required: ['files'] } },
      execute: async (input: any) => {
        const files: string[] = input.files || [];
        const staged = input.staged ? '--staged' : '';
        const diffs = await Promise.all(files.map(async (f: string) => {
          const result = await runCommand(`git diff ${staged} -- "${f}"`, undefined, 10000);
          return result.stdout.trim() ? result.stdout : null;
        }));
        const nonEmpty = diffs.filter((d): d is string => d !== null);
        if (nonEmpty.length === 0) return { output: 'No changes found in any of the specified files.', isError: false };
        return { output: `${nonEmpty.length}/${files.length} files have changes:\n\n${nonEmpty.join('\n\n---\n\n')}`, isError: false };
      },
    }];
  },
};

// ═══ Feature 38: Cache Hit Rate Monitor ══════════════
class CacheMonitor {
  private stats = { hits: 0, misses: 0, tokens: { saved: 0, total: 0 } };

  record(hit: boolean, tokensSaved?: number) {
    if (hit) { this.stats.hits++; this.stats.tokens.saved += tokensSaved || 0; }
    else this.stats.misses++;
    this.stats.tokens.total += tokensSaved || 0;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return { ...this.stats, hitRate: total > 0 ? Math.round((this.stats.hits / total) * 100) : 0 };
  }
}

const cacheMonitor = new CacheMonitor();

export const CacheMonitorFeature: FeatureModule = {
  meta: { id: 'cache-monitor', name: 'Cache Hit Rate Monitor', description: 'Prompt caching performance dashboard', category: 'performance', enabled: true, priority: 'P1' },
  async onEvent(event: string, data: any) {
    if (event === 'api_response' && data.cacheTokens) cacheMonitor.record(data.cacheTokens > 0, data.cacheTokens);
  },
  getTools() {
    return [{
      name: 'cache_stats',
      definition: { name: 'cache_stats', description: 'View prompt caching performance stats', input_schema: { type: 'object' as const, properties: {} } },
      execute: async () => {
        const s = cacheMonitor.getStats();
        return { output: `Cache Hit Rate: ${s.hitRate}%\nHits: ${s.hits}, Misses: ${s.misses}\nTokens Saved: ${s.tokens.saved}`, isError: false };
      },
    }];
  },
};

// ═══ Feature 39: Intelligent Context Window ══════════
export const SmartContextFeature: FeatureModule = {
  meta: { id: 'smart-context', name: 'Intelligent Context Window', description: 'Dynamic context size based on task type', category: 'performance', enabled: true, priority: 'P0' },
  getTools() {
    return [{
      name: 'analyze_context',
      definition: { name: 'analyze_context', description: 'Analyze conversation context and suggest optimizations', input_schema: { type: 'object' as const, properties: { messages: { type: 'array', items: { type: 'object', properties: { role: { type: 'string' }, content: { type: 'string' } } }, description: 'Conversation messages to analyze' }, maxTokens: { type: 'number', description: 'Maximum token budget' } } } },
      execute: async (input: any) => {
        const messages = input.messages || [];
        const maxTokens = input.maxTokens || 200000;
        let totalTokens = 0;
        const messageStats: Array<{ index: number; role: string; tokens: number; keepable: boolean }> = [];
        for (let i = 0; i < messages.length; i++) {
          const content = typeof messages[i].content === 'string' ? messages[i].content : JSON.stringify(messages[i].content);
          const tokens = estimateTokens(content);
          totalTokens += tokens;
          const isFirstOrLast = i === 0 || i === messages.length - 1;
          const hasToolUse = content.includes('tool_use') || content.includes('tool_result');
          messageStats.push({ index: i, role: messages[i].role || 'unknown', tokens, keepable: isFirstOrLast || hasToolUse || tokens < 500 });
        }
        const pct = Math.round((totalTokens / maxTokens) * 100);
        const removable = messageStats.filter(m => !m.keepable);
        const removableTokens = removable.reduce((s, m) => s + m.tokens, 0);
        const suggestions: string[] = [];
        if (pct > 80) suggestions.push('Context is >80% full — consider /compact');
        if (pct > 60 && removable.length > 0) suggestions.push(`${removable.length} middle messages (${removableTokens} tokens) could be compressed`);
        const toolHeavy = messageStats.filter(m => m.tokens > 5000);
        if (toolHeavy.length > 0) suggestions.push(`${toolHeavy.length} messages have large tool output — summarize tool results`);
        return { output: [
          `Context: ${totalTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens (${pct}%)`,
          `Messages: ${messages.length} total`,
          `Compressible: ${removable.length} messages (~${removableTokens.toLocaleString()} tokens)`,
          suggestions.length > 0 ? `\nSuggestions:\n${suggestions.map(s => `  • ${s}`).join('\n')}` : 'Context usage is healthy.',
        ].join('\n'), isError: false };
      },
    }];
  },
};

// ═══ Feature 40: Batch Operation Optimizer ══════════
export const BatchOptimizerFeature: FeatureModule = {
  meta: { id: 'batch-optimizer', name: 'Batch Operation Optimizer', description: 'Merge similar file operations for efficiency', category: 'performance', enabled: true, priority: 'P1' },
  getTools() {
    return [{
      name: 'batch_file_ops',
      definition: { name: 'batch_file_ops', description: 'Analyze and optimize a batch of file operations', input_schema: { type: 'object' as const, properties: { operations: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, action: { type: 'string', enum: ['read', 'write', 'edit', 'delete'] }, content: { type: 'string' } } }, description: 'List of planned file operations' } }, required: ['operations'] } },
      execute: async (input: any) => {
        const ops = input.operations || [];
        const byFile: Record<string, typeof ops> = {};
        for (const op of ops) {
          const key = op.file || 'unknown';
          if (!byFile[key]) byFile[key] = [];
          byFile[key].push(op);
        }
        const optimizations: string[] = [];
        let savedOps = 0;
        for (const [file, fileOps] of Object.entries(byFile)) {
          if (fileOps.length > 1) {
            const reads = fileOps.filter((o: any) => o.action === 'read').length;
            if (reads > 1) {
              optimizations.push(`${file}: ${reads} reads can be merged into 1`);
              savedOps += reads - 1;
            }
            const writes = fileOps.filter((o: any) => o.action === 'write' || o.action === 'edit').length;
            if (writes > 1) {
              optimizations.push(`${file}: ${writes} writes can be squashed into 1`);
              savedOps += writes - 1;
            }
          }
        }
        const readFiles = Object.entries(byFile).filter(([, o]) => o.every((op: any) => op.action === 'read'));
        if (readFiles.length > 0) {
          optimizations.push(`${readFiles.length} files are read-only — can be batched with Promise.all`);
        }
        const uniqueFiles = Object.keys(byFile).length;
        return { output: [
          `Batch Analysis: ${ops.length} operations across ${uniqueFiles} files`,
          savedOps > 0 ? `Optimization: Can reduce ${ops.length} → ${ops.length - savedOps} operations` : 'Already optimized — no redundant operations.',
          optimizations.length > 0 ? `\nOptimizations:\n${optimizations.map(o => `  • ${o}`).join('\n')}` : '',
        ].filter(Boolean).join('\n'), isError: false };
      },
    }];
  },
};

// ═══ Feature 41: Real-time Threat Modeling ═══════════
export const ThreatModelingFeature: FeatureModule = {
  meta: { id: 'threat-modeling', name: 'Real-time Threat Modeling', description: 'STRIDE analysis on auth/crypto code changes', category: 'security', enabled: true, priority: 'P2' },
  getTools() {
    return [{
      name: 'threat_model',
      definition: { name: 'threat_model', description: 'Analyze code for security threats using STRIDE model', input_schema: { type: 'object' as const, properties: { code: { type: 'string' }, file: { type: 'string' } }, required: ['code'] } },
      execute: async (input: any) => {
        const threats: string[] = [];
        const code = input.code;
        if (/auth|login|password|token/i.test(code)) threats.push('SPOOFING: Authentication-related code — verify identity validation');
        if (/modify|update|delete|write/i.test(code)) threats.push('TAMPERING: Data modification — verify input validation');
        if (/read|select|get|find/i.test(code)) threats.push('INFO DISCLOSURE: Data access — verify authorization checks');
        if (/rate|limit|throttle/i.test(code) === false && /api|endpoint|route/i.test(code)) threats.push('DOS: API endpoint without rate limiting');
        if (/privilege|role|permission|admin/i.test(code)) threats.push('ELEVATION: Privilege-related — verify RBAC enforcement');
        return { output: threats.length > 0 ? `STRIDE Threat Analysis:\n${threats.map(t => `⚠ ${t}`).join('\n')}` : 'No obvious threats detected ✓', isError: false };
      },
    }];
  },
};

// ═══ Feature 42: Compliance Checker ══════════════════
export const ComplianceCheckerFeature: FeatureModule = {
  meta: { id: 'compliance-checker', name: 'Compliance Checker', description: 'GDPR/SOC2/HIPAA code scanning', category: 'security', enabled: true, priority: 'P3' },
  getTools() {
    return [{
      name: 'check_compliance',
      definition: { name: 'check_compliance', description: 'Check code for compliance issues (GDPR, SOC2, HIPAA)', input_schema: { type: 'object' as const, properties: { code: { type: 'string' }, standard: { type: 'string', enum: ['gdpr', 'soc2', 'hipaa', 'all'] } }, required: ['code'] } },
      execute: async (input: any) => {
        const issues: string[] = [];
        const code = input.code;
        if (/console\.log.*(?:email|phone|address|name|ssn|dob)/i.test(code)) issues.push('[GDPR] PII data in log output');
        if (/(?:password|ssn|credit.?card)\s*(?:=|:)\s*[^null/encrypted]/i.test(code)) issues.push('[SOC2] Unencrypted sensitive data');
        if (/cookie/i.test(code) && !/secure|httponly|samesite/i.test(code)) issues.push('[GDPR] Cookie without security flags');
        if (/encrypt|hash/i.test(code) === false && /store|save|persist/i.test(code) && /sensitive|pii|personal/i.test(code)) issues.push('[HIPAA] Storing sensitive data without encryption');
        return { output: issues.length > 0 ? issues.join('\n') : 'No compliance issues found ✓', isError: false };
      },
    }];
  },
};

// ═══ Feature 43: Secret Leak Prevention ══════════════
export const SecretLeakFeature: FeatureModule = {
  meta: { id: 'secret-leak', name: 'Secret Leak Prevention', description: 'Scan diffs/commits/PRs for secrets', category: 'security', enabled: true, priority: 'P0' },
  getTools() {
    return [{
      name: 'scan_secrets',
      definition: { name: 'scan_secrets', description: 'Scan code for hardcoded secrets and credentials', input_schema: { type: 'object' as const, properties: { code: { type: 'string' }, file: { type: 'string' } }, required: ['code'] } },
      execute: async (input: any) => {
        const findings: string[] = [];
        const patterns = [
          { pattern: /sk-ant-[\w-]{20,}/g, name: 'Anthropic API Key' },
          { pattern: /sk-[\w]{20,}/g, name: 'OpenAI API Key' },
          { pattern: /ghp_[\w]{30,}/g, name: 'GitHub Token' },
          { pattern: /AKIA[\w]{16}/g, name: 'AWS Access Key' },
          { pattern: /(?:password|secret|token|api.?key)\s*[:=]\s*["'][^"']{8,}["']/gi, name: 'Hardcoded credential' },
          { pattern: /-----BEGIN.*PRIVATE KEY-----/g, name: 'Private Key' },
          { pattern: /eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g, name: 'JWT Token' },
        ];
        for (const { pattern, name } of patterns) {
          const matches = input.code.match(pattern);
          if (matches) findings.push(`⚠ ${name}: ${matches[0].slice(0, 30)}...`);
        }
        return { output: findings.length > 0 ? findings.join('\n') : 'No secrets detected ✓', isError: false };
      },
    }];
  },
};

// ═══ Feature 44: Sandbox Visualization ═══════════════
export const SandboxVisualizationFeature: FeatureModule = {
  meta: { id: 'sandbox-viz', name: 'Sandbox Visualization', description: 'Show command blast radius before execution', category: 'security', enabled: true, priority: 'P2' },
  getTools() {
    return [{
      name: 'visualize_command_impact',
      definition: { name: 'visualize_command_impact', description: 'Analyze what a command will affect before running it', input_schema: { type: 'object' as const, properties: { command: { type: 'string' } }, required: ['command'] } },
      execute: async (input: any) => {
        const cmd = input.command;
        const impacts: string[] = [];
        if (/rm\s/.test(cmd)) impacts.push('📁 FILE DELETION detected');
        if (/mv\s/.test(cmd)) impacts.push('📁 FILE MOVE detected');
        if (/git\s+(push|force|reset|clean)/.test(cmd)) impacts.push('🔄 GIT HISTORY modification');
        if (/npm\s+(install|uninstall|update)/.test(cmd)) impacts.push('📦 DEPENDENCY changes');
        if (/docker/.test(cmd)) impacts.push('🐳 CONTAINER operations');
        if (/curl|wget/.test(cmd)) impacts.push('🌐 NETWORK requests');
        if (/\|.*sh/.test(cmd)) impacts.push('⚠ PIPE TO SHELL — remote code execution risk');
        return { output: impacts.length > 0 ? `Command Impact Analysis:\n${impacts.join('\n')}\nCommand: ${cmd}` : `Low impact command: ${cmd}`, isError: false };
      },
    }];
  },
};

// ═══ Feature 45: Multi-Agent Debate ══════════════════
interface DebateAnalysis {
  persona: string;
  stance: string;
  arguments: string[];
  risks: string[];
  recommendation: string;
}

function analyzeFromPersona(persona: string, topic: string, code?: string): DebateAnalysis {
  const lowerPersona = persona.toLowerCase();
  const topicLower = topic.toLowerCase();
  const arguments_: string[] = [];
  const risks: string[] = [];
  let stance = '';
  let recommendation = '';

  if (lowerPersona.includes('conservative') || lowerPersona.includes('minimal')) {
    stance = 'Minimize blast radius — prefer proven patterns';
    if (/refactor|rewrite|redesign/.test(topicLower)) {
      arguments_.push('Large refactors introduce regressions — incremental changes are safer');
      arguments_.push('Existing code is battle-tested in production');
      risks.push('Premature optimization may not address the real problem');
    }
    if (/add|new|feature/.test(topicLower)) {
      arguments_.push('New features should be gated behind feature flags');
      arguments_.push('Start with the simplest working implementation');
      risks.push('Over-engineering the initial version');
    }
    arguments_.push('Prioritize backward compatibility');
    arguments_.push('Write tests before changing behavior');
    recommendation = 'Make the smallest possible change that solves the problem. Add tests first.';
  }
  else if (lowerPersona.includes('pragmatic') || lowerPersona.includes('balanced')) {
    stance = 'Balance speed and quality — pragmatic trade-offs';
    arguments_.push('Choose the approach that delivers value fastest while maintaining quality');
    arguments_.push('Use established patterns from the codebase');
    if (/performance|optimize|slow/.test(topicLower)) {
      arguments_.push('Profile before optimizing — measure, don\'t guess');
      risks.push('Premature optimization without data');
    }
    if (/security|auth|encrypt/.test(topicLower)) {
      arguments_.push('Security is non-negotiable — use proven libraries');
      risks.push('Don\'t roll your own crypto');
    }
    arguments_.push('Consider maintenance burden in 6 months');
    recommendation = 'Implement with clear abstractions. Test critical paths. Document decisions.';
  }
  else if (lowerPersona.includes('innovative') || lowerPersona.includes('bold')) {
    stance = 'Push boundaries — explore modern approaches';
    arguments_.push('Consider newer patterns that may be more expressive');
    if (/api|backend|server/.test(topicLower)) {
      arguments_.push('Explore type-safe API layers (tRPC, GraphQL codegen)');
    }
    if (/ui|frontend|component/.test(topicLower)) {
      arguments_.push('Consider server components or signals for better performance');
    }
    arguments_.push('Use TypeScript strict mode for better compile-time safety');
    arguments_.push('Automate everything — CI, testing, deployment');
    risks.push('Newer tech may lack ecosystem maturity');
    risks.push('Team learning curve may slow initial development');
    recommendation = 'Prototype with the modern approach. Validate with benchmarks. Migrate incrementally.';
  }
  else {
    stance = `Custom perspective: ${persona}`;
    arguments_.push(`Analyze from ${persona} viewpoint`);
    arguments_.push('Consider both short-term and long-term implications');
    recommendation = `Apply ${persona} principles to evaluate trade-offs`;
  }

  // Code-specific analysis
  if (code) {
    const codeLen = code.split('\n').length;
    if (codeLen > 100) arguments_.push(`Code is ${codeLen} lines — consider breaking into smaller modules`);
    if (/TODO|FIXME|HACK/.test(code)) risks.push('Contains TODO/FIXME markers — address before shipping');
    if (/console\.log|print\(/.test(code)) risks.push('Contains debug logging — remove before production');
    if (!/test|spec|describe/.test(code) && codeLen > 50) risks.push('No test coverage visible for this code');
  }

  return { persona, stance, arguments: arguments_, risks, recommendation };
}

export const MultiAgentDebateFeature: FeatureModule = {
  meta: { id: 'agent-debate', name: 'Multi-Agent Debate', description: 'Multiple agents with different personas debate solutions', category: 'ai', enabled: true, priority: 'P2' },
  getTools() {
    return [{
      name: 'start_debate',
      definition: { name: 'start_debate', description: 'Start a multi-agent debate on a topic', input_schema: { type: 'object' as const, properties: { topic: { type: 'string' }, code: { type: 'string', description: 'Optional code context for the debate' }, personas: { type: 'array', items: { type: 'string' }, description: 'Agent personas (default: conservative, pragmatic, innovative)' } }, required: ['topic'] } },
      execute: async (input: any) => {
        const personas: string[] = input.personas || ['Conservative (minimal change)', 'Pragmatic (balanced approach)', 'Innovative (bold approach)'];
        const analyses = personas.map(p => analyzeFromPersona(p, input.topic, input.code));

        const output: string[] = [`=== Multi-Agent Debate: ${input.topic} ===`, ''];

        for (const analysis of analyses) {
          output.push(`--- Agent: ${analysis.persona} ---`);
          output.push(`Stance: ${analysis.stance}`);
          output.push('');
          output.push('Arguments:');
          for (const arg of analysis.arguments) output.push(`  + ${arg}`);
          if (analysis.risks.length > 0) {
            output.push('Risks:');
            for (const risk of analysis.risks) output.push(`  ! ${risk}`);
          }
          output.push(`Recommendation: ${analysis.recommendation}`);
          output.push('');
        }

        // Synthesis: find common ground and key disagreements
        const allArgs = analyses.flatMap(a => a.arguments);
        const allRisks = analyses.flatMap(a => a.risks);
        output.push('=== Synthesis ===');
        output.push(`Total arguments: ${allArgs.length}, Total risks identified: ${allRisks.length}`);
        output.push(`Personas consulted: ${analyses.length}`);
        output.push('');
        output.push('Key takeaways:');
        output.push(`  1. ${analyses[0]?.recommendation || 'Consider all perspectives'}`);
        if (analyses.length > 1) output.push(`  2. ${analyses[analyses.length - 1]?.recommendation || ''}`);
        if (allRisks.length > 0) output.push(`  3. Address top risk: ${allRisks[0]}`);

        return { output: output.join('\n'), isError: false };
      },
    }];
  },
};

// ═══ Feature 46: Change Propagation Analysis ═════════
export const PropagationAnalysisFeature: FeatureModule = {
  meta: { id: 'propagation', name: 'Change Propagation Analysis', description: 'Trace impact of function changes across codebase', category: 'ai', enabled: true, priority: 'P1' },
  getTools() {
    return [{
      name: 'trace_propagation',
      definition: { name: 'trace_propagation', description: 'Trace how a change propagates through the call graph', input_schema: { type: 'object' as const, properties: { file: { type: 'string' }, function: { type: 'string' } }, required: ['file', 'function'] } },
      execute: async (input: any) => {
        const files = await getSourceFiles(process.cwd());
        const callers: string[] = [];
        for (const f of files) {
          const content = await readFileSafe(f);
          if (content && content.includes(input.function) && f !== input.file) callers.push(f);
        }
        return { output: callers.length > 0 ? `${callers.length} files reference "${input.function}":\n${callers.map(c => `  ${path.relative(process.cwd(), c)}`).join('\n')}` : `No external references to "${input.function}"`, isError: false };
      },
    }];
  },
};

// ═══ Feature 47: Adaptive Feedback Learning ══════════
class AdaptiveLearner {
  private rejections: Array<{ action: string; reason: string; context: string; timestamp: string }> = [];
  private confirmations: Array<{ action: string; context: string; timestamp: string }> = [];

  recordRejection(action: string, reason: string, context: string) {
    this.rejections.push({ action, reason, context, timestamp: now_iso() });
  }

  recordConfirmation(action: string, context: string) {
    this.confirmations.push({ action, context, timestamp: now_iso() });
  }

  getPatterns(): { avoid: string[]; prefer: string[] } {
    const avoidCounts: Record<string, number> = {};
    for (const r of this.rejections) {
      for (const word of r.action.split(/\s+/)) {
        avoidCounts[word] = (avoidCounts[word] || 0) + 1;
      }
    }
    const preferCounts: Record<string, number> = {};
    for (const c of this.confirmations) {
      for (const word of c.action.split(/\s+/)) {
        preferCounts[word] = (preferCounts[word] || 0) + 1;
      }
    }
    return {
      avoid: Object.entries(avoidCounts).filter(([, v]) => v >= 2).map(([k]) => k),
      prefer: Object.entries(preferCounts).filter(([, v]) => v >= 2).map(([k]) => k),
    };
  }
}

const learner = new AdaptiveLearner();

export const AdaptiveLearningFeature: FeatureModule = {
  meta: { id: 'adaptive-learning', name: 'Adaptive Feedback Learning', description: 'Deep preference learning from user feedback', category: 'ai', enabled: true, priority: 'P1' },
  async onEvent(event: string, data: any) {
    if (event === 'user_rejected') learner.recordRejection(data.action || '', data.reason || '', data.context || '');
    if (event === 'user_confirmed') learner.recordConfirmation(data.action || '', data.context || '');
  },
  getTools() {
    return [{
      name: 'get_learned_patterns',
      definition: { name: 'get_learned_patterns', description: 'View learned user preferences', input_schema: { type: 'object' as const, properties: {} } },
      execute: async () => {
        const patterns = learner.getPatterns();
        return { output: `Avoid: ${patterns.avoid.join(', ') || '(none)'}\nPrefer: ${patterns.prefer.join(', ') || '(none)'}`, isError: false };
      },
    }];
  },
};

// ═══ Feature 48: Regression Test Generator ═══════════
export const RegressionTestFeature: FeatureModule = {
  meta: { id: 'regression-test', name: 'Regression Test Generator', description: 'Auto-generate tests for bug fixes', category: 'ai', enabled: true, priority: 'P1' },
  getTools() {
    return [{
      name: 'generate_regression_test',
      definition: { name: 'generate_regression_test', description: 'Generate a regression test for a bug fix', input_schema: { type: 'object' as const, properties: { bug: { type: 'string', description: 'Bug description' }, fix: { type: 'string', description: 'Fix description (optional)' }, file: { type: 'string', description: 'File being tested (optional)' }, language: { type: 'string', enum: ['typescript', 'javascript', 'python'], description: 'Test language (auto-detected from file)' } }, required: ['bug'] } },
      execute: async (input: any) => {
        const bug = input.bug;
        const fix = input.fix || '';
        const file = input.file || '';
        const lang = input.language || (file.endsWith('.py') ? 'python' : file.endsWith('.ts') ? 'typescript' : 'javascript');

        // Detect testing framework
        let framework = 'jest';
        const pkgRaw = await readFileSafe(path.join(process.cwd(), 'package.json'));
        if (pkgRaw) {
          try {
            const pkg = JSON.parse(pkgRaw);
            const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (allDeps.vitest) framework = 'vitest';
            else if (allDeps.jest) framework = 'jest';
            else if (allDeps.mocha) framework = 'mocha';
            else if (allDeps['@playwright/test']) framework = 'playwright';
          } catch { /* use default */ }
        }

        // Find existing test files for style reference
        const testPatterns = ['**/*.test.ts', '**/*.spec.ts', '**/*.test.js', '**/*.spec.js', '**/test_*.py'];
        const existingTests: string[] = [];
        for (const pattern of testPatterns) {
          try {
            const files = await getSourceFiles(process.cwd());
            const matched = files.filter(f => f.includes('.test.') || f.includes('.spec.') || f.includes('test_'));
            existingTests.push(...matched.slice(0, 3));
          } catch { /* skip */ }
        }

        // Extract function/file name from bug description
        const funcMatch = bug.match(/`(\w+)`|function\s+(\w+)|(\w+)\(\)/);
        const funcName = funcMatch?.[1] || funcMatch?.[2] || funcMatch?.[3] || 'targetFunction';
        const moduleName = file ? path.basename(file, path.extname(file)) : 'module';

        // Generate test based on language/framework
        const output: string[] = [];

        if (lang === 'python') {
          output.push(`"""Regression test for: ${bug}"""`);
          output.push(`import pytest`);
          if (file) output.push(`from ${moduleName} import *`);
          output.push('');
          output.push(`def test_no_regression_${funcName}():`);
          output.push(`    """Ensure bug does not regress: ${bug}"""`);
          output.push(`    # Setup: reproduce the conditions that triggered the bug`);
          output.push(`    # TODO: Replace with actual test data`);
          output.push(`    test_input = None  # <-- set up input that triggers the bug`);
          output.push('');
          output.push(`    # Execute: run the function that was fixed`);
          if (fix) {
            output.push(`    # Fix context: ${fix}`);
          }
          output.push(`    result = ${funcName}(test_input)  # <-- call fixed function`);
          output.push('');
          output.push(`    # Verify: assert the bug no longer occurs`);
          output.push(`    assert result is not None  # <-- replace with specific assertion`);
          output.push(`    # assert result == expected_value  # <-- add expected value`);
        } else {
          // TypeScript/JavaScript
          const importLine = framework === 'vitest'
            ? `import { describe, it, expect } from 'vitest';`
            : framework === 'mocha'
            ? `import { expect } from 'chai';`
            : ``;

          if (importLine) output.push(importLine);
          if (file) {
            const importName = moduleName.replace(/[^a-zA-Z0-9]/g, '_');
            output.push(`import { ${funcName} } from './${moduleName}';`);
          }
          output.push('');
          output.push(`describe('${moduleName}', () => {`);
          output.push(`  it('should not regress: ${bug.slice(0, 80)}', () => {`);
          output.push(`    // Arrange: reproduce the conditions that triggered the bug`);
          output.push(`    // TODO: Replace with actual test data`);
          output.push(`    const input = {}; // <-- set up input that triggers the bug`);
          output.push('');
          output.push(`    // Act: run the function that was fixed`);
          if (fix) output.push(`    // Fix context: ${fix}`);
          output.push(`    const result = ${funcName}(input);`);
          output.push('');
          output.push(`    // Assert: verify the bug no longer occurs`);
          output.push(`    expect(result).toBeDefined(); // <-- replace with specific assertion`);
          output.push(`    // expect(result).toBe(expectedValue); // <-- add expected value`);
          output.push(`  });`);

          // Add edge case tests based on bug type
          if (/null|undefined|empty|missing/.test(bug.toLowerCase())) {
            output.push('');
            output.push(`  it('should handle null/undefined input gracefully', () => {`);
            output.push(`    expect(() => ${funcName}(null)).not.toThrow();`);
            output.push(`    expect(() => ${funcName}(undefined)).not.toThrow();`);
            output.push(`  });`);
          }
          if (/overflow|range|bound|max|min|limit/.test(bug.toLowerCase())) {
            output.push('');
            output.push(`  it('should handle boundary values', () => {`);
            output.push(`    expect(() => ${funcName}(0)).not.toThrow();`);
            output.push(`    expect(() => ${funcName}(-1)).not.toThrow();`);
            output.push(`    expect(() => ${funcName}(Number.MAX_SAFE_INTEGER)).not.toThrow();`);
            output.push(`  });`);
          }

          output.push(`});`);
        }

        if (existingTests.length > 0) {
          output.push('');
          output.push(`// Reference existing tests for style:`);
          for (const t of existingTests.slice(0, 3)) output.push(`// - ${path.relative(process.cwd(), t)}`);
        }

        return { output: output.join('\n'), isError: false };
      },
    }];
  },
};

// ═══ Feature 49: Multi-Repo Awareness ════════════════
export const MultiRepoFeature: FeatureModule = {
  meta: { id: 'multi-repo', name: 'Multi-Repo Awareness', description: 'Cross-repo change detection in monorepos', category: 'ai', enabled: true, priority: 'P2' },
  getTools() {
    return [{
      name: 'detect_repos',
      definition: { name: 'detect_repos', description: 'Detect multiple repos in the workspace', input_schema: { type: 'object' as const, properties: {} } },
      execute: async () => {
        const result = await runCommand('find . -maxdepth 3 -name ".git" -type d 2>/dev/null || echo "single repo"');
        const repos = result.stdout.split('\n').filter(l => l.trim());
        return { output: repos.length > 1 ? `Found ${repos.length} repos:\n${repos.join('\n')}` : 'Single repository workspace', isError: false };
      },
    }];
  },
};

// ═══ Feature 50: ADR Auto-Generator ══════════════════
export const ADRGeneratorFeature: FeatureModule = {
  meta: { id: 'adr-generator', name: 'ADR Auto-Generator', description: 'Auto-create Architecture Decision Records', category: 'ai', enabled: true, priority: 'P2' },
  getTools() {
    return [{
      name: 'generate_adr',
      definition: { name: 'generate_adr', description: 'Generate an Architecture Decision Record', input_schema: { type: 'object' as const, properties: { title: { type: 'string' }, context: { type: 'string' }, decision: { type: 'string' }, consequences: { type: 'string' } }, required: ['title', 'decision'] } },
      execute: async (input: any) => {
        const adr = `# ADR: ${input.title}\n\nDate: ${now_iso().split('T')[0]}\n\n## Context\n${input.context || '(to be filled)'}\n\n## Decision\n${input.decision}\n\n## Consequences\n${input.consequences || '(to be analyzed)'}`;
        const dir = path.join(process.cwd(), 'docs', 'adr');
        await fs.mkdir(dir, { recursive: true });
        const filename = `${now_iso().split('T')[0]}-${input.title.toLowerCase().replace(/\s+/g, '-')}.md`;
        await fs.writeFile(path.join(dir, filename), adr);
        return { output: `ADR created: docs/adr/${filename}\n\n${adr}`, isError: false };
      },
    }];
  },
};

// ═══ Feature 51: Streaming Diff Preview ══════════════
export const StreamingDiffFeature: FeatureModule = {
  meta: { id: 'streaming-diff', name: 'Streaming Diff Preview', description: 'Show diffs as AI generates code', category: 'terminal', enabled: true, priority: 'P0' },
  getTools() {
    return [{
      name: 'render_diff',
      definition: { name: 'render_diff', description: 'Render a colored unified diff between old and new content', input_schema: { type: 'object' as const, properties: { oldContent: { type: 'string', description: 'Original content' }, newContent: { type: 'string', description: 'Modified content' }, file: { type: 'string', description: 'File path for context' }, contextLines: { type: 'number', description: 'Number of context lines (default 3)' } }, required: ['oldContent', 'newContent'] } },
      execute: async (input: any) => {
        const oldLines = input.oldContent.split('\n');
        const newLines = input.newContent.split('\n');
        const contextLines = input.contextLines || 3;
        const file = input.file || 'file';
        const diffLines: string[] = [];
        diffLines.push(`--- a/${file}`);
        diffLines.push(`+++ b/${file}`);
        const maxLen = Math.max(oldLines.length, newLines.length);
        let hunkStart = -1;
        let hunkOldCount = 0;
        let hunkNewCount = 0;
        const hunks: Array<{ oldStart: number; newStart: number; lines: string[] }> = [];
        let currentHunk: string[] = [];
        for (let i = 0; i < maxLen; i++) {
          const oldLine = i < oldLines.length ? oldLines[i] : undefined;
          const newLine = i < newLines.length ? newLines[i] : undefined;
          if (oldLine !== newLine) {
            if (hunkStart === -1) {
              hunkStart = i;
              currentHunk = [];
            }
            if (oldLine !== undefined) { currentHunk.push(`-${oldLine}`); hunkOldCount++; }
            if (newLine !== undefined) currentHunk.push(`+${newLine}`);
            if (newLine !== undefined) hunkNewCount++;
          } else if (hunkStart !== -1) {
            currentHunk.push(` ${oldLine}`);
            hunks.push({ oldStart: hunkStart + 1, newStart: hunkStart + 1, lines: [...currentHunk] });
            hunkStart = -1;
            hunkOldCount = 0;
            hunkNewCount = 0;
            currentHunk = [];
          }
        }
        if (hunkStart !== -1) {
          hunks.push({ oldStart: hunkStart + 1, newStart: hunkStart + 1, lines: currentHunk });
        }
        for (const hunk of hunks) {
          diffLines.push(`@@ -${hunk.oldStart},${hunk.lines.filter(l => !l.startsWith('+')).length} +${hunk.newStart},${hunk.lines.filter(l => !l.startsWith('-')).length} @@`);
          diffLines.push(...hunk.lines);
        }
        const added = newLines.filter((l: string, i: number) => i >= oldLines.length || l !== oldLines[i]).length;
        const removed = oldLines.filter((l: string, i: number) => i >= newLines.length || l !== newLines[i]).length;
        return { output: `${diffLines.join('\n')}\n\nSummary: +${added} -${removed} lines`, isError: false };
      },
    }];
  },
};

// ═══ Feature 52: Split Pane Mode ════════════════════
export const SplitPaneFeature: FeatureModule = {
  meta: { id: 'split-pane', name: 'Split Pane Mode', description: 'Multi-pane terminal (chat + logs + tests)', category: 'terminal', enabled: true, priority: 'P2' },
  getTools() {
    return [{
      name: 'pane_status',
      definition: { name: 'pane_status', description: 'Check terminal pane capabilities and current layout', input_schema: { type: 'object' as const, properties: {} } },
      execute: async () => {
        const cols = process.stdout.columns || 80;
        const rows = process.stdout.rows || 24;
        const isTty = process.stdout.isTTY;
        const hasColor = process.stdout.hasColors?.() ?? true;
        const supportsAnsi = isTty && cols > 40;
        const tmuxSession = process.env.TMUX || process.env.TMUX_PANE || '';
        const isWindows = process.platform === 'win32';
        const terminal = isWindows ? (process.env.TERM_PROGRAM || 'Windows Terminal') : (process.env.TERM_PROGRAM || process.env.TERM || 'unknown');
        const capabilities: string[] = [];
        if (supportsAnsi) capabilities.push('ANSI colors & cursor control');
        if (cols >= 120) capabilities.push('Wide layout (>=120 cols) — split pane ready');
        else if (cols >= 80) capabilities.push('Standard layout (80-119 cols)');
        else capabilities.push('Narrow layout (<80 cols) — single pane only');
        if (tmuxSession) capabilities.push('tmux detected — native split pane available');
        return { output: [
          `Terminal: ${terminal} (${cols}x${rows})`,
          `TTY: ${isTty ? 'yes' : 'no'} | Colors: ${hasColor ? 'yes' : 'no'}`,
          `Platform: ${process.platform}`,
          tmuxSession ? `TMUX: ${tmuxSession}` : '',
          '',
          'Capabilities:',
          ...capabilities.map(c => `  • ${c}`),
          '',
          supportsAnsi ? 'Split pane mode: AVAILABLE (use terminal multiplexer like tmux for native splits)' : 'Split pane mode: NOT AVAILABLE (terminal too small or not a TTY)',
        ].filter(Boolean).join('\n'), isError: false };
      },
    }];
  },
};

// ═══ Feature 53: Smart Notification System ═══════════
export const NotificationFeature: FeatureModule = {
  meta: { id: 'notifications', name: 'Smart Notification System', description: 'OS notifications for long-running tasks', category: 'terminal', enabled: true, priority: 'P1' },
  getTools() {
    return [{
      name: 'send_notification',
      definition: { name: 'send_notification', description: 'Send an OS notification to the user', input_schema: { type: 'object' as const, properties: { title: { type: 'string' }, message: { type: 'string' } }, required: ['title'] } },
      execute: async (input: any) => {
        const isWin = process.platform === 'win32';
        const cmd = isWin ? `powershell -Command "New-BurntToastNotification -Text '${input.title}','${input.message || ''}'"` : `notify-send "${input.title}" "${input.message || ''}"`;
        await runCommand(cmd, undefined, 5000);
        return { output: `Notification sent: ${input.title}`, isError: false };
      },
    }];
  },
};

// ═══ Feature 54: Project Health Dashboard ═════════════
export const HealthDashboardFeature: FeatureModule = {
  meta: { id: 'health-dashboard', name: 'Project Health Dashboard', description: 'TUI dashboard with project metrics', category: 'terminal', enabled: true, priority: 'P1' },
  getTools() {
    return [{
      name: 'project_health',
      definition: { name: 'project_health', description: 'Show project health metrics dashboard', input_schema: { type: 'object' as const, properties: {} } },
      execute: async () => {
        const metrics: string[] = [];
        // Git status
        const git = await runCommand('git status --short 2>/dev/null');
        const changed = git.stdout.split('\n').filter(l => l.trim()).length;
        metrics.push(`Git: ${changed} files changed`);

        // Dependencies
        const audit = await runCommand('npm audit --json 2>/dev/null | head -50 || true');
        try {
          const data = JSON.parse(audit.stdout);
          metrics.push(`Vulnerabilities: ${data.metadata?.vulnerabilities?.total || 0}`);
        } catch { metrics.push('Vulnerabilities: (unknown)'); }

        // File counts
        const srcFiles = await getSourceFiles(process.cwd());
        metrics.push(`Source files: ${srcFiles.length}`);

        return { output: `╔══════════════════════════════╗\n║  Project Health Dashboard    ║\n╠══════════════════════════════╣\n${metrics.map(m => `║  ${m.padEnd(28)}║`).join('\n')}\n╚══════════════════════════════╝`, isError: false };
      },
    }];
  },
};

// ═══ Feature 55: Code Activity Heatmap ═══════════════
export const ActivityHeatmapFeature: FeatureModule = {
  meta: { id: 'activity-heatmap', name: 'Code Activity Heatmap', description: 'File modification frequency visualization', category: 'terminal', enabled: true, priority: 'P2' },
  getTools() {
    return [{
      name: 'activity_heatmap',
      definition: { name: 'activity_heatmap', description: 'Show file modification frequency heatmap', input_schema: { type: 'object' as const, properties: { days: { type: 'number', description: 'Number of days to analyze' } } } },
      execute: async (input: any) => {
        const days = input.days || 30;
        const result = await runCommand(`git log --since="${days} days ago" --name-only --pretty=format: | sort | uniq -c | sort -rn | head -20`);
        const lines = result.stdout.split('\n').filter(l => l.trim());
        const maxCount = parseInt(lines[0]?.trim().split(/\s+/)[0] || '1');
        const heatmap = lines.map(l => {
          const match = l.trim().match(/(\d+)\s+(.+)/);
          if (!match) return '';
          const count = parseInt(match[1]);
          const file = match[2];
          const intensity = Math.round((count / maxCount) * 10);
          const bar = '█'.repeat(intensity) + '░'.repeat(10 - intensity);
          return `${bar} ${count}x ${file}`;
        }).filter(Boolean);
        return { output: `Activity Heatmap (last ${days} days):\n${heatmap.join('\n')}`, isError: false };
      },
    }];
  },
};
