import type { Command } from 'commander';
import { failure, spinner, success } from '../utils/output.js';
import { clearConfig, setConfig } from '../utils/config.js';

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('Manage authentication');

  auth
    .command('login')
    .description('Authenticate with ClawDB')
    .option('--api-key <key>', 'API key (skips browser flow)')
    .action(async (opts: { apiKey?: string }) => {
      if (opts.apiKey) {
        setConfig('apiKey', opts.apiKey);
        success('API key saved.');
        return;
      }
      // Browser OAuth flow
      const spin = spinner('Opening browser for authentication…');
      try {
        const { default: open } = await import('open');
        await open('https://app.clawdb.io/cli-auth');
        spin.succeed('Browser opened. Paste your API key after authenticating:');
        const { default: readline } = await import('readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const key = await new Promise<string>(resolve => rl.question('API Key: ', resolve));
        rl.close();
        setConfig('apiKey', key.trim());
        success('Logged in.');
      } catch (err) {
        spin.fail('Login failed.');
        failure(String(err));
        process.exit(1);
      }
    });

  auth
    .command('logout')
    .description('Revoke credentials and clear local config')
    .action(() => {
      clearConfig();
      success('Logged out.');
    });

  auth
    .command('whoami')
    .description('Show current authenticated identity')
    .action(() => {
      const apiKey = process.env['CLAWDB_API_KEY'];
      if (apiKey) {
        console.log(`Authenticated via env var CLAWDB_API_KEY (${apiKey.slice(0, 8)}…)`);
      } else {
        console.log('Not authenticated. Run: clawdb auth login');
      }
    });
}
