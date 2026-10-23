import { defineConfig } from 'vitest/config';

// Node project: the headless suite (node-canvas rasterizer). Standalone on
// purpose: the main vite.config.js sets `root: 'src'` and runs the sprite
// generator in buildStart, neither of which should apply to tests.
//
// Browser-only tests live in test/browser/ and are run by the `browser`
// project in vitest.browser.config.js. See vitest.workspace.js.
export default defineConfig({
  test: {
    name: 'node',
    environment: 'node',
    include: ['test/**/*.test.js'],
    exclude: ['test/browser/**', 'node_modules/**'],
    // The `canvas` package is a native CJS addon; let Node resolve it directly.
    server: {
      deps: {
        external: ['canvas']
      }
    }
  }
});
