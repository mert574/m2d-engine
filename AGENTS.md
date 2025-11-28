# M2D Engine - Claude Code Context

## Project Overview

M2D is a lightweight 2D game engine using Matter.js for physics and Canvas for rendering. It follows an entity-constraint architecture similar to ECS.

## Quick Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (port 3000)
npm run build        # Build to /docs
node scripts/generateSprites.js <example>  # Generate sprites for an example
```

## Architecture

### Core Classes (`src/core/`)

- **Entity** (`entity.js`) - Base class for all game objects. Has body, sprite, constraints. The `body.entity` link is set in constructor for collision detection.
- **Constraint** (`constraint.js`) - Reusable behaviors attached to entities (health, attack, movement, debug)
- **Projectile** (`projectile.js`) - Base class for projectiles (rockets, bullets). Handles movement, lifetime, collision, damage.
- **Scene** (`scene.js`) - Manages level loading, entities, UI. Checks `entity.name === 'Player'` for camera follow.
- **M2D** (`m2d.js`) - Main engine class. Collision handlers are set up in `setupCollisionHandlers()`.

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
