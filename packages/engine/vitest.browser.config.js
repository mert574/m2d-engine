import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

// Browser project, run on demand: the tests that need a real browser
// (test/browser/**) and the gpu project's renderer tests (test/gpu/*), which
// run here too so the Node stand-ins in helpers/gpuEnvironment.js are checked
// against Chromium. test/gpu/engine/** stays out: those suites build games
// with Node's window and document stubs, which a browser already has.
//
// One-time setup:  npx playwright install chromium
// Run:             npm run test:browser
// Existing browser: M2D_BROWSER=/path/to/chromium npm run test:browser
// Its GPU flags:    M2D_BROWSER_FLAGS='--use-angle=gl-egl --enable-unsafe-webgpu
//                   --enable-features=Vulkan --ignore-gpu-blocklist' replaces the
//                   SwiftShader flags below, for a machine with a real GPU —
//                   gl-egl reaches a render node with no X server
const flags = process.env.M2D_BROWSER_FLAGS?.split(' ').filter(Boolean);

// Headless Chromium draws to no display, but SwiftShader's ANGLE display
// still connects to the one in DISPLAY and fails to initialise when that X
// server refuses it, leaving the page with no WebGL2 at all.
const { DISPLAY, WAYLAND_DISPLAY, ...env } = process.env;
export default defineConfig({
  // Pre-bundle the WASM physics module; discovering it mid-run makes Vite
  // reload the page under the tests.
  optimizeDeps: {
    include: ['@dimforge/rapier2d-compat', '@dimforge/rapier3d-compat']
  },
  test: {
    name: 'browser',
    include: ['test/browser/**/*.test.js', 'test/gpu/*.test.js'],
    setupFiles: ['./test/helpers/setupPhysics.js'],
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: {
          executablePath: process.env.M2D_BROWSER || undefined,
          env,
          args: flags ?? [
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
