# Contributing

M2D is a small browser game engine built with JavaScript, Rapier 2D physics,
and a pluggable renderer (WebGL2 by default, Canvas 2D as a fallback). The README
explains the engine and demos; [ROADMAP.md](ROADMAP.md) describes the next
proposed slices of work. [AGENTS.md](AGENTS.md) is the detailed architecture
note, and `packages/engine/test/README.md` covers the renderer conformance suite.

## Setup

Use Node.js 22 or later. Install dependencies with `npm ci`, generate sprites
with `npm run generate-sprites`, and start `npm run dev`. The example index is
served on port 3000. `npm run build` assembles the deployable `site/`
directory: the documentation at the root and the demos under `/examples/`.
The repo is an npm workspaces monorepo: the engine lives in `packages/engine`,
the demo games in `examples`, and the VitePress documentation site in `docs`
(`npm run docs:dev` serves it locally).
Sprite generation and Node renderer tests use `@napi-rs/canvas`. On supported
platforms its prebuilt Skia binding is installed through the npm registry, with
no system build dependencies or GitHub binary download. Do not omit optional
dependencies when installing: they include the platform binding.

## Changes

- Keep engine behavior separate from example-specific actors and game rules.
- Use elapsed time for timers and movement, and cover multiple frame rates when
  changing simulation behavior.
- When adding a demo, register its entry in `examples/vite.config.js` three times:
  the `rollupOptions.input` entry, the sprite generation in `assetsPlugin.buildStart`,
  and the `writeBundle` asset-copy list if it ships an `assets/` directory.
  Add its generated sprites to `examples/scripts/generateSprites.js`.
- Renderer changes must keep both backends passing `npm test`. A new backend
  feature is either mandatory (every backend implements it) or optional
  (declared through `renderer.capabilities`, with callers degrading); see
  the capabilities section of `packages/engine/test/README.md` before adding one.
- Check rendering changes on both backends. Every example accepts
  `?renderer=canvas` and `?renderer=webgl`.
- Run `npm test` and `npm run build`, then smoke-test affected demos with
  `npm run preview`.
  Check rendering, controls, scene transitions, and audio after a user gesture.
- Include the verification steps and any remaining limitations in the change.

Original code and demo artwork use MIT. Preserve dependency notices when adding
artwork, fonts, music, or sound recordings.
Never add third-party assets whose redistribution permission is unknown.
