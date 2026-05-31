// ── Features System Tests ─────────────────────────────
import { describe, it, expect } from 'vitest';
import { createFeatureRegistry } from '../features';
import { FeatureRegistry } from '../features/registry';

describe('FeatureRegistry', () => {
  it('registers all 55 features', () => {
    const registry = createFeatureRegistry();
    const all = registry.getAll();
    expect(all.length).toBe(55);
  });

  it('all features have valid metadata', () => {
    const registry = createFeatureRegistry();
    for (const f of registry.getAll()) {
      expect(f.meta.id).toBeTruthy();
      expect(f.meta.name).toBeTruthy();
      expect(f.meta.description).toBeTruthy();
      expect(['P0', 'P1', 'P2', 'P3']).toContain(f.meta.priority);
      expect(typeof f.meta.enabled).toBe('boolean');
    }
  });

  it('features can be enabled/disabled', () => {
    const registry = createFeatureRegistry();
    const first = registry.getAll()[0];
    registry.setEnabled(first.meta.id, false);
    expect(registry.isEnabled(first.meta.id)).toBe(false);
    registry.setEnabled(first.meta.id, true);
    expect(registry.isEnabled(first.meta.id)).toBe(true);
  });

  it('getEnabled returns only enabled features', () => {
    const registry = createFeatureRegistry();
    const all = registry.getAll();
    const enabled = registry.getEnabled();
    expect(enabled.length).toBe(all.length);
    registry.setEnabled(all[0].meta.id, false);
    expect(registry.getEnabled().length).toBe(all.length - 1);
  });

  it('getAllTools returns tools from enabled features', () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(t.name).toBeTruthy();
      expect(typeof t.execute).toBe('function');
    }
  });
});

describe('Features have non-empty tools', () => {
  const registry = createFeatureRegistry();
  const allFeatures = registry.getAll();

  // These features use onEvent hooks instead of tools (architectural by design)
  const eventOnlyFeatures = new Set(['command-suggester']);

  for (const feature of allFeatures) {
    const tools = feature.getTools ? feature.getTools() : [];
    if (eventOnlyFeatures.has(feature.meta.id)) {
      it(`${feature.meta.id} uses onEvent hook (no tools needed)`, () => {
        expect(typeof feature.onEvent).toBe('function');
      });
    } else {
      it(`${feature.meta.id} has at least one tool`, () => {
        expect(tools.length).toBeGreaterThanOrEqual(1);
      });
    }
  }
});

describe('Feature tool execution', () => {
  it('estimate_cost tool works', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'estimate_cost');
    expect(tool).toBeDefined();
    const result = await tool!.execute({ text: 'Hello world, this is a test message for cost estimation.' });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('Estimated');
  });

  it('analyze_debt tool works', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'analyze_debt');
    expect(tool).toBeDefined();
    const result = await tool!.execute({ path: process.cwd() });
    expect(result.isError).toBe(false);
    expect(typeof result.output).toBe('string');
  });

  it('scan_secrets tool detects API keys', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'scan_secrets');
    expect(tool).toBeDefined();
    const result = await tool!.execute({ code: 'const key = "sk-ant-1234567890abcdef1234567890abcdef";' });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('Anthropic API Key');
  });

  it('scan_secrets tool reports clean code', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'scan_secrets');
    const result = await tool!.execute({ code: 'const x = 1 + 2;' });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('No secrets detected');
  });

  it('threat_model tool analyzes auth code', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'threat_model');
    expect(tool).toBeDefined();
    const result = await tool!.execute({ code: 'app.post("/login", async (req, res) => { const token = jwt.sign(...) });' });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('STRIDE');
  });

  it('detect_input_type tool identifies code', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'detect_input_type');
    expect(tool).toBeDefined();
    const result = await tool!.execute({ input: 'const x = {\n  foo: "bar",\n  baz: 42\n};' });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('code');
  });

  it('visualize_command_impact tool works', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'visualize_command_impact');
    expect(tool).toBeDefined();
    const result = await tool!.execute({ command: 'rm -rf node_modules && git push --force' });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('FILE DELETION');
    expect(result.output).toContain('GIT HISTORY');
  });

  it('check_compliance tool finds GDPR issues', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'check_compliance');
    expect(tool).toBeDefined();
    const result = await tool!.execute({ code: 'console.log("User email:", user.email);', standard: 'gdpr' });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('GDPR');
  });

  it('split_task_by_budget tool works', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'split_task_by_budget');
    expect(tool).toBeDefined();
    const result = await tool!.execute({ task: 'Build a full REST API with authentication, database, tests, and documentation.' });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('Split into');
  });

  it('render_diff tool shows changes', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'render_diff');
    expect(tool).toBeDefined();
    const result = await tool!.execute({ oldContent: 'line1\nline2\nline3', newContent: 'line1\nmodified\nline3' });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('---');
    expect(result.output).toContain('+++');
  });

  it('batch_file_ops tool detects redundant operations', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'batch_file_ops');
    expect(tool).toBeDefined();
    const result = await tool!.execute({
      operations: [
        { file: 'a.ts', action: 'read' },
        { file: 'a.ts', action: 'read' },
        { file: 'a.ts', action: 'write', content: 'new' },
        { file: 'a.ts', action: 'write', content: 'newer' },
      ],
    });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('can be merged');
  });

  it('analyze_context tool works', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'analyze_context');
    expect(tool).toBeDefined();
    const result = await tool!.execute({
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'Help me with code' },
      ],
      maxTokens: 200000,
    });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('Context:');
  });

  it('parallel_diff tool works', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'parallel_diff');
    expect(tool).toBeDefined();
    const result = await tool!.execute({ files: ['nonexistent-file.ts'] });
    expect(result.isError).toBe(false);
  });

  it('pane_status tool works', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'pane_status');
    expect(tool).toBeDefined();
    const result = await tool!.execute({});
    expect(result.isError).toBe(false);
    expect(result.output).toContain('Terminal:');
  });

  it('generate_adr tool creates ADR', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'generate_adr');
    expect(tool).toBeDefined();
    const result = await tool!.execute({ title: 'Use TypeScript', decision: 'Adopt TypeScript for type safety' });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('ADR');
  });

  it('get_learned_patterns tool works', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'get_learned_patterns');
    expect(tool).toBeDefined();
    const result = await tool!.execute({});
    expect(result.isError).toBe(false);
    expect(result.output).toContain('Avoid:');
  });

  it('project_health tool works', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'project_health');
    expect(tool).toBeDefined();
    const result = await tool!.execute({});
    expect(result.isError).toBe(false);
    expect(result.output).toContain('Project Health Dashboard');
  });

  it('activity_heatmap tool works', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'activity_heatmap');
    expect(tool).toBeDefined();
    const result = await tool!.execute({ days: 30 });
    expect(result.isError).toBe(false);
  });

  it('cache_stats tool works', async () => {
    const registry = createFeatureRegistry();
    const tools = registry.getAllTools();
    const tool = tools.find(t => t.name === 'cache_stats');
    expect(tool).toBeDefined();
    const result = await tool!.execute({});
    expect(result.isError).toBe(false);
    expect(result.output).toContain('Cache Hit Rate');
  });
});
