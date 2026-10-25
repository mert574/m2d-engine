import { defineWorkspace } from 'vitest/config';

// Two projects so the fast headless suite stays fast:
//   node    - everything except test/browser/**, runs in Node with node-canvas
//   browser - test/browser/** only, runs in headless Chromium (WebGL2 available)
//
//   npm test              both
//   npm run test:node     node only (what `npm run test:watch` watches)
//   npm run test:browser  browser only
export default defineWorkspace([
  './vitest.config.js',
  './vitest.browser.config.js'
]);
