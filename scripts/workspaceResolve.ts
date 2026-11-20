// The Vite and Vitest resolve options every config in this repo shares:
// the workspace's own packages (`m2d-engine`, `m2d-kit`) resolve through
// their `m2d-source` export condition to the TypeScript they are built
// from, never to a `dist` that may be stale or missing. A published
// consumer does not ask for the condition and gets `dist`.
//
// Plain Node gets the same condition from the root `.npmrc`
// (`node-options`), so `npm run` and `npm test` load source too; a script
// run as `node <file>` outside npm passes `--conditions=m2d-source` itself.
import { defaultClientConditions, defaultServerConditions } from 'vite';

export const workspaceResolve = {
  resolve: { conditions: ['m2d-source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['m2d-source', ...defaultServerConditions], externalConditions: ['m2d-source'] } }
};
