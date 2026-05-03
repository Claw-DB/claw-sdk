import type { Command } from 'commander';
import { failure, printTable, spinner } from '../utils/output.js';
import { getApiKey, getEndpoint } from '../utils/config.js';

async function buildClient() {
  const { ClawDB } = await import('@clawdb/sdk');
  const db = ClawDB.fromApiKey(getApiKey() ?? '', getEndpoint());
  await db.connect();
  return db;
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show ClawDB server and sync status')
    .option('--watch', 'Refresh every 5 seconds')
    .action(async (opts: { watch?: boolean }) => {
      const printStatus = async () => {
        const spin = spinner('Fetching status…');
        try {
          const db = await buildClient();
          const syncStatus = await db.sync.status();
          await db.disconnect();
          spin.stop();
          printTable(
            ['Property', 'Value'],
            [
              ['Endpoint', getEndpoint()],
              ['Connected', syncStatus.connected ? 'yes' : 'no'],
              ['Pending push', String(syncStatus.pendingPush)],
              ['Last sync', syncStatus.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString() : 'never'],
            ]
          );
        } catch (err) {
          spin.fail('Could not fetch status.');
          failure(String(err));
        }
      };

      await printStatus();
      if (opts.watch) {
        setInterval(printStatus, 5000);
      }
    });
}
