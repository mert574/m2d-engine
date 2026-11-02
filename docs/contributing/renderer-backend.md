# Writing a renderer backend

A backend is a class that extends `BaseRenderer` and implements every method that throws `Method not implemented`. The engine, the UI layer and the conformance suite work against that contract, so a new backend needs no changes elsewhere. `packages/engine/src/core/renderers/canvasRenderer.js` is the smallest complete backend and the model for this page.

## Skeleton

```javascript
import { BaseRenderer } from 'm2d-engine/core/renderers/baseRenderer.js';
import { identityViewport } from 'm2d-engine/core/viewport.js';

export class MyRenderer extends BaseRenderer {
  constructor() {
    super();
    this.capabilities.blendModes = true;   // claim only what you implement
    this.target = null;
  }

  init(element, options = {}) {
    this.target = element;
    if (options.worldFilter) this.setWorldFilter(options.worldFilter);
    this.setViewport(options.viewport || identityViewport(
      options.width || this.viewport.viewWidth,
      options.height || this.viewport.viewHeight
    ));
  }

  destroy() { this.target = null; }
  // ... the methods below
}
```

Register it, then select it by name or pass the class.

```javascript
import { registerRenderer } from 'm2d-engine/core/renderers/index.js';
registerRenderer('mine', MyRenderer);
new M2D(canvas, { renderer: 'mine' });
```

## Lifecycle

| Method | Contract |
| --- | --- |
| `init(element, options)` | Store the element, create contexts, apply `options.worldFilter`, then `setViewport`. `options.viewport` may be missing, in which case build an identity viewport from `options.width` and `options.height` |
| `setViewport(viewport)` | Store the viewport and size every surface from it. The backing store is `backingWidth` by `backingHeight`. The world surface is `worldWidth` by `worldHeight`. Store it even when you cannot act on it yet, such as during a lost GPU context. Apply the latest one on restore |
| `destroy()` | Release every GPU or DOM resource. The engine calls it last in `game.destroy()` |
| `setWorldFilter(filter)` | The base stores `linear` or `nearest`. Override and call `super` if the change needs immediate action. Read `this.worldFilter` when presenting the world surface |

The viewport fields are described in [The viewport](../guide/display#the-viewport). Read sizes from `this.viewport`, never from the element.

## The frame

Each frame the engine calls, in order: `clear(color)`, `beginFrame()`, `applyCamera(camera)`, world draw calls, `endFrame()`, then one or more `beginScreenFrame()` and `endScreenFrame()` pairs around UI draw calls.

| Method | Contract |
| --- | --- |
| `clear(color)` | Fill the presented surface with `color`, or make it transparent when `color` is missing. Ignore any screen-space transform |
| `beginFrame()` | Start the world pass. Clear the world surface to opaque black. Call `super.beginFrame()` so frame rate and statistics update |
| `applyCamera(camera)` | Translate world drawing by `camera.width / 2 - camera.x` and `camera.height / 2 - camera.y` |
| `endFrame()` | Present the world surface into the content rectangle `contentX`, `contentY`, `contentWidth`, `contentHeight`, scaled with `worldFilter`. At native resolution the surface and the content rectangle match |
| `beginScreenFrame()` | Start drawing in UI units onto the backing store at full resolution. One UI unit is `uiScale` backing pixels |
| `endScreenFrame()` | Restore whatever `beginScreenFrame` set |

The world is rasterized at the world surface size and scaled up on presentation. The conformance suite checks that a lower render resolution produces a coarser world. A backend that draws the world at display resolution and only reports the lower size fails it.

## Draw primitives

Every draw method receives one options object. The shapes and defaults are in the [renderer API reference](../reference/renderer#primitives). Each method must:

- Route to the world surface, or to the screen when `isScreenSpace` is `true`.
- Apply the common options `globalAlpha`, `shadow` and `blend`. Alpha applies once to the whole primitive. A shadow is cast once by the combined fill and stroke silhouette. `blend` may be ignored when `blendModes` is not claimed.
- Accept a colour string or a gradient descriptor for `fillStyle` and `strokeStyle`. Gradient coordinates are in the draw call's space.
- Call `trackPrimitive('sprite')`, `trackPrimitive('text')` or `trackPrimitive('shape')` once per call, and `trackStateChange(state)` or a direct increment of `stats.drawCalls` and `stats.stateChanges` for what the backend submitted.

Two behaviours are pinned by tests because backends get them wrong. A partial `drawArc` fill is the circular segment between the arc and its chord. Translucent gradient stops are premultiplied once.

`drawAnimation` and `drawParticles` have working implementations in the base. Override `drawParticles` only when claiming the `particles` capability.

## Transform and clip stacks

`pushTransform`, `popTransform`, `pushClip` and `popClip` share one stack and nest strictly. Record the kind of each push so a mismatched pop can be detected. Each entry belongs to the world or the screen pass, chosen by `isScreenSpace` on the push.

## Text

`drawText` renders a string with the given font, alignment and baseline, with an optional outline drawn under the fill. `measureText(text, style)` returns `{ width, height }` for the same font. A GPU backend can rasterize text through a 2D canvas into a texture, as the WebGL2 backend does in `webgl/textLabels.js`.

## Optional capabilities

Set `this.capabilities.<name> = true` for each optional feature the backend implements. The names are `tint`, `blendModes`, `particles`, `lights` and `postEffects`. A backend that does not claim one ignores the option and must not throw. `setAmbientLight`, `drawLight` and `setPostEffects` are no-ops in the base.

## Cursor

`setCursor(style)` sets the CSS cursor on the element. Under pointer lock the engine draws its own cursor through the UI pass, so this only matters when the pointer is free.

## Testing it

Add one test file that hands the backend to the conformance harness. Put it under `test/browser/` if the backend needs a real browser, otherwise next to `canvasRenderer.conformance.test.js`.

```javascript
import { MyRenderer } from '../../src/core/renderers/myRenderer.js';
import { describeRendererConformance } from '../conformance/rendererConformance.js';
import { createCanvasElement, readWebGLPixels } from '../helpers/environment.js';

describeRendererConformance({
  name: 'MyRenderer',
  createRenderer: () => new MyRenderer(),
  createTarget: (width, height) => createCanvasElement(width, height),
  readPixels: readWebGLPixels,
  capabilities: { tint: false, blendModes: true, particles: false, lights: false, postEffects: false }
});
```

`readPixels` returns RGBA with a top-left origin. While the backend is under construction, set a mandatory flag such as `shadows: false` to skip that group. Turn it back on as the feature lands. [Testing](./testing#validating-a-new-backend) describes the flags.

Then run the renderer fallback and registry tests, `npm run test:node`, and view every example with `?renderer=mine`.
