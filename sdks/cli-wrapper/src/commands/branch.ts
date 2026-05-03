import type { Command } from 'commander';
import { failure, printJson, printTable, spinner, success } from '../utils/output.js';
import { getApiKey, getEndpoint } from '../utils/config.js';

async function buildClient() {
  const { ClawDB } = await import('@clawdb/sdk');
  const db = ClawDB.fromApiKey(getApiKey() ?? '', getEndpoint());
  await db.connect();
  return db;
}

export function registerBranchCommands(program: Command): void {
  const br = program.command('branch').alias('br').description('Branch operations');

  br
    .command('create <name>')
    .description('Fork a new branch')
    .option('--parent <parent>', 'Parent branch', 'trunk')
    .action(async (name: string, opts: { parent: string }) => {
      const spin = spinner('Creating branch…');
      try {
        const db = await buildClient();
        const branch = await db.branches.fork(name, { parent: opts.parent });
        await db.disconnect();
        spin.succeed(`Branch created: ${branch.name} (${branch.id})`);
      } catch (err) {
        spin.fail('Failed.');
        failure(String(err));
        process.exit(1);
      }
    });

  br
    .command('list')
    .description('List branches')
    .option('--status <status>', 'Filter by status')
    .option('--json', 'Output as JSON')
    .action(async (opts: { status?: string; json?: boolean }) => {
      const spin = spinner('Loading…');
      try {
        const db = await buildClient();
        const branches = await db.branches.list({ status: opts.status as any });
        await db.disconnect();
        spin.stop();
        if (opts.json) { printJson(branches); return; }
        printTable(['Name', 'Status', 'Divergence'], branches.map(b => [b.name, b.status, b.divergenceScore?.toFixed(3) ?? '-']));
      } catch (err) {
        spin.fail('Failed.');
        failure(String(err));
        process.exit(1);
      }
    });

  br
    .command('diff <branchA> <branchB>')
    .description('Diff two branches')
    .option('--json', 'Output as JSON')
    .action(async (a: string, b: string, opts: { json?: boolean }) => {
      const spin = spinner('Diffing…');
      try {
        const db = await buildClient();
        const diff = await db.branches.diff(a, b);
        await db.disconnect();
        spin.stop();
        if (opts.json) { printJson(diff); return; }
        console.log(`+${diff.added}  -${diff.removed}  ~${diff.modified}  divergence=${diff.divergenceScore.toFixed(3)}`);
      } catch (err) {
        spin.fail('Failed.');
        failure(String(err));
        process.exit(1);
      }
    });

  br
    .command('merge <source>')
    .description('Merge a branch into trunk')
    .option('--into <target>', 'Target branch', 'trunk')
    .option('--strategy <s>', 'Merge strategy: ours|theirs|union', 'union')
    .action(async (source: string, opts: { into: string; strategy: string }) => {
      const spin = spinner('Merging…');
      try {
        const db = await buildClient();
        const result = await db.branches.merge(source, { into: opts.into, strategy: opts.strategy as any });
        await db.disconnect();
        spin.succeed(`Merged ${result.applied} records. Conflicts: ${result.conflicts.length}`);
      } catch (err) {
        spin.fail('Merge failed.');
        failure(String(err));
        process.exit(1);
      }
    });

  br
    .command('discard <name>')
    .description('Discard a branch')
    .action(async (name: string) => {
      const spin = spinner('Discarding…');
      try {
        const db = await buildClient();
        await db.branches.discard(name);
        await db.disconnect();
        spin.succeed(`Branch ${name} discarded.`);
      } catch (err) {
        spin.fail('Failed.');
        failure(String(err));
        process.exit(1);
      }
    });

  br
    .command('simulate <name>')
    .description('Fork a sandbox branch, run a dry-run evaluation, then discard')
    .option('--json', 'Output evaluation as JSON')
    .action(async (name: string, opts: { json?: boolean }) => {
      const spin = spinner('Simulating…');
      try {
        const db = await buildClient();
        const [, evaluation] = await db.branches.simulate(name, async () => null);
        await db.disconnect();
        spin.stop();
        if (opts.json) { printJson(evaluation); return; }
        console.log(`Simulation complete. Score: ${(evaluation as any).score ?? 'n/a'}`);
      } catch (err) {
        spin.fail('Simulation failed.');
        failure(String(err));
        process.exit(1);
      }
    });
}
