import { describe, expect, it, vi } from 'vitest';
import { clawdbTools, handleClawDBFunctionCall } from '../index.js';

function makeMockDb() {
  return {
    memory: {
      remember: vi.fn().mockResolvedValue('m-1'),
      search: vi.fn().mockResolvedValue([]),
      recall: vi.fn().mockResolvedValue([])
    }
  } as unknown as import('@clawdb/sdk').ClawDB;
}

describe('google genai adapter', () => {
  it('builds required function declarations', () => {
    const tools = clawdbTools(makeMockDb());
    expect(tools.map((t) => t.name)).toEqual(['clawdb_remember', 'clawdb_search', 'clawdb_recall']);
  });

  it('handles remember call', async () => {
    const out = await handleClawDBFunctionCall(makeMockDb(), {
      name: 'clawdb_remember',
      args: { content: 'abc' }
    } as never);
    expect(out.name).toBe('clawdb_remember');
  });
});
