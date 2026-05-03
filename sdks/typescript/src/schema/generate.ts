import type { MemorySchema } from './define.js';
import type { z } from 'zod';

/**
 * Converts a JSON Schema object to a Zod code string for use in codegen pipelines.
 *
 * Supports: string, number, integer, boolean, object, array, enum, nullable, $ref (inline only).
 */
export function generateZodSchema(jsonSchema: Record<string, unknown>): string {
  function convert(schema: Record<string, unknown>, indent = 0): string {
    const pad = '  '.repeat(indent);

    if ('enum' in schema && Array.isArray(schema['enum'])) {
      const values = (schema['enum'] as unknown[]).map(v => JSON.stringify(v)).join(', ');
      return `z.enum([${values}])`;
    }

    const type = schema['type'] as string | string[] | undefined;

    if (Array.isArray(type)) {
      // Union type e.g. ["string", "null"]
      const nonNull = type.filter(t => t !== 'null');
      const base = convert({ ...schema, type: nonNull[0] }, indent);
      return type.includes('null') ? `${base}.nullable()` : base;
    }

    switch (type) {
      case 'string': {
        let zod = 'z.string()';
        if (schema['format'] === 'date-time') zod += '.datetime()';
        if (schema['format'] === 'uuid') zod += '.uuid()';
        if (schema['format'] === 'email') zod += '.email()';
        if (typeof schema['minLength'] === 'number') zod += `.min(${schema['minLength']})`;
        if (typeof schema['maxLength'] === 'number') zod += `.max(${schema['maxLength']})`;
        return zod;
      }
      case 'number':
        return 'z.number()';
      case 'integer':
        return 'z.number().int()';
      case 'boolean':
        return 'z.boolean()';
      case 'null':
        return 'z.null()';
      case 'array': {
        const items = schema['items'] as Record<string, unknown> | undefined;
        const inner = items ? convert(items, indent) : 'z.unknown()';
        return `z.array(${inner})`;
      }
      case 'object': {
        const props = schema['properties'] as Record<string, Record<string, unknown>> | undefined;
        const required = (schema['required'] as string[] | undefined) ?? [];
        if (!props || Object.keys(props).length === 0) return 'z.record(z.unknown())';

        const propLines = Object.entries(props).map(([key, propSchema]) => {
          const zodField = convert(propSchema, indent + 1);
          const isRequired = required.includes(key);
          return `${pad}  ${JSON.stringify(key)}: ${zodField}${isRequired ? '' : '.optional()'}`;
        });

        return `z.object({\n${propLines.join(',\n')}\n${pad}})`;
      }
      default:
        return 'z.unknown()';
    }
  }

  return convert(jsonSchema as Record<string, unknown>);
}

/**
 * Generates a `.d.ts` type declaration for a MemorySchema.
 */
export function generateTypeScript(schema: MemorySchema<z.ZodObject<z.ZodRawShape>>): string {
  const shapeEntries = Object.entries(schema.metadataSchema.shape) as [string, z.ZodTypeAny][];

  function zodToTs(zodType: z.ZodTypeAny): string {
    const typeName = (zodType as { _def: { typeName: string } })._def.typeName;
    switch (typeName) {
      case 'ZodString': return 'string';
      case 'ZodNumber': return 'number';
      case 'ZodBoolean': return 'boolean';
      case 'ZodNull': return 'null';
      case 'ZodUndefined': return 'undefined';
      case 'ZodUnknown': return 'unknown';
      case 'ZodAny': return 'any';
      case 'ZodOptional':
        return `${zodToTs((zodType as z.ZodOptional<z.ZodTypeAny>).unwrap())} | undefined`;
      case 'ZodNullable':
        return `${zodToTs((zodType as z.ZodNullable<z.ZodTypeAny>).unwrap())} | null`;
      case 'ZodArray':
        return `Array<${zodToTs((zodType as z.ZodArray<z.ZodTypeAny>).element)}>`;
      case 'ZodEnum': {
        const values = (zodType as z.ZodEnum<[string, ...string[]]>).options;
        return values.map(v => JSON.stringify(v)).join(' | ');
      }
      case 'ZodObject': {
        const shape = (zodType as z.ZodObject<z.ZodRawShape>).shape;
        const fields = Object.entries(shape)
          .map(([k, v]) => `  ${k}: ${zodToTs(v as z.ZodTypeAny)}`)
          .join(';\n');
        return `{\n${fields}\n}`;
      }
      default:
        return 'unknown';
    }
  }

  const fields = shapeEntries.map(([key, zType]) => {
    const optional = (zType as { _def: { typeName: string } })._def.typeName === 'ZodOptional';
    return `  ${key}${optional ? '?' : ''}: ${zodToTs(zType)};`;
  });

  return [
    `/** Metadata for '${schema.name}' memory records (type: '${schema.memoryType}'). */`,
    `export interface ${toPascalCase(schema.name)}Metadata {`,
    ...fields,
    `}`,
  ].join('\n');
}

function toPascalCase(str: string): string {
  return str.replace(/(^|[-_\s]+)(\w)/g, (_, __, c: string) => c.toUpperCase());
}
