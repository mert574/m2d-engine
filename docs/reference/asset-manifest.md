# Asset manifest

A scene can declare everything it needs inside itself (its sprite sheets, its prefabs), and for a small game written by hand that is the easiest thing that works. A manifest is the other way: assets live outside any one scene, each with a stable identity, and scenes reach for them by that identity.

Use one when an asset is shared, or when something other than a text editor will be managing it. Both styles work, and a scene can mix them.

```javascript
import manifest from './assets.json';

game.registerActor('Ghost', Thug);   // actors first: a prefab asset names one
game.loadAssets(manifest);
```

## The uid

Every asset has a **uid**: an identity that is neither its name nor its path. That is the whole point. A texture renamed, a file moved into a different folder, a prefab relabelled: none of it touches the scenes that use the asset, because none of them referred to the thing that changed. The `name` is a label for an editor and for error messages. The `source` is where the bytes happen to live today.

A uid is spelled like a scene object's id: letters, digits, `-`, `_` and `.`, starting with a letter or a digit. An editor generates them; a person writing a manifest by hand can use `hero-sheet`.

## Format

```json
{
  "version": 1,
  "name": "Ash Row",
  "basePath": "",
  "assets": {
    "sheet-zombie": {
      "type": "spritesheet",
      "name": "zombie",
      "source": "textures/characters/zombie.png",
      "import": {
        "frameWidth": 128,
        "frameHeight": 128,
        "animations": { "idle_left": { "frames": [[0, 4]], "fps": 2 } }
      }
    },
    "prefab-zombie": {
      "type": "prefab",
      "name": "zombie",
      "data": {
        "actor": "Ghost",
        "spritesheet": "sheet-zombie",
        "defaultAnimation": "idle_left",
        "physics": { "bodyType": "dynamic", "shape": "circle" }
      }
    }
  }
}
```

| Key | Required | Meaning |
| --- | --- | --- |
| `version` | yes | `1` |
| `name` | no | Project label |
| `basePath` | no | Prefixed onto every `source` |
| `assets` | yes | A map from uid to asset |

An asset is one of two kinds, by `type`.

### `spritesheet`

An **imported** asset: there is a source file, and settings for reading it.

| Key | Required | Meaning |
| --- | --- | --- |
| `type` | yes | `"spritesheet"` |
| `name` | no | Label, and the local name a scene binds it to when it arrives with a prefab |
| `source` | yes | Path to the image, after `basePath` |
| `import` | yes | `frameWidth`, `frameHeight` and `animations`, the same shape a scene's inline sheet has minus the url |

### `model`

| Key | Required | Meaning |
| --- | --- | --- |
| `type` | yes | `"model"` |
| `name` | no | A label |
| `source` | yes | Path to a glTF 2.0 `.glb`, relative to `basePath` |
| `import` | no | Import settings; none yet |

A scene that uses it gets a `models` entry under the local name, for a prefab's `mesh.model`. See [`assets.models`](./scene-format#assets-models).

### `environment`

| Key | Required | Meaning |
| --- | --- | --- |
| `type` | yes | `"environment"` |
| `name` | no | A label |
| `source` | yes | Path to a Radiance `.hdr` panorama, relative to `basePath` |
| `import` | no | `intensity`, which scales the panorama's radiance |

A scene that uses it gets an `environments` entry under the local name, which a 3D scene hands to `frame.environment`. See [`assets.environments`](./scene-format#assets-environments).

### `prefab`

An **authored** asset: there is no file, the asset is the data.

| Key | Required | Meaning |
| --- | --- | --- |
| `type` | yes | `"prefab"` |
| `name` | no | Label |
| `data` | yes | `actor`, `spritesheet`, `defaultAnimation`, `physics`, `constraints`, `mesh`, `light` |

`data` is a prefab exactly as a scene declares one, with one difference: the assets it names are **uids**, not scene-local names, because an asset cannot see a scene's names. That is its `spritesheet` and, for a 3D prefab, its `mesh.model`. When a scene uses the prefab, both come along with it.

A 3D prefab is therefore shareable on the same terms as a 2D one:

```json
"prefab-lamp": {
  "type": "prefab",
  "name": "lamp",
  "data": {
    "actor": "Lamp",
    "mesh": { "model": "model-lamp", "castShadow": false },
    "light": { "type": "point", "color": "#ffd9a0", "intensity": 12, "range": 24 },
    "physics": { "bodyType": "static", "shape": "cylinder" }
  }
}
```

## Using assets in a scene

A scene binds the uids it wants to short local names in its `uses` block, and reads normally after that:

```json
{
  "version": 3,
  "type": "level",
  "name": "row",
  "uses": { "zombie": "prefab-zombie", "goblin": "prefab-goblin" },
  "layers": [{
    "name": "row",
    "objects": [{ "id": "z1", "prefab": "zombie", "x": 400, "y": 200 }]
  }]
}
```

This keeps scene files legible and reviewable (the body says `"prefab": "zombie"`, not a uid) while identity rests on something a rename cannot break. Godot's `ext_resource` block works the same way.

A used asset joins the block a scene would have written it in: a sprite sheet `assets.spritesheets`, a model `assets.models`, an environment `assets.environments`, a prefab `prefabs`. By the time anything builds from the scene there is one kind of each, whichever way they arrived.

A prefab brings its sheet and its mesh's model with it, each bound under that asset's `name`, or under its uid if that name is already taken by the scene.

A name that is both used and declared inline is an error. A silent precedence rule there would mean one of the two quietly losing.

## Errors

`game.loadAssets` throws `AssetManifestError` from `m2d-engine/core/assets.js`, with the message `Asset manifest at <path>: <problem>` and a `path` property. The checks:

- `version` is the current one
- every key in `assets` is a well-formed uid, and every entry a known `type`
- an imported asset has a `source`, and a sprite sheet has `frameWidth` and `frameHeight`
- a prefab's `actor` is registered, when the database is loaded through `game.loadAssets`
- a prefab's `spritesheet` names an asset that exists and is a sprite sheet
- a prefab's `mesh.model` names an asset that exists and is a model, checked when a scene uses the prefab

Problems with a scene's `uses` block are scene errors and throw `SceneValidationError`, like the rest of the scene format.

## API

`game.assets` is an `AssetDatabase`, empty until `loadAssets`.

| Member | Meaning |
| --- | --- |
| `game.loadAssets(manifest)` | Validate and index a manifest, replacing anything loaded before |
| `assets.has(uid)` / `get(uid)` | Whether an asset is loaded; its raw entry or `null` |
| `assets.uids` | Every loaded uid |
| `assets.spritesheet(uid)` | The sheet in the shape a scene declares inline, url included |
| `assets.model(uid)` | The model in the shape a scene declares inline: `{ url }` |
| `assets.environment(uid)` | The environment in the shape a scene declares inline: `{ url, intensity }` |
| `assets.prefab(uid, sheetName, modelName)` | The prefab in the shape a scene declares inline, its sheet and `mesh.model` uids mapped through `sheetName` and `modelName` |
