import type { ClawDBFileConfig } from './schema.js';
import { ClawDBConfigSchema } from './schema.js';

/**
 * Merges multiple partial config sources with last-wins semantics.
 * Missing fields are filled in from the Zod schema defaults.
 *
 * @example
 * const config = mergeConfigs(fileConfig, envConfig, explicitConfig);
 */
export function mergeConfigs(...configs: Partial<ClawDBFileConfig>[]): ClawDBFileConfig {
  const merged: Partial<ClawDBFileConfig> = {};

  for (const cfg of configs) {
    if (!cfg) continue;
    for (const [key, value] of Object.entries(cfg) as [keyof ClawDBFileConfig, unknown][]) {
      if (value === undefined) continue;

      if (key === 'sync' && typeof value === 'object' && value !== null) {
        const currentSync = merged.sync;
        const nextSync = value as ClawDBFileConfig['sync'];
        merged.sync = {
          interval_secs: currentSync?.interval_secs ?? nextSync?.interval_secs ?? 30,
          ...(currentSync ?? {}),
          ...(nextSync ?? {}),
        };
      } else if (key === 'reflect' && typeof value === 'object' && value !== null) {
        merged.reflect = {
          ...(merged.reflect ?? {}),
          ...(value as ClawDBFileConfig['reflect']),
        };
      } else {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
  }

  // Apply schema defaults for any missing fields
  return ClawDBConfigSchema.parse(merged);
}
