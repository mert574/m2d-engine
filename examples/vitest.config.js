import { defineConfig } from 'vitest/config';
import { workspaceResolve } from '../scripts/workspaceResolve.ts';

// Standalone from vite.config.js on purpose: that one sets `root: 'src'` and
// runs the sprite generator in buildStart, neither of which should apply here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js']
  },
  // As vite.config.js: the engine's and the kit's source, not their `dist`.
  ...workspaceResolve
});
