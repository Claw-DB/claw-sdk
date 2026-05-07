import { describe, expect, it, vi } from 'vitest';
import { AIMessage, HumanMessage } from '@langchain/core/messages';

import { ClawDBRetriever } from '../retrievers/clawdb-retriever.js';
import { ClawDBChatMessageHistory } from '../memory/clawdb-chat-memory.js';
import { createClawDBTools } from '../tools/clawdb-tools.js';

function makeMockDb() {
  return {
    memory: {
      remember: vi.fn().mockResolvedValue('m-1'),
      search: vi.fn().mockResolvedValue([
        {
          id: 'm-1',
          content: 'remember this',
          score: 0.9,
          memoryType: 'message',
          tags: ['session:s1'],
          metadata: { role: 'human' },
          createdAt: new Date('2025-01-01T00:00:00Z')
        }
      ]),
      recall: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({
        hits: [
          {
            id: 'm-1',
            content: 'first',
            score: 0.5,
            memoryType: 'message',
            tags: ['session:s1'],
            metadata: { role: 'human' },
            createdAt: new Date('2025-01-01T00:00:00Z')
          },
          {
            id: 'm-2',
            content: 'second',
            score: 0.6,
            memoryType: 'message',
            tags: ['session:s1'],
            metadata: { role: 'ai' },
            createdAt: new Date('2025-01-01T00:00:01Z')
          }
        ]
      })
    }
  } as unknown as import('@clawdb/sdk').ClawDB;
}

describe('langchain adapter', () => {
  it('retriever maps SearchHit to Document', async () => {
    const db = makeMockDb();
    const retriever = new ClawDBRetriever({ client: db, topK: 3 });

    const docs = await retriever.getRelevantDocuments('q');

    expect(docs).toHaveLength(1);
    expect(docs[0]?.pageContent).toBe('remember this');
  });

  it('chat history stores and reads session messages', async () => {
    const db = makeMockDb();
    const history = new ClawDBChatMessageHistory({ client: db, sessionId: 's1' });

    await history.addMessage(new HumanMessage('hello'));
    const messages = await history.getMessages();

    expect(messages).toHaveLength(2);
    expect(messages[0]).toBeInstanceOf(HumanMessage);
    expect(messages[1]).toBeInstanceOf(AIMessage);
  });

  it('tools include remember/search/recall', () => {
    const db = makeMockDb();
    const tools = createClawDBTools(db);

    expect(tools.map((t) => t.name)).toEqual(['clawdb_remember', 'clawdb_search', 'clawdb_recall']);
  });
});
