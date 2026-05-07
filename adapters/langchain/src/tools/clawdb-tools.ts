import { z } from 'zod';
import type { ClawDB } from '@clawdb/sdk';
import { DynamicStructuredTool } from '@langchain/core/tools';

/**
 * Creates an array of LangChain StructuredTool-compatible objects backed by ClawDB.
 *
 * Compatible with LangChain ^0.2 / @langchain/core ^0.2.
 * Uses duck-typing so @langchain/core is a peer dep only.
 */
export function createClawDBTools(client: ClawDB): DynamicStructuredTool[] {
  const tools = [
    new DynamicStructuredTool({
      name: 'clawdb_remember',
      description: 'Store important information that should persist across conversations. Use this for user preferences, decisions, facts, or constraints you may need later.',
      schema: z.object({
        content: z.string().describe('The content to remember'),
        memory_type: z
          .enum(['message', 'context', 'task', 'tool_output', 'session', 'summary'])
          .optional()
          .describe('Memory type'),
        tags: z.array(z.string()).optional().describe('Tags to attach'),
      }),
      func: async ({ content, memory_type, tags }: { content: string; memory_type?: string; tags?: string[] }) => {
        const id = await client.memory.remember(content, {
          memoryType: memory_type,
          tags,
        });
        return JSON.stringify({ memory_id: id, status: 'stored' });
      },
    }),
    new DynamicStructuredTool({
      name: 'clawdb_search',
      description: 'Search long-term memory for facts relevant to the current user request. Prefer this before asking clarifying questions when past context can help.',
      schema: z.object({
        query: z.string().describe('Search query'),
        top_k: z.number().min(1).max(50).optional().describe('Max results to return'),
      }),
      func: async ({ query, top_k }: { query: string; top_k?: number }) => {
        const results = await client.memory.search(query, { topK: top_k ?? 5, semantic: true });
        return results
          .map((r, index) => `${index + 1}. [${r.score.toFixed(3)}] ${r.content} (id=${r.id})`)
          .join('\n');
      },
    }),
    new DynamicStructuredTool({
      name: 'clawdb_recall',
      description: 'Load one or more exact memory entries by ID when you already know which saved items you need to reference.',
      schema: z.object({
        ids: z.array(z.string()).min(1).max(50).describe('Memory IDs to retrieve'),
      }),
      func: async ({ ids }: { ids: string[] }) => {
        const results = await client.memory.recall(ids);
        return JSON.stringify({
          memories: results.map((r) => ({
            score: r.score,
            id: r.id,
            content: r.content,
            memory_type: r.memoryType,
            tags: r.tags,
          })),
        });
      },
    }),
  ];

  return tools as unknown as DynamicStructuredTool[];
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
      pageContent: r.content,
      metadata: {
        id: r.id,
        score: r.score,
        memoryType: r.memoryType,
        tags: r.tags,
        ...r.metadata,
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
