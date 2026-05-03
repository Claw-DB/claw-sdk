import { describe, expect, expectTypeOf, it, vi } from 'vitest';

vi.mock('@clawdb/proto', () => ({}));

import { ClawDBEventStream } from '../streaming';
import type { ClawDBEventMap } from '../types';

const session = () => ({
  token: 't',
  agentId: 'a',
  role: 'assistant',
  scopes: [],
  expiresAt: new Date()
});

describe('ClawDBEventStream', () => {
  it('stream() yields typed events', async () => {
    const transport = {
      request: vi.fn(),
      stream: vi.fn(async function* () {
        yield { type: 'memory:added', payload: { memoryId: 'm1', agentId: 'a', memoryType: 'context' } };
      })
    };

    const stream = new ClawDBEventStream(transport, session);
    const events = [] as string[];

    for await (const evt of stream.stream()) {
      events.push(evt.type);
      break;
    }

    expect(events).toEqual(['memory:added']);
  });

  it('on() registers handler and returns unsubscribe', () => {
    const transport = { request: vi.fn(), stream: vi.fn(async function* () {}) };
    const stream = new ClawDBEventStream(transport, session);

    const handler = vi.fn();
    const unsubscribe = stream.on('branch:created', handler);

    // @ts-expect-error internal emit is private, invoked via cast for test
    stream.emit('branch:created', { branchId: 'b', name: 'n' });
    expect(handler).toHaveBeenCalledOnce();

    unsubscribe();
    // @ts-expect-error internal emit is private, invoked via cast for test
    stream.emit('branch:created', { branchId: 'b', name: 'n' });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('once() resolves on next matching event', async () => {
    const transport = { request: vi.fn(), stream: vi.fn(async function* () {}) };
    const stream = new ClawDBEventStream(transport, session);

    const next = stream.once('sync:completed');
    // @ts-expect-error internal emit is private, invoked via cast for test
    stream.emit('sync:completed', { pushed: 1, pulled: 2 });

    await expect(next).resolves.toEqual({ pushed: 1, pulled: 2 });
  });

  it('stream() reconnects on UNAVAILABLE', async () => {
    let called = 0;
    const transport = {
      request: vi.fn(),
      stream: vi.fn(async function* () {
        called += 1;
        if (called === 1) {
          throw Object.assign(new Error('UNAVAILABLE'), { code: 'UNAVAILABLE' });
        }
        yield { type: 'session:expired', payload: {} };
      })
    };

    const stream = new ClawDBEventStream(transport, session);
    const events = [] as string[];

    for await (const evt of stream.stream()) {
      events.push(evt.type);
      break;
    }

    expect(called).toBe(2);
    expect(events).toEqual(['session:expired']);
  });

  it('close() terminates the stream', async () => {
    const transport = {
      request: vi.fn(),
      stream: vi.fn(async function* () {
        yield { type: 'session:expired', payload: {} };
        yield { type: 'session:expired', payload: {} };
      })
    };

    const stream = new ClawDBEventStream(transport, session);
    const collected = [] as string[];

    for await (const evt of stream.stream()) {
      collected.push(evt.type);
      stream.close();
    }

    expect(collected).toHaveLength(1);
  });

  it('Event types are fully type-safe (TypeScript compile test)', () => {
    expectTypeOf<ClawDBEventMap['memory:added']>().toEqualTypeOf<{
      memoryId: string;
      agentId: string;
      memoryType: 'context' | 'task' | 'tool_output' | 'session' | 'reasoning_trace' | 'message' | 'summary';
    }>();
  });
});
