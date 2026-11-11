# E7b, E8, E9: props by hand, 2D authoring, UI scenes

Working record, not published documentation. The user-facing half is
`docs/guide/editor.md`; the phase rows live in
`docs/contributing/roadmap.md`. Planned 11 Nov 2026, after E6, the
component library and E7 shipped (`editor-e6-e9.md`), from a read of the
prop batching, the tile and animation formats and the UI schema against
what each phase promises. The three phases are independent of one another;
they share one piece of groundwork and the E6 rules.

## What the three share

- **Selection becomes paths.** Today selection is a set of object ids
  (`main.ts`), and `objectPath` searches only `layers[].objects`. A prop
  instance has no id (it is `['layers', li, 'props', pi, 'instances', ii]`)
  and a UI element is addressed the same way. Selection, the overlay and
  the tree learn to hold document paths with ids as the common case, once,
  before any phase. Paths into arrays shift on delete; ops that remove
  entries adjust the live selection the way undo already adjusts ops.
- **Structure in one place.** As in E6: every structural edit is a
  function in `editor-core/structure.ts` from a document to ops, called by
  the GUI and the MCP tools alike. Each phase adds its operations there
  first (scatter, paint, add element), so agents can do whatever the GUI
  can.
- **An in-place apply path.** `Viewport.apply` edits in place only for
  object-level ops; props, tile layers and `elements` all fall to the
  full rebuild today. Each phase's first editor task is its targeted
  apply — a brush or a gizmo over a full rebuild is unusable.
- **One undo step per gesture:** a brush stroke, a scatter, a drag, a
  frame picked.

## E7b: props by hand

### The ground today

A prop instance is an anonymous tuple `[x, y, z, yaw, scale]`
(`sceneSchema.js`, `PROP_INSTANCE`); the group carries the prefab, size,
`collider` and `castShadow` for all its instances. The lot
(`examples/src/yard/scenes/lot.json`) holds 281 groups and 8,526
instances. At load, `setupProps` (`core/scene.js`) merges every group's
instances into batches shared by geometry and material; model props go
through `#addModelBatches(key)`, each batch tagged `modelKey`, and
`#dropModel(key)` filters them out — the streaming pair is the only
rebuild by key that exists. Lights, colliders and `#propSpots` are
build-once lists with no key. `StaticBatch` (`renderers/frame3d.js`) can
only push. No index maps an instance to the `(batch, slot)` records it
produced, so the editor's comment in `viewport.ts` is honest: any `props`
op rebuilds the whole game. `Viewport.pick` loops over `entitiesById`
only, so an instance cannot be clicked. One more renderer fact that shapes
the design: `castersNear` (`webgpuRenderer.js`) mixes every batch's
version into every point light's shadow cube, so bumping versions each
frame of a drag re-renders all shadows.

### The work, in order

1. **Engine: rebuild props by key.** A public `Scene.rebuildProps(keys)`:
   for a model key, `#dropModel`'s filter plus `#addModelBatches` without
   unloading the model; primitive props gain a key of their own (the prop
   id). The same call rebuilds that key's colliders, lights and
   `#propSpots`, which today only `unload` clears. Coarse is fine: moving
   one grass tuft rebuilds its model's ~1,100 instances, cheap on the CPU.
   In-place record rewrites (an instance-to-slot map and `writeInstance`)
   are the fallback only if the coarse rebuild is too slow on the lot.
2. **Picking.** Instance volumes are already derivable: model bounds ×
   instance scale × mesh scale, the ray turned by −yaw, through the same
   `rayBox`/`bestHit` machinery in `picking.ts`. A uniform spatial grid
   over instances keeps 9 slop rays × 8.5k volumes honest. A hit is a
   path, drawn by the overlay like an object.
3. **Targeted apply.** Props-level ops map to `rebuildProps` of the
   touched keys instead of `{kind: 'rebuild'}`. During a drag the batch is
   not touched at all: the overlay ghost moves per frame and the commit on
   release rebuilds once (the shadow-cube fact above).
4. **The gizmo, constrained by the tuple.** Move on the ground plane and
   y; rotate is yaw only; scale is uniform only. The inspector shows an
   Instance card with the five fields.
5. **Scatter and erase brushes** (`structure.ts`: `scatterProps`,
   `eraseProps`). Scatter takes a prop group (or a prefab, creating one),
   radius, density, yaw and scale jitter, seeded; instances land on the
   ground plane at the group's height. Erase takes a radius and an
   optional prefab filter. One stroke, one op. `buildLotScene.mjs`'s
   `place` and its keep-out masks are the reference for density and
   grouping, not a dependency — the generator seeds once and the edited
   scene is the source of truth.
6. **Promote and demote** (`structure.ts`). Instance to object is
   lossless: yaw becomes a quaternion, the group's size, collider and
   castShadow move onto the object. Object to instance only when its
   rotation is pure yaw; the matching group is found by prefab and size
   (the generator's `props-<prefab>-<w>x<h>x<d>` convention) or created.

### Done when

A district of the lot is edited by hand — instances picked, moved,
scattered, erased, one promoted to an object and demoted back — saved,
and the yard loads the result. Dragging an instance holds the editor's
frame rate.

## E8: 2D authoring

### The ground today

A tile layer's `cells` is an array of `[col, row]` tuples — an on/off
mask; the whole layer draws the single frame `tileX, tileY`
(`sceneSchema.js`, `TILE_LAYER`). Painting with a palette therefore needs
the roadmap's "per-tile indices" item first. Tiles have no collision
("drawn and nothing else", `scene.js`); headless skips them. Animations
are already a record of `{frames: [[tileX,tileY]…], fps, loop}` on a
sheet, played by `SpriteSheet.frameAt` off `entity.animTime` — which edit
mode never advances, so any preview needs its own clock. The inspector
summarizes arrays past 50 entries, so real `cells` are a read-only line.
And the milestone's target, Ember Valley, has **no sheets at all**: tiles,
backdrop and coin are drawn by code (`GlowCoin`, `DuskLevelBackdrop`),
and no coin art exists in the repo.

### The work, in order

1. **Format: per-cell indices.** A cell may be `[col, row]` (the layer's
   `tileX, tileY`, as today) or `[col, row, tileX, tileY]`. Additive, so
   no `SCENE_VERSION` bump; the loader validates indices against the
   sheet's grid; the writer keeps the short form when the indices equal
   the layer's. `constructLayer` reads the per-cell frame.
2. **Engine: rebuild one layer.** `Scene.rebuildTileLayer(name)` re-runs
   that layer's `constructLayer`; `Viewport.apply` maps tile-layer and
   `background` ops onto it. Painting must never rebuild the game.
3. **The paint tool.** Selecting a tile layer in the tree offers Paint:
   the camera's drag stands aside, a grid at `tileSize` draws on the
   overlay (the first of the view helpers), the hovered cell highlights
   (`worldPoint` already inverse-projects, so isometric and belt layers
   paint correctly). A palette panel draws the sheet and a click picks the
   frame. Brush paints, fill flood-fills, erase clears; a stroke commits
   one `setCells` op (`structure.ts`) on release. The cells card in the
   inspector stays a summary with the painted count and a Paint button.
4. **The animation editor.** On a sheet's `animations` record (entries
   added by E6's add-entry): the sheet drawn with its frame grid, frames
   appended by clicking, reordered by drag, fps and loop fields, and a
   live preview running on the panel's own clock. The same sheet view
   gains slicing: an image dropped today becomes one whole-image frame;
   setting `frameWidth`/`frameHeight` shows the grid over the image.
5. **Ember Valley's art and actors.** A terrain tile sheet and a coin
   sheet from free, open (CC0) art, credited; `GlowCoin` falls back to
   `super.draw()` when its prefab declares a sheet (the template player's
   pattern), so painting the scene wins over the code drawing.

Backgrounds and parallax need no new preview: schema layers already draw
in edit mode and panning previews the parallax; step 2 makes editing them
live. Tile collision stays out of E8 — the platforms remain objects — and
is noted for later with F4 (backdrop layers as data), which this phase
does not attempt.

### Done when

Ember Valley's level is painted in the editor from a palette (several
tile kinds in one layer), its coin animation is made on the sheet and
plays in the preview and in Play, and the save is canonical by the
writer. A paint stroke is one undo step.

## E9: UI scenes

### The ground today

`UI_SCHEMA` is `elements: array` of the tagged union button, text, image,
rect (`sceneSchema.js`, `ELEMENTS`); rect alone keeps its size and colour
at the top level rather than under `properties`. Style fields are
`s.any({editor})` hints, which `editableLeaf` (`inspector.ts`) rejects —
**a button's label cannot be typed into the GUI today**. The array's add
inserts `{type:'button', id:''}` — invalid three ways (empty id, missing
x/y whose `required` is a function, neither `action` nor `onClick`) — and
a variant change wipes id and position. `setupUIScene` keeps no id-to-
element map (the HUD's builder does); the viewport draws UI scenes but
`pick`, `placement` and the overlay know only `entitiesById`, so an
element can be selected only from the tree, with no gizmo. The viewport
game is built at the panel's size, so proportions differ from the real
game. No UI scene JSON exists in the repo outside tests — the demos'
menus are code `UIScreen`s — and the 2D template has no menu at all. The
`$token` system is ready: `Theme.resolve` follows `$`-paths through
`game.theme.tokens`, and each style hint names the token subtree a picker
should offer.

### The work, in order

1. **Style fields editable** (`inspector.ts`). A leaf whose descriptor
   carries a style `editor` hint gets an input by hint — text, size, font,
   colour, align — accepting a literal or a `$token`. The **token picker**
   lists `game.theme.tokens` filtered by the hint (colour tokens with
   swatches, resolved through the chain), with free text still allowed.
2. **Element operations** (`structure.ts`): `addElement(type)` produces a
   valid starting value — a generated unique id (`uniqueId` already
   collects element ids), `x: 0, y: 0`, `anchor: 'center'`, and for a
   button an `onClick` of the project's first level scene; a variant
   change preserves id, position and anchor instead of replacing the
   value; move and reorder. The tree shows the Elements group even when
   empty and gains an element context menu; the **palette** is the
   Components tab's pattern over the union's variants, one click to add.
   Rect's top-level size and colour are special-cased wherever size is
   written.
3. **Engine: an element map.** `setupUIScene` keeps id → element, as the
   HUD builder does (and the two builders can meet in one place).
4. **Pick, placement, gizmo.** In a UI scene the viewport picks with
   `scene.ui.hitTest` (the input router's own path); `placement` builds
   from the element's `frame` through `uiToView` and `viewToClient`, axes
   trivially screen-aligned. The overlay's move handle writes `x`/`y`
   (they are exactly the anchor-relative offsets), resize writes
   `properties.width`/`height` (rect: top level); text has no settable
   size and offers move only. **Anchor markers**: the nine origins drawn
   while an element is selected; changing `anchor` re-bases `x`/`y` so
   the element does not jump.
5. **Design-size preview.** A UI scene renders at the project's design
   resolution, letterboxed in the panel, so what is placed is what the
   game shows.
6. **The template's menu.** The 2D template gains a `menu` scene slot:
   `main.js` registers it and starts there, so the milestone's result
   runs in a built project, and a new project demonstrates scene
   switching out of the box.

Out of scope, noted for F15 (the demos' menus as UI scenes): stack
layout, menu-item and backdrop element kinds, and keyboard focus for JSON
menus (`FocusManager` lives only in `UIScreen`); the milestone menu
clicks with the pointer. Each is a schema or engine addition with its own
decision.

### Done when

The 2D template's menu is made from the palette — title text, a rect
hairline, Start and Settings buttons styled by `$tokens` picked from the
theme — positioned with the gizmo and the anchor markers, saved, and in
Play the Start button enters the level. `completeness.test.ts` still
passes with style leaves now editable.

## Order

As carried: E7b, then E8, then E9 — E7b because editing the lot is the
biggest daily pain and its renderer seam (`#dropModel` /
`#addModelBatches`) is already in place; E8 and E9 are per-genre and
could run in parallel with it after the shared selection groundwork. The
view-helpers grid arrives inside E8's paint tool; the rest of the view
helpers and composition stay carried, in that order.

## What shipped, 11 Nov 2026 — all three phases

The user-facing description is `docs/guide/editor.md` (Props, Painting
tiles, Animations, UI scenes). Departures from the plan above, and what
each phase landed:

**The shared groundwork** came out simpler than planned. Selection stayed
a set of id strings: a prop instance is addressed as
`props:<layer>:<prop>:<index>` — a form no object id can take, since ids
cannot hold a colon — so the whole selection, overlay and gizmo machinery
carried instances without a path-selection model; UI elements have real
ids already. Each area got its in-place apply: `Viewport.apply` maps
props ops onto `Scene.rebuildProps()`, tile and background ops onto
`rebuildTileLayers()`, element ops onto `rebuildUIScene()`, and a sheet's
animation ops onto `defineAnimation` on the loaded sheet — nothing the
three phases edit rebuilds the game.

**E7b.** The props system moved out of `Scene` into
`core/sceneProps.js` (`SceneProps`), Scene keeping its surface by
delegation; `rebuild()` tears down and remakes batches, bodies, lights
and the streaming index from the config — coarser than the planned
per-key rebuild and simpler for it: the full lot rebuilds in ~70 ms
headless, once per gesture, with drags previewed on the overlay outline
(a per-frame batch write would re-render every shadow cube). Picking
casts the same slop-ring rays at instance volumes (model bounds × mesh
scale × instance scale, or the group's primitive), ranked with the
objects. The gizmo is the tuple's: ground-and-y move, the one yaw ring, a
uniform scale. `structure.ts`: `scatterProps`, `erasePropInstances`,
`promotePropInstance` (exact for a pure yaw; a model's instance scale
rides `overrides.mesh.scale`), `demoteObjectToProp` (a size-matched group
under one uniform factor, else a new group with `collider: 'bounds'`).
The brushes are `propBrush.ts`: a mode that owns the pointer, a settings
strip, one op per stroke. The instance tuple's positions carry labels
(X, Y, Z, Turn, Scale), so the inspector shows a labelled row.

**E8.** `cells` took the per-cell form as a union — `[c, r]` as ever, or
`[c, r, tileX, tileY]` — no version bump; `setupTileLayer` defines one
sheet frame per distinct index. The paint tool (`tilePaint.ts`) draws
the grid through the projection, offers brush, fill and erase and a
palette over the layer's sheet, and writes one `set` of `cells` per
stroke, short where a cell draws the layer's own frame. Sprite sheets
became tree nodes; double-click opens the animation editor
(`animationEditor.ts`): frames clicked on the sheet, reorder, fps, loop,
a preview on its own clock, and slicing (`frameWidth`/`frameHeight`).
The milestone content: Ember Valley's `ground` layer (dirt underlay,
caps, a fence, a bush, a plant, a mushroom) and a nine-frame coin at
12 fps, in `level1.json`; the art is Kenney's Platformer Art Deluxe
(CC0) tinted to the dusk palette and MedicineStorm's Spinning Gold Coin
(CC BY 3.0), credited in `THIRD_PARTY_NOTICES.md`; `GlowCoin` defers its
disc to a declared sheet, keeping the glow.

**E9.** Style fields edit as text — a bare number writes a number, a
`$token` stays a string — with the running theme's token names as
completions per hint (a `<datalist>`, not a dropdown, so a literal still
types). A tagged value keeps `id`, `x`, `y` and `anchor` through a
variant change. `structure.addElement` makes each kind valid from birth;
the palette is the Elements group's context menu (shown even empty) and
the scene's. The engine keeps `uiById` and `rebuildUIScene()`. A UI
scene previews at the game's design size, letterboxed, no camera;
picking goes through `scene.ui.hitTest`; the element gizmo moves the
live element's offsets per frame (they are exactly the document's
`x`/`y`), resizes where the kind keeps size (rect at the top level,
text not at all — `Placement.tools` hides the useless handles), and the
overlay draws the nine anchor origins. An anchor change in the inspector
re-bases the offsets. The 2D template gained `scenes/menu.json` — title,
hairline rule, Start and Settings styled by `$tokens` — and starts on it.

**Still carried:** the remaining view helpers (light icons and the
spot-direction handle, the camera gizmo, bookmarks, isolate), keyboard
focus for JSON menus, the F15 element kinds (stack, menu-item,
backdrop), and composition — in that order.
