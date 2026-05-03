import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clawdbTools } from '../src/tools/index.js';
import { clawdbMiddleware } from '../src/middleware/index.js';

// ──────────────────────────────────────────────────────────────
// Mock ClawDB client
// ──────────────────────────────────────────────────────────────

function makeMockDb() {
  return {
    memory: {
      remember: vi.fn().mockResolvedValue('mem-1'),
      search: vi.fn().mockResolvedValue([
        { memory: { id: 'mem-1', content: 'Vercel test memory', memoryType: 'context' }, score: 0.95 },
      ]),
      recall: vi.fn().mockResolvedValue([{ id: 'mem-1', content: 'Vercel test memory' }]),
      forget: vi.fn().mockResolvedValue(undefined),
    },
    branches: {
      fork: vi.fn().mockResolvedValue({ id: 'br-1', name: 'new-branch' }),
      merge: vi.fn().mockResolvedValue({ applied: 3, conflicts: [] }),
      diff: vi.fn().mockResolvedValue({ added: 1, removed: 0, modified: 2 }),
      list: vi.fn().mockResolvedValue([{ name: 'trunk', status: 'active' }]),
    },
  } as unknown as import('@clawdb/sdk').ClawDB;
}

// ──────────────────────────────────────────────────────────────
// clawdbTools
// ──────────────────────────────────────────────────────────────

describe('clawdbTools', () => {
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => { db = makeMockDb(); });

  it('returns all 4 tools', () => {
    const tools = clawdbTools(db);
    expect(Object.keys(tools)).toEqual(['remember', 'search', 'recall', 'branch']);
  });

  it('remember.execute stores memory and returns memory_id', async () => {
    const tools = clawdbTools(db);
    const result = await tools.remember.execute({ content: 'test content' });
    expect(result.memory_id).toBe('mem-1');
    expect(result.status).toBe('stored');
  });

  it('search.execute returns formatted results', async () => {
    const tools = clawdbTools(db);
    const result = await tools.search.execute({ query: 'test' });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.score).toBe(0.95);
  });

  it('recall.execute returns memories', async () => {
    const tools = clawdbTools(db);
    const result = await tools.recall.execute({ memoryIds: ['mem-1'] });
    expect(result.memories).toHaveLength(1);
  });

  it('branch.execute fork creates a branch', async () => {
    const tools = clawdbTools(db);
    const result = await tools.branch.execute({ action: 'fork', name: 'my-branch' });
    expect(result['name']).toBe('new-branch');
  });

  it('branch.execute list returns branches', async () => {
    const tools = clawdbTools(db);
    const result = await tools.branch.execute({ action: 'list' });
    expect(result['branches']).toHaveLength(1);
  });

  it('all tools have description', () => {
    const tools = clawdbTools(db);
    for (const [, tool] of Object.entries(tools)) {
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('remember parameters schema validates content required', () => {
    const tools = clawdbTools(db);
    expect(tools.remember.parameters.safeParse({ content: 'hi' }).success).toBe(true);
    expect(tools.remember.parameters.safeParse({}).success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────
// clawdbMiddleware
// ──────────────────────────────────────────────────────────────

describe('clawdbMiddleware', () => {
  it('wrapGenerate stores AI text as memory', async () => {
    const db = makeMockDb();
    const middleware = clawdbMiddleware(db);
    const fakeResult = { text: 'AI response text' };
    const doGenerate = vi.fn().mockResolvedValue(fakeResult);

    const result = await middleware.wrapGenerate!({ doGenerate, params: {} });

    expect(result).toBe(fakeResult);
    expect((db.memory.remember as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      'AI response text',
      expect.objectContaining({ memoryType: 'tool_output' })
    );
  });

  it('wrapGenerate does not throw if memory.remember fails', async () => {
    const db = makeMockDb();
    (db.memory.remember as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    const middleware = clawdbMiddleware(db);
    const doGenerate = vi.fn().mockResolvedValue({ text: 'AI output' });

    await expect(
      middleware.wrapGenerate!({ doGenerate, params: {} })
    ).resolves.not.toThrow();
  });

  it('wrapGenerate passes through result when no text', async () => {
    const db = makeMockDb();
    const middleware = clawdbMiddleware(db);
    const result = { finishReason: 'stop' };
    const doGenerate = vi.fn().mockResolvedValue(result);

    const out = await middleware.wrapGenerate!({ doGenerate, params: {} });
    expect(out).toBe(result);
    expect((db.memory.remember as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
