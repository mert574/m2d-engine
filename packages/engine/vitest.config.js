import { defineConfig } from 'vitest/config';

// Three projects:
//   node    - everything outside test/gpu/** and test/browser/**, in Node with @napi-rs/canvas
//   gpu     - test/gpu/**, in Node on the machine's GPU: WebGL2 through ANGLE, WebGPU through Dawn;
//             test/gpu/engine/** are the engine suites that build a game, Node only
//   browser - test/browser/** and test/gpu/*, in headless Chromium; run on demand
//
//   npm test              node and gpu
//   npm run test:node     node only (what `npm run test:watch` watches)
//   npm run test:gpu      gpu only
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
          include: ['test/**/*.test.{js,ts}'],
          exclude: ['test/browser/**', 'test/gpu/**', 'node_modules/**'],
          setupFiles: ['./src/testing/setup.js'],
          // The Skia binding is a native CJS addon; let Node resolve it directly.
          server: {
            deps: {
              external: ['@napi-rs/canvas']
            }
          }
        }
      },
      {
        test: {
          name: 'gpu',
          environment: 'node',
          include: ['test/gpu/**/*.test.js'],
          setupFiles: ['./test/helpers/gpuEnvironment.js', './src/testing/setup.js'],
          // A software GPU draws a 3D frame in tens of milliseconds and
          // compiles its pipelines in seconds.
          testTimeout: 30000,
          server: {
            deps: {
              // Native addons; let Node resolve them directly.
              external: ['@napi-rs/canvas', '@onirenaud/node-webgl', 'webgpu']
            }
          }
        }
      },
      './vitest.browser.config.js'
    ]
  }
});
