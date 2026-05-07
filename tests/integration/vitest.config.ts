import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@clawdb/sdk': resolve(__dirname, '../../sdks/typescript/src/index.ts'),
      '@clawdb/langchain': resolve(__dirname, '../../adapters/langchain/src/index.ts'),
      '@clawdb/openai-agents': resolve(__dirname, '../../adapters/openai/src/index.ts'),
      '@clawdb/vercel-ai': resolve(__dirname, '../../adapters/vercel-ai/src/index.ts'),
      '@clawdb/errors': resolve(__dirname, '../../packages/errors/src/index.ts'),
      '@clawdb/proto': resolve(__dirname, '../../packages/proto/src/index.ts'),
      '@clawdb/types': resolve(__dirname, '../../packages/types/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['typescript.test.ts'],
    hookTimeout: 60000,
    testTimeout: 60000,
  },
});
