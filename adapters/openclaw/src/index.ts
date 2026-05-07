import type { ClawDB, SearchHit } from '@clawdb/sdk';
import { ClawDB as ClawDBClient } from '@clawdb/sdk';

export interface OpenClawLogger {
  info(message: string): void;
}

export interface OpenClawAgent {
  id?: string;
  logger: OpenClawLogger;
  plugins?: OpenClawPlugin[];
}

export interface OpenClawContext {
  sessionId?: string;
  set(key: string, value: unknown): void;
  get<T = unknown>(key: string): T;
  injectContext(value: string): void;
}

export interface OpenClawMessage {
  content: string;
}

export interface OpenClawResponse {
  userMessage: string;
  assistantMessage: string;
}

export interface OpenClawTool {
  name: string;
  description: string;
  execute(input: Record<string, unknown>, ctx: OpenClawContext): Promise<unknown>;
}

export interface OpenClawPlugin {
  name: string;
  version: string;
  tools?: OpenClawTool[];
  onAgentInit?: (agent: OpenClawAgent, ctx: OpenClawContext) => Promise<void>;
  onMessage?: (message: OpenClawMessage, ctx: OpenClawContext) => Promise<void>;
  onResponse?: (response: OpenClawResponse, ctx: OpenClawContext) => Promise<void>;
  onAgentShutdown?: (ctx: OpenClawContext) => Promise<void>;
}

export interface ClawDBPluginOptions {
  autoStore?: boolean;
  autoSearch?: boolean;
  topK?: number;
  syncOnShutdown?: boolean;
  endpoint?: string;
}

const CLOUD_ENDPOINT = 'https://cloud.clawdb.dev';

function resolveClientConfig(endpoint?: string): { endpoint?: string; apiKey?: string } {
  const explicit = endpoint?.trim();
  if (explicit) {
    return { endpoint: explicit };
  }

  const envEndpoint = process.env.CLAWDB_URL?.trim();
  const envApiKey = process.env.CLAWDB_API_KEY?.trim();
  if (envEndpoint) {
    return { endpoint: envEndpoint, apiKey: envApiKey || undefined };
  }
  if (envApiKey) {
    return { endpoint: CLOUD_ENDPOINT, apiKey: envApiKey };
  }
  return {};
}

function getDb(ctx: OpenClawContext): ClawDB {
  return ctx.get<ClawDB>('clawdb');
}

function createRememberTool(): OpenClawTool {
  return {
    name: 'clawdb_remember',
    description: 'Store important facts so they remain available in future agent runs.',
    async execute(input, ctx) {
      const db = getDb(ctx);
      return { id: await db.memory.remember(String(input.content), { memoryType: input.memory_type as string | undefined }) };
    }
  };
}

function createSearchTool(): OpenClawTool {
  return {
    name: 'clawdb_search',
    description: 'Search long-term memory for context relevant to the current task.',
    async execute(input, ctx) {
      const db = getDb(ctx);
      return { results: await db.memory.search(String(input.query), { topK: Number(input.top_k ?? 5) }) };
    }
  };
}

function createRecallTool(): OpenClawTool {
  return {
    name: 'clawdb_recall',
    description: 'Recall exact memory entries when you already know which IDs you need.',
    async execute(input, ctx) {
      const db = getDb(ctx);
      return { memories: await db.memory.recall((input.ids as string[]) ?? []) };
    }
  };
}

function createBranchTool(): OpenClawTool {
  return {
    name: 'clawdb_branch',
    description: 'Create or merge an experimental branch for memory-safe planning.',
    async execute(input, ctx) {
      const db = getDb(ctx);
      if (input.action === 'fork') {
        return db.branch.fork(String(input.name));
      }
      return db.branch.merge(String(input.branch_id), (input.strategy as 'last-write' | 'source-wins' | undefined) ?? 'last-write');
    }
  };
}

export function formatMemoryContext(hits: SearchHit[]): string {
  const lines = hits.map((hit) => `[score: ${hit.score.toFixed(2)}] ${hit.content}`);
  return ['--- Relevant memories ---', ...lines, '-------------------------'].join('\n');
}

export function ClawDBPlugin(options: ClawDBPluginOptions = {}): OpenClawPlugin {
  const {
    autoStore = true,
    autoSearch = true,
    topK = 3,
    syncOnShutdown = true,
    endpoint
  } = options;

  return {
    name: 'clawdb',
    version: '0.1.1',
    async onAgentInit(agent, ctx) {
      const db = new ClawDBClient({
        ...resolveClientConfig(endpoint),
        agentId: agent.id ?? ctx.sessionId
      });
      ctx.set('clawdb', db);
      agent.logger.info('ClawDB: database ready');
    },
    tools: [createRememberTool(), createSearchTool(), createRecallTool(), createBranchTool()],
    async onMessage(message, ctx) {
      if (!autoSearch) return;
      const db = getDb(ctx);
      const hits = await db.memory.search(message.content, { topK });
      if (hits.length > 0) {
        ctx.injectContext(formatMemoryContext(hits));
      }
    },
    async onResponse(response, ctx) {
      if (!autoStore) return;
      const db = getDb(ctx);
      await db.memory.remember(response.userMessage, { memoryType: 'user_message', tags: ['auto-stored'] });
      await db.memory.remember(response.assistantMessage, { memoryType: 'assistant_message', tags: ['auto-stored'] });
    },
    async onAgentShutdown(ctx) {
      const db = getDb(ctx);
      if (syncOnShutdown) {
        await db.sync.now();
      }
      db.close();
    }
  };
}

export function withClawDB<T extends OpenClawAgent>(agent: T, options?: ClawDBPluginOptions): T {
  const plugins = Array.isArray(agent.plugins) ? agent.plugins : [];
  agent.plugins = [...plugins, ClawDBPlugin(options)];
  return agent;
}
