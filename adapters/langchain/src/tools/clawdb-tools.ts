import { z } from 'zod';
import type { ClawDB, MemoryType } from '@clawdb/sdk';

/**
 * Creates an array of LangChain StructuredTool-compatible objects backed by ClawDB.
 *
 * Compatible with LangChain ^0.2 / @langchain/core ^0.2.
 * Uses duck-typing so @langchain/core is a peer dep only.
 */
export function createClawDBTools(client: ClawDB): ClawDBToolDef[] {
  return [
    {
      name: 'clawdb_remember',
      description: 'Store information in ClawDB persistent agent memory for future retrieval.',
      schema: z.object({
        content: z.string().describe('The content to remember'),
        memory_type: z
          .enum(['context', 'task', 'tool_output', 'session', 'reasoning_trace', 'message', 'summary'])
          .optional()
          .describe('Memory type'),
        tags: z.array(z.string()).optional().describe('Tags to attach'),
      }),
      async invoke({ content, memory_type, tags }: { content: string; memory_type?: string; tags?: string[] }) {
        const id = await client.memory.remember(content, {
          memoryType: memory_type as MemoryType | undefined,
          tags,
        });
        return JSON.stringify({ memory_id: id, status: 'stored' });
      },
    },
    {
      name: 'clawdb_search',
      description: 'Search ClawDB agent memory using semantic or keyword search.',
      schema: z.object({
        query: z.string().describe('Search query'),
        top_k: z.number().min(1).max(20).optional().describe('Max results to return'),
      }),
      async invoke({ query, top_k }: { query: string; top_k?: number }) {
        const results = await client.memory.search(query, { topK: top_k ?? 5, semantic: true });
        return JSON.stringify({
          results: results.map(r => ({
            content: r.memory.content,
            score: r.score,
            id: r.memory.id,
            memory_type: r.memory.memoryType,
            tags: r.memory.tags,
          })),
        });
      },
    },
    {
      name: 'clawdb_branch',
      description: 'Manage ClawDB memory branches (fork, merge, diff).',
      schema: z.object({
        action: z.enum(['fork', 'merge', 'diff']).describe('Branch action'),
        name: z.string().describe('Branch name'),
        target: z.string().optional().describe('Target branch for merge/diff'),
        strategy: z.enum(['ours', 'theirs', 'union']).optional().describe('Merge strategy'),
      }),
      async invoke({ action, name, target, strategy }: {
        action: 'fork' | 'merge' | 'diff';
        name: string;
        target?: string;
        strategy?: 'ours' | 'theirs' | 'union';
      }) {
        switch (action) {
          case 'fork': {
            const branch = await client.branches.fork(name);
            return JSON.stringify({ branch_id: branch.id, name: branch.name, status: 'created' });
          }
          case 'merge': {
            const result = await client.branches.merge(name, {
              into: target ?? 'trunk',
              strategy: strategy ?? 'union',
            });
            return JSON.stringify({ applied: result.applied, conflicts: result.conflicts.length });
          }
          case 'diff': {
            const diff = await client.branches.diff(name, target ?? 'trunk');
            return JSON.stringify(diff);
          }
        }
      },
    },
  ];
}

export interface ClawDBToolDef {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  invoke(args: Record<string, unknown>): Promise<string>;
}

/**
 * A VectorStore-like interface for embedding pipeline integration.
 * Bridges ClawDB memory search with LangChain's VectorStore interface.
 */
export class ClawDBMemoryStore {
  constructor(private readonly client: ClawDB) {}

  async similaritySearch(
    query: string,
    k = 5,
    _filter?: Record<string, unknown>
  ): Promise<Array<{ pageContent: string; metadata: Record<string, unknown> }>> {
    const results = await this.client.memory.search(query, { topK: k, semantic: true });
    return results.map(r => ({
      pageContent: r.memory.content,
      metadata: {
        id: r.memory.id,
        score: r.score,
        memoryType: r.memory.memoryType,
        tags: r.memory.tags,
        ...r.memory.metadata,
      },
    }));
  }

  async addDocuments(
    documents: Array<{ pageContent: string; metadata?: Record<string, unknown> }>
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const doc of documents) {
      const id = await this.client.memory.remember(doc.pageContent, {
        metadata: doc.metadata,
      });
      ids.push(id);
    }
    return ids;
  }
}
