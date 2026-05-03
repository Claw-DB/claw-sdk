import type { ClawDB } from '@clawdb/sdk';
import { ClawDBError } from '@clawdb/sdk';
import type { MemoryType } from '@clawdb/sdk';

/**
 * Dispatches OpenAI Agents SDK tool calls to the ClawDB client.
 *
 * Never throws — returns a JSON-encoded `{ error, message }` object on failure.
 *
 * @example
 * ```ts
 * const handler = new ClawDBToolHandler(db);
 * const result = await handler.handle("clawdb_remember", { content: "Deploy at noon" });
 * ```
 */
export class ClawDBToolHandler {
  constructor(private readonly client: ClawDB) {}

  async handle(toolName: string, args: unknown): Promise<string> {
    try {
      return await this.dispatch(toolName, args as Record<string, unknown>);
    } catch (err) {
      if (err instanceof ClawDBError) {
        return JSON.stringify({ error: err.code, message: err.message });
      }
      return JSON.stringify({ error: 'internal_error', message: String(err) });
    }
  }

  private async dispatch(toolName: string, args: Record<string, unknown>): Promise<string> {
    switch (toolName) {
      case 'clawdb_remember': {
        const id = await this.client.memory.remember(args['content'] as string, {
          memoryType: args['memory_type'] as MemoryType | undefined,
          tags: args['tags'] as string[] | undefined,
          metadata: args['metadata'] as Record<string, unknown> | undefined,
        });
        return JSON.stringify({ memory_id: id, status: 'stored' });
      }

      case 'clawdb_search': {
        const results = await this.client.memory.search(args['query'] as string, {
          topK: (args['top_k'] as number | undefined) ?? 5,
          semantic: (args['semantic'] as boolean | undefined) ?? true,
        });
        return JSON.stringify({
          results: results.map(r => ({
            content: r.memory.content,
            score: r.score,
            id: r.memory.id,
            memory_type: r.memory.memoryType,
          })),
        });
      }

      case 'clawdb_recall': {
        const memories = await this.client.memory.recall(args['memory_ids'] as string[]);
        return JSON.stringify({ memories });
      }

      case 'clawdb_forget': {
        await this.client.memory.forget(args['memory_id'] as string);
        return JSON.stringify({ status: 'deleted', memory_id: args['memory_id'] });
      }

      case 'clawdb_branch_fork': {
        const branch = await this.client.branches.fork(args['name'] as string, {
          parent: args['parent'] as string | undefined,
        });
        return JSON.stringify({ branch_id: branch.id, name: branch.name, status: 'created' });
      }

      case 'clawdb_branch_merge': {
        const result = await this.client.branches.merge(args['source'] as string, {
          into: (args['target'] as string | undefined) ?? 'trunk',
          strategy: args['strategy'] as 'ours' | 'theirs' | 'union' | undefined,
        });
        return JSON.stringify({ applied: result.applied, conflicts: result.conflicts.length });
      }

      case 'clawdb_sync': {
        if (args['push_only']) {
          const r = await this.client.sync.push();
          return JSON.stringify(r);
        } else if (args['pull_only']) {
          const r = await this.client.sync.pull();
          return JSON.stringify(r);
        } else {
          const r = await this.client.sync.sync();
          return JSON.stringify(r);
        }
      }

      default:
        return JSON.stringify({ error: 'unknown_tool', message: `Unknown tool: ${toolName}` });
    }
  }
}
