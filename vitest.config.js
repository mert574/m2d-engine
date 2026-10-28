import { defineConfig } from 'vitest/config';

// Two projects so the fast headless suite stays fast:
//   node    - everything except test/browser/**, runs in Node with node-canvas
//   browser - test/browser/** only, runs in headless Chromium (WebGL2 available)
//
//   npm test              both
//   npm run test:node     node only (what `npm run test:watch` watches)
//   npm run test:browser  browser only
//
// Standalone from the main vite.config.js on purpose: that one sets
// `root: 'src'` and runs the sprite generator in buildStart, neither of which
// should apply to tests.
export default defineConfig({
  test: {
    projects: [
      {
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
      },
      './vitest.browser.config.js'
    ]
  }
});
