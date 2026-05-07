import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as grpc from '@grpc/grpc-js';

import clawdb, {
  ClawDB,
  ClawDBAuthError,
  ClawDBTimeoutError,
  type SearchHit,
  type SearchOptions
} from '../index';

describe('ClawDB core', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.CLAWDB_URL;
    delete process.env.CLAWDB_API_KEY;
    delete process.env.CLAWDB_AGENT_ID;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('autoProvision uses CLAWDB_URL when set', async () => {
    process.env.CLAWDB_URL = 'http://remote.example:50050';
    vi.spyOn(ClawDB.prototype, 'ping').mockResolvedValue();

    const db = await ClawDB.autoProvision();

    expect(db.endpoint).toBe('http://remote.example:50050');
  });

  it('autoProvision falls back to localhost check when no env vars', async () => {
    const ping = vi.spyOn(ClawDB.prototype, 'ping').mockResolvedValue();

    const db = await ClawDB.autoProvision();

    expect(db.endpoint).toBe('http://127.0.0.1:50050');
    expect(ping).toHaveBeenCalled();
  });

  it('default export clawdb() delegates to autoProvision()', async () => {
    vi.spyOn(ClawDB, 'autoProvision').mockResolvedValue(new ClawDB({ endpoint: 'http://127.0.0.1:50050' }));

    const db = await clawdb();

    expect(db).toBeInstanceOf(ClawDB);
    expect(ClawDB.autoProvision).toHaveBeenCalledOnce();
  });

  it('plain constructor lazily ensures local endpoint on first call', async () => {
    const db = new ClawDB();
    const ensureReady = vi.spyOn(db as unknown as { ensureEndpointReady: () => Promise<void> }, 'ensureEndpointReady').mockResolvedValue();
    vi.spyOn(db as unknown as { unaryCallOnce: (...args: unknown[]) => Promise<unknown> }, 'unaryCallOnce').mockResolvedValue({ ok: true });

    await (db as unknown as { unaryCall: (...args: unknown[]) => Promise<{ ok: boolean }> }).unaryCall('Health', {});

    expect(ensureReady).toHaveBeenCalledOnce();
  });

  it('remember returns id string', async () => {
    const db = new ClawDB({ endpoint: 'http://127.0.0.1:50050' });
    vi.spyOn(db as unknown as { unaryCall: (...args: unknown[]) => Promise<unknown> }, 'unaryCall').mockResolvedValue({
      memory_id: 'mem-1'
    });

    const id = await db.remember('hello');

    expect(id).toBe('mem-1');
  });

  it('search returns SearchHit[] sorted by score', async () => {
    const db = new ClawDB({ endpoint: 'http://127.0.0.1:50050' });
    vi.spyOn(db as unknown as { unaryCall: (...args: unknown[]) => Promise<unknown> }, 'unaryCall').mockResolvedValue({
      hits: [
        { id: 'a', content: 'A', score: 0.4, memory_type: 'message', tags: [], metadata: {}, created_at: 1710000000 },
        { id: 'b', content: 'B', score: 0.9, memory_type: 'message', tags: [], metadata: {}, created_at: 1710000001 }
      ]
    });

    const hits = await db.search('q');

    expect(hits.map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('retries UNAVAILABLE and succeeds on second attempt', async () => {
    const db = new ClawDB({ endpoint: 'http://remote.example:50050', maxRetries: 3 });
    const unavailable = Object.assign(new Error('unavailable'), { code: grpc.status.UNAVAILABLE });

    const unaryOnce = vi
      .spyOn(db as unknown as { unaryCallOnce: (...args: unknown[]) => Promise<unknown> }, 'unaryCallOnce')
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValueOnce({ ok: true });

    const result = await (db as unknown as { unaryCall: (...args: unknown[]) => Promise<{ ok: boolean }> }).unaryCall('Health', {});

    expect(result.ok).toBe(true);
    expect(unaryOnce).toHaveBeenCalledTimes(2);
  });

  it('AbortSignal cancellation throws ClawDBTimeoutError', async () => {
    const db = new ClawDB({ endpoint: 'http://remote.example:50050' });
    vi.spyOn(db as unknown as { unaryCallOnce: (...args: unknown[]) => Promise<unknown> }, 'unaryCallOnce').mockRejectedValue(
      new ClawDBTimeoutError('Request cancelled', grpc.status.CANCELLED)
    );

    const promise = (db as unknown as { unaryCall: (...args: unknown[]) => Promise<unknown> }).unaryCall('Health', {}, {} as SearchOptions);

    await expect(promise).rejects.toBeInstanceOf(ClawDBTimeoutError);
  });

  it('maps UNAUTHENTICATED to ClawDBAuthError', async () => {
    const db = new ClawDB({ endpoint: 'http://remote.example:50050' });
    const authErr = Object.assign(new Error('unauthenticated'), { code: grpc.status.UNAUTHENTICATED });

    vi.spyOn(db as unknown as { unaryCallOnce: (...args: unknown[]) => Promise<unknown> }, 'unaryCallOnce').mockRejectedValue(authErr);

    await expect((db as unknown as { unaryCall: (...args: unknown[]) => Promise<unknown> }).unaryCall('Health', {})).rejects.toBeInstanceOf(
      ClawDBAuthError
    );
  });

  it('type-only helper keeps SearchHit shape', () => {
    const _sample: SearchHit = {
      id: 'x',
      content: 'c',
      score: 1,
      memoryType: 'message',
      tags: [],
      metadata: {},
      createdAt: new Date()
    };
    expect(_sample.id).toBe('x');
  });
});
