# Adding a demo

Each example lives in `examples/src/<name>/`.

| File | Purpose |
| --- | --- |
| `index.html` | The page. Give the canvas a CSS size and load `main.js` as a module |
| `main.js` | Creates the engine, registers actors and scenes, mounts the settings menu |
| `menuBackdrop.js` | The scene behind the main menu, as `UIBackdrop` options with one custom layer. Each example draws its own: the platformer a valley at dusk, Hedgerow Court a garden plan walked by a bee, the physics playground a running Galton board |
| `scenes/*.json` | Level and menu definitions, if not built in code |
| `textures/`, `sounds/` | Free, open art and audio, committed with their origin recorded in `THIRD_PARTY_NOTICES.md`. See [Assets](#assets) |
| `assets/` | Generated sprites. Only the renderer showcase has any; new demos should not |
| `../shared/` | Shared across examples: the main menu screen in `mainMenu.js`, a seeded random generator in `rng.js`, synthesized sound effects in `audio.js` and the free music tracks in `music/` |

`.gitignore` excludes raster images, `.otf`, `.mp3` and `.wav` files. A demo that commits one of those needs a `!path` line there, as the two music tracks have.


The `basePath` engine option must point at the example's folder for sprite URLs in scene JSON to resolve. The existing examples derive it from Vite instead of hardcoding each environment: `import.meta.env.BASE_URL + '<name>/'` is `/<name>/` on the dev server and `/m2d-engine/examples/<name>/` in the published build, because `BASE_URL` comes from the `base` option in `examples/vite.config.js`.

## Registering it

1. Add the page to `rollupOptions.input` in `examples/vite.config.js`.
2. Do not add a sprite generator. If a demo truly needs a procedural texture (the showcase's batching stress test does), add a generator function to `examples/scripts/generateSprites.js`. Add a `case` for the example name in the `switch` at the bottom and a call in the all-examples branch. Then add a line for it in the plugin's `buildStart` in `examples/vite.config.js`. The script exits with "Unknown example" for a name without a `case`.
3. If it ships an `assets/` directory, add its name to the `writeBundle` copy list in `examples/vite.config.js`.
4. Register a main menu with `registerMainMenu` from `../shared/mainMenu.js` and give it a `backdrop`. Write a layer that draws something from the game's own world (see the existing `menuBackdrop.js` files and [UIBackdrop](../guide/ui#screen-transitions-and-backdrops)). Keep its focal elements in the right two thirds of the frame, where the column is not, and keep everything slow.
5. Add a card and a controls section to `docs/examples/index.md`. The dev server's landing page, `examples/src/index.html`, gets a link too.
6. If it has scene JSON files, add the actors and scene names it registers to `examples/test/scenes.test.js`.

The examples register actors by class name with `game.registerActor(actor.name, actor)`, which is why `examples/vite.config.js` builds with `minify: false`. Register under string names if you want to turn minification on.

The dev server and the build run the sprite generator with `--missing`, so they only create sprites that do not exist yet. Run `npm run generate-sprites` to regenerate changed artwork.

## Checking it

Run `npm run dev` and open the example. Check it on both backends with `?renderer=canvas` and `?renderer=webgl`. Run `npm test` and `npm run build`, then `npm run preview` to check the built site.

## Assets

Use free, open (CC0 or CC BY) textures, tilemaps, sprites and sounds rather than generating artwork in a script. Generated sprites look generated, and every demo is a showcase. Good sources are [OpenGameArt](https://opengameart.org) (filter by CC0 or CC BY), [ambientCG](https://ambientcg.com) for photographed materials and [Kenney](https://kenney.nl) for CC0 packs. Hollow Grove is the model: ambientCG ground, Wenrexa's painted trees, Owlish Media footsteps and Matthew Pablo's music, with only the living characters drawn in code.

Record each pack's name, author, license and source URL in `THIRD_PARTY_NOTICES.md`, and add the music to `docs/examples/music-credits.md`. Keep the notice simple: one entry per pack, no per-file checksums, and no counts of files or assets — those go stale with the next addition. Resizing or re-encoding is fine; say so in the notice. Do not add assets whose redistribution terms are unknown. The `.gitignore` excludes raster images and `.mp3`/`.wav` by default, so a new asset folder needs a `!path` line there.
