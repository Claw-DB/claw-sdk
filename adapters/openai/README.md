# @clawdb/openai-agents

OpenAI Agents SDK integration for ClawDB memory tools.

## Install

npm:

npm install @clawdb/openai-agents @clawdb/sdk openai

pnpm:

pnpm add @clawdb/openai-agents @clawdb/sdk openai

## Usage

```ts
import { ClawDB } from '@clawdb/sdk';
import {
  createClawDBAgentTools,
  ClawDBToolHandler,
  withClawDBMemory,
} from '@clawdb/openai-agents';

const db = new ClawDB({ endpoint: 'http://localhost:50050', agentId: 'agent-1' });
await db.connect();

const tools = createClawDBAgentTools(db, {
  enableBranching: true,
  enableSync: true,
});

const handler = new ClawDBToolHandler(db);
const result = await handler.handle('clawdb_remember', {
  content: 'Customer likes weekly status updates',
  memory_type: 'context',
});

const wrappedAgent = withClawDBMemory(myAgent, db);
```

## Included tool names

- clawdb_remember
- clawdb_search
- clawdb_recall
- clawdb_forget
- clawdb_branch_fork (optional)
- clawdb_branch_merge (optional)
- clawdb_sync (optional)
