# Built-in actors

Actors from `m2d-engine/actors/`. Register the ones a game uses with `game.registerActor(name, Class)`. Each expects certain prefab physics and reads certain `properties`.

The platformer and top-down example scenes under `examples/src/*/scenes/` show them in use.

## Player

`actors/player.js`. Name `Player`. A platformer character controlled with the arrow keys, Space to jump and X to attack.

- Expects a `dynamic` body. It moves by friction and tumbles. Sets its mass to 1.
- Uses animations `idle`, `run`, `jump`, `attackLeft` and `attackRight` when the sheet has them.
- Constraints: `Health` (100), `Attack` (65 damage, 50 range, 22.5 cooldown), `KeyboardControl` (acceleration 3000, max speed 180, no vertical movement), `WallSlip`, `Debug`. Jumps at 720 px/s when on the ground.
- Calls `game.gameOver()` on death. Plays the `jump`, `attack`, `damage` and `coin` sounds when loaded.

## TopDownPlayer

`actors/topDownPlayer.js`. Name `Player`. Eight-directional movement with the arrow keys and X to attack.

- Works with a `dynamic` or `character` body and zero gravity. Sets its mass to 1.
- Constraints: `Health` (100), `Attack` (65 damage, 50 range, 22.5 cooldown), `KeyboardControl` (acceleration 3000, max speed 180, vertical movement on), `Debug`.

## Platform

`actors/platform.js`. Name `Platform`. Draws the prefab's `defaultAnimation`, or `default`, tiled over its size. Without a sprite it draws the red placeholder rectangle.

- Expects a `static` body.
- Projectiles treat it as a wall, and `Turret` treats it as blocking line of sight.

## MovingPlatform

`actors/movingPlatform.js`. Name `MovingPlatform`. Patrols a path with the `PathFollow` constraint.

- Sets its body to `kinematic` with friction 1 and restitution 0.
- Reads `properties.path`: `{ points, speed, waitTime, acceleration }`. See [PathFollow](./constraints#pathfollow).

## Bee

`actors/bee.js`. Name `Bee`. A flying enemy that chases the player in range and wanders otherwise.

- Expects a `dynamic` body. Set `lockRotation: true` in the prefab so hits do not spin it.
- Sets collision category `enemy`.
- Constraints: `Health` (100, 0.5 s invulnerable), `ContactDamage` (33 damage, 720 px/s knockback), `Chase` (speed 60, idle speed 36, range 400), `DamageFlash`, `Debug`.
- On damage it flashes, resets to `idle` and plays the `damage` sound.
- Steps its sprite's frames at 6 per second when the sheet has more than one.

## Ghost

`actors/ghost.js`. Name `Ghost`. The same as `Bee` with weaker knockback, 480 px/s. Used by the top-down example.

## Turret

`actors/turret.js`. Name `Turret`. A stationary enemy that aims at the player, checks line of sight with a raycast against `Platform` bodies and fires `Rocket` projectiles.

- Sets its body to `static` and its category to `enemy`.
- Draws itself with primitives. No sprite needed.
- `properties`: `detectionRange` (350), `fireRate` seconds between shots (2), `rocketSpeed` (360), `rocketDamage` (25), `health` (80). A value of `0` falls back to the default.
- Constraints: `Health` (0.3 s invulnerable), `ContactDamage` (25 damage, 360 px/s knockback), `Debug`.

## Rocket

`actors/rocket.js`. Name `Rocket`. A `Projectile` that draws itself. Created by `Turret`, or by code with `game.physics.createBox` and `new Rocket(body, null, game, { direction, speed, damage })`.

Defaults: speed 480, damage 25, lifetime 6 s, targets `['Player']`. Every `Projectile` option can be passed.

## Coin

`actors/coin.js`. Name `Coin`. Bobs and spins with the `Hover` constraint and removes itself when the player touches it.

- Expects a `static` body with `isSensor: true`.

## Trigger

`actors/trigger.js`. Name `Trigger`. An invisible area that reacts when the player enters it.

- Expects a `static` sensor body.
- `properties`: `active` (false), `visible` (false), `triggers` (a label drawn on the area, such as `"levelComplete"`), `debugColor`.
- Does nothing unless `active` is `true`. `setActive(flag)` and `setVisible(flag)` change the flags at runtime. When `triggers` is `"levelComplete"` it plays the `levelComplete` sound.
- When the player enters, `onEnter(player)` runs. The built-in `onEnter` switches to the scene named `mainMenu`. Subclass it to change that. An `onExit(player)` method runs when the player leaves if the subclass defines one.
- When visible, draws its area and label through the world overlay.
