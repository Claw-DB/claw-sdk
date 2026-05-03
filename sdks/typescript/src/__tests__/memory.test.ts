import { ClawDBUnavailableError, ClawDBValidationError } from '@clawdb/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clawdb/proto', () => ({}));

import type { MemoryRecord } from '@clawdb/types';

import { MemoryClient } from '../memory.client';

const session = () => ({
  token: 't',
  agentId: 'a',
  role: 'assistant',
  scopes: [],
  expiresAt: new Date()
});

function record(id: string): MemoryRecord {
  return {
    id,
    agentId: 'a',
    content: 'c',
    memoryType: 'context',
    metadata: {},
    tags: [],
    importanceScore: 0.5,
    isPromoted: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

describe('MemoryClient', () => {
  const request = vi.fn();
  const transport = {
    request,
    stream: vi.fn()
  };
  const execute = <T>(fn: () => Promise<T>) => fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('remember() returns UUID string', async () => {
    request.mockResolvedValue({ memoryId: '6f46d723-1f91-4ad0-8e88-f53ed67ef79b' });
    const client = new MemoryClient(transport, session, execute);

    const id = await client.remember('hello');
    expect(id).toBe('6f46d723-1f91-4ad0-8e88-f53ed67ef79b');
  });

  it('remember() with all options serialises correctly', async () => {
    request.mockResolvedValue({ memoryId: '6f46d723-1f91-4ad0-8e88-f53ed67ef79b' });
    const client = new MemoryClient(transport, session, execute);

    await client.remember('hello', {
      memoryType: 'summary',
      tags: ['x'],
      metadata: { a: 1 },
      ttlDays: 7
    });

    expect(request).toHaveBeenCalledWith('Memory.Remember', expect.objectContaining({
      content: 'hello',
      memoryType: 'summary',
      tags: ['x'],
      metadata: { a: 1 },
      ttlDays: 7
    }));
  });

  it('remember() throws ClawDBValidationError on empty content', async () => {
    const client = new MemoryClient(transport, session, execute);
    await expect(client.remember('   ')).rejects.toBeInstanceOf(ClawDBValidationError);
  });

  it('search() with semantic=true uses vector search path', async () => {
    request.mockResolvedValue({ results: [] });
    const client = new MemoryClient(transport, session, execute);

    await client.search('hello', { semantic: true });
    expect(request).toHaveBeenCalledWith('Memory.Search', expect.objectContaining({ semantic: true }));
  });

  it('search() with semantic=false uses keyword path', async () => {
    request.mockResolvedValue({ results: [] });
    const client = new MemoryClient(transport, session, execute);

    await client.search('hello', { semantic: false });
    expect(request).toHaveBeenCalledWith('Memory.Search', expect.objectContaining({ semantic: false }));
  });

  it('search() with filter serialises MetadataFilter', async () => {
    request.mockResolvedValue({ results: [] });
    const client = new MemoryClient(transport, session, execute);
    const filter = { $and: [{ role: 'planner' }, { tier: 'gold' }] };

    await client.search('hello', { filter });
    expect(request).toHaveBeenCalledWith('Memory.Search', expect.objectContaining({ filter }));
  });

  it('search() throws on topK > 100', async () => {
    const client = new MemoryClient(transport, session, execute);
    await expect(client.search('hello', { topK: 101 })).rejects.toBeInstanceOf(ClawDBValidationError);
  });

  it('recall() returns records for found IDs', async () => {
    request.mockResolvedValue({ memories: [record('6f46d723-1f91-4ad0-8e88-f53ed67ef79b')] });
    const client = new MemoryClient(transport, session, execute);

    const result = await client.recall(['6f46d723-1f91-4ad0-8e88-f53ed67ef79b']);
    expect(result).toHaveLength(1);
  });

  it('recall() omits not-found IDs without error', async () => {
    request.mockResolvedValue({ memories: [record('6f46d723-1f91-4ad0-8e88-f53ed67ef79b')] });
    const client = new MemoryClient(transport, session, execute);

    const result = await client.recall([
      '6f46d723-1f91-4ad0-8e88-f53ed67ef79b',
      '4f3b2892-8fdb-46ad-a891-2f93c96fc830'
    ]);

    expect(result).toHaveLength(1);
  });

  it('recall() validates UUID format on each ID', async () => {
    const client = new MemoryClient(transport, session, execute);
    await expect(client.recall(['not-a-uuid'])).rejects.toBeInstanceOf(ClawDBValidationError);
  });

  it('list() with all options', async () => {
    request.mockResolvedValue({ memories: [record('6f46d723-1f91-4ad0-8e88-f53ed67ef79b')] });
    const client = new MemoryClient(transport, session, execute);

    const result = await client.list({ memoryType: 'task', limit: 10, offset: 2, sortBy: 'created_at' });
    expect(result).toHaveLength(1);
    expect(request).toHaveBeenCalledWith('Memory.List', expect.objectContaining({
      memoryType: 'task',
      limit: 10,
      offset: 2,
      sortBy: 'created_at'
    }));
  });

  it('update() patches only provided fields', async () => {
    request.mockResolvedValue({ memory: record('6f46d723-1f91-4ad0-8e88-f53ed67ef79b') });
    const client = new MemoryClient(transport, session, execute);

    await client.update('6f46d723-1f91-4ad0-8e88-f53ed67ef79b', { tags: ['a'] });
    expect(request).toHaveBeenCalledWith('Memory.Update', expect.objectContaining({ updates: { tags: ['a'] } }));
  });

  it('forget() soft-deletes', async () => {
    request.mockResolvedValue({ ok: true });
    const client = new MemoryClient(transport, session, execute);

    await client.forget('6f46d723-1f91-4ad0-8e88-f53ed67ef79b');
    expect(request).toHaveBeenCalledWith('Memory.Forget', expect.objectContaining({ softDelete: true }));
  });

  it('score() returns all four score components', async () => {
    request.mockResolvedValue({ importance: 0.9, recency: 0.8, confidence: 0.7, composite: 0.85 });
    const client = new MemoryClient(transport, session, execute);

    const scores = await client.score('6f46d723-1f91-4ad0-8e88-f53ed67ef79b');
    expect(scores).toEqual({ importance: 0.9, recency: 0.8, confidence: 0.7, composite: 0.85 });
  });

  it('All methods propagate transport errors as typed ClawDBError', async () => {
    request.mockRejectedValue(new ClawDBUnavailableError('down'));
    const client = new MemoryClient(transport, session, execute);

    await expect(client.search('q')).rejects.toBeInstanceOf(ClawDBUnavailableError);
  });
});
