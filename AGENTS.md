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
