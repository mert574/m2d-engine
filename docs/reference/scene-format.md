# Scene format

A scene is a JSON object. The loader rejects any key that is not listed here and any reference that does not resolve. The current format version is `2`; see [Versions](#versions).

## Top level

| Key | Scene types | Required | Meaning |
| --- | --- | --- | --- |
| `version` | both | yes | The format version the scene is written for. The current one is `2` |
| `type` | both | yes | `"level"` or `"ui"` |
| `name` | both | no | Free text. Error messages use the registered name |
| `title` | both | no | Free text, unused by the engine |
| `gameType` | level | no | Free text, unused by the engine |
| `uses` | both | no | External assets by uid. See [Asset manifest](./asset-manifest#using-assets-in-a-scene) |
| `world` | level | no | See below |
| `assets` | both | no | See below |
| `prefabs` | level | no | See below |
| `layers` | level | no | See below |
| `background` | level | no | See below |
| `tileLayers` | level | no | See below |
| `elements` | ui | yes | See below |

## `world`

| Key | Meaning |
| --- | --- |
| `dimensions` | `2` (default) or `3`. How many axes the simulation has. A 3D level needs a game built for it: `initPhysics({ dimensions: 3 })` and `new M2D(canvas, { dimensions: 3 })`. See [Three dimensions](./physics#three-dimensions) |
| `width`, `height` | Size of the playable area in world units. The engine does not read these; a game does, from `scene.config.world`, to set camera bounds or lay out a level |
| `gravity` | `{ "x", "y" }` in px/s², plus `"z"` in a 3D level. Applied to the physics world when the scene loads |
| `projection` | How the ground plane is seen: `"isometric"` or `"belt"`, or `{ "type", "ratio" }`. Isometric draws a ground square as a `2:ratio·2` diamond; belt keeps x and compresses y by `ratio`. Positions are drawn through it; physics stays flat. See [Perspectives](../guide/perspectives#isometric-a-projection-on-positions) |
| `sort` | Entity draw order within a `zIndex`. `"depth"` (default) draws by the bottom edge of the body, so whatever stands lower on the ground is in front. `"insertion"` keeps scene order. See [Perspectives](../guide/perspectives) |

## `assets.spritesheets`

A map from sheet name to sheet. The checks below run for level scenes. A UI scene's sheets are loaded without them.

| Key | Required | Meaning |
| --- | --- | --- |
| `url` | yes | Image path, prefixed with the engine's `basePath` |
| `frameWidth` | yes | Frame width in pixels, greater than 0 |
| `frameHeight` | yes | Frame height in pixels, greater than 0 |
| `animations` | no | Map from animation name to `{ "frames" }` |

`frames` is a non-empty array of `[tileX, tileY]` pairs. An animation may also give `fps` (frames per second, default `0`: hold the first frame) and `loop` (default `true`). A sheet without `animations` gets one named `default` at `[0, 0]`.

## `prefabs`

A map from prefab name to prefab.

| Key | Required | Meaning |
| --- | --- | --- |
| `actor` | yes | A name passed to `game.registerActor` |
| `spritesheet` | no | A key in `assets.spritesheets` |
| `defaultAnimation` | no | An animation on that sheet. Defaults to `default` |
| `physics` | no | Body settings, below |
| `constraints` | no | Behaviours to attach, below |

### `prefabs.*.physics`

| Key | Values | Default |
| --- | --- | --- |
| `bodyType` | `"static"`, `"dynamic"`, `"kinematic"`, `"character"` | `"dynamic"` |
| `shape` | 2D: `"box"`, `"circle"`, `"capsule"`. 3D: `"box"`, `"sphere"`, `"capsule"`, `"cylinder"` | `"box"` |
| `friction` | number. `0` falls back to the default | `0.1` |
| `frictionAir` | number, fraction of velocity lost per 1/60 s. `0` falls back to the default | `0.01` |
| `restitution` | number | `0` |
| `lockRotation` | boolean | `false` |
| `isSensor` | boolean | `false` |
| `angle` | number, radians. An object's own `angle` overrides it | `0` |
| `density` | number greater than 0. Mass is density times area | the engine default |
| `footprint` | `{ "height", "width" }` | none |

A `footprint` makes the collider the object's feet: a box `footprint.height` tall (and `footprint.width` wide, default the object's width) at the bottom of the object's rectangle. The sprite keeps the object's full size and stands above the collider, so a character can walk behind a tree whose trunk is the only solid part. The entity's `depth` is then the feet, which is what the default draw order sorts by. `height` must be positive; both are capped at the object's size.

An unknown key inside `physics` is an error, like everywhere else in the format.

## `layers`

An array of layers.

| Key | Required | Meaning |
| --- | --- | --- |
| `name` | no | Free text |
| `type` | no | Free text |
| `objects` | yes | Array of placed objects |

### `layers[].objects[]`

| Key | Required | Default | Meaning |
| --- | --- | --- | --- |
| `z` | no | `0` | Third axis. A 3D level only |
| `depth` | no | the width | Size on the third axis. A 3D level only |
| `id` | yes | | Identity, unique within the scene. Letters, digits, `-`, `_` and `.`, starting with a letter or digit. Reaches the entity as `entity.sceneId`, and the scene as `scene.entitiesById` |
| `prefab` | yes | | A key in `prefabs` |
| `x`, `y` | yes | | Centre position in world units |
| `width`, `height` | no | `32` | Size in world units. A circle's diameter is `width` |
| `angle` | no | `0` | Rotation in radians |
| `zIndex` | no | `0` | Draw order. Entities and tile layers draw in ascending `zIndex`; within one, entities draw by `world.sort` |
| `constraints` | no | | Behaviours to attach or retune for this one object, below |
| `overrides` | no | | What this object changes about its prefab, below |
| `properties` | no | `{}` | Passed to the actor constructor as `options` |

## `overrides`

What one placed object changes about its prefab, so a heavier crate or a recoloured guard needs no prefab of its own. Placement — `x`, `width`, `angle`, `zIndex` — is the object's own and sits at the top level; this is the prefab's definition.

| Key | Meaning |
| --- | --- |
| `spritesheet` | A key in `assets.spritesheets` |
| `defaultAnimation` | An animation on that sheet |
| `physics` | Body settings, merged field by field over the prefab's |

```json
{ "id": "heavy-crate", "prefab": "crate", "x": 300, "y": 200,
  "overrides": { "physics": { "friction": 0.9, "density": 0.004 } } }
```

`physics` merges, so an override can change the friction without restating the body type. `actor` is deliberately not overridable: a different actor is a different prefab.

## `constraints`

A map from **slot name** — the name `entity.getConstraint` uses — to an entry. A prefab's constraints apply to every instance; an object's apply to that one, merged over the prefab's.

| Key | Required | Meaning |
| --- | --- | --- |
| `type` | see below | A name passed to `game.registerConstraint` |
| `params` | no | The constraint's tunables, validated against its `static params` |

`type` may be omitted when the entry only retunes a constraint that is already there — one the actor attached in its constructor, or one the prefab declared. An entry for an empty slot with no `type` is an error when the scene builds.

```json
"prefabs": {
  "guard": {
    "actor": "Ghost",
    "constraints": { "chase": { "type": "Chase", "params": { "speed": 80 } } }
  }
},
"layers": [{
  "name": "main",
  "objects": [
    { "id": "guard-1", "prefab": "guard", "x": 100, "y": 100 },
    { "id": "guard-2", "prefab": "guard", "x": 300, "y": 100,
      "constraints": { "chase": { "params": { "speed": 160 } } } }
  ]
}]
```

An entry merges rather than replaces: `guard-2` chases faster and keeps every other param the prefab set. Params are checked against the constraint class wherever this document names it — on the prefab, or on an object whose prefab declared the same slot. An override of a constraint an *actor* attached names no type anywhere in the file, so its params are checked when the scene builds instead, with the same messages.

Only a constraint's data can be declared. Its callbacks are code and stay in the actor. See [Built-in constraints](./constraints).

## `background`

| Key | Required | Default | Meaning |
| --- | --- | --- | --- |
| `spritesheet` | yes | | A key in `assets.spritesheets` |
| `tileX`, `tileY` | no | `0` | The frame to tile across the world |

`background` is shorthand for a tile layer named `background` at `zIndex` -1. A scene may have both, as long as no tile layer is also named `background`.

## `tileLayers`

An array of tiled layers: one spritesheet frame repeated across the world, each at its own depth and parallax. Tiles outside the view are not drawn.

| Key | Required | Default | Meaning |
| --- | --- | --- | --- |
| `name` | yes | | Unique among tile layers |
| `spritesheet` | yes | | A key in `assets.spritesheets` |
| `tileX`, `tileY` | no | `0` | The frame to tile |
| `zIndex` | no | `-1` | Where it sits among the entities. A layer draws as a whole before the entities at the same `zIndex` |
| `parallax` | no | `1` | How much of the camera's travel the layer follows, as a number or `{ "x", "y" }`. `1` is pinned to the world, `0` never moves, above `1` is nearer than the ground |
| `repeat` | no | `true` when `parallax` is not `1` | Tile across the whole visible area rather than the layer's own grid, so it never shows an edge |
| `tileSize` | no | the frame width, or half the drawn width under a projection | Ground units one tile covers |
| `scale` | no | `1` | Drawn size as a multiple of the frame |
| `cells` | no | all | `[column, row]` pairs; only these cells are drawn |
| `stretch` | no | `false` | Under a projection, fit the frame to each tile's projected box rather than drawing it at its own size, for a flat texture used as the ground |

## `elements`

An array of UI elements. Every element accepts these keys.

| Key | Required | Meaning |
| --- | --- | --- |
| `type` | yes | `"button"`, `"text"`, `"image"` or `"rect"` |
| `id` | yes | Identity, unique within the scene. Same spelling rules as an object's |
| `x`, `y` | yes for all but a filled rect | Offset from the anchor, in UI units |
| `anchor` | no | One of `top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom`, `bottom-right`. Default `top-left` |
| `properties` | no | Type-specific, below |

Every colour and size accepts a [theme token](./ui#theme-tokens) — `"$color.text.accent"`, `"$font.size.heading"` — as readily as a literal, so a scene authored against the theme follows a retheme.

### `button`

`properties`:

| Key | Default | Meaning |
| --- | --- | --- |
| `text` | | Label |
| `onClick` | | Scene name to switch to. Must be registered |
| `action` | | Behaviour name. `settings` opens the mounted settings menu. Others, and `settings` with no menu mounted, go to the scene's `onAction` hook |
| `width`, `height` | `200`, `44` | Size in UI units |
| `variant` | `secondary` | `primary`, `secondary`, `ghost` or `danger`. What the button *means*; the theme decides how each looks in every interaction state |
| `background`, `textColor` | from the variant | Override the resting fill or label colour. The hover and pressed states stay intact |
| `fontSize`, `fontFamily` | `$font.size.body`, the theme's UI face | |
| `fontWeight`, `fontStyle` | from the variant, `normal` | `fontStyle: "italic"` for italic |

Exactly one of `onClick` and `action` is required.

### `text`

`properties`:

| Key | Default | Meaning |
| --- | --- | --- |
| `text` | | The string |
| `fontSize` | `$font.size.body` | |
| `fontFamily` | The theme's UI face | |
| `fontWeight` | `$font.weight.regular` | `100`–`900`; the shipped face is variable, so every step is a real weight |
| `fontStyle` | `normal` | `italic` for italic |
| `color` | `$color.text.primary` | |
| `align` | `left` | `left`, `center` or `right` |

### `image`

| Key | Where | Meaning |
| --- | --- | --- |
| `sprite` | element | A key in `assets.spritesheets`. Required. The name is not checked at validation. A missing sheet fails while the scene is built. The element draws the whole image. Frames are ignored |
| `width`, `height` | properties | Drawn size. Defaults to the image size |
| `scale` | properties | Multiplier, default `1` |

### `rect`

| Key | Where | Meaning |
| --- | --- | --- |
| `width`, `height` | element | Size in UI units |
| `color` | element | Fill colour |
| `fill` | element | `true` covers the whole screen regardless of position and size |
| `interactive` | properties | `true` makes the rect a hit target that blocks events from reaching what is under it |

## Errors

Validation throws `SceneValidationError` from `m2d-engine/core/sceneLoader.js`. The message has the form `Scene '<name>' at <path>: <problem>`, where the path names the exact field at fault. The error also carries `scene` and `path` properties.

The format on this page is defined as data, in `m2d-engine/core/sceneSchema.js`, using the descriptor vocabulary in `m2d-engine/core/schema.js`. The loader validates against those descriptors, and tooling can read the same descriptors to discover the format rather than restate it.

The checks, in addition to key lists and types:

- `objects[].prefab` exists in `prefabs`
- `prefabs.*.actor` is registered
- `prefabs.*.spritesheet`, `background.spritesheet` and `tileLayers[].spritesheet` exist in `assets.spritesheets`
- `tileLayers[].name` is unique, `parallax` is a number or `{ x, y }`, `repeat` is a boolean, `tileSize` and `scale` are positive, `cells` are integer pairs
- `world.projection` names a known projection with a positive `ratio`
- `physics.footprint.height` is positive
- `objects[].zIndex` and `world.sort` take valid values
- `prefabs.*.defaultAnimation` exists on that sheet
- every `objects[].id` and `elements[].id` is present, well-formed and unique within the scene
- `button.onClick` names a registered scene
- `button` has exactly one of `onClick` and `action`
- `button.variant` takes a listed value
- `physics.bodyType` and `physics.shape` take listed values
- `anchor` takes a listed value

## Dimensions

`world.dimensions` decides what the rest of a level may say, so it is checked before the fields that depend on it:

- A collider `shape` must be one its dimension has. `"circle"` in a 3D level and `"sphere"` in a 2D one are both errors naming the level's dimension.
- `z` and `depth` on an object, and `z` on `world.gravity`, are errors in a 2D level rather than fields that quietly do nothing.
- A `footprint` is an error in a 3D level. It fakes depth for a 2D perspective by making the collider the feet; with a real third axis there is nothing to fake.

A level's dimension must match the game's. The engine builds its physics world once, at the dimension `M2D` was constructed with, so a mismatch fails when the scene loads rather than part-way through building it:

```
M2D scene 'yard': the scene is 3D but the game runs 2D physics — construct M2D with { dimensions: 3 } and await initPhysics({ dimensions: 3 })
```

## Versions

A scene declares the format version it was written for, and the loader accepts exactly the one this engine reads. Anything else is refused rather than half-understood:

```
Scene 'level1' at version: scene format 3 is newer than this engine understands (2); upgrade m2d-engine
```

There is no migration step. A format change that existing scenes would fail means bumping `SCENE_VERSION` in `m2d-engine/core/sceneSchema.js` and rewriting the scenes — which is the right trade while scene files live beside the engine that reads them. An editor, which owns files the engine does not, will want upgrades on load; that belongs with the editor, built against what it actually needs.
