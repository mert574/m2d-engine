import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    // Each integration test starts real servers and worker threads.
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
