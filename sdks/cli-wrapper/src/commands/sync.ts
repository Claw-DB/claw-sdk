import type { Command } from 'commander';
import { failure, info, printTable, spinner, success } from '../utils/output.js';
import { getApiKey, getEndpoint } from '../utils/config.js';

async function buildClient() {
  const { ClawDB } = await import('@clawdb/sdk');
  const db = ClawDB.fromApiKey(getApiKey() ?? '', getEndpoint());
  await db.connect();
  return db;
}

export function registerSyncCommands(program: Command): void {
  const sc = program.command('sync').description('Sync with ClawDB Cloud');

  sc
    .command('run')
    .description('Push and pull memories')
    .option('--push-only', 'Only push')
    .option('--pull-only', 'Only pull')
    .action(async (opts: { pushOnly?: boolean; pullOnly?: boolean }) => {
      const spin = spinner('Syncing…');
      try {
        const db = await buildClient();
        if (opts.pushOnly) {
          const r = await db.sync.push(); spin.succeed(`Pushed ${r.pushed} records.`);
        } else if (opts.pullOnly) {
          const r = await db.sync.pull(); spin.succeed(`Pulled ${r.pulled} records.`);
        } else {
          const r = await db.sync.sync();
          spin.succeed(`Pushed ${r.pushed}, pulled ${r.pulled}, conflicts ${r.conflicts}.`);
        }
        await db.disconnect();
      } catch (err) {
        spin.fail('Sync failed.');
        failure(String(err));
        process.exit(1);
      }
    });

  sc
    .command('status')
    .description('Show sync status')
    .action(async () => {
      const spin = spinner('Checking status…');
      try {
        const db = await buildClient();
        const st = await db.sync.status();
        await db.disconnect();
        spin.stop();
        printTable(['Connected', 'Pending Push', 'Last Sync'], [
          [st.connected ? 'yes' : 'no', String(st.pendingPush), st.lastSyncAt ? new Date(st.lastSyncAt).toLocaleString() : 'never'],
        ]);
      } catch (err) {
        spin.fail('Failed.');
        failure(String(err));
        process.exit(1);
      }
    });
}
