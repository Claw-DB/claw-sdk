import type { ZodError } from 'zod';
import type { ClawDBFileConfig } from './schema.js';
import { ClawDBConfigSchema } from './schema.js';
import { mergeConfigs } from './merge.js';

// Default config path: ~/.clawdb/config.toml
function defaultConfigPath(): string {
  try {
    if (typeof process !== 'undefined') {
      const os = require('node:os') as typeof import('os');
      const path = require('node:path') as typeof import('path');
      return path.join(os.homedir(), '.clawdb', 'config.toml');
    }
  } catch { /* not available in edge runtimes */ }
  return '.clawdb/config.toml';
}

// Minimal TOML serialiser (covers the ClawDB config subset)
function serializeToml(obj: Record<string, unknown>, indent = ''): string {
  const lines: string[] = [];
  const nested: [string, Record<string, unknown>][] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      nested.push([key, value as Record<string, unknown>]);
    } else if (typeof value === 'string') {
      lines.push(`${indent}${key} = ${JSON.stringify(value)}`);
    } else if (typeof value === 'boolean') {
      lines.push(`${indent}${key} = ${value}`);
    } else if (typeof value === 'number') {
      lines.push(`${indent}${key} = ${value}`);
    } else if (Array.isArray(value)) {
      lines.push(`${indent}${key} = [${(value as unknown[]).map(v => JSON.stringify(v)).join(', ')}]`);
    }
  }

  for (const [section, content] of nested) {
    lines.push('');
    lines.push(`[${section}]`);
    lines.push(serializeToml(content));
  }

  return lines.join('\n');
}

// Minimal TOML parser (covers the ClawDB config subset)
function parseToml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let current: Record<string, unknown> = result;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // Section header
    const sectionMatch = /^\[([^\]]+)]$/.exec(line);
    if (sectionMatch) {
      const sectionName = sectionMatch[1]!;
      const section: Record<string, unknown> = {};
      result[sectionName] = section;
      current = section;
      continue;
    }

    // Key = value
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const rawVal = line.slice(eqIdx + 1).trim();

    let value: unknown;
    if (rawVal === 'true') value = true;
    else if (rawVal === 'false') value = false;
    else if (/^-?\d+(\.\d+)?$/.test(rawVal)) value = Number(rawVal);
    else if (rawVal.startsWith('"') || rawVal.startsWith("'")) {
      try { value = JSON.parse(rawVal); } catch { value = rawVal.slice(1, -1); }
    } else if (rawVal.startsWith('[')) {
      try { value = JSON.parse(rawVal); } catch { value = []; }
    } else {
      value = rawVal;
    }

    current[key] = value;
  }

  return result;
}

export class ConfigFileManager {
  private readonly configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath ?? defaultConfigPath();
  }

  /** Returns the resolved absolute path of the config file. */
  path(): string {
    return this.configPath;
  }

  /** Returns true if the config file exists. */
  exists(): boolean {
    try {
      const fs = require('node:fs') as typeof import('fs');
      return fs.existsSync(this.configPath);
    } catch {
      return false;
    }
  }

  /**
   * Reads, parses, and validates the config file.
   * Throws if the file cannot be read or fails schema validation.
   */
  read(): ClawDBFileConfig {
    try {
      const fs = require('node:fs') as typeof import('fs');
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsed = parseToml(raw);
      return ClawDBConfigSchema.parse(parsed);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return ClawDBConfigSchema.parse({});
      }
      throw err;
    }
  }

  /**
   * Merges the provided partial config with the existing file and writes it.
   */
  write(config: Partial<ClawDBFileConfig>): void {
    const existing = this.exists() ? this.read() : {};
    const merged = mergeConfigs(existing, config);
    this.writeRaw(merged);
  }

  /** Sets a single config key and persists the file. */
  set<K extends keyof ClawDBFileConfig>(key: K, value: ClawDBFileConfig[K]): void {
    this.write({ [key]: value } as Partial<ClawDBFileConfig>);
  }

  /** Reads a single config key. */
  get<K extends keyof ClawDBFileConfig>(key: K): ClawDBFileConfig[K] {
    return this.read()[key];
  }

  /**
   * Validates the config file against the schema without throwing.
   */
  validate(): { ok: boolean; errors: ZodError | null } {
    try {
      const fs = require('node:fs') as typeof import('fs');
      if (!fs.existsSync(this.configPath)) return { ok: false, errors: null };
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsed = parseToml(raw);
      const result = ClawDBConfigSchema.safeParse(parsed);
      return result.success
        ? { ok: true, errors: null }
        : { ok: false, errors: result.error };
    } catch {
      return { ok: false, errors: null };
    }
  }

  /** Writes a default config file (overwrites existing). */
  reset(): void {
    const defaults = ClawDBConfigSchema.parse({});
    this.writeRaw(defaults);
  }

  private writeRaw(config: ClawDBFileConfig): void {
    const fs = require('node:fs') as typeof import('fs');
    const path = require('node:path') as typeof import('path');
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    fs.writeFileSync(this.configPath, serializeToml(config as unknown as Record<string, unknown>), 'utf8');
  }
}
