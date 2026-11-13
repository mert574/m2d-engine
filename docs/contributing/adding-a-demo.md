# Adding a demo

Each example lives in `examples/src/<name>/` and is an editor project, written the way m2d means games to be written. The rules are in `knowledge-base/notes/idiomatic-m2d.md`; in short:

- Code is actors, constraints, net intents and a `game.js` whose `register(game)` registers them.
- Everything else is scene data the editor and MCP can read and change: placement, the camera, the light and post, sounds, music and ambience, the HUD, menus as UI scenes, and what happens when as `world.rules`.
- `main.js` is the generic boot, `bootProject`, and nothing else.
- A hook keeps only what has no data form, and says why. No hook sets the camera, the light, audio or UI, reads keys, draws a background or finds entities with `instanceof`.
- No file beside the scenes holds layout (`layout.json`), and no level is generated at run time.

`examples/test/idiom.test.js` checks each example against these rules and runs `audit_project` on it. A departure fails the test unless it is on the test's allow-list, which only shrinks.

| File | Purpose |
| --- | --- |
| `index.html` | The page. Give the canvas a CSS size and load `main.js` as a module |
| `main.js` | `bootProject` with the project file, the definition, the hooks and the scenes folder. See [The project file](../guide/editor#the-project-file) |
| `m2d.project.json` | The project: definition and hooks modules, the opening scene, display, named input actions |
| `game.js` | `register(game)`: actors, constraints, intents and the asset manifest; optionally `GAME`, the options the simulation needs |
| `hooks.js` | `sceneHooks(game)`, only for what has no data form. Optional |
| `scenes/*.json` | Every level and menu |
| `textures/`, `sounds/` | Free, open art and audio, committed with their origin recorded in `THIRD_PARTY_NOTICES.md`. See [Assets](#assets) |
| `assets/` | Generated sprites. Only the renderer showcase has any; new demos should not |
| `../shared/` | Shared across examples: a seeded random generator in `rng.js`, synthesized sound effects in `audio.js` and the free music tracks in `music/`. The older examples' code main menu, `mainMenu.js`, is being replaced by UI scenes; a new demo does not use it |

`.gitignore` excludes raster images, `.otf`, `.mp3` and `.wav` files. A demo that commits one of those needs a `!path` line there, as the two music tracks have.


The `basePath` engine option must point at the example's folder for sprite URLs in scene JSON to resolve. Pass it to `bootProject` derived from Vite instead of hardcoding each environment: `import.meta.env.BASE_URL + '<name>/'` is `/<name>/` on the dev server and `/m2d-engine/examples/<name>/` in the published build, because `BASE_URL` comes from the `base` option in `examples/vite.config.js`.

```js
import { bootProject } from 'm2d-engine/core/project.js';
import project from './m2d.project.json';
import * as definition from './game.js';
import * as hooks from './hooks.js';

await bootProject(document.getElementById('screen'), {
  project, definition, hooks,
  scenes: import.meta.glob('./scenes/*.json', { import: 'default' }),
  basePath: import.meta.env.BASE_URL + '<name>/'
});
```

## Registering it

1. Add the page to `rollupOptions.input` in `examples/vite.config.js`.
2. Do not add a sprite generator. If a demo truly needs a procedural texture (the showcase's batching stress test does), add a generator function to `examples/scripts/generateSprites.js`. Add a `case` for the example name in the `switch` at the bottom and a call in the all-examples branch. Then add a line for it in the plugin's `buildStart` in `examples/vite.config.js`. The script exits with "Unknown example" for a name without a `case`.
3. If it ships an `assets/` directory, add its name to the `writeBundle` copy list in `examples/vite.config.js`.
4. Make the main menu a UI scene named `mainMenu`: a `backdrop`, `menuItem` lines and their `effects`, a `transition` and `music` (see [UI scenes](../reference/scene-format#elements)). Give it a layout, a selection variant and a select effect no other example's menu uses; `knowledge-base/notes/demo-standards.md` has the rule.
5. Add a card and a controls section to `docs/examples/index.md`. The dev server's landing page, `examples/src/index.html`, gets a link too.
6. Give it a `game.js` that exports `register(game)` (its actors, constraints and asset manifest) and optionally `GAME` (the options its simulation needs), and an `m2d.project.json` (`name`, `definition`, `initialScene`, `display`, `input.actions`; `hooks` only if it has any). Boot `main.js` with `bootProject`. `npm run editor examples/src/<demo>` then opens it, `examples/test/scenes.test.js` loads its scenes in a headless game with those real classes, and `examples/test/idiom.test.js` holds it to the rules above. A scene laid out by a script follows the `build*Scene.mjs` pattern: the script is a seed (`scripts/seedScene.mjs`) that writes the scene only when it is missing, run with `--missing` from the dev server's `buildStart`, so edits made in the editor are never overwritten. Also add its actors to `DEMO_ACTORS` in `examples/test/helpers.js`, for the structural pass.

The examples register actors by class name with `game.registerActor(actor.name, actor)`, which is why `examples/vite.config.js` builds with `minify: false`. Register under string names if you want to turn minification on.

The dev server and the build run the sprite generator with `--missing`, so they only create sprites that do not exist yet. Run `npm run generate-sprites` to regenerate changed artwork.

## Checking it

Run `npm run dev` and open the example. Run `audit_project` over MCP (or the editor's Problems panel) and fix what it finds. Check it on both backends with `?renderer=canvas` and `?renderer=webgl`. Run `npm test` and `npm run build`, then `npm run preview` to check the built site.

## Assets

Use free, open (CC0 or CC BY) textures, tilemaps, sprites and sounds rather than generating artwork in a script. Generated sprites look generated, and every demo is a showcase. Good sources are [OpenGameArt](https://opengameart.org) (filter by CC0 or CC BY), [ambientCG](https://ambientcg.com) for photographed materials and [Kenney](https://kenney.nl) for CC0 packs. Hollow Grove is the model: ambientCG ground, Wenrexa's painted trees, Owlish Media footsteps and Matthew Pablo's music, with only the living characters drawn in code.

3D models come from [Poly Haven](https://polyhaven.com) (CC0 photoscans) and the [Khronos sample assets](https://github.com/KhronosGroup/glTF-Sample-Assets), through a pipeline rather than by hand: `examples/scripts/fetchPolyHaven.mjs` downloads a model's glTF, geometry and textures at a chosen resolution into the gitignored `examples/assets-src/`, and `examples/scripts/compileModel.mjs` decimates it into levels of detail and re-encodes its textures into one `.glb` under `examples/src/yard/models/ph/`, which is what a scene's `assets.models` names and what is committed. A photoscan is millions of triangles; never commit one as it comes. `npm run build-models` compiles them four at a time, its textures on worker threads; `node --max-old-space-size=4096 scripts/compileModel.mjs <id>` recompiles one (a tree takes about fifteen seconds and three or four gigabytes while it is cut). A modular kit (a fence, a set of poles, a fort) lays its parts out side by side for display, so it is not placed whole: `PIECES` in `fetchPolyHaven.mjs` names the root nodes that make one piece, and the compiler keeps only those and stands the piece on its origin, one `.glb` per piece.

Record each pack's name, author, license and source URL in `THIRD_PARTY_NOTICES.md`, and add the music to `docs/examples/music-credits.md`. Keep the notice simple: one entry per pack, no per-file checksums and no counts of files or assets; counts go stale with the next addition. Resizing or re-encoding is fine; say so in the notice. Do not add assets whose redistribution terms are unknown. The `.gitignore` excludes raster images and `.mp3`/`.wav` by default, so a new asset folder needs a `!path` line there.
