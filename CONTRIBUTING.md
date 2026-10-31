# Contributing

M2D is a small browser game engine built with JavaScript, Rapier 2D physics,
and a pluggable renderer (WebGL2 by default, Canvas 2D as a fallback). The README
explains the engine and demos; [ROADMAP.md](ROADMAP.md) describes the next
proposed slices of work. [AGENTS.md](AGENTS.md) is the detailed architecture
note, and `test/README.md` covers the renderer conformance suite.

## Setup

Use Node.js 22 or later. Install dependencies with `npm ci`, generate sprites
with `npm run generate-sprites`, and start `npm run dev`. The example index is
served on port 3000. `npm run build` creates the deployable `docs/` directory.
The `canvas` dependency may need native build prerequisites if a prebuilt binary
is unavailable for your platform.

## Changes

- Keep engine behavior separate from example-specific actors and game rules.
- Use elapsed time for timers and movement, and cover multiple frame rates when
  changing simulation behavior.
- When adding a demo, register its entry in `vite.config.js` three times: the
  `rollupOptions.input` entry, the sprite generation in `assetsPlugin.buildStart`,
  and the `writeBundle` asset-copy list if it ships an `assets/` directory.
  Add its generated sprites to `scripts/generateSprites.js`.
- Renderer changes must keep both backends passing `npm test`. A new backend
  feature is either mandatory (every backend implements it) or optional
  (declared through `renderer.capabilities`, with callers degrading); see
  the capabilities section of `test/README.md` before adding one.
- Check rendering changes on both backends. Every example accepts
  `?renderer=canvas` and `?renderer=webgl`.
- Run `npm test` and `npm run build`, then smoke-test affected demos with
  `npm run preview`.
  Check rendering, controls, scene transitions, and audio after a user gesture.
- Include the verification steps and any remaining limitations in the change.

Original code and demo artwork use MIT. Preserve dependency notices when adding
artwork, fonts, music, or sound recordings.
Never add third-party assets whose redistribution permission is unknown.
