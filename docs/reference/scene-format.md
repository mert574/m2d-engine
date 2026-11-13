# Scene format

A scene is a JSON object. The loader rejects any key that is not listed here and any reference that does not resolve. The current format version is `4`; see [Versions](#versions).

## Top level

| Key | Scene types | Required | Meaning |
| --- | --- | --- | --- |
| `version` | both | yes | The format version the scene is written for. The current one is `4` |
| `type` | both | yes | `"level"` or `"ui"` |
| `name` | both | no | Free text. Error messages use the registered name |
| `title` | both | no | Free text, unused by the engine |
| `generator` | both | no | Path of the script that owns this file, when a script regenerates the scene rather than people editing it. The next run of the script overwrites hand edits, so the editor shows the scene read-only while this is set, the editor's host refuses edits to it (except deleting this field, which detaches the scene) and refuses to save it. No shipped scene carries one: the examples' layout scripts are seeds that write a scene once and leave it to the editor. The engine ignores it |
| `gameType` | level | no | Free text, unused by the engine |
| `uses` | both | no | External assets by uid. See [Asset manifest](./asset-manifest#using-assets-in-a-scene) |
| `world` | level | no | See below |
| `assets` | both | no | See below |
| `prefabs` | level | no | See below |
| `layers` | level | no | See below |
| `background` | level | no | See below |
| `tileLayers` | level | no | See below |
| `paths` | level | no | See below |
| `elements` | ui | yes | See below |

## `world`

| Key | Meaning |
| --- | --- |
| `dimensions` | `2` (default) or `3`. How many axes the simulation has. A 3D level needs a game built for it: `initPhysics({ dimensions: 3 })` and `new M2D(canvas, { dimensions: 3 })`. A 3D level is in metres with up along `+y`, so positions and sizes are metre-scale and the default object size of 32 is far too big; give every 3D object a `width` and `height`. See [Three dimensions](./physics#three-dimensions) |
| `width`, `height` | Size of the playable area in world units. A level that sets them is the game's world size while it shows: tile layers, the kill plane and `"world"` camera bounds read it. A level that leaves them out uses the size the game was made with |
| `gravity` | `{ "x", "y" }` in px/s² with down along `+y`; in a 3D level `{ "x", "y", "z" }` in m/s² with down along `-y`, so Earth is `{ "x": 0, "y": -9.81, "z": 0 }`. Applied to the physics world when the scene loads |
| `projection` | How the ground plane is seen: `"isometric"` or `"belt"`, or `{ "type", "ratio" }`. Isometric draws a ground square as a `2:ratio·2` diamond; belt keeps x and compresses y by `ratio`. Positions are drawn through it; physics stays flat. See [Perspectives](../guide/perspectives#isometric-a-projection-on-positions) |
| `environment` | A 3D level only: a key in `assets.environments`. That HDR panorama lights the level and is its sky, in play and in the editor. A scene's `onRender` hook may still set `frame.environment` itself, and that wins |
| `sort` | Entity draw order within a `zIndex`. `"depth"` (default) draws by the bottom edge of the body, so whatever stands lower on the ground is in front. `"insertion"` keeps scene order. See [Perspectives](../guide/perspectives) |
| `player` | The id of the placed object that is the player: `game.player` when the scene shows, and what the camera follows unless `camera.follow` says otherwise |
| `camera` | How the level is seen, applied when the scene shows (not in the editor, whose camera is its own). 2D: `mode` (`follow`, `scroll`, `rooms`), `follow` (an object id), `zoom`, `lerp`, `followAxes { x, y }`, `scrollVelocity { x, y }` (scroll mode: how fast the view travels on its own, px/s), `bounds` (`"world"` for the world's size, or `{ left, top, right, bottom }`), `followRotation`, `rotationLerp`, `rotationMaxRate`. 3D: `mode` (`orbit`, `free`), `distance`, `yaw`, `pitch`, `minDistance`, `maxDistance`, `minPitch`, `maxPitch`, `fov`, `targetOffset`. Nested blocks merge over the camera's defaults, so a scene may set one axis. The view opens on its target, and a camera with nothing to follow opens inside its bounds. Three controls listen to the player: `wheelZoom { speed, min, max }` zooms with the wheel (2D between `min` and `max`, default 0.25 and 4; 3D between `minDistance` and `maxDistance`; `speed` 0.0015 per wheel unit), `orbitDrag { yaw, pitch }` turns a 3D orbit by a drag (0.005 and 0.004 rad/px), and `speedZoom { out, at, ease }` pulls a 2D view out by the fraction `out` (0.2) as the followed object reaches `at` px/s (600), easing by `ease` (0.05) |
| `lighting` | The light the level stands in, applied in the editor too. 2D: `ambient`, a colour that switches lighting on (actors add their lights with `drawLight`), and `fallback`, a wash laid over the view on a renderer without lights (Canvas) in its place. 3D: `sun { direction, color, intensity }`, `sky` and `ground` ambient colours with `ambientIntensity`, `fog { color, density }`, `exposure`, `shadowDistance`, `wind { direction { x, z }, strength, gust }` (what sways the foliage: 0 is still air, 1 a stiff breeze that moves a ten-metre crown about half a metre; `gust`, 0 to 1, how much comes in waves rolling downwind). A scene's `onRender` hook may change any of them afterwards, which is how a day and night cycle moves them |
| `post` | The full-screen pass. Each block is what the renderer takes: 2D `bloom { threshold, strength, blur }`, `vignette { strength, start }`, `grade { shadows, highlights, amount, saturation, contrast }`, `chromatic`, `distortion`, `grain`, `scanlines`, `blur`, `glitch { strength }`, `flash { strength, color }`; 3D `bloom { threshold, intensity, scatter }`, `vignette`, `grain` (numbers), `grade { saturation, contrast, temperature }`, `dof { focalLength, fStop, maxBlur }` (the focus follows the camera's target), `autoExposure`. Blocks a renderer does not know are ignored |
| `music` | `{ track, volume }`: a key in `assets.music` (or one the game loaded), played when the scene shows and stopped when it leaves. Not in the editor |
| `cycle` | A turn of the light: `states`, at least two, each a name with the `lighting` and `post` that differ from the level's resting ones; `period` seconds for a full turn and back to the first (0 to move it by hand); `phase`, where it starts; `ease`, how fast the phase approaches a target per second. Game code moves it with `scene.cycle.target = 1` (or `phase` to jump); a rule's `cycle` action does the same. Blended state by state: numbers lerp, colours mix. The editor shows the level at `phase` |
| `particles` | Stateless particle fields. 2D: `kind` `fireflies` (wandering and pulsing), `leaves` (falling and turning), `rain` (slanted streaks) or `sparks` (rising and fading), with `count`, `radius` (px), `color`, `opacity`, `speed` (px/s), `emissive` (in a lit level each bright one also draws a small light), `front` (drawn over the entities; leaves, rain and sparks by default), `seed`, and `follow` (true: the field covers the view; false: the box `at` ± `extent`). Drawn in the editor too. 3D: fields of particles drawn blended over the level, at most sixteen. Each is `{ kind, count, at, extent, radius, color, opacity, emissive, speed, follow }`: `kind` `motes` (dust and pollen through a box of half sizes `extent`, centred on the camera unless `follow` is false and then on `at`, carried by `world.lighting.wind` and wandering `speed` metres) or `smoke` (rising from `at` at `speed` metres a second through a column `extent.y` metres in half-height, widening by `extent.x` and `extent.z`, leaning downwind). `radius` is a particle's size in metres, `emissive` a glow as a multiple of the colour. Stateless: see [particle fields](./renderer#three-dimensions) |
| `clearColor` | What the view is cleared to under everything while the scene shows. The game's `clearColor` option otherwise (`#000`) |
| `sky` | 2D: `{ top, bottom, middle, horizon }`, a vertical gradient over the view behind the level; `middle` sits at `horizon` (0.5) down the view |
| `scatter` | 2D: seeded layers behind the level, each `{ kind, count, seed, color, size, opacity, parallax, speed, twinkle, band { top, bottom } }`. `kind` is `stars` (twinkling by `twinkle`), `clouds` (soft puffs drifting at `speed` px/s) or `motes` (rising specks). Laid out from `seed` across the view, so a layer has no edge; `parallax` 0 is fixed to the view and 1 moves with the world; `band` keeps it to a part of the view, as fractions from the top |
| `ambience` | Looping sounds while the scene shows: each `{ sound, volume, fadeIn, rate }`, `sound` a key in `assets.sounds`, faded in from silence over `fadeIn` seconds (1) and stopped when the scene leaves. Not in the editor |
| `counters` | Numbers the rules and the HUD read by name. A plain counter is `{ initial, min, max }` (initial 0): it changes through a rule's `count` action and is held between `min` and `max` where it gives them, so a score cannot go negative and a dial a key turns stops at the end of its travel without every rule that moves it saying so (a tally, which nothing sets, refuses them). A tally is `{ prefab, count }`: how many of the prefab's objects the scene `placed`, how many are `remaining`, or how many are gone (`taken`, the default), read off the world each time. Snapshots carry plain counters. Online, a client's tallies follow the world it is sent, while its plain counters stay at `initial` (they are counted on the server) |
| `postBind` | Post fields that follow a value in play: each `{ effect, field, bind, empty, full }` sets `post[effect][field]` (field `strength` by default) between `empty` (at a reading of 0) and `full` (at 1). `bind` is a meter's (see [`hud`](#hud)): the player's health by default. The damage tear as health falls |
| `gravityBind` | Axes of gravity that follow a counter: each `{ counter, axis }` (axis `y` by default) sets that component of `world.gravity` from `world.counters[counter]` every tick, after the rules have run. A counter it names must be declared, as a rule's must. A rule turns the counter and the fall changes with it, and the HUD shows the same counter as a `{name}` text. Axes nobody binds are left where the world put them |
| `killPlane` | 2D: the `y` below which the player is lost; the world's height plus 50 by default. Crossing it fires the `fall` rules, or ends the game when there are none |
| `rules` | What happens when, run by the engine each tick (headless too; not in the editor). See [Rules](#rules) |

## `assets.spritesheets`

A map from sheet name to sheet. The checks below run for level scenes. A UI scene's sheets are loaded without them.

| Key | Required | Meaning |
| --- | --- | --- |
| `url` | yes | Image path, prefixed with the engine's `basePath` |
| `frameWidth` | yes | Frame width in pixels, greater than 0 |
| `frameHeight` | yes | Frame height in pixels, greater than 0 |
| `animations` | no | Map from animation name to `{ "frames" }` |

`frames` is a non-empty array of `[tileX, tileY]` pairs. An animation may also give `fps` (frames per second, default `0`: hold the first frame) and `loop` (default `true`). A sheet without `animations` gets one named `default` at `[0, 0]`.

## `assets.models`

A map from model name to model, for a 3D level. A model is a glTF 2.0 `.glb` file, in metres with y up, the 3D world's own conventions, so nothing is converted. Its meshes, node transforms, metallic-roughness materials, base colour, metallic-roughness and emissive textures, skins and animation clips are read. An entity whose model has a skin or a clip gets an `entity.animator`; see [Animation](./renderer#animation).

| Key | Required | Meaning |
| --- | --- | --- |
| `url` | yes | File path, prefixed with the engine's `basePath` |

A prefab draws a model by naming it in its [`mesh`](#mesh) block.

## Rules

`world.rules` is a list of `{ "when", "then", "once" }`. `when` names an event the scene watches for; `then` is the actions it takes, in order, the first tick the event holds (`once: false` fires every tick it holds).

Rules chain through an optional `id`: `after: [ids]` keeps a rule from firing until every named rule has fired, and `before: [ids]` stops it once any of them has. Rules run in list order each tick, so a chain can complete in one tick. A chained rule needs an event that keeps holding (`enter` while the player stands in it, `death` once gone); `start` holds only on the first tick, so `start` with `after` never fires. Ids are unique, and every `after` and `before` must name one.

| `when.event` | Holds when |
| --- | --- |
| `start` | The scene's first tick |
| `collected` | No object of `prefab` is left (and the scene placed some) |
| `enter` | The player touches `object` (an id): a sensor or a body |
| `death` | `object` (an id, or `"player"`, the default) is dead or gone; with `objects` (a list of placed ids), once every one is: a wave cleared |
| `fall` | The player crossed `world.killPlane` this tick |
| `count` | `counter` (a key in `world.counters`) is at least `atLeast`, or at most `atMost` |
| `action` | A key of the named input `action` went down this tick, for the local player: a single-player rule (online, a player's request is an intent). The project declares actions in `m2d.project.json`; see [Input actions](../guide/input#named-actions) |
| `emit` | Game code raised the world event `name` (`game.events.emit(name)`) since the last tick |
| `notify` | The simulation told the local player `name` (`player.notify(name)`). Heard where the player's screen is, on a client too, after the tick. Its actions may only be `notice`, `objective`, `say`, `sound`, `switch` and `camera`, and its `after` and `before` may only name other notify rules |

| `then[].do` | Does |
| --- | --- |
| `notice` | Shows `text` on a `notice` HUD element for `seconds` (`element` names one; the first otherwise) |
| `objective` | Sets a HUD text's `text` (`element`, default `objective`); `{name}` in it shows a counter |
| `say` | Opens a HUD `dialogue` (`element`, the first by default) on `lines`, with `speaker` over them |
| `count` | Changes a plain counter: `add` to it (1 by default), or `set` it |
| `sound` | Plays the sound `key` |
| `unseal` | Sets `object`'s `active` to true and its `sealed` to false, and calls its `onUnseal()` if it has one |
| `remove` | Removes `object` from the world |
| `set` | Sets `property` on `object` to `value` |
| `switch` | Switches to `scene`, `after` seconds; the scene may be one the page builds in code |
| `gameOver` | Ends the game, `after` seconds |
| `cycle` | Moves `world.cycle`: `target` to ease to, `phase` to jump to, `ease`. With `toggle`, a target it is already going to sends it back to 0: a key that turns the day and turns it back |
| `camera` | Moves the edges it names (`left`, `top`, `right`, `bottom`) of the camera's bounds and keeps the rest: a locked section opening. Nothing headless |

```json
"rules": [
  { "when": { "event": "collected", "prefab": "coin" }, "then": [{ "do": "unseal", "object": "gate" }, { "do": "notice", "text": "THE GATE OPENS" }] },
  { "when": { "event": "enter", "object": "gate" }, "then": [{ "do": "sound", "key": "levelComplete" }, { "do": "switch", "scene": "mainMenu", "after": 3 }] },
  { "when": { "event": "death" }, "then": [{ "do": "gameOver" }] }
]
```

A counter, a key and a world event:

```json
"counters": { "taken": { "prefab": "salvage" }, "total": { "prefab": "salvage", "count": "placed" } },
"rules": [
  { "when": { "event": "count", "counter": "taken", "atLeast": 6 }, "then": [{ "do": "unseal", "object": "gate" }] },
  { "when": { "event": "action", "action": "menu" }, "then": [{ "do": "switch", "scene": "mainMenu" }] },
  { "when": { "event": "emit", "name": "alarm" }, "then": [{ "do": "notice", "text": "THEY HEARD YOU" }] }
]
```

A wave, as Ash Row writes one: its thugs are placed sealed, a zone calls them only once the wave before is cleared, and the door turns the player back until the whole row is.

```json
"rules": [
  { "id": "arm-2", "when": { "event": "enter", "object": "zone-2" }, "after": ["clear-1"], "then": [{ "do": "unseal", "object": "s2-goblin-1" }] },
  { "id": "clear-2", "when": { "event": "death", "objects": ["s2-goblin-1"] }, "after": ["arm-2"], "then": [{ "do": "camera", "right": 3540 }] },
  { "when": { "event": "enter", "object": "door-1" }, "once": false, "before": ["clear-2"], "then": [{ "do": "notice", "text": "NOT YET" }] }
]
```

## `hud`

A level's overlay, drawn over the world and shown in the editor: a list of elements like a UI scene's, with more that read the running game. Every element has an `id`, an `anchor` and `x`, `y` from it. Game code reaches them through `scene.hud.elements`, a map by id — how a hook rewrites an objective line the scene laid out.

| `type` | Fields |
| --- | --- |
| `text` | `properties.text`, `fontSize`, `color`, `align`, `letterSpacing`, `outlineColor`, `outlineWidth`, …; `{name}` in the text shows the counter of that name as it changes (`"SALVAGE {taken} / {total}"`); a rule's `objective` action rewrites it |
| `notice` | A text that is hidden until a rule's `notice` action shows it, and fades after `properties.seconds` (2.5) |
| `meter` | A bar: `width`, `height`, `bind { object, constraint, current, max, ratio }`, the player's `health` slot's `currentHealth` over `maxHealth` by default; an empty `constraint` reads the entity's own fields; `ratio` names a field already between 0 and 1 (`ThrustControl`'s `boostCharge`) and is read instead; `properties.label`, `color`, `background`, `low` with `lowBelow` (0.35) for the bar under the low mark, and `full` for the bar when it is full |
| `minimap` | `size` (width; the height follows the world's shape, or `bounds`), `plot`: prefab name (or `players`, the other players) to a dot colour or `{ shape: dot\|ring\|square\|area\|trail, color, size, by }`. `area` draws a disc the entity's size and `trail` the line the entity gives as its `trail` (an array of points, a worn track). `by { property, values }` changes the style with an entity property: `values` maps the property's value, as text, to the fields that differ (`{ "true": { "color": "#9a70ff" } }` for a sealed gate). `target` (an object id) is ringed, the objective. `properties.background`, `borderColor` |
| `abilityBar` | The slots of an `Abilities` constraint, `bind { object, constraint }` (the player's `abilities` by default), at the bottom centre unless placed. `icons` maps an ability id to a key in `assets.images` (or a sprite sheet). `properties.slot` (50), `gap` (8), `background`, `borderColor` |
| `dialogue` | Spoken lines, typed out, opened by a rule's `say` action. `width` (720), `height` (128), at the bottom centre unless placed; `properties.advance`, the input action that advances it (`interact`; E when the project declares none), or a click, and an empty string when game code drives the conversation; `clock` (`frame`, or `game` to type on game time, for a conversation the tick drives); `charsPerSecond` (46), `textColor`, `nameColor`, `background`, `borderColor` |
| `component` | A HUD widget of the game's own, registered with `game.registerHudComponent(name, make)`: `component` names it, `properties` is handed to it with the element's position |
| `image`, `rect` | As in a UI scene |

## `assets.images`

Whole images by key: `{ "url" }`, relative to the game's `basePath`. A HUD `image` or `abilityBar` icon, a UI `backdrop` still, or an actor property declared `s.ref('image')` names one. Loaded with the scene.

## Asset-reference properties

An actor property declared as `s.ref('spritesheet')` or `s.ref('image')` in its `static properties` names an asset of the scene, and is checked against the scene's sheets or images. The actor receives the loaded `SpriteSheet` or image in its `options`, so art an actor spawns at run time (a ship's flame, a laser) is scene data. Headless, it receives null.

A property declared as a list or a record of refs — `s.array(s.ref('image'))`, `s.record(s.ref('image'))` — is resolved entry by entry the same way. A scenery actor that paints a parallax plane from a handful of silhouettes takes the set the scene names, so which art a plane is made of is the scene's to change:

```json
"properties": { "trees": ["tree-a", "tree-b", "tree-c"] }
```

## `assets.sounds`, `assets.music`

Sound effects and music tracks the scene brings, by key: `{ "url", "volume" }`, the URL relative to the game's `basePath`, the volume 0 to 1 (default 1). Loaded into the sound manager when the scene loads, beside what the game's own options loaded; a key both name is the scene's. Game code plays an effect with `game.soundManager.playSound(key)`; `world.music` plays a track.

## `assets.environments`

A map from name to HDR environment, for a 3D level. An environment is a Radiance `.hdr` equirectangular panorama, the format Poly Haven and every HDRI library ship, whose pixels carry real radiance instead of 8-bit colour.

| Key | Required | Meaning |
| --- | --- | --- |
| `url` | yes | File path, prefixed with the engine's `basePath` |
| `intensity` | no | Scales the panorama's radiance; `1` by default |

The scene decodes each one into `scene.environments`, by name. Hand it to the frame to use it:

```javascript
onRender(frame) {
  frame.environment = this.environments.get('sky');
}
```

It then *is* the sky: the camera sees the panorama, and the same image is baked into the cubemap that lights every surface, so a reflection and the background agree. The procedural sky's `sun` still lights and casts shadows (the panorama's own sun is in its pixels, where the image-based lighting finds it, but a shadow needs a direction), while `ambient.sky` and `ambient.ground` no longer shape anything. Point the frame's `environment` back at `null` for the built-in sky.

Panoramas are oriented as three.js and Blender orient them: the centre of the image faces `+x`, so an HDRI's sun lands where its author put it.

## `prefabs`

A map from prefab name to prefab.

| Key | Required | Meaning |
| --- | --- | --- |
| `actor` | yes | A name passed to `game.registerActor` |
| `spritesheet` | no | A key in `assets.spritesheets` |
| `defaultAnimation` | no | An animation on that sheet. Defaults to `default` |
| `physics` | no | Body settings, below |
| `mesh` | no | How a 3D level draws it, below. 3D levels only |
| `light` | no | A light it carries, below |
| `constraints` | no | Behaviours to attach, below |
| `properties` | no | What every object of this prefab starts with, checked against the actor's `static properties`. A placed object's own `properties` override them field by field, so a prefab placed a hundred times says which art and which numbers it is made of once |

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
| `category` | A collision category: a `CollisionCategories` name (`player`, `enemy`, `platform`, `movingPlatform`, `coin`, `trigger`, `projectile`) or a bit | `"default"` |
| `mask` | What the body collides with: a list of category names, or a bit mask | everything |
| `angle` | number, radians. An object's own `angle` overrides it | `0` |
| `density` | number greater than 0. Mass is density times area | the engine default |
| `footprint` | `{ "height", "width" }` | none |

A `footprint` makes the collider the object's feet: a box `footprint.height` tall (and `footprint.width` wide, default the object's width) at the bottom of the object's rectangle. The sprite keeps the object's full size and stands above the collider, so a character can walk behind a tree whose trunk is the only solid part. The entity's `depth` is then the feet, which is what the default draw order sorts by. `height` must be positive; both are capped at the object's size.

An unknown key inside `physics` is an error, like everywhere else in the format.

### `mesh`

How a prefab is drawn in a 3D level, where there are no sprites. Without a `mesh` block an entity draws its collider's shape in grey; a block chooses a shape and a material. In a 2D level a `mesh` is an error.

| Key | Values | Default |
| --- | --- | --- |
| `model` | A key in `assets.models`. Drawn instead of a shape, with the file's own materials (textures, normal and occlusion maps, alpha cut-outs, two-sided surfaces) and at the level of detail its distance asks for, when the file carries levels; `color`, `metallic`, `roughness` and `checker` are then ignored and `emissive` adds a glow | none |
| `scale` | number, multiplies the model's own size | `1` |
| `offset` | `{ "x", "y", "z" }` in metres, moving the model against the body; a model whose origin is at its feet wants `y` of minus half the body's height | `0` |
| `animation` | `{ "clip", "loop", "speed" }`: the clip a skinned model plays when it appears. Game code changes it through `entity.animator` | the model's first clip |
| `shape` | `"box"`, `"sphere"`, `"capsule"`, `"cylinder"`, `"plane"` | the collider's shape |
| `color` | A CSS colour, converted to linear light on load | grey |
| `metallic` | `0` to `1` | `0` |
| `roughness` | `0` to `1` | `0.6` |
| `emissive` | number, self-illumination as a multiple of the colour | `0` |
| `emissiveColor` | The glow's own colour, apart from the surface's, as a CSS colour; `emissive` then scales it. A neon tube is a dark body with a bright glow | none |
| `opacity` | Below 1 the shape is drawn blended over what is behind it, from both sides, and casts no shadow: glass, water. With a low roughness and a `specular` above 1 it reads as glass; with a high roughness, frosted | 1 |
| `clearcoat` | A thin glossy lacquer over the surface, 0 to 1, with `clearcoatRoughness` (0 is a mirror finish): car paint over a matte base, varnish over wood, a wet surface | 0 |
| `specular` | Scales the dielectric reflectance, 0 to 2: 1 is glTF's 4 per cent, 0.5 a dull plastic or clay, 1.5 glass or gemstone. Metals ignore it | 1 |
| `checker` | number, metres: a two-tone checker of that cell size on the surface, or `0` | `0` |
| `texture` | `{ "url", "size", "normal", "arm" }`: an image mapped planar along the surface's dominant axis, `size` metres per tile, so a floor and a wall take the same density whatever the shape's own coordinates say. On a static body it is mapped from the world position, so neighbouring pieces tile as one surface; on a body that moves (dynamic, kinematic, a character) it is mapped in the body's own frame, so the texture moves and turns with it. `normal` (optional) is a tangent-space normal map in the OpenGL convention (+Y up), lit in the projection's own frame; `arm` (optional) packs occlusion, roughness and metal in red, green and blue, as Poly Haven ships them and glTF lays them out, and the mesh's `roughness` and `metallic` scale it (set both to 1 to let the map decide). A shape only; a model brings its own | none |
| `visible` | boolean | `true` |

A shape is sized by the object's `width`, `height` and `depth`, like the collider; a model keeps the file's size times `scale`, and the collider is whatever the object says, so a truck's box can be simpler than its body. An object's `overrides.mesh` merges over the prefab's, so one red crate among brown ones needs no prefab of its own. See the [renderer](./renderer#three-dimensions) for what the renderer makes of it.

### `light`

A light the prefab carries, following its body. In a 2D level it is drawn with the renderer's `drawLight` each frame, once `world.lighting.ambient` has switched lighting on: `range` is the radius in px, `offset` is `{ x, y }` in px (and `z`, how high it hangs over shadow casters), a spot's `direction` is `{ x, y }` and its width is `outerCone` either side.

| Key | Values | Default |
| --- | --- | --- |
| `type` | `"point"` or `"spot"` | `"point"` |
| `color` | A CSS colour, converted to linear light on load | white |
| `intensity` | number, radiance at one metre before the inverse-square falloff; `10` is a bright room lamp | `10` |
| `range` | metres; the light fades to nothing here | `10` |
| `offset` | `{ "x", "y", "z" }` in metres from the body's centre | `0` |
| `direction` | `{ "x", "y", "z" }`, where a spot points | straight down |
| `innerCone`, `outerCone` | radians; full brightness inside the inner cone, dark outside the outer | `0.4`, `0.6` |
| `shadow` | boolean; whether the light casts. The nearest few of each kind do, as the `r_shadows` setting allows: a perspective map for a spot, a six-face cube for a point | `true` |

The sun is the scene's, set in `onRender`, not a prefab's. See the [renderer](./renderer#three-dimensions).

## `layers`

An array of layers.

| Key | Required | Meaning |
| --- | --- | --- |
| `name` | no | Free text |
| `type` | no | Free text |
| `objects` | yes | Array of placed objects |
| `props` | no | Scenery placed many times, below. 3D levels only |
| `scenes` | no | Other level scenes placed whole, below |

### `layers[].objects[]`

| Key | Required | Default | Meaning |
| --- | --- | --- | --- |
| `z` | no | `0` | Third axis. A 3D level only |
| `depth` | no | the width | Size on the third axis. A 3D level only |
| `id` | yes | | Identity, unique within the scene. Letters, digits, `-`, `_` and `.`, starting with a letter or digit. Reaches the entity as `entity.sceneId`, and the scene as `scene.entitiesById` |
| `prefab` | yes | | A key in `prefabs` |
| `x`, `y` | yes | | Centre position in world units |
| `width`, `height` | no | `32` | Size in world units. A circle's diameter is `width` |
| `angle` | no | `0` | Rotation in radians. A 2D level only: a 3D level rejects it |
| `rotation` | no | none | A 3D level only: the orientation as a unit quaternion `[x, y, z, w]`, the form the 3D physics reads. It is normalized when the body is built; `[0, 0, 0, 0]` is rejected. The editor shows it as yaw, pitch and roll in degrees (yaw about +y, then pitch about +x, then roll about +z, applied roll first) and writes the quaternion back |
| `zIndex` | no | `0` | Draw order. Entities and tile layers draw in ascending `zIndex`; within one, entities draw by `world.sort` |
| `constraints` | no | | Behaviours to attach or retune for this one object, below |
| `overrides` | no | | What this object changes about its prefab, below |
| `properties` | no | `{}` | Passed to the actor constructor as `options` |

### `layers[].props[]`

A prefab placed many times as scenery, in a 3D level. A prop is presentation and, if it asks, a static collider: it has no entity, so the prefab's `physics` is not read and game code cannot find it. What it has is the prefab's `mesh`, which is required, drawn from instance records the scene builds once at load and the renderer keeps on the GPU, and the prefab's `light` if it carries one, placed at every instance with its `offset` turned and scaled along. Ten thousand trees cost the CPU nothing per frame. A `mesh.model` that is skinned cannot be a prop; it has no joints to pose.

| Key | Required | Default | Meaning |
| --- | --- | --- | --- |
| `id` | yes | | Identity, unique within the scene like an object's |
| `prefab` | yes | | A key in `prefabs`; the prefab must have a `mesh` |
| `width`, `height`, `depth` | no | `32`, `32`, the width | Size in metres of a shape prop, before each instance's scale. A model keeps the file's size times `mesh.scale` |
| `castShadow` | no | `true` | Whether the instances cast shadows. The prefab's `mesh.castShadow` applies too; either being `false` turns casting off, as a lantern's glowing shell needs |
| `collider` | no | `"none"` | What the instances collide as: `"none"` (grass), `"bounds"` (a static body the size of the drawn thing, placed and turned with it), or `{ "shape", "width", "height", "depth" }`, a `box`, `cylinder` or `sphere` standing on the instance's origin, in metres before the instance's scale: a tree wants a trunk, not its canopy. No entity is made; the body only stops things |
| `instances` | yes | | An array of `[x, y, z, yaw, scale]` tuples: position in metres, a turn about the up axis in radians, and a multiplier on the size |

```json
"props": [{
  "id": "trees", "prefab": "tree", "width": 0.5, "height": 3,
  "instances": [[12, 1.5, -4, 0, 1], [15.5, 1.8, -3, 1.2, 1.2]]
}]
```

Props stream. A model that only props use is loaded when the camera comes near one of its instances and released when it goes away again; see [streaming](./renderer#three-dimensions). The instances' colliders are built once at load and stay, so what a prop blocks does not depend on where the camera is.

In a 2D level `props` is an error. The yard example's lot (`?scene=lot`) is laid out this way by `examples/scripts/buildLotScene.mjs`.

### `layers[].scenes[]`

Composition: another level scene placed whole inside this one, the way a Godot scene is instanced. The named scene must be registered with the game (and, for the loader to expand it, registered with a `fetch` that returns its JSON: the scene manager fetches what a level instances before loading it).

| Key | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Identity, unique with the objects and props. It prefixes everything the instance brings: the room's `crate` becomes `room-1/crate`, so a composed thing can never collide with an authored one (an id cannot hold a slash) |
| `scene` | yes | The scene's registered name. A level of the same dimension; a scene may not contain itself |
| `x`, `y`, `z` | `x`, `y` | Where the inner scene's origin lands |
| `angle` | no | 2D: the instance turned about its origin, in radians |
| `yaw` | no | 3D: the instance turned about the up axis, in radians; composed objects' `rotation` and props' yaw turn with it |
| `overrides` | no | By inner object id, fields written over that object before placement — `"crate": { "y": 2.5, "width": 2 }`. An override's `x` and `y` stay relative to the instance |

The inner scene's prefabs and assets join the level under the same prefix (`room-1/crate` the prefab, `room-1/crate` its model), its objects and props are placed and turned, and each composed object carries `composed: "<instance id>"` in the loaded scene. The inner scene's tile layers, background, HUD, rules, camera and look are **not** carried: those belong to the level that is played. Instances nest (a room can hold a cupboard scene).

## `overrides`

What one placed object changes about its prefab, so a heavier crate or a recoloured guard needs no prefab of its own. Placement (`x`, `width`, `angle`, `zIndex`) is the object's own and sits at the top level; this is the prefab's definition.

| Key | Meaning |
| --- | --- |
| `spritesheet` | A key in `assets.spritesheets` |
| `defaultAnimation` | An animation on that sheet |
| `physics` | Body settings, merged field by field over the prefab's |
| `mesh` | Drawing settings in a 3D level, merged field by field over the prefab's |
| `light` | Light settings in a 3D level, merged field by field over the prefab's |

```json
{ "id": "heavy-crate", "prefab": "crate", "x": 300, "y": 200,
  "overrides": { "physics": { "friction": 0.9, "density": 0.004 } } }
```

`physics` merges, so an override can change the friction without restating the body type. `actor` is deliberately not overridable: a different actor is a different prefab.

## `constraints`

A map from **slot name** (the name `entity.getConstraint` uses) to an entry. A prefab's constraints apply to every instance; an object's apply to that one, merged over the prefab's.

| Key | Required | Meaning |
| --- | --- | --- |
| `type` | see below | A name passed to `game.registerConstraint` |
| `params` | no | The constraint's tunables, validated against its `static params` |

`type` may be omitted when the entry only retunes a constraint that is already there: one the actor attached in its constructor, or one the prefab declared. An entry for an empty slot with no `type` is an error when the scene builds.

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

An entry merges instead of replacing: `guard-2` chases faster and keeps every other param the prefab set. Params are checked against the constraint class wherever this document names it, on the prefab or on an object whose prefab declared the same slot. An override of a constraint an *actor* attached names no type anywhere in the file, so its params are checked when the scene builds instead, with the same messages.

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

## `paths`

Named lines through the level, by name: a patrol route, a platform's track. A `PathFollow` follows one by naming it in its `path` option, so several objects can share one route and the editor draws and edits it once.

| Key | Required | Default | Meaning |
| --- | --- | --- | --- |
| `points` | yes | | Two or more `{ x, y }` points, `{ x, y, z }` in a 3D level. A 2D level refuses a `z`. A point may also carry `w`, a half-width: the engine only carries it, and a game that draws a place along the path — a road, a river — reads it off `scene.paths.get(name).points` |
| `closed` | no | `false` | Join the last point back to the first |
| `smooth` | no | `false` | Curve through the points (centripetal Catmull-Rom) instead of joining them with straight segments |

```json
"paths": {
  "lift": { "points": [{ "x": 950, "y": 700 }, { "x": 950, "y": 430 }] }
},
"layers": [{ "name": "main", "objects": [
  { "id": "lift-1", "prefab": "movingPlatform", "x": 950, "y": 700, "properties": { "path": { "path": "lift", "speed": 160 } } }
] }]
```

A path name follows the rules of an `id`. A `path` naming a path the scene does not declare is an error at load, with the names it does declare. An instanced scene's paths compose under the instance's prefix (`room-1/lift`), placed and turned with it, and its objects still name them as `lift`.

## `elements`

An array of UI elements. Every element accepts these keys.

| Key | Required | Meaning |
| --- | --- | --- |
| `type` | yes | `"button"`, `"menuItem"`, `"text"`, `"image"`, `"rect"` or `"backdrop"` |
| `id` | yes | Identity, unique within the scene. Same spelling rules as an object's |
| `x`, `y` | yes for all but a filled rect | Offset from the anchor, in UI units |
| `anchor` | no | One of `top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom`, `bottom-right`. Default `top-left` |
| `properties` | no | Type-specific, below |
| `effects` | no | `{ enter, select, exit }`. `enter` and `exit` are `{ motion, duration, delay }`, `motion` one of `fade`, `slide-up`, `slide-down`, `slide-left`, `slide-right`, `scale`, `drop` (falls in and settles) or `type` (the text types itself out). `select` is what the element does while selected by the pointer or the keys: `glow`, `shake`, `pulse`, `lift` or `none`. Not in the editor, which shows every element at rest |

The scene itself may give `transition { enter, exit, duration }` (each `none`, `fade`, `slide-up`, `slide-down` or `scale`), how the whole screen arrives and leaves; `stagger`, seconds added to each entering element's delay in document order; and `music { track }`, a key in `assets.music` played when the scene shows. A switch away waits for the exits and the leaving transition, at most 1.5 s.

Every colour and size accepts a [theme token](./ui#theme-tokens) such as `"$color.text.accent"` or `"$font.size.heading"` as readily as a literal, so a scene authored against the theme follows a retheme.

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

### `menuItem`

A line of a game menu: type, with a mark that eases in when it is selected. `properties`:

| Key | Default | Meaning |
| --- | --- | --- |
| `text` | | Label |
| `onClick`, `action` | | As a `button`'s; exactly one |
| `variant` | `bar` | How selection shows: `bar` (a bar in the margin, the line stepping right), `bracket` (chevrons either side), `underline` (a rule growing from the middle), `block` (a filled band behind inverted type) or `dot` (a bead before it) |
| `align` | `left` | `left`, `center` or `right` |
| `width`, `height` | `340`, `44` | |
| `uppercase` | `true` | |
| `fontSize`, `fontFamily`, `fontWeight`, `letterSpacing` | `$font.size.subheading`, the UI face, `$font.weight.medium`, `$font.tracking.wide` | |
| `color`, `selectedColor`, `accentColor` | `$color.text.secondary`, `$color.text.primary`, `$color.accent.default` | Resting label, selected label, the mark |

### `backdrop`

What a menu sits on: the whole screen, under everything after it. It has no position. `sprite` names a still (a key in `assets.images` or a sprite sheet) drawn behind the gradient. `properties`:

| Key | Default | Meaning |
| --- | --- | --- |
| `from`, `to`, `angle` | the theme's background, `90` | The gradient's colours and its angle in degrees |
| `imageOpacity`, `drift` | `1`, `true` | The still's opacity, and whether it pans and zooms slowly |
| `motes`, `moteColor` | `0` | Drifting specks, at most 240 |
| `scanlines`, `vignette` | `0`, `0` | A fine grille, darkness at the edges, 0 to 1 |
| `seed` | `1` | Which layout of motes |

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

Validation throws `SceneValidationError` from `m2d-engine/core/sceneLoader.js`. The message has the form `Scene '<name>' at <path>: <problem>`, where the path names the exact field at fault. The error also carries `scene`, `path` and `detail` (the problem alone) properties.

`new SceneLoader(game).check(data)` reports every problem instead of the first, as `{ loaded, issues }`: each object, field and list entry is checked on its own, so one bad object does not hide the next, and `loaded` is the normalized scene only when `issues` is empty. What has to hold before the schema applies (an object, the version, the type, `uses` resolving) still stops at its first problem. The editor's Problems panel and the MCP server's `validate_scene` use it.

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
Scene 'level1' at version: scene format 5 is newer than this engine understands (4); upgrade m2d-engine
```

There is no migration step. A format change that existing scenes would fail means bumping `SCENE_VERSION` in `m2d-engine/core/sceneSchema.js` and rewriting the scenes, which is the right trade while scene files live beside the engine that reads them. An editor, which owns files the engine does not, will want upgrades on load; that belongs with the editor, built against what it actually needs.

| Version | Change |
| --- | --- |
| 4 | `paths`: named lines a `PathFollow` follows. Nov 2026 |
| 3 | `layers[].scenes[]`: scene instances (composition). Nov 2026 |
| 2 | The format the editor was built against |
