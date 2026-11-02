# Roadmap

What is planned next. Check the current implementation before starting an item. [Architecture](./architecture) describes what exists.

## Shipped

Renderer abstraction with a batched WebGL2 default and a Canvas 2D fallback, both held to one conformance suite. Optional capabilities that backends declare and callers degrade against. The renderer showcase. Scenes, entities, constraints, camera and UI. Strict scene validation. The display pipeline with independent view, world surface and UI resolutions, aspect modes, fullscreen, a settings menu and the world overlay. The input system with one Pointer Events source, gesture recognition, band routing with `consume()`, opt-in world hit testing, code-based keyboard state and opt-in pointer lock with a virtual cursor.

## In progress: the UI re-architecture

Rebuilding the UI layer to carry modern game menus. No backwards compatibility
is kept; the phases land as one change.

| Phase | Work | Done when |
| --- | --- | --- |
| 1 — Foundation | Theme tokens, element tree, box model, inherited visual state, vendored type | **Shipped.** `UIElement` nests, with anchor/pivot boxes, padding, compounding opacity and pivot-relative transforms. `theme.js` holds the tokens every component resolves; no component names a colour. Exo ships as a variable face and `drawText` takes `fontStyle`. The UI ticks while paused and both draw passes receive `deltaTime` |
| 2 — Structure | Layout containers, focus and directional navigation, the screen stack | **Shipped.** `Stack`, `Grid` and `Spacer` place children from a gap and an alignment instead of hand-tuned offsets. Every screen owns a `FocusManager`: Tab walks draw order, the arrows move geometrically, Enter activates, Escape pops. `game.ui` is an ordered `ScreenStack` and has replaced `game.overlays`, so a menu sits over a live level. `SettingsMenu` is a screen built from `UIOptionRow`s, and the readout lives in `game.ui.debug` with an F3 toggle |
| 3 — Feel | Motion, screen transitions, backdrops | **Shipped.** `game.motion` tweens from the theme's duration and easing tokens, with staggering. Screens declare a `transition`, and an exiting one keeps drawing until it lands. `UIBackdrop` layers a gradient, a drifting still, motes, scanlines and a vignette. `blurBehind` defocuses the world through a `blur` post effect under the existing `postEffects` capability, degrading to the scrim on Canvas. Every demo menu is rebuilt as a screen on the shared `examples/src/shared/mainMenu.js`: an off-centre composition of `UIMenuItem` lines — tracked uppercase type with a selection bar rather than filled buttons — under a light display title and a rule. `drawText` gained `letterSpacing`, since tracked caps are half of what makes UI read as a game |
| 4 — Tools | CVars, commands, the developer console | **Shipped.** `game.cvars` holds typed, described, optionally persisted engine state as accessors over the live engine; `game.commands` resolves Quake's grammar over it. The settings menu is a view onto the same cvars, so its choices persist. The backquote console has scrollback with wrapping, history, Tab completion and `console.*` capture, takes every key while open, and stays pointer-transparent outside its panel |

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


- Persist volumes and bindings once audio mixing and named actions exist (resolution, aspect and the world filter already persist through their cvars).
- Cache sprite sheets across scenes. `Scene.unload` drops them, so re-entering a level decodes every image again.
- More reusable UI components, actors and constraints.
- Consider networking only after simulation timing and renderer behaviour are stable.

## Working notes

Keep a small reproducible scene with each rendering fix instead of growing the showcase. Optional renderer features are not required of every backend. Keep demos runnable from a fresh checkout, and record asset origins alongside new assets.
