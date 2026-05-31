// ── RLM Manager Tests ─────────────────────────────────
import { describe, it, expect, afterAll } from 'vitest';
import { RLMManager } from '../rlm/manager';

describe('RLMManager', () => {
  it('initializes and checks Python availability', async () => {
    const manager = new RLMManager();
    await manager.init();
    // availability depends on whether Python is installed
    expect(typeof manager.isAvailable()).toBe('boolean');
  });

  it('lists sessions (empty initially)', async () => {
    const manager = new RLMManager();
    await manager.init();
    const sessions = manager.list();
    expect(Array.isArray(sessions)).toBe(true);
  });

  it('getBuiltinCapabilities returns help text', () => {
    const manager = new RLMManager();
    const help = manager.getBuiltinCapabilities();
    expect(help).toContain('peek');
    expect(help).toContain('search');
    expect(help).toContain('chunk');
    expect(help).toContain('analyze_code');
  });

  it('open throws when Python is not available', async () => {
    const manager = new RLMManager({ pythonPath: 'nonexistent-python-binary-xyz' });
    await manager.init();
    expect(manager.isAvailable()).toBe(false);
    await expect(manager.open()).rejects.toThrow('Python is not available');
  });

  it('closeAll succeeds even with no sessions', async () => {
    const manager = new RLMManager();
    await manager.closeAll();
    expect(manager.list()).toHaveLength(0);
  });
});
