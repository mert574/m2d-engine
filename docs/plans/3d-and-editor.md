# Plan: 3D support and a visual editor

Working plan, not published documentation. `docs/.vitepress/config.mjs`
excludes `plans/**` from the site. When a piece of this lands, the
user-facing half of it goes into the real docs pages as usual.

Agreed with the owner, Nov 2026. Replanned after the first eight steps
shipped; see "How this plan goes wrong" for why. The renderer decision was
made on 6 Nov 2026 and the renderer plan written against it.

## The goal

1. **Full 3D support** in an engine written entirely for 2D. "Full" means
   meshes, materials, real lights, shadows and shaders — a high-realism
   renderer in the tradition of modern AAA games (Cyberpunk 2077, Red Dead
   Redemption 2 were the owner's references), not sprites in a 3D world.
2. **A Godot-like visual editor** later, with easy import of external
   assets — models, maps, textures.

Existing 2D games stay 2D. Nothing here asks them to change.

**Backwards compatibility is not a constraint.** Scene files, prefab
layout, the asset pipeline and public APIs are all fair game. Migrate the
demos; carry no shim.

### What "high realism" can mean in a browser

Said once so the plan does not over-promise. The reference titles are the
work of several hundred engineers over five or more years, on top of
offline content pipelines (baked lighting, hand-tuned LODs, terabyte asset
budgets) and consoles with direct GPU access. The ceiling a browser engine
can reach is the one Three.js, Babylon.js and PlayCanvas have reached:
physically based materials, image-based lighting, cascaded shadows,
skinned glTF characters, and a full HDR post-processing stack. That is a
real, modern look — it is what most Unity and Godot games ship with — and
it is what this plan targets, and the browser is not the limit on it. The
owner's point, Nov 2026: full AAA engines (GTA V, Cyberpunk 2077) now run
locally in a tab as WebAssembly over WebGPU, with thousands of shaders
translated to WGSL (ported2browser.com is a directory of such ports).
The budget is there; the work is ours. What the browser does rule out is
narrow: vendor-locked tech (DLSS, XeSS, FSR 4, which ships only as signed
DLLs) and **hardware** ray tracing, which WebGPU gates behind bindless
resources and will not have before 2027. Open shader-source techniques
port: AMD's FSR 1–3 and the FidelityFX denoisers are MIT and already have
WGSL ports, and ray tracing in **compute** (BVH or signed-distance-field
traversal, as Lumen's software path and AMD's Brixelizer do it) works
today. Those are listed under "Beyond R6" as feasible, in order of
return.

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
justifies it.** Every renderer phase below ends in something visible in a
demo. Where this plan does not know something, it says so instead of
inventing a step. Anything under "Sketches" or "Beyond" is a sketch, not
a commitment.

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
| Physics solver | **Split** — `rapier2d` / `rapier3d` behind one contract | Done; 3D is +y up in metres |
| Renderer backend | **Split** — a 3D renderer with its own contract beside the 2D one; see "The renderer" | R0 done: `WebGPURenderer`, retained, HUD on an overlay canvas |
| Fixed-step clock, `Time`, determinism contract | **Shared** | Unchanged, needed no work |
| Scene format, loader, `SceneManager`, assets | **Shared**, with a dimension discriminant | Done |
| Input, audio, UI, screens, console, quest | **Shared, untouched** | Unchanged |
| `Entity`, actors, constraints | Shared base, dimensional presentation | Not started; shaped by R1 |

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

Verified against the code on 6 Nov 2026 (65 3D tests green), not recalled.

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

| Gap | Detail | Closed by |
| --- | --- | --- |
| Import a skinned or animated model | `gltf.js` reads static meshes and materials; skins, animation clips, vertex colours, normal and occlusion maps, and material extensions are skipped. | R5, R2 |
| Bump | No normal or occlusion maps; glTF files that carry them are drawn smooth. | R2 |
| Light a city | Every fragment loops over every light; past a few hundred lights that needs clustering. | R6 |
| Use 3D constraints | Units are px/s on a ground plane; `PathFollow.points` is a list of `{x, y}`. | When the demo needs one |

## The renderer

### The decision

**Option B: meshes and materials.** The owner chose it on 6 Nov 2026
over "sprites in a 3D world". The sprite features stay for 2D scenes; a
3D scene draws nothing through them.

### Three decisions, made before R0

Each of these gets more expensive with every phase that lands on top of
it, so they were settled with the owner in Nov 2026 before any renderer
code. The reasoning is kept because it is what the next person will ask.

**1. GPU API: WebGPU, not WebGL2.** Recommendation: WebGPU. The look the
owner wants is built out of clustered light culling, GPU-side frustum and
occlusion culling, indirect draws and large structured buffers — all of
which want compute shaders and storage buffers that WebGL2 does not have.
Three.js's own high-end path moved to WebGPU for the same reasons, and
the 2026 AAA browser ports are all WebAssembly over WebGPU.

**Chromium-only for now** — decided by the owner, Nov 2026. Firefox and
Safari ship WebGPU but lag Chrome on extensions and conformance (the
Cyberpunk port runs only on Chromium with hardware acceleration). 3D
scenes require Chromium and say so on load; 2D games keep running
everywhere they do today. Reconsider when the other browsers catch up —
the cost of waiting is low because WGSL is one language everywhere.
The costs of WebGPU itself, both real:

- *The UI pass.* The 2D renderers draw the HUD onto the same canvas as
  the world. A WebGPU canvas cannot also hold a WebGL2 context. The 3D
  renderer therefore draws the UI onto a **second canvas layered over the
  first**, which it creates and sizes itself, driving the existing WebGL2
  UI renderer unchanged. Porting the 2D batcher to WebGPU so one canvas
  serves both is a later, optional step, taken only if two canvases cause
  a problem (input hit-testing and fullscreen are the places to watch).
- *The test harness.* `test/browser` runs WebGL2 on SwiftShader in headless
  Chromium. WebGPU in headless Chromium runs on Dawn over SwiftShader
  Vulkan with `--enable-unsafe-webgpu` and a software adapter flag. It is
  known to work in CI but has not been proven in this repo. R0 proves it.
  **If R0 cannot get WebGPU running under the test harness, the fallback
  is WebGL2 for the whole renderer**, accepting CPU-side light culling and
  a lower ceiling; the plan's phases do not change, only their internals.

**2. Up axis: 3D is +y up; 2D stays y down. No flip anywhere.** Decided
Nov 2026. The owner's rule: if a flip must exist, it exists in exactly
one place, and the codebase never "handles the flipped case" again — and
they were open to changing 2D to get there. The choice that satisfies the
rule is *no flip at all*, which means each dimension keeps the convention
its content is natively in:

- 3D content — glTF, Blender, Maya, Unity, Godot, Three.js, Rapier3D's
  own docs, HDR environments — is y-up. With 3D at +y up, nothing is ever
  converted: not a vertex, normal, tangent, skin matrix, animation
  channel, camera or light. Today's -y-up 3D would have needed a
  conversion in every one of those places forever.
- 2D content — sprites, tile maps, the UI, the canvas, pointer events —
  is y-down. 2D at y-down is already flip-free. Making 2D y-up "for
  consistency" would *introduce* a permanent flip between world and screen
  in the 2D camera and in every projection of the perspective kit, plus a
  rewrite of thirteen demos, to remove an inconsistency that no code
  ever sees: the two dimensions never share a world, a camera or a
  renderer. Godot makes exactly this split (`Node2D` y-down, `Node3D`
  y-up) for the same reason.

So the only place that knows there are two conventions is documentation
(the physics guide's units table, one line per dimension). The 3D change
was `UP` in `rapier3dBackend.js`, its ground-normal checks, and the 3D
tests; plus one shared place, `Entity.groundBody`, which now asks
`world.up` instead of assuming an axis. **Landed in B8.**

**3. Length unit: metres in 3D now, and 2D migrates to metres too.**
Decided Nov 2026: the owner wants one unit across both dimensions if
possible, and it is. The 2D engine is *already* metres inside the solver
— `LENGTH_UNIT = 100` in `rapierShared.js` means 100 px = 1 m, and every
tuning constant is written in px and divided down. What the author sees
is pixels. Unifying means exposing the metre to 2D authors, Unity-style:

- Scene coordinates, sizes, velocities, gravity and constraint params in
  metres; the schema's fifteen `unit: 'px'` fields become `'m'`.
- Sprite sheets gain `pixelsPerUnit` (default 100, the current ratio, so
  a 32 px sprite is 0.32 m and today's art needs no change).
- The 2D camera takes a world height in metres instead of px; the
  projections in the perspective kit convert once at the camera.
- Every demo scene is divided by 100. Mechanical, large, and compat is
  not a constraint.

What it buys: one units table, one set of constraint params the editor
can show, one replication rounding scheme, and physical lighting in 3D
without a second mental model next to it. It is independent of the 3D
track: nothing in R0–R6 reads a 2D unit. **It is its own deliverable,
U1, sequenced after R1** so that 3D's metre handling exists as the
second consumer before the shared pieces (schema units, constraint
params, replication rounding) are generalised — the B1/B6 rule again. 3D
is metres from B8 regardless.

### How the 3D renderer differs from the 2D contract

The 2D renderer is immediate-mode: entities call `drawSprite` in depth
order each frame. A 3D renderer cannot be driven that way — shadows,
clustered lights, transparency sorting and post effects all need the
whole frame's contents before the first pixel is shaded. So the 3D
renderer is **retained**: the scene owns a render list of mesh instances,
lights, a camera and an environment; the frame is `renderer.render(view)`.
`Entity` in a 3D scene does not have a `draw` method that is called per
frame; it owns a `MeshInstance` whose transform follows the body.

The contract (`Renderer3D`) is written when R0 has its first consumer and
grown with each phase. Nothing in it is designed ahead of a phase that
needs it. `BaseRenderer` and the 2D conformance suite are not touched.

What stays shared: `game.loop`, `Time`, the fixed step, `Scene`,
`SceneManager`, the loader, the asset database, input, audio, `game.ui`,
the console, cvars. The UI pass is unchanged except for which canvas it
lands on.

### Phases

Each phase is a deliverable with a demo-visible result and a "done when".
Internals are described only as far as they are known today; the rest is
decided when the phase starts, against the code that exists then.

| Phase | Deliverable | Done when |
| --- | --- | --- |
| **B8** — Axis and units | 3D is y-up, metre-scale | **Done, Nov 2026.** `rapier3dBackend.js` is +y up with its own metre-scale tuning (`LENGTH_UNIT` 1, density 1000 kg/m³, 1 cm character offset, 2 cm contact pad, 10 cm snap) and Earth gravity by default. Both worlds expose `up`, and `Entity.groundBody` asks it instead of assuming an axis — the one piece of shared code that cared. 52 3D tests in metres, including a jump test that pins the y-up grounded check. The docs' units tables say which unit belongs to which dimension. Found along the way: a contact pad equal to the character offset leaves a resting character's floor outside the pad by a float32 rounding, so the pad is twice the offset, as it already was in 2D |
| **N1** — Replicate a 3D transform | `net/replication.js` packs `[x, y, z, qx, qy, qz, qw, vx, vy, vz]` with metre-tuned rounding | **Done, Nov 2026.** The packer and the apply path follow `game.physics.dimensions`; spawns carry `z` and `d`. The server worker loads the solver the match's `game.dimensions` asks for. `test/replication3d.test.js` (in-memory) and `packages/server/test/server3d.test.js` (a real worker and two real sockets) have replicas agree with the server on position, quaternion and velocity. Two questions answered: the wire format needs **no version field**, since both ends agree on the dimension before any state flows; and the rounding constants depend on the **unit, not the dimension** — 3D rounds to the same 0.1 mm and 1 mm/s that 2D's 1/100 px and 1/10 px/s are. One wrinkle: `-0` is folded to `0` in the packer so a server value and its replica compare equal |
| **U1** — One unit | 2D authors work in metres too | `pixelsPerUnit` on sprite sheets (default 100); scene schema units say `m`; the 2D camera and the perspective-kit projections convert px↔m in one place; constraint `static params` carry `m`/`m/s`; replication rounding is metre-based for both dimensions; every demo scene and its gameplay constants are converted; the physics and scene docs say metres everywhere. The determinism test still passes bit-for-bit after conversion of its scenes. **After R1, before the editor** — independent of the renderer phases |
| **R0** — First light | WebGPU proven in the engine and the test harness | **Done, Nov 2026.** `renderers/webgpuRenderer.js` (retained; `render(frame)`; `dimensions = 3`), `webgpu/device.js` (`initWebGPU()` awaited before `M2D`, like `initPhysics`), `webgpu/shaders.js` (one vertex-coloured mesh pipeline under a directional light, depth-tested). `M2D` defaults a 3D game to `webgpu`, refuses a renderer whose dimension disagrees with the physics, and in 3D calls `renderer.render(scene.frame3D())` instead of the 2D world pass; a scene fills the frame in `onRender(frame, dt)`. The HUD draws through a WebGL2 backend on an overlay canvas the renderer owns, so `game.uiRenderer` and the UI layer are unchanged. `test/browser/webgpu.smoke.test.js`: device, lit triangle, shading by the light, overlay, the engine loop, the dimension checks. **The WebGL2 fallback is not needed.** Two harness findings worth keeping: with only the ANGLE/SwiftShader flags the WebGPU instance is torn down on first use, and `--enable-features=Vulkan --use-vulkan=swiftshader` fixes it with WebGL2 intact; and a 2D-canvas snapshot of a WebGPU canvas reads back empty on SwiftShader, so the renderer has a GPU-side `readPixels()` for tests, same-task as the draw |
| **R1** — Meshes on screen | A 3D level you can walk around in | **Done, Nov 2026.** glTF 2.0 `.glb` reading (`core/gltf.js`: meshes, node transforms, metallic-roughness materials, base/MR/emissive textures) with a `model` asset type in the manifest and `assets.models` in a scene; a prefab's `mesh.model` with `scale` and `offset`; GPU textures with generated mipmaps, sRGB where the data is colour; one material bind group per glTF material; frustum culling by bounding sphere, separately for the main and shadow passes. The yard has the Cesium milk truck. *Earlier, the primitive half:* `Camera3D` (`orbit`/`free`, `screenToRay`, `screenToWorld`, `worldToScreen`) is `game.camera` in 3D; `Frame3D` groups instances by geometry and the renderer draws one instanced indexed draw per geometry from a cached upload; `geometry/primitives.js` builds box, sphere, cylinder, capsule and plane; a prefab's `mesh` block (shape, CSS colour to linear, metallic, roughness, emissive, checker) reaches the entity and the frame; a 2048 shadow map with 3x3 PCF, hemisphere ambient, Cook-Torrance GGX, fog, ACES, 4x MSAA and a procedural sky. **The demo exists**: `examples/src/yard`, orbit camera, WASD hero. Learned: the entity's presentation half fit as one `entity.mesh` record read by `Scene.frame3D`, no subclass needed; and the first shaded picture wanted the sky, fog and tonemapping *before* it wanted models, so R2's "HDR and tonemapper" is already here and R2 is materials and lights |
| **R2** — PBR and lights | Materials look like materials | **Mostly done, Nov 2026.** Image-based lighting from the renderer's own sky, baked to a cubemap when the sky changes, GGX-prefiltered into six roughness mips and cosine-convolved for diffuse, with a split-sum BRDF LUT (`webgpu/environment.js`); point and spot lights with inverse-square falloff windowed to a range, up to 256 a frame in a storage buffer, looped in the fragment shader; a prefab `light` block that follows its body; an HDR `rgba16float` pipeline with bloom (threshold, 13-tap down, tent up) and an ACES composite (`webgpu/post.js`); sRGB-correct textures since R1. The yard has lamps, a floodlight, a mirror sphere and a dusk toggle. *Still to do under R2:* normal and occlusion maps (need tangents; no shipped model has one yet), an HDR environment *asset* as an alternative source cube, and clustered light culling (R6 — the loop over 256 lights is fine for a yard). *Not planned:* a Khronos-viewer pixel match; the reference viewer's own look is a target, not a test |
| **R3** — Shadows | Things sit on the ground | Cascaded shadow maps for the sun with PCF and stable cascade splits; spot shadow maps; point-light cube shadows; shadow bias controls on the light asset; a `shadows` quality cvar. The demo's hero casts a shadow that does not swim as the camera moves |
| **R4** — Post stack | It looks like a current game | Temporal anti-aliasing with motion vectors — evaluate porting FSR 3.1's temporal upscaler (MIT, WGSL ports exist) and running it at 1:1, which gives TAA now and resolution upscaling for free later; physically based bloom; ground-truth ambient occlusion; auto-exposure; colour grading through a LUT asset; depth of field; per-object motion blur; vignette and film grain; each a toggle in the settings menu and a cvar, each degradable |
| **R5** — Animation | Characters move | Skinned meshes from glTF (joint matrices in a storage buffer); animation clips from glTF; play, loop, crossfade and blend by weight; an `animation` block on the prefab; the animator advances on the frame from `Time`, so it never touches simulation; the 3D character controller drives a walk/idle/jump blend in the demo |
| **R6** — Scale | A real level fits | GPU instancing by mesh + material; GPU frustum culling with indirect draws; discrete LODs from glTF (`MSFT_lod` or a naming convention); KTX2/Basis Universal compressed textures; mesh and texture streaming by distance; a render-statistics readout in the debug overlay. The demo grows to a level big enough to need all of it and holds its frame rate |

After R6 the engine is at the Three.js/Babylon tier the goal section
describes. Everything below it is the next distance toward the reference
titles, listed so nothing is forgotten, with no claim about order.

### Beyond R6: the realism roadmap

Each item here was validated against a working WebGPU implementation
(Nov 2026), not assumed. Still sketches — no order is committed and each
gets its own plan when it starts — but none of them is a guess about
feasibility anymore. Roughly in order of visual return per unit of work:

- **GTAO upgraded to screen-space GI.** R4's ambient occlusion extends to
  one-bounce screen-space indirect light (the visibility-bitmask GTAO
  family). Proven in WebGPU by a Three.js SSGI implementation; GTAO
  sample counts that were marginal on WebGL are comfortable on WebGPU,
  and the sample count can drop dynamically under budget. Cheap because
  it reuses R4's depth/normal/colour buffers.
- **Sky, atmosphere and volumetric clouds.** Hillaire-2020 atmosphere
  LUTs (transmittance and multiple scattering at startup, sky-view and
  aerial-perspective per frame) plus raymarched Perlin-Worley clouds at
  half resolution with temporal reprojection — the Horizon Zero Dawn
  recipe. Multiple open WGSL implementations exist; one reports a 0.45 ms
  fullscreen raymarch. This single item moves outdoor scenes further than
  anything else on the list.
- **Volumetric fog and light shafts** (froxel grid, compute), fed by the
  same scattering maths as the atmosphere.
- **Upscaling and frame generation.** FSR 3.1 upscaling falls out of R4
  if the TAA is the FSR port; a quality/performance mode in the settings
  menu. FSR 3.1 frame generation is feasible (its optical-flow half has a
  WGSL port) but latency-sensitive; try it last. FSR 4, DLSS and XeSS are
  not available on the web.
- **Screen-space reflections** (AMD SSSR is MIT and portable), denoised
  with the FidelityFX reflection denoiser, falling back to the IBL.
- **Dynamic global illumination**: DDGI-style irradiance probes updated
  incrementally in compute — a few rays per probe per frame against a
  BVH or signed-distance field of the static level, temporally
  accumulated, with infinite bounces for free (probes sample each other).
  Proven in the browser by the Shade engine (UE4 SunTemple scene, no
  baking); native reference numbers are ~4 ms for 16k probes. The same
  traced structure later serves rough reflections and far-field AO —
  the Lumen-software / Brixelizer route. This is how "ray tracing"
  reaches the web without hardware RT, and the SDF/BVH build is the hard
  half, so it starts as a static-level bake.
- **Soft shadows** (PCSS, contact shadows; FidelityFX shadow denoiser for
  traced shadows) and transmission / clearcoat / sheen material extensions.
- **Decals**, **terrain** with splat mapping, **water**.
- **Virtual geometry.** Proven feasible in the browser: nanite-webgpu
  renders a 1.7-billion-triangle scene in Chrome with meshlet LOD
  hierarchy, per-meshlet culling and a WGSL compute software rasterizer.
  Enormous work and it needs its own asset pipeline (meshoptimizer for
  meshlet building), so it stays last — but it is no longer "needs
  hardware the browser doesn't have".
- **A WebGPU 2D batcher** so a 3D game's HUD shares the canvas.
- **Hardware ray tracing, mesh shaders**: gated on WebGPU bindless (Google
  targets Dec 2026); revisit in 2027. **Virtual texturing**: not planned.

One architecture note recorded for R2, learned from the validation: a
**visibility buffer** pipeline is not a clear win on WebGPU — it lacks a
portable `primitive_index` (triangle ids must be baked into un-indexed
vertices), and on tile-based GPUs forward shading already gets most of
the shade-once benefit. Clustered **forward** (as planned) stays the
choice; revisit only if R6-scale triangle density makes quad overdraw
measurable.

### What is deliberately decided late

- **`Entity`'s presentation half.** Whether `Entity` grows a
  `MeshInstance` directly, or 3D scenes use an `Entity3D` subclass, or the
  presentation becomes a strategy object, is decided inside R1 by the
  first prefab that needs a mesh — the B1/B6 rule.
- **The `Renderer3D` contract** itself: written at R0 with one method, grown
  per phase.
- **A compiled asset format.** R1 parses `.glb` at runtime. A build-time
  compiler (pre-tangented, pre-LODed, pre-compressed) is editor-era work
  and arrives when import settings exist.
- **3D constraints.** The demo's needs (chase, path-follow in 3D) decide
  whether the existing constraints grow vector-typed params or get 3D
  siblings. Not before the demo exists.

### How each phase is tested

- **CPU in Node.** glTF parsing, matrix and quaternion maths, frustum and
  cluster assignment, cascade splits, animation sampling and blending,
  asset-schema validation. Fast, deterministic, the bulk of the tests.
- **GPU in headless Chromium.** A small 3D conformance suite in
  `test/browser/` with golden images at a tolerance, one scene per phase
  (lit cube, PBR sphere grid, shadowed plane, post toggles, skinned
  cylinder). SwiftShader is slow, so these stay few and small.
- **The demo.** The final check for every phase, and the thing that will
  find mis-tuned constants the way the 3D character controller did.

## Deferred

- **Renaming the package.** Everything says 2D — the package name, the npm
  listing, the docs site. The owner wants this eventually, not as part of
  this work.
- **Per-file asset sidecars.** The engine consumes one compiled manifest.
  Per-source import settings are editor work.
- **Types.** Whether to turn on `checkJs` over the existing JSDoc or move
  to TypeScript is its own roadmap item, in
  `docs/contributing/roadmap.md`. It grows more valuable as the dimensional
  shapes multiply, and a renderer with this many typed GPU structures is
  the strongest argument yet for it.
