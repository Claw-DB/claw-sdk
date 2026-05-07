import type { ClawDB } from '@clawdb/sdk';
import type { FunctionDeclaration, FunctionCall, FunctionResponse, GenerativeModel } from '@google/generative-ai';

export function clawdbTools(_client: ClawDB): FunctionDeclaration[] {
  return [
    {
      name: 'clawdb_remember',
      description: 'Store important facts for future conversations.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          memory_type: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['content']
      }
    } as unknown as FunctionDeclaration,
    {
      name: 'clawdb_search',
      description: 'Search memory for context relevant to the request.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          top_k: { type: 'number' },
          semantic: { type: 'boolean' }
        },
        required: ['query']
      }
    } as unknown as FunctionDeclaration,
    {
      name: 'clawdb_recall',
      description: 'Recall specific memory items by ID.',
      parameters: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'string' } }
        },
        required: ['ids']
      }
    } as unknown as FunctionDeclaration
  ];
}

export async function handleClawDBFunctionCall(client: ClawDB, call: FunctionCall): Promise<FunctionResponse> {
  const args = (call.args ?? {}) as Record<string, unknown>;

  if (call.name === 'clawdb_remember') {
    const id = await client.memory.remember(String(args.content), {
      memoryType: args.memory_type as string | undefined,
      tags: args.tags as string[] | undefined
    });
    return { name: call.name, response: { id } };
  }

  if (call.name === 'clawdb_search') {
    const results = await client.memory.search(String(args.query), {
      topK: typeof args.top_k === 'number' ? args.top_k : 5,
      semantic: typeof args.semantic === 'boolean' ? args.semantic : true
    });
    return { name: call.name, response: { results } };
  }

  const memories = await client.memory.recall((args.ids as string[]) ?? []);
  return { name: call.name, response: { memories } };
}

export function withClawDBMemory(model: GenerativeModel, client: ClawDB): GenerativeModel {
  const originalGenerateContent = model.generateContent.bind(model);

  model.generateContent = (async (request: Parameters<typeof model.generateContent>[0]) => {
    const prompt = typeof request === 'string'
      ? request
      : Array.isArray(request)
        ? request.filter((part): part is string => typeof part === 'string').join(' ')
        : '';

    let enrichedRequest = request;
    if (prompt) {
      const hits = await client.memory.search(prompt, { topK: 5, semantic: true });
      const memoryHeader = hits.length > 0
        ? `Relevant memory:\n${hits.map((hit, i) => `${i + 1}. ${hit.content}`).join('\n')}\n\n`
        : '';
      if (typeof request === 'string') {
        enrichedRequest = `${memoryHeader}${request}`;
      }
    }

    const response = await originalGenerateContent(enrichedRequest);

    if (prompt) {
      await client.memory.remember(prompt, { memoryType: 'message', tags: ['role:user'] });
      const text = response.response.text();
      if (text) {
        await client.memory.remember(text, { memoryType: 'message', tags: ['role:assistant'] });
      }
    }

    return response;
  }) as typeof model.generateContent;

  return model;
}
