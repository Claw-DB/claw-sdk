#!/usr/bin/env node
/**
 * @clawdb/mcp-adapter — MCP server that exposes ClawDB as Model Context Protocol tools.
 *
 * Run standalone:
 *   npx @clawdb/mcp-adapter
 *
 * Claude Desktop config:
 * {
 *   "mcpServers": {
 *     "clawdb": {
 *       "command": "npx",
 *       "args": ["-y", "@clawdb/mcp-adapter"],
 *       "env": { "CLAWDB_ENDPOINT": "http://localhost:50050", "CLAWDB_AGENT_ID": "my-agent" }
 *     }
 *   }
 * }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ClawDB } from '@clawdb/sdk';

const server = new McpServer({ name: 'clawdb', version: '0.1.0' });
const db = ClawDB.fromEnv();

// ──────────────────────────────────────────────────────────────
// Tools
// ──────────────────────────────────────────────────────────────

server.tool(
  'clawdb_remember',
  'Store information in ClawDB persistent agent memory.',
  {
    content: z.string().describe('The information to store'),
    memory_type: z
      .enum(['context', 'task', 'tool_output', 'session', 'reasoning_trace', 'message', 'summary'])
      .optional()
      .describe('Memory type'),
    tags: z.array(z.string()).optional().describe('Tags'),
    metadata: z.record(z.unknown()).optional().describe('Structured metadata'),
  },
  async ({ content, memory_type, tags, metadata }) => {
    const id = await db.memory.remember(content, {
      memoryType: memory_type as Parameters<typeof db.memory.remember>[1] extends { memoryType?: infer T } ? T : never,
      tags,
      metadata,
    });
    return { content: [{ type: 'text', text: JSON.stringify({ memory_id: id, status: 'stored' }) }] };
  }
);

server.tool(
  'clawdb_search',
  'Semantically search ClawDB agent memory.',
  {
    query: z.string().describe('Search query'),
    top_k: z.number().min(1).max(50).optional().describe('Number of results (default 5)'),
    semantic: z.boolean().optional().describe('Use semantic search (default true)'),
  },
  async ({ query, top_k, semantic }) => {
    const results = await db.memory.search(query, { topK: top_k ?? 5, semantic: semantic ?? true });
    const formatted = results
      .map(r => `[${r.score.toFixed(3)}] ${r.memory.content} (id: ${r.memory.id})`)
      .join('\n');
    return {
      content: [
        { type: 'text', text: formatted || 'No results found.' },
      ],
    };
  }
);

server.tool(
  'clawdb_recall',
  'Retrieve specific memory records by their IDs.',
  { memory_ids: z.array(z.string()).describe('Memory IDs to retrieve') },
  async ({ memory_ids }) => {
    const memories = await db.memory.recall(memory_ids);
    return {
      content: [{ type: 'text', text: JSON.stringify(memories, null, 2) }],
    };
  }
);

server.tool(
  'clawdb_forget',
  'Soft-delete a memory record.',
  { memory_id: z.string().describe('ID of the memory to delete') },
  async ({ memory_id }) => {
    await db.memory.forget(memory_id);
    return { content: [{ type: 'text', text: `Memory ${memory_id} deleted.` }] };
  }
);

server.tool(
  'clawdb_branch_fork',
  'Fork a new isolated memory branch.',
  {
    name: z.string().describe('Branch name'),
    parent: z.string().optional().describe('Parent branch (default: trunk)'),
  },
  async ({ name, parent }) => {
    const branch = await db.branches.fork(name, { parent });
    return { content: [{ type: 'text', text: JSON.stringify({ branch_id: branch.id, name: branch.name }) }] };
  }
);

server.tool(
  'clawdb_branch_list',
  'List all memory branches.',
  {},
  async () => {
    const branches = await db.branches.list();
    return {
      content: [
        {
          type: 'text',
          text: branches.map(b => `${b.name} (${b.status})`).join('\n') || 'No branches.',
        },
      ],
    };
  }
);

server.tool(
  'clawdb_branch_diff',
  'Diff two memory branches.',
  {
    branch_a: z.string().describe('First branch'),
    branch_b: z.string().describe('Second branch'),
  },
  async ({ branch_a, branch_b }) => {
    const diff = await db.branches.diff(branch_a, branch_b);
    return { content: [{ type: 'text', text: JSON.stringify(diff, null, 2) }] };
  }
);

server.tool(
  'clawdb_branch_merge',
  'Merge a branch into a target branch.',
  {
    source: z.string().describe('Source branch to merge'),
    target: z.string().optional().describe('Target branch (default: trunk)'),
    strategy: z.enum(['ours', 'theirs', 'union']).optional().describe('Merge strategy'),
  },
  async ({ source, target, strategy }) => {
    const result = await db.branches.merge(source, {
      into: target ?? 'trunk',
      strategy,
    });
    return {
      content: [
        {
          type: 'text',
          text: `Merged ${result.applied} records. Conflicts: ${result.conflicts.length}`,
        },
      ],
    };
  }
);

server.tool(
  'clawdb_sync',
  'Push and pull memory with ClawDB Cloud.',
  {
    push_only: z.boolean().optional().describe('Only push'),
    pull_only: z.boolean().optional().describe('Only pull'),
  },
  async ({ push_only, pull_only }) => {
    let result: unknown;
    if (push_only) result = await db.sync.push();
    else if (pull_only) result = await db.sync.pull();
    else result = await db.sync.sync();
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);

server.tool(
  'clawdb_reflect',
  'Trigger a memory reflection / consolidation job.',
  {
    job_type: z.enum(['full', 'incremental', 'archive']).optional().describe('Job type'),
    dry_run: z.boolean().optional().describe('Simulate without making changes'),
  },
  async ({ job_type, dry_run }) => {
    const job = await db.reflect.trigger({
      jobType: (job_type ?? 'full') as Parameters<typeof db.reflect.trigger>[0] extends { jobType?: infer T } ? T : never,
      dryRun: dry_run,
    });
    return { content: [{ type: 'text', text: JSON.stringify(job) }] };
  }
);

server.tool(
  'clawdb_status',
  'Return a health and status report from ClawDB.',
  {},
  async () => {
    const status = await db.sync.status();
    return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
  }
);

// ──────────────────────────────────────────────────────────────
// Resources
// ──────────────────────────────────────────────────────────────

server.resource('memory', 'clawdb://memories', async (uri) => {
  const memories = await db.memory.list({ limit: 50 });
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(memories, null, 2),
      },
    ],
  };
});

server.resource('branch', 'clawdb://branches', async (uri) => {
  const branches = await db.branches.list();
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(branches, null, 2),
      },
    ],
  };
});

server.resource(
  'profile',
  'clawdb://profile',
  async (uri) => {
    const profile = await db.reflect.getProfile();
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(profile, null, 2) }] };
  }
);

// ──────────────────────────────────────────────────────────────
// Start
// ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await db.connect().catch(() => {
    // Connection is best-effort at startup; each tool call will surface errors.
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main();
