# Engine tests

Documented at [`docs/contributing/testing.md`](../../../docs/contributing/testing.md): the two Vitest projects, the conformance harness, how to validate a new backend and Chromium setup.

```bash
npm test               # both projects
npm run test:node      # node project only
npm run test:browser   # browser project only (once: npx playwright install chromium)
npm run test:watch
```
