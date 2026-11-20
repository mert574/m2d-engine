# Built-in constraints

Constraints from `m2d-engine/constraints`. Attach one with `entity.addConstraint(name, new Constraint(entity, options))`.

`KeyboardControl` and `Interactive` bind their handlers to the entity, so `this` is the entity inside them. Other constraints call handlers as methods of the constraint, so `this` is the constraint. Use arrow functions there.

`Health`, `Attack`, `ContactDamage`, `KeyboardControl`, `Chase` and `PathFollow` do their work in `fixedUpdate`, once per simulation tick; so do the kit's genre controllers ([`m2d-kit/controls`](./kit#m2d-kit-controls)). `Hover` and `DamageFlash` are presentation and run in the per-frame `update`. `Chase` draws its wander targets from `game.rng`.

Options marked with an asterisk treat `0` as unset and fall back to the default.

## Attaching one from a scene

A constraint can also be declared in a scene file instead of in an actor, on a prefab or on a single placed object. Every constraint on this page resolves by name without registration; a game's own is registered first, the way actors are:

```javascript
import { Teleport } from './teleport.js';

game.registerConstraint('Teleport', Teleport);
```

```json
"prefabs": {
  "guard": {
    "actor": "Guard",
    "constraints": { "chase": { "type": "Chase", "params": { "speed": 80 } } }
  }
}
```

What a scene may set is the class's `static params`, the constraint's data. Callbacks are code and are not in `params`, so an actor still wires those up. See [Scene format](./scene-format#constraints) for the block, and [Entities](../guide/entities#declaring-constraints-in-a-scene) for overriding and retuning.

Writing a constraint of your own? Give it a `static params` of schema descriptors, one per tunable, named after the field it sets. A tunable missing from `params` cannot be set from a scene, and tooling cannot see it. Record a default as `initial`, never as a schema `default`: an override that filled in defaults would reset every param the author did not mention. Override `configure(params)` when a value is not stored as given: when another field is derived from it, or a map should merge instead of replace.

Any constraint can be `suspended`: while it is, its entity skips its `fixedUpdate` and `update` (it still draws), and nothing it was doing is lost. A stun, a repel or a conversation holds an actor this way, instead of re-implementing the entity's tick to leave one constraint out. Hollow Grove's warded wisp suspends its `chase`; its walker, talking, suspends everything but `abilities` and `health` for the tick.

## Health

`constraints/health.js`. Hit points, invulnerability after a hit and a health bar above the entity.

| Option | Default | Meaning |
| --- | --- | --- |
| `maxHealth` * | `100` | |
| `invulnerableDuration` * | `1` | Seconds after a hit during which damage is ignored |
| `onDamage(amount)` | | Called after damage is applied |
| `onDeath()` | | Called when health reaches zero. The entity's `dead` flag is set first |
| `whenDead` * | `'keep'` | `remove` takes the entity out of the world at zero health (after `onDeath` ran), so a prefab-declared mob needs no code; `keep` leaves it for the actor — a player that respawns, a door that breaks open |
| `showBar` | `true` | Draw the bar. Even when on, the bar only appears while health is missing |

Methods: `takeDamage(amount)`, `heal(amount)`, `isInvulnerable()`. Properties: `currentHealth`, `healthPercentage`, `isAlive`.

`takeDamage` does nothing while invulnerable. When health reaches zero the entity's `dead` flag is set, then `onDeath` runs. The bar is hidden at full health and once the entity is dead, and turns red at 30 health.

## Attack

`startAttack(direction)` takes `1` or `-1` for a side-view swing, or any other number as an angle in radians, for a top-down or 3/4 game where left and right cannot reach what is above or below. The swing is `arc` radians wide (default π, the side view's half circle; 2π hits everything in range) centred on that direction. `knockback` is the impulse along the swing, default the side view's fling; `0` disables it.

`targets` names the collision layers a swing hits. Unset, it hits anything with `Health` that is not a player's avatar — a swing at the monsters that never lands on another player; an enemy striking the players names their layer (`targets: ['player']`).

`combo` makes the attack a chain: an array of steps (`{ damage, knockback, arc }`, each overriding the base), advanced when a swing starts within `comboWindow` seconds (default 0.8) of the last one ending, and reset otherwise. The cooldown still gates every swing. `onStart(step)` fires per swing and `onHit(entity, step)` per target a swing lands on; a finisher that launches pops the target's `elevation` there. Ash Row's three-punch chain and its sweep kick (a second `Attack` under its own constraint name) are the worked example.

`windup` telegraphs the swing: `startAttack` commits the direction and waits that many frames before the swing itself — the hit check, the animation, `onStart` — happens, so the blow is dodgeable. `cancelWindup()` drops a telegraph without swinging (a stun, a death). `isWindingUp` and `windupTime` are replicated, and the windup's own `params` arrive on both sides, so a client draws the telegraph from the same numbers the server swings by; in debug view the committed arc closes in as the windup runs out.

`constraints/attack.js`. A melee attack that damages enemies within a half circle in the facing direction and knocks them back.

| Option | Default | Meaning |
| --- | --- | --- |
| `damage` * | `10` | |
| `range` * | `40` | Radius in px |
| `cooldown` * | `30` | In 60ths of a second |
| `windup` * | `0` | Telegraph before the swing, in 60ths of a second; the direction commits when it starts |
| `onStart()` | | Called when an attack begins |

Call `startAttack(direction)` with `1` or `-1`. It does nothing during the cooldown. Hits are found once, at the start of the attack, with an `overlaps` query. Targets are bodies with the `enemy` collision category and a `Health` constraint that is not invulnerable. Each target takes `damage` and a fixed knockback impulse. The attack sets the entity's animation to `attackRight` or `attackLeft` and leaves it there. The built-in players switch back to `idle` from their movement handler.

The attack draws nothing of its own: what a swing looks like depends on the game and its perspective, so a game draws one with a constraint that hooks `onStart`. The kit ships one, `AttackSwing` in `m2d-kit/effects` ( with a matching `HitBurst` for taking damage). The range ring is drawn when the debug overlay is on.

## PointerMove

`constraints/pointerMove.js`. Click to move: a press of `button` (default the primary) sets a ground destination from the tick's input snapshot, and the entity walks there at `speed` and stops within `arrive`. With a [navmesh](./navigation) loaded the walk follows a route around the walls — `agent` names the profile (the project's only one when unset) — and a click that is on a wall, walled in, or whose route is longer than `maxPathLength` does nothing at all; without one the walk is the straight line. `goTo(x, y)` (returns whether the walk was taken) and `stop()` from code, `moving`, `destination` and `path` to read; `onArrive()` and `onMove(dx, dy)` hooks. Under a projection the pointer is already on the ground, so the same code moves an isometric hero.

## Footsteps

`constraints/footsteps.js`. Plays the next of `sounds` (sound keys) every `stride` world units of ground travel, cycling; pauses in the air (an entity with `isAirborne`, or `isOnGround()` false) and below `minSpeed`; plays a step on landing unless `landing: false`. `onStep(index)` is called with each step. Simulation: the stride is integrated in `fixedUpdate` from the body's velocity, along the ground (x and y in 2D, x and z in 3D).

## Abilities

`constraints/abilities.js`. A set of `abilities`, each `{ id, key, cooldown, cast, locked, label, icon, color }`: on the key's press edge in the tick's input snapshot, if not `locked` and not cooling, `cast(entity, ability)` runs and the cooldown (seconds) starts. `unlock(id)`, `lock(id)`, `cast(id)` and `get(id)` from code; `canCast()` is an extra gate (not while talking); `onCast(ability, ok)` reports every press, with `ok` false for a locked or cooling one. `UIAbilityBar` draws the set.

## ProximityPrompt

`constraints/proximityPrompt.js`. Draws `text` (a string or a function) over the entity through the world overlay while the player is within `radius`; `isNear` is the same test for code. The `Npc` actor carries one.

## ContactDamage

`constraints/contactDamage.js`. Damages entities that touch this one and pushes them away. Entities that also have `ContactDamage` are ignored, so enemies do not hurt each other.

| Option | Default | Meaning |
| --- | --- | --- |
| `damage` | `33` | Applied on contact and repeatedly while touching, subject to the target's invulnerability |
| `knockbackStrength` | `720` | Velocity given to the target, px/s, directed away |
| `stunDuration` | `0.5` | Seconds this entity reports `isStunned()` after hitting, if its body is dynamic |

## KeyboardControl

`constraints/keyboardControl.js`. Moves the entity from the keyboard, relative to whatever it stands on.

| Option | Default | Meaning |
| --- | --- | --- |
| `keys` | arrows, `Space`, `KeyX` | `{ left, right, up, down, jump, attack }` as key codes. Partial overrides are merged |
| `acceleration` * | `600` | px/s per second, in continuous mode |
| `deceleration` | `acceleration` | Braking for grounded character bodies with no input |
| `maxSpeed` * | `300` | px/s. Caps horizontal speed in continuous mode and is the speed in direct mode |
| `continuous` | `true` | `true` accelerates toward `maxSpeed`. `false` sets velocity to `maxSpeed` directly |
| `verticalMovement` | `true` | Read the up and down keys. Set `false` for a platformer |
| `onMove(dx, dy)` | | Every tick with the input direction |
| `onDirectionChange(direction)` | | When horizontal input is nonzero, with `1` or `-1` |
| `onJump()` | | Every tick the jump key is held |
| `onAttack()` | | Every tick the attack key is held |

Diagonal movement is normalized. Input pressing straight into a wall is dropped before normalizing. Keys are read from `entity.input`, the owning player's snapshot,, the state sampled for the tick.

`inputSpace: 'screen'` moves along the screen's axes through the scene's projection, so Up walks toward the top of an isometric view, and at a steady pace on screen: `maxSpeed` is then the on-screen speed, scaled on the ground so a walk up the view is no slower than one across it. Default `'world'`.

With `verticalMovement` on, `maxSpeed` caps the whole velocity vector, so a diagonal is no faster than a cardinal, and braking stops both axes. A side view caps only the run and leaves the vertical to gravity.

## Interactive

`constraints/interactive.js`. Makes the entity a pointer target. See [World hit testing](../guide/input#world-hit-testing).

| Option | Default | Meaning |
| --- | --- | --- |
| `hitArea` | `'body'` | The physics collider, or `{ width, height }` or `{ radius }` centred on the entity |
| `draggable` | `false` | Receive drag events |
| `follow` | `false` | Move the body with the pointer while dragging. Implies `draggable` |
| `priority` | `0` | Higher wins when hit areas overlap. Ties go to the most recently created entity |
| `cursor` | | CSS cursor while hovered |
| `consume` | `true` | Stop handled events from reaching entities underneath |
| `enabled` | `true` | |
| `onPointerDown`, `onPointerUp`, `onClick`, `onDoubleClick`, `onRightClick`, `onHover`, `onHoverEnd`, `onDragStart`, `onDrag`, `onDragEnd`, `onDrop`, `onScroll` | | Handlers receiving the event |

Properties: `isHovered`, `isDragging`, `grabOffset`. `setEnabled(false)` takes the entity out of hit testing without removing the constraint. A dead entity is skipped as well. Registers with the input system on construction and unregisters in `destroy()`, which `entity.destroy()` calls.

## Grabbable

`constraints/grabbable.js`. An `Interactive` that picks a dynamic body up with the pointer, carries it and flings it. Everything `Interactive` takes except `follow`, plus:

| Option | Default | Meaning |
| --- | --- | --- |
| `stiffness` | `18` | How hard the body is pulled toward the hand, per second of the distance left |
| `maxSpeed` | `0` | The fastest it may be hauled, px/s; 0 for no limit |
| `removable` | `false` | A right-click or long press takes the body out of the world |
| `removeSound` | | Played when one is removed: a key in `assets.sounds` |

The body is *steered*, not placed: it still collides on its way to the hand and leaves it with the speed it was swung at, which is what a physics sandbox wants and what `follow` (which teleports) cannot give. Steering happens in `fixedUpdate`, so a grab is part of the simulation; `isDragging` is whether the pointer is carrying it. Two-dimensional.

```json
"ball": {
  "actor": "Ball",
  "physics": { "bodyType": "dynamic", "shape": "circle", "restitution": 0.8 },
  "constraints": { "grab": { "type": "Grabbable", "params": { "removable": true } } }
}
```

## Chase

`constraints/chase.js`. Pursues the nearest player's avatar within range and wanders around its current position otherwise. Pauses while the entity's `ContactDamage` reports it stunned. With a [navmesh](./navigation) loaded the hunt routes around the walls, asking again every `repath` seconds while the quarry strays from the route's end; a hunt holding a route keeps its quarry out to twice the range, since a detour walks away before it closes in. An unreachable quarry is seeked straight, as ever. In a 3D scene the hunt, the wander and the separation all work the (x, z) ground plane and leave the body its vertical speed, so a chaser neither flies at its quarry nor hovers. Its debug drawing follows: under `r_debug` the detection ring, the wander target, the route and the pursuit line lie flat on the floor in 3D as they do on the plane in 2D.

| Option | Default | Meaning |
| --- | --- | --- |
| `speed` | `60` | Pursuit speed, px/s |
| `idleSpeed` | `speed * 0.6` | Wander speed |
| `detectionRange` | `400` | px |
| `wanderRadius` | `50` | How far a wander target may be from the current position |
| `wanderInterval` | `2` | Seconds between wander targets |
| `agent` | the only one | The nav agent profile routes are asked for (`m2d.project.json` `navAgents`) |
| `repath` | `0.4` | Seconds between route refreshes while the quarry moves |
| `separation` | `0` | Keep this far from fellow chasers, px: a pack arrives around the player instead of as one stack; `0` steers alone |

Does nothing while no avatar is near. Draws its range, wander target, route and pursuit line when the debug overlay is on.

## NavObstacle

`constraints/navObstacle.js`. The entity cuts the [navmesh](./navigation) around its body as it moves: a crate dragged across a hall, a gate swung shut. Needs a dynamic nav agent (`m2d.project.json` `navAgents.<name>.dynamic`), whose mesh is a Detour tile cache the cut rebuilds tile by tile; on a scene without one it is reported once and does nothing. The obstacle list lives on `game.nav` as tracked state, so snapshots and rollback carry the cuts; game code can also cut directly with `game.nav.addObstacle/moveObstacle/removeObstacle`.

| Option | Default | Meaning |
| --- | --- | --- |
| `margin` | `0` | Grown around the body on every side, world units |
| `granularity` | `4` | How far the body moves before the cut follows |

## PathFollow

`constraints/pathFollow.js`. Moves a kinematic body between points with a ramp up, a cruise and a braking phase, pausing at each point.

| Option | Default | Meaning |
| --- | --- | --- |
| `points` | `[]` | `{ x, y }` array, visited in order and repeated. Fewer than two means stay put |
| `path` | | The name of one of the scene's [`paths`](./scene-format#paths). Wins over `points` |
| `stopAtPoints` | `true` | With `path`: pause at every point of the path, or only at an open path's ends |
| `speed` * | `3` | Cruise speed, px/s |
| `waitTime` | `1000` | Pause at each point, in milliseconds, in the constructor and in a scene's retune alike |
| `acceleration` | `speed * 2` | px/s² |
| `face` * | `false` | Turn the entity to face where it is going: `entity.heading` follows the direction of travel — the screen angle in 2D, yaw about `+y` in 3D — and keeps its last value through a pause. A 3D model steers by its `heading` already; a 2D actor reads it when drawing |

With `points`, the body is placed at the first point on construction and returns from the last to the first in a straight line.

With `path`, the body travels along the path's line by arc length, curves included. It starts from the point on the path nearest to where it was placed, so the placement chooses where along the route it begins. It goes round a closed path and back and forth along an open one. The travel state is in public fields, so `game.snapshot()` and `game.restore()` carry it.

## Collectable

`constraints/collectable.js`. Collected on an avatar's touch: the entity leaves the world, a counter counts it, and the world event `picked` is raised where the touch was simulated. What a coin, a key and a health pack have in common; the kit's `Coin` is `Hover` plus this.

| Option | Default | Meaning |
| --- | --- | --- |
| `counter` * | | A plain counter in `world.counters` to add 1 to when taken |

Nothing here is presentation: a rule answers `picked` (`{ "when": { "event": "emit", "name": "picked" }, "then": [{ "do": "sound", "key": "coin" }] }`), and a `collected` rule or a tally sees the entity gone as before. On a server every player's avatar collects, and the removal replicates like any other.

## Hover

`constraints/hover.js`. A visual bob and spin through the entity's render offsets. The body never moves.

| Option | Default | Meaning |
| --- | --- | --- |
| `amplitude` | `5` | Bob height in px. `0` disables |
| `frequency` | `2` | Bob rate in rad/s |
| `spin` | `0` | Spin rate in rad/s |

## DamageFlash

`constraints/damageFlash.js`. Tints the entity for a moment. Call `flash()` from a `Health` `onDamage` handler. It is the plainest hit read; the demos draw a fuller one with their own `HitBurst` constraint.

| Option | Default |
| --- | --- |
| `duration` | `0.167` seconds |
| `color` | `'rgba(255, 0, 0, 0.5)'` |

## Debug

`constraints/debug.js`. Draws bounds, centre, velocity and health through the world overlay when the debug overlay is on.

| Option | Default |
| --- | --- |
| `showBounds`, `showCenter`, `showVelocity`, `showHealth` | `true` |
| `boundsColor` | `'#00ff00'` |
| `boundsFillColor` | `'rgba(0, 255, 0, 0.1)'` |
| `centerColor` | `'#ff0000'` |
| `textColor`, `healthyColor` | `'#00ff00'` |
| `lowHealthColor` | `'#ff0000'` |
| `lowHealthThreshold` * | `30` |
| `fontSize`, `fontFamily` | `'12px'`, `'monospace'` |

`setOption(key, value)` changes an option at runtime.
