import { describe, expect, it, vi } from 'vitest';

import { ClawDBPlugin, formatMemoryContext, withClawDB } from '../index.js';

function makeDb() {
  return {
    search: vi.fn().mockResolvedValue([{ id: '1', content: 'User prefers async code patterns.', score: 0.94, memoryType: 'message', tags: [], metadata: {}, createdAt: new Date() }]),
    rememberTyped: vi.fn().mockResolvedValue('m-1'),
    recall: vi.fn().mockResolvedValue([]),
    branch: vi.fn().mockResolvedValue({ branchId: 'b-1', name: 'sandbox' }),
    merge: vi.fn().mockResolvedValue({ success: true, applied: 1, conflicts: 0 }),
    sync: vi.fn().mockResolvedValue({ connected: true }),
    close: vi.fn()
  };
}

describe('openclaw adapter', () => {
  it('formats memory context', () => {
    expect(formatMemoryContext([{ id: '1', content: 'A', score: 0.94, memoryType: 'message', tags: [], metadata: {}, createdAt: new Date() }])).toContain('Relevant memories');
  });

  it('withClawDB appends plugin', () => {
    const agent = { logger: { info: vi.fn() }, plugins: [] };
    withClawDB(agent);
    expect(agent.plugins).toHaveLength(1);
  });

  it('plugin autostores and injects context', async () => {
    const plugin = ClawDBPlugin();
    const db = makeDb();
    const store = new Map<string, unknown>([['clawdb', db]]);
    const ctx = {
      sessionId: 's1',
      set: (key: string, value: unknown) => void store.set(key, value),
      get: <T>(key: string) => store.get(key) as T,
      injectContext: vi.fn()
    };

    await plugin.onMessage?.({ content: 'hello' }, ctx);
    await plugin.onResponse?.({ userMessage: 'u', assistantMessage: 'a' }, ctx);

    expect(ctx.injectContext).toHaveBeenCalled();
    expect(db.rememberTyped).toHaveBeenCalledTimes(2);
  });
});
