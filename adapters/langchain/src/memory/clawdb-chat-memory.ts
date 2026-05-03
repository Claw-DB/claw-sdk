import type { ClawDB } from '@clawdb/sdk';

// Duck-typed LangChain message types for peer-dep compat
export type MessageType = 'human' | 'ai' | 'system' | 'generic' | 'function' | 'tool';

export interface BaseMessage {
  _getType(): MessageType;
  content: string | Record<string, unknown>[];
}

export class HumanMessage implements BaseMessage {
  constructor(public content: string) {}
  _getType(): MessageType { return 'human'; }
}

export class AIMessage implements BaseMessage {
  constructor(public content: string) {}
  _getType(): MessageType { return 'ai'; }
}

const SESSION_TAG_PREFIX = 'session:';
const MSG_MEMORY_TYPE = 'message' as const;

/**
 * LangChain BaseChatMessageHistory-compatible implementation backed by ClawDB.
 *
 * Each message is stored as a ClawDB memory record tagged with the session ID.
 *
 * @example
 * ```ts
 * const history = new ClawDBChatMessageHistory({ client: db, sessionId: "chat-123" });
 * await history.addMessage(new HumanMessage("Hello!"));
 * const messages = await history.getMessages();
 * ```
 */
export class ClawDBChatMessageHistory {
  readonly lc_namespace = ['clawdb', 'chat_histories'];

  private readonly client: ClawDB;
  private readonly sessionId: string;
  private readonly maxMessages: number;

  constructor(fields: { client: ClawDB; sessionId?: string; maxMessages?: number }) {
    this.client = fields.client;
    this.sessionId = fields.sessionId ?? 'default';
    this.maxMessages = fields.maxMessages ?? 100;
  }

  /** Returns all messages for this session in chronological order. */
  async getMessages(): Promise<BaseMessage[]> {
    const memories = await this.client.memory.list({
      memoryType: MSG_MEMORY_TYPE,
      limit: this.maxMessages,
      sortBy: 'created_at',
    });

    const sessionTag = `${SESSION_TAG_PREFIX}${this.sessionId}`;
    return memories
      .filter(m => m.tags.includes(sessionTag))
      .map(m => {
        const role = (m.metadata?.['role'] as string) ?? 'human';
        return role === 'ai' ? new AIMessage(m.content) : new HumanMessage(m.content);
      });
  }

  /** Stores a message as a ClawDB memory record. */
  async addMessage(message: BaseMessage): Promise<void> {
    const role = message._getType() === 'ai' ? 'ai' : 'human';
    const content = typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content);

    await this.client.memory.remember(content, {
      memoryType: MSG_MEMORY_TYPE,
      tags: [`${SESSION_TAG_PREFIX}${this.sessionId}`, role],
      metadata: { role, sessionId: this.sessionId },
    });
  }

  /** Adds a human message. */
  async addUserMessage(message: string): Promise<void> {
    return this.addMessage(new HumanMessage(message));
  }

  /** Adds an AI message. */
  async addAIChatMessage(message: string): Promise<void> {
    return this.addMessage(new AIMessage(message));
  }

  /** Deletes all messages for this session. */
  async clear(): Promise<void> {
    const memories = await this.client.memory.list({
      memoryType: MSG_MEMORY_TYPE,
      limit: 10_000,
    });
    const sessionTag = `${SESSION_TAG_PREFIX}${this.sessionId}`;
    await Promise.all(
      memories
        .filter(m => m.tags.includes(sessionTag))
        .map(m => this.client.memory.forget(m.id))
    );
  }
}
