# Engine tests

Documented at [`docs/contributing/testing.md`](../../../docs/contributing/testing.md): the three Vitest projects, the conformance harness, how to validate a new backend, the GPU environment and Chromium setup.

```bash
npm test               # node and gpu projects
npm run test:node      # node project only
npm run test:gpu       # gpu project only
npm run test:browser   # browser tier, on demand (once: npx playwright install chromium)
npm run test:watch
```
