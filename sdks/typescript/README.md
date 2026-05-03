# @clawdb/sdk (TypeScript)

The official TypeScript/Node.js client for **ClawDB** — persistent, branchable, semantically-searchable agent memory.

```bash
npm install @clawdb/sdk
# or
pnpm add @clawdb/sdk
```

## Quick start

```ts
import { ClawDB } from '@clawdb/sdk';

const db = new ClawDB({
  endpoint: process.env.CLAWDB_ENDPOINT ?? 'http://localhost:50050',
  agentId: 'my-agent',
});

await db.connect();

// Store
const id = await db.memory.remember('Deploy at 3 PM UTC', {
  memoryType: 'task',
  tags: ['ops', 'deploy'],
  metadata: { priority: 'high' },
});

// Search
const results = await db.memory.search('deploy schedule', { topK: 5 });
for (const { memory, score } of results) {
  console.log(`${score.toFixed(3)} — ${memory.content}`);
}

// Recall
const [mem] = await db.memory.recall([id]);

// Forget
await db.memory.forget(id);

await db.disconnect();
```

## Memory types

| Value | Description |
|---|---|
| `context` | Background facts about the task or world |
| `task` | An action item or goal |
| `tool_output` | Output from an external tool call |
| `session` | Short-lived session data |
| `reasoning_trace` | Internal reasoning steps |
| `message` | Conversation message |
| `summary` | Summarized / consolidated memory |

## Branches

```ts
const branch = await db.branches.fork('my-experiment');
// Memories written here go to my-experiment
await db.branches.merge('my-experiment', { into: 'trunk', strategy: 'union' });
```

## Configuration

```ts
const db = new ClawDB({
  endpoint: 'http://localhost:50050',   // gRPC endpoint
  apiKey: 'ck_live_...',                // API key
  agentId: 'my-agent',                  // Logical agent name
  workspace: 'prod',
  tls: false,
  timeoutMs: 30_000,
});
```

Or via environment variables:

| Var | Description |
|---|---|
| `CLAWDB_ENDPOINT` | gRPC endpoint |
| `CLAWDB_API_KEY` | API key |
| `CLAWDB_AGENT_ID` | Agent ID |
| `CLAWDB_WORKSPACE` | Workspace name |
| `CLAWDB_TIMEOUT_MS` | Request timeout (ms) |

## Auth utilities

```ts
import { parseApiKey, maskApiKey, decodeJwt, isJwtExpired } from '@clawdb/sdk/auth';

const parsed = parseApiKey('ck_live_abc123...');
// { prefix: 'ck_live_', environment: 'live' }

const masked = maskApiKey('ck_live_abc123...');
// 'ck_live_abc1••••••••'
```

## Config file manager

```ts
import { ConfigFileManager } from '@clawdb/sdk/config';

const mgr = new ConfigFileManager();
await mgr.set('api_key', 'ck_live_...');
const apiKey = await mgr.get('api_key');
```

## Schema utilities

```ts
import { defineMemorySchema } from '@clawdb/sdk/schema';
import { z } from 'zod';

const TaskSchema = defineMemorySchema({
  memoryType: 'task',
  name: 'Task',
  metadataSchema: z.object({ priority: z.enum(['low', 'medium', 'high']) }),
  defaultTags: ['task'],
});

// Validated remember call
const id = await TaskSchema.remember(db, 'Review PR #42', { priority: 'high' });
```

## Error handling

```ts
import { ClawDBError, ClawDBErrorCode } from '@clawdb/sdk';

try {
  await db.memory.recall(['nonexistent-id']);
} catch (err) {
  if (err instanceof ClawDBError) {
    console.error(err.code, err.message);
    // e.g. NOT_FOUND "Memory not found"
  }
}
```

## Development

```bash
pnpm install
pnpm build
pnpm test
```
