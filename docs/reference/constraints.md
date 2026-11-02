# Built-in constraints

Constraints from `m2d-engine/constraints/`. Attach one with `entity.addConstraint(name, new Constraint(entity, options))`.

`KeyboardControl` and `Interactive` bind their handlers to the entity, so `this` is the entity inside them. Other constraints call handlers as methods of the constraint, so `this` is the constraint. Use arrow functions there.

Options marked with an asterisk treat `0` as unset and fall back to the default.

## Health

`constraints/health.js`. Hit points, invulnerability after a hit and a health bar above the entity.

| Option | Default | Meaning |
| --- | --- | --- |
| `maxHealth` * | `100` | |
| `invulnerableDuration` * | `1` | Seconds after a hit during which damage is ignored |
| `onDamage(amount)` | | Called after damage is applied |
| `onDeath()` | | Called when health reaches zero. The entity's `dead` flag is set first |
| `showBar` | `true` | Draw the bar |

Methods: `takeDamage(amount)`, `heal(amount)`, `isInvulnerable()`. Properties: `currentHealth`, `healthPercentage`, `isAlive`.

`takeDamage` does nothing while invulnerable. When health reaches zero the entity's `dead` flag is set, then `onDeath` runs. The bar turns red at 30 health and is hidden once the entity is dead.

## Attack

`constraints/attack.js`. A melee attack that damages enemies within a half circle in the facing direction and knocks them back.

| Option | Default | Meaning |
| --- | --- | --- |
| `damage` * | `10` | |
| `range` * | `40` | Radius in px |
| `cooldown` * | `30` | In 60ths of a second |
| `onStart()` | | Called when an attack begins |

Call `startAttack(direction)` with `1` or `-1`. It does nothing during the cooldown. Hits are found once, at the start of the attack, with an `overlaps` query. Targets are bodies with the `enemy` collision category and a `Health` constraint that is not invulnerable. Each target takes `damage` and a fixed knockback impulse. The attack sets the entity's animation to `attackRight` or `attackLeft` and leaves it there. The built-in players switch back to `idle` from their movement handler.

The active half circle is drawn while attacking. The range ring is drawn when the debug overlay is on.

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
| `onMove(dx, dy)` | | Every frame with the input direction |
| `onDirectionChange(direction)` | | When horizontal input is nonzero, with `1` or `-1` |
| `onJump()` | | Every frame the jump key is held |
| `onAttack()` | | Every frame the attack key is held |

Diagonal movement is normalized. Input pressing straight into a wall is dropped before normalizing.

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
| `speed` * | `3` | Cruise speed, px/s |
| `waitTime` | `1000` | Pause at each point, in milliseconds |
| `acceleration` | `speed * 2` | px/s² |

The body is placed at the first point on construction.

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

`constraints/damageFlash.js`. Draws a tinted overlay on the entity for a moment. Call `flash()` from a `Health` `onDamage` handler.

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
