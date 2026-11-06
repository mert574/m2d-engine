import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

// Browser project: runs test/browser/** in headless Chromium via Playwright.
// Node has no WebGL, so the WebGL2 backend can only be validated here.
//
// One-time setup:  npx playwright install chromium
// Run:             npm run test:browser
// Existing browser: M2D_BROWSER=/path/to/chromium npm run test:browser
export default defineConfig({
  // Pre-bundle the WASM physics module; discovering it mid-run makes Vite
  // reload the page under the tests.
  optimizeDeps: {
    include: ['@dimforge/rapier2d-compat', '@dimforge/rapier3d-compat']
  },
  test: {
    name: 'browser',
    include: ['test/browser/**/*.test.js'],
    setupFiles: ['./test/helpers/setupPhysics.js'],
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: {
          executablePath: process.env.M2D_BROWSER || undefined,
          args: [
            // Headless Chromium has no GPU; allow WebGL2 via SwiftShader.
            '--enable-unsafe-swiftshader',
            // And WebGPU, on Dawn over SwiftShader's Vulkan. The Vulkan flags
            // matter: with only the ANGLE flags above, the WebGPU instance is
            // torn down on first use ("A valid external Instance reference no
            // longer exists"). Tests are served from localhost, a secure
            // context, which navigator.gpu requires.
            '--enable-unsafe-webgpu',
            '--enable-features=Vulkan',
            '--use-vulkan=swiftshader',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--ignore-gpu-blocklist'
          ]
        }
      }),
      headless: true,
      screenshotFailures: false,
      instances: [
        {
          browser: 'chromium'
        }
      ]
    }
  }
});
