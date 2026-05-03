# @clawdb/langchain

LangChain.js integration for ClawDB persistent memory.

## Install

npm:

npm install @clawdb/langchain @clawdb/sdk @langchain/core

pnpm:

pnpm add @clawdb/langchain @clawdb/sdk @langchain/core

## Usage

```ts
import { ClawDB } from '@clawdb/sdk';
import {
  ClawDBRetriever,
  ClawDBChatMessageHistory,
  createClawDBTools,
  ClawDBMemoryStore,
} from '@clawdb/langchain';

const db = new ClawDB({ endpoint: 'http://localhost:50050', agentId: 'agent-1' });
await db.connect();

const retriever = new ClawDBRetriever({ client: db, topK: 6 });
const docs = await retriever.getRelevantDocuments('release checklist');

const chatHistory = new ClawDBChatMessageHistory({
  client: db,
  sessionId: 'chat-42',
});
await chatHistory.addUserMessage('What happened in the last deploy?');

const tools = createClawDBTools(db, { defaultMemoryType: 'tool_output' });

const memoryStore = new ClawDBMemoryStore(db);
await memoryStore.addDocuments([
  { pageContent: 'Deploy runbook v3', metadata: { source: 'ops' } },
]);
```

## Exports

- ClawDBRetriever
- ClawDBChatMessageHistory
- createClawDBTools
- ClawDBMemoryStore
