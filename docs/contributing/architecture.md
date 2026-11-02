# Architecture

How the engine is organized and the rules each part keeps. The user-facing behaviour is documented in the guide. This page is for people changing the engine.

## Layout

```
packages/engine/src/
├── core/
│   ├── m2d.js            Engine class: options, loop, display lifecycle, teardown
│   ├── entity.js         Base entity
│   ├── constraint.js     Base constraint
│   ├── projectile.js     Base projectile
│   ├── scene.js          Builds a scene from validated JSON
│   ├── sceneLoader.js    Validates scene JSON
│   ├── sceneManager.js   Registration, caching, switching
│   ├── camera.js
│   ├── viewport.js       Display size to view, world surface and UI sizes
│   ├── spriteSheet.js
│   ├── layerManager.js   Background tile layers
│   ├── soundManager.js
│   ├── constants.js      Collision categories
│   ├── math.js           Vec2 and Angle helpers
│   ├── physics/          The simulation behind an engine-owned interface
│   ├── renderers/        Backend contract, Canvas and WebGL2 backends, geometry
│   ├── input/            inputManager.js (game.input) over pointer source, keyboard, cursor, gestures and router
│   └── ui/               Screen-space components, settings menu, world overlay
├── actors/               Entity classes the examples share
└── constraints/          Reusable behaviours
```

## Physics boundary

Nothing outside `core/physics/` imports a physics library. `index.js` documents the contract and exports `initPhysics` and `createPhysicsWorld`. `rapierBackend.js` implements the contract over Rapier 2D. `worldBase.js` holds the solver-independent fixed-step clock and interpolation alpha.

Rules the boundary keeps:

- Units are pixels, seconds and radians. No solver unit appears outside the module. Rapier's length unit is configured so that holds.
- Creation and insertion are separate. A body buffers its spec until `add`, then materializes a rigid body and collider.
- Reads return snapshots. Writes are methods.
- A kinematic body is driven by velocity, which the world integrates once per step. `setNextPosition` sets a target consumed by the next step. `setPosition` teleports.
- A character body is a kinematic rigid body plus a Rapier character controller. `velocity` on it is the live intent, reconciled with what happened. Each step the controller computes a collision-aware move, applies gravity and `frictionAir`, rides a kinematic ground body and pushes dynamic bodies.
- Collision events are requested per collider. Dynamic, kinematic, character and sensor bodies request them. Plain static bodies do not, so static pairs are never reported.
- Queries read a broad-phase index that only `step` maintains. Bodies added or teleported since the last step are kept in a separate set and tested directly. That is what lets a body be added or moved and queried in the same frame. Rapier's own internal queries, including the character controller's sweeps, do not see a body until the step after it was added.
- `renderPosition` blends the previous and current step by the world's `interpolation`. Direct moves reset the previous snapshot so a teleport does not smear.

`test/physics.test.js` asserts the contract with tolerances and never Rapier internals. A replacement solver would have to pass it.

## Renderer contract

`BaseRenderer` is the full contract: lifecycle, the world and screen passes, the draw primitives, the transform and clip stack, `measureText`, cursor, debug flag and statistics. No engine or game code touches a canvas context directly.

The contract describes rendering semantics. When a backend needs a workaround to meet it, the workaround lives in the backend. The Canvas backend renders primitives that have a fill, a stroke and a shadow through a scratch canvas so the shadow is cast once by the whole silhouette.

Backends:

- `canvasRenderer.js` draws the world into a buffer and composites it in `endFrame`.
- `webglRenderer.js` tessellates and transforms geometry on the CPU in `geometry/` and batches it in `webgl/batch.js` into as few draw calls as paint-state changes allow. Text is rasterized by the browser into cached label textures. Clips use stencil reference counting. Shadows render the silhouette offscreen and blur it. Lights and post effects live in `webgl/effectsPass.js`. The `geometry/` modules are API-neutral so another GPU backend would reuse them.
- `uiRenderer.js` wraps any backend and forwards calls with `isScreenSpace: true`. A new backend gets the UI layer for free.
- `index.js` holds the registry and the default and fallback names. The fallback rule lives in `M2D`'s renderer setup. When the selected backend is the default, was not named in the constructor options and fails to initialize, the engine falls back to Canvas with a warning. Any other failing selection throws, including a `?renderer=` override that names a non-default backend.

Optional capabilities exist because the backends differ in cost. A backend that lacks one ignores the option. The conformance harness's `capabilities` field is a different thing: it gates mandatory tests while a backend is under construction. See [Testing](./testing).

Behaviours pinned by tests because they are easy to get wrong:

- A partial `drawArc` fill is a circular segment, closed by the chord.
- Frame order is world pass, then screen pass.
- Translucent gradient stops are premultiplied once. The WebGL backend once premultiplied them twice through `UNPACK_PREMULTIPLY_ALPHA_WEBGL`.
- A shadow is cast once by fill plus stroke, and `globalAlpha` applies once to the composite.
- Transform and clip pushes share one strictly nested stack.
- Statistics count `primitives` exactly and only bound `drawCalls`.

## Input

`core/input/` composes five pieces. `PointerSource` normalizes DOM pointer and wheel events. `Keyboard` tracks held keys by code. `Cursor` tracks the pointer position and owns pointer lock. `GestureRecognizer` derives click, double click, right click, drag, pinch and scroll from the raw stream. `InputRouter` resolves a target across the overlay, UI and world bands and dispatches.

- Records are queued through `push`. Presses, releases and key events drain immediately inside the DOM handler so user-activation-gated calls such as `requestPointerLock` work. Moves and wheel ticks wait for `beginFrame`, where moves from one pointer are coalesced. Draining on a press drains everything queued before it, so order is preserved.
- Recognizers are lazy. Pinch is recognized only while a listener exists, so two fingers are otherwise two drags. Long press as right click suppresses the tap that would follow.
- One target per event. A drag is the exception: whatever received `dragstart` receives the rest without further hit testing.
- World hit testing runs only when `Interactive` constraints are registered, and then as one `queryPoint` per event for all of them.
- Pointer lock is opt-in. Under it the cursor integrates relative motion into a virtual position in UI space and draws it. Nothing downstream can tell which mode produced the position.
- The canvas sets `touch-action: none`, contains overscroll, disables selection and the context menu and captures the pointer on every press.
- Every listener on `window` or `document` keeps a stable handler reference so `destroy` can remove it.

## Viewport

`core/viewport.js` turns a display size into the three sizes the engine renders at. They are the view in world units, the world surface in pixels and UI space in UI units at display density. `computeViewport` is pure. `M2D` calls it on construction and on every coalesced display change.

- The world is a real surface on both backends when it is resampled or when lighting and post effects need it as a texture. At native resolution WebGL draws straight to the default framebuffer so multisampling applies. The scene target carries a stencil buffer, without which clipping stops working.
- UI draws straight onto the backing store at full resolution after the world is composited.
- UI space fits the design box and extends along the wide axis. Anchored elements reach the real edges, and a design-aspect box centred in UI space is always on screen.
- Backends implement `setViewport(viewport)` and store it even when the context is lost, so the latest size is replayed on restore.
- Display events from `ResizeObserver`, `fullscreenchange` and a `matchMedia` pixel-ratio query set a flag that `update` applies at the top of the next frame. `resize` drops no-op changes, which also prevents a feedback loop with the `canvas.width` the engine sets.

## Teardown

`game.destroy()` must leave nothing global behind. It cancels the frame, removes display listeners, destroys overlays first because they unregister input subscriptions, then the input system, sound, physics, the current scene and the renderer. `game.input` goes inert so an in-flight DOM event cannot leave a key held.

## Scenes

`SceneLoader.load` validates raw JSON and applies defaults before `Scene` builds anything. The normalized output has the same shape as the input, so there is one scene format to know. Adding a field means adding it to the key lists at the top of `sceneLoader.js`. `test/sceneLoader.test.js` covers the validator. `examples/test/scenes.test.js` validates every scene JSON under `examples/src/` and the scene files of the first-game demo under `docs/demos/`.

`Scene` creates entities through `game.createEntity`, which builds the body from the prefab's physics block and the object's placement and passes `properties` to the actor constructor. The entity named `Player` is stored as `game.player` and followed by the camera.

## Settings menu and pause

`SettingsMenu` registers in `game.overlays` and as `game.settings`. It registers no listeners. The router's overlay band hands it every event, and while open it consumes everything except key releases. `game.paused` is a flag the loop honours by skipping physics, entity and camera updates while still drawing.

## The renderer showcase

`examples/src/showcase/` is the renderer comparison harness. It reports `primitives` against `drawCalls` on screen. Layers are built from a seeded generator and the camera pans a fixed path, so both backends run the same workload. Layers submit every primitive every frame and avoid per-sprite transforms, so the counters measure the backend's batching. Clipping is covered in world space by the lighthouse beam and in screen space by the chart. The rain layer uses the `particles` capability and the lights layer uses `lights`. The beam's gradient descriptor is built once and its intensity goes through `globalAlpha`, because new stop strings would re-bake the gradient texture every frame.
