import type { Command } from 'commander';
import { failure, info, success } from '../utils/output.js';
import { getApiKey, getEndpoint, setConfig } from '../utils/config.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize ClawDB in the current project')
    .action(async () => {
      const { default: Enquirer } = await import('enquirer');

      const answers = await (Enquirer as any).prompt([
        { type: 'input', name: 'endpoint', message: 'ClawDB endpoint:', initial: getEndpoint() },
        { type: 'input', name: 'apiKey', message: 'API key (leave blank to use env var):', initial: '' },
        { type: 'input', name: 'agentId', message: 'Agent ID:', initial: 'default-agent' },
        { type: 'input', name: 'workspace', message: 'Workspace:', initial: 'default' },
      ]) as Record<string, string>;

      if (answers['endpoint']) setConfig('endpoint', answers['endpoint']);
      if (answers['apiKey']) setConfig('apiKey', answers['apiKey']);
      if (answers['agentId']) setConfig('agentId', answers['agentId']);
      if (answers['workspace']) setConfig('workspace', answers['workspace']);

      // Connectivity check
      info('Testing connectivity…');
      try {
        const resp = await fetch(`${answers['endpoint']}/v1/health`, { signal: AbortSignal.timeout(5000) });
        if (resp.ok) {
          success('Connected to ClawDB.');
        } else {
          failure(`Endpoint returned ${resp.status}. Check your configuration.`);
        }
      } catch {
        failure('Could not reach endpoint. Configuration saved — verify the endpoint is running.');
      }
    });
}
