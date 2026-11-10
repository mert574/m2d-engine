# E1: the viewer and the inspector — done, Nov 2026

Working record, not published documentation; the phase row lives in
`docs/contributing/roadmap.md`. E1 is the read-only editor: open a
project, pick a scene, see its outline, its world and any node's fields.
Writing back is E2.

## What landed, and where the line between core and app runs

The rule from E0 holds: anything headless lives in `editor-core`, the
app renders it. Three new core modules, all tested in Node against the
engine's real schemas:

- **`descriptors.ts`** — `resolveDescriptor` (union/tagged/dynamic to the
  concrete shape, as `validate` does) and `descriptorAt` (the descriptor
  and value at a path into a document, threading parent, key and the
  registries so constraint params and actor properties resolve exactly as
  the loader resolves them). The writer now shares `resolveDescriptor`
  instead of carrying its own copy; its byte-for-byte suite pinned the
  refactor.
- **`outline.ts`** — `sceneOutline(doc)`: the tree, from the *document*
  rather than a live game. Decided deliberately against the roadmap's
  original `scene.entitiesById` sketch: a scene that fails to materialize
  is when an editor is most needed, and the document also shows structure
  a running scene flattens away (prefabs, props as placements). Every
  node carries the path the inspector reads and a command (E2) will
  address.
- **`inspect.ts`** — `inspectNode(doc, path, { registries })`: the
  inspector's rows. Every declared field appears whether or not the
  document sets it — kind, unit, label, description, widget hint, ref
  scope, enum options — and an absent field carries what absence means
  (the schema's `default` or the class's `initial`), which the app shows
  muted. Only present fields expand into subtrees; arrays past 50 entries
  summarize (`8192 entries`) instead of rendering the lot. The rows are
  plain data on purpose: the MCP server can hand an agent exactly what a
  person sees.

The app grew `tree.ts` and `inspector.ts` (DOM over those two), camera
controls (drag to orbit or pan, scroll to zoom — the 3D camera is
rebuilt inside the gesture handlers because edit mode never runs the
loop's `camera.update`), and `?demo`, a built-in scene that smoke-tests
every panel with no folder to pick.

## Materializing someone else's scene

A project's actor and constraint classes are code the editor cannot load
(declaring them is E5 territory), and an edit-mode game *has* registries,
so a real scene failed on its first unregistered name. The viewport now
registers **placeholders**: an empty actor still draws its prefab's
sprite or mesh — and with neither, draws its body as a translucent
outline, so a scene whose look is hand-drawn `draw()` code is still
placeable rather than invisible. For constraints the engine gained one
narrow rule: the base's `static params = {}` still means "nothing
settable", but a class that sets **`params = null`** opts out of the
check and takes any bag — the placeholder's move, pinned in
`sceneConstraints.test.js`, no behaviour change for any real class.

Asset URLs were the other gap: a File System Access folder is not
served, so a scene's `textures/...` reach nothing. `assetUrls.ts`
materializes a *copy* of the document whose image, model and mesh-texture
URLs are blob URLs read out of the project (tried against the scene's
folder, its parent — the shipped `<demo>/scenes/` convention — then the
root), revoked when the viewport closes. The document itself stays what
the file says. Scenes whose assets come through a `uses` manifest still
refuse honestly (no asset database in the viewer); manifests are E3.

## Verified

`editor-core` 30 node tests, the app 7 jsdom tests, the engine suites
green — and the page itself driven headlessly over the dev server: tree
rendered, a node clicked, the inspector's values, units, muted defaults
and enum rows asserted on real DOM, the viewport screenshotted drawing
the materialized courtyard. The read-pixels probe reading one colour was
the WebGL readback trap (no `preserveDrawingBuffer`), not a blank frame;
the screenshot is the evidence.

## Left open, knowingly

- Selection flows tree → inspector only; nothing highlights in the
  viewport and nothing picks by click. That is E2's selection work (the
  2D hit test and the 3D id buffer).
- Actor properties render as a free-form bag unless registries are
  passed; the app passes none because a project cannot declare its
  classes yet. The machinery is built and tested — `inspectNode` with
  registries resolves them — and E5's project manifest is what feeds it.
- `uses`-based scenes need the asset database wired into the viewer (E3).

## Addendum, same month: the host replaced this round's stopgaps

The owner reviewed E1 and called the two shortcuts for what they were:
placeholders standing in for real classes, and a built-in demo scene
standing in for real projects. Both are gone — the editor now runs the
project's own code, served and hot-reloaded by its host. The File System
Access half of this record (BrowserProject, blob-URL assets, `?demo`) is
deleted; see `docs/plans/editor-host.md` for what replaced it and why.
