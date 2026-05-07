import { describe, expect, it } from 'vitest';
import { detectProjectType, detectBackend, formatSnippet, mcpConfigBlock } from '../index';

describe('cli helpers', () => {
  it('detects backend from env', () => {
    expect(detectBackend({ DATABASE_URL: 'postgres://x' })).toBe('postgres');
    expect(detectBackend({ CLAWDB_API_KEY: 'k' })).toBe('cloud');
    expect(detectBackend({})).toBe('sqlite');
  });

  it('formats snippets', () => {
    expect(formatSnippet('node')).toContain("import clawdb from '@clawdb/sdk'");
    expect(formatSnippet('python')).toContain('from clawdb import clawdb');
  });

  it('builds editor config block', () => {
    const claude = mcpConfigBlock('claude') as { mcpServers: { clawdb: { command: string; env: { CLAWDB_AGENT_ID: string } } } };
    expect(claude.mcpServers.clawdb.command).toBe('npx');
    expect(claude.mcpServers.clawdb.env.CLAWDB_AGENT_ID).toBe('claude');

    const zed = mcpConfigBlock('zed') as { mcpServers: { clawdb: { env: { CLAWDB_AGENT_ID: string } } } };
    expect(zed.mcpServers.clawdb.env.CLAWDB_AGENT_ID).toBe('zed');
  });

  it('detects project type from filenames', () => {
    expect(detectProjectType(['package.json'])).toBe('node');
    expect(detectProjectType(['pyproject.toml'])).toBe('python');
  });
});
