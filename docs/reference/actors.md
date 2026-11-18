# Built-in actors

Actors from `m2d-engine/actors/`, available to every scene by name. A game's own actors, and the kit's, are registered with `game.registerActor(name, Class)`.

The engine's own actors are the capabilities every game places or its own code names: `Prop`, `Trigger` and `SpawnPoint` (which the server spawns avatars at). The game pieces — players, a platform, mobs, a pickup, a turret and its rocket, an NPC — are [the kit](./kit)'s (`m2d-kit/actors`), compositions of the engine's constraints, together with the prefab templates that build the same things with no class at all.

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
- **An actor for one dimension says so.** `static dimensions = 2` (or `3`) refuses a level of the other dimension naming it, at `prefabs.<name>.actor`, and the editor's Components tab and `list_components` show it only where it fits. Null, the default, is both.
- **A combination that cannot work is refused too.** `static refineProperties(properties, { dimensions, fail })` runs at load for each placed object, with the object's properties over its prefab's; `fail(key, message)` names the property (`layers[0].objects[3].properties.kind`). The kit's `ParticleField` refuses smoke in a 2D level this way.
- **An actor nobody sees is a tool, and says so.** `static tool = { color, label }` marks a trigger, a spawn point, an invisible wall: the engine draws it as a semi-transparent box of that colour over its body, outlined and labelled with its kind and id in 2D (seen through the level's projection, so a diamond in an isometric level) and a translucent, faintly glowing shape in 3D. The editor always shows them; in play the `r_showtools` cvar does (`r_showtools 1`, or `toggle r_showtools`). An instance's `toolColor` and `toolLabel` win over the class's (a trigger adds its `triggers` tag to its label). The engine's are `Trigger` (orange) and `SpawnPoint` (green); the kit's `GravityDial` (purple) and `AmbientSound` (blue); the examples' invisible walls use Source's clip magenta. See `core/toolVolumes.js`.
- **An asset is named, and arrives loaded.** A property declared `s.ref('spritesheet')` or `s.ref('image')` is checked against the scene's sheets or `assets.images`, and the actor receives the loaded `SpriteSheet` or image in `options` (null headless). Art an actor uses at run time, such as the flame a ship trails, is then scene data the editor shows.

`actorPropertiesSchema(Class)` from `m2d-engine/core/sceneSchema.js` returns the merged schema, and `fieldsOf` on it yields the inspector's field list.

## Prop

`actors/prop.js`. Name `Prop`. Scenery with no behaviour. Draws the prefab's sprite, or in 3D its mesh. A 2D prop with no sprite draws a block in its `color`.

| Property | Default | Meaning |
| --- | --- | --- |
| `color` | `#8b95a3` | Fill of a 2D prop with no sprite |
| `radius` | `4` | Corner rounding of that fill, px |

The editor gives a placed model or image this actor when the game registers it. The editor's templates use it for their platforms and blocks.

## SpawnPoint

`actors/spawnPoint.js`. Name `SpawnPoint`. Where a player joins or comes back: a marker that collides with nothing, drawn as a green tool box in the editor and under `r_showtools` and as nothing in play, in 2D and 3D. Its size is its reach: `point.holds(entity)` is whether the entity stands inside it. `scene.freeSpawnPoint()` is the first point, in scene order, with no avatar inside, or the one with the fewest when all are taken, or null without any. `scene.spawnAvatar(player)` makes the player an avatar from the scene's `world.player` object at that point (or where the object stands) and sets `player.avatar`; the server calls it for each player who joins. See [Multiplayer](../guide/multiplayer#the-match).

## Trigger

`actors/trigger.js`. Name `Trigger`. An invisible area that reacts when the player enters it.

- Expects a `static` sensor body.
- `properties`: `active` (false), `visible` (false: its box shows in play too), `triggers` (a tag for game code, such as `"levelComplete"`), `debugColor` (its box's colour; orange unless set).
- Does nothing unless `active` is `true`. `setActive(flag)` and `setVisible(flag)` change the flags at runtime. A level's rules watch the object itself (`when: { "event": "enter", "object": "gate" }`), and an `unseal` action sets it active; `triggers` is a tag for game code.
- When the player enters an active trigger, its `onEnter(player)` runs if one is set, and `onExit(player)` when the player leaves; neither is built in. What entering does is usually the level's rules' business (`enter`). (Until Nov 2026 a built-in `onEnter` switched to `mainMenu`, which pre-empted any rule on an exit trigger.)
- An orange tool box (see [Declaring properties](#declaring-properties)): always in the editor, under `r_showtools` in play, and in play anyway once `visible`. A subclass with art of its own (a gate) draws that once `visible`, and its box only where tools are shown.
