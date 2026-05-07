import { z } from 'zod';
import type { ClawDB, SearchHit } from '../core.js';
import type { MemoryType, RememberOptions } from '../types.js';

export interface MemorySchema<T extends z.ZodObject<z.ZodRawShape>> {
  memoryType: MemoryType;
  name: string;
  description?: string;
  metadataSchema: T;
  defaultTags: string[];
  /**
   * Validates metadata against the schema, throwing a ZodError on failure.
   */
  validate(metadata: unknown): z.infer<T>;
  /**
   * Stores a typed memory record.
   * @example
   * const id = await TaskSchema.remember(db, "Ship the SDK", { priority: "high" });
   */
  remember(
    db: ClawDB,
    content: string,
    metadata: z.infer<T>,
    options?: RememberOptions
  ): Promise<string>;
  /**
   * Searches memories of this schema's type, optionally filtering by metadata fields.
   */
  search(
    db: ClawDB,
    query: string,
    filter?: Partial<z.infer<T>>
  ): Promise<SearchHit[]>;
}

/**
 * Defines a typed memory schema that enforces structure on metadata fields.
 *
 * @example
 * ```ts
 * const TaskSchema = defineMemorySchema({
 *   memoryType: 'task',
 *   name: 'task',
 *   metadataSchema: z.object({
 *     priority: z.enum(['low', 'medium', 'high']),
 *     dueDate: z.string().datetime().optional(),
 *     assignee: z.string().optional(),
 *   }),
 *   defaultTags: ['task'],
 * });
 *
 * const id = await TaskSchema.remember(db, "Finish the ClawDB SDK", { priority: 'high' });
 * ```
 */
export function defineMemorySchema<T extends z.ZodObject<z.ZodRawShape>>(options: {
  memoryType: MemoryType;
  name: string;
  description?: string;
  metadataSchema: T;
  defaultTags?: string[];
}): MemorySchema<T> {
  const { memoryType, name, description, metadataSchema, defaultTags = [] } = options;

  return {
    memoryType,
    name,
    description,
    metadataSchema,
    defaultTags,

    validate(metadata: unknown): z.infer<T> {
      return metadataSchema.parse(metadata);
    },

    async remember(
      db: ClawDB,
      content: string,
      _metadata: z.infer<T>,
      extraOptions?: RememberOptions
    ): Promise<string> {
      return db.rememberTyped(content, {
        type: memoryType as string,
        tags: [...defaultTags, ...(extraOptions?.tags ?? [])],
      });
    },

    async search(
      db: ClawDB,
      query: string,
      filter?: Partial<z.infer<T>>
    ): Promise<SearchHit[]> {
      return db.search(query, {
        filter: filter ? (filter as Record<string, unknown>) : undefined,
      });
    },
  };
}
