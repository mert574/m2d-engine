# Engine options

`new M2D(canvas, options)` accepts the following options. Everything is optional.

## Display

| Option | Default | Meaning |
| --- | --- | --- |
| `width` | `1280` | Visible world width, in world units |
| `height` | `720` | Visible world height, in world units |
| `worldWidth` | `1920` | World width, used for the background layer |
| `worldHeight` | `1080` | World height, used for the background layer and the fall-out check |
| `aspectMode` | `'letterbox'` | `'letterbox'` keeps the view's aspect with bars. `'expand'` widens the view to fill the display |
| `resolution` | `'native'`, or `0.5` when `dimensions` is `3` | World render resolution. `'native'`, a fraction of native such as `0.5`, or an absolute `{ width, height }` (only `height` sets the scale). A 3D frame is many passes over many pixels, so half of native is its default and the settings menu offers more |
| `worldFilter` | `'linear'` | Upscaling filter below native resolution. `'nearest'` for pixel art |
| `autoResize` | `true` | Follow the canvas's displayed size, the pixel ratio and fullscreen changes |
| `renderer` | `'webgl'`, or `'webgpu'` when `dimensions` is `3` | Backend name, class or instance. `'canvas'` is the other 2D built-in. A `?renderer=` URL parameter overrides it. When the option is left at its default and WebGL2 is unavailable, the engine falls back to Canvas with a warning. A backend named explicitly that fails throws, as does one that draws in a different dimension from the game. See [Three dimensions](./renderer#three-dimensions) |
| `performanceStats` | `true` | Add the frame-rate readout to the engine's debug layer |
| `performanceStatsHotkey` | `'F3'` | Physical key code that expands the readout. `null` binds no key |
| `devConsole` | `true` | Mount the [developer console](./console) (backquote). The cvar and command registries exist either way |
| `saveId` | the page's pathname | Scope for persisted cvars, so two games on one origin keep separate settings |
| `theme` | `null` | Design tokens for every piece of UI. A partial token tree is merged over the engine's default, or pass a `Theme`. See [Theme tokens](./ui#theme-tokens) |

## Scenes and assets

| Option | Default | Meaning |
| --- | --- | --- |
| `initialScene` | `null` | Scene to switch to in `start()` |
| `basePath` | `''` | Prefix for sprite sheet URLs in scene JSON |
| `textureFilter` | `'linear'` | How sprites and images are sampled when drawn at another size. `'nearest'` for pixel art drawn enlarged. Independent of `worldFilter` |
| `sounds` | `{}` | Name to URL map, loaded in `start()`. A value may be `{ src, volume }` to give the clip its own gain (0..1) under the sound volume |
| `music` | `{}` | Name to URL map of looping tracks, or `{ src, volume }` as above under the music volume |

## Input

| Option | Default | Meaning |
| --- | --- | --- |
| `pointerLock` | `false` | Confine the pointer to the canvas and draw a virtual cursor. See [Pointer lock](../guide/input#pointer-lock) |
| `preventDefaultKeys` | built-in list | Key codes whose browser default is suppressed. Replaces the list of Space, Tab, Enter, the arrows, PageUp, PageDown, Home, End and Backspace |

## Physics

| Option | Default | Meaning |
| --- | --- | --- |
| `fixedTimestep` | `1 / 60` | Seconds per simulation tick. Every `fixedUpdate` and physics step sees exactly this. Live at `game.time.fixedTimestep` |
| `maxSubSteps` | `6` | Most ticks one frame may run. Live at `game.time.maxSubSteps` |
| `timeScale` | `1` | Multiplier on game time: ticks, and so physics, entity simulation and game-time timers. `0.5` is slow motion. Live at `game.time.scale`. `physicsTimeScale` is accepted as an older spelling |
| `interpolatePhysics` | `true` | Blend drawn transforms between ticks |
| `seed` | `1` | Seed for `game.rng`. Reseeded on every scene load and `reset()`. Pass `Date.now()` for a game that should differ between sessions |
| `dimensions` | `2` | How many axes the simulation has, `2` or `3`. Must match what `initPhysics` loaded and what a level's `world.dimensions` declares. A 3D game also awaits `initWebGPU()` first. See [Three dimensions](./physics#three-dimensions) and the [renderer](./renderer#three-dimensions) |

## Headless

| Option | Default | Meaning |
| --- | --- | --- |
| `headless` | `false` | Build the simulation only, for a server or a test. The canvas must be `null`. Display, input device and audio options are ignored. See [Headless games](../guide/headless) |

## Instance properties

| Property | What it is |
| --- | --- |
| `game.headless` | True for a game built with `headless: true` |
| `game.players` | The players: `local` and, on a server, one per connection. See [Players](../guide/headless#players) |
| `game.replica` | True while the game is a client of a server, showing state it does not simulate. See [Multiplayer](../guide/multiplayer#the-client) |
| `game.net` | The `NetClient`, while connected |
| `game.sceneSignature` | A hash of the scene's own entities in network id order, which a client checks against the server's |
| `game.physics` | The physics world. See [Physics API](./physics) |
| `game.time` | The clocks, the simulation tick and timers. See [Time, ticks and timers](../guide/time) |
| `game.rng` | Seeded random numbers for simulation code. See [Random numbers](#random-numbers) |
| `game.camera` | The camera. See [Camera](../guide/camera) |
| `game.input` | The input system. See [Input events](./input-events) |
| `game.renderer` | The active backend. See [Renderer API](./renderer) |
| `game.uiRenderer` | Screen-space view of the renderer |
| `game.worldOverlay` | World-anchored annotations drawn at display resolution |
| `game.sceneManager` | Scene registration and switching |
| `game.soundManager` | Sound and music |
| `game.entities` | `Set` of live entities |
| `game.player` | The entity named `Player` in the current scene, or `null` |
| `game.canvas` | The canvas element |
| `game.resolution`, `game.aspectMode` | The current display settings |
| `game.running` | Whether `start()` has started the loop |
| `game.settings` | The mounted `SettingsMenu`, or `null` |
| `game.ui` | The [`ScreenStack`](./ui#screenstack): screens above the scene plus the debug layer |
| `game.stats` | The frame-rate readout in `game.ui.debug`, or `null` |
| `game.motion` | The [`MotionManager`](./ui#motionmanager) driving UI tweens |
| `game.cvars`, `game.commands` | The [console registries](./console). The settings menu is a view onto the cvars |
| `game.console` | The mounted [developer console](./console), or `null` |
| `game.theme` | The [`Theme`](./ui#theme-tokens) every UI element resolves against |
| `game.paused` | Freezes simulation while `true`. See [Pausing](../guide/time#pausing) |
| `game.isGameOver` | Set by `gameOver()` |
| `game.viewport` | The computed sizes. See the `Viewport` typedef in `core/viewport.js` |
| `game.worldFilter` | The current upscaling filter |
| `game.layers` | Background tile layers |
| `game.actors` | `Map` of registered actor names to classes |
| `game.collisionCategories` | The `CollisionCategories` table |
| `game.pendingResize` | Set by a display change, applied at the top of the next frame |
| `game.options` | The merged options |

## Instance methods

| Method | What it does |
| --- | --- |
| `start()` | Load sounds, switch to the initial scene and start the loop. Returns a promise. Headless, it switches to the initial scene and starts no loop |
| `step(ticks)` | Run `ticks` whole ticks now (default 1) and return how many ran. Stops early when a tick requests a scene switch. Not gated on `paused`. A headless game's only way to advance |
| `reset()` | Destroy constraints, clear entities, physics and layers, reset the camera to defaults, stop music. See [Game loop](../guide/game-loop#resetting) |
| `destroy()` | Stop the loop and release every listener and resource |
| `registerActor(name, Class)` | Make an actor available to scene prefabs |
| `registerConstraint(name, Class)` | Make a constraint available to scene prefabs and placed objects. See [Built-in constraints](./constraints#attaching-one-from-a-scene) |
| `loadAssets(manifest)` | Load an asset manifest, so scenes may reach for its sprite sheets and prefabs by uid. See [Asset manifest](./asset-manifest) |
| `assets` | The `AssetDatabase`, empty until `loadAssets` |
| `registerIntents(set)` | Install the game's intents from `defineIntents`. Every player gets a queue. See [Intents](../guide/headless#intents) |
| `entityById(id)` | The live entity with this network id, or `null` |
| `spawn({ type, x, y, width, height, sprite, animation, options, physics, playerId })` | Create an entity from a registered actor and add it to the world, recording how so a server can send it. Returns the entity. See [Creating entities at runtime](../guide/entities#creating-entities-at-runtime) |
| `snapshot()` | The whole simulation, taken between ticks. See [Snapshots](../guide/game-loop#snapshots) |
| `restore(snapshot)` | Put the simulation back to a snapshot taken in the current scene |
| `trackState(key, { save, load })` | Have snapshots carry state that lives outside entities. Dropped when the next scene loads |
| `createEntity({ type, x, y, width, height, spritesheet, options, physics })` | Build an entity from a registered actor. The body is not added to the world. `spritesheet` is a sheet, not its name; `spawn` takes the name. `physics` takes the prefab keys `bodyType`, `shape`, `angle`, `lockRotation`, `isSensor`, `friction`, `frictionAir` and `restitution`. Returns `null` for an unregistered name |
| `gameOver()` | Set `isGameOver` and play the `gameOver` sound. The loop then draws the game-over screen |
| `pause()`, `resume()`, `togglePause()` | Set `paused`. `togglePause` returns the new state |
| `fixedUpdate(dt)` | One simulation tick: sample the input, run the scene's and every entity's `fixedUpdate`, step physics. Returns `false` once a scene switch is pending. The engine loop passes it to `game.time.tick`; a custom loop does the same or wraps it and returns its result |
| `setResolution(resolution)` | Change the world render resolution |
| `setWorldFilter(filter)` | Change the upscaling filter |
| `setAspectMode(mode)` | Change the aspect mode |
| `requestFullscreen()`, `exitFullscreen()`, `toggleFullscreen()` | Fullscreen control. `isFullscreen` reports the state |
| `resize(force)` | Recompute the viewport now. Without `force` it does nothing when the result is unchanged. The engine calls it between frames when needed |
| `onResize(handler)` | Subscribe to viewport changes. The handler receives `(viewWidth, viewHeight, viewport)`. Returns an unsubscribe function |
| `worldToUI(x, y)` | Map a world position to UI coordinates |
| `drawWorld(scene, dt)`, `drawUI(scene, dt)`, `drawOverlays(dt)` | The three drawing passes, for games that run their own loop |

## Random numbers

`game.rng` is a seeded generator (mulberry32) from `core/rng.js`. Simulation code draws from it instead of `Math.random()`, so a level plays the same every time it is entered and a replay reproduces. It restarts from the `seed` option on every scene load and `reset()`.

| Member | Meaning |
| --- | --- |
| `next()` | A float in `[0, 1)` |
| `range(min, max)` | A float in `[min, max)` |
| `int(min, max)` | An integer in `[min, max]`, both inclusive |
| `chance(p)` | `true` with probability `p` |
| `pick(array)` | One element, or `undefined` for an empty array |
| `shuffle(array)` | Shuffle in place and return the array |
| `fork()` | A new generator seeded from this one, for a subsystem that wants its own stream |
| `reseed(seed)` | Restart the sequence |
| `seed`, `draws` | The seed the sequence started from and the draws since. Together they locate a position in the sequence |

`makeRng(seed)` from the same module returns a bare `() => number` for code that wants a function.
