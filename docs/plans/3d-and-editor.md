# Plan: 3D support and a visual editor

Working plan, not published documentation. `docs/.vitepress/config.mjs`
excludes `plans/**` from the site. When a piece of this lands, the
user-facing half of it goes into the real docs pages as usual.

Agreed with the owner, Nov 2026. Replanned after the first eight steps
shipped; see "How this plan goes wrong" for why.

## The goal

1. **Full 3D support** in an engine written entirely for 2D.
2. **A Godot-like visual editor** later, with easy import of external
   assets — models, maps, textures.

Existing 2D games stay 2D. Nothing here asks them to change.

**Backwards compatibility is not a constraint.** Scene files, prefab
layout, the asset pipeline and public APIs are all fair game. Migrate the
demos; carry no shim.

## How this plan goes wrong, and the rule that follows

Three times now this plan has described work in detail and been wrong
about it, each time in the same way: it guessed at an abstraction before
anything needed it.

- **B1** said "split the Rapier backend into a dimension-neutral half".
  Done alone it would have been a guess. Landed together with the 3D
  backend, the second implementation immediately found `CHARACTER_NUDGE`
  mis-filed as dimension-free tuning — it costs a 3D character 40% of its
  walking speed and fixes nothing there.
- **B6** said the level schema should split into 2D and 3D shapes with
  `s.tagged`. The two shapes differ in four fields and one enum; one
  schema and a `checkDimension` refine say the same thing in a fraction of
  the code.
- **A2** built a scene migration framework whose only migration upgraded
  files that no longer existed. It was removed in the review pass.

The rule, which the rest of this document obeys: **plan deliverables, not
refactors, and never land an abstraction without the second consumer that
justifies it.** Where this plan does not know something, it says so
instead of inventing a step. Anything below the "Next" section is a
sketch, not a commitment.

## Decisions that have held

These were argued once and have survived contact with the code. They are
settled unless something new contradicts them.

### Dual mode, not "2D as a special case of 3D"

A 2D scene runs a 2D solver and a 2D renderer; a 3D scene runs 3D ones.
They are separate worlds and a body in one can never touch a body in the
other.

Unity unifies the transform and the renderer but runs two entirely
separate physics systems that cannot interact. Godot splits further:
`Node2D`/`Node3D`, two transforms, two physics servers, two renderers.
Nobody shares the solver. Beyond that, `rapierBackend.js` carries
constants tuned by sweep at 1 unit = 1 px — `LENGTH_UNIT`,
`DEFAULT_DENSITY` (inherited from Matter.js, so absolute `setMass` calls
still mean something), `CONTACT_PAD`, `CHARACTER_SNAP`,
`CHARACTER_NUDGE` — and running the 2D games on a 3D solver re-opens every
one of them.

Correction kept for the record: an early draft claimed the unified option
would cost determinism. It would not. The cost is re-tuning, not
non-determinism.

### Where the seam goes

| Layer | Seam | Status |
| --- | --- | --- |
| Physics solver | **Split** — `rapier2d` / `rapier3d` behind one contract | Done |
| Renderer backend | **Split** — a 3D backend beside webgl2d and canvas | Not started; see the open decision |
| Fixed-step clock, `Time`, determinism contract | **Shared** | Unchanged, needed no work |
| Scene format, loader, `SceneManager`, assets | **Shared**, with a dimension discriminant | Done |
| Input, audio, UI, screens, console, quest | **Shared, untouched** | Unchanged |
| `Entity`, actors, constraints | Shared base, dimensional presentation | Not started |

### The dimension is per scene, checked against the game

`world.dimensions` in scene JSON, `dimensions` on `M2D`. The engine builds
one physics world, so a scene whose dimension disagrees with its game
fails on load with the two lines needed to fix it. One `M2D` running both
at once is not supported and nothing has asked for it.

### One `Scene`, not `Scene2D`/`Scene3D`

The editor wants one scene-tree concept and one serialization format.
`onEnter`/`onFixedUpdate`/`onShow` are already dimension-free. Confirmed
by B6: the dimensional differences fit inside one schema.

### Editor enablement before 3D

Done, and it paid off twice over: `s.tagged`/`s.dynamic` and the asset
database were both load-bearing for the 3D work that followed.

## Where we are

Verified against the code, not recalled.

**Done.**

- *Schema as data* (A1). `core/schema.js` is the descriptor vocabulary and
  validator; `core/sceneSchema.js` is the scene format written in it;
  `sceneLoader.js` keeps only what cannot be data. `fieldsOf` and
  `refScopesOf` are the introspection an inspector needs.
- *Stable ids and a format version* (A2). Every object and UI element has
  a required, unique, well-formed `id`, reaching the entity as
  `entity.sceneId` and the scene as `scene.entitiesById`. No migrations:
  the loader accepts exactly the current version.
- *Declarative constraints* (A3). `game.registerConstraint`, a
  `constraints` block on prefabs and objects, `static params` on all
  eighteen engine constraints, retuning through `configure`.
- *Asset database* (A4/A5). Assets by uid, imported (`source` +
  `import`) or authored (`data`); a scene's `uses` block binds uids to
  local names and the loader expands it into the inline shape.
- *Named entity creation* (B7). `createEntity` and `spawn` take one
  object.
- *`Vec3` and `Quat`* (B2), beside an untouched `Vec2`.
- *3D physics* (B1 + phase 3). `rapierShared.js` holds what a dimension
  does not change; `rapierBackend.js` and `rapier3dBackend.js` are the two
  implementations; `initPhysics`/`createPhysicsWorld` take the dimension,
  behind a dynamic import so a game fetches only the solver it plays.
  36 contract tests.
- *3D levels, headless* (B6). `world.dimensions`, three-axis placement,
  3D collider shapes, and the checks that follow from the dimension.
  14 tests building and ticking a 3D level.

**What a 3D game still cannot do.** All of it is presentation or the
things that serialize presentation:

| Gap | Detail |
| --- | --- |
| Draw anything | The renderer contract is a 2D sprite and shape API — `drawSprite`, `drawRect`, `drawText`, `pushTransform` — tessellated and transformed to pixel space on the CPU. `gl_Position.z` is 0, there is no depth buffer and no GPU-side camera matrix. There is no mesh primitive and no material. |
| Place a camera | `Camera` is `x`, `y`, `zoom` and a scalar `rotation`, with `follow`/`scroll`/`rooms` modes. |
| Draw an entity | `Entity.draw` tiles a sprite across a rectangle; `depth` sorts by the bottom edge of the body; `renderAnchor` goes through the 2D projection; `elevation` fakes a third axis. |
| Pick with a pointer | Pointer-to-world is a 2D inverse transform; 3D wants a ray cast. |
| Replicate | `net/replication.js` packs the transform as `[x, y, angle, vx, vy]` with pixel-tuned rounding. |
| Use 3D constraints | Units are px/s on a ground plane; `PathFollow.points` is a list of `{x, y}`. |
| Import a model | `ASSET_TYPES` is `spritesheet` and `prefab`. No mesh, material or texture type. |

## The open decision: what does a 3D game here look like?

**Everything left depends on this and the plan should not guess at it.**
The renderer is now the whole of the remaining work, and two very
different answers are both reasonable for an engine that came from 2D:

**A. Sprites in a 3D world.** Billboards, camera-facing quads, sprite
stacks. The simulation is genuinely 3D; the drawing stays textured quads,
which is what the existing WebGL2 backend already does well. Needs a depth
buffer, a GPU-side view-projection matrix and a billboard primitive —
perhaps a week of renderer work rather than a rewrite. This is how a
great many "3D" indie games actually look, and it fits the engine's
existing art pipeline, its sprite sheets and its asset database.

**B. Meshes and materials.** glTF models, per-material shading, real
lights, shadow maps. A new renderer backend in the full sense, plus model
import, plus a material system, plus skinned animation if characters are
to move. Several times the work of A, and it makes the existing sprite
features irrelevant in 3D scenes rather than reusing them.

They are not mutually exclusive — A is a coherent stopping point and a
plausible foundation for B — but which comes first changes nearly every
item below, so it is a question for the owner rather than an assumption
to encode here.

**Recommendation: A first.** It reuses the batching, the texture cache and
the asset pipeline that already exist, it reaches a playable 3D demo in a
fraction of the time, and building it will teach us what the camera and
the entity split actually need — which is exactly the knowledge the last
three mis-plans were missing.

## Next

One item. It is the only remaining work with a consumer today, it does not
depend on the open decision, and it is small.

**N1. Replicate a 3D transform.** `net/replication.js` packs `[x, y,
angle, vx, vy]` and rounds to pixel-tuned precision. A 3D headless game is
exactly what a server runs, and the 3D backend is headless-complete, so
this has a real consumer now: a 3D match in `packages/server`. Deliverable
is a dimension-aware packer plus a server test that runs a 3D match and
has a replica agree with it. What we will learn: whether the wire format
needs a version field of its own, and whether the rounding constants are
dimension-dependent the way `CHARACTER_NUDGE` turned out to be.

After N1, the next step is **whichever renderer answer the owner picks**,
and the plan for it should be written then, against the choice — not now.

## Sketches, not commitments

Everything here is a guess about work whose shape we will not know until
the renderer decision is made. Written down so nothing is forgotten, with
no claim that any of it is the right breakdown.

- **A 3D camera.** Position, orientation, a projection matrix, and modes
  (orbit, follow, first-person). Will likely want `Camera` split rather
  than generalised, but that is exactly the kind of guess B1 and B6 got
  wrong — decide when the renderer exists.
- **Entity's presentation half.** `draw`, `depth`, `renderAnchor`,
  `elevation` and sprite tiling are 2D. Whether this is a base class, a
  strategy object or two actor trees should follow from what the renderer
  asks of an entity, not precede it.
- **Pointer picking as a ray.** `game.physics.raycast` already exists in
  3D; what is missing is the camera unproject, which needs the camera.
- **3D constraints.** Movement, chase and path-following want 3D variants
  or vector-typed params. `static params` is where that becomes visible to
  an editor. No consumer until a 3D demo exists.
- **Model assets.** `ASSET_TYPES` gains whatever the renderer decision
  implies: nothing extra for billboards beyond what sprite sheets already
  do, or mesh/material/texture types for glTF. The asset database was
  built to take new types; this is a day's work once the answer is known.
- **A 3D demo.** The real proof, and the thing that will find the
  mis-tuned constants the way the 3D character controller did. Bright and
  distinctive, per the standing preference for new demos.

## Deferred

- **Renaming the package.** Everything says 2D — the package name, the npm
  listing, the docs site. The owner wants this eventually, not as part of
  this work.
- **Per-file asset sidecars.** The engine consumes one compiled manifest.
  Per-source import settings are editor work.
- **Types.** Whether to turn on `checkJs` over the existing JSDoc or move
  to TypeScript is its own roadmap item, in
  `docs/contributing/roadmap.md`. It grows more valuable as the dimensional
  shapes multiply.
