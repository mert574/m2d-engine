# Renderer tests

```bash
npm test               # both projects (node + browser)
npm run test:node      # headless only, ~0.4s
npm run test:browser   # headless Chromium only (needs one-time setup, see below)
npm run test:watch     # watches the node project
```

Tests are split into two Vitest projects (`vitest.workspace.js`):

- **node** (`vitest.config.js`) — everything outside `test/browser/`. Runs in
  Node; `node-canvas` provides a real rasterizer so pixel assertions work
  without a browser.
- **browser** (`vitest.browser.config.js`) — `test/browser/**` only. Runs in
  headless Chromium via Playwright. Node has no WebGL, so this is where the
  WebGL2 backend is validated.

## Why three layers

The renderer abstraction has two sides that can break independently: callers
that emit draw calls, and backends that execute them. Each layer below targets
one of them, so a failure localises immediately.

| Layer | File | Project | What it proves |
| --- | --- | --- | --- |
| Backend contract | `conformance/rendererConformance.js` (95 tests per backend) | node + browser | A backend rasterizes every primitive correctly |
| Caller contract | `engineDrawCalls.test.js` | node | Engine/actor code emits the right draw calls |
| UI + wiring | `uiRenderer.test.js`, `rendererRegistry.test.js` | node | Screen-space forwarding, widgets, backend selection |
| Browser environment | `browser/environment.smoke.test.js` | browser | WebGL2 exists in the runner, pixel readback is top-left, fixtures upload as textures |

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
backend's file is the template:

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
    gradients: false,
    shadows: false,
    text: false,
    roundedCorners: false,
    clipping: false,
    transforms: false
  }
});
```

`readPixels` must return RGBA with a **top-left origin**. `readWebGLPixels` in
`helpers/environment.js` does the bottom-up row flip that `gl.readPixels`
requires; `readCanvas2DPixels` is its 2D counterpart. The renderer must keep
its drawing buffer (`preserveDrawingBuffer: true`) so the presented frame is
still there when the test reads it.

### Capabilities

`capabilities` lets a partially-built backend skip what it does not support yet
while still being held to everything it claims. Start with most flags `false`,
flip them on as features land. A flag set to `true` is a promise the suite
enforces.

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
ninety.

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

## Keeping the suite honest

The suite was validated by mutation testing: ten deliberate bugs were injected
into the Canvas backend (swapped `flipX`/`flipY`, ignored `isScreenSpace`,
dropped `cornerRadius`, transposed sprite tiles, unresolved gradients,
`popTransform` not restoring, flipped camera sign, UI forwarding without
`isScreenSpace`, ignored `globalAlpha`, skipped text stroke). All ten were
caught. Re-run that exercise after adding tests to confirm they can still fail.
