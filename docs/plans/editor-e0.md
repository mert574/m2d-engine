# Plan: E0 — editor enablement rounds

Working plan, not published documentation. Agreed direction with the owner,
Nov 2026. This plan covers everything that must land *before*
`editor-core` (the headless scene-document/command package) is worth
starting. The editor itself (E1–E5) stays in
`docs/contributing/roadmap.md`; the architecture it feeds is:

- **Web editor, no Electron.** A browser app in a new `packages/editor`
  workspace, DOM panels around engine canvases, project folders through
  the File System Access API.
- **A headless core.** `packages/editor-core` owns the scene document,
  the canonical writer, validation and a command/undo model. It runs in
  the browser and in Node.
- **AI as a peer client.** `packages/editor-mcp` (hosted by a local
  companion process that also runs the asset compilers) exposes the same
  commands and queries as MCP tools. The GUI and an agent drive one API.
- **Editor plugins** (the owner's requirement is *editor* plugins, not
  engine plugins) load as ES modules and contribute commands, panels and
  inspector widgets. The engine's own registration points
  (`registerActor`, `registerConstraint`, backends) already cover the
  runtime side and need nothing here.

Decisions from the owner, Nov 2026:

1. New packages are **born TypeScript**, and the monorepo grows a shared
   TS toolchain now, ahead of the engine's own migration, because the
   direction is already decided (see Types in the roadmap).
2. **A single viewport is not acceptable.** Multiple simultaneous views
   of one scene (different angles, different cameras) is a hard
   requirement, "nothing to take lightly". It gets its own round below.
3. **Edit mode must not run game code.** A game registers keybinds,
   builds menus in `onEnter`, switches scenes on game over. None of that
   may fire while editing; it runs only in play-in-editor.

The B1/B6 rule from `3d-and-editor.md` still governs: plan deliverables,
not refactors, and land no abstraction without its second consumer. Each
round below ends in something testable on its own, and most are useful
even if the editor slipped a year.

## The rounds

Ordered by dependency, not priority. E0.1 and E0.2 can start together;
E0.3 and E0.4 need nothing but E0.1's toolchain; E0.5 and E0.6 are
engine work independent of the rest.

### E0.1 — Toolchain: TypeScript and a workspace build — **Done, Nov 2026**

Landed: `tsconfig.base.json` at the root; `packages/engine/tsconfig.json`
as the `checkJs: false` placeholder; `npm run typecheck` per workspace and
at the root, run first by `npm test`; `docs/contributing/typescript.md`.
Decisions made while writing it, recorded because the next person will
ask: resolution is `nodenext` everywhere rather than `bundler`, so one
emitted file runs in Node and a browser without a bundler and relative
imports keep the `.js` extension the engine already writes; and the base
`lib` is **ES2025 with no DOM**, so a package that is meant to run
headless — `editor-core` — cannot reach a browser API by accident and has
to ask. `exactOptionalPropertyTypes` was left off: it is the one strict
flag whose friction outweighs what it catches, and it can go on later.
The build tool for a publishing package is `tsc` (emit plus `.d.ts`), and
Vite for the editor app, which never publishes.

The language level is the owner's rule, Nov 2026: *use every feature the
language has shipped, as long as the infrastructure runs it.* ES2025 made
that mean a Node floor of 24 — Node 22 lacks `Promise.try`,
`RegExp.escape`, `Float16Array` and duplicate named capture groups, all
checked empirically; Node 24 has them all — so `engines`, CI and the
setup docs say 24 now. The Chromium the 3D renderer already requires is
past ES2025 everywhere. One correction kept for the record: decorators
are not in ES2025 or any shipped edition (still a stage 3 proposal);
TypeScript packages can use them anyway because tsc has compiled the
standard semantics since 5.0, independent of `target`.

The engine stays plain JS with JSDoc and no build step — migrating it is
the roadmap's Types item, not this round. This round prepares the ground
so the first TS package is boring to add.

- A root `tsconfig.base.json` (strict; the newest shipped ECMAScript the
  runtimes support) that packages extend.
- The build tool for TS packages, chosen once: the default is **Vite
  library mode for apps, `tsc` for type-only packages** — `editor-core`
  likely ships as `tsc`-emitted JS + `.d.ts` with no bundling at all,
  matching the engine's no-build philosophy; the editor app is a normal
  Vite app that never publishes. Decide against alternatives (tsdown,
  unbuild) in one paragraph in the PR, then stop relitigating.
- A root `npm run typecheck` that runs every workspace's check, wired
  into `npm test`.
- `checkJs` over the engine is **not** this round, but the base config
  must be written so turning it on later is adding one flag, and the
  engine package gets an empty `tsconfig.json` extending the base with
  `checkJs: false` as the placeholder.

The packages themselves are scaffolded in E0.7, which is the round that
proves this toolchain end to end.

**Done when:** a fresh checkout runs `npm run typecheck` green, and a
new TS workspace needs only a `tsconfig.json` that extends the base.

### E0.2 — Pay down the loose ends — **Done, Nov 2026**

All seven rows closed. The headline is that the first two were a live
bug, not drift: commit `bfffca5` bumped `SCENE_VERSION` to 2 and made ids
required, rewrote every `.json` scene, and missed every scene written as
an **object literal in source** — all thirteen `docs/demos` pages and
Night Circuit's race scenes. The loader rejects version 1 outright, so
those demos had been failing on load since that commit, on the published
documentation site, and nothing caught it because `scenes.test.js` reads
files. `examples/test/inlineScenes.test.js` now closes that: it parses
the demo sources with acorn, finds the object literals whose shape says
scene (a `version` beside a `type` of `level` or `ui` — a signature the
circuit's saved-lap record and the asset manifests do not match), and
asserts the version and an id on every placed object and UI element. The
check is deliberately narrow — the full schema belongs to the validator,
and a literal cannot be loaded because it is built inside a function out
of expressions — and it was verified by reintroducing both bugs and
watching it fail. Also closed: `uses` binds `environment` assets, and a
prefab asset carries `mesh` and `light`, with `mesh.model` named by uid
and bound into the scene's `assets.models` the way a sprite sheet
already was.

Everything found in the Nov 2026 editor investigation that is wrong or
drifted today, independent of any editor work. Small, mostly
independent fixes; one PR each or one sweep.

| Item | What is wrong | Done when |
| --- | --- | --- |
| Night Circuit inline scenes | `examples/src/circuit/main.js` builds scenes with `version: 1`; `SceneLoader` accepts only version 2, so the races should fail to load | Verified in the browser; scenes updated to version 2 with well-formed ids |
| Docs demo scenes | Most `docs/demos/*.js` use `version: 1` and id-less objects | Every docs demo loads on its page |
| Inline scenes untested | `scenes.test.js` validates only JSON files, which is how the two above slipped through | Inline scene literals (circuit, docs demos) are validated in a test, by export or by extraction |
| `uses` cannot bind environments | `SceneLoader.#resolveUses` handles `spritesheet`, `model`, `prefab`; an `environment` uid fails with "a scene cannot use directly" | An environment binds through `uses` like any asset, with a test |
| Prefab assets cannot carry 3D | A prefab asset's `data` allows only `actor`, `spritesheet`, `defaultAnimation`, `physics`, `constraints`; `mesh` and `light` are scene-only | The manifest prefab schema accepts `mesh` and `light`; a 3D prefab lives in a manifest and a scene uses it |
| Manifest docs omit `environment` | The asset-manifest reference doesn't document the type | Documented |
| Doc drift | `docs/contributing/architecture.md` lists the deleted `core/sceneMigrations.js`; `AGENTS.md` describes the engine as 2D-only | Both corrected |

**Done when:** the table is empty.

### E0.3 — The scene writer — **Done, Nov 2026**

Landed as the first real module of `packages/editor-core` (created early,
not waiting for E0.7, since the writer needed a home): `writeScene`,
`writeManifest` and a generic `write(doc, schema)`, with `WriteError`
naming the field that cannot be JSON. Canonical form: keys in the
schema's own declaration order (unknown regions keep document order — the
writer never invents an order it would have to defend), two-space indent,
a value inline while the line fits 100 columns and one entry per line
past that, which packs a long array of short tuples one tuple per line.
Every shipped scene and manifest is now the writer's output byte for
byte, enforced by `examples/test/sceneWriter.test.js` beside the lossless
and idempotence tests; the five generator scripts emit through it (the
lot went from one 160 KB line to ~9,400 diffable ones, and the reformat
of everything else *removed* a net 9,000 lines by inlining short
objects); `examples/scripts/formatScenes.mjs` restores the form after a
hand edit, and the shared game-stub machinery moved to
`examples/test/helpers.js`. The generated-scene marker is a top-level
`generator` field in the scene format (schema, reference docs and an
AGENTS.md rule), written by each build script; deleting it detaches a
scene from its script.

Two corrections to this round as planned. **Omission is by `default`
only, not `initial`**: the loader applies `default` on load, so omitting
a default-equal field is lossless, but `initial` is inspector metadata
the loader never applies — omitting initial-equal constraint params
would change what loads. And the writer **formats, never validates**:
validation stays the loader's single job, so there is one validator.

A finding that de-risks E0.7: Node 24 runs the TS package's source
directly (type stripping) — the generator scripts, plain `.mjs`, import
`m2d-editor-core` with no build step, because workspace symlinks
resolve outside `node_modules` where stripping is allowed. The cost:
source that runs this way keeps to **erasable syntax** — no enums,
namespaces, parameter properties or decorators — and relative imports
say `.ts` (`allowImportingTsExtensions`), with
`rewriteRelativeImportExtensions` the publish-time answer when E0.7
decides emission.

The roadmap's first blocker, and the foundation `editor-core` is built
on. A canonical, diff-friendly serializer for scene JSON and asset
manifests.

- Canonical form: fixed key order (the schema's declaration order, which
  `fieldsOf` already yields), two-space indent, one object per line
  where a line is short, arrays of tuples (prop placements, frames)
  packed one tuple per line. `lot.json`'s single generated line becomes
  readable and diffable.
- Defaults are **not** written: a field equal to its descriptor's
  `initial`/default is omitted, so saving a hand-written scene does not
  bloat it. The loader already applies defaults on read.
- Round-trip guarantee, pinned by test: for every shipped scene,
  `write(load(json))` is byte-identical to `write(load(write(load(json))))`
  (canonical-form idempotence), and `load(write(load(json)))` deep-equals
  `load(json)` (nothing lost). Byte-for-byte against the *existing*
  files is not required — they get one reformatting commit to canonical
  form, after which byte-stability holds.
- The generated-scene policy, decided here: `buildRowScene.mjs` and
  friends keep ownership of their outputs and are re-pointed at the
  writer, so a generated scene and a saved scene are the same format and
  regeneration produces clean diffs. The editor will mark
  script-generated scenes read-only until a scene is explicitly detached
  from its script (an E2 concern; the marker — a `generator` field or a
  sidecar — is decided here because the writer must round-trip it).
- Lives in `editor-core` (TS, per E0.1), not the engine: the engine
  never writes scenes. The engine's schema descriptors are its input;
  if descriptor introspection needs one more helper (e.g. declaration
  order, default extraction), that lands in `core/schema.js` with tests.

**Done when:** every shipped scene and manifest round-trips under the
tests above, the build scripts emit through the writer, and one
reformat commit has landed.

### E0.4 — Actors declare `static properties` — **Done, Nov 2026**

Landed as the actor-side twin of constraint params: `static properties`
on an `Entity` subclass, resolved through `s.dynamic` against
`game.actors` exactly as constraint params resolve against
`game.constraintTypes`, with `actorPropertiesSchema(Class)` and
`fieldsOf` giving an inspector its field list. Three decisions the
round settled:

- **The chain merges.** A subclass's declarations merge over its bases',
  base first, so `ObliquePlayer` restates nothing of `TopDownPlayer` and
  a subclass that declares nothing is still checked against its base.
  `static replicated` already worked this way; `actorPropertyFields`
  does the same for objects rather than arrays.
- **Declaring nothing keeps the old contract.** An actor with no
  `static properties` anywhere in its chain takes any bag, unchecked, as
  before — so this is adopted per actor and nothing broke without one.
- **`initial`, never `default`**, for the constraint reason exactly: an
  object that sets one property must not thereby reset the rest, so the
  loader does not fill these in and the constructor's `??` still does.

Schemas now on the engine actors the demos use (`Trigger`, `Npc`,
`ObliquePlayer`, `MovingPlatform`, `Turret`) and the demo-side ones
(`Tree`, `GroundDetail`, `Wall`, `Torch`, `Street`, `Foreground`). The
vocabulary needed nothing new — `MovingPlatform.path` is literally
`s.object(PathFollow.params)`, a constraint's params reused as an
actor's property, which is a good sign about both.

**What declaring found, which is the point of the round.** Two pieces of
scene data that were lies: Hollow Grove's `groundDetail` carried a
`pond` nothing has ever read (the pond is its own object; removed from
the generator), and Cinder Keep's torches say `face: 'east' | 'south'`
while a guess at `'north' | 'south'` failed on load — the code's own
comment said east, and the schema is now what the code means. Both are
exactly the class of bug an `s.any` bag hides forever.

Constraints already declare `static params`; actors declare nothing, so
their `options` are `s.any` and no inspector can edit them — and neither
can an agent without hallucinating. Mirror the constraint pattern:

- `static properties` on `Entity` subclasses, same descriptor
  vocabulary, same `initial` semantics, resolved through `s.dynamic`
  against `game.actorTypes` exactly as constraint params resolve.
- The loader validates a scene object's `properties` against its
  actor's schema when a game is present (the no-game structural path
  stays lenient, as it is for constraints).
- Every engine-adjacent and demo actor gains a schema. The demos are
  the test: if a demo actor's options cannot be described by the
  descriptor vocabulary, the vocabulary is missing something — find out
  now, not in E1.
- Callbacks stay out of `properties`, the same rule constraints have
  for `onDeath`.

**Done when:** every registered actor in the four flagship demos
carries a schema, the loader validates against it, and `fieldsOf` on an
actor yields an inspector-ready field list.

### E0.5 — Multiple views of one scene — **Done, Nov 2026**

Landed as `game.addView(canvas)` / `removeView(view)` over a renderer
that is now view-structured. The realized shape differs from the planned
`render(frame, views)` in one way worth recording: a view's GPU state
(TAA history, adapted exposure, cluster grid, previous view-projection)
must persist across frames, so views are *created* on the renderer
(`createView(canvas, camera)`) rather than passed per call — a per-call
array could not own a history.

**How it works in 3D.** The frame uniform stays one buffer: each view's
camera is written into it *between submits*, and because `writeBuffer`
is itself a queue operation, each view's submit sees its own write — no
bind-group explosion. Per frame: scene assembly, uploads, the GPU cull
and the shadow maps run once (the cull tests every view's frustum in one
dispatch — views are passes `0..V-1`, shadows after, with the
caster-skip now keyed on a first-shadow-pass index in the cull params);
per view: the main pass, the light-cluster rebuild, the post stack and
the composite into its own canvas, which one shared `GPUDevice` happily
configures. `PostPass` split into shared `PostPipelines` and a per-view
stack, so a new view costs targets, not seventeen pipelines.

**What a side view shares rather than owns**, each an editor-acceptable
call recorded here: the shadow maps (fitted to the primary camera's
frustum), the LOD the cull picks (the primary camera's), and the light
fade distances `Frame3D.addLight` bakes in at add time. `MAX_VIEWS` is 8
and `MAX_CULL_PASSES` grew to fit views + all shadow passes, with a
runtime check where there was silent truncation before.

**2D** needed no renderer change: the world pass is immediate-mode, so
each view is a second renderer instance of the same backend, and
`drawWorld` walks the scene once more per view with `game.renderer` and
`game.camera` swapped for the walk — the one place that indirection is
serviced, as the code map predicted.

**Measured** (SwiftShader, 320×180, ~200 instances, medium shadows):
1 view ≈ 102 ms, 2 ≈ 163 ms, 4 ≈ 284 ms — each extra view costs ~60% of
a single-view frame, which is the main pass + post stack, with the
shared ~40% (assembly, cull, shadows) paid once. Software-rasterizer
numbers; the proportions, not the milliseconds, are the finding. Real-GPU
numbers await a desktop run of `yard?views=2`, the demo deliverable: a
picture-in-picture canvas circling the hero on its own camera while the
main view stays interactive.

Tests: `test/browser/views.test.js` — two 3D views showing different
pictures of one assembled frame (instances counted once), a view facing
the scene from the opposite side (its frustum culled independently),
remove-and-keep-rendering, and the 2D two-canvas walk with the
renderer/camera swap proven restored. Plus one readback lesson: a WebGPU
canvas texture expires when the task ends, so reading two views means
enqueueing both copies before the first await.

Hard requirement. Today the 3D renderer binds exactly one canvas, draws
one camera, and keeps per-frame state (TAA history, auto-exposure,
cluster grid) that assumes one view. The platform is not the problem:
one `GPUDevice` can configure any number of canvas contexts, and the
2D renderers are immediate-mode and could redraw per view already. The
limit is renderer architecture, so this round is a **spike that lands a
deliverable**, in the plan's tradition:

- The shape to prove: `renderer.render(frame, views)` where a view is
  `{ camera, target }` and a target is a canvas context or an offscreen
  texture. Scene traversal, the instance cull and the shadow maps run
  once per frame; the camera-dependent passes (main, post, composite)
  run per view. Per-view state (TAA history, exposure, cluster grid)
  moves into a per-view record.
- Costs to measure before committing: each view pays its own main pass
  and post stack, so four views are roughly four times the frame cost
  minus shared shadows and culling — fine for an editor at edit-time
  frame rates, and the measurement says where the budget lands.
- The 2D path: multiple cameras over one scene through the existing
  immediate-mode contract, one canvas each. Likely small; prove it with
  the same deliverable.
- The HUD overlay stays a property of the *primary* view only; editor
  side views have no game HUD by definition (E0.6).
- Deliverable with a face: a debug/demo page (or a yard `?views=2`
  mode) showing the same running scene from two cameras on two
  canvases, both interactive. That page is also the regression test's
  fixture.
- Explicitly out of scope: editor docking/layout, gizmo rendering,
  render-mode toggles (wireframe, unlit). Those are E1/E2.

**Done when:** two live views of one 3D scene and one 2D scene render
correctly on one page, with a browser test pinning that the views show
different cameras of the same frame, and a written note on the measured
per-view cost.

### E0.6 — The edit-mode contract — **Done, Nov 2026**

Landed as one constructor flag, `editMode`, documented in the engine
options reference. Materializing needed no new API: on an edit-mode game,
`addScene` + `switchTo` *is* materialization, because the flag makes
`Scene.load()` build everything and call nothing. What the flag gates,
each at one authoritative place: every scene lifecycle and draw hook
(`onEnter`, `onShow`, `onDraw`, `onDrawBackground`, `onRender`, `onHide`,
`onExit`); the tick (`fixedUpdate` declines whoever calls it, `step`
returns 0 without advancing the clock, and the frame loop treats edit
mode as a standing pause so game time never moves and no timer fires);
input routing to the scene's UI (`setUIContainer` is skipped, so a
materialized menu draws but its buttons cannot fire); `gameOver`; and
cvar persistence (the registry is built with no storage, so an editing
session cannot touch a player's settings). Engine input events still
fire — the editor's own picking and tools need them.

One nuance the plan's wording hid: "no game code runs" means no *hooks*.
Actor constructors, constraint construction and entity `draw` methods are
game code and do run — they are what a 2D scene's look *is*, and the
engine's own headless rule already forbids them side effects. The
contract is: build everything, call no hook, step nothing, route nothing.

Tests: `test/editMode.test.js` (headless materialize with hook spies, the
never-ticks proof under gravity, inert `gameOver`, hook-free unload, the
same game without the flag playing normally, and the
edit → play → stop → edit cycle restoring the document's state); and
`test/browser/editMode.test.js` (the materialized document drawn and
pixel-checked with no hook run, a UI scene whose button cannot fire,
engine input still delivered, cvars with no storage, and the full cycle
leaving no listener on the page).

In the editor, a loaded scene must be *presentation without game*: no
`onEnter`/`onShow`/`onFixedUpdate` hooks, no game keybinds, no game
menus, no console side effects, no hard-coded scene switches. Those run
only in play-in-editor. Today several things fight that:

- `SceneManager` always runs the lifecycle hooks; there is no way to
  instantiate a scene's entities, props, tiles and lights from a
  document without also running the game's `onEnter` (which builds
  HUDs, registers waves, starts music).
- The built-in loop hard-codes a switch to `'mainMenu'` from the
  game-over screen (`core/m2d.js`).
- Input listeners scope to the canvas (good — DOM panels are safe), but
  nothing stops a focused edit viewport from feeding `KeyboardControl`
  constraints if the simulation ever steps.
- The developer console and cvars persist to shared storage; an editor
  session must not overwrite a player's settings.

The round defines and lands the contract:

- A scene can be **materialized** from a loaded document — entities,
  constraints (constructed but dormant), props, tile layers, lights,
  background — with zero game callbacks invoked and the simulation
  never stepping. The editor draws it through the existing render path
  (and E0.5's views). This is a loader/Scene capability with its own
  tests, headless ones included; it is *not* an editor feature, which
  is why it is engine work in E0.
- An explicit mode flag the engine honours: in edit mode, input is not
  sampled into the simulation, world events do not fire, the game-over
  switch and any other built-in scene transitions are inert, and
  console/cvar writes go to a session-scoped store.
- Play-in-editor is then the *absence* of the flag over a fresh
  materialization: feed the in-memory document through `fetch`, run
  hooks for real, `game.step`/`pause` to step, `destroy` and
  re-materialize to stop. Nothing global survives `destroy()` — the
  existing rule is exactly what makes this cheap, and this round adds a
  test that edit → play → stop → edit leaks nothing.

**Done when:** a headless test materializes a shipped scene with a spy
proving no lifecycle hook ran, a browser test shows a materialized
scene rendering with input and transitions inert, and the
edit → play → stop → edit cycle passes a leak check.

### E0.7 — The three package shells — **Done, Nov 2026**

All three in the tree, typechecked, tested and wired into the root
commands. `npm run editor` serves the app; `npm run editor:mcp [folder]`
is the agent endpoint. Verified by hand as well as by test: a real MCP
client over real stdio lists the tools and calls `list_scenes` against
`examples/src/yard`, and correctly reports `lot.json` as generated and
`yard.json` as editable — the `generator` field from E0.3 earning its
keep end to end.

`editor-core` grew the module boundaries around the writer:
`SceneDocument` (the parsed scene, its canonical text, its dirty state,
its generator flag), `CommandStack` (apply/undo/redo, batching, change
listeners) and `validateScene` (the engine's loader wrapped into a list
of issues rather than a throw). The command model's shape is the
decision worth recording: **a command returns its own undo from
`apply`**, rather than the stack snapshotting the document — a scene is
large and most edits are small, so remembering the inverse is cheaper
than remembering the world, and a command that forgets to be reversible
becomes impossible to write. Concrete commands are E2's.

`editor-mcp` is the companion process and the MCP server in one, for the
reason the plan gave: the browser cannot run the asset pipeline, so a
local process must exist anyway, and that is where an agent endpoint
belongs. Three read-only tools this round (`list_scenes`, `read_scene`,
`validate_scene`) and deliberately **no stubs** for the mutating ones —
a tool that exists and does nothing is worse than one that is absent,
because an agent will call it. `Project.resolve` refuses paths outside
the project, which is the boundary an agent-named path needs.

`editor` is the Vite app: the docked panel frame (tree, viewport,
inspector, assets, console) as empty regions, a project opened through
the File System Access API, its scenes listed, and the chosen one drawn
by a real engine instance in **edit mode** — E0.6's payoff, since that
is what lets a document be shown without any of its game code running.
Panels stay empty on purpose; one faked now is one rewritten in E1.

**Decided, as the round asked.** `editor` and `editor-mcp` are both
private for now and `editor-core` publishes nothing yet: the companion
is how a user starts the editor, and nothing outside this repo consumes
the core until the editor ships. When they do publish, `editor-core`
emits with `rewriteRelativeImportExtensions` (E0.3's finding).

**One toolchain lesson.** A TS package consumed from source by another
package is compiled under *that* package's tsconfig, so ambient
declarations in its own `include` are invisible. The engine declarations
`editor-core` carries are now pulled in by a triple-slash reference from
the files that need them, which travels with the source wherever it is
compiled. The editor app has the same arrangement, plus the File System
Access API's directory picker, which Chromium ships and TypeScript's DOM
library does not describe yet.

E0 ends with every package that the editor work will live in already
in the tree, wired into the toolchain, the test run and the dev
commands — so E1 and everything after it writes features, never
boilerplate. The owner's rule for this round: after it lands, a future
round should touch config only to add or drop a dependency.

Three packages, all TypeScript, all extending the E0.1 base config:

| Package | What it is | The shell contains |
| --- | --- | --- |
| `packages/editor-core` | The headless document, command and writer core. Runs in a browser and in Node, depends on `m2d-engine` for schema descriptors and nothing else | Public entry point with the real module boundaries stubbed (`document`, `commands`, `writer`, `validate`), the writer's canonical-form entry as the one function with a real body if E0.3 has landed, emitted `.d.ts`, one passing test |
| `packages/editor-mcp` | The MCP server and the local companion process: serves the editor, watches the project folder, runs the asset compilers, speaks MCP over stdio and HTTP | An MCP server that starts, advertises a trivial read-only tool over `editor-core` (`get_scene_tree` or `validate_scene`), the companion's static-serve and file-watch skeleton, one test that boots the server and lists tools |
| `packages/editor` | The browser app. Vite, never published | An app that boots, opens a project folder through the File System Access API, mounts the DOM panel frame (tree, viewport, inspector, assets, console as empty docked regions) and an engine canvas that renders a materialized scene, talking to `editor-core` only |

Also in this round:

- Workspace wiring: the three directories in the root `workspaces`
  array, each with `test` and `typecheck` scripts that the root
  commands pick up, and `npm run editor` at the root for the dev loop
  (companion process + Vite app together).
- A decision recorded in the PR: whether `editor` and `editor-mcp`
  publish at all. The default is that `editor-core` and `editor-mcp`
  publish and `editor` is private, since the companion is how a user
  starts the editor.
- No feature work. A panel that renders an empty region is correct for
  this round; a panel that renders a scene tree is E1.

**Done when:** `npm test` and `npm run typecheck` cover all three
packages from a fresh checkout, `npm run editor` opens the app with its
panel frame and a rendering viewport, and an MCP client connects to the
companion and lists its one tool.

## What E0 deliberately does not include

- **The engine's TS migration / `checkJs`.** Its own roadmap item; E0.1
  only prepares the ground.
- **The editor plugin API.** Editor plugins (commands, panels,
  inspector widgets, loaded as ES modules from the project) are real,
  but the API is shaped by `editor-core`'s command model and the
  inspector's widget registry — designing it before those exist is the
  A2 mistake again. First consumer: the editor's own built-in panels,
  which should use the same registration surface a plugin would.
- **Gizmos, picking ID buffer, selection.** E2 territory; E0.5 gives
  them the views to draw into.
- **The MCP server.** It is the second consumer of `editor-core`'s API
  and starts the moment `editor-core` has commands to expose — which is
  the first post-E0 milestone, before any GUI.
- **Nested scenes.** A format bump, deferred as the roadmap says.

## Sequence and the milestone after

E0.1 → (E0.2 ∥ E0.3 ∥ E0.5 ∥ E0.6), with E0.4 alongside any of them →
**E0.7 last**, since the shells are better shaped by what the earlier
rounds learned (the writer's real API, the materialize call the
viewport needs, the views contract). The rounds are sized so no two
need to touch the same files at once.

The first post-E0 milestone is **editor-core with a command model and
the MCP wrapper, no GUI**: open a project folder in Node, read the
scene tree, apply `SetParam`/`MoveObject`/`AddConstraint` commands with
undo, validate, save through the writer, and run a headless simulation
check — all driven by an agent over MCP. That milestone dogfoods every
E0 deliverable before a single panel is built.
