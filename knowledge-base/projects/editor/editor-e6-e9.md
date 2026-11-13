# E6 to E9: creating anything from the GUI

Part of [[editor]]. A shipped phase plan, kept as the record of why things are built as they are.

Working record, not published documentation. The user-facing half is
`docs/guide/editor.md`; the phase rows live in
`docs/contributing/roadmap.md`. Written 10 Nov 2026 after an audit of the
GUI against the scene schema; E6, the component library and E7 were built
the same day (the record of what shipped is at the end).

## The gap, and why the earlier plan missed it

E0 to E5 were vertical slices, each proven by a milestone that **edited
something that already existed**: a wall moved and saved, a crate found and
placed, a ball played and stopped. None required creating a scene from
nothing, so the structural layer — make a prefab, attach a constraint, add
a layer, paint a tile — was never a deliverable. The "Left open" lists and
the roadmap's blocker table name props-by-hand, multi-select, mesh picking
and nested scenes, but no phase owns them, and the record-entry hole
(below) is in none of them.

The owner's rule for the rest of the editor: **anything a scene document
can hold can be created, edited and deleted from the GUI.** Not "most
things"; the schema is the checklist.

### The audit, 10 Nov 2026

Checked against `sceneSchema.js`, `outline.ts` and the editor's code.

| Area | Works from the GUI | Missing |
| --- | --- | --- |
| Objects | Place by drag, move, rotate, scale, duplicate, delete, edit fields and overrides | Multi-select, marquee, copy and paste, align and distribute, move to another layer, reorder the draw slot, select all of a prefab, object to prefab |
| Prefabs | Edit an existing prefab's fields | Create, rename, duplicate, delete; apply an object's overrides back to the prefab |
| Constraints | Edit params of an existing entry | **Add an entry** (a slot name and a type), browse the types and their params |
| Layers | Edit name and type | Add, remove, rename, reorder; move objects between layers |
| Assets | Models, images and HDRIs by drop | Add, rename, delete or replace an entry by hand; animations (a record of frame tuples) are raw JSON |
| World | Every scalar field, environment by drop | Union fields (`projection`, `parallax`, a prop's `collider`) have no variant picker and render as JSON text |
| Tile layers, background | Scalar fields | Painting cells; no tile tool exists |
| Props | Read-only summary | Pick, move, scatter, add or remove instances |
| UI scenes | Edit an element's fields | Add an element (a tagged union needs a type palette), anchor preview, element gizmo |
| Scenes | Switch, save, detach | New, duplicate, rename, delete a scene file |
| Viewport | Three gizmos, framing, flying | Grid and axes, light icons and a spot-direction handle |
| Inspector kinds | number, string, boolean, enum, ref, object, record (read), array of leaves | **Record entries**, tuples (frames, cells, instances), unions, tagged unions |

The root cause of the constraints bug is the second-to-last row: the
schema models constraints, prefabs, sprite sheets, animations, models and
`uses` as **records** (user-chosen key to entry), and the inspector could
add fields and list items but never a record entry — which needs a key
typed by the user, and for a constraint a `type` chosen before its
`params` schema even resolves. "Add constraints" made an empty `{}` and
the card said "Nothing set yet".

Discovery was missing too: the `constraint` ref list reads the running
game's `constraintTypes`, which holds only what `register(game)` registers
(the yard registers actors only), and nothing showed a constraint's
parameters before attaching it.

## The completeness criterion

A test walks the level and UI schemas and asserts the inspector produces
an editor for every descriptor kind and every container it meets:
`number`, `integer`, `string`, `boolean`, `enum`, `ref`, `object`,
`record` (entries added, renamed, removed), `array` (items added,
removed, reordered), `tuple`, `union` (variant chosen), `tagged` (variant
chosen), `dynamic` (resolved, or free-form when it cannot be), `any`.
Before E6 it would have failed on record entries, tuples, unions and
tagged unions. It lives in `packages/editor/test/completeness.test.ts`.

A second rule, for the agent: the MCP tools and the GUI expose the same
operations. Structural edits are built in **one place**,
`editor-core/structure.ts`, as functions from a document to ops; the GUI
and the MCP tools both call them, so neither can do what the other cannot.

## The phases, in order

| Phase | Work | Done when |
| --- | --- | --- |
| **E6: Structure** | Record entries (a key dialog; a type picker for constraints), variant pickers for unions and tagged unions, tuple editors, layer operations in the tree (add, rename, reorder, delete, move objects between), prefab create / rename / duplicate / delete with references renamed, object to prefab, scene file management (new, duplicate, rename, delete) in the bar and over MCP | The 3D template's level is rebuilt from a blank scene using only the GUI, then played. `completeness.test.ts` passes |
| **Component library** | A dock tab listing the actors and constraints the game registers and the engine ships, with their declared `properties` and `params`, a one-line description each (`static description`, new on `Entity` and `Constraint`), a filter, and one-click **Attach** (a constraint onto the selected object or prefab) and **New prefab** (from an actor). An engine class the game does not register is shown with the two lines that register it. The same catalog over MCP (`list_components`) | A guard with Health and Chase is made from the catalog in the template, with no file edited by hand |
| **E7: Selection at scale** | Multi-select (Shift and Ctrl click in the viewport and the tree), a marquee (Shift-drag on the viewport), the gizmo on the selection's centre moving every selected object, rotate and scale applied to each, delete and duplicate for all, copy and paste (within and across scenes, Ctrl+C, Ctrl+V), align and distribute, select all of a prefab | Twelve lamps are marquee-selected, aligned on z, distributed on x and moved together as one undo step |
| **E7b: Props by hand** | Picking, selecting and moving individual prop instances; scatter and erase brushes; promote a prop instance to an object and back | Needs the 3D renderer's batch rebuild by key (noted since E2); the lot rebuild wants it. Milestone: a district's props edited by hand and saved |
| **E8: 2D authoring** | A tile painting tool (palette from the sheet, brush, fill, erase, a grid), background and parallax preview, an animation editor for sprite sheets (frames picked on the sheet, fps, loop, a preview) | The platformer's level painted and its coin animation made in the editor |
| **E9: UI scenes** | An element palette (the tagged union's variants), anchors shown on the viewport, an element gizmo, the `$token` style picker | The 2D template's menu made from the palette |
| **View helpers** (cross-cutting, as they are needed) | A grid and axes, icons for lights with a spot-direction handle, a camera gizmo, camera bookmarks, an isolate mode | — |
| **Composition** (last; a format change) | Nested scenes with overrides, the Godot model, with its own `SCENE_VERSION` bump | A room scene instanced three times in a level |

Order: E6 first because every later phase adds entries to records (a tile
layer is a record entry on `assets.spritesheets` before it is painted). The
component library second because E6's constraint picker needs its data.
E7 third because it is the largest everyday ergonomic gain and blocks
nothing. E7b waits on the renderer, E8 and E9 are per-genre, composition
last because it changes the format.

## What shipped, 10 Nov 2026 — E6, the component library, E7

See the sections below the record for what each delivered; the
user-facing description is in `docs/guide/editor.md`.

**E6.** `editor-core/structure.ts`: `addEntry`, `renameEntry`,
`removeEntry` for any record (a prefab rename rewrites every object's and
prop's `prefab`; a sprite-sheet rename rewrites the prefabs that use it),
`addLayer`, `removeLayer`, `moveLayer`, `moveObject` (between layers or
within one), `objectToPrefab`, `attachConstraint`, `blankScene`. The
inspector gained: an **Add entry** control on every record card (a key
field, and a type picker for constraints that lists the game's registered
types and the engine's with what each sets), a **variant picker** for
unions and tagged unions (`InspectedRow.alternatives`, computed in
`inspect.ts` from the declared descriptor), **tuple rows** as labelled
cells, **rename** on record entries. The tree gained a context menu per
kind: layers add, rename, move up and down, delete; objects duplicate,
delete, move to a layer, select all of the prefab, make a prefab; prefabs
new, rename, duplicate, delete, select instances. The scene picker gained
New, Duplicate, Rename and Delete, through host routes (`/__scene`) and MCP
tools (`create_scene`, `rename_scene`, `delete_scene`).

**Component library.** A dock tab, **Components**: actors and constraints
from the running game's registries and the engine's own
(`packages/editor/src/catalog.ts` imports them), each with its description
and its declared fields, filtered by text. Attach puts a constraint on the
selected object or prefab under a unique slot; New prefab makes one from an
actor; an engine class the game does not register says so and shows the
two lines to add to the definition. `Entity.description` and
`Constraint.description` are new static strings, filled for the engine's
classes. Over MCP: `list_components`.

**E7.** Selection is a set of ids. Shift or Ctrl click adds and toggles in
the viewport and the tree; a Shift-drag on the viewport draws a marquee
that selects every object whose centre it covers; the camera's drag stands
aside while Shift is held. The overlay outlines every selected object and
puts the gizmo at their centre; a move carries all of them, a turn or a
scale applies to each about its own centre; one edit per gesture. Delete,
duplicate, copy and paste (Ctrl+C, Ctrl+V; the clipboard is kept in
`localStorage`, so it pastes into another scene, with ids made unique and
the pasted objects selected) work on the whole set. An **Arrange** strip
appears on the viewport with two or more selected: align min, centre and
max on each axis, distribute evenly on each axis. Ctrl+Shift+A selects
every object of the selection's prefab.

**Not done, carried:** E7b (props by hand), E8, E9, the view helpers and
composition, in that order. The plan for E7b, E8 and E9 is
`editor-e7b-e8-e9.md` — **shipped, Nov 2026**; see its record.

## The follow-up round, same day

The owner's four asks after E7 and the first wave of the GUI-reach audit
(`docs/contributing/roadmap.md`, "Editor follow-ups"):

- **Scale without a rebuild.** `Viewport.apply` rebuilds one object in
  place when its changed overrides name only assets the scene holds
  (sheets, models, `url|size` textures); a new asset is still a full
  rebuild. Verified on the lot: a model resized in the inspector kept the
  same game, the mesh scale followed, one undo step.
- **Live geometry.** `Viewport.previewSize` rescales what is drawn every
  frame of a scale drag — the body's recorded size for a shape, the mesh
  block's scale and offset for a model, the entity's size in 2D — and
  `endPreviewSize` restores on cancel or forgets on commit. The inspector's
  scrub got a `preview` callback; Position and Size labels move and resize
  the object while dragged.
- **Unregistered constraints.** `core/builtins.js`: `game.actors` and
  `game.constraintTypes` are `Registry` maps over the engine's own classes,
  the game's registration winning (`own`, `isBuiltin`). The Components tab
  marks built-ins "engine" and attaches them. Verified: `Hover` attached to
  a crate in a project that registers no constraints, in place, no problem.
- **Running constraints.** `Viewport.liveConstraints` reads every slot on
  the entity with the live value of each declared param (plain data only; a
  Rapier handle in a field is skipped); the inspector's Object tab shows the
  card, with Retune adding a document entry (the block made whole when the
  object has none). Verified on Ember Valley's player: seven slots, five
  from the actor's constructor.
- **World fields F1, F2, F5.** `world.camera`, `world.lighting`,
  `world.post`, `world.music`, `world.player`, `assets.sounds`,
  `assets.music`. The scene applies the 2D look at setup (edit mode too)
  and clears it on unload, the 3D look on the frame before `onRender`, the
  camera and the music after the objects stand (not in edit mode). Ember
  Valley (camera bounds, ambient, post), The Facility (bounds, ambient) and
  The Yard (orbit camera, player) moved theirs into the scene. The world
  node got World, Camera, Look and Sound tabs.
- **Also:** `AttackSwing` and `HitBurst` declare params and every 2D demo
  registers them; `Rogue` and `Knight` take the scene's declared properties
  over their own literals.

## The second wave, same day: F7, F6, F3, F9, F10

- **Rules** (`core/rules.js`): `world.rules`, polled each tick (a pure
  function of the world, so replays agree): start, collected, enter,
  death, fall; notice, objective, sound, unseal, remove, set, switch,
  gameOver, cycle. `world.killPlane` replaces the hardcoded height and
  fires `fall`. Not in edit mode, not on a replica. The Trigger's
  hardcoded level-complete sound is gone; Ember Valley and The Facility
  win by rules (`collected coin → notice, objective`; `enter trigger-1 →
  sound, notice, switch mainMenu after 3`; `death → gameOver`).
- **HUD** (`core/hud.js`): `hud` on a level: text, notice (fades), meter
  (bound to a constraint's fields, the player's health by default),
  minimap (plot by prefab), image, rect. Built in edit mode too, so the
  editor shows it; a `HUD` group in the tree with an element node each.
- **Cycle** (`core/look.js`): `world.cycle` states blended by phase
  (`blendLook`: numbers lerp, colours mix, blocks recurse), turned by
  `period` or eased to `target`; the 3D frame look and the 2D ambient and
  post follow it. The yard's afternoon-to-dusk cycle is in its scenes; T
  flips `scene.cycle.target`.
- **Collision filters**: `physics.category` and `mask` by name or bit.
- **2D lights**: a 2D prefab `light` draws at the body each frame.
- Tests: `packages/engine/test/sceneRules.test.js` (rules, HUD, lights,
  categories, cycle).
