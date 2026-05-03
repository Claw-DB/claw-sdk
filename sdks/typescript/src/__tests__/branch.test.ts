import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clawdb/proto', () => ({}));

import { BranchClient } from '../branch.client';

const session = () => ({
  token: 't',
  agentId: 'a',
  role: 'assistant',
  scopes: [],
  expiresAt: new Date()
});

describe('BranchClient', () => {
  const request = vi.fn();
  const transport = {
    request,
    stream: vi.fn()
  };
  const execute = <T>(fn: () => Promise<T>) => fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fork() with name only uses trunk as parent', async () => {
    request.mockResolvedValue({
      branch: { id: '1', name: 'test', status: 'active', parentId: 'trunk', createdAt: new Date(), divergenceScore: 0 }
    });
    const client = new BranchClient(transport, session, execute);

    await client.fork('test');
    expect(request).toHaveBeenCalledWith('Branch.Fork', expect.objectContaining({ parent: 'trunk' }));
  });

  it('fork() with explicit parent', async () => {
    request.mockResolvedValue({
      branch: { id: '1', name: 'test', status: 'active', parentId: 'main', createdAt: new Date(), divergenceScore: 0 }
    });
    const client = new BranchClient(transport, session, execute);

    await client.fork('test', { parent: 'main' });
    expect(request).toHaveBeenCalledWith('Branch.Fork', expect.objectContaining({ parent: 'main' }));
  });

  it('diff() returns DiffResult with all fields', async () => {
    request.mockResolvedValue({ added: 1, removed: 2, modified: 3, divergenceScore: 0.4, entityDiffs: [] });
    const client = new BranchClient(transport, session, execute);

    const result = await client.diff('a', 'b');
    expect(result).toEqual({ added: 1, removed: 2, modified: 3, divergenceScore: 0.4, entityDiffs: [] });
  });

  it('merge() with strategy option', async () => {
    request.mockResolvedValue({ applied: 5, conflicts: [], success: true });
    const client = new BranchClient(transport, session, execute);

    await client.merge('source', { into: 'target', strategy: 'ours' });
    expect(request).toHaveBeenCalledWith('Branch.Merge', expect.objectContaining({ strategy: 'ours' }));
  });

  it('simulate() forks, runs fn, evaluates, discards', async () => {
    request
      .mockResolvedValueOnce({
        branch: { id: 'sandbox', name: 's', status: 'active', parentId: 'trunk', createdAt: new Date(), divergenceScore: 0 }
      })
      .mockResolvedValueOnce({ added: 2, removed: 0, modified: 1, divergenceScore: 0.1, entityDiffs: [] })
      .mockResolvedValueOnce({ ok: true });

    const client = new BranchClient(transport, session, execute, () => ({ ok: true }));
    const result = await client.simulate('feature', async () => 'done');

    expect(result.result).toBe('done');
    expect(result.evaluation.recommendation).toBe('commit');
    expect(request).toHaveBeenCalledWith('Branch.Discard', expect.objectContaining({ nameOrId: 'sandbox' }));
  });

  it('simulate() discards even if fn throws', async () => {
    request
      .mockResolvedValueOnce({
        branch: { id: 'sandbox', name: 's', status: 'active', parentId: 'trunk', createdAt: new Date(), divergenceScore: 0 }
      })
      .mockResolvedValueOnce({ ok: true });

    const client = new BranchClient(transport, session, execute, () => ({}));

    await expect(client.simulate('feature', async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');

    expect(request).toHaveBeenCalledWith('Branch.Discard', expect.objectContaining({ nameOrId: 'sandbox' }));
  });

  it('list() with status filter', async () => {
    request.mockResolvedValue({ branches: [] });
    const client = new BranchClient(transport, session, execute);

    await client.list({ status: 'merged' });
    expect(request).toHaveBeenCalledWith('Branch.List', expect.objectContaining({ status: 'merged' }));
  });

  it('discard() calls correct RPC', async () => {
    request.mockResolvedValue({ ok: true });
    const client = new BranchClient(transport, session, execute);

    await client.discard('x');
    expect(request).toHaveBeenCalledWith('Branch.Discard', expect.any(Object));
  });

  it('archive() calls correct RPC', async () => {
    request.mockResolvedValue({ ok: true });
    const client = new BranchClient(transport, session, execute);

    await client.archive('x');
    expect(request).toHaveBeenCalledWith('Branch.Archive', expect.any(Object));
  });

  it('get() by name vs by UUID', async () => {
    request
      .mockResolvedValueOnce({ branch: { id: '1', name: 'main', status: 'active', parentId: null, createdAt: new Date(), divergenceScore: 0 } })
      .mockResolvedValueOnce({ branch: { id: '2', name: 'feature', status: 'active', parentId: '1', createdAt: new Date(), divergenceScore: 0 } });

    const client = new BranchClient(transport, session, execute);

    const byName = await client.get('main');
    const byId = await client.get('550e8400-e29b-41d4-a716-446655440000');

    expect(byName.name).toBe('main');
    expect(byId.id).toBe('2');
  });
});
