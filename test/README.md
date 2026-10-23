# Renderer tests

```bash
npm test          # run once
npm run test:watch
```

Tests run headless in Node. `node-canvas` provides a real rasterizer, so pixel
assertions work in CI without a browser.

## Why three layers

The renderer abstraction has two sides that can break independently: callers
that emit draw calls, and backends that execute them. Each layer below targets
one of them, so a failure localises immediately.

| Layer | File | Tests | What it proves |
| --- | --- | --- | --- |
| Backend contract | `conformance/rendererConformance.js` | 95 | A backend rasterizes every primitive correctly |
| Caller contract | `engineDrawCalls.test.js` | 28 | Engine/actor code emits the right draw calls |
| UI + wiring | `uiRenderer.test.js`, `rendererRegistry.test.js` | 44 | Screen-space forwarding, widgets, backend selection |

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

A new backend is validated by one file. Nothing else changes:

```js
// test/webglRenderer.conformance.test.js
import { WebGLRenderer } from '../src/core/renderers/webglRenderer.js';
import { describeRendererConformance } from './conformance/rendererConformance.js';
import { createCanvasElement } from './helpers/environment.js';

describeRendererConformance({
  name: 'WebGLRenderer',
  createRenderer: () => new WebGLRenderer(),
  createTarget: (width, height) => createCanvasElement(width, height),
  readPixels: readWebGLPixels,
  capabilities: {
    gradients: true,
    shadows: false,   // not implemented yet -> those tests skip
    text: true,
    roundedCorners: true,
    clipping: true,
    transforms: true
  }
});
```

`readPixels` must return RGBA with a **top-left origin**. WebGL reads
bottom-up, so flip the rows:

```js
function readWebGLPixels(target) {
  const gl = target.getContext('webgl2') ?? target.getContext('webgl');
  const { width, height } = target;
  const raw = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);

  const data = new Uint8ClampedArray(raw.length);
  const stride = width * 4;
  for (let y = 0; y < height; y++) {
    data.set(raw.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride);
  }
  return { width, height, data };
}
```

### Capabilities

`capabilities` lets a partially-built backend skip what it does not support yet
while still being held to everything it claims. Start with most flags `false`,
flip them on as features land. A flag set to `true` is a promise the suite
enforces.

### Running WebGL

Node has no WebGL, so a WebGL backend needs a browser runner. Add
`@vitest/browser` + Playwright and give that one file a browser environment;
the suite itself is environment-agnostic (`test/helpers/environment.js` already
prefers a real DOM when one exists).

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
