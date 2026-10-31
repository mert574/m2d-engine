import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

// Browser project: runs test/browser/** in headless Chromium via Playwright.
// Node has no WebGL, so the WebGL2 backend can only be validated here.
//
// One-time setup:  npx playwright install chromium
// Run:             npm run test:browser
export default defineConfig({
  // Pre-bundle the WASM physics module; discovering it mid-run makes Vite
  // reload the page under the tests.
  optimizeDeps: {
    include: ['@dimforge/rapier2d-compat']
  },
  test: {
    name: 'browser',
    include: ['test/browser/**/*.test.js'],
    setupFiles: ['./test/helpers/setupPhysics.js'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      screenshotFailures: false,
      instances: [
        {
          browser: 'chromium',
          launch: {
            args: [
              // Headless Chromium has no GPU; these allow WebGL2 to fall back to
              // the SwiftShader software rasterizer instead of being disabled.
              '--enable-unsafe-swiftshader',
              '--use-gl=angle',
              '--use-angle=swiftshader',
              '--ignore-gpu-blocklist'
            ]
          }
        }
      ]
    }
  }
});
