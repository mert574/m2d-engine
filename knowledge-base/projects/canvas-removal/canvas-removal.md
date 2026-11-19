# Canvas removal

Goal: WebGL2 is the 2D floor, the Canvas 2D backend and the renderer capability flags go, and the GPU tests run in Node so no test needs a browser. Roadmap line: "Drop the Canvas 2D backend".

## Decisions

- **Canvas goes** (owner, 17 Nov 2026). It stays behind every renderer change and costs more than the near-zero browsers it serves. The removal takes the simplifications it opens up, not just the deletion.
- **GPU tests run in Node** (owner, 19 Nov 2026): `webgpu` (Dawn's Node binding) for WebGPU and `@onirenaud/node-webgl` (ANGLE) for WebGL2. Research the same day: every engine WGSL module compiles on Dawn, 59 of 66 WebGPU tests and all 154 WebGL tests passed under scratch shims, on the Intel GPU and on CPU-only Mesa (lavapipe, llvmpipe). The remaining failures were the environment (a Web Worker, a Basis module-interop error in Vitest, DOM sibling lookups), not rendering. Pixel values follow the same GPU stacks the browsers use, and the tests compare pixels to each other, not to constants. Both packages are pre-1.0 and `node-webgl` has one author and compiles on install on Linux; accepted, since they replace a headless Chromium download in every run.
- **The browser tier stays, out of `npm test`** (owner, 19 Nov 2026). Input, pointer lock, DOM layout, fullscreen, context loss and the loader's worker still need a browser. They are low priority: `npm run test:browser` runs them on demand, when their flows are edited.
- **The browser tier also runs the gpu files.** The Node environment stands in for a browser, so the same `test/gpu/**` files run in Chromium too and the stand-ins are checked against the real thing ([[working-style]]: a stand-in is checked against what it stands for). Run it after changing `test/helpers/gpuEnvironment.js`.
- **`supports()` goes** (owner, 19 Nov 2026). With WebGL2 the only 2D backend, every optional feature is mandatory; the contract holds no capability table.
- **No WebGL2 means no game** (owner, 19 Nov 2026). The page shows a static text saying a modern browser is required; the engine loop does not start. No fallback.
- **The renderer is not a choice.** 2D is WebGL2 and 3D is WebGPU, so the `r_renderer` cvar, the settings menu's renderer row and the `?renderer=` parameter go. The `renderer` constructor option stays for a backend registered through `registerRenderer`.
- **`@napi-rs/canvas` stays.** The Node tests still rasterise sprite fixtures and text through Skia; only its role as the Canvas backend's context ends.

## Plan

Phases are layers: each uses only what the earlier ones built. One commit per phase.

### Phase 1: GPU tests in Node (done, 19 Nov 2026)

The seams the removal stands on: WebGL2 in Node lets every test that built a game on `renderer: 'canvas'` build it on WebGL instead. A `gpu` Vitest project over `test/gpu/**` with `test/helpers/gpuEnvironment.js`, `npm test` running `node` and `gpu`, the browser tier on demand, CI on Mesa's CPU drivers. See the record.

Done when: `npm test` runs every GPU test with no browser installed, on a machine with no GPU, and the browser tier passes on demand.

### Phase 2: the Canvas backend goes (done, 19 Nov 2026)

The backend, the fallback and every surface that chose a renderer are deleted; a browser without WebGL2 gets a line of text and no game. See the record.

Done when: `canvas` names no backend anywhere in the repository, a page without WebGL2 shows the text and runs no loop, and `npm test` passes.

### Phase 3: the capability flags go

- `OPTIONAL_CAPABILITIES`, `capabilities` and `supports()` leave `BaseRenderer`, `UIRenderer` and the UI painter; the contract prose in `baseRenderer.js` says every feature is mandatory. `BaseRenderer`'s one-sprite-per-particle `drawParticles` fallback goes with them.
- The conformance harness's optional sections become unconditional; its own `capabilities` table goes.
- Callers simplify: the `supports('blendModes') ? 'additive' : undefined` and `get lit()` getters across the examples become constants, kit `effects.ts` blends additively, the backdrops stop passing flags, and the showcase stops printing a capability list. In 3D these options reach the HUD's WebGL backend, which supports them all, so nothing changes on screen.
- Docs: the capabilities section of `renderer.md` and `renderer-backend.md`, and `AGENTS.md`'s "mandatory for every backend or declared through `capabilities`" rule.

Done when: `supports(` and `capabilities` appear nowhere in the repository and `npm test` passes.

## Backlog

- The model loader's worker test in Node, if Node's `Worker` can stand in for the browser's.

## Record

- Phase 2, the Canvas backend goes, 19 Nov 2026. `canvasRenderer.js`, both Canvas conformance files, `FALLBACK_RENDERER`, the fallback in `M2D`'s renderer setup, the `?renderer=` override, the `r_renderer` cvar and the settings menu's renderer row (the 3D "no other" row too) are gone. A renderer that cannot initialise now makes the constructor throw after `#refuseDisplay` has replaced the canvas with `<p class="m2d-unsupported">This game needs a modern browser with WebGL 2.</p>` (WebGPU in 3D), found through the canvas's `ownerDocument` so a canvas outside a page only throws; the new `unsupportedText` option rewords it or, as `false`, leaves the page alone. `rendererRefusal.test.js` (Node, where there is no WebGL2) and `browser/unsupported.test.js` (a real DOM with `getContext` returning null) prove it. The engine suites that construct an `M2D` (`resizeLifecycle`, `settingsMenu`, `console`, `volumes`, `quality`) moved to `test/gpu/engine/`, which the browser project leaves out because they install Node's `window` stub; `views`, `viewCull`, `editMode` and `input` build on WebGL and read pixels back through it. The showcase stopped being a "renderer comparison": its menu caption, the reload that skipped the menu, and every "both backends" sentence in the examples, the docs and the engine's comments now describe one 2D backend. The editor's `launchGpuChrome` drops `DISPLAY` and `WAYLAND_DISPLAY` for a headless launch (headed keeps them, since the window needs one), the fix the phase 1 learning asked for. Suites: engine node 1399, gpu 342, browser 271 on the real GPU; kit, editor, host, server and examples unchanged and green.

- Phase 1, GPU tests in Node, 19 Nov 2026. `webgpu` 0.6.2 and `@onirenaud/node-webgl` 0.2.0 are pinned engine devDependencies with their install scripts allowed. `test/helpers/gpuEnvironment.js` is the `gpu` project's setup: a canvas answering `'2d'` with Skia, `'webgl2'` with ANGLE and `'webgpu'` with Dawn (a `GPUCanvasContext` over a texture), the document tree as far as the HUD overlay walks it, and the image, `fetch` and frame APIs, with Dawn's missing `copyExternalImageToTexture` and ANGLE's foreign image sources uploaded as pixels. The WebGL conformance run, curves, shadow lights, views, the view cull and the `webgpu.*` suites moved to `test/gpu/` (233 tests, 8 s on this machine's Intel GPU, 16 s on lavapipe and llvmpipe); the loader's worker check split into `browser/modelLoader.worker.test.js`. `npm test` needs no browser; CI installs `mesa-vulkan-drivers`, `libgl1-mesa-dri` and `libegl1` instead of Chromium (not yet seen on a GitHub runner). Probed: breaking sun shadows and sprite tint fails five gpu tests; the suite passes with Playwright's browsers hidden and only CPU drivers. Fixed on the way, both pre-existing: the vendored Basis transcoder's CommonJS footer broke its import under Vitest (replaced by the ES export alone), and the click-route smoke test still expected the screen-space `drawArc` the NPC AI work replaced with a ground ring (it now asserts a flat ring around the destination, probed by moving the ring). Learned: **a refused `DISPLAY` silently kills headless GPU stacks** — SwiftShader's ANGLE display and Dawn's Vulkan loader both connect to the X server named there, and when it refuses, Chromium has no WebGL2 and WebGPU no adapter (the "SwiftShader gives no adapter" finding of the research); the browser config and the gpu environment now drop `DISPLAY` and `WAYLAND_DISPLAY`. Dawn prints two `artificially reduced` warnings per worker while listing lavapipe, from native code that JavaScript cannot silence.

Related: [[engine-surface]], [[working-style]]
