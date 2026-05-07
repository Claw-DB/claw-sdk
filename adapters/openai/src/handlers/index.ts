import type { ClawDB } from '@clawdb/sdk';

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
      const maybeCode = (err as { code?: unknown })?.code;
      const maybeMessage = (err as { message?: unknown })?.message;
      if (typeof maybeCode === 'string' || typeof maybeCode === 'number') {
        return JSON.stringify({ error: String(maybeCode), message: String(maybeMessage ?? 'Tool call failed') });
      }
      return JSON.stringify({ error: 'internal_error', message: String(err) });
    }
  }

  private async dispatch(toolName: string, args: Record<string, unknown>): Promise<string> {
    switch (toolName) {
      case 'remember_memory': {
        const id = await this.client.memory.remember(args['content'] as string, {
          memoryType: args['memory_type'] as string | undefined,
          tags: args['tags'] as string[] | undefined,
          metadata: args['metadata'] as Record<string, unknown> | undefined,
        });
        return JSON.stringify({ memory_id: id, status: 'stored' });
      }

      case 'search_memory': {
        const results = await this.client.memory.search(args['query'] as string, {
          topK: (args['top_k'] as number | undefined) ?? 5,
          semantic: (args['semantic'] as boolean | undefined) ?? true,
        });
        return JSON.stringify({
          results: results.map(r => ({
            content: r.content,
            score: r.score,
            id: r.id,
            memory_type: r.memoryType,
          })),
        });
      }

      case 'recall_memory': {
        const memories = await this.client.memory.recall(args['memory_ids'] as string[]);
        return JSON.stringify({ memories });
      }

      case 'fork_branch': {
        const branch = await this.client.branch.fork(args['name'] as string);
        return JSON.stringify({ branch_id: branch.id, name: branch.name, status: 'created' });
      }

      case 'merge_branch': {
        const result = await this.client.branch.merge(
          args['source'] as string,
          (args['strategy'] as 'last-write' | 'source-wins' | undefined) ?? 'last-write'
        );
        return JSON.stringify({ applied: result.applied, conflicts: result.conflicts.length, success: result.success });
      }

      default:
        return JSON.stringify({ error: 'unknown_tool', message: `Unknown tool: ${toolName}` });
    }
  }
}
