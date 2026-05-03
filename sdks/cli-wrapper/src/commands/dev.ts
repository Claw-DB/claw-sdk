import { spawn } from 'node:child_process';
import type { Command } from 'commander';
import { failure, info, success } from '../utils/output.js';

export function registerDevCommands(program: Command): void {
  const dev = program.command('dev').description('Local development server management');

  dev
    .command('start')
    .description('Start the ClawDB local development server')
    .option('--port <port>', 'Port to listen on', '50050')
    .action((opts: { port: string }) => {
      info(`Starting ClawDB dev server on port ${opts.port}…`);
      const proc = spawn('clawdb-server', ['--dev', '--port', opts.port], {
        stdio: 'inherit',
        detached: false,
      });
      proc.on('error', () => {
        failure('clawdb-server binary not found. Install ClawDB: https://docs.clawdb.io/install');
        process.exit(1);
      });
      proc.on('exit', code => {
        if (code !== 0) failure(`Server exited with code ${code}`);
      });
    });

  dev
    .command('stop')
    .description('Stop the local ClawDB dev server')
    .action(() => {
      const proc = spawn('pkill', ['-f', 'clawdb-server'], { stdio: 'inherit' });
      proc.on('exit', code => {
        if (code === 0) success('Dev server stopped.');
        else failure('No running dev server found.');
      });
    });
}
