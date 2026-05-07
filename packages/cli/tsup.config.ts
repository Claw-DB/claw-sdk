import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  bundle: true,
  splitting: false,
  platform: 'node',
  banner: {
    js: '#!/usr/bin/env node'
  },
  outExtension() {
    return { js: '.js' };
  }
});
