/**
 * Cross-SDK integration tests for ClawDB.
 *
 * These tests require a running clawdb-server accessible at
 * CLAWDB_TEST_ENDPOINT (default: http://localhost:50050).
 *
 * They are skipped in unit-test runs (CI without a server) by checking
 * the CLAWDB_INTEGRATION env variable.
 *
 * Run:
 *   CLAWDB_INTEGRATION=1 pnpm vitest run tests/integration/typescript.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ClawDB } from '@clawdb/sdk';
import { ClawDBRetriever } from '@clawdb/langchain';
import { ClawDBChatMessageHistory } from '@clawdb/langchain';
import { createClawDBTools as createLCTools } from '@clawdb/langchain';
import { createClawDBAgentTools } from '@clawdb/openai-agents';
import { ClawDBToolHandler } from '@clawdb/openai-agents';
import { clawdbTools } from '@clawdb/vercel-ai';

const INTEGRATION = !!process.env['CLAWDB_INTEGRATION'];
const ENDPOINT = process.env['CLAWDB_TEST_ENDPOINT'] ?? 'http://localhost:50050';
const AGENT_ID = `test-agent-${Date.now()}`;

describe.skipIf(!INTEGRATION)('ClawDB Integration Tests', () => {
  let db: ClawDB;
  const createdIds: string[] = [];

  beforeAll(async () => {
    db = new ClawDB({ endpoint: ENDPOINT, agentId: AGENT_ID });
    await db.connect();
  });

  afterAll(async () => {
    // Cleanup memories created during tests
    for (const id of createdIds) {
      await db.deleteMemory(id).catch(() => undefined);
    }
    await db.disconnect();
  });

  // ──────────────────────────────────────────────────────────────
  // Core SDK: Memory CRUD
  // ──────────────────────────────────────────────────────────────

  it('SDK: remembers and recalls a memory', async () => {
    const id = await db.rememberTyped('Integration test memory', {
      type: 'context',
      tags: ['integration', 'test'],
    });
    createdIds.push(id);
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('SDK: searches for a stored memory', async () => {
    const id = await db.rememberTyped('TypeScript integration test payload', {
      tags: ['search-test'],
    });
    createdIds.push(id);

    const results = await db.search('TypeScript integration test', { topK: 5 });
    const found = results.find(r => r.id === id);
    expect(found).toBeDefined();
    expect(found!.score).toBeGreaterThan(0);
  });

  it('SDK: recalls specific memories by ID', async () => {
    const id = await db.remember('Recall integration test');
    createdIds.push(id);

    const memories = await db.recall([id]);
    expect(memories).toHaveLength(1);
    expect(memories[0]!['content']).toBe('Recall integration test');
  });

  it('SDK: forgets (soft-deletes) a memory', async () => {
    const id = await db.remember('To be forgotten');
    await db.deleteMemory(id);
    const memories = await db.recall([id]);
    expect(memories).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────
  // Core SDK: Branches
  // ──────────────────────────────────────────────────────────────

  it('SDK: forks a branch', async () => {
    const branchName = `test-branch-${Date.now()}`;
    const branch = await db.branch(branchName);
    expect(branch.name).toBe(branchName);
    expect(branch.branchId).toBeDefined();
  });

  it('SDK: lists branches including the new one', async () => {
    const branchName = `list-test-${Date.now()}`;
    await db.branch(branchName);
    const branches = await db.listBranches();
    expect(branches.some(b => b.name === branchName)).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────
  // LangChain adapter
  // ──────────────────────────────────────────────────────────────

  it('LangChain: ClawDBRetriever retrieves documents', async () => {
    const id = await db.remember('LangChain retriever integration test');
    createdIds.push(id);

    const retriever = new ClawDBRetriever({ client: db, topK: 5 });
    const docs = await retriever.getRelevantDocuments('LangChain retriever');
    expect(docs.length).toBeGreaterThan(0);
    expect(typeof docs[0]!.pageContent).toBe('string');
  });

  it('LangChain: ClawDBChatMessageHistory stores and retrieves messages', async () => {
    const sessionId = `session-${Date.now()}`;
    const history = new ClawDBChatMessageHistory({ client: db, sessionId });

    await history.addUserMessage('Hello from LangChain');
    await history.addAIChatMessage('Hello back from ClawDB');

    const messages = await history.getMessages();
    expect(messages.length).toBeGreaterThanOrEqual(2);
    await history.clear();
  });

  it('LangChain: createClawDBTools returns 3 tools with correct names', () => {
    const tools = createLCTools(db);
    expect(tools.map(t => t.name)).toEqual(['clawdb_remember', 'clawdb_search', 'clawdb_recall']);
  });

  // ──────────────────────────────────────────────────────────────
  // OpenAI adapter
  // ──────────────────────────────────────────────────────────────

  it('OpenAI: createClawDBAgentTools returns Responses API tools', () => {
    const tools = createClawDBAgentTools(db);
    expect(tools.every(t => t.type === 'function')).toBe(true);
    expect(tools.every(t => t.parameters.additionalProperties === false)).toBe(true);
  });

  it('OpenAI: ClawDBToolHandler.handle dispatches clawdb_remember', async () => {
    const handler = new ClawDBToolHandler(db);
    const result = JSON.parse(await handler.handle('remember_memory', { content: 'OAI integration test' }));
    expect(result.status).toBe('stored');
    if (result.memory_id) createdIds.push(result.memory_id as string);
  });

  it('OpenAI: ClawDBToolHandler.handle dispatches clawdb_search', async () => {
    const handler = new ClawDBToolHandler(db);
    const result = JSON.parse(await handler.handle('search_memory', { query: 'OAI integration test' }));
    expect(Array.isArray(result.results)).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────
  // Vercel AI adapter
  // ──────────────────────────────────────────────────────────────

  it('Vercel AI: clawdbTools.remember.execute stores memory', async () => {
    const tools = clawdbTools(db);
    const result = await tools.remember.execute({ content: 'Vercel AI integration test' });
    expect(typeof result.id).toBe('string');
    if (result.id) createdIds.push(result.id);
  });

  it('Vercel AI: clawdbTools.search.execute returns results', async () => {
    const tools = clawdbTools(db);
    const result = await tools.search.execute({ query: 'Vercel AI integration test' });
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('Vercel AI: clawdbTools.recall.execute returns memories', async () => {
    const tools = clawdbTools(db);
    const id = await db.remember('vercel recall integration test');
    createdIds.push(id);
    const result = await tools.recall.execute({ ids: [id] });
    expect(Array.isArray(result.memories)).toBe(true);
  });
});
