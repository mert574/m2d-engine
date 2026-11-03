# M2D Engine - Agent Context

M2D is a 2D browser game engine: Rapier 2D physics behind an engine-owned
interface, a WebGL2 renderer with a Canvas 2D fallback behind one contract,
JSON scenes validated on load, and one input API over Pointer Events and the
keyboard. The repository is an npm workspaces monorepo.

| Workspace | Contents |
| --- | --- |
| `packages/engine` | The engine, published to npm as `m2d-engine`. Source in `src/`, tests in `test/` |
| `examples` | The demo games and the demo site |
| `docs` | The VitePress documentation site |

## Documentation is in `docs/`

All documentation lives in the VitePress site. Do not add documentation to
this file, the README or source-adjacent README files. When a change alters
behaviour, update the page that covers it in the same change, following
`docs/contributing/writing-docs.md`.

| Topic | Page |
| --- | --- |
| Setup, commands, minimal game | `docs/guide/getting-started.md` |
| Complete walkthrough | `docs/guide/first-game.md` |
| Scene JSON, hooks, switching | `docs/guide/scenes.md`, `docs/reference/scene-format.md` |
| Entities, actors, constraints, projectiles, collision categories | `docs/guide/entities.md`, `docs/reference/actors.md`, `docs/reference/constraints.md` |
| Physics: body types, units, stepping, queries | `docs/guide/physics.md`, `docs/reference/physics.md` |
| Input: keyboard, pointer, gestures, bands, pointer lock | `docs/guide/input.md`, `docs/reference/input-events.md` |
| Touch and on-screen controls | `docs/guide/touch.md` |
| Camera | `docs/guide/camera.md` |
| View, render resolution, UI resolution, world overlay, settings menu | `docs/guide/display.md` |
| UI components | `docs/guide/ui.md`, `docs/reference/ui.md` |
| Developer console, cvars, commands | `docs/reference/console.md` |
| Sprites, sound, game loop, building | `docs/guide/sprites.md`, `docs/guide/sound.md`, `docs/guide/game-loop.md`, `docs/guide/building.md` |
| Clocks, the simulation tick, pause, time scale, timers | `docs/guide/time.md` |
| Engine options and instance API | `docs/reference/engine-options.md` |
| Renderer contract, capabilities, writing a backend | `docs/reference/renderer.md`, `docs/contributing/renderer-backend.md` |
| Example games and music credits | `docs/examples/index.md`, `docs/examples/music-credits.md` |
| Architecture and the rules each module keeps | `docs/contributing/architecture.md` |
| Tests, conformance harness, Chromium setup | `docs/contributing/testing.md` |
| Adding a demo, deployment | `docs/contributing/adding-a-demo.md`, `docs/contributing/deployment.md` |
| Common issues | `docs/contributing/troubleshooting.md` |
| Roadmap | `docs/contributing/roadmap.md` |

## Commands

```bash
npm install
npm run dev            # examples on port 3000
npm run docs:dev       # documentation site
npm test               # node + browser engine suites, example scene validation
npm run test:node      # fast engine suite
npm run test:browser   # WebGL2 conformance in headless Chromium
npm run build          # site/ = docs + demos
npx playwright install chromium   # once, for test:browser
```

## Rules for changes

- Nothing outside `packages/engine/src/core/physics/` imports a physics
  library. Game and engine code use `game.physics` and its body handles.
- Nothing outside `packages/engine/src/core/renderers/` touches a canvas
  context. Drawing goes through the renderer contract. A backend workaround
  lives in the backend.
- Nothing outside `packages/engine/src/core/input/` registers a DOM input
  listener, except the sound manager's one-shot autoplay unlock.
- Units are pixels, seconds and radians.
- Simulation state changes only in `fixedUpdate(dt)` (entities, constraints),
  `onFixedUpdate(dt)` (scenes), `game.time` timers and collision handlers.
  The per-frame `update(deltaTime)` is presentation only. Simulation code
  reads input from `game.input.snapshot` and random numbers from `game.rng`.
  Nothing in game code reads `performance.now()`, calls `setTimeout` or uses
  `Math.random()` for anything the simulation sees.
- `test/determinism.test.js` must keep passing: the same scene at 30, 60 and
  144 fps ends in bit-identical state.
- Draw with `renderPosition` and `renderAngle`. Use `position` for logic.
- Annotations about an entity go through `game.worldOverlay`.
- A new scene JSON field goes into the key lists at the top of
  `sceneLoader.js` and into `docs/reference/scene-format.md`.
- A new renderer feature is mandatory for every backend or declared through
  `capabilities`.
- Both backends must pass `npm test`. Check visual changes with
  `?renderer=canvas` and `?renderer=webgl`.
- Anything attached to `window` or `document` keeps a stable handler
  reference so `destroy()` can remove it.
- Keys are physical codes (`'KeyW'`, `'Space'`), never characters.
