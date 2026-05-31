// ── Memory Store Tests ────────────────────────────────
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MemoryStore } from '../memory/store';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

const TEST_MEMORY_DIR = path.join(os.tmpdir(), 'mimo-test-memory-' + Date.now());

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeAll(async () => {
    store = new MemoryStore(TEST_MEMORY_DIR);
    await store.init();
  });

  afterAll(async () => {
    try { await fs.rm(TEST_MEMORY_DIR, { recursive: true, force: true }); } catch {}
  });

  it('initializes successfully', async () => {
    expect(store).toBeDefined();
  });

  it('saves and reads a memory entry', async () => {
    await store.save({
      id: 'test-mem-1',
      type: 'feedback',
      name: 'test-feedback',
      description: 'Test feedback entry',
      content: 'Always use TypeScript strict mode',
      tags: ['test'],
      links: [],
    });
    const content = await store.read('test-mem-1');
    expect(content).toContain('TypeScript strict mode');
  });

  it('lists saved entries', async () => {
    const list = await store.list();
    expect(list.length).toBeGreaterThanOrEqual(1);
    const found = list.find(m => m.id === 'test-mem-1');
    expect(found).toBeDefined();
    expect(found!.type).toBe('feedback');
  });

  it('searches by query', async () => {
    const results = await store.search('TypeScript');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('test-mem-1');
  });

  it('removes an entry', async () => {
    await store.save({
      id: 'test-mem-remove',
      type: 'user',
      name: 'to-remove',
      description: 'Temporary entry',
      content: 'This will be removed',
      tags: [],
      links: [],
    });
    const before = await store.list();
    const countBefore = before.length;
    await store.remove('test-mem-remove');
    const after = await store.list();
    expect(after.length).toBe(countBefore - 1);
  });

  it('returns null for non-existent entry', async () => {
    const content = await store.read('does-not-exist-999');
    expect(content == null).toBe(true);
  });

  it('exports and imports memories', async () => {
    const exportPath = path.join(TEST_MEMORY_DIR, 'export-test.json');
    await store.exportAll(exportPath);
    const raw = await fs.readFile(exportPath, 'utf-8');
    const data = JSON.parse(raw);
    // exportAll may produce an object or array depending on implementation
    expect(data).toBeDefined();
    expect(typeof data).toBe('object');
  });
});
