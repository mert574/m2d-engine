# Built-in actors

Actors from `m2d-engine/actors/`. Register the ones a game uses with `game.registerActor(name, Class)`. Each expects certain prefab physics and reads certain `properties`.

The platformer and top-down example scenes under `examples/src/*/scenes/` show them in use.

## Declaring properties

An actor says what a scene may set in `static properties`, as schema descriptors named after the fields they set — the actor-side twin of a constraint's [`static params`](../guide/entities#declaring-constraints-in-a-scene):

```js
import { s } from 'm2d-engine/core/schema.js';

export class Lamp extends Entity {
  static properties = {
    radius: s.number({ initial: 120, positive: true, unit: 'px', label: 'Glow radius' }),
    color: s.string({ initial: '#ffd9a0', editor: 'color' })
  };

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.radius = options.radius ?? 120;
  }
}
```

The rules, all of which match constraints:

- **Defaults go in `initial`**, never a schema `default`. An object that sets one property must not thereby reset the rest, so the loader does not fill these in; the constructor's own `??` does. `initial` is what an inspector shows.
- **Declared properties are checked on load**, when the actor is registered: a misspelled one fails naming its path (`layers[0].objects[3].properties.spead`) instead of silently doing nothing. A loader with no game skips the check, as it does for constraint params.
- **A subclass adds to its bases.** The `static properties` of every class in the chain are merged, base first, so a subclass restates nothing. (`static replicated` works the same way.)
- **Callbacks stay out.** They are code, not scene data.
- **Declaring nothing keeps the old contract**: `properties` is then a free-form bag the engine never looks inside. Adding a schema is per actor.

`actorPropertiesSchema(Class)` from `m2d-engine/core/sceneSchema.js` returns the merged schema, and `fieldsOf` on it yields the inspector's field list.

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

## ObliquePlayer

`actors/obliquePlayer.js`. Name `Player`. The `TopDownPlayer` for a 3/4 view, with a heading, Space to hop and a swing in any direction.

- Everything `TopDownPlayer` has. Works best with a prefab `footprint`, so the body is the feet and the sprite stands above it.
- `heading` is the direction last moved in, radians. X swings the `Attack` at it, `attackArc` wide (default 1.5π) with `attackRange` (60) and `attackKnockback` (6000), so a wisp above or below is in reach.
- The hop is `elevation`: Space launches it at `jumpSpeed` (430 px/s) and `gravity` (1500 px/s²) brings it back. The collider never leaves the ground. `isAirborne` says whether the feet are off it; `jump()` hops from code; `onJump` and `onLand` hooks fire at the ends.
- With an eight-facing sheet it plays `idle_<dir>`, `run_<dir>` and `swing_<dir>` for the heading; `spriteFit` is on, so the object's size is the drawn frame. `spriteOffsetY` shifts the sprite down for a sheet whose feet sit above the frame's bottom.
- `properties`: `jumpSpeed`, `gravity`, `attackArc`, `attackRange`, `attackKnockback`, `spriteOffsetY`.

## Npc

`actors/npc.js`. Name `Npc`. Someone to talk to: stands on a `static` body, turns to face the player within `talkRadius` (110) and shows an `E · Talk to <displayName>` prompt through a `ProximityPrompt`. Set `hasNews` to draw a marker over the head. Plays `idle_<dir>` for its facing, or `idle`. `spriteFit` is on.

- `properties`: `who` (an id for the game), `displayName`, `facing` (resting facing, radians, default down), `talkRadius`, `spriteOffsetY`.
- `playerNear` is the prompt's test; the game reads it on its interact key and opens a `UIDialogue`.

## Platform

`actors/platform.js`. Name `Platform`. Draws the prefab's `defaultAnimation`, or `default`, tiled over its size. Without a sprite it draws the red placeholder rectangle.

- Expects a `static` body.
- Projectiles treat it as a wall, and `Turret` treats it as blocking line of sight.

## Prop

`actors/prop.js`. Name `Prop`. Scenery with no behaviour. Draws the prefab's sprite, or in 3D its mesh. A 2D prop with no sprite draws a block in its `color`.

| Property | Default | Meaning |
| --- | --- | --- |
| `color` | `#8b95a3` | Fill of a 2D prop with no sprite |
| `radius` | `4` | Corner rounding of that fill, px |

The editor gives a placed model or image this actor when the game registers it. The editor's templates use it for their platforms and blocks.

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
