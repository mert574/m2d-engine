# Adding a demo

Each example lives in `examples/src/<name>/`.

| File | Purpose |
| --- | --- |
| `index.html` | The page. Give the canvas a CSS size and load `main.js` as a module |
| `main.js` | Creates the engine, registers actors and scenes, mounts the settings menu |
| `menuBackdrop.js` | The scene behind the main menu, as `UIBackdrop` options with one custom layer. Each example draws its own: the platformer a valley at dusk, the maze a surveyed plan, the physics playground a running Galton board |
| `scenes/*.json` | Level and menu definitions, if not built in code |
| `assets/` | Generated sprites. Raster images are git-ignored and produced by scripts |
| `../shared/` | Shared across examples: the main menu screen in `mainMenu.js`, a seeded random generator in `rng.js`, synthesized sound effects in `audio.js` and the licensed music tracks in `music/` |

`.gitignore` excludes raster images, `.otf`, `.mp3` and `.wav` files. A demo that commits one of those needs a `!path` line there, as the two music tracks have.


The `basePath` engine option must point at the example's folder for sprite URLs in scene JSON to resolve. The existing examples derive it from Vite instead of hardcoding each environment: `import.meta.env.BASE_URL + '<name>/'` is `/<name>/` on the dev server and `/m2d-engine/examples/<name>/` in the published build, because `BASE_URL` comes from the `base` option in `examples/vite.config.js`.

## Registering it

1. Add the page to `rollupOptions.input` in `examples/vite.config.js`.
2. If it needs generated sprites, add a generator function to `examples/scripts/generateSprites.js`. Add a `case` for the example name in the `switch` at the bottom and a call in the all-examples branch. Then add a line for it in the plugin's `buildStart` in `examples/vite.config.js`. The script exits with "Unknown example" for a name without a `case`.
3. If it ships an `assets/` directory, add its name to the `writeBundle` copy list in `examples/vite.config.js`.
4. Register a main menu with `registerMainMenu` from `../shared/mainMenu.js` and give it a `backdrop`. Write a layer that draws something from the game's own world (see the existing `menuBackdrop.js` files and [UIBackdrop](../guide/ui#screen-transitions-and-backdrops)). Keep its focal elements in the right two thirds of the frame, where the column is not, and keep everything slow.
5. Add a card and a controls section to `docs/examples/index.md`. The dev server's landing page, `examples/src/index.html`, gets a link too.
6. If it has scene JSON files, add the actors and scene names it registers to `examples/test/scenes.test.js`.

The examples register actors by class name with `game.registerActor(actor.name, actor)`, which is why `examples/vite.config.js` builds with `minify: false`. Register under string names if you want to turn minification on.

The dev server and the build run the sprite generator with `--missing`, so they only create sprites that do not exist yet. Run `npm run generate-sprites` to regenerate changed artwork.

## Checking it

Run `npm run dev` and open the example. Check it on both backends with `?renderer=canvas` and `?renderer=webgl`. Run `npm test` and `npm run build`, then `npm run preview` to check the built site.

## Assets

Record the origin and license of any third-party asset in `THIRD_PARTY_NOTICES.md`. Do not add assets whose redistribution terms are unknown.
