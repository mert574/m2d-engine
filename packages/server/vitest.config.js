import { defineConfig } from 'vitest/config';
import { workspaceResolve } from '../../scripts/workspaceResolve.ts';

export default defineConfig({
  ...workspaceResolve,
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    // Each integration test starts real servers and worker threads.
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
