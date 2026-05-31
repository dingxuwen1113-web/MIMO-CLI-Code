// ── Session Rollback Tests ────────────────────────────
import { describe, it, expect, beforeAll } from 'vitest';
import { SessionRollbackManager } from '../session/rollback';

describe('SessionRollbackManager', () => {
  let manager: SessionRollbackManager;

  beforeAll(async () => {
    manager = new SessionRollbackManager('test-session-' + Date.now());
    await manager.init();
  });

  it('initializes with no turns', () => {
    expect(manager.getTurnCount()).toBe(0);
    expect(manager.getTimeline()).toHaveLength(0);
  });

  it('records turns', () => {
    manager.recordTurn({
      userMessage: 'Hello',
      assistantResponse: 'Hi there!',
      filesModified: [],
      toolCalls: [],
      conversationLength: 2,
    });
    expect(manager.getTurnCount()).toBe(1);
  });

  it('records multiple turns', () => {
    manager.recordTurn({
      userMessage: 'Fix the bug',
      assistantResponse: 'Fixed it by changing line 42',
      filesModified: ['src/main.ts'],
      toolCalls: [{ name: 'file_edit', input: '{}', output: 'done', isError: false }],
      conversationLength: 4,
    });
    manager.recordTurn({
      userMessage: 'Run tests',
      assistantResponse: 'All tests passed',
      filesModified: [],
      toolCalls: [{ name: 'shell_exec', input: '{}', output: 'PASS', isError: false }],
      conversationLength: 6,
    });
    expect(manager.getTurnCount()).toBe(3);
  });

  it('gets timeline', () => {
    const timeline = manager.getTimeline();
    expect(timeline.length).toBe(3);
    expect(timeline[0].turnIndex).toBe(0);
    expect(timeline[2].turnIndex).toBe(2);
  });

  it('gets specific turn', () => {
    const turn = manager.getTurn(0);
    expect(turn).not.toBeNull();
    expect(turn!.userMessage).toBe('Hello');
  });

  it('returns null for invalid turn index', () => {
    expect(manager.getTurn(-1)).toBeNull();
    expect(manager.getTurn(999)).toBeNull();
  });

  it('backtracks to last user prompt', () => {
    const before = manager.getTurnCount();
    const removed = manager.backtrackToLastUserPrompt();
    expect(removed).not.toBeNull();
    expect(manager.getTurnCount()).toBe(before - 1);
  });

  it('backtrackToTurn returns null for invalid index', () => {
    expect(manager.backtrackToTurn(-1)).toBeNull();
    expect(manager.backtrackToTurn(999)).toBeNull();
  });

  it('forks at a specific turn', async () => {
    const fork = await manager.forkAtTurn(0, 'Test fork', [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ]);
    expect(fork.forkId).toBeTruthy();
    expect(fork.sourceSessionId).toBeTruthy();
    expect(fork.description).toBe('Test fork');
  });

  it('lists forks', () => {
    const forks = manager.listForks();
    expect(forks.length).toBeGreaterThanOrEqual(1);
  });

  it('loads a fork by ID', async () => {
    const forks = manager.listForks();
    if (forks.length > 0) {
      const loaded = await manager.loadFork(forks[0].forkId);
      expect(loaded).not.toBeNull();
      expect(loaded!.forkId).toBe(forks[0].forkId);
    }
  });

  it('returns null for non-existent fork', async () => {
    const loaded = await manager.loadFork('nonexistent-fork-id');
    expect(loaded).toBeNull();
  });

  it('formatTimeline produces readable output', () => {
    const formatted = manager.formatTimeline(5);
    expect(formatted).toContain('Turn');
    expect(typeof formatted).toBe('string');
  });

  it('getFilesModifiedInTurn returns file list', () => {
    const files = manager.getFilesModifiedInTurn(0);
    expect(Array.isArray(files)).toBe(true);
  });

  it('getCurrentTurnIndex returns correct value', () => {
    const idx = manager.getCurrentTurnIndex();
    expect(idx).toBe(manager.getTurnCount() - 1);
  });
});
