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
| Quest, abilities, footsteps, NPCs, dialogue, minimap | `docs/reference/gameplay.md` |
| Physics: body types, units, stepping, queries | `docs/guide/physics.md`, `docs/reference/physics.md` |
| Input: keyboard, pointer, gestures, bands, pointer lock | `docs/guide/input.md`, `docs/reference/input-events.md` |
| Touch and on-screen controls | `docs/guide/touch.md` |
| Camera | `docs/guide/camera.md` |
| Perspectives: draw order, footprints, elevation, tile layers | `docs/guide/perspectives.md` |
| View, render resolution, UI resolution, world overlay, settings menu | `docs/guide/display.md` |
| UI components | `docs/guide/ui.md`, `docs/reference/ui.md` |
| Developer console, cvars, commands | `docs/reference/console.md` |
| Sprites, sound, game loop, building | `docs/guide/sprites.md`, `docs/guide/sound.md`, `docs/guide/game-loop.md`, `docs/guide/building.md` |
| Clocks, the simulation tick, pause, time scale, timers | `docs/guide/time.md` |
| Engine options and instance API | `docs/reference/engine-options.md` |
| Renderer contract, capabilities, writing a backend | `docs/reference/renderer.md`, `docs/contributing/renderer-backend.md` |
| Example games and music credits | `docs/examples/index.md`, `docs/examples/music-credits.md` |
| Architecture and the rules each module keeps | `docs/contributing/architecture.md` |
| The determinism contract: what simulation code may read | `docs/contributing/determinism.md` |
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
  144 fps ends in bit-identical state. The full contract — including why
  simulation code never reads the camera — is
  `docs/contributing/determinism.md`.
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
- Any number of agents may be working on this repository at once, each in
  its own git worktree. Never read or write the base checkout
  (`~/Developer/mert574/m2d-engine`); work only in your worktree. For any
  scratch files use a fresh `mktemp -d` per task — never a guessable or
  reused path — and a random high port for dev servers (check `ss -ltnp`
  first). Before killing a server, confirm its PID's working directory is
  your worktree. Never trust a screenshot or log unless it came from your
  own server and your own script, and expect that even your worktree may be
  shared with another session: re-read files you rely on.
- Build what a game needs at the engine level when it would serve other
  games too (a constraint, an actor, a UI component), and keep only the
  game-specific parts in the demo. The demos are engine demonstrations.
- Do not generate sprites or textures in scripts. Demos use free, open
  assets found online (OpenGameArt, ambientCG, Kenney; CC0 or CC BY), with
  pack, author, license and source URL recorded in `THIRD_PARTY_NOTICES.md`.
  Keep credits simple: no per-file checksums, and no counts of assets or
  demos anywhere in notices or docs — numbers go stale with every addition.
  Only the renderer showcase keeps a generator, for its batching stress
  test. See `docs/contributing/adding-a-demo.md`.
- New demos aim bright: cozy, sunlit, happy settings. The shipped set
  already leans dark and nocturnal; do not add more of that register.
  Brightness does not mean lower craft — lights, parallax and post effects
  read in daylight too, and a warm, distinctive look beats a generic moody
  one. Avoid cliché genre pastiches when picking a concept.
  (Owner preference, Nov 2026 — to be moved to agent memory when writable.)
