import { z } from 'zod';

export const ClawDBConfigSchema = z.object({
  endpoint: z.string().url().optional(),
  api_key: z.string().optional(),
  agent_id: z.string().uuid().optional(),
  workspace: z.string().optional(),
  role: z.string().default('assistant'),
  log_level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  log_format: z.enum(['pretty', 'json']).default('pretty'),
  timeout_ms: z.number().int().min(100).max(300_000).default(30_000),
  tls: z.boolean().default(false),
  sync: z
    .object({
      hub_url: z.string().url().optional(),
      interval_secs: z.number().default(30),
    })
    .optional(),
  reflect: z
    .object({
      service_url: z.string().url().optional(),
    })
    .optional(),
});

export type ClawDBFileConfig = z.infer<typeof ClawDBConfigSchema>;
