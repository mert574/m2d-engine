import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Standalone from vite.config.js on purpose: that one sets `root: 'src'` and
// runs the sprite generator in buildStart, neither of which should apply here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js']
  },
  // As vite.config.js: the kit's TypeScript source, not its built `dist`.
  resolve: {
    alias: [
      { find: /^m2d-kit$/, replacement: resolve(import.meta.dirname, '../packages/kit/src/index.ts') },
      { find: /^m2d-kit\/(\w+)$/, replacement: resolve(import.meta.dirname, '../packages/kit/src') + '/$1.ts' }
    ]
  }
});
