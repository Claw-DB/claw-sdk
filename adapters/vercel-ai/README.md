# @clawdb/vercel-ai

Vercel AI SDK integration for ClawDB tools and middleware.

## Install

npm:

npm install @clawdb/vercel-ai @clawdb/sdk ai zod

pnpm:

pnpm add @clawdb/vercel-ai @clawdb/sdk ai zod

## Usage

```ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { ClawDB } from '@clawdb/sdk';
import { clawdbTools, clawdbMiddleware } from '@clawdb/vercel-ai';

const db = new ClawDB({ endpoint: 'http://localhost:50050', agentId: 'agent-1' });
await db.connect();

const tools = clawdbTools(db);

const result = await generateText({
  model: openai('gpt-4o-mini'),
  tools,
  prompt: 'Summarize recent incidents and remember key findings.',
  experimental_middleware: [clawdbMiddleware(db)],
});
```

## React hook

```tsx
import { useClawDB } from '@clawdb/vercel-ai';

function App() {
  const { db, status, error } = useClawDB({ endpoint: 'http://localhost:50050' });
  return <div>{status}</div>;
}
```
