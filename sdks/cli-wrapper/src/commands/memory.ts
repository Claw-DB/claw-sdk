import readline from 'node:readline';
import type { Command } from 'commander';
import { failure, info, printJson, printTable, spinner, success } from '../utils/output.js';
import { getApiKey, getEndpoint } from '../utils/config.js';

async function buildClient() {
  const { ClawDB } = await import('@clawdb/sdk');
  const db = ClawDB.fromApiKey(getApiKey() ?? '', getEndpoint());
  await db.connect();
  return db;
}

export function registerMemoryCommands(program: Command): void {
  const mem = program.command('memory').alias('mem').description('Memory operations');

  mem
    .command('remember <content>')
    .description('Store a new memory')
    .option('-t, --type <type>', 'Memory type', 'context')
    .option('--tags <tags>', 'Comma-separated tags')
    .action(async (content: string, opts: { type: string; tags?: string }) => {
      const spin = spinner('Storing memory…');
      try {
        const db = await buildClient();
        const tags = opts.tags ? opts.tags.split(',').map(s => s.trim()) : [];
        const id = await db.memory.remember(content, { memoryType: opts.type as any, tags });
        await db.disconnect();
        spin.succeed(`Memory stored: ${id}`);
      } catch (err) {
        spin.fail('Failed to store memory.');
        failure(String(err));
        process.exit(1);
      }
    });

  mem
    .command('search <query>')
    .description('Search memories semantically')
    .option('-k, --top-k <n>', 'Number of results', '5')
    .option('--json', 'Output as JSON')
    .action(async (query: string, opts: { topK: string; json?: boolean }) => {
      const spin = spinner('Searching…');
      try {
        const db = await buildClient();
        const results = await db.memory.search(query, { topK: parseInt(opts.topK, 10) });
        await db.disconnect();
        spin.stop();
        if (opts.json) {
          printJson(results);
        } else {
          printTable(
            ['Score', 'Type', 'Content'],
            results.map(r => [r.score.toFixed(3), r.memory.memoryType, r.memory.content.slice(0, 80)])
          );
        }
      } catch (err) {
        spin.fail('Search failed.');
        failure(String(err));
        process.exit(1);
      }
    });

  mem
    .command('recall <ids...>')
    .description('Retrieve memories by ID')
    .option('--json', 'Output as JSON')
    .action(async (ids: string[], opts: { json?: boolean }) => {
      const spin = spinner('Recalling…');
      try {
        const db = await buildClient();
        const memories = await db.memory.recall(ids);
        await db.disconnect();
        spin.stop();
        if (opts.json) {
          printJson(memories);
        } else {
          memories.forEach(m => console.log(`[${m.id}] ${m.content}`));
        }
      } catch (err) {
        spin.fail('Recall failed.');
        failure(String(err));
        process.exit(1);
      }
    });

  mem
    .command('forget <id>')
    .description('Delete a memory by ID')
    .action(async (id: string) => {
      const spin = spinner('Deleting…');
      try {
        const db = await buildClient();
        await db.memory.forget(id);
        await db.disconnect();
        spin.succeed(`Memory ${id} deleted.`);
      } catch (err) {
        spin.fail('Delete failed.');
        failure(String(err));
        process.exit(1);
      }
    });

  mem
    .command('list')
    .description('List memories')
    .option('--type <type>', 'Filter by type')
    .option('--limit <n>', 'Max results', '20')
    .option('--json', 'Output as JSON')
    .action(async (opts: { type?: string; limit: string; json?: boolean }) => {
      const spin = spinner('Listing…');
      try {
        const db = await buildClient();
        const memories = await db.memory.list({ memoryType: opts.type as any, limit: parseInt(opts.limit, 10) });
        await db.disconnect();
        spin.stop();
        if (opts.json) {
          printJson(memories);
        } else {
          printTable(
            ['ID', 'Type', 'Content'],
            memories.map(m => [m.id.slice(0, 8), m.memoryType, m.content.slice(0, 80)])
          );
        }
      } catch (err) {
        spin.fail('List failed.');
        failure(String(err));
        process.exit(1);
      }
    });

  // REPL mode
  mem
    .command('repl')
    .description('Interactive memory REPL')
    .action(async () => {
      info('Starting memory REPL (type "exit" to quit)…');
      const db = await buildClient();
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true, historySize: 100 });
      rl.setPrompt('clawdb> ');
      rl.prompt();
      rl.on('line', async (line: string) => {
        const cmd = line.trim();
        if (cmd === 'exit' || cmd === 'quit') { rl.close(); await db.disconnect(); return; }
        if (cmd.startsWith('search ')) {
          try {
            const results = await db.memory.search(cmd.slice(7).trim());
            results.forEach(r => console.log(`  [${r.score.toFixed(3)}] ${r.memory.content}`));
          } catch (e) { failure(String(e)); }
        } else if (cmd.startsWith('remember ')) {
          try {
            const id = await db.memory.remember(cmd.slice(9).trim());
            success(`Stored: ${id}`);
          } catch (e) { failure(String(e)); }
        } else {
          info('Commands: search <query> | remember <content> | exit');
        }
        rl.prompt();
      });
    });
}
