# Built-in constraints

Constraints from `m2d-engine/constraints/`. Attach one with `entity.addConstraint(name, new Constraint(entity, options))`.

`KeyboardControl` and `Interactive` bind their handlers to the entity, so `this` is the entity inside them. Other constraints call handlers as methods of the constraint, so `this` is the constraint. Use arrow functions there.

`Health`, `Attack`, `ContactDamage`, `KeyboardControl`, `CarControl`, `Chase`, `PathFollow` and `WallSlip` do their work in `fixedUpdate`, once per simulation tick. `Hover` and `DamageFlash` are presentation and run in the per-frame `update`. `Chase` draws its wander targets from `game.rng`.

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
    "actor": "Ghost",
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
| `showBar` | `true` | Draw the bar. Even when on, the bar only appears while health is missing |

Methods: `takeDamage(amount)`, `heal(amount)`, `isInvulnerable()`. Properties: `currentHealth`, `healthPercentage`, `isAlive`.

`takeDamage` does nothing while invulnerable. When health reaches zero the entity's `dead` flag is set, then `onDeath` runs. The bar is hidden at full health and once the entity is dead, and turns red at 30 health.

## Attack

`startAttack(direction)` takes `1` or `-1` for a side-view swing, or any other number as an angle in radians, for a top-down or 3/4 game where left and right cannot reach what is above or below. The swing is `arc` radians wide (default π, the side view's half circle; 2π hits everything in range) centred on that direction. `knockback` is the impulse along the swing, default the side view's fling; `0` disables it.

`targetCategory` chooses the collision category a swing hits (default enemies); an enemy striking the player passes `CollisionCategories.player`, which is how Ash Row's thugs telegraph and land their blows.

`combo` makes the attack a chain: an array of steps (`{ damage, knockback, arc }`, each overriding the base), advanced when a swing starts within `comboWindow` seconds (default 0.8) of the last one ending, and reset otherwise. The cooldown still gates every swing. `onStart(step)` fires per swing and `onHit(entity, step)` per target a swing lands on; a finisher that launches pops the target's `elevation` there. Ash Row's three-punch chain and its sweep kick (a second `Attack` under its own constraint name) are the worked example.

`constraints/attack.js`. A melee attack that damages enemies within a half circle in the facing direction and knocks them back.

| Option | Default | Meaning |
| --- | --- | --- |
| `damage` * | `10` | |
| `range` * | `40` | Radius in px |
| `cooldown` * | `30` | In 60ths of a second |
| `onStart()` | | Called when an attack begins |

Call `startAttack(direction)` with `1` or `-1`. It does nothing during the cooldown. Hits are found once, at the start of the attack, with an `overlaps` query. Targets are bodies with the `enemy` collision category and a `Health` constraint that is not invulnerable. Each target takes `damage` and a fixed knockback impulse. The attack sets the entity's animation to `attackRight` or `attackLeft` and leaves it there. The built-in players switch back to `idle` from their movement handler.

The attack draws nothing of its own: what a swing looks like depends on the game and its perspective, so a game draws one with a constraint that hooks `onStart`. The demos share one in `examples/src/shared/effects.js` (`AttackSwing`, with a matching `HitBurst` for taking damage). The range ring is drawn when the debug overlay is on.

## ThrustControl

`constraints/thrustControl.js`. A ship's handling on a dynamic body with rotation free: left and right drive angular velocity at `turn` rad/s, up thrusts along the nose at `thrust` px/s², down brakes or reverses at `reverse`, speed is capped at `maxSpeed` and coasting decays at `drag` 1/s. `KeyC` ignites a boost (`boostThrust` and `boostSpeed` multipliers for `boostDuration`, once per `boostCooldown`); `onBoost` fires then, and `onFire` every tick the fire key is held. `throttle` (0..1) and `steer` (-1..1) are read back for a flame and a bank. Keys as `KeyboardControl`'s, under `keys`.

## PointerMove

`constraints/pointerMove.js`. Click to move: a press of `button` (default the primary) sets a ground destination from the tick's input snapshot, and the entity walks there at `speed` and stops within `arrive`. `goTo(x, y)` and `stop()` from code, `moving` and `destination` to read; `onArrive()` and `onMove(dx, dy)` hooks. Under a projection the pointer is already on the ground, so the same code moves an isometric hero.

## Footsteps

`constraints/footsteps.js`. Plays the next of `sounds` (sound keys) every `stride` world units of ground travel, cycling; pauses in the air (an entity with `isAirborne`, or `isOnGround()` false) and below `minSpeed`; plays a step on landing unless `landing: false`. `onStep(index)` is called with each step. Simulation: the stride is integrated in `fixedUpdate` from the body's velocity.

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

Diagonal movement is normalized. Input pressing straight into a wall is dropped before normalizing. Keys are read from `game.input.snapshot`, the state sampled for the tick.

`inputSpace: 'screen'` moves along the screen's axes through the scene's projection, so Up walks toward the top of an isometric view, and at a steady pace on screen: `maxSpeed` is then the on-screen speed, scaled on the ground so a walk up the view is no slower than one across it. Default `'world'`.

With `verticalMovement` on, `maxSpeed` caps the whole velocity vector, so a diagonal is no faster than a cardinal, and braking stops both axes. A side view caps only the run and leaves the vertical to gravity.

## GlideControl

`constraints/glideControl.js`. One-press gliding on a corridor grid: tap a direction and the body keeps going until a wall, a new direction or the same key again: Pac-Man's movement, for cosy mazes. A turn pressed early is buffered and taken at the next opening; one pressed a beat late snaps back to the junction just passed and takes it anyway. Openness is asked of the physics world (`physics.overlaps` one cell over, sensors ignored), so the constraint needs no map, only the grid the corridors are built on. The body parks on the centre of the last open cell at a wall, and is held to the corridor's centre line while gliding. Runs in `fixedUpdate` on `game.input.snapshot`.

| Option | Default | Meaning |
| --- | --- | --- |
| `keys` | arrows | `{ left, right, up, down }` as key codes |
| `speed` | `240` | Glide speed, px/s |
| `grid` | `32` | Corridor cell size; centres at `(n + 0.5) * grid` |
| `buffer` | `0.35` | Seconds a queued turn waits for its opening |
| `snap` | `0.6` | How far past a junction, in cells, a late turn still takes it |
| `stopOnRepeat` | `true` | Pressing the direction of travel stops the body |
| `onMove(dx, dy)` | | When a glide starts or changes direction |
| `onStop()` | | When the body comes to rest |

Hedgerow Court is the worked example.

## CarControl

`constraints/carControl.js`. Arcade top-down car handling on a dynamic body. Each tick the body's velocity splits along its heading: throttle and brakes act on the forward part, grip decays the lateral part, and the handbrake swaps in a much lower grip so the car slides while the nose turns, a drift. Steering drives angular velocity and scales with speed, so the car cannot pivot in place. Runs in `fixedUpdate` on `game.input.snapshot`, so the same inputs always drive the same path.

| Option | Default | Meaning |
| --- | --- | --- |
| `keys` | arrows, `Space`, `KeyX` | `{ throttle, brake, left, right, handbrake, nitro }` as key codes. Partial overrides are merged |
| `manual` | `false` | Ignore the keyboard; a driver supplies `setControls({ throttle, brake, steer, handbrake, nitro })` |
| `acceleration` | `420` | Forward drive, px/s² |
| `maxSpeed` | `560` | Forward cap, px/s |
| `brake` | `780` | Braking, px/s². Held past the stop it reverses, capped at `maxReverse` |
| `maxReverse` | `170` | Reverse cap, px/s |
| `drag` | `0.6` | Coasting decay, 1/s |
| `grip` | `18` | Lateral decay, 1/s. Steady-state sliding at full lock is `maxSpeed * steer / grip`; the defaults keep that under `driftThreshold` |
| `driftGrip` | `2.4` | Grip while the handbrake is held |
| `steer` | `2.4` | Yaw rate at full steering, rad/s |
| `driftSteer` | `3.6` | Yaw rate while drifting |
| `driftThreshold` | `90` | Lateral px/s that counts as drifting |
| `nitroThrust`, `nitroBoost` | `2.1`, `1.35` | Acceleration and speed-cap multipliers while the nitro burns |
| `nitroDuration`, `nitroCooldown` | `1.1`, `5` | Burn and recharge, seconds |
| `onDrift(active)` | | Drift started or ended |
| `onNitro()` | | Nitro ignited |

Fields and methods: `surfaceGrip` (set it per tick from the world: 1 asphalt, lower on oil or grass; it scales grip, steering and drive together), `drifting`, `forwardSpeed`, `lateralSpeed`, `speed`, `boostLeft`, `nitroReady`, `igniteNitro()`, `applyBoost(speed)` (a shove along the heading up to `speed`, what a boost pad does), `setControls(controls)`.

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

## Chase

`constraints/chase.js`. Pursues `game.player` within range and wanders around its current position otherwise. Pauses while the entity's `ContactDamage` reports it stunned.

| Option | Default | Meaning |
| --- | --- | --- |
| `speed` | `60` | Pursuit speed, px/s |
| `idleSpeed` | `speed * 0.6` | Wander speed |
| `detectionRange` | `400` | px |
| `wanderRadius` | `50` | How far a wander target may be from the current position |
| `wanderInterval` | `2` | Seconds between wander targets |

Does nothing while `game.player` is `null`. Draws its range, wander target and pursuit line when the debug overlay is on.

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

With `points`, the body is placed at the first point on construction and returns from the last to the first in a straight line.

With `path`, the body travels along the path's line by arc length, curves included. It starts from the point on the path nearest to where it was placed, so the placement chooses where along the route it begins. It goes round a closed path and back and forth along an open one. The travel state is in public fields, so `game.snapshot()` and `game.restore()` carry it.

## Hover

`constraints/hover.js`. A visual bob and spin through the entity's render offsets. The body never moves.

| Option | Default | Meaning |
| --- | --- | --- |
| `amplitude` | `5` | Bob height in px. `0` disables |
| `frequency` | `2` | Bob rate in rad/s |
| `spin` | `0` | Spin rate in rad/s |

## WallSlip

`constraints/wallSlip.js`. No options. Sets the body's friction to zero while airborne and restores it on landing, so holding a direction into a wall does not make a dynamic player cling to it.

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
