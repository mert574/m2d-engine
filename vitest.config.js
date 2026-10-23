import { defineConfig } from 'vitest/config';

// Standalone config: the main vite.config.js sets `root: 'src'` and runs the
// sprite generator in buildStart, neither of which should apply to tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    // The `canvas` package is a native CJS addon; let Node resolve it directly.
    server: {
      deps: {
        external: ['canvas']
      }
    }
  }
});
