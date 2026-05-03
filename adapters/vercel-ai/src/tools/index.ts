import type { ClawDB } from '@clawdb/sdk';
import { z } from 'zod';

/**
 * Duck-typed `tool()` function interface from the `ai` package.
 * We define the minimal shape to avoid a hard import; the real `ai` package
 * provides this at runtime.
 */
type ToolFn<TParams extends z.ZodTypeAny, TResult> = {
  description: string;
  parameters: TParams;
  execute: (params: z.infer<TParams>) => Promise<TResult>;
};

function makeTool<TParams extends z.ZodTypeAny, TResult>(
  def: ToolFn<TParams, TResult>
): ToolFn<TParams, TResult> {
  return def;
}

// ──────────────────────────────────────────────────────────────
// Individual tool schemas
// ──────────────────────────────────────────────────────────────

const rememberParams = z.object({
  content: z.string().describe('Information to remember'),
  memoryType: z
    .enum(['context', 'task', 'tool_output', 'session', 'reasoning_trace', 'message', 'summary'])
    .optional()
    .describe('Category'),
  tags: z.array(z.string()).optional().describe('Tags'),
  metadata: z.record(z.unknown()).optional().describe('Structured metadata'),
});

const searchParams = z.object({
  query: z.string().describe('Search query'),
  topK: z.number().min(1).max(50).optional().describe('Number of results'),
});

const recallParams = z.object({
  memoryIds: z.array(z.string()).describe('Memory IDs to retrieve'),
});

const branchParams = z.object({
  action: z.enum(['fork', 'merge', 'diff', 'list']).describe('Branch action'),
  name: z.string().optional().describe('Branch name (for fork/merge/diff)'),
  target: z.string().optional().describe('Target branch (for merge)'),
});

// ──────────────────────────────────────────────────────────────
// clawdbTools
// ──────────────────────────────────────────────────────────────

export interface ClawDBTools {
  remember: ToolFn<typeof rememberParams, { memory_id: string; status: string }>;
  search: ToolFn<typeof searchParams, { results: Array<{ id: string; content: string; score: number; memoryType: string }> }>;
  recall: ToolFn<typeof recallParams, { memories: unknown[] }>;
  branch: ToolFn<typeof branchParams, Record<string, unknown>>;
}

/**
 * Returns a record of Vercel AI SDK `tool()`-compatible tools for ClawDB.
 *
 * @example
 * ```ts
 * import { clawdbTools } from '@clawdb/vercel-ai';
 * const tools = clawdbTools(db);
 * const result = await generateText({ model, tools, prompt: "..." });
 * ```
 */
export function clawdbTools(client: ClawDB): ClawDBTools {
  return {
    remember: makeTool({
      description: 'Store information in ClawDB persistent agent memory.',
      parameters: rememberParams,
      async execute({ content, memoryType, tags, metadata }) {
        const id = await client.memory.remember(content, {
          memoryType: memoryType as Parameters<typeof client.memory.remember>[1] extends { memoryType?: infer T } ? T : never,
          tags,
          metadata,
        });
        return { memory_id: id, status: 'stored' };
      },
    }),

    search: makeTool({
      description: 'Semantically search ClawDB agent memory for relevant information.',
      parameters: searchParams,
      async execute({ query, topK }) {
        const results = await client.memory.search(query, { topK: topK ?? 5 });
        return {
          results: results.map(r => ({
            id: r.memory.id,
            content: r.memory.content,
            score: r.score,
            memoryType: r.memory.memoryType,
          })),
        };
      },
    }),

    recall: makeTool({
      description: 'Retrieve specific memory records by their IDs.',
      parameters: recallParams,
      async execute({ memoryIds }) {
        const memories = await client.memory.recall(memoryIds);
        return { memories };
      },
    }),

    branch: makeTool({
      description: 'Manage memory branches: fork, merge, diff, or list.',
      parameters: branchParams,
      async execute({ action, name, target }) {
        switch (action) {
          case 'fork': {
            const branch = await client.branches.fork(name!, { parent: target });
            return { branch_id: branch.id, name: branch.name };
          }
          case 'merge': {
            const result = await client.branches.merge(name!, { into: target ?? 'trunk' });
            return { applied: result.applied, conflicts: result.conflicts.length };
          }
          case 'diff': {
            const diff = await client.branches.diff(name!, target ?? 'trunk');
            return diff as unknown as Record<string, unknown>;
          }
          case 'list': {
            const branches = await client.branches.list();
            return { branches };
          }
          default:
            return { error: 'unknown_action' };
        }
      },
    }),
  };
}
