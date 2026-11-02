# Scene format

A scene is a JSON object. The loader rejects any key that is not listed here and any reference that does not resolve. Version is always the number `1`.

## Top level

| Key | Scene types | Required | Meaning |
| --- | --- | --- | --- |
| `version` | both | yes | `1` |
| `type` | both | yes | `"level"` or `"ui"` |
| `name` | both | no | Free text. Error messages use the registered name |
| `title` | both | no | Free text, unused by the engine |
| `gameType` | level | no | Free text, unused by the engine |
| `world` | level | no | See below |
| `assets` | both | no | See below |
| `prefabs` | level | no | See below |
| `layers` | level | no | See below |
| `background` | level | no | See below |
| `elements` | ui | yes | See below |

## `world`

| Key | Meaning |
| --- | --- |
| `gravity` | `{ "x", "y" }` in px/s². Applied to the physics world when the scene loads |

Other keys under `world` are accepted and ignored.

## `assets.spritesheets`

A map from sheet name to sheet. The checks below run for level scenes. A UI scene's sheets are loaded without them.

| Key | Required | Meaning |
| --- | --- | --- |
| `url` | yes | Image path, prefixed with the engine's `basePath` |
| `frameWidth` | yes | Frame width in pixels, greater than 0 |
| `frameHeight` | yes | Frame height in pixels, greater than 0 |
| `animations` | no | Map from animation name to `{ "frames" }` |

`frames` is a non-empty array of `[tileX, tileY]` pairs. A sheet without `animations` gets one named `default` at `[0, 0]`.

## `prefabs`

A map from prefab name to prefab.

| Key | Required | Meaning |
| --- | --- | --- |
| `actor` | yes | A name passed to `game.registerActor` |
| `spritesheet` | no | A key in `assets.spritesheets` |
| `defaultAnimation` | no | An animation on that sheet. Defaults to `default` |
| `physics` | no | Body settings, below |

### `prefabs.*.physics`

| Key | Values | Default |
| --- | --- | --- |
| `bodyType` | `"static"`, `"dynamic"`, `"kinematic"`, `"character"` | `"dynamic"` |
| `shape` | `"box"`, `"circle"`, `"capsule"` | `"box"` |
| `friction` | number. `0` falls back to the default | `0.1` |
| `frictionAir` | number, fraction of velocity lost per 1/60 s. `0` falls back to the default | `0.01` |
| `restitution` | number | `0` |
| `lockRotation` | boolean | `false` |
| `isSensor` | boolean | `false` |

Keys other than `bodyType` and `shape` are not validated, and unknown keys inside `physics` are ignored.

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
| `prefab` | yes | | A key in `prefabs` |
| `x`, `y` | yes | | Centre position in world units |
| `width`, `height` | no | `32` | Size in world units. A circle's diameter is `width` |
| `angle` | no | `0` | Rotation in radians |
| `id` | no | | Free value |
| `properties` | no | `{}` | Passed to the actor constructor as `options` |

## `background`

| Key | Required | Default | Meaning |
| --- | --- | --- | --- |
| `spritesheet` | yes | | A key in `assets.spritesheets` |
| `tileX`, `tileY` | no | `0` | The frame to tile across the world |

## `elements`

An array of UI elements. Every element accepts these keys.

| Key | Required | Meaning |
| --- | --- | --- |
| `type` | yes | `"button"`, `"text"`, `"image"` or `"rect"` |
| `id` | no | Free value |
| `x`, `y` | yes for all but a filled rect | Offset from the anchor, in UI units |
| `anchor` | no | One of `top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom`, `bottom-right`. Default `top-left` |
| `properties` | no | Type-specific, below |

### `button`

`properties`:

| Key | Default | Meaning |
| --- | --- | --- |
| `text` | | Label |
| `onClick` | | Scene name to switch to. Must be registered |
| `action` | | Behaviour name. `settings` opens the mounted settings menu. Others, and `settings` with no menu mounted, go to the scene's `onAction` hook |
| `width`, `height` | `200`, `40` | Size in UI units |
| `fontSize`, `fontFamily` | `16px`, `system-ui` | |
| `backgroundColor`, `hoverColor`, `textColor` | `#000`, `#333`, `#fff` | |

Exactly one of `onClick` and `action` is required.

### `text`

`properties`:

| Key | Default | Meaning |
| --- | --- | --- |
| `text` | | The string |
| `fontSize` | `16px` | |
| `color` | `#000` | |
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

Validation throws `SceneValidationError` from `m2d-engine/core/sceneLoader.js`. The message has the form `Scene '<name>' at <path>: <problem>`. The error also carries `scene` and `path` properties.

The checks, in addition to key lists and types:

- `objects[].prefab` exists in `prefabs`
- `prefabs.*.actor` is registered
- `prefabs.*.spritesheet` and `background.spritesheet` exist in `assets.spritesheets`
- `prefabs.*.defaultAnimation` exists on that sheet
- `button.onClick` names a registered scene
- `button` has exactly one of `onClick` and `action`
- `physics.bodyType` and `physics.shape` take listed values
- `anchor` takes a listed value
