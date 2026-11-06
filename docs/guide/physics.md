# Physics

The simulation runs on Rapier 2D, compiled to WebAssembly, behind an engine-owned interface. Game code uses `game.physics` and the body objects it returns. The [physics API reference](../reference/physics) lists every method.

Call `initPhysics()` once before constructing the engine. It fetches and compiles the WASM module. Pass `{ dimensions: 3 }` for a 3D world; the two solvers are separate modules, so a game only downloads the one it uses. See [Three dimensions](../reference/physics#three-dimensions).

```javascript
import { initPhysics } from 'm2d-engine/core/physics/index.js';

await initPhysics();
const game = new M2D(canvas, { width: 1280, height: 720 });
```

## Body types

<Demo name="bodies">
Static walls and a tilted ramp, a stack of dynamic boxes, a kinematic platform carrying a box and a character body that walks and turns around. Click inside the canvas to drop a ball.
</Demo>

| Type | Behaviour |
| --- | --- |
| `static` | Never moves. Walls, floors, ramps |
| `dynamic` | Moved by the solver. Responds to gravity, contacts and impulses |
| `kinematic` | Moved by game code through velocity or a target position. Pushes dynamic bodies and carries anything standing on it |
| `character` | Moved by a character controller. Takes velocity like a dynamic body, slides along walls, never rotates, snaps to the ground, rides kinematic platforms and pushes dynamic bodies |

Set the type in a prefab's `physics` block or on the body with `body.bodyType = 'kinematic'`.

### Kinematic bodies

A kinematic body moves at the velocity you set. The engine moves it by that velocity once per step and the solver derives contact behaviour from the move, so riders are carried and obstacles are pushed. `setNextPosition` places the body exactly at a point on the next step and still carries riders. `setPosition` teleports it and carries nobody. The `PathFollow` constraint drives the kinematic platform in the demo.

### Character bodies

A character body is for players and other things that walk. Game code sets its velocity. Gravity and `frictionAir` apply to it and `applyImpulse` works. On each step a controller turns that velocity into a collision-aware move. It reports `body.grounded`, which is `null` on every other type.

Characters have no surface friction. Stopping is the mover's job, and `KeyboardControl` brakes a grounded character when no key is held.

A character must fit where it walks. The controller keeps a small gap on each side, so a body as wide as its corridor jams. The maze example uses a 26 px circle in 32 px corridors.

Not every player should be a character. The platformer example's player is a dynamic box, because tumbling under friction is part of its movement.

## Units

| Quantity | Unit |
| --- | --- |
| Distance | pixels (world units) |
| Time | seconds |
| Velocity | px/s |
| Gravity | px/s². `{ x: 0, y: 1000 }` is a normal downward pull and the default. A level scene sets it through `world.gravity`, code through `game.physics.setGravity`, which also wakes sleeping bodies |
| Impulse | px·mass/s. Multiply by `body.mass` for a velocity change independent of weight |
| Angle | radians |

No solver unit appears outside the physics module.

## Fixed timestep

The simulation advances in ticks of a fixed length, 1/60 s by default, regardless of frame rate. Each frame the engine spends the elapsed game time in whole ticks and carries the remainder. At most `maxSubSteps` ticks run per frame. When a frame owes more than that, the rest is dropped, so a long stall cannot cascade.

Physics steps once per tick, after every entity's `fixedUpdate`, so gameplay and the solver always see the same `dt` and run in the same order. Entity `update(deltaTime)` runs per frame for presentation. See [Time, ticks and timers](./time#the-simulation-tick).

Because a 144 Hz display shows several frames per physics step, drawing the raw body position would stair-step. `renderPosition` and `renderAngle` blend between the last two steps and are what `draw` should use. Direct moves through `setPosition`, `setAngle` and `translate` reset the blend, so a teleport is never smeared.

The `fixedTimestep`, `maxSubSteps`, `timeScale` and `interpolatePhysics` [engine options](../reference/engine-options) control this. The first three live on `game.time`; the physics world reads them from there.

## Fast movers

Set `body.bullet = true` on anything fast enough to cross a thin wall in one step. It enables continuous collision detection. `Projectile` sets it.

## Collision events

The engine routes contact events to the entities involved. Implement `onCollisionStart(other)` and `onCollisionEnd(other)` on an actor or a constraint. `other` is the other body, and `other.entity` is its entity when it has one.

```javascript
onCollisionStart(other) {
  super.onCollisionStart(other);
  if (other.entity?.name === 'Player') this.collect();
}
```

Static bodies that are not sensors do not report contacts with each other.

## Queries

| Query | Answers |
| --- | --- |
| `contactsWith(body, filter)` | Which bodies touch this one |
| `surfacesWith(body, filter)` | The same, with the contact normal and gap for each |
| `overlaps(shape, filter)` | Which bodies intersect a circle or box that is not a body |
| `queryPoint(point, filter)` | Which bodies contain a point. Exact, for hit testing |
| `raycast(start, end, filter)` | Every body crossing a segment, nearest first, with hit point, normal and distance |

The optional `filter` is a function that receives a body and returns whether to include it. It runs before the exact test, so it saves work as well as narrowing results.

Prefer a contact normal over comparing positions when telling a floor from a wall. `Entity.isOnGround()` looks for a normal pointing down.

```javascript
// Line of sight: anything static between the turret and the player blocks it.
const blockers = game.physics.raycast(this.position, player.position,
  (body) => body.bodyType === 'static');
const canSee = blockers.length === 0;

// Melee reach: everything within 40 px, as a one-shot question.
const hits = game.physics.overlaps({ x: pos.x, y: pos.y, radius: 40 },
  (body) => body.collisionFilter.category === CollisionCategories.enemy);
```

Queries see a body as soon as it is added or moved, without waiting for a step. The character controller does not, so a body spawned on top of a character is missed for one step.

## Demo source

Two actors draw their bodies by type. The scene is built in code and loaded through a `fetch` function like any JSON scene.

<<< @/demos/bodies.js
