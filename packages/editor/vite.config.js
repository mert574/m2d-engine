import { defineConfig } from 'vite';
import { workspaceResolve } from '../../scripts/workspaceResolve.ts';

/**
 * The editor app. Never published: the companion process (`m2d-editor`)
 * is how a user starts it, and in development Vite serves it.
 */
export default defineConfig({
  ...workspaceResolve,
  server: { port: Number(process.env.PORT) || 5180, strictPort: !!process.env.PORT },
  build: { target: 'esnext' }
});
