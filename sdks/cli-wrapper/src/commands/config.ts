import type { Command } from 'commander';
import { failure, printJson, printTable } from '../utils/output.js';
import { getConfig, setConfig } from '../utils/config.js';

export function registerConfigCommands(program: Command): void {
  const cfg = program.command('config').description('Manage CLI configuration');

  cfg
    .command('show')
    .description('Print current configuration')
    .option('--json', 'Output as JSON')
    .action((opts: { json?: boolean }) => {
      const conf = getConfig();
      if (opts.json) { printJson(conf); return; }
      const rows = Object.entries(conf).map(([k, v]) => [k, String(v ?? '')]);
      printTable(['Key', 'Value'], rows);
    });

  cfg
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key: string, value: string) => {
      const allowed = ['apiKey', 'endpoint', 'agentId', 'workspace'];
      if (!allowed.includes(key)) {
        failure(`Unknown config key: ${key}. Allowed: ${allowed.join(', ')}`);
        process.exit(1);
      }
      setConfig(key as any, value);
      console.log(`Set ${key} = ${value}`);
    });

  cfg
    .command('validate')
    .description('Validate the current configuration')
    .action(() => {
      const conf = getConfig();
      const issues: string[] = [];
      if (!conf.apiKey && !process.env['CLAWDB_API_KEY']) issues.push('apiKey not set');
      if (!conf.endpoint && !process.env['CLAWDB_ENDPOINT']) issues.push('endpoint not set (will default to localhost)');
      if (issues.length > 0) {
        issues.forEach(i => failure(i));
      } else {
        console.log('Configuration is valid.');
      }
    });
}
