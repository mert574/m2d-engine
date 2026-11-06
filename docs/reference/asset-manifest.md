# Asset manifest

A scene can declare everything it needs inside itself — its sprite sheets, its prefabs — and for a small game written by hand that is the simplest thing that works. A manifest is the other way: assets live outside any one scene, each with a stable identity, and scenes reach for them by that identity.

Use one when an asset is shared, or when something other than a text editor will be managing it. Both styles work, and a scene can mix them.

```javascript
import manifest from './assets.json';

game.registerActor('Ghost', Thug);   // actors first: a prefab asset names one
game.loadAssets(manifest);
```

## The uid

Every asset has a **uid**: an identity that is neither its name nor its path. That is the whole point. A texture renamed, a file moved into a different folder, a prefab relabelled — none of it touches the scenes that use the asset, because none of them referred to the thing that changed. The `name` is a label for an editor and for error messages. The `source` is where the bytes happen to live today.

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

### `prefab`

An **authored** asset: there is no file, the asset is the data.

| Key | Required | Meaning |
| --- | --- | --- |
| `type` | yes | `"prefab"` |
| `name` | no | Label |
| `data` | yes | `actor`, `spritesheet`, `defaultAnimation`, `physics`, `constraints` |

`data` is a prefab exactly as a scene declares one, with one difference: its `spritesheet` is a **uid**, not a scene-local name. An asset cannot see a scene's names. When a scene uses the prefab, that sheet comes along with it.

## Using assets in a scene

A scene binds the uids it wants to short local names in its `uses` block, and reads normally after that:

```json
{
  "version": 2,
  "type": "level",
  "name": "row",
  "uses": { "zombie": "prefab-zombie", "goblin": "prefab-goblin" },
  "layers": [{
    "name": "row",
    "objects": [{ "id": "z1", "prefab": "zombie", "x": 400, "y": 200 }]
  }]
}
```

This keeps scene files legible and reviewable — the body says `"prefab": "zombie"`, not a uid — while identity rests on something a rename cannot break. Godot's `ext_resource` block works the same way.

A used sprite sheet joins `assets.spritesheets` under its local name; a used prefab joins `prefabs`. By the time anything builds from the scene there is one kind of sprite sheet and one kind of prefab, whichever way they arrived.

A prefab brings its sheet with it, bound under the asset's `name`, or under its uid if that name is already taken by the scene.

A name that is both used and declared inline is an error. A silent precedence rule there would mean one of the two quietly losing.

## Errors

`game.loadAssets` throws `AssetManifestError` from `m2d-engine/core/assets.js`, with the message `Asset manifest at <path>: <problem>` and a `path` property. The checks:

- `version` is the current one
- every key in `assets` is a well-formed uid, and every entry a known `type`
- an imported asset has a `source`, and a sprite sheet has `frameWidth` and `frameHeight`
- a prefab's `actor` is registered, when the database is loaded through `game.loadAssets`
- a prefab's `spritesheet` names an asset that exists and is a sprite sheet

Problems with a scene's `uses` block are scene errors and throw `SceneValidationError`, like the rest of the scene format.

## API

`game.assets` is an `AssetDatabase`, empty until `loadAssets`.

| Member | Meaning |
| --- | --- |
| `game.loadAssets(manifest)` | Validate and index a manifest, replacing anything loaded before |
| `assets.has(uid)` / `get(uid)` | Whether an asset is loaded; its raw entry or `null` |
| `assets.uids` | Every loaded uid |
| `assets.spritesheet(uid)` | The sheet in the shape a scene declares inline, url included |
| `assets.prefab(uid, sheetName)` | The prefab in the shape a scene declares inline, its sheet uid mapped through `sheetName` |
