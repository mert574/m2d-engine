import { defineConfig } from 'vitest/config';

// Browser project: runs test/browser/** in headless Chromium via Playwright.
// Node has no WebGL, so the WebGL2 backend can only be validated here.
//
// One-time setup:  npx playwright install chromium
// Run:             npm run test:browser
export default defineConfig({
  test: {
    name: 'browser',
    include: ['test/browser/**/*.test.js'],
    browser: {
      enabled: true,
      provider: 'playwright',
      name: 'chromium',
      headless: true,
      screenshotFailures: false,
      providerOptions: {
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
    }
  }
});
