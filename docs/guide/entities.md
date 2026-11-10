# Entities and constraints

Everything that exists in a level is an entity. An entity owns a physics body, optionally a sprite sheet and a set of constraints that give it behaviour. Actors are the entity classes a game defines.

<Demo name="entities">
Crates built from the Health, DamageFlash and Interactive constraints plus a custom one that rocks them. Hover a crate to highlight it and click to damage it. When all are gone, new ones are created at runtime.
</Demo>

## Writing an actor

An actor extends `Entity`. The scene constructs it with four arguments.

```javascript
import { Entity } from 'm2d-engine/core/entity.js';

export class Crate extends Entity {
  name = 'Crate';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.contents = options.contents ?? 'nothing';
  }
}
```

| Argument | What it is |
| --- | --- |
| `body` | The physics body built from the prefab's `physics` block and the object's position and size |
| `sprite` | The `SpriteSheet` named by the prefab, or `null` |
| `game` | The engine instance |
| `options` | The object's `properties` from the scene JSON |

Declare what `options` may hold in `static properties`, the way a constraint declares `static params`, and a misspelled property in a scene fails on load instead of doing nothing — and an editor can draw the fields. See [Declaring properties](../reference/actors#declaring-properties).

```javascript
import { s } from 'm2d-engine/core/schema.js';

export class Crate extends Entity {
  static properties = { contents: s.string({ initial: 'nothing' }) };
}
```

Register the class under the name prefabs use, then reference it from scene JSON.

```javascript
game.registerActor('Crate', Crate);
```

```json
{ "prefabs": { "crate": { "actor": "Crate", "spritesheet": "crate", "physics": { "bodyType": "dynamic" } } } }
```

### The name property

`name` identifies the kind of entity to other code. Collision handlers compare it, projectiles use it to decide what counts as a target and the scene uses it for one special case. The entity named `Player` is stored as `game.player`, the camera follows it and the game ends when it falls more than 50 px below the world height. That is presentation's handle on the player; simulation code that needs "the player" (an enemy picking a target, a pickup deciding who may take it) asks `game.players.nearestAvatar` or `isAvatar`, which on a server see every connected player's avatar (see [Players](./headless#players)).

### Lifecycle methods

| Method | When it runs |
| --- | --- |
| `fixedUpdate(dt)` | Once per simulation tick, before the physics step, while the game is neither paused nor over. `dt` is always `game.time.fixedTimestep`, 1/60 s by default. The base method runs the constraints' `fixedUpdate` |
| `update(deltaTime)` | Every frame while the game is neither paused nor over, after the frame's ticks. `deltaTime` is the frame's game time in seconds. The base method runs the constraints' `update` |
| `draw(deltaTime)` | Every frame inside the world pass. The base method draws the sprite tiled over the body, then calls each constraint's `draw`. Without a sprite it draws a red rectangle and skips the constraints |
| `onCollisionStart(other)` | When the body starts touching another body. `other` is the other physics body. `other.entity` is its entity, if it has one |
| `onCollisionEnd(other)` | When the contact ends |
| `destroy()` | Releases what the constraints registered elsewhere and marks the entity dead |

Call `super.fixedUpdate(dt)`, `super.update(deltaTime)` and `super.onCollisionStart(other)` when overriding, so constraints still receive them.

`fixedUpdate` is for the simulation: movement, cooldowns, damage, spawning, decisions. `update` is for presentation: an animation cycle, a flash fading, an idle bob. The split is what makes the game play the same at every frame rate. A frame may run several ticks or none, so code in `update` must not change anything the simulation reads. See [Time, ticks and timers](./time#the-simulation-tick).

### Drawing

The base `draw` tiles the sprite's current animation frame across the body's size. An actor without a sprite draws a red rectangle. Override `draw` to render with the primitives in the [renderer API](../reference/renderer).

```javascript
draw() {
  const { x, y } = this.renderPosition;
  this.game.renderer.pushTransform({ x, y, rotation: this.renderAngle });
  this.game.renderer.drawRect({ x: -16, y: -16, width: 32, height: 32, fillStyle: '#c62828' });
  this.game.renderer.popTransform();
}
```

Use `renderPosition` and `renderAngle` when drawing. They are blended between physics steps so motion stays smooth on displays faster than the simulation. Use `position` and `body.angle` for logic.

The base `draw` calls each constraint's `draw` after the sprite. An override, or an entity without a sprite, has to do the same to get health bars and damage flashes:

```javascript
for (const constraint of this.constraints.values()) constraint.draw(deltaTime);
```

`renderOffset` and `renderAngleOffset` add a visual displacement on top of the body's transform without moving the body. The `Hover` constraint uses them to make a pickup bob.

### Draw order

The scene draws tile layers and entities in one ascending order: by `zIndex`, then by `depth` among entities sharing one. `zIndex` defaults to `0` and a scene object can set it. `depth` defaults to the bottom edge of the body at its drawn position, the feet, so whatever stands lower on the ground is drawn in front. Assign a number to pin an entity's depth instead. A scene's `world.sort` can switch to insertion order.

### Elevation

`elevation` is height above the ground in world units for perspectives that fake a third axis: a top-down jump, a flight, a beat 'em up's leap. It is simulation state, set in `fixedUpdate`, that the physics body never sees: the collider stays on the ground and only the drawn sprite rises. `renderElevation` blends it between ticks, and `renderPosition` already subtracts it. `depth` ignores it, so a jumping entity keeps its place in the sort. The `ObliquePlayer` actor is the packaged example.

### Render anchor and sprite size

`renderAnchor` is the body's interpolated position on the render plane, through the scene's projection if it has one, with no offsets and no elevation. Draw a ground shadow there; the camera follows it. Under `spriteFit`, `spriteSize` overrides the drawn size when it differs from the body's, as an isometric block on a 64 by 64 footprint drawn 128 by 128 does.

### Footprints

A prefab with a `physics.footprint` gets a short collider at the bottom of its rectangle and a sprite that stands above it. The entity's `size` is the full frame, `frameOffset` is where the frame's centre sits relative to the body's, and `renderPosition` includes it, so a `draw` override that uses `renderPosition` and `size` draws the frame while `body.position` and `body.size` remain the feet. See [Perspectives](./perspectives).

Annotations on an entity, such as a detection radius or a health readout, should go through `game.worldOverlay`. It takes world coordinates and draws at display resolution, so it stays sharp when the world render resolution is lowered. See [Display and resolution](./display#the-world-overlay).

### Ground detection

| Method | Returns |
| --- | --- |
| `isOnGround()` | `true` when a contact normal points downward, so a floor counts and a wall does not |
| `groundBody` | The body holding this entity up, or `null`. On a moving platform this is the platform |
| `isInAir()` | The opposite of `isOnGround()` |
| `isFalling()`, `isJumping()`, `isMovingHorizontally()`, `isMovingLeft()`, `isMovingRight()` | Velocity checks. The thresholds are 30 px/s vertically and 6 px/s horizontally, and each takes a threshold argument |

### Removing an entity

Removing an entity takes two steps. Remove it from `game.entities`, and remove its body from the physics world.

```javascript
this.game.entities.delete(this);
this.game.physics.remove(this.body);
```

`Projectile.destroy()` does both. For other entities, call `entity.destroy()` as well when the entity has an `Interactive` constraint, so the input system stops hit-testing it.

## Creating entities at runtime

Scenes create entities from prefabs. For entities that appear during play, such as projectiles or spawned pickups, spawn a registered actor by name:

```javascript
game.spawn({
  type: 'Rocket', x, y, width: 24, height: 8,
  options: { direction, speed: 400 },
  physics: { frictionAir: 0, density: 0.001 }
});
```

`spawn` takes one object: `type` and the placement (`x`, `y`, `width`, `height`) are required, and beside them it accepts `sprite` (a sprite sheet key of the current scene), `animation`, `options` (passed to the actor), `physics` and `playerId` (the owner). It builds the body from the prefab physics keys, constructs the actor, adds both to the game and returns the entity. It records how the entity was made, which is what lets a server tell its clients to make the same one, so `options` must be plain data. See [Multiplayer](./multiplayer#what-is-sent).

An entity can also be built by hand: create the body, construct the actor and add both. Such an entity is not sent to clients.

```javascript
const body = game.physics.createBox({ x, y, width: 24, height: 8, frictionAir: 0 });
const rocket = new Rocket(body, null, game, { direction, speed: 400 });
game.entities.add(rocket);
game.physics.add(body);
```

`createBox`, `createCircle` and `createCapsule` return a body that is not simulated until `physics.add`. `game.createEntity({ type, x, y, width, height, spritesheet, options, physics })` builds an entity from a registered actor name the same way the scene does, and also leaves the body to be added. It returns `null` and logs an error for an unregistered name. Unlike the scene, it does not select an animation, so call `setAnimation` yourself when the entity has a sprite.

Once `dead` is set, by `Health` or by `destroy()`, the base `update` and `draw` return early. An entity that is dead and still in `game.entities` freezes and disappears, so remove it.

## Projectiles

`Projectile` extends `Entity` with constant-velocity movement, a lifetime and hit handling. It sets the body's collision category to `projectile`, enables continuous collision detection and removes friction.

```javascript
import { Projectile } from 'm2d-engine/core/projectile.js';

export class Arrow extends Projectile {
  name = 'Arrow';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game, { speed: 600, damage: 15, targetNames: ['Enemy'], ...options });
  }

  onHitWall(wall) { /* spawn an effect */ }
}
```

| Option | Default | Meaning |
| --- | --- | --- |
| `speed` | `480` | px/s along `direction` |
| `direction` | `{ x: 1, y: 0 }` | Normalized on construction |
| `damage` | `10` | Applied to the target's `Health` constraint |
| `maxLifetime` | `5` | Seconds before the projectile removes itself |
| `owner` | `null` | Entity that fired it. Contacts with the owner are ignored |
| `targetNames` | `['Player']` | Entity names that count as hits |
| `destroyOnEntityHit` | `true` | Remove on hitting a target |
| `destroyOnWallHit` | `true` | Remove on hitting a static or kinematic body or a `Platform` |
| `collisionMask` | player and default categories | Which collision categories the body collides with |
| `isSensor` | `false` | Pass through other bodies while still reporting contacts |

Override `onHitTarget(entity)` to change what a hit does and `onHitWall(wall)` to react to scenery.

## Constraints

A constraint is a behaviour attached to an entity. The engine ships constraints for health, melee attacks, contact damage, movement (keyboard, grid gliding, thrust and car handling), pointer interaction and click-to-move, chasing, path following, hovering, wall slipping, footsteps, abilities, proximity prompts, damage flashes and debug drawing. The [built-in constraints reference](../reference/constraints) lists their options.

```javascript
import { Health } from 'm2d-engine/constraints/health.js';
import { Chase } from 'm2d-engine/constraints/chase.js';

this.addConstraint('health', new Health(this, { maxHealth: 60, onDeath: () => this.remove() }));
this.addConstraint('chase', new Chase(this, { speed: 80, detectionRange: 300 }));

const health = this.getConstraint('health');
```

Prefer a constraint over logic inside an actor when another actor could want the same behaviour. The built-in `Bee` is collision setup plus `Chase`, `Health`, `ContactDamage`, `DamageFlash` and `Debug`.

### Declaring constraints in a scene

A behaviour does not need an actor written for it. A scene can attach and tune any constraint by name: on a prefab, for every instance, or on a single placed object. The engine's own constraints (and actors) resolve by name without the game registering them; a game registers its own with `registerConstraint`, and a registration wins over a built-in of the same name.

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
},
"objects": [
  { "id": "guard-1", "prefab": "guard", "x": 100, "y": 100 },
  { "id": "guard-2", "prefab": "guard", "x": 300, "y": 100,
    "constraints": { "chase": { "params": { "speed": 160 } } } }
]
```

The key is the slot name `getConstraint` uses. An object's entry merges over the prefab's, so `guard-2` chases faster and keeps the rest.

An entry whose slot is already filled **retunes** what is there rather than replacing it, and that includes a constraint the actor attached in its own constructor. So one bee in a level can see further than the others without a second actor or a second prefab, and without losing the callbacks its actor wired up:

```json
{ "id": "bee-2", "prefab": "bee", "x": 1180, "y": 768,
  "constraints": { "chase": { "params": { "speed": 110, "detectionRange": 620 } } } }
```

`type` is only needed when the slot is empty. What a scene may set is the constraint's `static params`, its data; callbacks cannot be written in JSON and stay in the actor. The base class's `static params = {}` means nothing is settable; a class that sets `params = null` opts out of the check entirely and takes any bag — what an editor registers as a stand-in for a project constraint whose code it cannot load. Params are validated on load wherever the file names the type, and when the scene builds otherwise. See [Scene format](../reference/scene-format#constraints).

### Writing a constraint

Extend `Constraint` and override the methods you need. The entity calls them in the same situations as its own.

```javascript
import { Constraint } from 'm2d-engine/core/constraint.js';

export class Blink extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.period = options.period ?? 0.5;
    this.time = 0;
  }

  // Presentation, so per frame. A cooldown or a movement decision would
  // go in fixedUpdate(dt) instead.
  update(deltaTime) {
    this.time += deltaTime;
    this.entity.visible = Math.floor(this.time / this.period) % 2 === 0;
  }

  fixedUpdate(dt) {}
  onCollisionStart(other) {}
  onCollisionEnd(other) {}
  draw() {}
  destroy() {}
}
```

A constraint that registers with an engine service must implement `destroy` to unregister. `Interactive` does this for the input system.

A constraint that reads input reads `this.entity.input`, never `game.input` (see [Input](./input#input-in-the-tick)).

### Snapshots

`game.snapshot()` captures an entity's own fields and its constraints' fields without any code in the actor. Give an actor or a constraint `saveState()` and `loadState(state)` methods when the generic capture is wrong for it. See [Snapshots](./game-loop#snapshots).

### Identity and ownership

Every entity has a `netId`, a whole number handed out in creation order and reset with the scene. `game.entityById(id)` returns the live entity with that id, or `null`. `entity.playerId` names the player whose input drives the entity (`null` for the local player), and `entity.player` is that player. See [Players](./headless#players).

An entity placed by a scene file also has `entity.sceneId`: the `id` of the object it was built from, chosen by whoever wrote the scene and unchanged by reordering or re-saving it. `scene.entitiesById` looks one up, which is how one placed object refers to another (the gate a lever opens, the point a patrol walks to) without searching by name or position. An entity created by `game.spawn` during play has no scene object, so its `sceneId` is `null`.

```javascript
onEnter() {
  const scene = game.sceneManager.getCurrentScene();
  scene.entitiesById.get('north-gate').locked = true;
}
```

## Timing, movement and randomness

Timers count seconds of the tick's `dt` inside `fixedUpdate`. Frame counts vary with the display's refresh rate; ticks do not.

```javascript
fixedUpdate(dt) {
  this.cooldown -= dt;
  if (this.cooldown <= 0) fire();
}
```

For a delay or an interval, `game.time.after` and `game.time.every` do the counting. See [Timers](./time#timers).

Steady movement sets velocity in px/s. A one-off kick uses `applyImpulse`, which is in px·mass/s and affects dynamic and character bodies. Both belong in `fixedUpdate`.

```javascript
body.setVelocity({ x: body.velocity.x + accel * dt, y: body.velocity.y });
body.applyImpulse({ x: -300, y: -150 });
```

Random choices in simulation code come from `game.rng`, which is seeded, so a level plays the same every time it is entered. See [Random numbers](../reference/engine-options#random-numbers).

```javascript
const target = { x: x + this.game.rng.range(-50, 50), y };
if (this.game.rng.chance(0.2)) this.taunt();
```

## Collision categories

Bodies carry a category bit and a mask of categories they collide with. The defaults are in `CollisionCategories` from `m2d-engine/core/constants.js`.

| Category | Value | Used by |
| --- | --- | --- |
| `default` | `0x0001` | Bodies that set no category, including `Platform` |
| `player` | `0x0002` | |
| `platform` | `0x0004` | |
| `movingPlatform` | `0x0008` | |
| `enemy` | `0x0010` | `Bee`, `Ghost`, `Turret` |
| `coin` | `0x0020` | |
| `trigger` | `0x0040` | |
| `projectile` | `0x0080` | `Projectile` |

```javascript
body.setCollisionFilter({ category: CollisionCategories.enemy, mask: 0xFFFF });
```

A projectile that should hit walls must include `default` in its mask, since `Platform` does not set a category.

## Demo source

<<< @/demos/entities.js
