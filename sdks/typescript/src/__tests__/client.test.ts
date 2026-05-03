import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clawdb/proto', () => ({}));

import type { ClawDBSession } from '@clawdb/types';

import { ClawDB } from '../client';
import { ClawDBConfigResolver } from '../config';
import { MemoryClient } from '../memory.client';
import { SessionClient } from '../session.client';
import { TransportFactory } from '../transport';

describe('ClawDB client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { window?: unknown }).window;
    process.env.CLAWDB_ENDPOINT = '';
    process.env.CLAWDB_API_KEY = '';
    process.env.CLAWDB_AGENT_ID = '';
    process.env.CLAWDB_WORKSPACE = '';
    process.env.CLAWDB_ROLE = '';
    process.env.CLAWDB_TIMEOUT_MS = '';
  });

  it('ClawDB.fromEnv() reads all CLAWDB_* env vars', () => {
    process.env.CLAWDB_ENDPOINT = 'https://api.clawdb.dev';
    process.env.CLAWDB_API_KEY = 'k';
    process.env.CLAWDB_AGENT_ID = 'agent-1';
    process.env.CLAWDB_WORKSPACE = 'ws';
    process.env.CLAWDB_ROLE = 'planner';
    process.env.CLAWDB_TIMEOUT_MS = '1234';

    const db = ClawDB.fromEnv();
    const config = (db as unknown as { config: Record<string, unknown> }).config;

    expect(config.endpoint).toBe('https://api.clawdb.dev');
    expect(config.apiKey).toBe('k');
    expect(config.agentId).toBe('agent-1');
    expect(config.workspace).toBe('ws');
    expect(config.role).toBe('planner');
    expect(config.timeout).toBe(1234);
  });

  it('ClawDB.fromApiKey() sets correct endpoint + auth', () => {
    const db = ClawDB.fromApiKey('secret', 'https://cloud.clawdb.dev');
    const config = (db as unknown as { config: Record<string, unknown> }).config;

    expect(config.apiKey).toBe('secret');
    expect(config.endpoint).toBe('https://cloud.clawdb.dev');
  });

  it('Config precedence: explicit > env > file > defaults', () => {
    process.env.CLAWDB_ENDPOINT = 'https://env';

    vi.spyOn(ClawDBConfigResolver.prototype, 'readConfigFile').mockReturnValue({ endpoint: 'https://file', role: 'from-file' });

    const db = new ClawDB({ endpoint: 'https://explicit' });
    const config = (db as unknown as { config: Record<string, unknown> }).config;

    expect(config.endpoint).toBe('https://explicit');
    expect(config.role).toBe('from-file');
    expect(config.timeout).toBe(30000);
  });

  it('connect() calls CreateSession RPC and stores token', async () => {
    const session: ClawDBSession = {
      token: 't',
      agentId: 'a',
      role: 'assistant',
      scopes: [],
      expiresAt: new Date()
    };

    const createSpy = vi.spyOn(SessionClient.prototype, 'create').mockResolvedValue(session);
    const db = new ClawDB();

    await db.connect();

    expect(createSpy).toHaveBeenCalled();
    expect((db as unknown as { session: ClawDBSession }).session.token).toBe('t');
  });

  it('withSession() disconnects on completion', async () => {
    const db = new ClawDB();
    const connectSpy = vi.spyOn(db, 'connect').mockResolvedValue();
    const disconnectSpy = vi.spyOn(db, 'disconnect').mockResolvedValue();

    await db.withSession(async () => 123);

    expect(connectSpy).toHaveBeenCalledOnce();
    expect(disconnectSpy).toHaveBeenCalledOnce();
  });

  it('withSession() disconnects even if fn throws', async () => {
    const db = new ClawDB();
    vi.spyOn(db, 'connect').mockResolvedValue();
    const disconnectSpy = vi.spyOn(db, 'disconnect').mockResolvedValue();

    await expect(db.withSession(async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');

    expect(disconnectSpy).toHaveBeenCalledOnce();
  });

  it('Lazy getter db.memory returns MemoryClient', () => {
    const db = new ClawDB();
    expect(db.memory).toBeInstanceOf(MemoryClient);
  });

  it('Transport uses gRPC-Web in browser environment (mock window)', () => {
    (globalThis as { window?: unknown; document?: unknown }).window = {};
    (globalThis as { window?: unknown; document?: unknown }).document = {};

    const transport = TransportFactory.create({
      endpoint: 'http://localhost:50050',
      apiKey: '',
      agentId: 'a',
      role: 'assistant',
      workspace: 'w',
      region: 'r',
      timeout: 1000,
      tls: false
    });

    expect((transport as unknown as { mode: string }).mode).toBe('grpc-web');
  });

  it('Retry middleware retries on UNAVAILABLE up to 3 times', async () => {
    const middleware = TransportFactory.createRetryMiddleware({
      endpoint: 'http://localhost:50050',
      apiKey: '',
      agentId: 'a',
      role: 'assistant',
      workspace: 'w',
      region: 'r',
      timeout: 1000,
      tls: false
    });

    const next = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('UNAVAILABLE'), { code: 'UNAVAILABLE' }))
      .mockRejectedValueOnce(Object.assign(new Error('UNAVAILABLE'), { code: 'UNAVAILABLE' }))
      .mockResolvedValue({ ok: true });

    const result = await middleware('Memory.Search', {}, next);

    expect(result).toEqual({ ok: true });
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('Auth middleware adds Authorization header to all requests', async () => {
    const middleware = TransportFactory.createAuthMiddleware(() => ({
      token: 'token-1',
      agentId: 'a',
      role: 'assistant',
      scopes: [],
      expiresAt: new Date()
    }));

    const next = vi.fn().mockResolvedValue({ ok: true });
    await middleware('Memory.List', {}, next);

    const req = next.mock.calls[0][1] as { _meta: { headers: Record<string, string> } };
    expect(req._meta.headers.authorization).toBe('Bearer token-1');
  });
});
