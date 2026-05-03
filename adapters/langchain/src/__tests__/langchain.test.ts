import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClawDBRetriever } from '../src/retrievers/clawdb-retriever.js';
import { ClawDBChatMessageHistory, HumanMessage, AIMessage } from '../src/memory/clawdb-chat-memory.js';
import { createClawDBTools } from '../src/tools/clawdb-tools.js';

// ──────────────────────────────────────────────────────────────
// Mock ClawDB client
// ──────────────────────────────────────────────────────────────

function makeMockDb(overrides: Partial<{
  search: (...args: unknown[]) => Promise<unknown>;
  remember: (...args: unknown[]) => Promise<string>;
  list: (...args: unknown[]) => Promise<unknown[]>;
  forget: (...args: unknown[]) => Promise<void>;
  fork: (...args: unknown[]) => Promise<unknown>;
  merge: (...args: unknown[]) => Promise<unknown>;
  diff: (...args: unknown[]) => Promise<unknown>;
}> = {}) {
  return {
    memory: {
      search: overrides.search ?? vi.fn().mockResolvedValue([]),
      remember: overrides.remember ?? vi.fn().mockResolvedValue('mem-123'),
      list: overrides.list ?? vi.fn().mockResolvedValue([]),
      forget: overrides.forget ?? vi.fn().mockResolvedValue(undefined),
    },
    branches: {
      fork: overrides.fork ?? vi.fn().mockResolvedValue({ id: 'br-1', name: 'test-branch' }),
      merge: overrides.merge ?? vi.fn().mockResolvedValue({ applied: 3, conflicts: [] }),
      diff: overrides.diff ?? vi.fn().mockResolvedValue({ added: 1, removed: 0, modified: 2 }),
    },
  } as unknown as import('@clawdb/sdk').ClawDB;
}

// ──────────────────────────────────────────────────────────────
// ClawDBRetriever
// ──────────────────────────────────────────────────────────────

describe('ClawDBRetriever', () => {
  it('maps SearchResult to LangChain Document format', async () => {
    const searchResult = {
      memory: {
        id: 'mem-1',
        content: 'Deploy the backend',
        memoryType: 'task',
        tags: ['urgent'],
        importanceScore: 0.9,
        metadata: { project: 'claw' },
        createdAt: new Date(),
      },
      score: 0.87,
    };

    const db = makeMockDb({ search: vi.fn().mockResolvedValue([searchResult]) });
    const retriever = new ClawDBRetriever({ client: db, topK: 5 });
    const docs = await retriever.getRelevantDocuments('Deploy tasks');

    expect(docs).toHaveLength(1);
    expect(docs[0]!.pageContent).toBe('Deploy the backend');
    expect(docs[0]!.metadata['score']).toBe(0.87);
    expect(docs[0]!.metadata['memoryType']).toBe('task');
    expect(docs[0]!.metadata['project']).toBe('claw'); // flattened metadata
  });

  it('passes topK to search', async () => {
    const searchFn = vi.fn().mockResolvedValue([]);
    const db = makeMockDb({ search: searchFn });
    const retriever = new ClawDBRetriever({ client: db, topK: 10 });
    await retriever.getRelevantDocuments('query');
    expect(searchFn).toHaveBeenCalledWith('query', expect.objectContaining({ topK: 10 }));
  });

  it('returns empty array when no results', async () => {
    const db = makeMockDb({ search: vi.fn().mockResolvedValue([]) });
    const retriever = new ClawDBRetriever({ client: db });
    const docs = await retriever.getRelevantDocuments('nothing');
    expect(docs).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────
// ClawDBChatMessageHistory
// ──────────────────────────────────────────────────────────────

describe('ClawDBChatMessageHistory', () => {
  it('addMessage stores with session tag', async () => {
    const rememberFn = vi.fn().mockResolvedValue('mem-1');
    const db = makeMockDb({ remember: rememberFn });
    const history = new ClawDBChatMessageHistory({ client: db, sessionId: 'session-abc' });
    await history.addMessage(new HumanMessage('Hello'));

    expect(rememberFn).toHaveBeenCalledWith('Hello', expect.objectContaining({
      memoryType: 'message',
      tags: expect.arrayContaining(['session:session-abc', 'human']),
    }));
  });

  it('getMessages filters by session tag', async () => {
    const memories = [
      { id: 'm1', content: 'Hi', memoryType: 'message', tags: ['session:s1', 'human'], metadata: { role: 'human' }, createdAt: new Date() },
      { id: 'm2', content: 'Hello back', memoryType: 'message', tags: ['session:s1', 'ai'], metadata: { role: 'ai' }, createdAt: new Date() },
      { id: 'm3', content: 'Other', memoryType: 'message', tags: ['session:s2', 'human'], metadata: { role: 'human' }, createdAt: new Date() },
    ];
    const db = makeMockDb({ list: vi.fn().mockResolvedValue(memories) });
    const history = new ClawDBChatMessageHistory({ client: db, sessionId: 's1' });
    const messages = await history.getMessages();

    expect(messages).toHaveLength(2);
    expect(messages[0]).toBeInstanceOf(HumanMessage);
    expect(messages[1]).toBeInstanceOf(AIMessage);
  });

  it('clear removes all session messages', async () => {
    const memories = [
      { id: 'm1', content: 'Hi', memoryType: 'message', tags: ['session:s1'], metadata: {} },
      { id: 'm2', content: 'World', memoryType: 'message', tags: ['session:s1'], metadata: {} },
    ];
    const forgetFn = vi.fn().mockResolvedValue(undefined);
    const db = makeMockDb({ list: vi.fn().mockResolvedValue(memories), forget: forgetFn });
    const history = new ClawDBChatMessageHistory({ client: db, sessionId: 's1' });
    await history.clear();

    expect(forgetFn).toHaveBeenCalledTimes(2);
  });

  it('addUserMessage and addAIChatMessage work', async () => {
    const rememberFn = vi.fn().mockResolvedValue('x');
    const db = makeMockDb({ remember: rememberFn });
    const history = new ClawDBChatMessageHistory({ client: db });
    await history.addUserMessage('Hello');
    await history.addAIChatMessage('Hi there');

    expect(rememberFn).toHaveBeenCalledTimes(2);
  });
});

// ──────────────────────────────────────────────────────────────
// createClawDBTools — schema validation
// ──────────────────────────────────────────────────────────────

describe('createClawDBTools', () => {
  let db: ReturnType<typeof makeMockDb>;

  beforeEach(() => { db = makeMockDb(); });

  it('returns 3 tools by default', () => {
    const tools = createClawDBTools(db);
    expect(tools).toHaveLength(3);
    expect(tools.map(t => t.name)).toEqual(['clawdb_remember', 'clawdb_search', 'clawdb_branch']);
  });

  it('clawdb_remember schema validates content', () => {
    const tools = createClawDBTools(db);
    const rememberer = tools.find(t => t.name === 'clawdb_remember')!;
    expect(rememberer.schema.safeParse({ content: 'hi' }).success).toBe(true);
    expect(rememberer.schema.safeParse({}).success).toBe(false); // missing content
  });

  it('clawdb_search schema validates query', () => {
    const tools = createClawDBTools(db);
    const searcher = tools.find(t => t.name === 'clawdb_search')!;
    expect(searcher.schema.safeParse({ query: 'test' }).success).toBe(true);
    expect(searcher.schema.safeParse({}).success).toBe(false);
  });

  it('clawdb_remember invoke returns memory_id', async () => {
    const tools = createClawDBTools(db);
    const rememberer = tools.find(t => t.name === 'clawdb_remember')!;
    const result = JSON.parse(await rememberer.invoke({ content: 'test memory' }));
    expect(result.memory_id).toBe('mem-123');
    expect(result.status).toBe('stored');
  });

  it('clawdb_search invoke returns results array', async () => {
    const tools = createClawDBTools(db);
    const searcher = tools.find(t => t.name === 'clawdb_search')!;
    const result = JSON.parse(await searcher.invoke({ query: 'search query' }));
    expect(Array.isArray(result.results)).toBe(true);
  });
});
