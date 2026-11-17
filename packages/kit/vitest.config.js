import { defineConfig } from 'vitest/config';

// The kit's suites build on the engine's test helpers, exported as
// `m2d-engine/test/helpers/*`, and need the physics module compiled before
// any world exists, as the engine's own suites do.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    setupFiles: ['m2d-engine/test/helpers/setupPhysics.js'],
    server: {
      deps: {
        external: ['@napi-rs/canvas']
      }
    }
  }
});
