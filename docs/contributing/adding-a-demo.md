# Adding a demo

Each example lives in `examples/src/<name>/`.

| File | Purpose |
| --- | --- |
| `index.html` | The page. Give the canvas a CSS size and load `main.js` as a module |
| `main.js` | Creates the engine, registers actors and scenes, mounts the settings menu |
| `scenes/*.json` | Level and menu definitions, if not built in code |
| `assets/` | Generated sprites. Raster images are git-ignored and produced by scripts. Doner commits SVG sprites under `sprites/` instead |
| `../shared/` | Shared across examples: synthesized sound effects in `audio.js` and the licensed music tracks in `music/` |

`.gitignore` excludes raster images, `.otf`, `.mp3` and `.wav` files. A demo that commits one of those needs a `!path` line there, as the two music tracks have.


The `basePath` engine option must point at the example's deployed folder for sprite URLs in scene JSON to resolve. The existing examples use `import.meta.env.DEV ? '/examples/<name>/' : '/m2d-engine/examples/<name>/'`.

## Registering it

1. Add the page to `rollupOptions.input` in `examples/vite.config.js`.
2. If it needs generated sprites, add a generator function to `examples/scripts/generateSprites.js`. Add a `case` for the example name in the `switch` at the bottom and a call in the all-examples branch. Then add a line for it in the plugin's `buildStart` in `examples/vite.config.js`. The script exits with "Unknown example" for a name without a `case`.
3. If it ships an `assets/` directory, add its name to the `writeBundle` copy list in `examples/vite.config.js`.
4. Add a card and a controls section to `docs/examples/index.md`. The dev server's landing page, `examples/src/index.html`, gets a link too.
5. If it has scene JSON files, add the actors and scene names it registers to `examples/test/scenes.test.js`.

The examples register actors by class name with `game.registerActor(actor.name, actor)`, which is why `examples/vite.config.js` builds with `minify: false`. Register under string names if you want to turn minification on.

The dev server and the build run the sprite generator with `--missing`, so they only create sprites that do not exist yet. Run `npm run generate-sprites` to regenerate changed artwork.

## Checking it

Run `npm run dev` and open the example. Check it on both backends with `?renderer=canvas` and `?renderer=webgl`. Run `npm test` and `npm run build`, then `npm run preview` to check the built site.

## Assets

Record the origin and license of any third-party asset in `THIRD_PARTY_NOTICES.md`. Do not add assets whose redistribution terms are unknown.
