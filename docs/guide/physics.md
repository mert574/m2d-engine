# Physics

The simulation is a fixed-timestep world on **Rapier 2D** (WASM — accurate
solver, stable stacking, continuous collision detection), hidden behind a
solver-agnostic contract: engine, actor and game code use `game.physics` (the
world) and the `PhysicsBody` handles it returns, never the solver directly.

Call `await initPhysics()` once before constructing the engine — it fetches
and compiles Rapier's WASM module, and no world can exist until it resolves.

```javascript
import { initPhysics } from 'm2d-engine/core/physics/index.js';

await initPhysics();
const game = new M2D(canvas, { width: 1280, height: 720 });
```

## Units are pixels and seconds

No solver unit (steps, meters, force constants) appears outside the physics
module:

- Velocity is **px/s**
- Gravity is **px/s²** — `{ x: 0, y: 1000 }` is normal down
- Impulses are **px·mass/s**

## Body types

Set per prefab in [scene JSON](./scenes#physics-properties) or on a body directly:

| Type | Behaviour |
| --- | --- |
| `static` | Never moves |
| `dynamic` | Driven by the solver |
| `kinematic` | Driven by game code, but still pushes and carries what it touches — moving platforms |
| `character` | For players: velocity-driven like a dynamic body, but moved by a character controller that slides along walls, never rotates, snaps to the ground and rides moving platforms |

## Fast movers

Fast movers should set `body.bullet = true` (projectiles do): that enables
continuous collision detection, so they cannot tunnel through thin walls.

## Render interpolation

Because the solver runs slower than a fast display refreshes, several frames
share one physics position and motion would visibly stair-step. The engine
fixes this with render interpolation: draw using `entity.renderPosition` /
`entity.renderAngle` (or `body.renderPosition` / `body.renderAngle`), which
blend between the last two steps.

Use `position` for everything else — collision checks, AI, queries and
distances all want the true current state. Direct moves (`setPosition`,
`setAngle`, `translate`) reset the baseline, so a teleport is never smeared
across frames.
