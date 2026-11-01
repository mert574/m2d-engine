# M2D Engine roadmap

Proposed development slices. Confirm scope against the current implementation
before starting — this file says what is next, not what exists. For what
exists, see [AGENTS.md](AGENTS.md).

## Shipped

Renderer abstraction with a batched WebGL2 default and a Canvas 2D fallback,
both held to one executable conformance suite; optional capabilities (`tint`,
`blendModes`, `particles`, `lights`, `postEffects`) that backends declare and
callers degrade against; the renderer showcase that measures the difference;
scenes, entities, constraints, camera and UI; strict scene-JSON validation;
the display pipeline — independent view / world-surface / UI resolutions,
aspect modes, fullscreen, a settings overlay and sharp world-anchored
annotations; and the unified input system — one Pointer Events source for
mouse, touch and pen, gesture recognition (click, double, right, drag, drop,
hover, pinch, scroll), overlay/UI/world routing with `consume()`, opt-in
world hit testing through the `Interactive` constraint, code-based keyboard
state, and pointer lock with a virtual cursor.

## Next priorities

| Work | Done when |
| --- | --- |
| Visibility culling | `Camera.isVisible` is actually used: `Scene.draw` skips entities outside the view, and `LayerManager` skips off-screen tiles. The showcase reports the saved primitives, and a test pins that an off-screen entity emits no draw calls. Culling must not change what is visible at any aspect mode or render resolution. |
| Tilemap layers | A level defines a tile layer as per-tile indices in scene JSON, not one frame repeated across the world (today's `background`). Tiles draw batched and culled, the loader validates tile indices against the sheet, and one example uses a real map. Builds on culling above. |
| Named input actions | Games bind *actions* (`jump`, `attack`) rather than raw key codes, so bindings can be listed and rebound; the settings overlay grows a rebinding row using `game.input.keyLabel`. An action binds pointer buttons and gestures too, not only keys. `game.input`'s raw-key and event API stays available underneath. The input module itself already exists (`src/core/input/`); this is the binding layer over it. |
| Gamepad | A fourth source behind the same `game.input` surface: axes feed `axis`/`vector`, buttons feed `isDown`/`justPressed`, and hot-plugging is handled. Pairs with named actions above, since a gamepad binding is where the action layer earns its keep. |
| Web Audio mixing | Replace the `new Audio()` + `cloneNode` playback with a Web Audio graph and master/music/effects gain nodes. Volume rows in the settings overlay, persisted with the other settings. Overlapping effects stop cutting each other off. |
| Public extension guide | A minimal example demonstrates a new actor, constraint, scene and renderer backend; the documented commands work from a fresh checkout. |

## Later

- Persist settings (resolution, aspect, volumes, bindings) to `localStorage`.
- Cache spritesheets across scenes — `Scene.unload` currently drops them, so
  re-entering a level re-decodes every image.
- More reusable UI components, actors and constraints.
- Evaluate networking only after simulation timing and renderer behaviour are
  stable; multiplayer is not part of the first milestone.

## Working notes

Keep a small reproducible scene with each rendering fix rather than growing
the showcase, which is feature-complete. Optional renderer features are not
required of every backend: a backend declares what it supports through
`capabilities`, and Canvas declining some of the list is the documented basis
for choosing a backend, not a gap to close. Keep demos runnable from a fresh
checkout, and record asset origins and license notices alongside new assets.
