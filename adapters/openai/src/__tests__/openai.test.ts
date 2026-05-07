import { describe, expect, it, vi } from 'vitest';

import { createClawDBAgentTools } from '../tools/index.js';
import { ClawDBToolHandler } from '../handlers/index.js';
import { withClawDBMemory } from '../middleware/index.js';

function makeMockDb() {
  return {
    memory: {
      remember: vi.fn().mockResolvedValue('mem-id-1'),
      search: vi.fn().mockResolvedValue([
        {
          id: 'mem-id-1',
          content: 'project preference',
          score: 0.9,
          memoryType: 'message',
          tags: [],
          metadata: {},
          createdAt: new Date()
        }
      ]),
      recall: vi.fn().mockResolvedValue([])
    },
    branches: {
      fork: vi.fn().mockResolvedValue({ id: 'br-1', name: 'branch' }),
      merge: vi.fn().mockResolvedValue({ success: true, applied: 1, conflicts: [] })
    }
  } as unknown as import('@clawdb/sdk').ClawDB;
}

describe('openai adapter', () => {
  it('creates required OpenAI tools', () => {
    const tools = createClawDBAgentTools(makeMockDb(), { enableBranching: true });
    expect(tools.map((t) => t.name)).toEqual([
      'remember_memory',
      'search_memory',
      'recall_memory',
      'fork_branch',
      'merge_branch'
    ]);
  });

  it('handler dispatches remember tool', async () => {
    const handler = new ClawDBToolHandler(makeMockDb());
    const out = JSON.parse(await handler.handle('remember_memory', { content: 'hello' }));
    expect(out.memory_id).toBe('mem-id-1');
  });

  it('wrapper injects memory and stores turn pair', async () => {
    const db = makeMockDb();
    const agent = {
      instructions: 'base system prompt',
      tools: [],
      run: vi.fn().mockResolvedValue('assistant answer')
    };

    const wrapped = withClawDBMemory(agent, db);
    const result = await wrapped.run?.('user message');

    expect(result).toBe('assistant answer');
    expect(db.memory.search).toHaveBeenCalled();
    expect(db.memory.remember).toHaveBeenCalledTimes(2);
  });
});
