# Renderer tests

```bash
npm test               # both projects (node + browser)
npm run test:node      # headless only, ~0.4s
npm run test:browser   # headless Chromium only (needs one-time setup, see below)
npm run test:watch     # watches the node project
```

Tests are split into two Vitest projects (declared in `test.projects` in
`vitest.config.js`):

- **node** (inline in `vitest.config.js`) — everything outside `test/browser/`. Runs in
  Node; `node-canvas` provides a real rasterizer so pixel assertions work
  without a browser.
- **browser** (`vitest.browser.config.js`) — `test/browser/**` only. Runs in
  headless Chromium via Playwright. Node has no WebGL, so this is where the
  WebGL2 backend is validated.

Both projects load `helpers/setupPhysics.js` as a setup file, which awaits
`initPhysics()` once per worker. Rapier is WASM and must be compiled before
any physics world — and therefore any `M2D` — can be constructed, so doing it
there keeps every suite free to build a game synchronously.

## Why layered

The renderer abstraction has two sides that can break independently: callers
that emit draw calls, and backends that execute them. Each layer below targets
one of them, so a failure localises immediately.

| Layer | File | Project | What it proves |
| --- | --- | --- | --- |
| Backend contract | `conformance/rendererConformance.js` (one suite, run per backend) | node + browser | A backend rasterizes every primitive correctly |
| Caller contract | `engineDrawCalls.test.js` | node | Engine/actor code emits the right draw calls |
| UI + wiring | `uiRenderer.test.js`, `rendererRegistry.test.js` | node | Screen-space forwarding, widgets, backend selection |
| Browser environment | `browser/environment.smoke.test.js` | browser | WebGL2 exists in the runner, pixel readback is top-left, fixtures upload as textures |

Beyond the renderer abstraction, engine-level suites cover the display
pipeline and what sits on it: `viewport.test.js` (sizing math, pointer and
label projection, `sameResolution`), `resizeLifecycle.test.js` (camera, input
mapping, hit testing and `worldFilter` plumbing across resizes),
`worldOverlay.test.js` (world-anchored annotations drawn sharp in the UI
pass), `settingsMenu.test.js` (the overlay, its input capture and pause),
`pause.test.js` (the loop freezes simulation but keeps presenting) and
`sceneActions.test.js` (scene-JSON buttons and background layers).

`physics.test.js` characterizes the physics boundary (`src/core/physics/`):
unit semantics (px/s and px/s²), fixed-step pacing, gravity and resting
contact, body mutation, kinematic and character bodies (platform rides,
grounding, wall sliding), collision events, queries, continuous collision
detection for `bullet` bodies, and world lifecycle. It asserts the *contract*
with tolerances, never Rapier's internals, so it doubles as the specification
a replacement solver would have to satisfy — a failure there names the
behaviour that changed, not a number that drifted. `browser/physics.smoke.test.js`
re-checks that the WASM module actually loads and runs in a real browser,
which Node cannot prove.

### 1. Backend conformance (pixels)

`describeRendererConformance(harness)` is the renderer contract written as
executable tests. It renders scenes and inspects the resulting pixels, so it
validates real rasterization rather than mocks.

Assertions sample shape **interiors** with colour tolerance instead of
comparing whole buffers. That keeps them meaningful across backends, which
legitimately differ in antialiasing — unlike golden-image snapshots, which
would need separate baselines per backend and churn on every visual tweak.

### 2. Caller draw calls (no pixels)

`RecordingRenderer` is a `BaseRenderer` that records calls instead of drawing.
It catches things pixels cannot distinguish: wrong option names, unbalanced
`pushTransform`/`popTransform` pairs, debug overlays that ignore the debug
flag. The `UIImage` regression — it called `drawImage` positionally, so UI
images silently never rendered — is exactly this class of bug.

It deliberately inherits `BaseRenderer`'s shared logic (`hitTest`, debug flags,
stats), so that code is exercised for real rather than stubbed.

## Validating a new backend

A new backend is validated by one file. Nothing else changes. The WebGL2
backend's file is the template (shown here with flags off, as a backend
starts out; the real file has them all on):

```js
// test/browser/webglRenderer.conformance.test.js
import { WebGLRenderer } from '../../src/core/renderers/webglRenderer.js';
import { describeRendererConformance } from '../conformance/rendererConformance.js';
import { createCanvasElement, readWebGLPixels } from '../helpers/environment.js';

describeRendererConformance({
  name: 'WebGLRenderer',
  createRenderer: () => new WebGLRenderer({
    contextAttributes: { preserveDrawingBuffer: true }
  }),
  createTarget: (width, height) => createCanvasElement(width, height),
  readPixels: readWebGLPixels,
  capabilities: {
    // Mandatory contract features: default true, turned off only while a
    // backend is still being built.
    gradients: false,
    shadows: false,
    text: false,
    roundedCorners: false,
    clipping: false,
    transforms: false,
    // Optional features: default false, turned on as a backend claims them.
    tint: false,
    blendModes: false,
    particles: false,
    lights: false,
    postEffects: false
  }
});
```

`readPixels` must return RGBA with a **top-left origin**. `readWebGLPixels` in
`helpers/environment.js` does the bottom-up row flip that `gl.readPixels`
requires; `readCanvas2DPixels` is its 2D counterpart. The renderer must keep
its drawing buffer (`preserveDrawingBuffer: true`) so the presented frame is
still there when the test reads it.

### Capabilities

`capabilities` lets a backend skip what it does not support while still being
held to everything it claims. A flag set to `true` is a promise the suite
enforces. There are two kinds, and they default in opposite directions:

- **Mandatory contract features** — `gradients`, `shadows`, `text`,
  `roundedCorners`, `clipping`, `transforms`. These default to `true`: every
  finished backend must do them. Turn one off only while a backend is still
  under construction, and turn it back on as the feature lands.
- **Optional features** — `tint`, `blendModes`, `particles`, `lights`,
  `postEffects`. These default to `false` (from `OPTIONAL_CAPABILITIES` in
  `baseRenderer.js`), because backends are genuinely unalike and declining one
  is a legitimate permanent answer, not a gap. Canvas claims only
  `blendModes`; WebGL claims all five.

A backend also reports optional features at runtime through
`renderer.capabilities` / `renderer.supports(name)`, which is what callers use
to degrade. The harness flag and the runtime flag should agree.

Some optional features still have tests that run on **every** backend, because
`BaseRenderer` supplies a working fallback: `drawParticles` falls back to one
`drawSprite` per particle, and `setAmbientLight` / `drawLight` /
`setPostEffects` are no-ops. Those tests assert the call works and does not
throw; the `skipIf` ones assert the fast or richer behaviour the flag promises.

### The browser project

One-time setup downloads Chromium:

```bash
npx playwright install chromium
```

Chromium also needs a few system libraries that a minimal Linux/WSL2 install
may lack (`libnspr4`, `libnss3`, `libasound2`). If `npm run test:browser`
fails with `error while loading shared libraries`, install them:

```bash
sudo npx playwright install-deps chromium      # or, on Ubuntu 24.04:
sudo apt-get install libnspr4 libnss3 libasound2t64
```

Headless Chromium has no GPU. `vitest.browser.config.js` passes launch flags
so WebGL2 falls back to the SwiftShader software rasterizer. The smoke test
`browser/environment.smoke.test.js` fails fast with a clear message if WebGL2
is still unavailable, so a broken runner shows up as one failure rather than
a hundred and twenty.

The suite itself is environment-agnostic: `helpers/environment.js` prefers a
real DOM when one exists and only falls back to `node-canvas` in Node. The
Canvas backend's conformance run is repeated in the browser project
(`browser/canvasRenderer.conformance.test.js`) so the suite's antialiasing
tolerances are proven against Chromium's rasterizer independently of any
WebGL work: a test that fails only there is a tolerance bug, not a backend bug.

## Contract details worth knowing

Two behaviours are easy to implement differently and are pinned by tests:

- **Partial arc fills are circular segments, not pie sectors.** `drawArc` with
  a partial sweep fills the region between the arc and the chord joining its
  endpoints; the circle's centre stays empty. This matches Canvas 2D and is
  what the engine has always rendered.
- **Frame order is world pass, then screen pass.** `beginFrame`/`endFrame`
  present world content; `beginScreenFrame`/`endScreenFrame` draw UI on top.
- **Translucent gradient stops are not premultiplied twice.** A radial stop at
  alpha 0.5 over the opaque black clear must land near 128, not 64. This is
  pinned by absolute-value tests because every other gradient test uses opaque
  stops, which is exactly how the WebGL backend shipped with squared alpha:
  `UNPACK_PREMULTIPLY_ALPHA_WEBGL` applies to `ArrayBufferView` uploads too,
  so the already-premultiplied gradient lookup row was premultiplied again.
- **Shadows are cast by the whole silhouette, once.** A rect with fill, stroke
  and a shadow casts one shadow shaped like fill + stroke, and `globalAlpha`
  applies once to the composite. Canvas 2D's per-operation shadow does not do
  this on its own; the Canvas backend renders such primitives via a scratch
  canvas. The pinned tests sample the shadow under the stroke.
- **Transform and clip pushes share one strictly nested stack.** A clip pushed
  inside a transform is popped first. The pinned test nests a clip in a
  translate and checks both are restored.
- **`primitives` vs `drawCalls`.** Stats tests assert `primitives` (what the
  caller requested) exactly and only bound `drawCalls` (1 ≤ drawCalls ≤
  primitives) so batching backends are not penalised.

## Keeping the suite honest

The suite was validated by mutation testing: ten deliberate bugs were injected
into the Canvas backend (swapped `flipX`/`flipY`, ignored `isScreenSpace`,
dropped `cornerRadius`, transposed sprite tiles, unresolved gradients,
`popTransform` not restoring, flipped camera sign, UI forwarding without
`isScreenSpace`, ignored `globalAlpha`, skipped text stroke). All ten were
caught. Re-run that exercise after adding tests to confirm they can still fail.
