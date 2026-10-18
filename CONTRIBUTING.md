# Contributing

M2D is a small browser game engine built with JavaScript, Matter.js, and Canvas.
The README explains the engine and demos; [ROADMAP.md](ROADMAP.md) describes
the next proposed slices of work.

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
- When adding a demo, register its entry in `vite.config.js` and its generated
  assets in `scripts/generateSprites.js`.
- Run `npm run build`, then smoke-test affected demos with `npm run preview`.
  Check rendering, controls, scene transitions, and audio after a user gesture.
- Include the verification steps and any remaining limitations in the change.

Original code and demo artwork use MIT. Preserve dependency notices when adding
artwork, fonts, music, or sound recordings.
Never add third-party assets whose redistribution permission is unknown.
