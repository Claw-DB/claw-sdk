'use client';
/**
 * React hook for ClawDB client lifecycle management.
 *
 * Manages connection state, exposes the client, and reconnects on config changes.
 * Requires React 18+ and the `@clawdb/sdk` package.
 *
 * @example
 * ```tsx
 * const { db, status, error } = useClawDB({ endpoint: process.env.NEXT_PUBLIC_CLAWDB_URL });
 * ```
 */

import { useEffect, useRef, useState } from 'react';
import type { ClawDB } from '@clawdb/sdk';

export type ClawDBStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface UseClawDBConfig {
  endpoint?: string;
  apiKey?: string;
  agentId?: string;
}

export interface UseClawDBResult {
  db: ClawDB | null;
  status: ClawDBStatus;
  error: Error | null;
}

export function useClawDB(config: UseClawDBConfig = {}): UseClawDBResult {
  const [db, setDb] = useState<ClawDB | null>(null);
  const [status, setStatus] = useState<ClawDBStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  });

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      setStatus('connecting');
      setError(null);

      try {
        // Dynamic import so Next.js doesn't include the gRPC bundle in the browser
        const { ClawDB: ClawDBClass } = await import('@clawdb/sdk');
        const client = new ClawDBClass({
          endpoint: configRef.current.endpoint,
          apiKey: configRef.current.apiKey,
          agentId: configRef.current.agentId,
        });

        await client.connect();

        if (!cancelled) {
          setDb(client);
          setStatus('connected');
        } else {
          await client.disconnect().catch(() => undefined);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setStatus('error');
        }
      }
    }

    void connect();

    return () => {
      cancelled = true;
      if (db) {
        db.disconnect().catch(() => undefined);
        setDb(null);
        setStatus('idle');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.endpoint, config.apiKey, config.agentId]);

  return { db, status, error };
}
