# Renderer API

All drawing goes through a renderer backend. `game.renderer` draws in world space with the camera applied (the render plane; a scene's projection is applied by callers to positions, not by the renderer). `game.uiRenderer` draws in screen space. It forwards the draw primitives, the transform and clip stack, `measureText`, `hitTest`, `setCursor`, `clear`, `capabilities` and `supports` with `isScreenSpace` set. Lights, post effects, statistics and the debug flag are on `game.renderer` only. The contract is defined by `BaseRenderer` in `packages/engine/src/core/renderers/baseRenderer.js`.

## Choosing a backend

| Selector | Effect |
| --- | --- |
| `renderer: 'webgl'` | WebGL2 backend. The default for a 2D game |
| `renderer: 'canvas'` | Canvas 2D backend |
| `renderer: 'webgpu'` | The 3D renderer. The default for a game with `dimensions: 3`; see [Three dimensions](#three-dimensions) |
| `renderer: SomeRendererClass` or an instance | A custom backend |
| `?renderer=canvas` in the page URL | Overrides the option |

When the default backend cannot initialize, usually because WebGL2 is unavailable, the engine falls back to Canvas with a console warning. An explicitly requested backend that fails throws.

A renderer draws in two dimensions or three, and must match the game's `dimensions`: the 2D backends have no mesh and the 3D one has no sprite. A mismatch throws at construction with the option that fixes it.

```javascript
import { registerRenderer } from 'm2d-engine/core/renderers/index.js';
registerRenderer('mine', MyRenderer);    // then renderer: 'mine'
```

## Capabilities

Every method on this page is mandatory for a backend. Some options are optional features a backend may decline. A backend that lacks one ignores the option and draws without it.

| Capability | WebGL2 | Canvas | Enables |
| --- | --- | --- | --- |
| `tint` | yes | no | `tint` on `drawSprite` and `drawImage` |
| `blendModes` | yes | yes | `blend` on any draw call |
| `particles` | yes | fallback | Batched `drawParticles` with per-particle colour. Without it, one sprite per particle, uncoloured |
| `lights` | yes | no | `setAmbientLight` and `drawLight` |
| `lightShadows` | yes | no | `shadows` on `drawLight` and `drawShadowCaster` |
| `postEffects` | yes | no | `setPostEffects` |

```javascript
if (game.renderer.supports('lights')) game.renderer.setAmbientLight('#303848');
game.renderer.capabilities;            // { tint, blendModes, particles, lights, lightShadows, postEffects }
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

Canvas 2D draws a true curve. The WebGL backend approximates one with line segments and picks how many from the radius as drawn, with the camera's zoom included, so a curve stays smooth when zoomed into. The count is capped, so a deep zoom costs a bounded number of vertices. The same applies to a `cornerRadius` on `drawRect` and `pushClip`.

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
renderer.drawLight({ x, y, radius: 420, angle: heading, cone: 0.7, shadows: true });  // a headlight
renderer.drawShadowCaster({ x, y, width: 60, height: 10, rotation });  // blocks shadowed lights
renderer.setPostEffects({ bloom: { threshold: 0.7, strength: 0.8, blur: 8 }, vignette: { strength: 0.5, start: 0.6 } });
renderer.setPostEffects(null);
```

Lights are submitted every frame. A light is a disc; give it `angle` and `cone` (the full apex angle, radians) and it is a spot, still bounded by `radius`. `intensity` above 1 pushes the lit area past the scene's own brightness, which is what feeds bloom.

With the `lightShadows` capability, a light drawn with `shadows: true` is blocked by the frame's shadow casters: `drawShadowCaster` takes a polygon (`points`), a rectangle (`x`, `y`, `width`, `height`, `rotation`) or a circle (`x`, `y`, `radius`), and everything behind that silhouette, as seen from the light, stays at ambient. Casters are submitted per frame like lights. A wall drawn in one pass can this way shadow the ground drawn beneath it. Without the capability the flag is ignored and the light shines through.

Post effects apply to the world pass only, so UI stays unaffected. Every effect is optional and off unless given; `setPostEffects` replaces the whole set, so pass everything you want each time.

| Effect | Fields | Meaning |
| --- | --- | --- |
| `bloom` | `threshold`, `strength`, `blur` | Bright parts glow outward |
| `vignette` | `strength`, `start` | Darkens the corners from `start` (0 to 1 of the radius) |
| `blur` | `strength` | Defocuses the whole world, in world units. What sits behind a modal screen |
| `distortion` | `strength` | Lens curvature: positive barrels, negative pincushions |
| `chromatic` | `strength` | Colour fringing that grows toward the edges, like a real lens |
| `grade` | `shadows`, `highlights`, `amount`, `saturation`, `contrast` | Split-tones by luminance (dark areas toward `shadows`, bright toward `highlights`, CSS colours), then saturation and contrast (1 is neutral). `amount` blends the whole grade in |
| `grain` | `strength` | Animated film grain on the output pixels |
| `scanlines` | `strength`, `density` | Horizontal lines on the output pixels; `density` is in radians per pixel |
| `glitch` | `strength` | Horizontal bands tear sideways, re-rolled several times a second |
| `flash` | `color`, `strength` | Blends the frame toward a colour; set per frame for a hit flash |

```javascript
renderer.setPostEffects({
  bloom: { threshold: 0.7, strength: 0.6, blur: 30 },
  grade: { shadows: '#4a3f6e', highlights: '#ffd9a8', amount: 0.5, contrast: 1.05 },
  chromatic: { strength: 0.004 },
  grain: { strength: 0.05 },
  distortion: { strength: 0.05 }
});
```

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

## Three dimensions

A game with `dimensions: 3` draws through the WebGPU renderer, which is a different kind of renderer from the two above. They are immediate-mode: an entity calls `drawSprite` and it is batched and drawn. A 3D frame needs everything in it before the first pixel is shaded, so the 3D renderer is *retained*: once a frame the engine asks the scene for a `frame` and calls `renderer.render(frame)`. Entities' `draw` methods are not called in a 3D scene.

WebGPU hands out its device asynchronously, so a 3D game acquires it before constructing the engine, the way it compiles physics:

```javascript
import { initWebGPU } from 'm2d-engine/core/renderers/index.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';

await Promise.all([initWebGPU(), initPhysics({ dimensions: 3 })]);
const game = new M2D(canvas, { dimensions: 3 });
```

It needs a Chromium browser with WebGPU; `initWebGPU` rejects with the reason otherwise.

**The frame.** Each frame the engine builds a `Frame3D` from the scene: the camera's matrices and every visible entity as its mesh at its body's blended transform. The scene's `onRender(frame, deltaTime)` hook then sets the light and adds geometry, and the renderer draws it:

```javascript
game.sceneManager.addScene('yard', {
  fetch: () => import('./yard.json'),
  onRender(frame) {
    frame.sun = { direction: [0.55, -0.6, 0.45], color: [1, 0.88, 0.7], intensity: 4 };
    frame.ambient = { sky: [0.36, 0.46, 0.68], ground: [0.22, 0.17, 0.12], intensity: 0.55 };
    frame.fog = { color: [0.66, 0.74, 0.86], density: 0.006 };
    frame.add(sphere(), { position: { x: 0, y: 3, z: 0 }, scale: 0.5, color: [1, 0.8, 0.4], emissive: 4 });
  }
});
```

| Key | Meaning |
| --- | --- |
| `camera` | `viewProjection`, `inverseViewProjection` and `position`, filled from `game.camera` |
| `sun` | One directional light: the `direction` its light travels, its linear `color`, and an `intensity` |
| `ambient` | The environment's strength: linear `sky` and `ground` colours shape the sky, and `intensity` scales the image-based light taken from it |
| `environment` | An HDR panorama to use as the sky instead of the procedural one: `{ image, intensity }`, where `image` is a decoded Radiance `.hdr` from [`assets.environments`](./scene-format#assets-environments). It becomes both what the camera sees and what the lighting bake reads, so reflections match the background. `null` for the built-in sky |
| `fog` | Distance fog toward a linear `color`, at a `density` per metre; `0` turns it off. The sky's horizon takes the same colour |
| `exposure` | A multiplier before tonemapping, `1` by default |
| `bloom` | Light brighter than `threshold` (`1`, after exposure; `0` lets everything glow a little, as a lens does) spreads into a glow laid over the frame at `intensity` (`0.8`). `scatter` (`0.75`) is how far it reaches: low keeps a tight core, high a long soft tail. The glow is the light's own colour spread, never a multiplied copy. `intensity` `0` skips the passes |
| `post` | The post stack's strengths, below. The player's `r_*` settings decide which stages run at all |
| `shadow` | Shadows reach `distance` metres from the camera (`60`), split into the sun's cascades; `normalOffset` in shadow texels and `bias` in metres trade acne against detached shadows; `enabled: false` turns every shadow off |
| `addLight(light)` | A point light (`position`, linear `color`, `intensity` as radiance at one metre, `range` in metres) or, with `type: 'spot'`, one pointing along `direction` with `innerCone` and `outerCone` in radians. Either kind casts a shadow unless `shadow: false` (a perspective map for a spot, a six-face cube for a point), and the few of each that light the camera most do, as the quality setting allows: maps rank by a light's intensity over its squared distance to the camera, so a lamp gains a map as it is approached. Up to 1024 lights a frame; a fragment shades with the lights of its own cluster, at most 64, however many the level holds |
| `setCamera(camera)` | Take the matrices, eye, frustum and shadow centre from a `Camera3D`. The engine does this before the scene's hook |
| `add(geometry, instance)` | Draw a geometry once. `instance` is a `model` matrix or a `position`, unit-quaternion `rotation` and `scale`; a glTF `material` with textures, or none for a plain surface; and multipliers over it: linear `color`, `metallic`, `roughness`, `emissive`, `checker`. `castShadow: false` keeps it out of the shadow map |

Geometry for the primitive shapes comes from `m2d-engine/core/renderers/geometry/primitives.js`: `box()`, `sphere()`, `cylinder()` and `plane()` are unit-sized and scaled per instance, `capsule(radius, height)` is built to its proportions, and `geometryFor(shape, size)` returns the right one for a body. Models come from `m2d-engine/core/gltf.js`: `loadGLB(url)` and `parseGLB(buffer)` read a `.glb` into parts, each a geometry, a material and a node matrix. Geometry, images and materials are uploaded to the GPU once each and drawn instanced, grouped by geometry and material: a frame of a hundred crates is one draw call.

`add` culls nothing: every instance it is given goes into the frame, and the GPU decides what is drawn. See **Culling and scale** below.

**Post-processing.** The main pass leaves direct light, indirect light, normal-and-depth and velocity targets, and the post stack runs over them in order: ambient occlusion, resolve with fog, temporal anti-aliasing, depth of field, motion blur, auto exposure, bloom, composite. A scene sets the strengths in `frame.post`; a player turns stages off with the `r_taa`, `r_ao`, `r_dof`, `r_motionblur`, `r_autoexposure`, `r_bloom` and `r_film` cvars, which the settings menu lists under Effects.

| `frame.post` key | Meaning |
| --- | --- |
| `taa` | `blend`: how much of each new frame enters the history (`0.1`) |
| `ao` | Screen-space ambient occlusion over the indirect light: `radius` in metres (`0.8`), `intensity` (`1`); `0` skips it |
| `dof` | Depth of field as a thin lens on a 24 mm sensor: `focus` distance in metres (`null` leaves it off), `focalLength` in millimetres (`50`), `fStop` (`2.8`) and `maxBlur` capping the circle of confusion in pixels. In-focus pixels are the sharp frame, untouched. Both blur fields gather on concentric rings over a half-resolution copy, so an out-of-focus light is a clean disc. The look matches a real lens: at f/4 focused eight metres away, almost nothing blurs |
| `motionBlur` | Per-object blur along the velocity buffer: `strength` (`0.5`); `0` skips it |
| `autoExposure` | `enabled` (`false`), the `key` grey the average is brought to (`0.18`), `min` and `max` exposure, adaptation `speed` per second. While on, it replaces `exposure`; steer with the key |
| `grade` | `saturation`, `contrast` about middle grey, `temperature` (warm positive) and an optional `lut` image, a 256x16 strip of a 16-step colour cube |
| `vignette`, `grain` | Film: corner darkening (`0`–`1`) and per-frame noise amplitude |

The picture is a metallic-roughness model under the sun, the point and spot lights and an image-based environment, with fog, bloom, ACES tonemapping and 4x multisampling.

Shadows come from cascaded maps for the sun, perspective maps for the strongest spot lights and six-face cubes for the strongest point lights. A spot or point map is filtered over nine taps. The sun is filtered over a disc of one width in metres (`SUN_PENUMBRA`, 6 cm) in every cascade, sixteen bilinear taps on a spiral, with a bias that grows with the receiver's slope; a filter of so many texels would be four times as soft in the last cascade as in the first, and a shadow's edge would sharpen and blur at each split. Across the last 15 per cent of each cascade the next one is blended in, and the last fades to lit, so a split is a gradient and the shadow distance is not a line on the ground. Each sun cascade is an orthographic box fitted to a slice of the view frustum and snapped to its own texel grid, so shadow edges hold still as the camera moves. The box reaches back toward the sun by the shadow distance, so a tall tree up-sun of the nearest, smallest cascade still casts into it. The `r_shadows` cvar (`off`, `low`, `medium`, `high`) sets how many cascades, spot maps and point-light cubes there are and at what size, and the settings menu has a row for it. A point light's cube redraws only when its casters change (a still scene's cubes are cached). No cubes are drawn below `medium`, three at `medium` and six at `high`; a cube handed from one lamp to another fades its shadow in.

The environment is the renderer's own sky, baked to a cubemap when the sun or sky settings change, prefiltered by roughness for reflections and convolved for diffuse, so a mirror sphere reflects the sky it stands under. Rendering is in high range to a 16-bit float target, with every write clamped under the format's ceiling (one glint that overflowed to infinity would spread as NaN through the multisample resolve, the temporal history and the bloom chain). The composite pass exposes, tonemaps and encodes to the canvas. A camera's `Camera3D` is in [Camera](../guide/camera#three-dimensions), and the `mesh` block a prefab draws with is in the [scene format](./scene-format#mesh). What is not here yet follows the plan in `knowledge-base/projects/3d/3d-and-editor.md`.

**Materials from glTF.** A model's materials draw with base colour, metallic-roughness, normal (tangents from the file, or made from the texture coordinates at load), occlusion and emissive textures, in PNG, JPEG, WebP or KTX2 (`KHR_texture_basisu`, Basis Universal). KTX2 textures carry their own mip chain and transcode at load to the GPU's block-compressed format (BC7, ASTC or ETC2, a quarter of RGBA8's memory), which is what the model compiler writes.

`alphaMode` `MASK` cuts the surface at its cutoff, in the shadow maps too, so a leaf casts a leaf-shaped shadow. `BLEND` draws in a transparent pass after the opaque one: blended premultiplied (the surface's coverage scales its diffuse light and glow but not its reflection, as glass reflects however clear it is; plain alpha blending made a clear pane a faint white matte layer, and stacked panes milk), depth-tested, not depth-written and casting no shadow, with a two-sided surface drawn back faces first and front faces second, since in one draw a sphere's rings blend in triangle order and band, since the shadow pass has no blending and glass would otherwise cast its whole pane. Blended groups draw back to front; instances within one group are unsorted among themselves, so two overlapping panes of the same material may blend in either order. **A cut-out must be `MASK`, never `BLEND`.** Blending is for surfaces you see through; a canopy of overlapping leaf cards drawn blended accumulates into a bright haze, loses its shadows and depends on draw order. Many exporters (Poly Haven's among them) mark every material that has an alpha map `BLEND`, so `examples/scripts/compileModel.mjs` classifies each one from its own alpha histogram: a map with large fully-transparent regions becomes `MASK`, one graded everywhere and empty nowhere stays `BLEND` and one with no transparency becomes `OPAQUE`. A map beside a material the source marks `OPAQUE` is read too (Poly Haven's pine ships its needle cut-out that way), but only when no other material shares that material's colour image: where a body and its glass share one atlas the map is the glass's, and the street lamps read it as the body's and drew whole lamps blended.

A cut-out's mip chain averages its alpha, so a card thins with every level, and past a few tens of metres a tree drawn plainly would be bare branches. A material whose `extras.m2d.foliage` is `true` (the compiler sets it on the cut-outs of a `tree` or `ground` model) has its alpha scaled up by the mip level it reads, which keeps a leaf's coverage close to constant with distance. Other cut-outs are left alone, since a chain-link fence's wire should thin into the distance and boosted it reads as a solid board.

**Wind.** `frame.wind` (`direction` along x and z, `strength`, `gust`; a level sets it as `world.lighting.wind`, which a cycle blends like the fog) moves every model that carries foliage, in the vertex shader of the mesh and the shadow passes alike, so a shadow sways with its tree. The whole model bends with height above its instance's base, the trunk's foot still and the crown moving most, with a gust that rolls across the ground downwind and a phase per instance so a wood does not move in step; only its cut-outs also flutter. Wood and leaves bend alike, so a leaf never leaves its branch. Motion vectors carry last frame's bend, so TAA does not smear it. A model sways when any of its materials is foliage (`material.sway`), which the glTF reader marks.

**Particle fields.** `frame.particles` (a level's `world.particles`) holds up to sixteen fields of motes or smoke. No particle has state: its position is a function of its index and the time, worked out in the vertex shader, so a field costs a uniform and one instanced draw, nothing is simulated or stored, and a field looks the same every time it is shown. Motes start scattered through their box, ride the wind with a wander of their own and wrap at the box's faces, faded there so none pops; smoke rises from its source over a lifetime that loops, each puff at its own point in it, widening, growing and fading. They draw as soft camera-facing discs after the transparent groups, tested against the opaque depth and writing none: their light into the direct target and their coverage over the indirect one, so the ambient light behind them is covered too. A particle within a few metres of the camera fades out rather than blot the lens. The fog is the resolve's, by the depth behind a particle, which over-fogs a near particle in front of distant ground slightly and leaves one against the sky unfogged.

**Shape materials.** A shape's `mesh` block may set `opacity` (a blended, two-sided, non-casting surface), `emissiveColor`, `clearcoat` with `clearcoatRoughness`, and `specular`, which the scene turns into one stable material per distinct block so the renderer groups and caches by it; the lot's sculpture terrace shows twenty of them side by side. A shape's `mesh.texture` may bring a normal map and an `arm` map beside its colour. Mapped planar from the world, a shape has no tangents of its own (a primitive's are zeros), so its normal map is lit in the projection's frame: the tangent along the world axis where u grows, the bitangent against the one where v grows. A vertex frame is never built from a zero tangent, since normalizing a zero vector is undefined in WGSL and on real GPUs is a NaN that blacks a pixel out (SwiftShader, which the browser suite runs on, returns zero and hides it).

`KHR_materials_clearcoat` is read by its factors (strength and roughness), as a second dielectric lobe over the base that dims what it covers by what it reflects, following the smooth surface rather than the normal map, as a varnish lies over the grain; its textures are dropped at compile time. An emissive factor without an emissive texture glows by the factor (the fallback texture is white, as glTF reads it). `doubleSided` draws both faces with the normal turned toward the viewer. `KHR_texture_transform` on the base colour applies to every texture of the material. `KHR_materials_ior` and `KHR_materials_specular` set the dielectric reflectance, which is how a photoscanned leaf is told to be less glossy than glTF's default.

**Levels of detail.** A model whose root nodes are named `LOD0`, `LOD1`, ... carries one mesh per level; `examples/scripts/compileModel.mjs` makes such files from a photoscan with meshoptimizer and writes the screen coverage each level takes over at into the file. The compiler sets the levels by kind (`LEVELS` in `packages/editor-host/src/pipeline/compile.mjs`) as distances in metres, for the model at its own size under a 60-degree view, and turns them into coverage from the model's bounding sphere, so a tree switches at 12, 30, 70 and 150 metres times its scale and a barrel at 10, 25 and 60. One coverage for all kinds put a barrel's first switch three metres from the camera. Level 0 is the source cut to a budget by kind; every level after is made from level 0, never from the source, so none can cost more than it. Wood, stone and props past level 0 may collapse across their uv seams (meshoptimizer's `Permissive`, with `Prune`), without which a scanned branch or boulder stopped at the same count at every distance.

Foliage is not decimated: at the error a distant level allows the simplifier collapses whole leaves, keeping its triangle count and losing the canopy. `pipeline/foliage.mjs` makes its levels from whole cards (connected leaf islands) instead. At the first switch every card of more than two triangles becomes a **quad**: the least-squares affine map from its texture coordinates to its positions, evaluated at the corners of its texture rectangle, so the leaf's outline is still its texture's alpha. It is wound to agree with its normal, the mean of the leaf's vertex normals, since a two-sided leaf wound against its normal shades facing away and mirrors the sky. A card the fit misses by more than an eighth of its size stays triangles; any other attribute (a vertex colour) rides along as the card's average. Further out a share of the cards is kept by a stable hash, never fewer than 120 in a model, and each survivor grows about its centre. A tree's last level is a few thousand triangles. Textures are sized by kind (`TEXTURE_SIZE` in the compiler: 2048 for trees and rocks, 1024 for props and ground cover, `textureSize` overriding one model), and material data the renderer never reads (specular maps, transmission, volume, sheen and clearcoat) is dropped at compile time.

The cull picks the level per instance from how much of the view's height its bounding sphere spans, so a shadow uses the same level as its caster; an entity's model picks the same way on the CPU. Every record of one prop instance, all its parts and levels, carries the model's sphere (`instance.sphere`), so the instance makes one decision: on each part's own sphere a trunk switched before its canopy, and two levels' slightly different spheres left a distance where both drew, or neither. A model without levels is one level everywhere.

The compiler encodes a model's textures to KTX2 on a pool of worker threads (`pipeline/ktx2Pool.mjs`), each with its own Basis Universal encoder: the WebAssembly build is single-threaded and blocks, so the glTF-Transform plugin, though it starts every texture at once, encoded them one after another, and texture encoding was 47 of a tree's 51 seconds. `buildModels.mjs` runs four compiles at once and shares the cores between their encoders (`M2D_ENCODE_THREADS`); the lot's 78 models build in about four minutes on sixteen cores, from sources on disk.

**Draw submission.** Each pass's opaque draws are recorded once into a WebGPU render bundle and replayed every frame while the frame's groups (their geometry, material, pipeline choice and nearest draw distance, and the indirect buffer) are the ones it was recorded over; the cull still sets every draw's instance count on the GPU each frame, which the bundle reads from the indirect buffer. Encoding every group's draw in every shadow pass, some ten thousand draws a frame on the lot, was most of a frame's CPU. A shadow pass also skips groups it cannot see: a level of detail whose nearest possible camera distance (its smallest instance's radius over the level's upper coverage) lies beyond the pass's reach, and, for a spot or point light, a group whose instances' bounding box misses the light's sphere. The blended groups and the particles, whose order changes each frame, are drawn directly after the bundle.

**Culling and scale.** Nothing is culled on the CPU. Every instance record carries its world bounding sphere, and one compute pass a frame tests all of them against the planes of every pass (the camera's and each shadow map's), writing per-pass indirect draw arguments and the list of instances each pass draws. The meshes are then one `drawIndexedIndirect` per geometry and material per pass. A scene's `props` are instance records built once at load and kept on the GPU, copied into the frame without the CPU touching them again, so a level's scenery costs nothing per frame beyond the cull. Because the GPU decides what is drawn, the statistics come back a frame late: F3's readout in a 3D game shows instances submitted, drawn, shadow casters, triangles and, where the adapter has `timestamp-query`, the GPU's own time from the cull to the composite. The renderer requires the `indirect-first-instance` feature, which every desktop Chromium has. It asks for the adapter's own `maxBufferSize` and `maxStorageBufferBindingSize` rather than WebGPU's defaults: the instance buffer holds one record per drawn primitive, and a resident scene of ten thousand props passes the default 128 MB binding long before the GPU runs out. The buffer grows by doubling but never past the binding limit while what the frame needs still fits under it.

**Streaming.** A level does not load all of itself before it draws. A model only the scene's `props` use is streamable: the scene notes where every instance of it stands, loads it when the camera comes within `scene.streamIn` metres of the nearest one and lets it go again past `scene.streamOut`. The two radii differ so a camera sitting on the line does not load and unload every frame. At most `scene.streamBudget` fetches are in the air at once. The first load therefore waits only for what is near the player's start plus every model an entity wears, which never streams: the simulation owns that entity wherever the camera is. A streamable model that fails to load, in the first load or later, is warned about once and its props are not drawn, and the level plays without it: it is not asked for again that scene (`scene.streaming.failed`), since the streamer runs every frame and a missing file retried each time is a fetch and a parse a frame. One an entity wears fails the load.

A transcoded KTX2 texture's payload is let go once it is on the GPU: the renderer keeps no CPU copy of a mip chain it will not read again, which on the lot was 2.7 GB of a tab's heap. A model whose textures are released is dropped and loaded afresh when it is wanted again, so nothing uploads the same record twice; `TextureCache3D.get` refuses a released record by name.

Letting go is real: `renderer.unloadModel(model)` destroys the model's vertex and index buffers, its materials' uniforms and bind groups and the textures those name, and `renderer.textureBytes` falls by what they held. The caches are keyed on the model's own CPU objects, so drawing it again uploads it again: streaming trades memory for an upload, never for correctness. A scene unloads every model it brought in when it ends. Colliders do not stream: a prop's static body is built at load and stays, so a wall you have walked past is still a wall.

A streamed model is fetched, parsed and transcoded in a web worker (`core/modelLoader.js`, a pool of half the cores, four at most) and crosses back with its buffers transferred, never copied, so the frame it streams into does not pay for it. Where there is no worker (Node, a test) the same call runs on the main thread.

`scene.streaming` reports what the streamer is doing (`streamable`, `wanted`, `loading`, `resident` and `failed` model keys), for a readout or a test.

The display settings apply as they do in 2D: the world renders at the `r_resolution` setting and is presented into the viewport's content rectangle, letterboxed or expanded by `r_aspect`, upscaled through `r_worldfilter`. Fullscreen takes the canvas's parent element so the HUD overlay comes along; give the canvas a parent of its own.

### Animation

A model with a skin or a clip animates. The scene gives its entity an `Animator3D` (`m2d-engine/core/animator3d.js`) on first draw, playing the prefab's `mesh.animation` clip or the model's first; the animator advances on the frame's delta, never on the simulation tick, and nothing in the simulation reads a pose.

| Member | Meaning |
| --- | --- |
| `play(name, { fade, loop, speed, restart })` | Play a clip, crossfading over `fade` seconds (`0.2`) from whatever plays. Returns `false` for a name the model lacks |
| `stop()` | Back to the bind pose |
| `current`, `clipNames` | What is playing and what could |
| `jointMatrices(skin)`, `nodeMatrix(node)` | The pose, for code that attaches things to bones |
| `morphWeights(node)`, `previousMorphWeights(node)` | A node's morph target weights, driven by `weights` channels; the scene hands them to the frame so the mesh and its shadow deform together. Unskinned meshes only |
| `previousJointMatrices(skin)` | Last frame's pose. Hand it to `frame.add` as `previousSkin` so a limb's own motion reaches the velocity buffer and motion blur; without it the current pose stands in and only the body moves. A snap (`fade: 0`) and `stop()` make the pose they land on its own previous, so a jump reports no velocity |

Skinning happens on the GPU: the joint matrices of every skinned instance go into one storage buffer a frame, and skinned geometry takes a pipeline that blends four joints per vertex, in the shadow passes too. A character that does not tumble steers its model with `entity.heading`, a yaw in radians the scene applies over the body's rotation; the yard's fox turns to where it runs.

**The HUD.** A canvas holds one context, so the UI pass cannot share the 3D canvas. The renderer makes a second canvas laid over the first, transparent to pointer events, and runs the WebGL2 backend on it; `game.uiRenderer` wraps that backend and the whole UI layer works unchanged. `game.renderer.overlayCanvas` and `game.renderer.uiBackend` are the two halves. Input and fullscreen still target the original canvas.

`game.renderer.readPixels()` returns the frame just drawn as RGBA with a top-left origin, for tests and tooling. It stalls on the GPU and must be called in the same task as the draw.

## Writing a backend

Subclass `BaseRenderer`, implement every method that throws `Method not implemented`, set the capabilities you support and register the class. [Writing a renderer backend](../contributing/renderer-backend) walks through it.

## Ground shadows

`drawGroundShadow(renderer, x, y, width, { spread, fade, ratio, color })` in `core/renderers/shadows.js` draws the soft ellipse a thing stands in, and `shadowForLift(lift, maxLift)` gives the `spread` and `fade` for a sprite at a given `elevation`. The demos' top-down, isometric and belt views all use it.

## Texture filtering

`setTextureFilter('linear' | 'nearest')` chooses how sprites and images are sampled when drawn at another size, for pixel art drawn enlarged. The `textureFilter` engine option sets it at startup. `setWorldFilter` is separate: it is about presenting the world surface when the render resolution is below the display's.
