import type Anthropic from '@anthropic-ai/sdk';
import type { ClawDB } from '@clawdb/sdk';

export function clawdbTools(_client: ClawDB): Anthropic.Tool[] {
  return [
    {
      name: 'clawdb_remember',
      description: 'Store important information that should persist across future conversations.',
      input_schema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          memory_type: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } }
        },
        required: ['content']
      }
    },
    {
      name: 'clawdb_search',
      description: 'Search memory for context that is relevant to the current user request.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          top_k: { type: 'number' },
          semantic: { type: 'boolean' }
        },
        required: ['query']
      }
    },
    {
      name: 'clawdb_recall',
      description: 'Recall specific memory entries when you already know their IDs.',
      input_schema: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'string' } }
        },
        required: ['ids']
      }
    }
  ];
}

export async function handleClawDBToolCall(
  client: ClawDB,
  toolUse: Anthropic.ToolUseBlock
): Promise<Anthropic.ToolResultBlockParam> {
  if (toolUse.name === 'clawdb_remember') {
    const input = toolUse.input as { content: string; memory_type?: string; tags?: string[] };
    const id = await client.memory.remember(input.content, {
      memoryType: input.memory_type,
      tags: input.tags
    });
    return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ id }) };
  }

  if (toolUse.name === 'clawdb_search') {
    const input = toolUse.input as { query: string; top_k?: number; semantic?: boolean };
    const results = await client.memory.search(input.query, {
      topK: input.top_k ?? 5,
      semantic: input.semantic ?? true
    });
    return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ results }) };
  }

  const input = toolUse.input as { ids: string[] };
  const memories = await client.memory.recall(input.ids);
  return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ memories }) };
}

export function withClawDBMemory(anthropic: Anthropic, client: ClawDB): Anthropic {
  const messagesApi = anthropic.messages;
  const originalCreate = messagesApi.create.bind(messagesApi);

  messagesApi.create = (async (params: Anthropic.MessageCreateParams) => {
    const userTurns = params.messages.filter((message) => message.role === 'user');
    const lastUser = userTurns.at(-1);
    const userText = typeof lastUser?.content === 'string' ? lastUser.content : '';

    let enrichedParams = params;
    if (userText) {
      const hits = await client.memory.search(userText, { topK: 5, semantic: true });
      const memoryContext = hits.map((hit, i) => `${i + 1}. ${hit.content}`).join('\n');
      enrichedParams = {
        ...params,
        system: [params.system, memoryContext ? `Relevant memory:\n${memoryContext}` : ''].filter(Boolean).join('\n\n')
      };
    }

    const response = await originalCreate(enrichedParams);

    if (userText) {
      await client.memory.remember(userText, { memoryType: 'message', tags: ['role:user'] });
      const blocks = (response as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
      const assistantText = blocks
        .filter((block: { type?: string; text?: string }) => block.type === 'text')
        .map((block: { type?: string; text?: string }) => block.text ?? '')
        .join('\n');
      if (assistantText) {
        await client.memory.remember(assistantText, { memoryType: 'message', tags: ['role:assistant'] });
      }
    }

    return response;
  }) as typeof messagesApi.create;

  return anthropic;
}
