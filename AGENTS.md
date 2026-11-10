# M2D Engine - Agent Context

M2D is a browser game engine: Rapier physics behind an engine-owned
interface, JSON scenes validated on load, and one input API over Pointer
Events and the keyboard. The repository is an npm workspaces monorepo.

A game is 2D or 3D, chosen per scene by `world.dimensions` and checked
against the game. The two are separate worlds that never share a body, a
camera or a renderer:

| | 2D | 3D |
| --- | --- | --- |
| Physics | Rapier 2D | Rapier 3D |
| Renderer | Batched WebGL2, Canvas 2D fallback | Retained WebGPU, Chromium only |
| Units | Pixels, y down | Metres, y up |

| Workspace | Contents |
| --- | --- |
| `packages/engine` | The engine, published to npm as `m2d-engine`. Source in `src/`, tests in `test/` |
| `packages/server` | The authoritative multiplayer host, published as `m2d-server` |
| `packages/editor-core` | The editor's headless core (document, writer, commands, validation). TypeScript, no DOM |
| `packages/editor-host` | The editor's host: serves one game's project to the editor, holds the open documents and their history, and is the MCP server agents edit through |
| `packages/editor` | The editor app: DOM panels around engine viewports |
| `examples` | The demo games and the demo site |
| `docs` | The VitePress documentation site |

## Documentation is in `docs/`

All documentation lives in the VitePress site. Do not add documentation to
this file, the README or source-adjacent README files — a README that only
points at docs pages (`packages/engine/test/README.md`, the npm package
README) is the exception. When a change alters behaviour, update the page
that covers it in the same change, following
`docs/contributing/writing-docs.md`.

Working plans for large in-flight work live in `docs/plans/`. They are
tracked with the docs but excluded from the published site, and they are
not a substitute for documenting shipped behaviour on the page that covers
it.

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
| Headless games, splitting simulation from presentation, the server input gate | `docs/guide/headless.md` |
| Multiplayer: match modules, the server, tickets, the client, replication | `docs/guide/multiplayer.md` |
| The editor: projects, templates, assets, play, build, MCP tools | `docs/guide/editor.md` |
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
npm run dev:lan        # HTTPS on 0.0.0.0, for a browser on another machine (PORT=... picks the port)
npm run docs:dev       # documentation site
npm run editor examples/src/yard      # the editor on one game's folder (random port, printed; MCP at /mcp)
npm run editor new my-game --template 3d   # a new project from a template (2d or 3d)
npm run editor:mcp examples/src/yard  # the MCP endpoint over stdio, when no editor is running
npm test               # typecheck, then node + browser engine suites and example scene validation
npm run typecheck      # every workspace that has a tsconfig
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
- Units are seconds and radians, with pixels in 2D and metres in 3D.
- Simulation state changes only in `fixedUpdate(dt)` (entities, constraints),
  `onFixedUpdate(dt)` (scenes), `game.time` timers and collision handlers.
  The per-frame `update(deltaTime)` is presentation only. Simulation code
  reads input from `this.input` on an entity (`game.input.snapshot` in a
  scene hook) and random numbers from `game.rng`.
  Nothing in game code reads `performance.now()`, calls `setTimeout` or uses
  `Math.random()` for anything the simulation sees.
- `test/determinism.test.js` must keep passing: the same scene at 30, 60 and
  144 fps ends in bit-identical state. The full contract — including why
  simulation code never reads the camera — is
  `docs/contributing/determinism.md`.
- Simulation code runs headless: actors, constraints and the `onEnter`,
  `onFixedUpdate` and `onExit` hooks never read the camera, the renderer,
  UI or the DOM, constructors included. Presentation setup goes in
  `onShow` and `onHide`. A headless game throws on such a read
  (`docs/guide/headless.md`).
- Entities that appear during play are made with `game.spawn`, with plain
  data `options`, so a server can send them. State a client draws is
  declared in `static replicated`; events for a player's screen go
  through `player.notify`.
- Draw with `renderPosition` and `renderAngle`. Use `position` for logic.
- Annotations about an entity go through `game.worldOverlay`.
- The scene format is data: `sceneSchema.js` describes it with the
  descriptors in `schema.js`, and `sceneLoader.js` only resolves
  cross-references and raises errors. A new scene JSON field goes into
  `sceneSchema.js` and into `docs/reference/scene-format.md` — never into
  validation code written by hand, which tooling cannot read.
- A scene format change that existing files would fail bumps
  `SCENE_VERSION` and rewrites the repo's scenes at it (a test asserts
  every shipped scene is at the current version). There is no migration
  path, and adding one is editor work, not engine work.
- A constraint declares its tunables in `static params` as schema
  descriptors named after the fields they set, with defaults recorded as
  `initial` (never a schema `default`, which an override would apply).
  Callbacks stay out of `params`: they are code, not scene data. Override
  `configure` when a param is derived or merges.
- An actor declares what a scene may set in `static properties`, on the
  same terms. A subclass's declarations merge over its bases', so it
  restates nothing; an actor that declares none takes any bag, unchecked.
  A new actor that reads `options` declares them.
- An asset shared between scenes belongs in an asset manifest, keyed by a
  uid that a rename cannot break (`core/assets.js`). A scene's `uses`
  block binds uids to local names and the loader expands it into the
  inline shape, so nothing downstream knows which way an asset arrived.
- Every scene object and UI element has a unique `id`. Code that builds a
  scene at runtime numbers its own objects; the loader never invents one,
  because an invented id is not stable across a reorder or a save.
- Scene and manifest JSON on disk is the canonical writer's output, byte
  for byte (`m2d-editor-core`'s `writeScene`/`writeManifest`; a test
  enforces it). After editing one by hand, run
  `node scripts/formatScenes.mjs` in `examples/`. The layout scripts
  (`build*Scene.mjs`) are seeds: they write a scene only when it is
  missing, and from then on the JSON is the scene, edited by hand or in
  the editor. `--force` rebuilds one from its script and discards those
  edits. A scene with a `generator` field is owned by that script, and
  the editor refuses to edit it until the field is deleted.
- An editor project is one game's folder with an `m2d.project.json`
  (`name`, `definition`, optionally `hooks`, `scenes` and `basePath`). Its
  definition module exports `register(game)` (actors, constraints,
  intents, asset manifest) and optionally `GAME`; it never draws, so a
  headless game can import it. The optional hooks module exports
  `sceneHooks(game)` with each scene's presentation hooks, and may export
  `OPTIONS` (M2D options for the look, such as `textureFilter`). Every
  demo with scene files has one. `main.js`
  boots from both, and the editor's checks and play mode use them. See
  `docs/guide/editor.md`.
- The asset pipeline (Poly Haven fetch, model compiler) lives in
  `packages/editor-host/src/pipeline/`. The examples' `fetchPolyHaven.mjs`
  and `compileModel.mjs` wrap it with the lot's lists and paths.
- A new renderer feature is mandatory for every backend or declared through
  `capabilities`.
- Both backends must pass `npm test`. Check visual changes with
  `?renderer=canvas` and `?renderer=webgl`.
- Anything attached to `window` or `document` keeps a stable handler
  reference so `destroy()` can remove it.
- Keys are physical codes (`'KeyW'`, `'Space'`), never characters.
- Other agents work on this repository concurrently, each in its own git
  worktree. Never touch the base checkout (`~/Developer/mert574/m2d-engine`).
  Scratch files go in a fresh `mktemp -d` per task; dev servers take a
  random high port (check `ss -ltnp` first), and a server is only yours to
  kill if its PID runs in your worktree. Trust no screenshot or log you did
  not produce, and re-read files you rely on — even a worktree and a /tmp
  path can turn out to be shared.
- Build what another game could also want (a constraint, an actor, a UI
  component) at the engine level; only game-specific parts stay in the
  demo. The demos are engine demonstrations.
- Never generate sprites or textures in scripts (the renderer showcase's
  stress-test generator is the one exception). Demos use free, open assets
  (OpenGameArt, ambientCG, Kenney; CC0 or CC BY), credited in
  `THIRD_PARTY_NOTICES.md` with pack, author, license and source URL only —
  no per-file checksums, and no counts of assets or demos anywhere, since
  numbers go stale. See `docs/contributing/adding-a-demo.md`.
- New demos aim bright: cozy, sunlit, distinctive. The shipped set already
  leans nocturnal; do not add to that register, and avoid cliché genre
  pastiches. Brightness is not lower craft — lights, parallax and post
  effects read in daylight too. (Owner preference, Nov 2026 — move to agent
  memory when writable.)
