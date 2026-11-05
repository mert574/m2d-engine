# Roadmap

What is planned next. Check the current implementation before starting an item. [Architecture](./architecture) describes what exists.

## Shipped

Renderer abstraction with a batched WebGL2 default and a Canvas 2D fallback, both held to one conformance suite. Optional capabilities that backends declare and callers degrade against. The renderer showcase. Scenes, entities, constraints, camera and UI. Strict scene validation. The display pipeline with independent view, world surface and UI resolutions, aspect modes, fullscreen, a settings menu and the world overlay. The input system with one Pointer Events source, gesture recognition, band routing with `consume()`, opt-in world hit testing, code-based keyboard state and opt-in pointer lock with a virtual cursor. The fixed simulation tick: `game.time` with two clocks, `fixedUpdate` on entities, constraints and scenes, per-tick input snapshots, game-time and wall-time timers, a seeded `game.rng` and a frame-rate-independent camera, pinned by a determinism test and written down as the [determinism contract](./determinism). The perspective kit: the depth sort, the isometric and belt projections, parallax tile layers, `elevation`, camera zoom, rotation and the `follow`/`scroll`/`rooms` modes — camera config resetting with its scene — with every shipped perspective carried by a demo (see the table below).

## In progress: the UI re-architecture

Rebuilding the UI layer to carry modern game menus. No backwards compatibility
is kept; the phases land as one change.

| Phase | Work | Done when |
| --- | --- | --- |
| 1 — Foundation | Theme tokens, element tree, box model, inherited visual state, vendored type | **Shipped.** `UIElement` nests, with anchor/pivot boxes, padding, compounding opacity and pivot-relative transforms. `theme.js` holds the tokens every component resolves; no component names a colour. Exo ships as a variable face and `drawText` takes `fontStyle`. The UI ticks while paused and both draw passes receive `deltaTime` |
| 2 — Structure | Layout containers, focus and directional navigation, the screen stack | **Shipped.** `Stack`, `Grid` and `Spacer` place children from a gap and an alignment instead of hand-tuned offsets. Every screen owns a `FocusManager`: Tab walks draw order, the arrows move geometrically, Enter activates, Escape pops. `game.ui` is an ordered `ScreenStack` and has replaced `game.overlays`, so a menu sits over a live level. `SettingsMenu` is a screen built from `UIOptionRow`s, and the readout lives in `game.ui.debug` with an F3 toggle |
| 3 — Feel | Motion, screen transitions, backdrops | **Shipped.** `game.motion` tweens from the theme's duration and easing tokens, with staggering. Screens declare a `transition`, and an exiting one keeps drawing until it lands. `UIBackdrop` layers a gradient, a drifting still, custom `layers`, motes, scanlines and a vignette. `blurBehind` defocuses the world through a `blur` post effect under the existing `postEffects` capability, degrading to the scrim on Canvas. Every demo menu is rebuilt as a screen on the shared `examples/src/shared/mainMenu.js`: an off-centre composition of `UIMenuItem` lines — tracked uppercase type with a selection bar rather than filled buttons — under a light display title and a rule. `drawText` gained `letterSpacing`, since tracked caps are half of what makes UI read as a game |
| 4 — Tools | CVars, commands, the developer console | **Shipped.** `game.cvars` holds typed, described, optionally persisted engine state as accessors over the live engine; `game.commands` resolves Quake's grammar over it. The settings menu is a view onto the same cvars, so its choices persist. The backquote console has scrollback with wrapping, history, Tab completion and `console.*` capture, takes every key while open, and stays pointer-transparent outside its panel |

## In progress: networking

Multiplayer through an authoritative server. The game author writes their game once, as a module that registers actors, constraints and scenes. The browser imports it to play. A small server entry imports the same module into the engine's server host, which runs the simulation headless in Node. The author writes no networking code.

Decisions that hold for every phase:

- The server is authoritative and the only supported model. Lockstep, rollback and cross-browser bit-identity are deferred.
- Clients send input and nothing else. No positions, velocities or results cross the wire from a client.
- An input message is the held keys and the pointer for one tick. The server derives press and release edges from consecutive ticks, so a client cannot claim a press it never released.
- Input is validated statically: the structure, key codes against the game's allowlist, finite pointer coordinates inside the world bounds and at most one input per player per tick inside a window the server's clock defines. Anything else is dropped and counted against the connection.
- The server binds each connection to the entities it owns. A player's input drives only their entities.
- Simulation code runs without a browser. Reading the camera, the renderer, the DOM, sprites or sound from simulation code fails on the server.
- Two channels from a client, and nothing else. Continuous control (move, aim, fire, jump) is per-tick held input through the gate. Discrete requests whose choice only exists in the client's UI (move an item between slots, sell, equip, craft, pick a dialogue answer) are *intents*: named, typed requests declared by the game in its shared module. Settings, bindings, menus, opening a panel and hovering are local and never sent. The server holds state per player, never UI per player; each client draws its own HUD from its own copy.
- Rule of thumb: if the server can work out what was meant from keys plus world state (E talks to the nearest NPC), it is input. If the choice exists only in the client's UI (a slot index, a vendor's item, a dialogue option), it is an intent.
- An intent is applied at the start of a tick, before entities update, in a deterministic order (tick, player, sequence number). The server stamps the tick on arrival; the client never chooses it. The sender is the connection, never an argument. A repeated sequence number is a duplicate and dropped.
- Intents are validated in three layers. Static, generated from the declaration: unknown name, field set, types, integer ranges, string and array sizes, by a decoder that never throws; failures count toward the gate's sticky violation limit. Rate limits per intent per player. Then the game's own `run(player, args)`, which may reject with a reason the client receives. Reference arguments (`entity({ actor, owned, within })`, `slot(size)`) resolve a network id and check actor type, ownership and distance before `run` sees them, so "act on something you do not own or are not near" is declared, not remembered.
- Chat, accounts, purchases and matchmaking are not intents. They belong to services outside the tick.
- While a UI screen has focus, the input snapshot carries no keys: typing in a chat box or holding an arrow over the inventory must not move the avatar.

| Phase | Work | Done when |
| --- | --- | --- |
| 1 — Determinism hardening | Fix the contract violations found in the engine and the demos. Widen the determinism test | **Shipped.** A scene switch requested inside a tick runs after it, and no later tick or frame touches the outgoing scene. The game-over restart goes through `sceneManager.reload()`, so no tick runs while the level reloads. Every scene load builds a fresh physics world, since re-entering a level in an emptied one drifted in the last bits. Interactive's follow mode moves the body in `fixedUpdate`. `UIDialogue` takes a game-time `clock`. Ash Row measures waves from the design width, Hollow Grove talks on the tick, the physics playground queues pointer play for the next tick and Night Circuit rebuilds its world each round and saves the spills its best lap started with. `determinism.test.js` runs every engine actor and constraint from a scripted held-key stream at 30, 60 and 144 fps and through a pause and slow motion, plus re-entry, the restart and both kinds of mid-tick switch |
| 2 — Headless simulation | Run a game with no canvas, renderer, DOM or assets | **Shipped.** `new M2D(null, { headless: true })` loads and ticks level scenes in plain Node, driven by `game.step()`. Scenes load no sprite sheets or tile layers. The camera, renderer, UI, world overlay, layers, cvars and the live input devices are guards that throw by name on first use; sound is silent. Scene hooks split into simulation (`onEnter`, `onFixedUpdate`, `onExit`) and presentation (`onShow`, `onHide` and the frame hooks). Beeline is split into `game.js`, `main.js` and a headless `simulate.mjs`. `test/headless.test.js` runs with no browser globals, checks the guards and spawns a plain `node` process that agrees with the in-process run; `determinism.test.js` checks that a headless game plays the displayed game's ticks bit for bit |
| 3 — Players, ownership and intents | Per-player input, network ids, ownership and the intent channel | **Shipped.** `game.players` holds the local player and one per connection; `entity.input` is the owning player's snapshot (the local one by default) and every engine constraint and demo actor reads it. A blocking screen blanks the sampled snapshot, and a press the UI took never reaches one. Every entity has a `netId` reset with the scene, and `game.entityById` looks one up. `net/intents.js` has `defineIntents`, the argument types with the `entity` reference rule, `IntentQueue` (filed on arrival, applied at the start of the next tick in turn order (players by id, rotated by the tick) then seq, rate-limited, deduplicated by seq, sharing a `ViolationMeter` with the input gate) and `player.send` for the local path. `test/netIntents.test.js` attacks it: forged sender fields, unknown names, out-of-range and mistyped args, prototype keys, Proxies, replayed and stale seqs, floods and fuzz. `test/players.test.js` drives two players headless. Cinder Keep gained a satchel and a quartermaster with limited stock (`keepIntents.js`, `satchelUI.js`); choosing an item opens its options menu, and a test has two players race for the last charm in one tick, with `examples/test/keepIntents.test.js` running the real keep headless |
| 4 — State snapshots | Capture and restore the whole simulation | **Shipped.** `game.snapshot()` returns Rapier's world snapshot with every body wrapper's state, the entities in set order with their fields and their constraints', game-time timers, the clock, the rng, network ids, player state and avatars, and anything registered with `game.trackState`. `game.restore()` brings it back in place, and the ticks after it are bit-identical (`test/snapshot.test.js`: both coverage scenes, spawned and removed entities, a character body, timers, in-place containers, a rewind resimulated with corrected input; `examples/test/keepIntents.test.js`: a purchase rolled back). Entities and constraints customise capture with `saveState` and `loadState`. In memory only: about 4 ms each way for Cinder Keep's 615 entities, so phase 6 rewinds on server updates rather than snapshotting every tick |
| 5 — Server host and replication | The `m2d-server` package; state replication and a basic client in the engine | **Shipped.** `packages/server`: `createServer` and `defineMatch`, one worker per match (heap cap, entity cap, a watchdog fed four times a second), HMAC tickets checked before the upgrade (expiring, lifetime-capped, single-use, failing closed when the replay memory is full), per-IP upgrade rate and connection caps, an origin allow list, 4 KB frames with compression off, text-only envelopes, a message rate limit, idle and ping timeouts, slow readers cut off, violation kicks, a reconnect window, replaced connections, full matches. `net/replication.js` diffs per client (spawns via `game.spawn`, removals, transforms, `static replicated` fields, `replicaState`/`replicaUpdated`, private `state`, `player.notify` events, intent results, the avatar id). `net/client.js` connects, checks the scene signature and tick rate, sends latched per-tick input and intents. Tests: `packages/server/test` (tickets, envelopes, limits, real servers with misbehaving clients and crashing, looping, memory-hungry and runaway matches), `packages/engine/test/replication.test.js`, `examples/test/keepOnline.test.js` (two clients routing through the real keep). Cinder Keep plays online (`?online=`, `server.mjs`, `keepMatch.js`). Along the way: a non-blocking screen no longer takes navigation keys, and a UI scene's hooks run on a replica |
| 6 — Client | Prediction, reconciliation, interpolation and interest management | The local player moves on the tick it presses a key, and the server's state corrects it without visible snapping under 150 ms of latency (rewinding with `game.restore`). Remote entities draw interpolated between server states. Each client receives only the state near it. Sounds and effects from server-side simulation reach clients as events. WebTransport datagrams are used where the browser supports them |

## Next

| Work | Done when |
| --- | --- |
| Visibility culling | `Camera.isVisible` is used. `Scene.draw` skips entities outside the view. The showcase reports the saved primitives. A test pins that an off-screen entity emits no draw calls. Culling must not change what is visible at any aspect mode or render resolution. (`LayerManager` already skips off-screen tiles, pinned by `test/perspectives.test.js`) |
| Tilemap layers | A level defines a tile layer as per-tile indices in scene JSON. Tiles draw batched and culled, the loader validates indices against the sheet and one example uses a real map. Depends on culling |
| Named input actions | Games bind actions such as `jump` and `attack` instead of key codes. Bindings can be listed and rebound, and the settings menu grows a rebinding row using `keyLabel`. An action binds pointer buttons and gestures too. The raw key and event API stays |
| Gamepad | A fourth source behind `game.input`. Axes feed `axis` and `vector`, buttons feed `isDown` and `justPressed`, hot-plugging works. Pairs with named actions |
| Web Audio mixing | A Web Audio graph with master, music and effects gain nodes replaces the audio elements. Volume rows in the settings menu, persisted with the other settings. Overlapping effects stop cutting each other off |
| Extension guide | A minimal example adds a new actor, constraint, scene and renderer backend. The documented commands work from a fresh checkout |

## Perspectives

The engine ships a side view and a top-down view. The ones below simulate on the same flat plane; what changes is draw order, the camera transform and a faked third axis at render time. Four pieces of shared infrastructure carry almost all of them:

1. **Draw order.** Entities and tile layers sort by `zIndex`, then `depth` (the feet, by default), instead of insertion order. *Shipped.*
2. **Camera transform.** The camera owns a full world-to-view matrix: translate, zoom and rotation. Isometric adds a projection on top. *Zoom and rotation shipped.*
3. **Tile layers.** Several tiled layers per scene, each with its own parallax factor and `zIndex`, culled to the view. *Shipped.* Per-tile index maps remain a separate item above.
4. **Pseudo-z.** An `elevation` on entities that lifts the drawn sprite without touching the body, so a jump or a flight reads as height while the collider stays on the ground. *Shipped.*

| Perspective | Games like | Needs beyond the shared work | Status |
| --- | --- | --- | --- |
| 3/4 oblique top-down | Zelda, Stardew Valley, Enter the Gungeon | A prefab `footprint` so the collider is the feet and the sprite stands above it; a demo that walks behind things | **Shipped** |
| Isometric, dimetric 2:1 | Hades, Diablo, tactics games, city builders | A ground-to-render projection applied to positions only, a diamond tile layer with sparse cells, inverse projection for picking, screen-aligned keys and click-to-move. Physics stays unprojected | **Shipped** |
| Beat 'em up, belt scroller | Streets of Rage, Castle Crashers | The `belt` projection, `elevation` as the jump, the engine's ground shadow, `followAxes` and section locks through `bounds` | **Shipped** |
| Auto-scrolling shmup, endless runner | — | `camera.mode = 'scroll'`; a simulation-side scroll front for the window's rules | **Shipped** as Beeline |
| Rotating top-down | Twin-stick shooters, Hotline Miami | `camera.followRotation` and `ThrustControl` | **Shipped** as Salvage Run |
| Single-screen, room-based | Bomberman, Celeste rooms | `camera.mode = 'rooms'` with `roomSize` | **Shipped** as Hedgerow Court (the maze example, rebuilt as a garden of one-screen courts) |
| Point-and-click adventure | Monkey Island | Walk-behind layers, sprite scale by depth, pathfinding on a walkable polygon | Later |
| Mode 7 pseudo-3D | F-Zero, SNES Mario Kart | A ground-plane shader in the WebGL effects pass over flat top-down physics | Stretch |
| 2.5D parallax side view | Ori, Rayman Legends | Scenery planes at their own parallax fractions above and in front of the play plane | **Shipped** in Ash Row's street: skyline at 0.12, blocks at 0.45, frontage at 1, bollards at 1.25 |

## Later


- Persist volumes and bindings once audio mixing and named actions exist (resolution, aspect and the world filter already persist through their cvars).
- Cache sprite sheets across scenes. `Scene.unload` drops them, so re-entering a level decodes every image again.
- More reusable UI components, actors and constraints.
- Lockstep or rollback networking, on top of the authoritative model above. It needs Rapier's deterministic build (`@dimforge/rapier2d-deterministic-compat`) and a deterministic math module that simulation code uses in place of `Math.sin`, `Math.cos`, `Math.atan2`, `Math.exp` and `Math.hypot`, whose results may differ between JavaScript engines.

## Polish debt

- **Ash Row** shipped flat and careless; it was rebuilt in the 2.5D pass (skyline, mid blocks and frontage on three parallax planes, a real road, kerb props, a foreground). The lesson stands: every demo is a showcase, and one careless one undoes the others. Do not ship another example below that level.

## Working notes

Keep a small reproducible scene with each rendering fix instead of growing the showcase. Optional renderer features are not required of every backend. Keep demos runnable from a fresh checkout, and record asset origins alongside new assets.
