import { describe, expect, it, vi } from 'vitest';

import { clawdbTools } from '../tools/index.js';
import { clawdbMiddleware } from '../middleware/index.js';

function makeMockDb() {
  return {
    rememberTyped: vi.fn().mockResolvedValue('m-1'),
    search: vi.fn().mockResolvedValue([
      {
        id: 'm-1',
        content: 'stored info',
        score: 0.9,
        memoryType: 'message',
        tags: ['a'],
        metadata: {},
        createdAt: new Date()
      }
    ]),
    recall: vi.fn().mockResolvedValue([{ id: 'm-1' }])
  } as unknown as import('@clawdb/sdk').ClawDB;
}

describe('vercel ai adapter', () => {
  it('returns remember/search/recall tools', () => {
    const tools = clawdbTools(makeMockDb());
    expect(Object.keys(tools)).toEqual(['remember', 'search', 'recall']);
  });

  it('middleware injects memory context into params', async () => {
    const db = makeMockDb();
    const middleware = clawdbMiddleware(db);

    const out = await middleware.transformParams?.({
      messages: [{ role: 'user', content: 'hello' }]
    });

    const messages = out?.messages as Array<Record<string, unknown>>;
    expect(messages[0]?.role).toBe('system');
  });

  it('middleware saves user and assistant text after generate', async () => {
    const db = makeMockDb();
    const middleware = clawdbMiddleware(db);

    const result = await middleware.wrapGenerate?.({
      doGenerate: async () => ({ text: 'assistant says hi' }),
      params: { messages: [{ role: 'user', content: 'hello' }] }
    });

    expect((result as { text: string }).text).toBe('assistant says hi');
    expect(db.rememberTyped).toHaveBeenCalledTimes(2);
  });
});
