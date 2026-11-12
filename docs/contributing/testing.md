# Testing

```bash
npm test               # all suites plus example scene validation
npm run test:node      # engine Node suite, about half a second
npm run test:browser   # engine browser suite in headless Chromium
npm run test:watch     # Node suite, re-run on change
npm run test:editor    # the editor's GUI, driven in a Chrome with the GPU
```

The engine's tests are two Vitest projects declared in `packages/engine/vitest.config.js`.

| Project | Files | Runs in | Why |
| --- | --- | --- | --- |
| `node` | everything outside `test/browser/` | Node, with `@napi-rs/canvas` as the rasterizer | Fast. Pixel assertions work without a browser |
| `browser` | `test/browser/**` | Headless Chromium through Playwright | Node has no WebGL2 or WebGPU. The `webgpu.*.test.js` suites cover the 3D renderer: lighting, shadows, props, streaming, the loader and pixel-level smoke scenes |

Both load `test/helpers/setupPhysics.js`, which awaits `initPhysics()` once per worker so every suite can construct a game synchronously.

A suite that constructs an `M2D` in the node project installs a `window` global with `installWindowStub()` from `test/helpers/environment.js`. The stub carries the real `performance` object, which Rapier's WASM glue reads its clock through whenever `window` exists. A stub without it panics on the first physics step. See [Troubleshooting](./troubleshooting#development-environment).

In the examples workspace, `examples/test/scenes.test.js` validates every example scene JSON against the loader twice: once against stub registries, for structure and cross-references, and once in a real headless game for every example folder with an `m2d.project.json`, with that game's own `register(game)`, so an actor property or constraint param its class does not declare fails the suite rather than the game. `sceneWriter.test.js` holds the scenes to the canonical writer's form.

## Layers

| Layer | File | Project | Proves |
| --- | --- | --- | --- |
| Backend contract | `conformance/rendererConformance.js`, run once per backend | both | A backend rasterizes every primitive correctly |
| Caller contract | `engineDrawCalls.test.js` | node | Engine and actor code emit the right draw calls |
| UI and wiring | `uiRenderer.test.js`, `rendererRegistry.test.js`, `rendererFallback.test.js` | node | Screen-space forwarding, backend selection, fallback |
| Browser environment | `browser/environment.smoke.test.js` | browser | WebGL2 exists, pixel readback is top-left, fixtures upload |
| Context loss | `browser/webglContextLoss.test.js` | browser | A resize during a lost WebGL context is replayed on restore |

Engine-level suites: `viewport.test.js` for sizing math and projection, `resizeLifecycle.test.js` for camera, input mapping and filter plumbing across resizes, `worldOverlay.test.js`, `settingsMenu.test.js`, `pause.test.js` (the loop's pause gate, the tick and `game.time` integration), `time.test.js` (the clocks, the tick and timers, driven by hand), `determinism.test.js` (the same scene at 30, 60 and 144 frames per second ends in bit-identical state; seeded replay; the camera's frame-rate correction), `sceneActions.test.js`, `sceneLoader.test.js`, `constraints.test.js`, `geometry.test.js`.

`input.test.js` drives the input system through `game.input.push`, so the recognizers, router and coordinate mapping under test are the real ones. `browser/input.test.js` covers what needs a browser: real `PointerEvent` mapping, canvas capture styles, delivery inside the DOM handler and listener cleanup.

`physics.test.js` is the physics contract: units, fixed-step pacing, resting contact, body mutation, kinematic and character behaviour, events, queries, continuous collision detection and lifecycle. It asserts with tolerances and never against Rapier internals. `browser/physics.smoke.test.js` checks the WASM module loads in a real browser.

### Conformance tests

`describeRendererConformance(harness)` renders scenes and samples pixels. Assertions sample shape interiors with a colour tolerance. Backends that antialias differently both pass, and no golden images are needed.

### Recording renderer

`helpers/recordingRenderer.js` is a `BaseRenderer` that records calls instead of drawing. It catches wrong option names, unbalanced push and pop pairs and debug drawing that ignores the flag. It inherits the shared logic in `BaseRenderer` so that code is exercised too.

### Helpers

| File | Provides |
| --- | --- |
| `helpers/testGame.js` | `makeTestGame` builds a game on a `RecordingRenderer`. `makeBody`, `expectBalancedStacks` |
| `helpers/pixels.js` | `snapshot`, `expectColorAt`, `expectNotColorAt`, `expectTransparentAt` |
| `helpers/fixtures.js` | Test images |
| `helpers/input.js` | `pointerDown`, `click`, `drag`, `scroll`, `keyDown` and clock helpers over `game.input.push` |
| `helpers/environment.js` | Canvas creation and pixel readback for Node and the browser |
| `helpers/setupPhysics.js` | Awaits `initPhysics()` once per worker |

## Validating a new backend

One file. The WebGL2 backend's file is the template.

```js
// test/browser/webglRenderer.conformance.test.js
import { WebGLRenderer } from '../../src/core/renderers/webglRenderer.js';
import { describeRendererConformance } from '../conformance/rendererConformance.js';
import { createCanvasElement, readWebGLPixels } from '../helpers/environment.js';

describeRendererConformance({
  name: 'WebGLRenderer',
  createRenderer: () => new WebGLRenderer({ contextAttributes: { preserveDrawingBuffer: true } }),
  createTarget: (width, height) => createCanvasElement(width, height),
  readPixels: readWebGLPixels,
  capabilities: {
    // Mandatory. Default true. Turn one off only while the backend is under construction.
    gradients: true, shadows: true, text: true, roundedCorners: true, clipping: true, transforms: true,
    // Optional. Default false. Turn one on as the backend claims it.
    tint: true, blendModes: true, particles: true, lights: true, postEffects: true
  }
});
```

`readPixels` must return RGBA with a top-left origin. `readWebGLPixels` does the row flip that `gl.readPixels` needs. `readCanvas2DPixels` is the 2D counterpart. The renderer must keep its drawing buffer so the test can read it after the frame.

### Harness capabilities

A flag set to `true` is a promise the suite enforces.

- Mandatory features `gradients`, `shadows`, `text`, `roundedCorners`, `clipping` and `transforms` default to `true`. Every finished backend does them.
- Optional features `tint`, `blendModes`, `particles`, `lights` and `postEffects` default to `false`. Declining one is a permanent, legitimate answer. Canvas claims `blendModes`. WebGL claims all five.

The harness flag and the backend's runtime `capabilities` should agree. Some optional-feature tests run on every backend because `BaseRenderer` supplies a fallback: `drawParticles` draws one sprite per particle, and the light and post-effect methods are no-ops. Those tests assert the call works. The gated ones assert the behaviour the flag promises.

## The browser project

One-time setup:

```bash
npx playwright install chromium
```

To use an installed Chrome or Chromium instead, set `M2D_BROWSER` to its path. It must support WebGL2.

```bash
M2D_BROWSER=/usr/bin/chromium npm run test:browser
```

Headless Chromium has no GPU. `vitest.browser.config.js` passes flags so WebGL2 uses the SwiftShader software rasterizer, and WebGPU runs on Dawn over SwiftShader's Vulkan. `browser/environment.smoke.test.js` fails first with a clear message if WebGL2 is still unavailable, and `browser/webgpu.smoke.test.js` does the same for WebGPU. The Vulkan flags are load-bearing: with only the ANGLE flags, the WebGPU instance is torn down on first use. A 2D-canvas snapshot of a WebGPU canvas reads back empty under SwiftShader, so 3D tests read pixels through `renderer.readPixels()` in the same task as the draw.

A minimal Linux or WSL2 install may lack system libraries. If the browser fails with `error while loading shared libraries`:

```bash
sudo npx playwright install-deps chromium
# or on Ubuntu 24.04
sudo apt-get install libnspr4 libnss3 libasound2t64
```

## The editor's GUI

`scripts/driveEditor.mjs` (`npm run test:editor`) drives the real editor. It starts an editor host for each suite, opens it in a Chrome with the GPU, and uses real pointer input: click to pick, a gizmo drag that must commit one edit, isolate, play and stop, and undo back to clean. It saves nothing. The example projects are driven in place, and unsaved edits only touch the git-ignored `.m2d/journal/`. A suite refuses a scene that opens with unsaved edits, such as a journal replayed from an earlier session, because undoing back to clean would walk into them and the host would then drop the journal. The template suite makes a fresh project in a temp folder.

```bash
npm run test:editor                       # every suite: lot, platformer, paths, playtest, settle, look, search, template2d
node scripts/driveEditor.mjs lot --headed # one suite, with the window shown
node scripts/driveEditor.mjs --out shots  # keep the screenshots somewhere known
```

Each suite writes screenshots and a `report.json` to `--out`, a temp folder by default. The exit code is non-zero when a check fails. The browser comes from `packages/editor-host/src/chrome.ts`, the same launcher as the MCP `screenshot_scene`. It uses `M2D_CHROME`, then the Windows Chrome under WSL, then Playwright's Chromium. Each launch asks for debugging port 0 and reads the port Chrome took from its own profile. A port picked in advance could be taken by another agent's Chrome, and the harness would then drive and close that browser. The launcher also reaps its browser synchronously when the process exits, because a graceful close can lose the shutdown race: Vite installs its own SIGTERM handler and exits as soon as its server has closed.

The Canvas backend's conformance run is repeated in the browser project so the suite's tolerances are proven against Chromium's rasterizer. A test that fails only there is a tolerance problem.

## Keeping the suite honest

The suite was checked by mutation testing. Ten bugs were injected into the Canvas backend, among them swapped flips, an ignored `isScreenSpace`, a dropped `cornerRadius`, transposed tiles, a `popTransform` that did not restore and an ignored `globalAlpha`. All ten were caught. Repeat that exercise after adding tests to confirm they can fail.
