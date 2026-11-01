# Example Games

Six demos ship with the engine, each exercising a different part of it. All
of them are deployed live — the sources live in the monorepo's
[`examples/src/`](https://github.com/mert574/m2d-engine/tree/master/examples/src).

Every example mounts the settings menu (**O**: resolution, fullscreen,
aspect, debug overlay, renderer backend, pause), and any example accepts
`?renderer=canvas` or `?renderer=webgl` in the URL.

## [Renderer Showcase](https://mert574.github.io/m2d-engine/examples/showcase/)

A batching stress test that doubles as the renderer comparison harness:

- Thousands of batched sprites, a flowering reed bank, and a text storm
- A lighthouse whose beam sweeps in perspective, built from stacked clips in world space
- Rain as a single packed particle buffer, thousands of drops per draw call
- A harbour chart that nests clips in screen space and plots the same beam
- Additive firefly glow and per-sprite depth tinting on the reed bank
- A harbour at night: horizon, rippling water, reed bank and lantern-lit shore
- A live overlay reporting FPS, primitives, draw calls and state changes
- The same deterministic scene on either backend, for a like-for-like comparison

On the WebGL2 backend the field collapses into a handful of draw calls; on
Canvas it costs one call per primitive. The overlay prints that ratio, and
lists which optional renderer capabilities the active backend supports — on
Canvas the reed tinting drops out, the rain is capped and the harbour stays
evenly lit, because that backend declines `tint`, `particles`, `lights` and
`postEffects`.

**Controls:** `[` / `]` decrease / increase load · `1`–`7` toggle layers ·
`P` pause the camera pan · `H` hide the overlay

## [Platformer](https://mert574.github.io/m2d-engine/examples/platformer/)

A side-scrolling platformer showcasing physics-based movement, moving
platforms, enemy AI, collectibles and trigger zones.

**Controls:** Arrow keys move · `Space` jump · `X` attack

## [Top-down Maze](https://mert574.github.io/m2d-engine/examples/maze/)

- A deterministic, procedurally carved maze (wall cells merged into few static bodies)
- A camera following the player through a world larger than the view
- A sensor goal: touching it shows a banner and resets the run
- Top-down physics with direct-velocity movement

**Controls:** Arrow keys move

## [Physics Playground](https://mert574.github.io/m2d-engine/examples/physics/)

An interactive sandbox with dynamic object spawning, rotated static geometry
(a funnel, a splitter and a peg field), and different physics materials.

**Controls:** Drag to grab and fling a body · right-click (or long-press)
removes a body · double-click spawns where you clicked · scroll or pinch
changes gravity · `Space` spawns random objects

## [Top-Down Game](https://mert574.github.io/m2d-engine/examples/topdown/)

8-directional movement, zero-gravity physics, enemies, turrets and
projectiles.

**Controls:** Arrow keys move · `X` attack

## [Doner](https://mert574.github.io/m2d-engine/examples/doner/)

A rhythm-and-order game built mostly in screen space, showing the UI layer
driving a whole game rather than an overlay.

**Controls:** `A`/`S`/`D`/`F` rhythm keys, pressed in sequence · `Space`
serve order · `Backspace` clear sandwich
