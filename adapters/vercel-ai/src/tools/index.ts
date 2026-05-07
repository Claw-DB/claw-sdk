import type { ClawDB } from '@clawdb/sdk';
import { z } from 'zod';

type CoreTool<TParams extends z.ZodTypeAny, TResult> = {
  description: string;
  parameters: TParams;
  execute: (params: z.infer<TParams>) => Promise<TResult>;
};

function tool<TParams extends z.ZodTypeAny, TResult>(spec: CoreTool<TParams, TResult>): CoreTool<TParams, TResult> {
  return spec;
}

const rememberSchema = z.object({
  content: z.string(),
  memoryType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional()
});

const searchSchema = z.object({
  query: z.string(),
  topK: z.number().min(1).max(50).optional(),
  semantic: z.boolean().optional()
});

const recallSchema = z.object({
  ids: z.array(z.string()).min(1)
});

export type ClawDBTools = {
  remember: CoreTool<typeof rememberSchema, { id: string }>;
  search: CoreTool<typeof searchSchema, { results: Array<{ id: string; content: string; score: number; memoryType: string; tags: string[] }> }>;
  recall: CoreTool<typeof recallSchema, { memories: unknown[] }>;
};

export function clawdbTools(client: ClawDB): ClawDBTools {
  return {
    remember: tool({
      description: 'Store important user facts, preferences, and decisions so they are available in future responses.',
      parameters: rememberSchema,
      async execute({ content, memoryType, tags, metadata }) {
        const id = await client.memory.remember(content, { memoryType, tags, metadata });
        return { id };
      }
    }),
    search: tool({
      description: 'Search long-term memory for relevant context before you answer the user.',
      parameters: searchSchema,
      async execute({ query, topK, semantic }) {
        const hits = await client.memory.search(query, {
          topK: topK ?? 5,
          semantic: semantic ?? true
        });
        return {
          results: hits.map((hit) => ({
            id: hit.id,
            content: hit.content,
            score: hit.score,
            memoryType: hit.memoryType,
            tags: hit.tags
          }))
        };
      }
    }),
    recall: tool({
      description: 'Fetch exact memory entries by ID when precise previously saved information is needed.',
      parameters: recallSchema,
      async execute({ ids }) {
        const memories = await client.memory.recall(ids);
        return { memories };
      }
    })
  };
}
