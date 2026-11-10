import { defineConfig } from 'vitest/config';

/** The panels are DOM over editor-core data; jsdom is enough to test them. */
export default defineConfig({
  test: { environment: 'jsdom', include: ['test/**/*.test.ts'] }
});
