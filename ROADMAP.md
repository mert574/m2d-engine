# M2D Engine roadmap

The engine already has a renderer interface, a Canvas backend, a WebGL2 backend,
scenes, entities and constraints, a camera, a UI layer, and playable examples.
The WebGL2 backend is the default; the next rendering milestone is making the
difference between backends measurable and visible.

These are proposed development slices. Confirm scope against the current
implementation before starting.

## Next priorities

| Work | Done when |
| --- | --- |
| Renderer showcase + comparison harness | *Done* (`src/examples/showcase/`). One deterministic scene runs through both backends from a fixed seed; it reports FPS, primitives, draw calls and state changes on screen; `?renderer=` swaps backends without code changes; the scene degrades cleanly when a backend lacks an optional capability and says which features it dropped. Checks cover camera transforms, clipping, resize, and asset readiness; frame-time summaries use the same workload. |
| Optional renderer capabilities | *Done.* `renderer.capabilities` reports which optional features a backend supports; conformance skips what a backend does not claim; callers query before using one. WebGL claims all five (`tint`, `blendModes`, `particles`, `lights`, `postEffects`); Canvas claims `blendModes` and takes `BaseRenderer`'s sprite-per-particle fallback for `drawParticles`. |
| Fullscreen and resize lifecycle | *Done* (`src/core/viewport.js`). The engine tracks the canvas's displayed size, the device pixel ratio and fullscreen transitions, and applies changes between frames. Three resolutions are independent: the camera's **view** (world units, fixed by design size), the **world render surface** (the `setResolution` setting — fidelity only, it never changes how much world is visible), and the **UI** (always at display resolution, always covering the whole screen). `aspectMode` chooses whether a differing display aspect letterboxes or widens the view. UI elements anchor to screen edges, and pointer mapping is letterbox-aware so hit testing survives every transition. |
| Public extension guide | A minimal example demonstrates a new actor, constraint, scene, and renderer; the documented commands work from a fresh checkout. |

Keep a small reproducible scene with each rendering fix rather than relying
on one large demo.

### Showcase build order

The showcase (`src/examples/showcase/`) grows one slice at a time. Each slice
is runnable on both backends before the next one starts.

1. **Stress layer** — batched sprite field, text storm, nested-clip minimap,
   stats HUD. No contract changes; quantifies the batching win on its own.
2. **`tint` and `blend`** — per-draw colour modulation and additive blending.
   Smallest contract additions; everything below depends on them. *Done:*
   WebGL claims both, Canvas claims `blendModes` only (a tint would cost it an
   offscreen pass per sprite).
3. **Particles** — GPU-batched emitter. Largest visual payoff. *Done:*
   `drawParticles` takes a packed `Float32Array`; WebGL batches it with
   per-particle colour, every other backend gets a sprite-per-particle
   fallback from `BaseRenderer`, and the showcase caps its rain there.
4. **Lights and post effects** — *Done.* `setAmbientLight` switches lighting
   on, `drawLight` accumulates into a light map multiplied over the world,
   and `setPostEffects` adds bloom and vignette. Both are WebGL-only and run
   in `webgl/effectsPass.js`, which routes the world pass through a
   stencil-backed scene target; the screen pass still goes straight to the
   default framebuffer, so UI is never dimmed or bloomed.

The showcase is feature-complete. Further rendering work should add a small
reproducible scene of its own rather than grow this one.

Optional features are not required of every backend. A backend declares what
it supports through `capabilities`; Canvas is expected to decline some of the
list, and that is the documented basis for choosing a backend rather than a
gap to close.

## Later

- Tilemap tooling (instanced tilemaps build on the showcase's batching work).
- More reusable UI components, actors, and constraints.
- Evaluate networking only after simulation timing and renderer behavior are
  stable; multiplayer is not part of the first milestone.

## Example quality

Keep demos runnable from a fresh checkout.
Record asset origins and license notices alongside any new assets.
