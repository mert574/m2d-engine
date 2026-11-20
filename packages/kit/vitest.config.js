import { defineConfig } from 'vitest/config';
import { workspaceResolve } from '../../scripts/workspaceResolve.ts';

// The kit's suites build on the engine's test helpers, exported as
// `m2d-engine/testing`, and need the physics module compiled before
// any world exists, as the engine's own suites do.
export default defineConfig({
  ...workspaceResolve,
  test: {
    environment: 'node',
    include: ['test/**/*.test.{js,ts}'],
    setupFiles: ['./test/setup.ts'],
    server: {
      deps: {
        external: ['@napi-rs/canvas']
      }
    }
  }
});
