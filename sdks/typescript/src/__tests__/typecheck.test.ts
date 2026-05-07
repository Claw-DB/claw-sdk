import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('TypeScript declarations', () => {
  it('compiles test signatures with tsc --noEmit', () => {
    const pkgDir = resolve(__dirname, '../..');
    const testFile = resolve(pkgDir, 'test-types/sdk-signatures.test-d.ts');

    expect(() => {
      execFileSync(
        process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
        ['exec', 'tsc', '--noEmit', '--pretty', 'false', '--allowImportingTsExtensions', '--moduleResolution', 'Bundler', '--module', 'ESNext', '--target', 'ES2022', testFile],
        {
          cwd: pkgDir,
          stdio: 'pipe'
        }
      );
    }).not.toThrow();
  });
});
