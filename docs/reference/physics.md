# Physics API

`game.physics` is the physics world. Bodies are the objects it creates. The contract is implemented over Rapier, in two dimensions by default and in three on request, and `packages/engine/test/physics.test.js` and `physics3d.test.js` are the contract written as tests.

Units are pixels and seconds throughout. The rest of this page describes the 2D world, where rotation is an angle in radians; see [Three dimensions](#three-dimensions) for what changes.

## Initialization

```javascript
import { initPhysics } from 'm2d-engine/core/physics/index.js';
await initPhysics();
```

Compiles the WASM module. Must resolve before an `M2D` instance is constructed. Calling it again for the same dimension does nothing.

`initPhysics({ dimensions: 3 })` loads the 3D solver instead. The two are separate WASM modules and separate worlds, so a game only fetches the one it plays, and a body in one can never meet a body in the other.

## Creating bodies

```javascript
const box = game.physics.createBox({ x, y, width, height, bodyType: 'dynamic' });
const ball = game.physics.createCircle({ x, y, radius, restitution: 0.6 });
const pill = game.physics.createCapsule({ x, y, width, height, bodyType: 'character' });
game.physics.add(box);
```

A created body is not simulated until `add`. All three creators accept the same spec after their shape fields. A prefab's `physics` block reaches these creators through `game.createEntity`, which picks the creator from `shape` and passes only `bodyType`, `angle`, `lockRotation`, `isSensor`, `friction`, `frictionAir` and `restitution`. On that path a `friction` or `frictionAir` of `0` becomes the default.

| Spec key | Default | Meaning |
| --- | --- | --- |
| `x`, `y` | | Centre position |
| `width`, `height` | | Box or capsule size. A capsule's `width` is its diameter and `height` is tip to tip |
| `radius` | | Circle radius |
| `angle` | `0` | Initial rotation |
| `bodyType` | `'dynamic'` | `static`, `dynamic`, `kinematic` or `character` |
| `lockRotation` | `false` | Prevent the solver from rotating the body |
| `isSensor` | `false` | Report contacts without a physical response |
| `friction` | `0.1` | Surface friction |
| `frictionAir` | `0.01` | Fraction of velocity lost per 1/60 s |
| `restitution` | `0` | Bounciness |
| `density` | `0.001` | Mass per unit area. A 32 by 32 box weighs about 1. `setMass` overrides the resulting mass |
| `category` | `0x0001` | Collision category bit |
| `mask` | `0xFFFF` | Categories this body collides with |

## World methods

| Method | Meaning |
| --- | --- |
| `add(body)` | Insert a body into the simulation. Returns the body |
| `remove(body)` | Take a body out |
| `bodies` | Array copy of every added body |
| `clear()` | Remove every body |
| `reset()` | Remove every body and rebuild the world. Collision handlers and gravity are kept and the step accumulator is cleared |
| `destroy()` | Free the WASM world and drop the collision handlers |
| `setGravity({ x, y })`, `gravity` | Gravity in px/s². Setting it wakes every sleeping body |
| `advance(elapsed)` | Spend `elapsed` seconds in fixed steps. Returns the number of steps taken. Physics only; the engine loop steps physics from `game.fixedUpdate` instead, once per simulation tick |
| `step(dt)` | Run one step of `dt` seconds. `game.fixedUpdate` calls it once per tick |
| `interpolation` | Where the current frame sits between the last two steps, 0 to 1. Always 1 when `interpolate` is off |
| `setCollisionHandlers({ onStart, onEnd })` | Install contact callbacks, replacing the current ones. Each receives the two bodies. The engine installs handlers that call the entities' `onCollisionStart` and `onCollisionEnd`, and reinstalls them in `start()` and `reset()` |
| `fixedTimestep`, `maxSubSteps`, `timeScale`, `accumulator`, `interpolate` | The stepping settings. Inside the engine the first four are `game.time`'s; writing either side changes both |

## Queries

Each query takes an optional `filter(body) => boolean` that runs before the exact test.

| Method | Returns |
| --- | --- |
| `contactsWith(body, filter)` | Array of bodies touching `body`, with a small tolerance so resting contact counts |
| `surfacesWith(body, filter)` | Array of `{ body, normal, distance }`. `normal` points from `body` toward the other body. `distance` is negative while they overlap |
| `overlaps(shape, filter)` | Array of bodies intersecting `shape`, where `shape` is `{ x, y, radius }` or `{ x, y, width, height, angle }` |
| `queryPoint(point, filter)` | Array of bodies whose shape contains `{ x, y }`. Exact, with no tolerance |
| `raycast(start, end, filter)` | Array of `{ body, point, normal, distance }` for every body the segment crosses, nearest first |

Bodies added or moved by game code since the last step are included in query results. The character controller's own collision checks do not see a new body until the step after it was added, so spawn with clearance around characters.

## Body properties

| Property | Access | Meaning |
| --- | --- | --- |
| `position` | read | `{ x, y }` |
| `velocity` | read | `{ x, y }` in px/s |
| `angle` | read | Radians |
| `bounds` | read | Tight axis-aligned box `{ min: { x, y }, max: { x, y } }`, rotation-aware |
| `size` | read | `{ x, y }` of the shape's box |
| `mass` | read | |
| `shape` | read | `'box'`, `'circle'` or `'capsule'` |
| `entity` | read/write | The entity that owns the body. Set by `Entity`'s constructor |
| `renderPosition`, `renderAngle`, `renderBounds` | read | Blended between the last two steps for drawing |
| `grounded` | read | For character bodies, whether the controller found ground. `null` otherwise |
| `groundBody` | read | For character bodies, the body stood on. `null` otherwise |
| `bodyType` | read/write | `static`, `dynamic`, `kinematic` or `character`. Changing to or from `character` while the body is in a world throws. Remove it first |
| `isSensor` | read/write | |
| `bullet` | read/write | Continuous collision detection |
| `friction`, `frictionAir`, `restitution` | read/write | |
| `collisionFilter` | read | `{ category, mask }`. Change it with `setCollisionFilter` |

## Body methods

| Method | Meaning |
| --- | --- |
| `setPosition({ x, y })` | Teleport. Resets interpolation and carries no riders |
| `setAngle(angle)` | Teleport rotation |
| `translate({ x, y })` | Teleport by an offset |
| `angularVelocity`, `setAngularVelocity(omega)` | Spin in rad/s. On a dynamic body the solver keeps integrating it, so contacts still knock the heading around between writes |
| `setVelocity({ x, y })` | Set velocity. For kinematic and character bodies this is the movement command |
| `setNextPosition({ x, y })` | Kinematic only. Move to the point on the next step, carrying riders |
| `setNextAngle(angle)` | Kinematic only |
| `setMass(mass)` | Override the mass derived from density |
| `applyImpulse({ x, y })` | Instantaneous momentum change in px·mass/s. Dynamic and character bodies only |
| `setCollisionFilter({ category, mask })` | Change collision filtering |

Returned objects such as `position` and `collisionFilter` are snapshots. Mutating them has no effect.

## Three dimensions

`initPhysics({ dimensions: 3 })` and `createPhysicsWorld({ dimensions: 3 })` build a world on Rapier 3D. It keeps the contract above — the same body types, the same material keys, the same queries, the same fixed step — and differs in the four places a dimension shows.

**Up is -y, as it is in 2D.** This is worth saying because most 3D content disagrees: glTF is y-up, and so is Rapier's own documentation. The engine's screen coordinates grow downward and its gravity, ground normals and character controller are written against that, so a 3D world keeps the convention rather than flipping it halfway down the stack. A loader for y-up content converts at the boundary, where one place has to know. Default gravity is `{ x: 0, y: 1000, z: 0 }`.

**Shapes.**

| Creator | Spec |
| --- | --- |
| `createBox` | `x`, `y`, `z`, `width`, `height`, `depth` |
| `createSphere` | `x`, `y`, `z`, `radius` |
| `createCapsule` | `x`, `y`, `z`, `radius`, `height` tip to tip, standing on the up axis |
| `createCylinder` | `x`, `y`, `z`, `radius`, `height` |

**Rotation is a quaternion**, `{ x, y, z, w }` — the form Rapier reads and writes, so nothing converts at the boundary. The scalar `angle` has no meaning in three dimensions and is replaced:

| 2D | 3D |
| --- | --- |
| `body.angle`, `setAngle` | `body.rotation`, `setRotation` |
| `body.renderAngle` | `body.renderRotation`, blended with `Quat.slerp` |
| `setNextAngle` | `setNextRotation` |
| `angularVelocity` as a number | `angularVelocity` as a vector |

`Vec3` and `Quat` in `m2d-engine/core/math.js` are the helpers for building these. `Quat.fromAxisAngle` is how game code says a rotation; Euler angles are deliberately not offered.

**Positions and velocities are three-component.** `z` defaults to `0` wherever it is omitted, so 2D-shaped calls still mean something.

Not yet implemented, each because it wants a game to tune against rather than more code: a character riding a kinematic platform, and `snapshot`/`restore`.
