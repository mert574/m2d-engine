# Architecture

How the engine is organized and the rules each part keeps. The user-facing behaviour is documented in the guide. This page is for people changing the engine.

## Layout

```
packages/engine/src/
├── core/
│   ├── m2d.js            Engine class: options, loop, display lifecycle, teardown
│   ├── time.js           Game and wall clocks, the fixed-step tick, time scale, after/every timers
│   ├── rng.js            Seeded random numbers (game.rng)
│   ├── entity.js         Base entity
│   ├── constraint.js     Base constraint
│   ├── projectile.js     Base projectile
│   ├── scene.js          Builds a scene from validated JSON
│   ├── sceneLoader.js    Validates scene JSON
│   ├── sceneManager.js   Registration, caching, switching
│   ├── quest.js          A quest as a line of stages
│   ├── projection.js     Ground plane to render plane (isometric)
│   ├── camera.js
│   ├── viewport.js       Display size to view, world surface and UI sizes
│   ├── spriteSheet.js
│   ├── layerManager.js   Tile layers with zIndex, parallax and culling
│   ├── soundManager.js
│   ├── constants.js      Collision categories
│   ├── math.js           Vec2 and Angle helpers
│   ├── physics/          The simulation behind an engine-owned interface
│   ├── renderers/        Backend contract, Canvas and WebGL2 backends, geometry
│   ├── console/          CVar and command registries, the drop-down console
│   ├── input/            inputManager.js (game.input) over pointer source, keyboard, cursor, gestures and router
│   └── ui/               Element tree, theme tokens, components, layout/, screens, motion, backdrop, settings menu, world overlay
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
- Inside the engine the world's clock is `game.time`: `fixedTimestep`, `maxSubSteps`, `timeScale` and the accumulator read through to it. The loop steps the world from `game.fixedUpdate`, once per tick, after the entities. `advance` remains for a world used on its own.

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

`game.destroy()` must leave nothing global behind. It cancels the frame, removes display listeners, tears down the screen stack and the settings menu first because they unregister input subscriptions, then the input system, sound, physics, the current scene and the renderer. `game.input` goes inert so an in-flight DOM event cannot leave a key held.

## Scenes

`SceneLoader.load` validates raw JSON and applies defaults before `Scene` builds anything. The normalized output has the same shape as the input, so there is one scene format to know. Adding a field means adding it to the key lists at the top of `sceneLoader.js`. `test/sceneLoader.test.js` covers the validator. `examples/test/scenes.test.js` validates every scene JSON under `examples/src/` and the scene files of the first-game demo under `docs/demos/`.

`Scene` creates entities through `game.createEntity`, which builds the body from the prefab's physics block and the object's placement and passes `properties` to the actor constructor. The entity named `Player` is stored as `game.player` and followed by the camera. A prefab `footprint` makes the body a short box at the bottom of the object and hangs `body.frame` on it, which the `Entity` constructor turns into `size` and `frameOffset`; that is the only thing on a body handle beyond the physics contract besides `entity`.

`Scene.drawWorld` draws tile layers and entities in one ascending order, `zIndex` then `depth`, rebuilt every frame because bodies move and the set changes. `LayerManager` keeps its layers sorted by `zIndex`, applies each layer's parallax as a shift of `camera · (1 - parallax)` and skips tiles outside `camera.getVisibleArea()`. The background hook runs before every layer, so ground detail that must sit above the floor layer is an entity at the floor's `zIndex`.

`SceneManager.switchTo` keeps `loading` set until the new scene's `load()` has finished, so no frame draws a scene's hooks before its setup has built the world (`test/sceneActions.test.js` pins it). A switch requested while `game.time.inStep` is deferred to a microtask after the frame. `game.fixedUpdate` returns `false` once `loading` is set, which ends `time.tick`'s loop, and the frame loop stops before updating or drawing the outgoing scene. Nothing reaches a world that is half unloaded. `Scene.setupScene` calls `physics.reset()`, which builds a new Rapier world. An emptied world keeps freed handles and broad-phase state, and a level entered in one steps differently in the last bits. `test/determinism.test.js` pins both.

A headless game (`core/headless.js`) shares `M2D#initSimulation` with a displayed one, so the two build the same clock, generator, physics and scene manager. Its presentation members are `presentationGuard` proxies that throw on any use, naming the member. Input is a device-free object that only samples a snapshot source, and sound is a no-op over every `SoundManager` method. `Scene.load` skips assets, tile layers, the scene UI, the camera and the `onShow` and `onHide` hooks when `game.headless` is set. `test/headless.test.js` runs with no browser globals and spawns a plain `node` process to prove it.

`net/input.js` is the boundary between a client and the simulation on a server. `InputSchema` decodes a message statically and never throws. `InputGate` files messages by tick in a window of `maxAhead` ticks and derives edges from consecutive held states, so the gate's buffer is bounded and a client can only express input a real device could produce. `test/netInput.test.js` attacks it; `test/determinism.test.js` checks that a hostile delivery of an honest stream plays the scripted run bit for bit.

`core/snapshot.js` captures the simulation as capture nodes: a value kept as is, or a container with a reference to the original and its captured content. Restoring writes the content back into the original container, which is what keeps identity for closures. `RapierPhysicsWorld.snapshot` pairs `World.takeSnapshot()` with each `RapierBody.saveState()`; `restore` folds the live bodies, replaces the world with `World.restoreSnapshot`, rebinds every saved body to its rigid body and collider by handle (handles survive the round trip) and builds new character controllers, which keep no per-step state. `test/snapshot.test.js` pins bit-identity through spawns, removals, a character body, timers and a rewind with corrected input.

Replication (`net/replication.js`) diffs per client: a `Replicator` remembers the transform and the JSON of each declared field it last sent, and the network ids its client has. Scene entities agree by id because both sides build the scene from the same module, and `M2D.markSceneBuilt` records their ids and a signature after `setupLevelScene`. A replica allocates negative ids to entities only it has, so they never meet the server's; `game.spawn` with `netId` takes the server's. A replica's `fixedUpdate` samples input and calls `NetClient.tick`; it never runs a level's simulation hooks, entities or physics. `packages/server` is the host: `server.js` owns sockets and the checks a stranger can reach, `matchHost.js` one worker per match with a watchdog, `matchWorker.js` the headless game, gates, intent queues and replicators. `packages/server/test/server.test.js` runs real servers, workers and sockets.

`game.projection` (`core/projection.js`) maps the ground plane the simulation runs on to the render plane the camera and renderer work in. It is applied in exactly four places: `Entity.renderAnchor` (and so `renderPosition` and `depth`), `LayerManager` for tile centres and culling, `InputManager.toWorld` for the inverse on pointer positions, and `M2D.worldToUI`. Nothing in physics or the renderer knows it exists. A scene sets it from `world.projection`; `reset` clears it.

The camera is a full world-to-view affine (`geometry/matrix.js` `viewMatrix`): translate, zoom and rotation about the view centre. Both backends apply that one matrix in `applyCamera`, and `Camera.worldToScreen` and `screenToWorld` use it and its inverse, so drawing, input and the world overlay cannot disagree. `camera.mode` picks how it moves — `follow`, `scroll` at `scrollVelocity`, or `rooms` snapping to the room of `roomSize` — and all of it is presentation on wall time, never read by the simulation (the [determinism contract](./determinism)). Camera configuration is scene state: `Scene.unload` and `game.reset` call `camera.resetConfig()`, and a scene's `onEnter` sets up the camera it wants.

## UI

`core/ui/` is an element tree over the screen-space renderer. `UIElement` owns the box, the children, the per-frame traversals and the routed-input handling; `Container` is just the element with no parent, whose box is the whole of UI space.

- A position is an **offset from an anchor** in the parent's content box, landing the element's **pivot** there. Both resolve on read, so nothing stores an absolute coordinate and a resize needs no relayout. `frame` is the box the element covers, `contentBox` is that minus `padding`.
- `drawTree` applies opacity, transform and clipping around `draw`, so a component that knows nothing about animation can still be faded, scaled, rotated and clipped by an ancestor. Rotation and scale go through two pushes — `T(p)·R·S` then `T(-p)` — which composes to a transform about the pivot while components keep drawing in absolute UI coordinates. One push would force every component into local space.
- Opacity cannot be pushed, because the contract takes `globalAlpha` per draw call. `UIPainter` folds the inherited alpha into every call instead, and resolves theme tokens on the way, so a component never calls `resolve` itself and never names a colour.
- `theme.js` holds the tokens. Values may reference other tokens, which is how the semantic layer is written in terms of the raw palette. `Theme.resolve` memoizes, because it runs per draw call. A component declares per-state style deltas and `resolveStateStyle` flattens them against `element.state`.
- **Focus renders as hover.** `state` collapses them into one appearance, because a keyboard-selected control and a pointer-hovered one mean the same thing to a player. There is no `focused` state and no ring; `ScreenStack` also hands focus to whatever the pointer moves onto, so the two input methods can never light up two different controls. `isFocused` survives as the navigation and activation concept only.
- A disabled element is still a hit target. It consumes and runs nothing, because a greyed-out control that let the click through would fire whatever is behind the dialog.
- The UI tree is ticked on a path `game.paused` does not gate, so a menu over a frozen game still animates. `Scene.updateUI` is separate from `Scene.update` for exactly that reason.
- The engine's own full-screen messages (`drawLoading`, `drawGameOver`) bypass the tree, because they draw when no scene — and so no container — exists. They still go through the theme.

Layout containers (`ui/layout/`) own their children's placement: they write the offsets and pin `anchor` and `pivot` to the top-left, so a child's own position cannot fight the container. `layout()` runs from `updateTree` *after* the children have updated, which is the only order in which a label that measures itself is already sized and nested containers resolve innermost-first. Sizes are per-axis and kept in `fixedWidth`/`fixedHeight` separately from `width`/`height`, which `layout` writes — otherwise a container could not tell the size the author asked for from the one it computed last frame.

`ui/screenStack.js` is `game.ui`: an ordered stack of `UIScreen`s plus a `debug` layer that outlives scene switches. It replaced `game.overlays`, an unordered `Set` in which every member reimplemented its own modality and the router had to ask each one in turn. Now the stack knows: input goes to the debug layer, then screens from the top down, and the first `blocking` one consumes. Drawing runs the other way, and the world overlay draws beneath all of it because annotations belong to the game rather than to the chrome above it.

`ui/focus.js` scopes keyboard navigation to one subtree, so Tab cannot walk out of a dialog. Sequential movement follows draw order; directional movement is geometric, scoring candidates by distance along the axis plus perpendicular misalignment — without that term a straight press down a column can jump diagonally to a nearer control in the next column. Activation synthesizes real `pointerdown`/`pointerup`/`click` events through `input.makeSyntheticEvent` rather than calling `onClick`, so a control behaves the same however it was triggered.

`ui/motion.js` is the one place UI interpolates, ticked from the loop outside the pause gate and before the UI tree so a tween writes the values that frame's layout reads. A tween applies its starting value on construction rather than on the first update — waiting a frame would show one frame of the final state before jumping back to the start of the animation. Completion is reported synchronously through `whenComplete` as well as through the thenable `finished`, because a screen marking itself open and a stack detaching it both have to be true within the frame the tween lands. `finished` resolves with nothing on purpose: a tween is itself thenable, so resolving it with `this` would make the promise adopt the tween's own `then` and never settle.

Transitions (`ui/transitions.js`) animate only a screen's `opacity`, offsets and `scale` — the properties `drawTree` applies to a whole subtree — so a screen moves as one piece without touching its contents. A layout, by contrast, *writes* its children's offsets every frame, so anything inside one must be animated through `opacity` or `scale` and a laid-out group must be moved by animating the container. An exiting screen moves to `stack.exiting`: still drawn, beneath the live ones, but out of the stack for input, `top` and the pause refcount, which lifts as the exit begins rather than when it lands.

The `blur` post effect defocuses the whole world pass, with everything downstream — bloom's bright pass included — reading the softened image so a glow agrees with what is on screen. It borrows `bloomB` as its horizontal intermediate, which is safe because the bloom pass runs after it, and allocates its own target lazily since most games never blur. `ScreenStack` pushes the strongest `blurBehind` on the stack into the renderer and leaves any other post effects alone.

The vendored UI typeface lives in `ui/fonts.js`. Both backends rasterize text through the browser and the WebGL one caches the result as a texture, so a label drawn before the font loads stays in the fallback face; `M2D.start()` awaits the load before the first frame. The faces are added to `document.fonts` once per page and deliberately not removed by `destroy()` — unlike a listener, a font face is immutable shared state that a second instance on the page wants too.

## The developer console

`core/console/` is two registries and a UI over them. `CVarRegistry` holds named, typed engine state — most engine cvars are *accessors* over live state, so reading asks the engine rather than a copy that can drift, and every write goes through parsing, clamping and choice-checking. `CommandRegistry` resolves one input line with Quake's grammar: command, bare cvar prints, cvar-plus-value sets. Persisted cvars replay at registration time, because that is the moment both the definition and the live engine exist.

`DevConsole` sits in `game.ui.debug` with `captureAll`: the stack routes it every event before anything else, which is what lets it take keys away from the game — while staying non-modal for pointer input outside its panel. Typing reads `event.key`, the engine's one sanctioned use of layout-dependent input. While mounted it wraps the global `console.*` methods (forwarding, first console wins, restored by `destroy`), so the engine's own warnings are readable in-game.

The settings menu's rows read and write cvars rather than engine methods, which is what makes a menu choice persist and keeps the menu and the console showing the same truth.

## Settings menu and pause

`SettingsMenu` is a `UIScreen` built from `UIOptionRow`s in a `Stack` inside a `UIPanel`, mounted as `game.settings`. Constructing it subscribes the hotkey in the overlay band and shows nothing; opening pushes the screen onto `game.ui`.

The screen answers the hotkey itself as well, because a blocking screen consumes input before subscribers run — otherwise the key that opened the menu could never close it. Key *releases* pass through on purpose: a key held when the menu opened has to come back up in the game's state, or the player keeps running after it closes.

`game.paused` is a flag the loop honours by skipping physics, entity and camera updates while still drawing. The stack refcounts it, so two pausing screens cannot fight over one boolean, and the state from before the first one is what gets restored.

## Time and the simulation tick

`game.time` is the one place a frame delta is turned into clocks and ticks. The loop feeds it the raw delta, the pause flag and `game.fixedUpdate` once per frame. It produces a wall-time delta and a game-time delta (zero while paused, multiplied by the scale), adds the game-time delta to an accumulator and runs `fixedUpdate` once for every whole `fixedTimestep` the accumulator holds, up to `maxSubSteps`. Nothing in it reads `performance.now()`, so the same object is driven by hand in tests and could be driven by a loop that corrects its clock against a server.

One tick is: sample the input, fire game-time timers due at this tick, run the scene's and every entity's `fixedUpdate(dt)`, step physics once. The order is fixed and `dt` is constant, which is what makes the simulation a function of its ticks and its inputs rather than of the frame rate. `test/determinism.test.js` pins this: the same scene with the same seed ends in bit-identical state at 30, 60 and 144 frames per second, and replays the same after `reset()`.

The rules the tick keeps:

- Simulation state changes only in `fixedUpdate`, `onFixedUpdate`, timers and collision handlers. The per-frame `update(deltaTime)` is presentation and may run zero or several times between ticks.
- Simulation code reads `game.input.snapshot`, taken once per tick. Held keys are copied; press and release edges reach only the first tick sampled in a frame. The per-frame edge API is untouched for the UI and for code outside the tick.
- Simulation code draws random numbers from `game.rng`, seeded from the `seed` option and reseeded on scene load and `reset()`.
- Physics takes `game.time` as its clock, so there is one `fixedTimestep`, one `timeScale` and one accumulator. `interpolation` is the accumulator's fraction of a tick and is what bodies draw with.
- Game-time timers fire at the start of their tick, so what they spawn is simulated by that tick. Wall-time timers fire per frame. A timer stores the clock reading it fires at instead of counting down, so its state is one number against the clock.
- The camera is presentation. It follows `renderPosition` on wall time with a smoothing corrected for the frame length, so the follow feels the same at every frame rate and does not slow down in slow motion.

What this does not make deterministic: two machines. Rapier's npm build is not compiled with its determinism feature, so floating-point results can differ across CPUs. Within one build on one platform, and for a server-authoritative model with client interpolation, the tick is what is needed. Lockstep across platforms would also need that build flag and per-tick command queues in place of the local snapshot.

## The renderer showcase

`examples/src/showcase/` is the renderer comparison harness. It reports `primitives` against `drawCalls` on screen. Layers are built from a seeded generator and the camera pans a fixed path, so both backends run the same workload. Layers submit every primitive every frame and avoid per-sprite transforms, so the counters measure the backend's batching. Clipping is covered in world space by the lighthouse beam and in screen space by the chart. The rain layer uses the `particles` capability and the lights layer uses `lights`. The beam's gradient descriptor is built once and its intensity goes through `globalAlpha`, because new stop strings would re-bake the gradient texture every frame.
