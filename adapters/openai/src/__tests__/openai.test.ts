import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClawDBAgentTools } from '../src/tools/index.js';
import { ClawDBToolHandler } from '../src/handlers/index.js';
import { withClawDBMemory } from '../src/middleware/index.js';

// ──────────────────────────────────────────────────────────────
// Mock ClawDB client
// ──────────────────────────────────────────────────────────────

function makeMockDb() {
  return {
    memory: {
      remember: vi.fn().mockResolvedValue('mem-id-1'),
      search: vi.fn().mockResolvedValue([
        { memory: { id: 'mem-id-1', content: 'Test memory', memoryType: 'context' }, score: 0.9 },
      ]),
      recall: vi.fn().mockResolvedValue([{ id: 'mem-id-1', content: 'Test memory' }]),
      forget: vi.fn().mockResolvedValue(undefined),
    },
    branches: {
      fork: vi.fn().mockResolvedValue({ id: 'br-1', name: 'test-branch' }),
      merge: vi.fn().mockResolvedValue({ applied: 5, conflicts: [] }),
    },
    sync: {
      push: vi.fn().mockResolvedValue({ pushed: 3 }),
      pull: vi.fn().mockResolvedValue({ pulled: 2 }),
      sync: vi.fn().mockResolvedValue({ pushed: 3, pulled: 2, conflicts: 0 }),
    },
  } as unknown as import('@clawdb/sdk').ClawDB;
}

// ──────────────────────────────────────────────────────────────
// createClawDBAgentTools
// ──────────────────────────────────────────────────────────────

describe('createClawDBAgentTools', () => {
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => { db = makeMockDb(); });

  it('returns 4 base tools by default', () => {
    const tools = createClawDBAgentTools(db);
    expect(tools).toHaveLength(4);
    expect(tools.map(t => t.name)).toContain('clawdb_remember');
    expect(tools.map(t => t.name)).toContain('clawdb_search');
    expect(tools.map(t => t.name)).toContain('clawdb_recall');
    expect(tools.map(t => t.name)).toContain('clawdb_forget');
  });

  it('adds branching tools when enableBranching=true', () => {
    const tools = createClawDBAgentTools(db, { enableBranching: true });
    const names = tools.map(t => t.name);
    expect(names).toContain('clawdb_branch_fork');
    expect(names).toContain('clawdb_branch_merge');
  });

  it('adds sync tool when enableSync=true', () => {
    const tools = createClawDBAgentTools(db, { enableSync: true });
    expect(tools.map(t => t.name)).toContain('clawdb_sync');
  });

  it('all tools have type=function', () => {
    const tools = createClawDBAgentTools(db, { enableBranching: true, enableSync: true });
    expect(tools.every(t => t.type === 'function')).toBe(true);
  });

  it('clawdb_remember has content as required parameter', () => {
    const tool = createClawDBAgentTools(db).find(t => t.name === 'clawdb_remember')!;
    expect(tool.parameters.required).toContain('content');
  });

  it('clawdb_search has query as required parameter', () => {
    const tool = createClawDBAgentTools(db).find(t => t.name === 'clawdb_search')!;
    expect(tool.parameters.required).toContain('query');
  });
});

// ──────────────────────────────────────────────────────────────
// ClawDBToolHandler
// ──────────────────────────────────────────────────────────────

describe('ClawDBToolHandler', () => {
  let db: ReturnType<typeof makeMockDb>;
  let handler: ClawDBToolHandler;

  beforeEach(() => {
    db = makeMockDb();
    handler = new ClawDBToolHandler(db);
  });

  it('clawdb_remember returns memory_id', async () => {
    const result = JSON.parse(await handler.handle('clawdb_remember', { content: 'Remember this' }));
    expect(result.memory_id).toBe('mem-id-1');
    expect(result.status).toBe('stored');
  });

  it('clawdb_search returns results array', async () => {
    const result = JSON.parse(await handler.handle('clawdb_search', { query: 'test' }));
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results[0].score).toBe(0.9);
  });

  it('clawdb_recall returns memories', async () => {
    const result = JSON.parse(await handler.handle('clawdb_recall', { memory_ids: ['mem-id-1'] }));
    expect(result.memories).toHaveLength(1);
  });

  it('clawdb_forget returns deleted status', async () => {
    const result = JSON.parse(await handler.handle('clawdb_forget', { memory_id: 'mem-id-1' }));
    expect(result.status).toBe('deleted');
  });

  it('returns error JSON for unknown tool instead of throwing', async () => {
    const result = JSON.parse(await handler.handle('nonexistent_tool', {}));
    expect(result.error).toBe('unknown_tool');
  });

  it('returns error JSON when client throws', async () => {
    (db.memory.remember as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Network failure')
    );
    const result = JSON.parse(await handler.handle('clawdb_remember', { content: 'fail' }));
    expect(result.error).toBe('internal_error');
  });

  it('clawdb_sync push_only calls push', async () => {
    const result = JSON.parse(await handler.handle('clawdb_sync', { push_only: true }));
    expect(result.pushed).toBe(3);
    expect((db.sync.push as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
  });
});

// ──────────────────────────────────────────────────────────────
// withClawDBMemory
// ──────────────────────────────────────────────────────────────

describe('withClawDBMemory', () => {
  it('adds clawdb tools to agent tools array', () => {
    const db = makeMockDb();
    const agent = { tools: [{ type: 'function', name: 'my_tool' }] };
    const wrapped = withClawDBMemory(agent, db);
    expect((wrapped.tools as unknown[]).length).toBeGreaterThan(1);
    expect((wrapped.tools as Array<{ name: string }>).some(t => t.name === 'clawdb_remember')).toBe(true);
  });

  it('preserves existing tools', () => {
    const db = makeMockDb();
    const existingTool = { type: 'function', name: 'custom_tool' };
    const agent = { tools: [existingTool] };
    const wrapped = withClawDBMemory(agent, db);
    expect((wrapped.tools as Array<{ name: string }>).some(t => t.name === 'custom_tool')).toBe(true);
  });
});
