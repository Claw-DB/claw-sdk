import type { ClawDB } from '@clawdb/sdk';

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
export function createClawDBAgentTools(_client: ClawDB, options: ClawDBAgentToolsOptions = {}): Tool[] {
  const tools: Tool[] = [
    {
      type: 'function',
      name: 'remember_memory',
      description: 'Store important information that should persist across future turns. Use this for preferences, facts, decisions, and constraints.',
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
      name: 'search_memory',
      description: 'Search long-term memory for details relevant to the current request before answering.',
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
      name: 'recall_memory',
      description: 'Retrieve exact memory records by ID when specific saved entries are required.',
      parameters: {
        type: 'object',
        properties: {
          memory_ids: { type: 'array', items: { type: 'string' }, description: 'Memory IDs to retrieve' },
        },
        required: ['memory_ids'],
        additionalProperties: false,
      },
    },
  ];

  if (options.enableBranching) {
    tools.push(
      {
        type: 'function',
        name: 'fork_branch',
        description: 'Create an isolated experimental memory branch for trying alternate plans safely.',
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
        name: 'merge_branch',
        description: 'Merge an experimental branch back to the main branch when changes are ready.',
        parameters: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Source branch to merge from' },
            target: { type: 'string', description: 'Target branch (default: trunk)' },
            strategy: { type: 'string', enum: ['last-write', 'source-wins'], description: 'Merge strategy' },
          },
          required: ['source'],
          additionalProperties: false,
        },
      }
    );
  }

  return tools;
}
