import type { ClawDB } from '@clawdb/sdk';
import type { MemoryType, MetadataFilter, SearchResult } from '@clawdb/sdk';

// We use interface-based duck-typing for LangChain core types so this
// package compiles even if @langchain/core is only a peer / not installed.

export interface LangChainDocument {
  pageContent: string;
  metadata: Record<string, unknown>;
}

export interface CallbackManagerForRetrieverRun {
  handleRetrieverEnd?: (documents: LangChainDocument[]) => void;
}

/**
 * A LangChain BaseRetriever-compatible implementation backed by ClawDB.
 *
 * Compatible with @langchain/core ^0.2.
 *
 * @example
 * ```ts
 * const retriever = new ClawDBRetriever({ client: db, topK: 8 });
 * const docs = await retriever.getRelevantDocuments("What tasks are due today?");
 * ```
 */
export class ClawDBRetriever {
  readonly lc_namespace = ['clawdb', 'retrievers'];

  private readonly client: ClawDB;
  private readonly topK: number;
  private readonly memoryType: MemoryType | undefined;
  private readonly filter: MetadataFilter | undefined;
  private readonly semantic: boolean;

  constructor(fields: {
    client: ClawDB;
    topK?: number;
    memoryType?: MemoryType;
    filter?: MetadataFilter;
    semantic?: boolean;
  }) {
    this.client = fields.client;
    this.topK = fields.topK ?? 5;
    this.memoryType = fields.memoryType;
    this.filter = fields.filter;
    this.semantic = fields.semantic ?? true;
  }

  async _getRelevantDocuments(
    query: string,
    _runManager?: CallbackManagerForRetrieverRun
  ): Promise<LangChainDocument[]> {
    const results: SearchResult[] = await this.client.memory.search(query, {
      topK: this.topK,
      semantic: this.semantic,
      filter: this.filter,
    });

    return results.map(r => ({
      pageContent: r.memory.content,
      metadata: {
        id: r.memory.id,
        score: r.score,
        memoryType: r.memory.memoryType,
        tags: r.memory.tags,
        importanceScore: r.memory.importanceScore,
        createdAt: r.memory.createdAt,
        ...r.memory.metadata,
      },
    }));
  }

  /** LangChain streaming-compatible alias */
  async getRelevantDocuments(
    query: string,
    runManager?: CallbackManagerForRetrieverRun
  ): Promise<LangChainDocument[]> {
    return this._getRelevantDocuments(query, runManager);
  }
}
