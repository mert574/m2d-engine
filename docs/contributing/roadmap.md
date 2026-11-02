# Roadmap

What is planned next. Check the current implementation before starting an item. [Architecture](./architecture) describes what exists.

## Shipped

Renderer abstraction with a batched WebGL2 default and a Canvas 2D fallback, both held to one conformance suite. Optional capabilities that backends declare and callers degrade against. The renderer showcase. Scenes, entities, constraints, camera and UI. Strict scene validation. The display pipeline with independent view, world surface and UI resolutions, aspect modes, fullscreen, a settings menu and the world overlay. The input system with one Pointer Events source, gesture recognition, band routing with `consume()`, opt-in world hit testing, code-based keyboard state and opt-in pointer lock with a virtual cursor.

## Next

| Work | Done when |
| --- | --- |
| Visibility culling | `Camera.isVisible` is used. `Scene.draw` skips entities outside the view and `LayerManager` skips off-screen tiles. The showcase reports the saved primitives. A test pins that an off-screen entity emits no draw calls. Culling must not change what is visible at any aspect mode or render resolution |
| Tilemap layers | A level defines a tile layer as per-tile indices in scene JSON. Tiles draw batched and culled, the loader validates indices against the sheet and one example uses a real map. Depends on culling |
| Named input actions | Games bind actions such as `jump` and `attack` instead of key codes. Bindings can be listed and rebound, and the settings menu grows a rebinding row using `keyLabel`. An action binds pointer buttons and gestures too. The raw key and event API stays |
| Gamepad | A fourth source behind `game.input`. Axes feed `axis` and `vector`, buttons feed `isDown` and `justPressed`, hot-plugging works. Pairs with named actions |
| Web Audio mixing | A Web Audio graph with master, music and effects gain nodes replaces the audio elements. Volume rows in the settings menu, persisted with the other settings. Overlapping effects stop cutting each other off |
| Extension guide | A minimal example adds a new actor, constraint, scene and renderer backend. The documented commands work from a fresh checkout |

## Later


- Persist settings such as resolution, aspect, volumes and bindings to `localStorage`.
- Cache sprite sheets across scenes. `Scene.unload` drops them, so re-entering a level decodes every image again.
- More reusable UI components, actors and constraints.
- Consider networking only after simulation timing and renderer behaviour are stable.

## Working notes

Keep a small reproducible scene with each rendering fix instead of growing the showcase. Optional renderer features are not required of every backend. Keep demos runnable from a fresh checkout, and record asset origins alongside new assets.
