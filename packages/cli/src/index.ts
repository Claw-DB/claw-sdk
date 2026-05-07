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

export type ProjectType = 'node' | 'python' | 'go' | 'rust' | 'unknown';
export type BackendType = 'sqlite' | 'postgres' | 'cloud';
export type EditorHost = 'claude' | 'cursor' | 'vscode' | 'continue' | 'zed';

type JsonRecord = Record<string, unknown>;

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

async function smokeTest(db: ClawDB): Promise<void> {
  const id = await db.memory.remember('clawdb init smoke test', { memoryType: 'message', tags: ['smoke-test'] });
  const hits = await db.memory.search('smoke test', { topK: 3 });
  if (!hits.some((hit) => hit.id === id)) {
    throw new Error('Smoke test search did not return the inserted memory');
  }
  await db.memory.delete(id);
}

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

  const child = spawn(binary, ['--port', String(port)], {
    detached: detach,
    stdio: detach ? 'ignore' : 'inherit'
  });

  if (detach) {
    child.unref();
    mkdirSync(dirname(pidPath()), { recursive: true });
    writeFileSync(pidPath(), String(child.pid), 'utf8');
  }
}

function cliVersion(): string {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function healthEndpoint(): string {
  return process.env.CLAWDB_URL ?? 'http://127.0.0.1:50050';
}

async function getDb(override?: { endpoint?: string }): Promise<ClawDB> {
  if (override?.endpoint) {
    return new ClawDB({ endpoint: override.endpoint, agentId: process.env.CLAWDB_AGENT_ID });
  }
  return clawdb();
}

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

async function initCommand(options: { cloud?: boolean; dataDir?: string }, jsonFlag = false): Promise<void> {
  const projectType = detectProjectType();
  const dotEnv = readDotEnvFile();
  const backend = options.cloud ? 'cloud' : detectBackend({ ...process.env, ...dotEnv });

  const spinner = ora({ text: 'Initialising ClawDB', isSilent: isJsonMode(jsonFlag) }).start();
  try {
    if (!isJsonMode(jsonFlag)) {
      process.stdout.write(`${renderBanner()}\n`);
      process.stdout.write(`${chalk.green('✓')} Detected environment: ${projectType === 'unknown' ? 'Generic project' : projectType === 'node' ? 'Node.js project' : projectType === 'python' ? 'Python project' : projectType === 'go' ? 'Go project' : 'Rust project'}\n`);
      process.stdout.write(`${chalk.green('✓')} Auto-selected backend: ${backend === 'sqlite' ? 'SQLite (local)' : backend === 'postgres' ? 'Postgres mode' : 'Cloud mode'}\n`);
    }

    let envValues: Record<string, string> = {};
    let db: ClawDB;

    if (options.cloud || backend === 'cloud') {
      let apiKey = process.env.CLAWDB_API_KEY;
      if (!apiKey) {
        const response = await prompts({ type: 'password', name: 'value', message: 'Enter ClawDB cloud API key (leave blank to sign up in browser)' });
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
      writeOutput({
        projectType,
        backend,
        endpoint: db.endpoint,
        envFile: envFilePath(),
        snippet: formatSnippet(projectType)
      }, true);
    } else {
      process.stdout.write(`${chalk.green('✓')} Server started on ${db.endpoint.replace('http://', '')}\n`);
      process.stdout.write(`${chalk.green('✓')} Embeddings: all-MiniLM-L6-v2 (local, no API key needed)\n`);
      process.stdout.write(`${chalk.green('✓')} Database initialised at ${options.dataDir ?? join(homedir(), '.clawdb')}/\n\n`);
      process.stdout.write('Add to your agent:\n\n');
      process.stdout.write(`  ${formatSnippet(projectType)}\n`);
      process.stdout.write('  MCP:         npx @clawdb/mcp-adapter --install-claude\n\n');
      process.stdout.write("Your agent now has a database. That's it.\n\n");
      process.stdout.write('─────────────────────────────────────────\n');
      process.stdout.write('Optional: connect to the cloud for sync across devices.\n');
      process.stdout.write('Run: clawdb cloud login\n');
      await maybeInstallClaude();
    }
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

async function statusCommand(jsonFlag = false): Promise<void> {
  const db = await getDb();
  const health = await db.health.check();
  writeOutput(health, jsonFlag);
}

async function cloudLogin(jsonFlag = false): Promise<void> {
  const response = await prompts({ type: 'password', name: 'apiKey', message: 'ClawDB cloud API key' });
  if (!response.apiKey) {
    throw new Error('API key is required');
  }
  writeClawdbEnv({ CLAWDB_URL: 'https://cloud.clawdb.dev', CLAWDB_API_KEY: response.apiKey });
  writeOutput({ ok: true, cloud: true }, jsonFlag);
}

function registerMcpCommands(program: Command): void {
  const mcp = program.command('mcp');
  mcp.command('install-claude').option('--json', 'JSON output').action((options: { json?: boolean }) => {
    const path = editorConfigPath('claude');
    mergeJsonFile(path, mcpConfigBlock('claude'));
    writeOutput(options.json ? { ok: true, host: 'claude', configPath: path } : '✓ ClawDB installed for Claude Desktop. Restart Claude Desktop to activate.', options.json);
  });
  mcp.command('install-cursor').option('--json', 'JSON output').action((options: { json?: boolean }) => {
    const path = editorConfigPath('cursor');
    mergeJsonFile(path, mcpConfigBlock('cursor'));
    writeOutput(options.json ? { ok: true, host: 'cursor', configPath: path } : '✓ ClawDB installed for Cursor. Restart Cursor to activate.', options.json);
  });
  mcp.command('install-vscode').option('--json', 'JSON output').action((options: { json?: boolean }) => {
    const path = editorConfigPath('vscode');
    mergeJsonFile(path, mcpConfigBlock('vscode'));
    writeOutput(options.json ? { ok: true, host: 'vscode', configPath: path } : '✓ ClawDB installed for VS Code. Restart VS Code to activate.', options.json);
  });
  mcp.command('install-continue').option('--json', 'JSON output').action((options: { json?: boolean }) => {
    const path = editorConfigPath('continue');
    mergeJsonFile(path, mcpConfigBlock('continue'));
    writeOutput(options.json ? { ok: true, host: 'continue', configPath: path } : '✓ ClawDB installed for Continue. Restart Continue to activate.', options.json);
  });
  mcp.command('install-zed').option('--json', 'JSON output').action((options: { json?: boolean }) => {
    const path = editorConfigPath('zed');
    mergeJsonFile(path, mcpConfigBlock('zed'));
    writeOutput(options.json ? { ok: true, host: 'zed', configPath: path } : '✓ ClawDB installed for Zed. Restart Zed to activate.', options.json);
  });
  mcp.command('print-config').option('--host <host>', 'Target editor host', 'claude').action((options: { host: EditorHost }) => {
    writeOutput(mcpConfigBlock(options.host), true);
  });
}

function registerMemoryCommands(program: Command): void {
  const memory = program.command('memory');

  memory.command('search <query>').option('--top-k <n>', 'Top K results', '5').option('--json', 'JSON output').action(async (query: string, options: { topK: string; json?: boolean }) => {
    const db = await getDb();
    const hits = await db.memory.search(query, { topK: Number(options.topK) });
    writeOutput(hits, options.json);
  });

  memory.command('remember <content>').option('--type <t>', 'Memory type', 'message').option('--tags <tags>', 'Comma-separated tags').option('--json', 'JSON output').action(async (content: string, options: { type: string; tags?: string; json?: boolean }) => {
    const db = await getDb();
    const id = await db.memory.remember(content, { memoryType: options.type, tags: options.tags?.split(',').filter(Boolean) });
    writeOutput({ id }, options.json);
  });

  memory.command('list').option('--type <t>').option('--limit <n>', 'Limit', '50').option('--json', 'JSON output').action(async (options: { type?: string; limit: string; json?: boolean }) => {
    const db = await getDb();
    const result = await db.memory.list({ type: options.type, limit: Number(options.limit) });
    writeOutput(result, options.json);
  });

  memory.command('delete <id>').option('--json', 'JSON output').action(async (id: string, options: { json?: boolean }) => {
    const db = await getDb();
    await db.memory.delete(id);
    writeOutput({ deleted: id }, options.json);
  });
}

function registerBranchCommands(program: Command): void {
  const branch = program.command('branch');

  branch.command('fork <name>').option('--json', 'JSON output').action(async (name: string, options: { json?: boolean }) => {
    const db = await getDb();
    writeOutput(await db.branch.fork(name), options.json);
  });

  branch.command('merge <branchId>').option('--strategy <s>', 'Merge strategy', 'last-write').option('--json', 'JSON output').action(async (branchId: string, options: { strategy: 'last-write' | 'source-wins'; json?: boolean }) => {
    const db = await getDb();
    writeOutput(await db.branch.merge(branchId, options.strategy), options.json);
  });

  branch.command('list').option('--json', 'JSON output').action(async (options: { json?: boolean }) => {
    const db = await getDb();
    writeOutput(await db.branch.list(), options.json);
  });
}

async function main(): Promise<void> {
  const program = new Command();
  const version = cliVersion();
  program.name('clawdb').description('ClawDB command line interface').version(version);

  program.command('init').option('--cloud', 'Use cloud mode').option('--data-dir <path>', 'Data directory').option('--json', 'JSON output').action(async (options: { cloud?: boolean; dataDir?: string; json?: boolean }) => {
    await initCommand(options, options.json);
  });

  program.command('start').option('--port <n>', 'Port', '50050').option('--detach', 'Detach process').option('--json', 'JSON output').action((options: { port: string; detach?: boolean; json?: boolean }) => {
    startLocalBinary(Number(options.port), Boolean(options.detach));
    writeOutput({ started: true, port: Number(options.port), detach: Boolean(options.detach) }, options.json);
  });

  program.command('stop').option('--json', 'JSON output').action((options: { json?: boolean }) => {
    const stopped = tryStopPid();
    writeOutput({ stopped }, options.json);
  });

  program.command('status').option('--json', 'JSON output').action(async (options: { json?: boolean }) => {
    await statusCommand(options.json);
  });

  registerMemoryCommands(program);
  registerBranchCommands(program);

  program.command('sync').option('--dry-run', 'Dry run').option('--json', 'JSON output').action(async (options: { dryRun?: boolean; json?: boolean }) => {
    if (options.dryRun) {
      writeOutput({ dryRun: true }, options.json);
      return;
    }
    const db = await getDb();
    writeOutput(await db.sync.now(), options.json);
  });

  program.command('reflect').option('--dry-run', 'Dry run').option('--json', 'JSON output').action(async (options: { dryRun?: boolean; json?: boolean }) => {
    if (options.dryRun) {
      writeOutput({ dryRun: true }, options.json);
      return;
    }
    const db = await getDb();
    writeOutput(await db.reflect.run(), options.json);
  });

  const cloud = program.command('cloud');
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
