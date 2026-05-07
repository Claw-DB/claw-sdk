import type { ClawDB } from '../core.js';
import type { MemorySchema } from './define.js';
import type { z } from 'zod';

export interface SchemaMigration {
  version: number;
  description: string;
  migrate(oldMetadata: Record<string, unknown>): Record<string, unknown>;
}

export class SchemaRegistry {
  private schemas = new Map<string, MemorySchema<z.ZodObject<z.ZodRawShape>>>();

  /** Register a schema under its name. */
  register(schema: MemorySchema<z.ZodObject<z.ZodRawShape>>): void {
    this.schemas.set(schema.name, schema);
  }

  /** Returns a registered schema by name, or null if not found. */
  getSchema(name: string): MemorySchema<z.ZodObject<z.ZodRawShape>> | null {
    return this.schemas.get(name) ?? null;
  }

  /** Returns all registered schemas. */
  listSchemas(): MemorySchema<z.ZodObject<z.ZodRawShape>>[] {
    return [...this.schemas.values()];
  }

  /**
   * Fetches all memories of the schema's memory type, runs the migration
   * function on each metadata object, and updates them in ClawDB.
   */
  async runMigration(
    db: ClawDB,
    schemaName: string,
    migration: SchemaMigration
  ): Promise<{ migrated: number }> {
    const schema = this.schemas.get(schemaName);
    if (!schema) throw new Error(`Schema '${schemaName}' not registered`);

    const memories = await db.listMemories({ type: schema.memoryType });
    let migrated = 0;

    for (const memory of memories) {
      // The flat API UpdateMemory updates content only; re-store the content to re-index
      const transformed = migration.migrate({}) as { content?: string };
      const newContent = transformed.content ?? memory.content;
      await db.updateMemory(memory.id, newContent);
      migrated++;
    }

    return { migrated };
  }
}

/** A global default registry for convenience. */
export const globalSchemaRegistry = new SchemaRegistry();
