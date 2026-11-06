# Plan: 3D support and a visual editor

Working plan, not published documentation. `docs/.vitepress/config.mjs`
excludes `plans/**` from the site. When a piece of this lands, the
user-facing half of it goes into the real docs pages as usual; this file
stays the map of where the whole thing is going.

Agreed with the owner, Nov 2026.

## The goal

Two things, decided together because they constrain each other:

1. **Full 3D support** in an engine that was written entirely for 2D.
2. **A Godot-like visual editor** later, with easy import of external
   assets — models, maps, textures.

Existing 2D games stay 2D. They are not expected to gain a third axis, and
nothing in this plan asks them to.

**Backwards compatibility is explicitly not a constraint.** The owner has
said to make whatever breaking changes produce the best end state. Scene
files, prefab layout, the asset pipeline and public APIs are all fair game.
Migrate the demos; do not carry a compatibility shim.

## Decision 1: dual mode, not "2D as a special case of 3D"

A 2D scene runs a 2D solver and a 2D renderer. A 3D scene runs 3D ones.
They are separate worlds and a body in one can never touch a body in the
other.

Rejected alternative: make everything 3D and let 2D be 3D with `z` locked.

Why dual mode won:

- **It is what Unity and Godot do where it counts.** Unity unifies the
  transform and the renderer but runs two entirely separate physics
  systems (`Rigidbody`/PhysX vs `Rigidbody2D`/Box2D) that cannot interact.
  Godot splits further: `Node2D`/`Node3D`, `Transform2D`/`Transform3D`,
  `PhysicsServer2D`/`PhysicsServer3D`, and two different renderers. Nobody
  shares the solver.
- **The pixel-scale physics tuning does not survive a solver swap.**
  `rapierBackend.js` carries constants tuned by sweep against Rapier 2D at
  1 unit = 1 px: `LENGTH_UNIT`, `DEFAULT_DENSITY` (inherited from Matter.js
  so absolute `setMass` calls still mean something), `CONTACT_PAD`,
  `CHARACTER_SNAP`, and `CHARACTER_NUDGE` — whose comment documents that
  0.02 deadlocks on corners and 0.1 breaks `grounded`. Running the 2D games
  on a 3D solver re-opens every one of those.
- **It is the more familiar option for the editor's users**, not the less.
  A Godot user expects to pick a 2D or a 3D node and get a different
  inspector and a different viewport. A 2D editing viewport (pan, zoom,
  grid snap) and a 3D one (orbit, gizmos) are different tools; one
  pretending to be both is a bad version of each.

Note for the record: an earlier draft of this plan claimed the unified
option would cost determinism. That was wrong. `test/determinism.test.js`
would still pass — the cost is re-tuning every constant above, not
non-determinism.

### Where the seam goes

| Layer | Seam | Why |
| --- | --- | --- |
| Physics solver | **Split** — `rapier2d` / `rapier3d` behind the existing `core/physics/index.js` contract | What Unity and Godot both do; the tuning constants depend on it |
| Renderer backend | **Split** — a new 3D backend beside webgl2d and canvas | The current backend CPU-transforms to pixel space, has no depth buffer and no GPU-side camera matrix. There is nothing to reuse |
| Fixed-step clock, `Time`, determinism contract | **Shared** — `worldBase.js` is already solver-independent | Pure timing arithmetic, no dimensional content |
| Scene format, loader, `SceneManager`, assets | **Shared**, with a dimension discriminant | Godot's model: one scene file format, split node types inside it |
| Input, audio, UI, screens, console, quest, networking | **Shared, untouched** | Already dimension-free |
| `Entity`, actors, constraints | **Split subclasses on a shared base** | The equivalent of `CharacterBody2D`/`CharacterBody3D`, not one generalised `Entity` |

### The dimension is per scene, not per engine

`world.dimensions: 2 | 3` in scene JSON. `SceneManager` already tears down
and rebuilds the physics world per scene, so one `M2D` instance can run a
2D menu and a 3D level. It also means "what happens when a 2D body meets a
3D body" never needs an answer.

### One `Scene`, not `Scene2D`/`Scene3D`

The editor wants a single scene-tree concept, one serialization format and
one set of hooks. `onEnter`/`onFixedUpdate`/`onShow` are already
dimension-free. The 2D/3D distinction lives on the nodes inside the scene,
which is Godot's actual model — one `PackedScene` format, split node types.

## Decision 2: editor enablement comes first

The editor work is dimension-free, it benefits the existing 2D games
immediately, and most of it is scene-format change that is far cheaper
against today's demos than against today's demos plus a 3D feature set.

What the editor needs that the engine does not have today:

1. **Stable object IDs.** Objects in `layers[].objects` are positional, and
   `netId` is allocated in creation order and reset with the scene. Undo,
   multi-select, cross-object references and any git diff of a scene file
   all need an identity that survives reordering and re-saving.
2. **Prefabs as project assets.** `data.prefabs` is a per-scene dictionary.
   Unity and Godot both make a prefab a *file* with its own identity,
   instanced into many scenes with per-instance overrides. People reach for
   this within ten minutes of opening an editor.
3. **An asset database.** A spritesheet is currently inline JSON with a
   `url`. Importing models, maps and textures needs what Unity and Godot
   both built: a source file plus a sidecar holding a **stable UID and the
   import settings**, and a generated artifact. Unity: `.meta` + GUID.
   Godot: `.import` + `uid://`. The UID is what makes renaming or moving a
   model not break every scene that references it, and it cannot be
   retrofitted without rewriting every scene.
   Target formats: **glTF 2.0** for 3D (meshes, materials, skins and
   animations in one file; the interchange default for both Unity and
   Godot) and **Tiled TMJ** for 2D maps, which is close to what
   `tileLayers`/`LayerManager` already models.
4. **A schema that is data, not code.** Validation in `sceneLoader.js` is
   imperative `#checkKeys(fail, path, object, [...])` with the allowed-key
   arrays as local consts. An inspector needs, per property: type, range,
   default, and whether it is a colour, an asset reference or an enum.
   Today it would have to hardcode a parallel copy and drift immediately.
   The loader and the editor must read one descriptor set.
   The strict unknown-key rejection stays — it is the right behaviour for
   hand-authoring — but it needs a format-version and migration path so an
   editor can open a file written by a newer version.

### The asset already in good shape: constraints are components

`Entity.constraints` is a named map of objects with `fixedUpdate`,
`update`, `draw`, `onCollisionStart` and a `destroy` that releases
engine-wide registrations. That is structurally a Godot script or a Unity
`MonoBehaviour`, and there are already around eighteen of them. The only
gap is that they are attached **in actor constructors, in code**, so an
editor cannot add `Chase` to an entity and tune it.

Making constraints **declarable in scene data with typed, inspectable
parameters** is the highest-value editor enablement available, and it is
dimension-free.

## The phases

### Track A — editor enablement (do this first)

All dimension-free. All of it improves the current 2D engine.

- A1. **Schema as data.** *Done.* `core/schema.js` holds the descriptor
  vocabulary and its validator; `core/sceneSchema.js` is the scene format
  written in it; `core/sceneLoader.js` keeps only what cannot be data —
  choosing a schema by scene `type`, building the namespaces that `s.ref`
  resolves against, and raising `SceneValidationError`. `fieldsOf` and
  `refScopesOf` are the introspection an inspector needs.
  Deliberate behaviour changes: an error now names the exact field
  (`layers[0].objects[0].x`, not `layers[0].objects[0]`); `world` and
  `prefabs.*.physics` reject unknown keys like everything else, and their
  real fields (`width`, `height`, `angle`, `density`) are now declared.
  Follow-up left open: UI element *property values* are still `s.any` with
  an `editor` hint, because several accept either a literal or a `$token`
  theme reference. Tightening them needs a `themed(desc)` union and a pass
  over the theme tokens.
- A2. **Stable object IDs**, plus the format version. *Done.* Scene format
  version 2: every object and UI element carries an `id`, required,
  well-formed and unique within the scene; it reaches the entity as
  `entity.sceneId` and the scene as `scene.entitiesById`. The id is a
  string — the string-or-number duality of A1 is gone. Scenes built in
  code number their own objects
  (`examples/src/shared/sceneIds.js`); the loader never invents an id,
  since an invented one is not stable across a reorder or a save.

  A scene declares the version it was written for and the loader accepts
  exactly the current one, refusing a newer one with "upgrade
  m2d-engine". A migration mechanism was built here and then **removed**:
  with every scene in the repo at the current version it had nothing to
  migrate, and a framework whose only entry upgrades files that no longer
  exist is a leftover. Upgrading documents on load is a real need for an
  editor, which owns files the engine does not — build it then, against
  what it actually needs.
- A3. **Declarative constraints** in scene JSON with typed parameters.
  *Done.* `game.registerConstraint`, a `constraints` block on a prefab and
  on a placed object, and `static params` on all eighteen engine
  constraints. An entry whose slot is already filled retunes through
  `configure` rather than replacing, including a constraint the actor
  attached in code. Defaults are recorded as `initial`, never a schema
  `default`, so an override does not reset what it did not mention.
  Additive, so no version bump.
- A4/A5. **Prefabs as assets, and the asset database.** *Done, together,*
  since a prefab asset is an asset and the database is what gives it a
  uid. `core/assets.js` and `core/assetSchema.js`: a manifest of assets by
  uid, each either imported (a `source` file plus `import` settings — a
  sprite sheet) or authored (`data` — a prefab). A scene's `uses` block
  binds uids to local names and the loader expands it into the inline
  shape, so `Scene` sees one kind of sprite sheet and one kind of prefab.
  Per-instance `overrides` let one object change its prefab's sheet,
  animation or physics without a prefab of its own. Inline declarations
  still work unchanged; the whole thing is additive, so again no version
  bump. The belt demo is the worked example: three creatures that were one
  prefab copied three times are now three prefab assets, and the demo's
  wave spawner reads the prefab instead of restating its body.

  Left for the editor: per-file sidecars. The engine consumes one compiled
  manifest, which is what an editor would produce from per-source import
  settings — the browser-side equivalent of Unity's `.meta` or Godot's
  `.import`. Nothing in the engine needs the sidecars themselves.

### Track B — dimension enablement

Revised after Track A, which both changed what B has to do and gave it
better tools. Track A's `s.tagged` and `s.dynamic` descriptors, the
migration mechanism and the asset database all turn out to be load-bearing
for 3D, which is the main argument that doing A first was right.

- B1. Split `rapierBackend.js` into a dimension-neutral half (spec
  buffering, collision filters, lifecycle, the `frictionAir` damping
  conversion, character tuning) and the 2D-specific shape and axis code.
  Add `dimensions` to `createPhysicsWorld` and `initPhysics`.
  *Done, together with the 3D backend* — see the note below on why they
  had to land together. `rapierShared.js` holds what a dimension does not
  change; `rapier3dBackend.js` is the second implementation.
- B2. Additive `Vec3` and a rotor/quaternion type in `math.js`. `Vec2` is
  untouched, so no 2D code path moves. *Done.*
- B3. Generalise `Projection` into a `View` interface; the current 2x2
  (`isometric`, `belt`) becomes one implementation.
- B4. Extract a dimension-free `Entity` base (lifecycle, constraints,
  `netId`, animation, replication) with today's `Entity` as the 2D
  subclass. Pure extraction, no behaviour change.
- B5. A `dimensions` renderer capability, so a 3D backend can decline the
  sprite-era features (tile layers, parallax, painter-sort) without
  violating the rule that a renderer feature is mandatory for every
  backend.
- B6. **The scene format knows about `world.dimensions`.** *Done, with a
  headless 3D level as the consumer.* Not the `s.tagged` split the plan
  guessed at: the two shapes turned out to overlap almost entirely, so
  one schema plus a `checkDimension` refine says everything a tagged pair
  would have, in a fraction of the code. The dimension decides which
  collider shapes exist, whether `z` and `depth` mean anything, and
  whether a `footprint` is allowed — each an error rather than a field
  that quietly does nothing. `M2D` takes `dimensions`, the world reports
  its own, and a level whose dimension disagrees with its game fails on
  load with the two lines needed to fix it.
- B7. *Done.* **Positional constructor arguments had to go.** `createEntity(type,
  x, y, width, height, sheet, options, physics)` and `spawn(type, x, y,
  width, height, {...})` cannot grow a third axis without either a
  seventh positional number or two parallel APIs. They become one options
  object. This is a breaking change to the most-used call in the engine
  and touches every demo, so it is better done early and on its own.
- B8. **Replication's transform is a 2D tuple.** `net/replication.js`
  packs `[x, y, angle, vx, vy]` with per-field rounding. A 3D transform is
  a different wire shape, and the rounding constants are tuned to pixels.
  Needs a dimension-aware packer before any 3D game can be networked;
  worth checking early whether the wire format wants a version field of
  its own.

Three things Track A added that Track B now has to carry:

- **Constraint `params` are 2D-shaped.** Units are px/s and px/s²,
  `PathFollow.points` is a list of `{x, y}`, and the control constraints
  assume a ground plane. A 3D game needs either 3D variants of these or
  vector-typed params; the `static params` blocks are where that gets
  decided, and an editor reads them, so the choice is visible.
- **`physics.shape` is a 2D enum** (`box`, `circle`, `capsule`). 3D wants
  sphere, cylinder, cone and a mesh collider. Under B6 the shape enum
  depends on the scene's dimensions.
- **The asset manifest needs 3D types.** `ASSET_TYPES` is `spritesheet`
  and `prefab`. glTF models, materials and textures join it in Phase 4,
  and a prefab asset for a 3D game names a model rather than a sprite
  sheet — so `PREFAB_DATA` becomes dimension-dependent too.

Explicitly **not** in Track B: unifying `Entity.elevation` with a real `z`
axis. Under dual mode `elevation` stays what it is — a render-only fake
third axis for 2D perspectives. Merging it was only attractive under the
rejected "2D is 3D with z locked" model.

Suggested order: B7 first (it is pure churn and everything after it
touches the same call sites), then B1 and B2 together, then B6, then B3,
B4, B5. B8 can wait until Phase 3 has something to replicate.

### What doing B1 taught: build the split against two implementations

B1 was written as "split the backend", with the 3D one arriving later in
phase 3. Done that way it would have been a guess: an abstraction with a
single implementation is speculative generality, which is the thing the
track A review pass removed elsewhere. So B1 landed *with* a working
rapier3d backend, and the second implementation immediately paid for
itself.

`CHARACTER_NUDGE` is the example. It had been lifted into the shared file
as "character tuning", which reads like a dimension-free constant. The
3D backend inherited it and a walking character covered 70px of a
commanded 120 — the nudge eats part of every step's horizontal move, and
the controller's velocity reconciliation feeds that loss back in, turning
a constant 2% clip into exponential decay. A sweep against the 3D solver
found neither of the two problems the constant exists to fix in 2D. It is
a 2D number, and it went back to the 2D backend.

Nothing but a second implementation would have found that. The same
applies to the rest of track B: **B3, B4, B5 and B6 should each land with
the 3D consumer that justifies them**, not before. A `View` interface
with one view, an `Entity` base with one subclass and a renderer
capability no backend declines are all the same mistake waiting to be
made.

### Phase 3 — 3D physics

Wire `rapier3d-compat` behind the same contract: box, sphere, capsule, and
the 3D character controller (same Rapier API shape as the 2D one). Headless
3D games then work with no renderer at all, which makes this testable
before any pixels exist.

### Phase 4 — 3D rendering

A new backend with GPU-side view and projection matrices, a depth buffer,
and mesh plus material primitives. The CPU-transform batcher stays for the
2D backend.

### Phase 5 — gameplay layer

Most actors and constraints need only vector generalisation.
`carControl`, `thrustControl`, `glideControl`, `wallSlip` and `pathFollow`
need real 3D rethinks. Pointer-to-world becomes a ray pick. Camera gains
orbit and first-person modes.

### Phase 6 — the editor itself

Out of scope for this plan beyond the enablement in Track A.

## Deferred

- **Renaming the package.** Everything says 2D: the package name, the npm
  listing, the docs site, every page. The owner wants this changed
  eventually but explicitly not as part of this work.
