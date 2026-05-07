import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';

import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import prompts from 'prompts';
import clawdb, { ClawDB } from '@clawdb/sdk';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProjectType = 'node' | 'python' | 'go' | 'rust' | 'unknown';
export type BackendType = 'sqlite' | 'postgres' | 'cloud';
export type EditorHost = 'claude' | 'cursor' | 'vscode' | 'continue' | 'zed';

type JsonRecord = Record<string, unknown>;

// ─── Output helpers ───────────────────────────────────────────────────────────

function isJsonMode(jsonFlag = false): boolean {
  return jsonFlag || !process.stdout.isTTY;
}

function writeOutput(payload: unknown, jsonFlag = false): void {
  if (isJsonMode(jsonFlag)) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  if (typeof payload === 'string') {
    process.stdout.write(`${payload}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function writeError(error: unknown, jsonFlag = false): never {
  const message = error instanceof Error ? error.message : String(error);
  if (isJsonMode(jsonFlag)) {
    process.stderr.write(`${JSON.stringify({ error: message }, null, 2)}\n`);
  } else {
    process.stderr.write(`${chalk.red('Error:')} ${message}\n`);
  }
  process.exit(1);
}

// ─── Project/backend detection ─────────────────────────────────────────────

function cwdFileNames(): string[] {
  return ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml'].filter((file) => existsSync(resolve(process.cwd(), file)));
}

export function detectProjectType(fileNames = cwdFileNames()): ProjectType {
  if (fileNames.includes('package.json')) return 'node';
  if (fileNames.includes('pyproject.toml')) return 'python';
  if (fileNames.includes('go.mod')) return 'go';
  if (fileNames.includes('Cargo.toml')) return 'rust';
  return 'unknown';
}

export function detectBackend(env: NodeJS.ProcessEnv = process.env): BackendType {
  if (env.CLAWDB_API_KEY) return 'cloud';
  if (env.DATABASE_URL) return 'postgres';
  return 'sqlite';
}

export function formatSnippet(projectType: ProjectType): string {
  switch (projectType) {
    case 'node':
      return "TypeScript:  import clawdb from '@clawdb/sdk'";
    case 'python':
      return 'Python:      from clawdb import clawdb';
    case 'go':
      return 'Go:          db, err := clawdb.New(clawdb.Options{})';
    case 'rust':
      return 'Rust:        let db = ClawDBClient::auto_provision().await?;';
    default:
      return "TypeScript:  import clawdb from '@clawdb/sdk'";
  }
}

// ─── Env / config helpers ─────────────────────────────────────────────────

function renderBanner(): string {
  return [
    '┌─────────────────────────────────────────┐',
    '│  ClawDB — zero-config agent database    │',
    '└─────────────────────────────────────────┘'
  ].join('\n');
}

function envFilePath(): string {
  return resolve(process.cwd(), '.clawdb.env');
}

function readDotEnvFile(): Record<string, string> {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return {};
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/u);
  const result: Record<string, string> = {};
  for (const line of lines) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/u);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function writeClawdbEnv(values: Record<string, string>): void {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  writeFileSync(envFilePath(), `${lines.join('\n')}\n`, 'utf8');
}

// ─── Server process helpers ───────────────────────────────────────────────

function pidPath(): string {
  return join(homedir(), '.clawdb', 'server.pid');
}

function commandExists(command: string): boolean {
  const probe = process.platform === 'win32'
    ? spawnSync('where', [command], { stdio: 'ignore' })
    : spawnSync('which', [command], { stdio: 'ignore' });
  return probe.status === 0;
}

function tryStopPid(): boolean {
  if (!existsSync(pidPath())) return false;
  const pid = Number(readFileSync(pidPath(), 'utf8').trim());
  if (!Number.isFinite(pid)) return false;
  try {
    process.kill(pid);
    return true;
  } catch {
    return false;
  }
}

function startLocalBinary(port = 50050, detach = false): void {
  const candidates = [
    join(homedir(), '.clawdb', 'bin', process.platform === 'win32' ? 'clawdb-server.exe' : 'clawdb-server')
  ];
  const binary = candidates.find((candidate) => existsSync(candidate))
    ?? (commandExists('clawdb-server') ? 'clawdb-server' : undefined);
  if (typeof binary !== 'string') {
    throw new Error('clawdb-server binary not found in PATH or ~/.clawdb/bin');
  }

  const child = spawn(binary, ['--grpc-port', String(port)], {
    detached: detach,
    stdio: detach ? 'ignore' : 'inherit',
    env: {
      ...process.env,
      CLAW_GUARD_JWT_SECRET: process.env.CLAW_GUARD_JWT_SECRET ?? 'clawdb-sdk-local-dev-secret',
      CLAW_VECTOR_ENABLED: process.env.CLAW_VECTOR_ENABLED ?? 'false'
    }
  });

  if (detach) {
    child.unref();
    mkdirSync(dirname(pidPath()), { recursive: true });
    writeFileSync(pidPath(), String(child.pid), 'utf8');
  }
}

// ─── Version / client helpers ──────────────────────────────────────────────

function cliVersion(): string {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function getDb(override?: { endpoint?: string }): Promise<ClawDB> {
  if (override?.endpoint) {
    return new ClawDB({ endpoint: override.endpoint, agentId: process.env.CLAWDB_AGENT_ID });
  }
  return clawdb();
}

// ─── Smoke test ───────────────────────────────────────────────────────────

async function smokeTest(db: ClawDB): Promise<void> {
  const id = await db.rememberTyped('clawdb init smoke test', { type: 'message', tags: ['smoke-test'] });
  const hits = await db.search('smoke test', { topK: 3 });
  if (!hits.some((hit) => hit.id === id)) {
    throw new Error('Smoke test search did not return the inserted memory');
  }
  await db.deleteMemory(id);
}

// ─── MCP config helpers ───────────────────────────────────────────────────

export function mcpConfigBlock(host: EditorHost): Record<string, JsonRecord> {
  const block = {
    clawdb: {
      command: 'npx',
      args: ['-y', '@clawdb/mcp-adapter@latest'],
      env: {
        CLAWDB_ENDPOINT: 'http://localhost:50050',
        CLAWDB_AGENT_ID: `${host}`
      }
    }
  };
  return { mcpServers: block };
}

function editorConfigPath(host: EditorHost): string {
  switch (host) {
    case 'claude':
      return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    case 'cursor':
      return join(homedir(), '.cursor', 'mcp.json');
    case 'vscode':
      return resolve(process.cwd(), '.vscode', 'mcp.json');
    case 'continue':
      return join(homedir(), '.continue', 'config.json');
    case 'zed':
      return join(homedir(), '.config', 'zed', 'settings.json');
  }
}

function mergeJsonFile(filePath: string, patch: Record<string, unknown>): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const current = existsSync(filePath)
    ? JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
    : {};
  const next = {
    ...current,
    mcpServers: {
      ...((current.mcpServers as Record<string, unknown> | undefined) ?? {}),
      ...((patch.mcpServers as Record<string, unknown>) ?? {})
    }
  };
  writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

async function maybeInstallClaude(): Promise<void> {
  const response = await prompts({
    type: 'confirm',
    name: 'value',
    initial: true,
    message: 'Install ClawDB for Claude Desktop?'
  });
  if (response.value === false) return;
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['-y', '@clawdb/mcp-adapter', '--install-claude'], {
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error('Failed to install Claude Desktop MCP config');
  }
}

// ─── init command ────────────────────────────────────────────────────────

async function initCommand(options: { cloud?: boolean; dataDir?: string }, jsonFlag = false): Promise<void> {
  const projectType = detectProjectType();
  const dotEnv = readDotEnvFile();
  const backend = options.cloud ? 'cloud' : detectBackend({ ...process.env, ...dotEnv });

  const spinner = ora({ text: 'Initialising ClawDB', isSilent: isJsonMode(jsonFlag) }).start();
  try {
    if (!isJsonMode(jsonFlag)) {
      process.stdout.write(`${renderBanner()}\n`);
    }

    let envValues: Record<string, string> = {};
    let db: ClawDB;

    if (options.cloud || backend === 'cloud') {
      let apiKey = process.env.CLAWDB_API_KEY;
      if (!apiKey) {
        const response = await prompts({ type: 'password', name: 'value', message: 'Enter ClawDB cloud API key' });
        apiKey = response.value;
        if (!apiKey) {
          process.stdout.write('Open https://cloud.clawdb.dev/register to create an API key.\n');
          throw new Error('Cloud API key required for --cloud init');
        }
      }
      process.env.CLAWDB_API_KEY = apiKey;
      process.env.CLAWDB_URL = 'https://cloud.clawdb.dev';
      db = await ClawDB.autoProvision();
      envValues = { CLAWDB_URL: 'https://cloud.clawdb.dev', CLAWDB_API_KEY: apiKey };
    } else {
      db = await ClawDB.autoProvision();
      envValues = { CLAWDB_URL: db.endpoint };
    }

    await smokeTest(db);
    writeClawdbEnv(envValues);
    spinner.stop();

    if (isJsonMode(jsonFlag)) {
      writeOutput({ projectType, backend, endpoint: db.endpoint, envFile: envFilePath(), snippet: formatSnippet(projectType) }, true);
    } else {
      process.stdout.write(`${chalk.green('✓')} Server started on ${db.endpoint}\n`);
      process.stdout.write(`${chalk.green('✓')} Database initialised at ${options.dataDir ?? join(homedir(), '.clawdb')}/\n\n`);
      process.stdout.write('Add to your agent:\n\n');
      process.stdout.write(`  ${formatSnippet(projectType)}\n`);
      process.stdout.write('  MCP:         npx @clawdb/mcp-adapter --install-claude\n\n');
      process.stdout.write("Your agent now has a database. That's it.\n\n");
      await maybeInstallClaude();
    }
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

// ─── cloud login ─────────────────────────────────────────────────────────

async function cloudLogin(jsonFlag = false): Promise<void> {
  const response = await prompts({ type: 'password', name: 'apiKey', message: 'ClawDB cloud API key' });
  if (!response.apiKey) throw new Error('API key is required');
  writeClawdbEnv({ CLAWDB_URL: 'https://cloud.clawdb.dev', CLAWDB_API_KEY: response.apiKey });
  writeOutput({ ok: true, cloud: true }, jsonFlag);
}

// ─── Command registrations ────────────────────────────────────────────────

function registerMcpCommands(program: Command): void {
  const mcp = program.command('mcp').description('MCP adapter management');
  const editors: EditorHost[] = ['claude', 'cursor', 'vscode', 'continue', 'zed'];
  for (const host of editors) {
    mcp.command(`install-${host}`).option('--json', 'JSON output').action((options: { json?: boolean }) => {
      const path = editorConfigPath(host);
      mergeJsonFile(path, mcpConfigBlock(host));
      writeOutput(options.json ? { ok: true, host, configPath: path } : `✓ ClawDB installed for ${host}. Restart to activate.`, options.json);
    });
  }
  mcp.command('print-config').option('--host <host>', 'Target editor host', 'claude').action((options: { host: EditorHost }) => {
    writeOutput(mcpConfigBlock(options.host), true);
  });
}

function registerHealthCommands(program: Command): void {
  program.command('status').description('Show server health').option('--json', 'JSON output').action(async (options: { json?: boolean }) => {
    const db = await getDb();
    writeOutput(await db.health(), options.json);
  });
  program.command('ready').description('Check server readiness').option('--json', 'JSON output').action(async (options: { json?: boolean }) => {
    const db = await getDb();
    await db.ping();
    writeOutput({ ready: true }, options.json);
  });
}

function registerSessionCommands(program: Command): void {
  const session = program.command('session').description('Session management');

  session.command('create')
    .option('--role <role>', 'Role', '')
    .option('--scopes <scopes>', 'Comma-separated scopes')
    .option('--ttl <secs>', 'TTL in seconds', '3600')
    .option('--json', 'JSON output')
    .action(async (options: { role: string; scopes?: string; ttl: string; json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.createSession({
        role: options.role,
        scopes: options.scopes?.split(',').filter(Boolean) ?? [],
        ttlSecs: Number(options.ttl)
      }), options.json);
    });

  session.command('validate')
    .option('--json', 'JSON output')
    .action(async (options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.validateSession(), options.json);
    });

  session.command('revoke <sessionId>')
    .option('--json', 'JSON output')
    .action(async (sessionId: string, options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput({ revoked: await db.revokeSession(sessionId), sessionId }, options.json);
    });

  session.command('count')
    .option('--json', 'JSON output')
    .action(async (options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput({ count: await db.activeSessionCount() }, options.json);
    });
}

function registerMemoryCommands(program: Command): void {
  const memory = program.command('memory').description('Memory operations');

  memory.command('remember <content>')
    .option('--json', 'JSON output')
    .action(async (content: string, options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput({ id: await db.remember(content) }, options.json);
    });

  memory.command('remember-typed <content>')
    .option('--type <t>', 'Memory type', 'context')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--json', 'JSON output')
    .action(async (content: string, options: { type: string; tags?: string; json?: boolean }) => {
      const db = await getDb();
      writeOutput({ id: await db.rememberTyped(content, { type: options.type, tags: options.tags?.split(',').filter(Boolean) }) }, options.json);
    });

  memory.command('update <id> <content>')
    .option('--json', 'JSON output')
    .action(async (id: string, content: string, options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput({ updated: await db.updateMemory(id, content), id }, options.json);
    });

  memory.command('search <query>')
    .option('--top-k <n>', 'Top K results', '5')
    .option('--json', 'JSON output')
    .action(async (query: string, options: { topK: string; json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.search(query, { topK: Number(options.topK) }), options.json);
    });

  memory.command('recall <ids...>')
    .option('--json', 'JSON output')
    .action(async (ids: string[], options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.recall(ids), options.json);
    });

  memory.command('list')
    .option('--type <t>', 'Filter by type')
    .option('--limit <n>', 'Limit', '50')
    .option('--json', 'JSON output')
    .action(async (options: { type?: string; limit: string; json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.listMemories({ type: options.type, limit: Number(options.limit) }), options.json);
    });

  memory.command('delete <id>')
    .option('--json', 'JSON output')
    .action(async (id: string, options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput({ deleted: await db.deleteMemory(id), id }, options.json);
    });
}

function registerBranchCommands(program: Command): void {
  const branch = program.command('branch').description('Branch management');

  branch.command('fork <name>')
    .option('--from <branchId>', 'Source branch ID')
    .option('--json', 'JSON output')
    .action(async (name: string, options: { from?: string; json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.branch(name, options.from), options.json);
    });

  branch.command('list')
    .option('--json', 'JSON output')
    .action(async (options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.listBranches(), options.json);
    });

  branch.command('get <id>')
    .option('--json', 'JSON output')
    .action(async (id: string, options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.getBranch(id), options.json);
    });

  branch.command('get-by-name <name>')
    .option('--json', 'JSON output')
    .action(async (name: string, options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.getBranchByName(name), options.json);
    });

  branch.command('trunk')
    .option('--json', 'JSON output')
    .action(async (options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.getTrunkBranch(), options.json);
    });

  branch.command('diff <id>')
    .option('--target <t>', 'Target branch ID (default: trunk)', '')
    .option('--json', 'JSON output')
    .action(async (id: string, options: { target: string; json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.diff(id, options.target), options.json);
    });

  branch.command('merge <source>')
    .option('--target <t>', 'Target branch (default: trunk)', '')
    .option('--strategy <s>', 'Merge strategy', '')
    .option('--json', 'JSON output')
    .action(async (source: string, options: { target: string; strategy: string; json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.merge(source, options.target, options.strategy), options.json);
    });

  branch.command('discard <id>')
    .option('--json', 'JSON output')
    .action(async (id: string, options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput({ discarded: await db.discardBranch(id), id }, options.json);
    });

  branch.command('archive <id>')
    .option('--json', 'JSON output')
    .action(async (id: string, options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput({ archived: await db.archiveBranch(id), id }, options.json);
    });
}

function registerSyncCommands(program: Command): void {
  const sync = program.command('sync').description('Sync operations');

  sync.command('run')
    .option('--json', 'JSON output')
    .action(async (options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.sync(), options.json);
    });

  sync.command('push')
    .option('--json', 'JSON output')
    .action(async (options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.pushSync(), options.json);
    });

  sync.command('pull')
    .option('--json', 'JSON output')
    .action(async (options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.pullSync(), options.json);
    });

  sync.command('reconcile')
    .option('--json', 'JSON output')
    .action(async (options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.reconcileSync(), options.json);
    });

  sync.command('status')
    .option('--json', 'JSON output')
    .action(async (options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.syncStatus(), options.json);
    });
}

function registerReflectCommands(program: Command): void {
  const reflect = program.command('reflect').description('Reflection operations');

  reflect.command('run')
    .option('--watch', 'Poll until job completes')
    .option('--json', 'JSON output')
    .action(async (options: { watch?: boolean; json?: boolean }) => {
      const db = await getDb();
      const job = await db.reflect() as { jobId?: string; status?: string };
      if (options.watch && job.jobId) {
        let current: unknown = job;
        const spinner = ora({ text: `Job ${job.jobId}: ${job.status ?? ''}`, isSilent: isJsonMode(options.json) }).start();
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const polled = await db.reflectGetJob(job.jobId) as { status?: string };
          current = polled;
          spinner.text = `Job ${job.jobId}: ${polled.status ?? ''}`;
          if (polled.status === 'completed' || polled.status === 'failed') break;
          await new Promise((r) => setTimeout(r, 2000));
        }
        spinner.stop();
        writeOutput(current, options.json);
      } else {
        writeOutput(job, options.json);
      }
    });

  reflect.command('jobs')
    .option('--agent-id <id>', 'Agent ID', '')
    .option('--status <s>', 'Filter by status')
    .option('--limit <n>', 'Limit', '20')
    .option('--offset <n>', 'Offset', '0')
    .option('--json', 'JSON output')
    .action(async (options: { agentId: string; status?: string; limit: string; offset: string; json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.reflectListJobs(options.agentId, {
        status: options.status,
        limit: Number(options.limit),
        offset: Number(options.offset)
      }), options.json);
    });

  reflect.command('job <jobId>')
    .option('--json', 'JSON output')
    .action(async (jobId: string, options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.reflectGetJob(jobId), options.json);
    });

  reflect.command('facts <agentId>')
    .option('--json', 'JSON output')
    .action(async (agentId: string, options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.reflectGetFacts(agentId), options.json);
    });

  reflect.command('preferences <agentId>')
    .option('--json', 'JSON output')
    .action(async (agentId: string, options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.reflectGetPreferences(agentId), options.json);
    });

  reflect.command('contradictions <agentId>')
    .option('--json', 'JSON output')
    .action(async (agentId: string, options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.reflectGetContradictions(agentId), options.json);
    });

  reflect.command('resolve <agentId> <contradictionId>')
    .option('--strategy <s>', 'Resolution strategy', '')
    .option('--merged-value <json>', 'Merged value JSON', '')
    .option('--json', 'JSON output')
    .action(async (agentId: string, contradictionId: string, options: { strategy: string; mergedValue: string; json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.reflectResolveContradiction(agentId, contradictionId, {
        strategy: options.strategy,
        mergedValueJson: options.mergedValue
      }), options.json);
    });
}

function registerTxCommands(program: Command): void {
  const tx = program.command('tx').description('Transactional memory operations');

  tx.command('begin')
    .option('--json', 'JSON output')
    .action(async (options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput(await db.beginTx(), options.json);
    });

  tx.command('remember <txId> <content>')
    .option('--json', 'JSON output')
    .action(async (txId: string, content: string, options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput({ txId, memoryId: await db.txRemember(txId, content) }, options.json);
    });

  tx.command('remember-typed <txId> <content>')
    .option('--type <t>', 'Memory type', 'context')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--json', 'JSON output')
    .action(async (txId: string, content: string, options: { type: string; tags?: string; json?: boolean }) => {
      const db = await getDb();
      writeOutput({ txId, memoryId: await db.txRememberTyped(txId, content, { type: options.type, tags: options.tags?.split(',').filter(Boolean) }) }, options.json);
    });

  tx.command('commit <txId>')
    .option('--json', 'JSON output')
    .action(async (txId: string, options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput({ committed: await db.commitTx(txId), txId }, options.json);
    });

  tx.command('rollback <txId>')
    .option('--json', 'JSON output')
    .action(async (txId: string, options: { json?: boolean }) => {
      const db = await getDb();
      writeOutput({ rolledBack: await db.rollbackTx(txId), txId }, options.json);
    });
}

// ─── main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const program = new Command();
  const version = cliVersion();
  program.name('clawdb').description('ClawDB command line interface').version(version);

  program.command('init')
    .description('Initialise ClawDB for this project')
    .option('--cloud', 'Use cloud mode')
    .option('--data-dir <path>', 'Data directory')
    .option('--json', 'JSON output')
    .action(async (options: { cloud?: boolean; dataDir?: string; json?: boolean }) => {
      await initCommand(options, options.json);
    });

  program.command('start')
    .description('Start the local clawdb-server')
    .option('--port <n>', 'gRPC port', '50050')
    .option('--detach', 'Detach process')
    .option('--json', 'JSON output')
    .action((options: { port: string; detach?: boolean; json?: boolean }) => {
      startLocalBinary(Number(options.port), Boolean(options.detach));
      writeOutput({ started: true, port: Number(options.port), detach: Boolean(options.detach) }, options.json);
    });

  program.command('stop')
    .description('Stop a detached local server')
    .option('--json', 'JSON output')
    .action((options: { json?: boolean }) => {
      writeOutput({ stopped: tryStopPid() }, options.json);
    });

  registerHealthCommands(program);
  registerSessionCommands(program);
  registerMemoryCommands(program);
  registerBranchCommands(program);
  registerSyncCommands(program);
  registerReflectCommands(program);
  registerTxCommands(program);

  const cloud = program.command('cloud').description('Cloud account management');
  cloud.command('login').option('--json', 'JSON output').action(async (options: { json?: boolean }) => cloudLogin(options.json));
  cloud.command('logout').option('--json', 'JSON output').action((options: { json?: boolean }) => {
    writeClawdbEnv({ CLAWDB_URL: '', CLAWDB_API_KEY: '' });
    writeOutput({ loggedOut: true }, options.json);
  });
  cloud.command('status').option('--json', 'JSON output').action((options: { json?: boolean }) => {
    const env = existsSync(envFilePath()) ? readFileSync(envFilePath(), 'utf8') : '';
    writeOutput({ configured: env.includes('CLAWDB_API_KEY=') }, options.json);
  });

  registerMcpCommands(program);

  program.command('version').option('--json', 'JSON output').action((options: { json?: boolean }) => writeOutput({ version }, options.json));

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    writeError(error);
  }
}

if (require.main === module) {
  void main();
}
