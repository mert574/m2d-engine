# M2D Engine - Claude Code Context

## Project Overview

M2D is a lightweight 2D game engine with a pluggable physics backend (Matter.js today) and WebGL2 rendering (with a Canvas 2D fallback). It follows an entity-constraint architecture similar to ECS.

### Physics boundary

Nothing outside `src/core/physics/` imports a physics library. Engine, actor and game code use `game.physics` (the world) and the `PhysicsBody` handles it returns; `src/core/physics/index.js` documents the contract and two backends implement it: **Rapier** (`rapierBackend.js`, the default — WASM, accurate solver, CCD) and **Matter.js** (`matterBackend.js`, plain-JS fallback and what headless tests use). `worldBase.js` holds the backend-independent fixed-step machinery. Append `?physics=matter` or `?physics=rapier` to any example URL to compare them live. If you find yourself importing `matter-js` or `@dimforge/rapier2d-compat` anywhere else, the abstraction has sprung a leak.

Physics runs on a **fixed timestep** (1/60s by default), decoupled from the frame rate: the loop calls `game.physics.advance(deltaTime)`, which spends elapsed real time in whole constant-size steps and carries the remainder. Entity and constraint `update(deltaTime)` still receive real frame time, because animation and timers want wall clock, not solver ticks.

**Units are pixels and seconds**: velocity in px/s, gravity in px/s² (`{x: 0, y: 1000}` is normal down), impulses as a velocity change in px/s. No backend unit (steps, meters, force constants) appears outside `src/core/physics/`. Call `await initPhysics()` once before constructing M2D — it resolves the backend choice (URL override, else Rapier), fetches and compiles Rapier's WASM when selected, and is instant for Matter. Fast movers should set `body.bullet = true` (projectiles do): on Rapier that enables continuous collision detection so they cannot tunnel through thin walls; on Matter it is advisory.

Because the solver runs slower than a fast display refreshes, several frames share one physics position and motion would visibly stair-step. The engine fixes this with **render interpolation**: draw using `entity.renderPosition` / `entity.renderAngle` (or `body.renderPosition` / `body.renderAngle`), which blend between the last two steps. Use `position` for everything else — collision checks, AI, queries and distances all want the true current state. Direct moves (`setPosition`, `setAngle`, `translate`) reset the baseline, so a teleport is never smeared across frames.

## Quick Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (port 3000)
npm run build        # Build to /docs
npm test             # Run both test projects (node + headless Chromium)
npm run test:node    # Headless Node suite only (fast)
npm run test:browser # Browser project only: WebGL2 conformance + env smoke test
npm run test:watch   # Re-run the node project on change
npx playwright install chromium   # One-time: download Chromium for test:browser
node scripts/generateSprites.js <example>  # Generate sprites for an example
```

## Architecture

### Core Classes (`src/core/`)

- **Entity** (`entity.js`) - Base class for all game objects. Has body, sprite, constraints. The `body.entity` link is set in constructor for collision detection.
- **Constraint** (`constraint.js`) - Reusable behaviors attached to entities (health, attack, movement, debug)
- **Projectile** (`projectile.js`) - Base class for projectiles (rockets, bullets). Handles movement, lifetime, collision, damage.
- **Scene** (`scene.js`) - Manages level loading, entities, UI. Checks `entity.name === 'Player'` for camera follow.
- **SceneLoader** (`sceneLoader.js`) - Validates and normalizes scene JSON before a Scene is built from it. See "Level JSON Structure".
- **M2D** (`m2d.js`) - Main engine class. Collision handlers are set up in `setupCollisionHandlers()`.
- **PhysicsWorld** (`physics/`) - The simulation, reached as `game.physics`. See "Physics boundary" above.

### Renderers (`src/core/renderers/`)

Rendering is fully abstracted behind a backend interface; no game or engine code
may touch a canvas context directly. The contract describes rendering semantics,
not Canvas 2D behaviour: when a backend needs a workaround to meet it, that
workaround belongs in the backend (the Canvas backend already carries one for
silhouette shadows), never in the contract or in callers.

- **BaseRenderer** (`baseRenderer.js`) - The complete backend contract: lifecycle,
  world/screen frame passes, draw primitives (`drawSprite`, `drawImage`, `drawRect`,
  `drawLine`, `drawArc`, `drawPath`, `drawText`), transform/clip stacks
  (`pushTransform`/`popTransform`, `pushClip`/`popClip`), and `measureText`.
  Backend-agnostic logic (FPS/stats tracking, debug flags, `hitTest`) lives here.
  Fill/stroke styles accept CSS colors or declarative gradient descriptors
  (`{ type: 'linear', x0, y0, x1, y1, stops }` or the concentric
  `{ type: 'radial', x, y, r0, r1, stops }`); all draw calls accept `isScreenSpace`,
  `globalAlpha`, and `shadow` ({ color, blur, offsetX, offsetY }). A shadow is cast
  once by the primitive's whole silhouette (fill + stroke); `globalAlpha` applies
  once to the whole primitive. `clear(color)` clears the presented surface
  (transparent if no colour). Transform and clip pushes share one strictly
  nested stack. Stats distinguish `primitives` (what callers asked for) from
  `drawCalls`/`stateChanges` (what the backend submitted, so batching backends
  report fewer).
- **CanvasRenderer** (`canvasRenderer.js`) - Canvas 2D backend with a double-buffered
  world pass composited in `endFrame()`.
- **WebGLRenderer** (`webglRenderer.js`) - WebGL2 backend, the default. Geometry
  is tessellated and transformed on the CPU (`geometry/`) and batched into as few
  GPU draw calls as paint-state changes allow (`webgl/batch.js`). Text is
  rasterized by the browser's 2D text engine into cached label textures; clips
  use stencil reference counting; shadows render the silhouette offscreen and
  blur it (`webgl/shadowPass.js`). The `geometry/` modules are API-neutral so a
  WebGPU backend would reuse them and replace only `webgl/`.
- **UIRenderer** (`uiRenderer.js`) - Generic screen-space view over any backend;
  forwards calls with `isScreenSpace: true`. `game.uiRenderer` is one of these, so a
  new backend only implements `BaseRenderer` and the UI layer works automatically.
- **Capabilities** - Everything in the contract above is mandatory. Beyond it,
  backends advertise *optional* features through `renderer.capabilities`,
  queried with `renderer.supports(name)`; defaults live in
  `OPTIONAL_CAPABILITIES` (`baseRenderer.js`) and are all false. A backend
  lacking one **ignores** the option rather than throwing, so a scene written
  for the GPU still runs on Canvas. They exist because the backends are
  genuinely unalike — additive blending and post effects are nearly free on a
  GPU and expensive or impossible on Canvas 2D — so callers query and degrade
  instead of holding every backend to the slowest. Not to be confused with the
  conformance harness's `capabilities` field, which gates *mandatory* contract
  tests while a backend is still being built.

  | Feature | Backends | Notes |
  | --- | --- | --- |
  | `tint` | WebGL | Folds into the vertex colour the texture shader already multiplies, so it costs no extra draw calls |
  | `blendModes` | both | `gl.blendFunc` keyed into the batch state; `globalCompositeOperation` on Canvas |
  | `particles` | WebGL | `drawParticles` takes a packed `Float32Array` (`PARTICLE_STRIDE` floats each). `BaseRenderer` falls back to one `drawSprite` per particle, so the call works everywhere and the flag means "fast and coloured" |
  | `lights` | WebGL | Switched on by `setAmbientLight`, not by submitting lights: with no ambient the light map is white and lights have nothing to do, so a null ambient skips the pass entirely |
  | `postEffects` | WebGL | Bloom and vignette, with `lights`, in `webgl/effectsPass.js` |
- **Registry** (`index.js`) - `registerRenderer(name, Class)` + the M2D `renderer`
  option (`'webgl'` by default, `'canvas'`, or a class/instance) select the backend.
  If the default backend cannot initialise (no WebGL2), M2D falls back to Canvas
  with a warning; an explicitly requested backend that fails throws. A
  `?renderer=<name>` URL query overrides the option, so any example can be viewed
  with either backend. New backends plug in by subclassing `BaseRenderer` and
  registering.

The backend contract is enforced by an executable conformance suite
(`test/conformance/rendererConformance.js`). A new backend is validated by one
file that passes it a harness — see `test/README.md`. Tests are split into a
`node` project (fast, node-canvas) and a `browser` project (`test/browser/**`,
headless Chromium) because Node has no WebGL. Two contract details are easy to
get wrong and are pinned by tests: partial `drawArc` fills produce circular
**segments** (chord-closed), not pie sectors; and the frame order is world
pass then screen pass.

### Viewport, resolution and resize (`src/core/viewport.js`)

The engine keeps **three resolutions independent**, because they answer three
different questions. Confusing them is the main hazard when touching this code.

| | What it is | Set by | Renderer field |
| --- | --- | --- | --- |
| **View** | How much world is visible, in *world units* | `options.width/height` (design size) | `renderer.width/height`, `camera.width/height` |
| **World surface** | How many pixels that view rasterizes into | `game.setResolution(...)` | `viewport.worldWidth/worldHeight` |
| **UI** | Screen-space layer, in UI units at display pixel density | Display size + DPR | `uiRenderer.width/height` |

Rules that follow from this, all pinned by tests:

- **Resolution is fidelity, not zoom.** `setResolution({width, height})` changes
  only the world surface. The camera's view is untouched, so a low resolution
  makes the world coarser and never reveals anything past the designed view.
  `'native'` matches the display.
- **UI never gets coarser.** The world is composited from its surface into the
  content rect, then the UI draws straight onto the backing store at full
  display resolution — so a 426x240 world can carry a razor-sharp HUD. On
  WebGL the two passes bind the default framebuffer differently
  (`#bindDefaultTarget`), and label textures are rasterized at the active
  pass's density.
- **The world surface is a real surface, on both backends.** Canvas renders
  the world into `worldBuffer` and blits it to the content rect. WebGL renders
  into the effects pass's `scene` target and presents it — whenever the world
  is resampled (`#worldIsResampled`) *or* lighting/post effects need the world
  as a texture. The no-effects case goes through `EffectsPass.present`, a
  one-draw blit, rather than the full composite. At `'native'` neither backend
  resamples, and WebGL draws straight to the default framebuffer so the
  context's own multisampling still applies. The scene target carries a
  stencil buffer — without it, clipping silently stops working whenever the
  world is routed through it. A backend that rasterizes the world at display
  resolution and only *reports* the lower one is the bug the conformance
  suite's "rasterizes the world into the world surface" case exists to catch
  — it is not enough to test that the UI stayed sharp.
- **`worldFilter` is how the surface is upscaled**, and both backends honour
  it: `'nearest'` for pixel art, `'linear'` (default) otherwise. It is a
  `BaseRenderer` method (`setWorldFilter`), set from `options.worldFilter` at
  init and changeable at runtime through `game.setWorldFilter(...)`. It has no
  effect at `'native'`, where there is nothing to upscale.
- **UI fills the screen; the world may letterbox.** UI space always covers the
  whole display (fixed height, width follows the aspect), so elements can
  anchor to real screen edges. `options.aspectMode` picks `'letterbox'`
  (default, designed aspect preserved with bars) or `'expand'` (the view
  widens and more world becomes visible — opt in only if the map can take it).
- **UI positions are anchor-relative.** `UIElement` stores `offsetX/offsetY`
  against an `anchor` (`'top-left'` by default, so existing absolute layouts
  are unchanged); `x`/`y` resolve against the current UI size on every read.
  Full-screen backgrounds use `UIRectangle`'s `fill: true` (scene JSON:
  `"fill": true`), which stretches over live UI space every draw — no fixed
  design-sized rect can cover a space that widens with the display.
- **Bounded cameras centre when the view outgrows the bounds.** Example games
  set `camera.bounds` from their world size so player-following and the
  `'expand'` aspect mode never reveal the void past the map; when the view is
  larger than the bounded span (expand on a one-screen board, like the maze),
  the clamp limits invert and `Camera` centres on the span instead of pinning
  to a corner.
- **Backends implement `setViewport(viewport)`**, not a bare resize.
  `BaseRenderer.resize(w, h)` is a convenience that builds an
  `identityViewport` (everything the same size) and is what the conformance
  suite's baseline uses. A backend must store the viewport even when it cannot
  act on it — a WebGL context may be lost — so the *latest* size is replayed on
  restore.
- **Pointer mapping goes through `mapPointer`.** The canvas rect is not the
  drawn area (CSS letterboxing) and the world occupies only its content rect
  inside it. Use `game.getMousePosition(event)` for world coordinates and
  `game.getUIPosition(event)` for UI coordinates; never scale by the bounding
  rect by hand. The opposite direction is `game.worldToUI(x, y)`
  (`viewToUI` in viewport.js), for pinning screen-space content to a world
  object.
- **Annotations do not belong in the world pass.** Anything drawn *on* the
  game rather than *in* it — debug geometry (attention radii, attack ranges,
  target dots, facing vectors, bounds boxes), world-anchored readouts, a
  trigger's tinted area and name — is rasterized into the world surface if it
  goes through `game.renderer`, so it inherits the render resolution: at 0.25x
  a range ring becomes a staircase and a 3-unit target dot disappears, while
  the sprites it annotates merely look blocky, which is the intended effect.
  Submit it to `game.worldOverlay` (`src/core/ui/worldOverlay.js`) instead.
  Its API mirrors the renderer's, so moving a call is a one-word change:
  `game.renderer.drawArc(...)` -> `game.worldOverlay.drawArc(...)`.
  - **Shapes keep world units.** Coordinates *and* sizes go through the
    world-to-UI transform, so a 200-unit ring stays glued to the 200 units it
    describes. Only the rasterization changes.
  - **Text keeps a fixed UI size.** The anchor is world coordinates, but
    `fontSize` and `offsetX/offsetY` are UI units, so a readout is as legible
    at 0.25x as at native and never scales with the view.
  - Submissions are per-frame, cleared at the top of `drawWorld`, drawn
    shapes-then-text, and clipped to the content rect so nothing runs onto the
    letterbox bars.
  - The line is "is this the thing, or a note about the thing": an actor's own
    appearance stays in the world pass (the turret's base and barrel, the
    rocket's fins, a damage flash tinting a sprite), as does the health bar,
    whose thickness is clamped against the resolution instead. Text that *is*
    world content rendered en masse on purpose stays too — the showcase's
    label-storm stress layer.

**Settings menu** (`src/core/ui/settingsMenu.js`): a scene-independent overlay
with resolution presets, fullscreen, aspect mode and a Paused row, toggled with
O. Every example mounts one (`new SettingsMenu(game)`); the instance registers
itself as `game.settings`, which is how scene UI reaches it — a scene-JSON
button with `"action": "settings"` ends up calling `game.settings.open()`
(`Scene.#runButtonAction`; other action names go to the scene config's
`onAction` hook, and `onClick` scene switches log failures instead of rejecting
unhandled). It registers in `game.overlays`, drawn by `game.drawOverlays()`
after the scene's UI each frame — a game that replaces the engine loop (doner)
must call `drawOverlays()` itself. Its pointer *and keyboard* listeners sit on
`window` in the capture phase so that, while open, input never reaches scene
UI, document-level handlers or the game's key bindings underneath; key
*releases* pass through on purpose so a key held when the menu opened still
releases in `KeyStates`. Resolution presets are compared structurally
(`sameResolution`), so `{width, height}` objects cycle correctly.

**Pause** (`game.paused`): a plain flag the engine loop honours — while set,
no physics, entity or camera updates run, but the frame is still drawn, so the
frozen game stays visible under overlays. The settings menu's Paused row
toggles it; opening the menu pauses only if the game opts in with
`new SettingsMenu(game, { pauseWhenOpen: true })`, which restores the previous
pause state on close. A game that replaces the engine loop honours the flag
itself (doner gates `donerGame.update` on it).

Display changes (ResizeObserver, `fullscreenchange`, DPR via `matchMedia`) are
coalesced and applied at the top of a frame, never mid-draw. `game.resize()`
drops no-op changes, which also breaks the feedback loop a ResizeObserver would
otherwise form with the `canvas.width` the engine sets. Example pages therefore
give the canvas an explicit CSS size and let the engine letterbox internally,
rather than using `object-fit: contain`. `game.onResize(fn)` and the scene
config's `onResize` hook notify game code that lays out its own HUD.

`game.destroy()` is the full teardown and must leave nothing global behind:
display listeners, overlays (first, since they unregister their own key
bindings), `KeyStates` and `SoundManager` document listeners, playing audio,
the current scene, and the renderer's GPU resources. Anything that attaches
to `window` or `document` keeps a stable reference to its handler so it can
be removed again — binding inline at `addEventListener` is unremovable, which
is how the input listeners used to outlive every game that created them.

### Actors (`src/actors/`)

Game-specific entities extending Entity:
- `Player` / `TopDownPlayer` - Player characters (name must be 'Player' for triggers/camera)
- `Bee` - Enemy that chases player
- `Turret` - Static enemy that shoots rockets (has line-of-sight check)
- `Rocket` - Projectile extending Projectile base class
- `Platform`, `MovingPlatform`, `Coin`, `Trigger`

### Constraints (`src/constraints/`)

- `Health` - HP, damage, invulnerability, death callbacks
- `Attack` - Melee attack with cooldown, hit detection
- `KeyboardControl` - Input handling, movement (use `verticalMovement: true` for top-down)
- `Debug` - Visual debugging for entities

### Collision Categories (`src/core/constants.js`)

```javascript
CollisionCategories = {
  default: 0x0001,    // Used by Platform (walls)
  player: 0x0002,
  platform: 0x0004,
  enemy: 0x0010,
  projectile: 0x0080
}
```

Note: Platform doesn't set a category, so it uses `default`. Projectiles must collide with `default` to hit walls.

## Key Patterns

### Creating New Actors

1. Extend `Entity` (or `Projectile` for projectiles)
2. Set `name` property (use 'Player' if it should trigger level completion/camera follow)
3. Add constraints in constructor
4. Register in example's `main.js`: `game.registerActor('ActorName', ActorClass)`
5. Add prefab in level JSON
6. Draw the actor itself through `game.renderer`; draw anything *about* it —
   ranges, markers, readouts — through `game.worldOverlay`, so annotations
   stay sharp at any world render resolution (see the viewport section)

### FPS-Independent Timing

All timers must use deltaTime (seconds), not frame counts:
```javascript
// Good
this.cooldown -= deltaTime;
if (this.cooldown <= 0) { ... }

// Bad (frame-dependent)
this.cooldownFrames--;
if (this.cooldownFrames === 0) { ... }
```

Movement should use velocity (px/s), not forces, for FPS independence;
`applyImpulse` is for instantaneous kicks like knockback:
```javascript
// Steady movement: set velocity, accelerating by px/s per second
body.setVelocity({ x: body.velocity.x + accel * deltaTime, y: body.velocity.y });

// One-off kick: an instantaneous velocity change in px/s
body.applyImpulse({ x: -300, y: -150 });
```

### Dynamic Entity Creation

When creating entities outside of scene loading (like projectiles):
- The `body.entity` link is set automatically in Entity constructor
- Create the body through the world, then add it to `game.entities` and the
  simulation manually. `createBox`/`createCircle` build a body but do not
  simulate it until `add`:
```javascript
const body = game.physics.createBox({ x, y, width: 24, height: 8, frictionAir: 0 });
const entity = new MyEntity(body, sprite, game, options);
game.entities.add(entity);
game.physics.add(body);
```

### Line-of-Sight Checks

Use `physics.raycast` for visibility checks. The filter narrows candidates
before the test, so it is a cost saver as well as a predicate:
```javascript
const blockers = game.physics.raycast(start, target,
  (body) => body.isStatic && body.entity?.name === 'Platform');
const hasLineOfSight = blockers.length === 0;
```

## Examples Structure

Each example in `src/examples/<name>/`:
- `main.js` - Entry point, registers actors and scenes
- `index.html` - HTML page
- `scenes/*.json` - Level/menu definitions
- `assets/` - Sprites, sounds, music

Must be added to `vite.config.js`:
- Add to `rollupOptions.input`
- Add sprite generation in `assetsPlugin.buildStart`
- Add to the `writeBundle` asset-copy list if it has an `assets/` directory

Scenes that draw something which is not an entity (bulk effects, directors)
use the `onUpdate(deltaTime)` and `onDraw(deltaTime)` scene-config hooks
alongside `onEnter`/`onExit`. `onDraw` runs inside the world pass with the
camera applied, after entities.

### Renderer showcase (`src/examples/showcase/`)

Doubles as the renderer comparison harness (see ROADMAP.md). It reports
`primitives` against `drawCalls` on screen, which is where the backends
visibly differ. Seven toggleable layers, in HUD order: drifting motes
(`moteField.js`), the reed bank (`reedBed.js`), the text storm
(`labelStorm.js`), the harbour chart (`minimap.js`), rain (`rainEmitter.js`),
lights (`lanterns.js`) and bloom. `backdrop.js` and `lighthouse.js` are
always-on scenery; `showcase.js` is the director and `hud.js` the overlay.

Clipping is covered in both spaces: the lighthouse beam (`lighthouse.js`)
stacks clips under one transform in *world* space, and the harbour chart
(`minimap.js`) nests a rounded panel clip, a rotation and a rect clip in
*screen* space. The lamp rotates about a vertical axis and the beam is
projected for a side view whose eye level is `horizonY` (foreshortened,
widened and brightened toward the viewer, converging on the horizon and drawn
behind the tower when pointing away); the chart plots the same horizontal
angle top-down, so the two agree.
The beam's gradient descriptor is built once and its per-frame intensity
goes through `globalAlpha` — per-frame stop strings would re-bake the WebGL
gradient lookup texture every frame.

Rain (`rainEmitter.js`) is the `particles` layer: one packed buffer per
frame, positions as pure functions of time so frame rate cannot change what
is on screen, and a self-imposed cap on backends without the capability.

Lanterns (`lanterns.js`) are the `lights` layer, and the showcase's sharpest
backend contrast: on WebGL the harbour is genuinely dark and the lamps carve
it open, on Canvas it stays evenly lit. The lighthouse beam pre-compensates
for the ambient it is about to be multiplied by — it is geometry in the world
pass, not a light, and a point light cannot express a shaft.

`backdrop.js` owns the three bands everything else is positioned against —
sky above `horizonY`, water down to `shoreY`, near bank below — and it draws
in two calls, not one: `drawDistance()` before the reeds and `drawBank()`
after them, because the reeds stand out in the shallows and the near shore
has to occlude their feet. The water carries its own skyglow lights; under a
night ambient no plausible sea colour survives the multiply, so lighting it
is the only honest way to keep it from reading as more sky.

Two scene-grounding rules worth keeping: anything standing in the world needs
visible contact with a surface (the lanterns' posts are what stop them
floating, not their glow), and the beam's screen heading must be measured
against the *absolute* along-shore component and clamped — taking `atan2` of
the raw components swings the shaft vertical as it turns toward the camera,
which reads as a flat 2D rotation. The shaft fades out head-on and the lamp
flare takes over instead.

Two rules keep it a valid measurement:

- **Deterministic.** Layers are built from seeded RNG (`rng.js`) and the camera
  pans a fixed path instead of following a player, so both backends run the
  identical workload.
- **Unculled and unbatched by hand.** Layers submit every primitive every frame
  and avoid per-sprite `pushTransform` (reeds pivot by arithmetic instead), so
  the counters describe the backend's batching rather than the example's.

## Level JSON Structure

Scene JSON is **validated strictly** by `SceneLoader` before `Scene` touches
it (`SceneManager.loadScene` calls `loader.load`). It throws
`SceneValidationError` naming the scene and the path to the bad field, rather
than letting a mistake surface as a half-built level, a per-object console
error, or — as with the platformer's Settings button — a control that simply
does nothing. Checks cover the format (`version` must be the number `1`,
known `type`), every cross-reference (object→prefab, prefab→spritesheet and
→registered actor, defaultAnimation→that sheet's animations,
button `onClick`→registered scene), and **unknown keys**, which are errors:
silently ignoring a field the author believed in is the failure being
designed against. It applies the format's defaults (object size 32) and
returns the same shape `Scene` already reads — there is deliberately no
intermediate representation, so there is only one scene format to know.

Adding a field to the format means adding it to the key lists at the top of
`sceneLoader.js`, or it will be rejected. `test/sceneLoader.test.js`
validates every scene the repo ships, so a schema change that breaks an
example fails there.

```javascript
{
  "version": 1,                                 // the number 1, not "1.0"
  "world": { "gravity": { "x": 0, "y": 0 } },  // y:0 for top-down
  "prefabs": {
    "enemy": {
      "actor": "Turret",      // Must match registered actor name
      "spritesheet": "enemy", // Optional
      "physics": { "bodyType": "static" }
    }
  },
  "layers": [{
    "objects": [{
      "prefab": "enemy",
      "x": 100, "y": 100,
      "width": 32, "height": 32,
      "properties": { ... }  // Passed to actor constructor as options
    }]
  }]
}
```

## Common Issues

1. **Entity collisions not working**: Ensure `body.entity` is set (done automatically in Entity constructor)
2. **Projectiles passing through walls**: Check collision mask uses `CollisionCategories.default` not `platform`
3. **Camera not following player**: Entity's `name` property must be exactly `'Player'`
4. **Enemies shooting through walls**: Add line-of-sight check using `game.physics.raycast`
5. **Movement speed varies with FPS**: Use velocity-based movement, not force-based
