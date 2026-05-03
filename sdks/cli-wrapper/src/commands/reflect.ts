import type { Command } from 'commander';
import { failure, info, spinner, success } from '../utils/output.js';
import { getApiKey, getEndpoint } from '../utils/config.js';

async function buildClient() {
  const { ClawDB } = await import('@clawdb/sdk');
  const db = ClawDB.fromApiKey(getApiKey() ?? '', getEndpoint());
  await db.connect();
  return db;
}

export function registerReflectCommand(program: Command): void {
  program
    .command('reflect')
    .description('Trigger a reflection/consolidation job')
    .option('--job-type <type>', 'Job type: full|incremental|archive', 'full')
    .option('--dry-run', 'Simulate without making changes')
    .option('--watch', 'Poll until job completes')
    .action(async (opts: { jobType: string; dryRun?: boolean; watch?: boolean }) => {
      const spin = spinner('Triggering reflection…');
      try {
        const db = await buildClient();
        const job = await db.reflect.trigger({ jobType: opts.jobType as any, dryRun: opts.dryRun });
        spin.text = `Job ${job.jobId} started (${job.status})`;

        if (opts.watch) {
          let current = job;
          while (current.status !== 'completed' && current.status !== 'failed') {
            await new Promise(r => setTimeout(r, 2000));
            current = await db.reflect.status(job.jobId);
            spin.text = `Job ${job.jobId}: ${current.status} — processed=${current.processed}`;
          }
          spin.succeed(`Reflect complete: processed=${current.processed} archived=${current.archived} promoted=${current.promoted}`);
        } else {
          spin.succeed(`Job ${job.jobId} started.`);
        }

        await db.disconnect();
      } catch (err) {
        spin.fail('Reflect failed.');
        failure(String(err));
        process.exit(1);
      }
    });
}
