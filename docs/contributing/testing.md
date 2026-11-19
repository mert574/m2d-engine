# Testing

```bash
npm test               # every suite but the browser tier, plus example scene validation
npm run test:node      # engine Node suite, no GPU
npm run test:gpu       # engine GPU suite: WebGL2 and WebGPU in Node
npm run test:browser   # engine browser tier in headless Chromium, on demand
npm run test:watch     # Node suite, re-run on change
npm run test:editor    # the editor's GUI, driven in a Chrome with the GPU
```

The engine's tests are three Vitest projects declared in `packages/engine/vitest.config.js`. `npm test` runs `node` and `gpu`.

| Project | Files | Runs in | Why |
| --- | --- | --- | --- |
| `node` | everything outside `test/gpu/` and `test/browser/` | Node, with `@napi-rs/canvas` for fixtures | Fast. Everything that needs no GPU |
| `gpu` | `test/gpu/**` | Node, on the machine's GPU: WebGL2 through ANGLE, WebGPU through Dawn | Everything that builds a game or draws. The WebGL conformance run, curves, shadow lights, views, the view cull, and the `webgpu.*.test.js` suites for the 3D renderer: lighting, shadows, props, streaming, the loader and pixel-level smoke scenes. `test/gpu/engine/` holds the engine-level suites that construct an `M2D` (resize lifecycle, settings menu, console, volumes, quality) |
| `browser` | `test/browser/**` and `test/gpu/*` | Headless Chromium through Playwright | What needs a real browser: Pointer Events, pointer lock, edit mode, WebGL context loss, the model loader's worker. It runs the `gpu` renderer files too, which checks the Node stand-ins against Chromium; `test/gpu/engine/` stays out, since those suites use Node's `window` stub. Not part of `npm test`: run it when you change one of those flows or the gpu environment |

All three load `test/helpers/setupPhysics.js`, which awaits `initPhysics()` once per worker so every suite can construct a game synchronously.

A suite that constructs an `M2D` in the node project installs a `window` global with `installWindowStub()` from `test/helpers/environment.js`. The stub carries the real `performance` object, which Rapier's WASM glue reads its clock through whenever `window` exists. A stub without it panics on the first physics step. See [Troubleshooting](./troubleshooting#development-environment).

In the examples workspace, `examples/test/scenes.test.js` validates every example scene JSON against the loader twice: once against stub registries, for structure and cross-references, and once in a real headless game for every example folder with an `m2d.project.json`, with that game's own `register(game)`, so an actor property or constraint param its class does not declare fails the suite rather than the game. `sceneWriter.test.js` holds the scenes to the canonical writer's form. Every example is also played headless with its real scene and cast: `rowWaves`, `fieldGate`, `keepIntents`, `groveTicks`, `beelineHeadless`, `circuitDriving` and the four that walk a level end to end and leave it on Escape (`valleyRun`, `facilityRun`, `workshopDrops`, `yardWalk`). `courtyards` and `meadow` check a property of the shipped scene files, since what matters there is the layout a person edits. A headless run catches a presentation read in simulation code (a renderer asked in a constructor, a camera read in a tick), which no other suite can.

## Layers

| Layer | File | Project | Proves |
| --- | --- | --- | --- |
| Backend contract | `conformance/rendererConformance.js`, run once per backend | gpu, browser | A backend rasterizes every primitive correctly |
| Caller contract | `engineDrawCalls.test.js` | node | Engine and actor code emit the right draw calls |
| UI and wiring | `uiRenderer.test.js`, `rendererRegistry.test.js`, `rendererRefusal.test.js` | node | Screen-space forwarding, backend selection, the refusal without WebGL2 |
| Browser environment | `browser/environment.smoke.test.js` | browser | WebGL2 exists, pixel readback is top-left, fixtures upload |
| Context loss | `browser/webglContextLoss.test.js` | browser | A resize during a lost WebGL context is replayed on restore |

Engine-level suites: `viewport.test.js` for sizing math and projection, `gpu/engine/resizeLifecycle.test.js` for camera, input mapping and filter plumbing across resizes, `worldOverlay.test.js`, `gpu/engine/settingsMenu.test.js`, `pause.test.js` (the loop's pause gate, the tick and `game.time` integration), `time.test.js` (the clocks, the tick and timers, driven by hand), `determinism.test.js` (the same scene at 30, 60 and 144 frames per second ends in bit-identical state; seeded replay; the camera's frame-rate correction), `sceneActions.test.js`, `sceneLoader.test.js`, `constraints.test.js`, `geometry.test.js`.

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
| `helpers/gpuEnvironment.js` | The `gpu` project's browser stand-ins. See [The gpu project](#the-gpu-project) |
| `helpers/setupPhysics.js` | Awaits `initPhysics()` once per worker |

## Test helpers shared with the kit

`packages/engine/test/helpers/` is exported as `m2d-engine/test/helpers/*` so the kit's tests build on the same `makeTestGame`, `RecordingRenderer` and environment stubs instead of copying them. It is test support, not the engine's API: nothing under it is documented or stable for games. The engine's own suites drive the simulation with `test/helpers/cast.js`, a cast composed from the engine's capabilities, and never import the kit.

## Validating a new backend

One file. The WebGL2 backend's file is the template.

```js
// test/gpu/webglRenderer.conformance.test.js
import { WebGLRenderer } from '../../src/core/renderers/webglRenderer.js';
import { describeRendererConformance } from '../conformance/rendererConformance.js';
import { createCanvasElement, readWebGLPixels } from '../helpers/environment.js';

describeRendererConformance({
  name: 'WebGLRenderer',
  createRenderer: () => new WebGLRenderer({ contextAttributes: { preserveDrawingBuffer: true } }),
  createTarget: (width, height) => createCanvasElement(width, height),
  readPixels: readWebGLPixels
});
```

`readPixels` must return RGBA with a top-left origin. `readWebGLPixels` does the row flip that `gl.readPixels` needs. `readCanvas2DPixels` is the 2D counterpart. The renderer must keep its drawing buffer so the test can read it after the frame.

Nothing in the suite is gated: every primitive, tint, blending, batched particles, lights, shadow casters and the post pass are all held to. A backend under construction runs one group at a time with Vitest's `-t` filter (`npx vitest run --project gpu -t 'drawRect'`).

## The gpu project

`helpers/gpuEnvironment.js` is installed before any test module loads. It gives `document.createElement('canvas')` a canvas whose `'2d'` context is Skia (`@napi-rs/canvas`), whose `'webgl2'` context is ANGLE (`@onirenaud/node-webgl`) and whose `'webgpu'` context is Dawn (`webgpu`, Dawn's own Node binding). Around it, it stands in for what the renderers reach for: `createImageBitmap`, `ImageBitmap`, `ImageData`, `OffscreenCanvas`, `requestAnimationFrame`, a `fetch` that reads `file:` URLs, and the document tree as far as the 3D renderer's HUD overlay walks it. Dawn's Node binding has no canvas and no external images, so the environment supplies a `GPUCanvasContext` over a texture and a `copyExternalImageToTexture` that uploads the source's pixels. Nothing in the engine knows it is in Node.

The GPU is the machine's own. Without one, Mesa's CPU drivers stand in: lavapipe for Dawn's Vulkan and llvmpipe for ANGLE's OpenGL. That is how CI runs it, with `mesa-vulkan-drivers`, `libgl1-mesa-dri` and `libegl1` installed. To run the suite on the CPU drivers on a machine that has a GPU:

```bash
VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json LIBGL_ALWAYS_SOFTWARE=1 npm run test:gpu
```

`M2D_DAWN_ADAPTER` names Dawn's adapter instead, and an unknown name makes it list them. `NODE_WEBGL_BACKEND` picks ANGLE's backend (`vulkan`, `gl`, `gles`, `swiftshader`). The assertions compare pixels with each other (lit brighter than shadowed, red where the red box is) or sample shape interiors with a tolerance, so a real GPU and a software one both pass.

A test that needs a DOM element other than a canvas fails in this project with a message saying so. It belongs in `test/browser/`.

On a machine with lavapipe installed, Dawn prints two `artificially reduced` warnings per test worker while it lists the adapters. They come from the native library and cannot be silenced from JavaScript.

## The browser project

Run it when you change a flow only it covers (input, pointer lock, edit mode, context loss, the loader's worker) or `helpers/gpuEnvironment.js`. One-time setup:

```bash
npx playwright install chromium
```

To use an installed Chrome or Chromium instead, set `M2D_BROWSER` to its path. It must support WebGL2.

```bash
M2D_BROWSER=/usr/bin/chromium npm run test:browser
```

Headless Chromium has no GPU. `vitest.browser.config.js` passes flags so WebGL2 uses the SwiftShader software rasterizer, and WebGPU runs on Dawn over SwiftShader's Vulkan. `browser/environment.smoke.test.js` fails first with a clear message if WebGL2 is still unavailable, and `gpu/webgpu.smoke.test.js` does the same for WebGPU. The Vulkan flags are load-bearing: with only the ANGLE flags, the WebGPU instance is torn down on first use. The config also launches Chromium without `DISPLAY`: SwiftShader's display connects to the X server named there even when headless, and a server that refuses it leaves the page with no WebGL2 at all. A 2D-canvas snapshot of a WebGPU canvas reads back empty under SwiftShader, so 3D tests read pixels through `renderer.readPixels()` in the same task as the draw.

On a machine with a GPU, real-GPU flags replace the SwiftShader ones and run the tier several times faster:

```bash
M2D_BROWSER_FLAGS='--use-angle=gl-egl --enable-unsafe-webgpu --enable-features=Vulkan --ignore-gpu-blocklist' npm run test:browser
```

A minimal Linux or WSL2 install may lack system libraries. If the browser fails with `error while loading shared libraries`:

```bash
sudo npx playwright install-deps chromium
# or on Ubuntu 24.04
sudo apt-get install libnspr4 libnss3 libasound2t64
```

## The editor's GUI

`scripts/driveEditor.mjs` (`npm run test:editor`) drives the real editor. It starts an editor host for each suite, opens it in a Chrome with the GPU, and uses real pointer input: click to pick, a gizmo drag that must commit one edit, isolate, play and stop, and undo back to clean. It saves nothing. The example projects are driven in place, and unsaved edits only touch the git-ignored `.m2d/journal/`. A suite refuses a scene that opens with unsaved edits, such as a journal replayed from an earlier session, because undoing back to clean would walk into them and the host would then drop the journal. The template suite makes a fresh project in a temp folder.

```bash
npm run test:editor                       # every suite: examples, lot, platformer, paths, circuitRoad, playtest, settle, look, search, template2d
node scripts/driveEditor.mjs examples     # every example project opens on its first scene, plays and stops clean, then opens each other scene without a problem, checked against the game's classes
node scripts/driveEditor.mjs lot --headed # one suite, with the window shown
node scripts/driveEditor.mjs --out shots  # keep the screenshots somewhere known
```

Each suite writes screenshots and a `report.json` to `--out`, a temp folder by default. The exit code is non-zero when a check fails. The browser comes from `packages/editor-host/src/chrome.ts`, the same launcher as the MCP `screenshot_scene`. It uses `M2D_CHROME`, then the Windows Chrome under WSL, then Playwright's Chromium. Each launch asks for debugging port 0 and reads the port Chrome took from its own profile. A port picked in advance could be taken by another agent's Chrome, and the harness would then drive and close that browser. The launcher also reaps its browser synchronously when the process exits, because a graceful close can lose the shutdown race: Vite installs its own SIGTERM handler and exits as soon as its server has closed.

## A passing test is quiet

Output belongs to failures. A test that expects the engine to refuse something silences the line it provokes (`const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})`, then asserts what was said and restores). A test that only happens to build a net client turns the client's logging off with `game.netLogLevel = 0`. Numbers a reader would want when a check fails go in the assertion's message, which prints only then.

Under an agent's terminal Vitest picks a minimal reporter that hides what passing tests print, so a noisy suite looks silent there and floods the CI log. Run `npx vitest run --reporter=default` to see what CI sees.

## Keeping the suite honest

The conformance suite was checked by mutation testing when it was written. Ten bugs were injected into a backend, among them swapped flips, an ignored `isScreenSpace`, a dropped `cornerRadius`, transposed tiles, a `popTransform` that did not restore and an ignored `globalAlpha`. All ten were caught. Repeat that exercise after adding tests to confirm they can fail.
