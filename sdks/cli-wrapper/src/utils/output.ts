import chalk from 'chalk';
import ora, { type Ora } from 'ora';

export function success(message: string): void {
  console.log(chalk.green('✓') + ' ' + message);
}

export function failure(message: string): void {
  console.error(chalk.red('✗') + ' ' + message);
}

export function info(message: string): void {
  console.log(chalk.blue('ℹ') + ' ' + message);
}

export function warn(message: string): void {
  console.warn(chalk.yellow('⚠') + ' ' + message);
}

export function spinner(text: string): Ora {
  return ora({ text, color: 'cyan' }).start();
}

export function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] ?? '').length))
  );
  const fmt = (row: string[]) =>
    row.map((cell, i) => (cell ?? '').padEnd(widths[i]!)).join('  ');
  const sep = widths.map(w => '─'.repeat(w)).join('  ');
  console.log(chalk.bold(fmt(headers)));
  console.log(sep);
  rows.forEach(r => console.log(fmt(r)));
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
