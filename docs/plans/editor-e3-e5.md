# E3, E4, E5: assets, play, project and build — done, Nov 2026

Working record, not published documentation. The user-facing half is
`docs/guide/editor.md`; the phase rows live in
`docs/contributing/roadmap.md`. Built in one round after E2
(`editor-e2.md`), each phase verified in the running editor against its
roadmap milestone.

## E3: Assets

**The pipeline moved into the host.** The model compiler and the Poly
Haven client were the examples' scripts, wired to the yard's folders. They
are now `packages/editor-host/src/pipeline/compile.mjs` and
`polyhaven.mjs`, parameterized by path and kind; the examples'
`compileModel.mjs` and `fetchPolyHaven.mjs` wrap them with the lot's lists.
Plain JavaScript, so both run the same files. Verified: a lot model
recompiled through the host's compiler came out the same size to the byte.
The compile runs in a child process (`compileJob.mjs`): a scan holds
gigabytes and the encoder does not yield, which would stall the host.

**Recipes and credits.** An import fetches into `library/sources/` (a
`.gitignore` the host writes keeps it out of git), compiles a model to
`library/models/<id>.glb`, records the recipe in `library.json` and
renders `CREDITS.md` from all records. Nothing in a project names a
credit by hand.

**The asset browser** is the dock's Assets tab: Project (the scene's
prefabs and the project's files, dragged into the viewport or
double-clicked to place) and Library (Poly Haven search with thumbnails,
authors and licence, Import, background jobs with progress and a Place
button). Placing a model asks the host for its bounds (`/__asset-info`,
gltf-transform's `getBounds` on `LOD0`) and makes a static prefab whose box
fits the mesh, with `mesh.offset` centring the model on it, standing on the
ground. Placing an image in 2D makes a sprite sheet at its own size. The
engine gained a generic **`Prop`** actor for this (and for the templates):
scenery that draws its sprite or mesh, or a coloured block in 2D.

**Milestone met, on a fresh 3D project outside the repository:** "wooden
crate" searched, Wooden Crate 01 imported (fetched, checksummed, compiled)
in 26 s, placed, drawn textured and standing on the ground, credited in
`library.json` and `CREDITS.md`, no problems reported.

## E4: Play and iterate

**The hooks convention.** Play needs each scene's presentation hooks, which
lived in each game's `main.js` beside page-only code. `m2d.project.json`
gained `hooks`: a module exporting `sceneHooks(game)`, kept apart from the
definition so headless consumers (the host, tests, servers) never import
presentation. The yard and Ember Valley moved their hooks into `hooks.js`;
their pages build from it (the yard's loading plate stays in `main.js`).
The other demos play the bare scene until they move theirs.

**Play** (F5) builds a fresh game without `editMode` on a copy of the
document (the simulation must not move the document), with the hooks and
the project's other scenes loadable from the host, unsaved edits included.
The editor steps aside: no gizmo, no picking, tree and inspector inert,
keyboard to the game. Stop rebuilds the edit view from the untouched
document with the camera restored. A code change during play restarts it
on the new code.

**The console** is a dock tab: the page's `console` mirrored (repeats
folded, `debug` left in devtools), uncaught errors and rejections, and an
input line running `game.commands` on whichever game is live.

**Agents** gained `run_scene`: the host steps the open document headless
for some seconds and reports each placed object's position and travel,
what was removed and spawned, and errors.

**Milestone met:** in the 3D template, a ball moved up (unsaved), played —
it fell from 5.9 to 0.6, at rest on the ground — stopped with the document
byte-identical to before play and the edit still pending, the camera back
where it was, edited again (undo) and played again, no page reload.
Ember Valley played in the editor with its hooks (the dusk valley, the
camera bounds) and the arrow keys moving the player.

## E5: Project and build

**One engine, anywhere.** The host aliases `m2d-engine` to this
workspace's engine, for its server and for builds, so a project outside
the repository resolves it and one inside shares the app's copy.

**Templates** (`packages/editor-host/templates/2d`, `3d`): a complete small
game each — definition, hooks, page, scene, `package.json` — drawn without
art. `m2d-editor new <folder> [--template] [--name] [--open]` and the
editor's New project dialog both create one; the dialog launches a second
editor on its own port and opens it in a new tab (one process per
project).

**Build and export.** Vite builds the project's page with ES workers,
relative URLs and no minification (actor names), then copies the asset
files beside the page, since scenes name them in JSON where Vite cannot
see them. `dist/` is the export: a static site. Preview serves it on a
free port. Agents get `build_project`.

**Milestone met:** a project made from the 3D template, built from the
editor (15 files, the imported model copied as a runtime asset), its
preview loaded and drew the scene with its hooks' HUD and no errors; the
New project dialog made a 2D project beside it and opened it in its own
editor.

## Left open

- **Props, one by one.** Picking, selecting and moving individual prop
  instances (the lot's thousands) still waits on the 3D renderer's batch
  rebuild by key. The lot rebuild (next) will want it.
- ~~**Textures and HDRIs import** but are placed by hand.~~ Done in the
  follow-up round below.
- **Other sources.** ambientCG, Kenney and OpenGameArt adapters (roadmap
  item 3) slot into `pipeline/` beside `polyhaven.mjs`.
- ~~**Hooks for the other demos.**~~ Done in the follow-up round below.
- **Unsaved edits live in the host process.** Closing the editor drops
  them (the tab warns while any are pending).
- **Uploading** the built site to a host is the user's step.

## Follow-up round, same month

**Every demo has a hooks module.** Hollow Grove, Cinder Keep, Ash Row, The
Facility and Salvage Run moved their scene hooks into `hooks.js`; each
plays in the editor with its HUD and enters its level in its own page with
no errors. Hollow Grove's page had been broken since the host commit
(`Npc` used, its import removed); the move fixed it. Cinder Keep's hooks
also carry `keepScene`'s simulation `onEnter` (stateless, so the page
behaves the same) so the purse, embers and stair work in play, and export
`OPTIONS` (`textureFilter: 'nearest'`), a new optional hooks export the
editor applies to edit and play. A game that switches to a scene only its
page builds (a main menu, on Escape or at a level's end) stops play with a
status line, instead of failing.

**Drag targets for textures and HDRIs.** In a 3D scene an image dropped on
an object becomes its `overrides.mesh.texture` (refused, with the reason,
on an object that draws a model); an HDR panorama dropped anywhere becomes
the level's environment. That needed two engine changes: `world.environment`
(a key in `assets.environments`, applied to each 3D frame before the
scene's `onRender`, so the editor shows the sky too), and the texture
loader honouring textures named in object overrides, which it had silently
skipped.

**Resizable, toggleable panels.** `layout.ts`: three CSS variables on the
frame's grid, a drag handle on each edge (double-click resets), toggles in
the bar and Alt+1/2/3, all remembered per browser. The editor's games use
`aspectMode: 'expand'`, so the view fills whatever room the panels leave;
before, it kept the shape it was made with and pillarboxed when the canvas
grew (true of the dock toggle already). Saved, named layouts and docking
anywhere stay on the plan.

**Open:** The Facility logs a WebGL "feedback loop between framebuffer and
texture" warning when played in the editor, which enters the level
directly; its page, which enters through the menu, does not. The scene
draws correctly. Cause not yet found.
