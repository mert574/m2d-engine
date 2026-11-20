import { defineConfig } from 'vitest/config';
import { workspaceResolve } from '../../scripts/workspaceResolve.ts';

/** The panels are DOM over editor-core data; jsdom is enough to test them. */
export default defineConfig({
  ...workspaceResolve,
  test: { environment: 'jsdom', include: ['test/**/*.test.ts'] }
});
