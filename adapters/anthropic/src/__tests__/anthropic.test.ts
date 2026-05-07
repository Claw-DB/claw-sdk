import { describe, expect, it, vi } from 'vitest';
import { clawdbTools, handleClawDBToolCall } from '../index.js';

function makeMockDb() {
  return {
    memory: {
      remember: vi.fn().mockResolvedValue('m-1'),
      search: vi.fn().mockResolvedValue([]),
      recall: vi.fn().mockResolvedValue([])
    }
  } as unknown as import('@clawdb/sdk').ClawDB;
}

describe('anthropic adapter', () => {
  it('builds required tools', () => {
    const tools = clawdbTools(makeMockDb());
    expect(tools.map((t) => t.name)).toEqual(['clawdb_remember', 'clawdb_search', 'clawdb_recall']);
  });

  it('handles remember call', async () => {
    const db = makeMockDb();
    const result = await handleClawDBToolCall(db, {
      type: 'tool_use',
      id: 'tool-1',
      name: 'clawdb_remember',
      input: { content: 'abc' }
    } as never);
    expect(result.type).toBe('tool_result');
  });
});
