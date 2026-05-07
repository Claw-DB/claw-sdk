import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ClawDB, type SearchHit } from '@clawdb/sdk';

const PACKAGE_VERSION = '0.1.3';
const CLOUD_ENDPOINT = 'https://cloud.clawdb.dev';

function resolveClientConfig(): { endpoint?: string; apiKey?: string; agentId?: string } {
  const explicitEndpoint = process.env.CLAWDB_URL?.trim();
  const apiKey = process.env.CLAWDB_API_KEY?.trim();
  const agentId = process.env.CLAWDB_AGENT_ID?.trim();

  if (explicitEndpoint) {
    return { endpoint: explicitEndpoint, apiKey: apiKey || undefined, agentId: agentId || undefined };
  }
  if (apiKey) {
    return { endpoint: CLOUD_ENDPOINT, apiKey, agentId: agentId || undefined };
  }
  return { agentId: agentId || undefined };
}

function getClaudeConfigPath(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
    return join(appData, 'Claude', 'claude_desktop_config.json');
  }
  return join(homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

function clawdbClaudeConfigBlock(): Record<string, unknown> {
  return {
    mcpServers: {
      clawdb: {
        command: 'npx',
        args: ['-y', '@clawdb/mcp-adapter@latest'],
        env: {
          CLAWDB_ENDPOINT: 'http://localhost:50050',
          CLAWDB_AGENT_ID: 'claude-desktop'
        }
      }
    }
  };
}

function printClaudeConfig(): void {
  process.stdout.write(`${JSON.stringify(clawdbClaudeConfigBlock(), null, 2)}\n`);
}

function installClaudeConfig(): void {
  const configPath = getClaudeConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });

  let existing: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }

  const block = clawdbClaudeConfigBlock();
  const mcpServers = (existing['mcpServers'] as Record<string, unknown> | undefined) ?? {};
  const next = {
    ...existing,
    mcpServers: {
      ...mcpServers,
      ...(block['mcpServers'] as Record<string, unknown>)
    }
  };

  writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  process.stdout.write('✓ ClawDB added to Claude Desktop. Restart Claude Desktop to activate.\n');
}

function toMcpText(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function formatHits(hits: SearchHit[]): string {
  if (hits.length === 0) {
    return 'No results found.';
  }
  return hits.map((hit, index) => `${index + 1}. [${hit.score.toFixed(3)}] ${hit.content} (id=${hit.id})`).join('\n');
}

async function main(): Promise<void> {
  if (process.env.CLAWDB_ENDPOINT && !process.env.CLAWDB_URL) {
    process.env.CLAWDB_URL = process.env.CLAWDB_ENDPOINT;
  }

  if (process.argv.includes('--print-config')) {
    printClaudeConfig();
    return;
  }

  if (process.argv.includes('--install-claude')) {
    installClaudeConfig();
    return;
  }

  const server = new McpServer({ name: 'clawdb', version: PACKAGE_VERSION });

  const db = new ClawDB(resolveClientConfig());

  const requireDb = (): ClawDB => {
    return db;
  };

  server.tool(
    'clawdb_remember',
    'Store information in the agent\'s persistent memory database.',
    {
      content: z.string().describe('What to remember'),
      memory_type: z.string().default('message'),
      tags: z.array(z.string()).optional()
    },
    async ({ content, memory_type, tags }) => {
      const id = await requireDb().memory.remember(content, { memoryType: memory_type, tags });
      return toMcpText({ id });
    }
  );

  server.tool(
    'clawdb_remember_bulk',
    'Store many memories in one call for fast context ingestion.',
    {
      memories: z.array(z.object({
        content: z.string(),
        memory_type: z.string().optional(),
        tags: z.array(z.string()).optional()
      })).min(1).max(100)
    },
    async ({ memories }) => {
      const ids = await Promise.all(
        memories.map((item) => requireDb().memory.remember(item.content, {
          memoryType: item.memory_type ?? 'message',
          tags: item.tags
        }))
      );
      return toMcpText({ ids });
    }
  );

  server.tool(
    'clawdb_search',
    'Search the agent\'s memory database by meaning or keywords.',
    {
      query: z.string(),
      top_k: z.number().min(1).max(50).default(5),
      semantic: z.boolean().default(true)
    },
    async ({ query, top_k, semantic }) => {
      const results = await requireDb().memory.search(query, { topK: top_k, semantic });
      return { content: [{ type: 'text', text: formatHits(results) }] };
    }
  );

  server.tool(
    'clawdb_recall',
    'Retrieve specific memories by ID.',
    {
      ids: z.array(z.string()).min(1)
    },
    async ({ ids }) => {
      const memories = await requireDb().memory.recall(ids);
      return toMcpText({ memories });
    }
  );

  server.tool(
    'clawdb_branch_fork',
    'Fork the agent\'s memory state for experimentation.',
    { name: z.string() },
    async ({ name }) => {
      const branch = await requireDb().branch.fork(name);
      return toMcpText({ branch_id: branch.id });
    }
  );

  server.tool(
    'clawdb_branch_merge',
    'Merge an experimental branch back into main memory.',
    {
      branch_id: z.string(),
      strategy: z.enum(['last-write', 'source-wins']).default('last-write')
    },
    async ({ branch_id, strategy }) => {
      const result = await requireDb().branch.merge(branch_id, strategy);
      return toMcpText(result);
    }
  );

  server.tool(
    'clawdb_status',
    'Check ClawDB connection and component health.',
    {},
    async () => {
      const health = await requireDb().health.check();
      return toMcpText(health);
    }
  );

  server.resource('recent', 'clawdb://recent', async (uri) => {
    const list = await requireDb().memory.list({ limit: 20 });
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(list.hits, null, 2)
        }
      ]
    };
  });

  server.resource('memory-by-id', 'clawdb://memory/{id}', async (uri) => {
    const id = uri.pathname.split('/').pop();
    if (!id) {
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ error: 'missing id' }) }]
      };
    }
    const [memory] = await requireDb().memory.recall([id]);
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(memory ?? null, null, 2)
        }
      ]
    };
  });

  const maybePromptRegistrar = (server as unknown as {
    prompt?: (
      name: string,
      description: string,
      schema: Record<string, z.ZodTypeAny>,
      handler: (args: Record<string, unknown>) => Promise<{ messages: Array<{ role: string; content: { type: string; text: string } }> }>
    ) => void;
  }).prompt;

  if (typeof maybePromptRegistrar === 'function') {
    maybePromptRegistrar(
      'clawdb_load_context',
      'Search memory for the current topic and format the result for system prompt injection.',
      { topic: z.string() },
      async ({ topic }) => {
        const hits = await requireDb().memory.search(String(topic), { topK: 5, semantic: true });
        return {
          messages: [
            {
              role: 'system',
              content: {
                type: 'text',
                text: `Relevant prior context:\n${formatHits(hits)}`
              }
            }
          ]
        };
      }
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main();
