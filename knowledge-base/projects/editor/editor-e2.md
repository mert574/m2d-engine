# E2: edit and save — done, Nov 2026

Part of [[editor]]. A shipped phase plan, kept as the record of why things are built as they are.

Working record, not published documentation; the phase row lives in
`docs/contributing/roadmap.md`. The plan as written is kept below the
record of what shipped, which says where the build departed from it. E0 (enablement), E1 (the read-only
viewer) and the host (the editor runs the project's real code) are done;
see `editor-e0.md`, `editor-e1.md` and `editor-host.md`. This document
opens with a review of what shipped, because three of its findings change
what E2 has to do first.


## What shipped, 10 Nov 2026

The owner's three directions before building: an editor is **one game**
(no project of many games, no grouping in the panel); generated scenes
must become editable — a script may lay a scene out **once**; and edit
mode may simply **draw at 5 fps** at rest rather than know when assets
land. The owner also confirmed the plan's open decision: documents live
in the host.

**One game per project.** `m2d.project.json` is one game's declaration
(`name`, `definition`, `scenes` defaulting to `scenes`, `basePath` to the
root), at that game's folder: `examples/src/<demo>/m2d.project.json`, the
examples-wide file deleted. `npm run editor examples/src/yard` opens one;
with no project the host lists the ones it can find. The bar picks a
scene; the tree is the scene's. Game code outside the folder
(`../shared/`) is served and hot-reloads: the host reloads when the
*definition's import graph* contains the changed file, not when the file
is under the folder.

**Seeds, not generators.** Every `build*Scene.mjs` writes its scene only
when it is missing (`scripts/seedScene.mjs`: `--missing` quietly, as the
dev server's `buildStart` runs them; no flag refuses with a note;
`--force` rebuilds and discards edits). Rerun before detaching, all five
reproduced their committed files byte for byte, so dropping the stamp
lost nothing. No shipped scene carries `generator` now; the mechanism
stays for a project that wants a script-owned scene: read-only in the
editor, refused by the host, detachable with one confirmed edit.

**E2.0, draw on demand.** `game.invalidate()` draws the next frame;
otherwise an edit-mode game draws at `M2D.EDIT_IDLE_FPS` (5). Measured
idle: 15 draws in 3 s on the yard, the Grove and the Keep (from display
rate). Pinned by a browser test; play unchanged.

**E2.1, edits as data, documents in the host.** `edits.ts`: `set` (no
value deletes), `insert`, `remove` at index paths, all or nothing, and
applying returns the **inverse as ops** — so the host broadcasts an undo
exactly as it broadcasts an edit, and a replica never needs the host's
stack. `dirty` is a history-position comparison (O(1)), not a write of
the scene. The host's `Session` holds every open document; tabs edit a
`RemoteDocument` over Vite's socket (`m2d:edit`/`undo`/`redo`/`save` up,
`m2d:change` down), applying their own edits at once and rebasing them
under changes that land first; anything irreconcilable resyncs. Agents
edit the same session over MCP at `/mcp` on the editor's port
(`edit_scene`, `undo`, `redo`, `save_scene`, `outline_scene`,
`inspect_node`, `validate_scene`, `list_scenes`, `read_scene`); the stdio
command remains for when no editor runs. The host loads the game's code
in Node through Vite's SSR loader, so an agent's `validate_scene` and
`inspect_node` use the real classes — it reports the very
`path.type` bug the review found. Verified: two tabs and an agent making
54 concurrent edits, undos and redos end byte-identical to the host.

*Departure:* the plan's `CommandStack` merge key was not built. A gizmo
drag previews by moving the body and commits once on release; nothing
else streams edits. No consumer, so no abstraction.

**E2.2, in place.** `Scene.materializeObject` (the load's loop body,
extracted) and `Scene.replaceObject(id, object, { after })`, edit mode
only, rebuild one object in its draw slot. The viewport diffs object
records after a change confined to placed objects, validates the
document with the live game (the loader stays the one validator) and
rebuilds just what changed; anything else — prefabs, world, props, tiles,
an object's `overrides` — is a full rebuild with the camera held. A
document the loader rejects keeps the last good picture and shows the
message on the row its path names. Measured warm: 9 ms to validate the
lot, 5 ms to rebuild one object; 18–23 ms per edit end to end on the
Grove, the Keep and the yard. Moving an object always rebuilds it,
because actors seed their look from their position (`makeRng(seedFrom(
body.position))`): what shows after a move is what the game will draw
there.

**E2.3, selection and picking.** A click selects: 2D the smallest drawn
bounds containing the point (a world-sized backdrop never wins), 3D the
nearest box along `screenToRay`. Selection is an object id (it survives
reordering), shared by tree, inspector and overlay. **F** frames it.

**E2.4, gizmos.** An SVG overlay (`overlay.ts`) over the canvas, the
same in 2D and 3D because the viewport hands over geometry in client
pixels (`viewToClient`, the inverse of `mapPointer`, now in the engine's
`viewport.js`). Per-axis and free moves (the ground plane in 3D; in a
projected 2D game solved against the projected ground axes, exact for
any affine projection), 2D rotation, snap to 8 px / 0.25 m / 15° (Ctrl
inverts). A drag starts from the *document's* placement, not the body's —
a platform on a path stands at the path's first point. Verified: a
100 px drag moves 100 px; a quarter-turn sets π/2 exactly.

**E2.5, the inspector writes.** Inputs by kind: numbers with units,
checkboxes, enum and ref choices (prefabs, actors, constraint types,
scenes), text; × resets a field to its default. Duplicate (Ctrl+D, a
`uniqueId`), delete, undo and redo by key and button, a history panel.

**E2.6, save.** Ctrl+S or Save, through the host; the watcher's echo of
the host's own write is recognized by content and ignored.

**The milestone, on the original target.** A wall on the lot moved by
gizmo — in place, no game rebuilt — saved, and the saved `lot.json` is
the writer's canonical output and loads in the game with its own classes.

**Found on the way, worth keeping.** Overlay redraws were scheduled on
`requestAnimationFrame`, which a GPU-bound page starves for seconds (the
lot under SwiftShader): the outline now draws synchronously. And a
measurement lesson recorded so it is not repeated: a colour threshold
"proved" 3D objects vanished under the overlay; fog had only paled them.
A screenshot of the lone object settled it.

## Left open

- **Props.** Instances are tuples in arrays of thousands; the inspector
  summarizes them, picking does not reach them, and any change to one
  rebuilds the game. Editing a lot district's props by hand — scatter,
  select, move — is the next editor work, and wants the 3D renderer's
  batch rebuild by key.
- **3D rotation.** A 3D object's orientation is not a scene field yet;
  the gizmo translates only.
- **Lights and other non-object nodes** have no gizmo; they edit in the
  inspector.
- **Ash Row's facades** still draw untextured in the editor: `main.js`
  hands `Street` its textures from a scene hook. A game-side fix.
- **One loader issue at a time.** The loader stops at its first problem.

## Follow-up round, same day

The owner's asks after E2, and what landed:

- **Every problem, not the first.** `validate` (`core/schema.js`) gained
  an opt-in `collect` mode — each child of an object, record, array or
  tuple, and each refine, is checked on its own — and
  `SceneLoader.check()` returns `{ loaded, issues }` with it. The editor
  checks the document after every change against a *validator*: a
  headless game with the definition's real classes, so actor properties
  and constraint params are checked even when the viewport cannot build
  the scene. Problems show in a dock panel (click to select the node),
  as badges up the tree, on the inspector row each one names, and in the
  status line. Refines still stop at their own first failure (a scene's
  duplicate ids report one at a time).
- **3D rotation.** A placed object's `rotation` is a unit quaternion
  `[x, y, z, w]` — the engine's own math refuses Euler angles in storage
  for good reasons, so the document never holds them. The editor shows
  yaw, pitch and roll in degrees (`editor-core/rotation.ts`, tested
  against the engine's `Quat.rotate`), the outline and picking follow the
  turned box, and the gizmo's Rotate mode (E) has a ring per world axis,
  snapping to 15°. A 2D level rejects `rotation`, a 3D one `angle`, and
  the inspector hides whichever the scene's dimension cannot take.
- **Ash Row draws its facades in the editor.** `Street` owns its
  textures: imported in its own module, decoded on first draw (which is
  presentation, so headless never asks for an image). The old handoff ran
  in `onEnter`, a simulation hook, which edit mode rightly never runs.
- **Idle at 20 fps, with a switch.** `M2D.EDIT_IDLE_FPS` is 20;
  `game.drawOnDemand` turns drawing on demand off. The bar's **Power
  saving** switch drives it, on by default and remembered per browser.
  Measured on Ember Valley: 19 draws a second at rest, 60 with it off.
- **The GUI, redone.** A status line; a dock with Problems and History
  tabs (the history clickable to undo back to a step) in place of the
  empty assets placeholder; a viewport toolbar (Move W, Rotate E, Frame
  F); icon buttons and switches in the bar. The tree folds (big groups
  start folded), filters, has a glyph per kind and problem badges, and
  walks with the arrow keys. The inspector has sections that fold, human
  labels, defaults visible as placeholders, Position/Size/Rotation as
  vector rows, labels that scrub numbers when dragged, angles in
  degrees, colour pickers, Add for an absent block and × to remove a set
  one or a list entry, and the sprite sheet and model refs populated.

## Plan after E2 — the TODO list

In order. Phases first, then the two items the owner added:

1. ~~**E3: Assets.**~~ Done — `editor-e3-e5.md`.
2. ~~**E4: Play and iterate.**~~ Done — `editor-e3-e5.md`.
3. ~~**E5: Project and build.**~~ Done — `editor-e3-e5.md`.
4. ~~**Rebuild the lot properly**~~ (owner, Nov 2026). Done, Nov 2026, in
   the seed script: `lot.json` is now a town corner where two roads
   cross — corner shops with the milk truck delivering, a terrace with
   its front and back gardens, a works depot with a warehouse, office and
   workshop, a park with a plaza and a jacaranda avenue, allotments,
   noise-scattered woodland with a ruined fort, and meadow — streets,
   plots and purpose, with nothing scattered onto a road or into a
   garden. Buildings are primitive shells (a gable is a box turned 45
   degrees about its ridge) dressed with scanned shutters and lamps; the
   yard's physics toys each have a reason to be where they stand. The
   modular kits are cut into single pieces by the compiler (`PIECES` in
   `fetchPolyHaven.mjs`). Still open: props one by one in the editor
   (pick, move, scatter individual instances), which the script cannot
   give.
5. **Resizable, toggleable sidebars and saved layouts** (owner, Nov
   2026). The simple half is done (`editor-e3-e5.md`, follow-up round):
   drag handles, toggles, remembered sizes. Still to do: predefined and
   saved layouts (editing, scene review, code-first) and docking panels
   anywhere. Evaluate a docking library rather than hand-rolling it —
   candidates: dockview, golden-layout, FlexLayout — on size, licence,
   vanilla-DOM support (the editor has no framework) and whether the
   engine canvas survives being re-parented.

## The review, 10 Nov 2026

Read against the code and measured, not recalled: the editor driven
headlessly over a live host (Playwright, SwiftShader for WebGL2 and
WebGPU), editor-core benchmarked in Node on the shipped scenes.

### Fixed in the same round

| Finding | Evidence | Fix |
| --- | --- | --- |
| **Every reload left a dead canvas.** A code hot reload or a scene changing on disk rebuilt the game on the same `<canvas>`; the old game's `destroy()` calls `loseContext()` (correctly — browsers cap live contexts), and a canvas hands every caller the same context, so the new game drew into a lost one. The host record's "verified end to end" checked the status line and errors, not pixels | Screenshot after a reload: the lost-context icon; `isContextLost() === true` | `Viewport` swaps in a fresh canvas per game |
| **Ember Valley did not load**, in the editor or in the shipped game, since E0.4. Its moving platforms set `path.type: "linear"`, which `PathFollow.params` does not declare and nothing ever read — a third lie of the kind E0.4 found two of | `SceneValidationError … properties.path.type: unknown field 'type'` | Field dropped. The example suite stubbed every actor as `class {}`, which declares nothing, so declared `properties` were never checked; `scenes.test.js` now also loads each scene in a real headless game with its definition's `register(game)`, and fails on the old file |
| **Ash Row could not open.** Its manifest was loaded in `main.js`, outside the definition the editor imports, and the editor's structural pre-check rejected every `uses` scene outright | "the game has no asset database loaded" | `game.loadAssets` moved into `register(game)`; the pre-check removed — the engine, with the real classes, is the one validator, and a scene it rejects still shows its outline and fields (E1's stated intent, which the pre-check contradicted) |
| **Overlapping loads panicked Rapier.** Clicking a second scene mid-load destroyed the first game under its in-flight `switchTo` | `RuntimeError: unreachable` | `Viewport.show` lets an overtaken load dispose of its own game once it settles; `main.ts` runs one load at a time, newest wins |
| **Any code change anywhere rebuilt the open game**, once per watcher event: a build script, another game's actors, a bundle written into `dist/`. Five quick saves were five overlapping rebuilds | Counted by context creations | Code reloads now come from Vite's hot-update hook (after graph invalidation, so no race with a second watcher) and only when the open game's definition transitively imports the file; events settle 60 ms and coalesce. Five saves: at most two rebuilds; unrelated files: none |
| A scene reloading from disk reset the camera and the selection; the inspector ignored the real registries the host now provides, so actor `properties` rendered as a bag | — | Camera and selection kept; the inspector resolves against the running game's classes (labels, units, descriptions) |

### Measured and fine

editor-core is not the bottleneck. On `lot.json` (370 KB) and `keep.json`
(615 objects): `JSON.parse` ≤ 1.6 ms, `validateScene` ≤ 4 ms,
`sceneOutline` ≤ 0.1 ms, `inspectNode` ≤ 0.8 ms. `Project.scenes()` walks
the examples in ~35 ms. `writeScene` is 10 ms on the lot — fine for a save,
not for what `dirty` uses it for (E2.1).

### Carried into this plan

1. **Edit mode draws every frame, forever.** A static document gets the
   full pipeline at display rate: ~20% of the main thread idle on Hollow
   Grove and Cinder Keep, and on the 3D lot the GPU stays saturated
   (SwiftShader managed 11 frames in 3 s, enough to stall navigation). An
   editor left open on a laptop is a battery drain. → E2.0.
2. **Every change rebuilds the whole game.** Physics world, every
   pipeline compiled again, every texture and model decoded again: 0.3 s
   for the Grove under SwiftShader, 7.9 s for the lot. Acceptable for a
   code reload; not for a field edit, and impossible for a gizmo drag. →
   E2.2.
3. **The agent and the person edit different documents.** `mcp.ts` is
   its own process over the files; the browser holds the open document
   in memory. An agent's save arrives as a file change, which the editor
   refuses while it has unsaved edits, and never enters the person's undo
   list — which is what `commands.ts` promises. → E2.1, the one decision
   to confirm before building.
4. **Most of the dogfood project is read-only.** Five of the eight
   shipped scenes carry a `generator`, `lot.json` among them — and E2's
   roadmap milestone is "a lot district is moved by hand, saved". → the
   milestone below.
5. Smaller: there is no way back to the scene list without reloading the
   page; Ash Row's facade textures are handed to `Street` from a scene
   hook in `main.js`, which edit mode never runs, so the editor draws
   the street untextured (a game-side fix, part of Ash Row's polish).

## E2, as deliverables

The rule from the engine plan holds: deliverables, not refactors, and no
abstraction without its second consumer. Each step ends in something a
person can do in the editor, and is verified by pixels or counts, not by
the status line.

### E2.0 — Draw when something changed

Edit mode draws on demand: after `game.invalidate()`, a resize, a camera
move, an asset landing (the scene's texture and model loads are already
async per asset, and streaming in the lot keeps landing for seconds), and
for as many frames as the 3D renderer says temporal state needs to settle
(TAA history, exposure adaptation) — then not again. UI motion keeps its
own frames while a tween runs. The loop keeps running for input; only
the draw is skipped.

Engine work, in `m2d.js` and the 3D renderer, gated on `editMode` so
play is untouched. First because everything after it — selection
highlights, gizmos, in-place edits — is "change something, draw once".

*Verified by:* the idle counter used in the review reads zero draws after
settling on all three of Grove, Keep and the lot; a browser test asserts
an idle edit-mode game draws nothing and that a texture landing draws
once; pixels after settling match a continuously drawn frame.

### E2.1 — Concrete commands, and where the document lives

**The decision.** The open document moves into the host process, and
the browser holds a replica. editor-core is headless and already runs in
Node; the host already owns the project and the MCP server. A command —
from the inspector, a gizmo, or an agent — goes to the host, which applies
it to the one `SceneDocument` and broadcasts it; every tab applies the
same command to its replica (commands are plain data over a document, so
replaying one is exact). The browser applies optimistically and the host
is authoritative: the same shape the networking plan chose for play,
applied to editing. This puts an agent's edit in the person's undo list
with its label, makes saving a host operation (`Project.saveScene`
exists), and gives the host what it needs to ignore the watcher echo of
its own writes. The MCP endpoint is then served by the running host over
Streamable HTTP on its port; the stdio command stays for when no editor
is running.

The alternative — the document in the browser, the agent's edits
forwarded to it over the socket — is less code now, but makes the agent
depend on a tab being open and puts the undo history in the one process
that reloads. **Confirm before E2.1 starts.**

**The commands**, in `editor-core`, each a plain record so it can cross
the socket: `set(path, value)` — absence restored on undo — which covers
every inspector write and, batched, every move; `insert(path, index,
value)` and `remove(path, index)` for objects, props and elements, with a
`uniqueId(doc, base)` helper (the loader never invents ids; the editor
must). Paths stay index-based: undo is strictly stack-ordered, so a
shifted index is restored before anything reads it.

**Two changes to `CommandStack`**, each with two consumers in E2:
consecutive commands with the same merge key fold into one entry (a
gizmo drag, a scrubbed number field — one undo each, not one per
pointermove); and `dirty` becomes a comparison of the top entry against
the one current at save, O(1), instead of serializing the scene — 10 ms
per check on the lot, which a title bar updated on every change would pay
per pointermove.

*Verified by:* editor-core tests for every command's undo and redo,
merge, and dirty-after-undo-to-save; a host test where a command from one
client and one over MCP land in one history in order.

### E2.2 — Apply an edit in place

A command reaches the viewport as a change at a path, and the viewport
does the least that is true:

1. **A placement change** (`x`, `y`, `z`, `angle`) moves the entity found
   by `scene.entitiesById` and its body, and invalidates. This covers
   every gizmo drag.
2. **Any other change under an object** destroys that one entity and
   builds it again from its document node. The seam is the body of the
   loop in `Scene.setupLevelScene`, which becomes a
   `materializeObject(object)` the loop and the editor both call — a
   second consumer, so it is allowed.
3. **A prop placement** rebuilds the batches that prop feeds; props are
   built once into static batches today (`setupProps`), so this needs a
   rebuild-by-key path in the 3D renderer.
4. **Anything else** — prefabs, world, background, tile layers — falls
   back to today's full rebuild, with the camera held.

*Verified by:* a placement edit on the lot reaches the screen in one
frame with no context, pipeline or texture created (counted as in the
review); a property edit rebuilds one entity; the pixels after an
in-place edit match a full rebuild of the same document.

### E2.3 — Selection and picking

The selection is a set of document paths, shared by the tree, the
inspector and the viewport. Picking: in 2D, the input system's world hit
testing over entity bounds; in 3D, `screenToRay` against entity bounds
rather than physics alone, since decor and props have no bodies. The
highlight goes through `game.worldOverlay` in 2D. What the 3D renderer
offers for lines and outlines is not known yet; finding out is the first
task of this step, not an assumption of the plan.

*Verified by:* clicking any object in Grove, Keep and the yard selects
its tree row and inspector, and the reverse.

### E2.4 — Gizmos

Translate in 2D and 3D (axis handles and a free plane), rotate, a grid
snap. A drag is one merged command, applied in place (E2.2) and drawn on
demand (E2.0).

### E2.5 — The inspector writes

Rows become inputs by kind and hint: number with its unit (typed and
scrubbed), boolean, enum, string, colour, `ref` as a choice of the names
in its scope, vectors. A write is a `set` command. Validation runs
debounced after edits (4 ms on the largest scene) and puts the loader's
message on the row its path names — one issue at a time, since the loader
stops at the first; a list is engine work for later, not E2.

### E2.6 — Save

Through the host: canonical text from the writer, the watcher echo
dropped by content. A generated scene stays read-only; **Detach** is a
command that deletes `generator`, behind a confirmation saying the script
will no longer own the file.

### E2.7 — The agent writes

`apply_commands` (the E2.1 records), `inspect_node` (the inspector's rows,
which are data already) and `save_scene` on the MCP server. Not before
E2.1's decision, because where the document lives decides what these
tools touch.

## The milestone

The roadmap's milestone is "a lot district is moved by hand, saved, and
the game loads the result" — but `lot.json` belongs to
`buildLotScene.mjs`, and saving it means detaching it from the script that
made it. Proposed instead, on hand-authored scenes: **the yard's crates
rearranged by gizmo, an Ember Valley moving platform's path retuned in
the inspector, one of the two done by an agent over MCP, all in one undo
history, saved, and both games loading the result** — one 3D scene and
one 2D, the two worlds. How hand
edits and generators coexist (a generator that merges hand-placed regions
instead of overwriting them, or generated scenes that become hand-owned
once the editor can place at scale) is a question for after E2, and for
the owner.

## Order and cost

E2.0 and the commands half of E2.1 are independent and can go in parallel;
E2.2 needs both; E2.3 through E2.5 build on E2.2 and can overlap; E2.6
and E2.7 close it. E2.0 and E2.2 are the engine work, and they are what
make the editor feel native rather than a page that rebuilds.
