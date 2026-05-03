import process from 'node:process';
import { Command } from 'commander';
import { registerAuthCommands } from './commands/auth.js';
import { registerBranchCommands } from './commands/branch.js';
import { registerConfigCommands } from './commands/config.js';
import { registerDevCommands } from './commands/dev.js';
import { registerInitCommand } from './commands/init.js';
import { registerMemoryCommands } from './commands/memory.js';
import { registerReflectCommand } from './commands/reflect.js';
import { registerStatusCommand } from './commands/status.js';
import { registerSyncCommands } from './commands/sync.js';

// Node version check
const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  process.stderr.write('ClawDB CLI requires Node.js 18 or higher.\n');
  process.exit(1);
}

// Lazy update notifier — non-blocking
try {
  const { default: updateNotifier } = await import('update-notifier');
  const pkg = (await import('../package.json', { assert: { type: 'json' } })).default;
  updateNotifier({ pkg }).notify();
} catch {
  // Not fatal
}

const program = new Command()
  .name('clawdb')
  .description('ClawDB CLI — manage your AI agent memory')
  .version(process.env['npm_package_version'] ?? '0.1.0')
  .helpOption('-h, --help', 'Show help');

registerAuthCommands(program);
registerInitCommand(program);
registerMemoryCommands(program);
registerBranchCommands(program);
registerSyncCommands(program);
registerReflectCommand(program);
registerConfigCommands(program);
registerStatusCommand(program);
registerDevCommands(program);

// Shell completions
program
  .command('completion <shell>')
  .description('Print shell completion script (bash | zsh | fish | powershell)')
  .action((shell: string) => {
    const scripts: Record<string, string> = {
      bash: `source <(clawdb completion bash)`,
      zsh: `clawdb completion zsh > ~/.clawdb-completion && echo '. ~/.clawdb-completion' >> ~/.zshrc`,
      fish: `clawdb completion fish | source`,
      powershell: `clawdb completion powershell | Out-String | Invoke-Expression`,
    };
    const hint = scripts[shell];
    if (hint) {
      console.log(`# Add to your shell profile:\n${hint}`);
    } else {
      console.error(`Unknown shell: ${shell}. Supported: bash, zsh, fish, powershell`);
      process.exit(1);
    }
  });

await program.parseAsync(process.argv);
