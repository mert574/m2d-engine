# M2D Engine - Claude Code Context

## Project Overview

M2D is a lightweight 2D game engine using Matter.js for physics and WebGL2 (with a Canvas 2D fallback) for rendering. It follows an entity-constraint architecture similar to ECS.

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
- **M2D** (`m2d.js`) - Main engine class. Collision handlers are set up in `setupCollisionHandlers()`.

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
  backends advertise *optional* features through `renderer.capabilities`
  (`tint`, `blendModes`, `particles`, `lights`, `postEffects`), queried with
  `renderer.supports(name)`. The defaults live in `OPTIONAL_CAPABILITIES` in
  `baseRenderer.js` and are all false; a backend overrides what it implements.
  A backend that lacks an optional feature **ignores** the option rather than
  throwing, so a scene written for the GPU still runs on Canvas. Implemented so
  far: `tint` (WebGL only — it folds into the vertex colour the texture shader
  already multiplies, so per-sprite tints cost no extra draw calls) and
  `blendModes` (both backends — `gl.blendFunc` keyed into the batch state,
  `globalCompositeOperation` on Canvas), and `particles` (`drawParticles` with
  a packed `Float32Array`, `PARTICLE_STRIDE` floats per particle; WebGL
  batches it with per-particle colour, `BaseRenderer` supplies a
  sprite-per-particle fallback so the call works everywhere and the flag
  means "fast and coloured"), `lights` and `postEffects` (WebGL only, both in
  `webgl/effectsPass.js`). Lighting is switched on by `setAmbientLight`, not
  by submitting lights: with no ambient the light map would be white and
  there would be nothing for lights to do, so a null ambient skips the pass
  entirely and costs nothing. When either is active the world pass is
  redirected into a stencil-backed offscreen scene target — the stencil
  matters, or clipping silently stops working there — and composited in
  `endFrame`; the screen pass always goes straight to the default
  framebuffer so UI is neither dimmed nor bloomed.
  Optional features exist because the backends are genuinely unalike — additive
  blending and post effects are nearly free on a GPU and expensive or
  impossible on Canvas 2D — so callers query and degrade instead of every
  backend being held to the slowest one. Do not confuse this with the
  conformance harness's `capabilities` field, which gates *mandatory* contract
  tests while a backend is still being built.
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
headless Chromium) because Node has no WebGL; the WebGL2 conformance file lives
in the browser project with every capability flag `false` until its feature
lands. Two contract details are
easy to get wrong and are pinned by tests: partial `drawArc` fills produce
circular **segments** (chord-closed), not pie sectors; and the frame order is
world pass then screen pass.

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

Movement should use velocity, not force, for FPS independence:
```javascript
// Good - velocity-based
Matter.Body.setVelocity(body, { x: velocity.x + accel * deltaTime, y: velocity.y });

// Bad - force is frame-rate dependent
Matter.Body.applyForce(body, pos, force);
```

### Dynamic Entity Creation

When creating entities outside of scene loading (like projectiles):
- The `body.entity` link is set automatically in Entity constructor
- Add to `game.entities` and Matter world manually:
```javascript
const entity = new MyEntity(body, sprite, game, options);
game.entities.add(entity);
Matter.Composite.add(game.engine.world, body);
```

### Line-of-Sight Checks

Use Matter.Query.ray for visibility checks:
```javascript
const walls = bodies.filter(b => b.isStatic && b.entity?.name === 'Platform');
const collisions = Matter.Query.ray(walls, start, target);
const hasLineOfSight = collisions.length === 0;
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

```javascript
{
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
4. **Enemies shooting through walls**: Add line-of-sight check using `Matter.Query.ray`
5. **Movement speed varies with FPS**: Use velocity-based movement, not force-based
