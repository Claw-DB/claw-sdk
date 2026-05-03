import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*/vitest.config.ts',
  'sdks/*/vitest.config.ts',
  'adapters/*/vitest.config.ts'
]);
