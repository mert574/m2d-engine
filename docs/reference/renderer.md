# Renderer API

All drawing goes through a renderer backend. `game.renderer` draws in world space with the camera applied. `game.uiRenderer` draws in screen space. It forwards the draw primitives, the transform and clip stack, `measureText`, `hitTest`, `setCursor`, `clear`, `capabilities` and `supports` with `isScreenSpace` set. Lights, post effects, statistics and the debug flag are on `game.renderer` only. The contract is defined by `BaseRenderer` in `packages/engine/src/core/renderers/baseRenderer.js`.

## Choosing a backend

| Selector | Effect |
| --- | --- |
| `renderer: 'webgl'` | WebGL2 backend. The default |
| `renderer: 'canvas'` | Canvas 2D backend |
| `renderer: SomeRendererClass` or an instance | A custom backend |
| `?renderer=canvas` in the page URL | Overrides the option |

When the default backend cannot initialize, usually because WebGL2 is unavailable, the engine falls back to Canvas with a console warning. An explicitly requested backend that fails throws.

```javascript
import { registerRenderer } from 'm2d-engine/core/renderers/index.js';
registerRenderer('webgpu', WebGPURenderer);    // then renderer: 'webgpu'
```

## Capabilities

Every method on this page is mandatory for a backend. Some options are optional features a backend may decline. A backend that lacks one ignores the option and draws without it.

| Capability | WebGL2 | Canvas | Enables |
| --- | --- | --- | --- |
| `tint` | yes | no | `tint` on `drawSprite` and `drawImage` |
| `blendModes` | yes | yes | `blend` on any draw call |
| `particles` | yes | fallback | Batched `drawParticles` with per-particle colour. Without it, one sprite per particle, uncoloured |
| `lights` | yes | no | `setAmbientLight` and `drawLight` |
| `postEffects` | yes | no | `setPostEffects` |

```javascript
if (game.renderer.supports('lights')) game.renderer.setAmbientLight('#303848');
game.renderer.capabilities;            // { tint, blendModes, particles, lights, postEffects }
game.renderer.supportedCapabilities(); // names that are true
```

## Common options

Every draw call accepts these.

| Option | Meaning |
| --- | --- |
| `isScreenSpace` | Draw in screen space, ignoring the camera. `game.uiRenderer` sets this for you |
| `globalAlpha` | Opacity from 0 to 1, applied once to the whole primitive |
| `shadow` | `{ color, blur, offsetX, offsetY }`. One shadow cast by the primitive's whole silhouette |
| `blend` | `'normal'`, `'additive'`, `'multiply'` or `'screen'`. Needs `blendModes` |

Colours are CSS strings. `fillStyle` and `strokeStyle` also accept a gradient descriptor.

```javascript
{ type: 'linear', x0, y0, x1, y1, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] }
{ type: 'radial', x, y, r0: 0, r1, stops: [...] }
```

Gradient coordinates are in the same space as the draw call.

## Primitives

### drawSprite

Draws one frame of a sprite sheet, centred on `x`, `y`.

| Option | Default | Meaning |
| --- | --- | --- |
| `image` | | The sheet image |
| `x`, `y` | | Centre |
| `tileX`, `tileY` | `0` | Frame column and row |
| `tileWidth`, `tileHeight` | | Frame size in the image |
| `width`, `height` | frame size | Drawn size |
| `rotation` | `0` | Radians |
| `flipX`, `flipY` | `false` | |
| `tint` | | Colour multiplied into the frame. Needs `tint` |

### drawAnimation

`{ sprite, x, y, animation, frame, transform }` draws a named animation frame from a `SpriteSheet`. `transform` holds extra `drawSprite` options.

### drawImage

Draws an image stretched to a rectangle, anchored at the top-left.

| Option | Meaning |
| --- | --- |
| `image`, `x`, `y` | |
| `width`, `height` | Defaults to the image size |
| `sourceX`, `sourceY`, `sourceWidth`, `sourceHeight` | A region of the image |
| `tint` | Needs `tint` |

### drawRect

Top-left anchored rectangle.

| Option | Default | Meaning |
| --- | --- | --- |
| `x`, `y`, `width`, `height` | | |
| `fillStyle` | | Fill colour or gradient |
| `strokeStyle` | | Outline colour or gradient |
| `lineWidth` | `1` | |
| `cornerRadius` | `0` | A number or an array of four |
| `fill` | `true` | Set `false` to skip the fill while `fillStyle` is set |

### drawLine

`{ x1, y1, x2, y2, strokeStyle, lineWidth }`.

### drawArc

| Option | Default | Meaning |
| --- | --- | --- |
| `x`, `y`, `radius` | | |
| `startAngle`, `endAngle` | `0`, `2π` | Radians |
| `fillStyle`, `strokeStyle`, `lineWidth`, `fill` | | As for `drawRect` |

Filling a partial arc fills the circular segment between the arc and its chord. For a pie slice, draw a closed path through the centre.

### drawPath

`{ points, closed, fillStyle, strokeStyle, lineWidth }`. `points` is an array of `{ x, y }`.

### drawText

| Option | Default | Meaning |
| --- | --- | --- |
| `text`, `x`, `y` | | |
| `fillStyle` | `'#000'` | |
| `strokeStyle` | | Outline, drawn under the fill |
| `lineWidth` | `3` | Outline width |
| `fontSize` | `'16px'` | A CSS size or a number |
| `fontFamily` | `'system-ui'` | |
| `fontWeight` | `'normal'` | `'100'`–`'900'` is honoured when the family is a variable font |
| `fontStyle` | `'normal'` | `'italic'` or `'oblique'` |
| `letterSpacing` | — | Tracking, in units or as a CSS length. Counted by `measureText` too. Ignored where the browser lacks `ctx.letterSpacing`, in which case text draws untracked |
| `textAlign` | `'left'` | `left`, `center` or `right` |
| `textBaseline` | `'top'` | `top`, `middle`, `alphabetic` or `bottom` |

`measureText(text, { fontSize, fontFamily, fontWeight, fontStyle, letterSpacing })` returns `{ width, height }`. Metrics must reflect the style that would be rendered; both backends build the font shorthand through the same `geometry/font.js` helper so they cannot drift apart.

### drawParticles

Draws many copies of one frame from a packed buffer.

| Option | Meaning |
| --- | --- |
| `image`, `tileX`, `tileY`, `tileWidth`, `tileHeight` | The frame |
| `data` | `Float32Array` with `PARTICLE_STRIDE` (8) floats per particle: `x, y, size, rotation, r, g, b, a` |
| `count` | Particles to draw. Defaults to the whole buffer |
| `blend`, `globalAlpha` | Applied to every particle |

`size` is the drawn height. Colour components are 0 to 1, straight alpha, white for untinted. Import `PARTICLE_STRIDE` from `m2d-engine/core/renderers/baseRenderer.js`.

## Lights and post effects

```javascript
renderer.setAmbientLight('#303848');   // turns lighting on. null turns it off
renderer.drawLight({ x, y, radius: 240, color: '#ffd080', intensity: 1.2 });
renderer.setPostEffects({ bloom: { threshold: 0.7, strength: 0.8, blur: 8 }, vignette: { strength: 0.5, start: 0.6 } });
renderer.setPostEffects(null);
```

Lights are submitted every frame. Post effects apply to the world pass only, so UI stays unaffected.

## Transforms and clips

```javascript
renderer.pushTransform({ x, y, rotation, scaleX, scaleY });
renderer.pushClip({ x, y, width, height, cornerRadius });
// draw
renderer.popClip();
renderer.popTransform();
```

Pushes and pops of both kinds share one stack and must nest strictly. Both accept `isScreenSpace`.

## Other methods

| Method | Meaning |
| --- | --- |
| `clear(color)` | Clear the presented surface |
| `setCursor(style)` | Set the CSS cursor |
| `setDebugEnabled(bool)`, `isDebugEnabled()` | The debug overlay flag |
| `getFPS()`, `getAverageFPS()`, `getFPSHistory()` | Frame rate |
| `getStats()` | `{ primitives, drawCalls, stateChanges, spritesDrawn, textDrawn, shapesDrawn, lastState }` for the last frame |
| `setWorldFilter(filter)`, `worldFilter` | The upscaling filter. `game.setWorldFilter` calls this |
| `setViewport(viewport)` | Apply a computed viewport. `resize(width, height)` builds an identity viewport and calls it |
| `setDebugLayer(layer)`, `getDebugLayer()` | A free-form debug layer value for game code |
| `hitTest(x, y, shape)` | Point in `{ type: 'rect', x, y, width, height }` or `{ type: 'circle', x, y, radius }` |
| `width`, `height` | The view size in world units, or the UI size on `uiRenderer` |

`primitives` counts what callers asked for. `drawCalls` counts what the backend submitted, so a batching backend reports fewer.

## Writing a backend

Subclass `BaseRenderer`, implement every method that throws `Method not implemented`, set the capabilities you support and register the class. [Writing a renderer backend](../contributing/renderer-backend) walks through it.
