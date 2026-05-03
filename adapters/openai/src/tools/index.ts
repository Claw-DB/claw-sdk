import type { ClawDB, MemoryType, MemoryRecord } from '@clawdb/sdk';

/**
 * A tool definition compatible with the OpenAI Agents SDK (Responses API format).
 */
export interface Tool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
}

export interface ClawDBAgentToolsOptions {
  /** Enable branch fork/merge tools. Default: false */
  enableBranching?: boolean;
  /** Enable sync tool. Default: false */
  enableSync?: boolean;
}

/**
 * Returns an array of OpenAI Agents SDK tool definitions for ClawDB operations.
 *
 * @example
 * ```ts
 * const tools = createClawDBAgentTools(db, { enableBranching: true });
 * const runner = new OpenAIAgents({ tools });
 * ```
 */
export function createClawDBAgentTools(
  _client: ClawDB,
  options: ClawDBAgentToolsOptions = {}
): Tool[] {
  const tools: Tool[] = [
    {
      type: 'function',
      name: 'clawdb_remember',
      description: 'Store information in ClawDB persistent agent memory for future retrieval.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The information to remember' },
          memory_type: {
            type: 'string',
            enum: ['context', 'task', 'tool_output', 'session', 'reasoning_trace', 'message', 'summary'],
            description: 'Category of the memory',
          },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags to attach' },
          metadata: { type: 'object', description: 'Arbitrary structured metadata' },
        },
        required: ['content'],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'clawdb_search',
      description: 'Semantically search ClawDB agent memory for relevant information.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
          top_k: { type: 'number', description: 'Number of results to return (default 5)' },
          semantic: { type: 'boolean', description: 'Use semantic (embedding) search (default true)' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'clawdb_recall',
      description: 'Retrieve specific memory records by their IDs.',
      parameters: {
        type: 'object',
        properties: {
          memory_ids: { type: 'array', items: { type: 'string' }, description: 'Memory IDs to retrieve' },
        },
        required: ['memory_ids'],
        additionalProperties: false,
      },
    },
    {
      type: 'function',
      name: 'clawdb_forget',
      description: 'Soft-delete a memory record from ClawDB.',
      parameters: {
        type: 'object',
        properties: {
          memory_id: { type: 'string', description: 'The ID of the memory to delete' },
        },
        required: ['memory_id'],
        additionalProperties: false,
      },
    },
  ];

  if (options.enableBranching) {
    tools.push(
      {
        type: 'function',
        name: 'clawdb_branch_fork',
        description: 'Fork a new isolated memory branch from the current state.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name for the new branch' },
            parent: { type: 'string', description: 'Parent branch name (default: trunk)' },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'clawdb_branch_merge',
        description: 'Merge a memory branch back into the target branch.',
        parameters: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Source branch to merge from' },
            target: { type: 'string', description: 'Target branch (default: trunk)' },
            strategy: { type: 'string', enum: ['ours', 'theirs', 'union'], description: 'Merge strategy' },
          },
          required: ['source'],
          additionalProperties: false,
        },
      }
    );
  }

  if (options.enableSync) {
    tools.push({
      type: 'function',
      name: 'clawdb_sync',
      description: 'Trigger a push+pull sync with ClawDB Cloud.',
      parameters: {
        type: 'object',
        properties: {
          push_only: { type: 'boolean', description: 'Only push, do not pull' },
          pull_only: { type: 'boolean', description: 'Only pull, do not push' },
        },
        required: [],
        additionalProperties: false,
      },
    });
  }

  return tools;
}
