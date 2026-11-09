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
| Bump and morph | Vertex colours, normal and occlusion maps, morph targets and material extensions are skipped by `gltf.js`. | R2, later |
| Bump | No normal or occlusion maps; glTF files that carry them are drawn smooth. | R2 |
| ~~Light a city~~ | ~~Every fragment loops over every light; past a few hundred lights that needs clustering.~~ | **Closed** by R6 slice 3: clustered, 1024 lights a frame |
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
| **R3** — Shadows | Things sit on the ground | **Done, Nov 2026, except point-light shadows.** Up to four sun cascades in a depth array, each fitted to a slice of the view frustum (splits blended between linear and logarithmic) and snapped to its texel grid so edges hold still; perspective shadow maps for the nearest shadowed spots in a second array; 3x3 PCF on both; a frame-wide `normalOffset` (in texels) and `bias` (in metres), and `shadow: false` per light; `r_shadows` (`off`/`low`/`medium`/`high`) with a settings row. Casters are culled per frame against the cascade boxes and spot ranges, decided after the volumes are known. *Deferred:* point-light cube shadows — six passes per light for little the yard would show; the frame carries the hook (`cone.z` is a layer index) when a scene wants them |
| **R4** — Post stack | It looks like a current game | **Done, Nov 2026.** The main pass splits into direct, indirect, normal-depth and velocity targets (per-instance previous model matrices ride in the instance buffer; the sky reprojects by camera). Over them: hemisphere ambient occlusion at half resolution with a depth-aware blur, applied to indirect light only; temporal anti-aliasing with Halton jitter, velocity reprojection and variance clipping; disc-gather depth of field at half resolution; per-object motion blur; auto exposure from the average log luminance eased over frames; the bloom from R2; a composite with ACES, parametric grade (saturation, contrast, temperature) and an optional 256x16 LUT strip, vignette and grain. One cvar and settings row per stage (`r_taa`, `r_ao`, `r_dof`, `r_motionblur`, `r_autoexposure`, `r_bloom`, `r_film`); strengths in `frame.post`. *Judgement calls:* the AO is a hemisphere kernel rather than GTAO (far simpler, good enough at this scale; GTAO is a drop-in later); the TAA is the engine's own rather than an FSR port — FSR stays the route to resolution upscaling, under Beyond R6; the LUT is an image the scene hands over rather than an asset type until the asset database has a texture type to put it in |
| **R5** — Animation | Characters move | **Done, Nov 2026.** `gltf.js` reads skins, joints and weights, the node tree and clips (linear, step; cubic keys linearised); `Animator3D` blends layers by weight with crossfades, walks the tree and builds joint matrices per skin; skinned instances carry their joints into one storage buffer a frame and take skinned mesh and shadow pipelines; a `mesh.animation` block picks the opening clip; `entity.heading` steers a model's yaw. The yard's hero is the Khronos fox, surveying, walking or running by its speed and turning to face where it goes. *Not done:* morph targets. *Closed 9 Nov 2026:* velocity from joint motion. `Animator3D` keeps last frame's joint matrices beside this frame's, a skinned instance files both poses (the previous one's base in `skin.z`, which was spare), and the vertex shader places the previous clip position with the previous pose instead of the current one — so a limb carries its own motion into the velocity buffer and not just the body's. A snap (`fade: 0`) and `stop()` make the pose they land on its own previous, since a jump the viewer never saw is a discontinuity rather than movement, and reprojecting from the bind pose would smear the model across its opening frame |
| **R6** — Scale | A real level fits | GPU instancing by mesh + material; GPU frustum culling with indirect draws; discrete LODs from glTF (`MSFT_lod` or a naming convention); KTX2/Basis Universal compressed textures; mesh and texture streaming by distance; a render-statistics readout in the debug overlay. The demo grows to a level big enough to need all of it and holds its frame rate |

After R6 the engine is at the Three.js/Babylon tier the goal section
describes. Everything below it is the next distance toward the reference
titles, listed so nothing is forgotten, with no claim about order.

### Before R6: the bugs the yard showed

Reported by the owner on 7 Nov 2026 from a desktop run of the yard on a
fast GPU (about 360 fps, 2.8 ms a frame). Fixed the same day from the
code and **confirmed fixed by the owner on the desktop** that afternoon. Three
of the four had one root: the HDR targets are `rgba16float`, whose
ceiling is 65504, and a mirror's sun glint or a grazing GGX lobe passes
it and becomes an infinity in the texel. Every write to an HDR target is
now clamped to 16384 (`clampHDR` in `shaders.js`), and the passes that
average texels clamp what they read as well.

| Bug | What was seen | Cause and fix |
| --- | --- | --- |
| TAA fills the sky black | With every other effect and shadows off and only `r_taa` on, the sky fills with black and the black spreads until it covers the screen | An infinite texel in the 3x3 neighbourhood makes the variance `inf - inf = NaN`, the clip box is NaN, and the history comes out NaN. A NaN history texel survives the clip (every comparison with it is false) and the bilinear history sample hands it to its neighbours, so the stain grows by a pixel a frame: fast at 360 fps, which is why the frame rate seemed to matter. Fixed by the clamp at the source and on the TAA's own reads |
| Bloom flickers | Occasional frames of very high brightness; the screen looks flickery | The prefilter's Karis weight is `1 / (1 + luminance)`, and for an infinite texel `inf * 0 = NaN`; eight downsamples spread one NaN over the whole level and the upsample adds it to the screen. Glints come and go with the camera, so it was single frames. Same fix |
| DoF speckles in shadow | At some camera angles, faint dots appear in shadowed areas | Fireflies: the far field gathers forty-eight taps over a disc of a few hundred half-resolution texels, and the one tap that lands on a hot texel comes back as a dot wherever the surroundings are dark. The half-resolution downsample is now Karis-weighted like bloom's, and both gathers weight bright taps down (`tapWeight`) |
| Noclip still sinks | With the console's `noclip` on, the hero slowly drifts downward | The character step integrated gravity every tick and the controller moved the body by `g * dt²`, about 16 cm/s at 60 Hz, with no floor to absorb it. Both backends now skip gravity for a character whose mask is 0, which is what noclip sets; `physics.test.js` and `physics3d.test.js` pin it |

Infrastructure for this round: `npm run dev:lan` serves the examples over
HTTPS on every interface so the desktop can run them (WebGPU needs a secure
context); the laptop that holds the source is too slow to show the
frame-rate-dependent ones. Still open from the same session: whether the
variance clip should also reject a history sample that is not finite, which
WGSL cannot test for reliably (implementations may assume no NaN), so the
answer is to never write one.

**Depth of field, same day.** The owner found the yard read as uniformly
soft with the "Unity look", and asked for the quality of the reference
titles. Two things changed. The DoF passes were rebuilt on the Jimenez
(Call of Duty: Advanced Warfare) design that Frostbite and Unreal's
Diaphragm DoF follow: an 8x8 tile pass of the widest near and far
circle, dilated by a tile, drives the near gather so it touches nothing
where nothing near can reach; both gathers tap three concentric rings
(8, 16, 24) for round bokeh instead of a noisy spiral; in-focus pixels are
the sharp frame bit-exact, the far field entering only past a full pixel
of circle. And the yard's lens went from f/4 to f/6 — depth of field
scales about linearly with the f-number, so this is the "50% wider band"
the owner asked to try — with the focus distance computed as the actual
eye-to-hero distance each frame, so zoom, noclip flight and follow
smoothing never take the playable character off the focal plane. (It was
already `camera.distance`, which in orbit mode is the same thing; the
explicit form also holds in a free camera.)

*Decision, 7 Nov 2026:* turning `r_dof` off did not remove the softness,
so DoF was not the root of it. The remaining suspects were the
half-resolution 3D world surface and the TAA blend.

*Resolved, 9 Nov 2026:* the owner isolated it to the TAA — turning
`r_taa` off made the picture crisp. Two standard pieces of TAA hygiene
were missing and are now in: the history is resampled on a Catmull-Rom
spline (five bilinear taps) instead of plain bilinear, whose kernel
compounds into a blur as the history is re-filtered every frame; and
material texture lookups take a -0.5 mip bias while TAA jitters
(`post[6].y`), restoring the texture detail the temporal filter averages
away. An FSR-style temporal upscaler (Beyond R6) remains the fuller
answer — Lanczos accumulation plus RCAS sharpening, and the performance
headroom of rendering under output resolution — but it is an upscaling
deliverable, not the fix for this. If residual softness still shows on
the desktop, the next lever is a CAS-style sharpen in the composite.

### R6 as planned against the code, 7 Nov 2026

Written when the phase started, against what R0–R5 left. The table row
above is the deliverable; this is how it is cut, in slices that each show
on screen, in order.

**What the code already does.** `Frame3D.add` groups instances by
geometry and material and the renderer issues one instanced draw per
group, so "GPU instancing by mesh + material" is the R1 design and needs
nothing. What it does *not* do is the thing a real level needs: every
instance is a JavaScript entity re-packed into the instance buffer every
frame, and culled on the CPU one sphere at a time. Ten thousand trees
would cost ten thousand entities, ten thousand bodies and a per-frame
loop before the GPU saw any of them.

**Slice 1 — resident instances, GPU culling, the readout.** *Landed 7 Nov
2026, awaiting the owner's desktop run.* Learned on the way: a compute
pass may not bind one buffer read-only through one group and read-write
through another, so the cull has a two-binding scene group of its own;
and `indirect-first-instance` is required for a per-pass `firstInstance`
in the arguments, which Dawn on SwiftShader has, so the harness proves it.
The yard's statistics are now a frame late and say so in the docs. The
lot: 224 lots, about 6,100 prop instances in 11 props, 160 KB of JSON.

- *Props.* A scene layer gains `props`: a prefab with a `mesh`, placed
  many times by `[x, y, z, yaw, scale]` tuples. A prop is presentation
  only — no entity, no body, no light; the prefab's `physics` and `light`
  are not read for it. The scene builds one static batch per geometry and
  material at load (`StaticBatch`: a `Float32Array` of instance records),
  the renderer uploads each batch once and copies it GPU-to-GPU into the
  frame's instance buffer, and `Frame3D.addBatch` costs one reference a
  frame. Collision for props, and a quaternion form of the tuple, wait
  for the demo that needs them (the B1/B6 rule). A skinned model cannot
  be a prop: it has no joints to pose.
- *GPU frustum culling with indirect draws.* Each instance record carries
  its world bounding sphere and a cast-shadow flag. One compute pass per
  frame tests every instance against the planes of every pass — the
  camera's and each shadow map's, up to nine — and appends the survivors
  to a per-pass, per-group remap list with an atomic counter that is the
  pass's indirect `instanceCount`. The vertex shaders read
  `instances[remap[instance_index]]`. The CPU cull in `Frame3D.add` and
  the sphere-volume shadow test in `resolveShadows` go; the shadow passes
  cull against their own frustum planes, which is tighter than the
  volumes were. The group of an instance is found by binary search over
  the group starts, so a static batch's records never need rewriting.
- *The readout.* Instance counts are now on the GPU, so the statistics
  come back a frame late through a staging buffer: instances submitted,
  drawn, shadow casters, triangles, and — where the adapter has
  `timestamp-query` — GPU milliseconds from the cull pass to the composite.
  The debug overlay shows them in a 3D game.
- *The lot.* A second scene in the yard example, generated by
  `examples/scripts/buildLotScene.mjs`: the yard at the centre of a grid
  of lots with thousands of props (trucks, crates, lamp posts and
  primitive trees) around it. `?scene=lot`. It is the scale testbed, not
  the "proper map"; see the asset question below.

**Slice 2 — real assets and LODs.** *Landed 7 Nov 2026, awaiting the
owner's desktop run.* The owner chose Poly Haven ("pick the highest
quality ones; games take hundreds of gigabytes") and said storage is a
later problem, so compiled models are committed to git for now. What
the choice turned up: Poly Haven's models are offline-render photoscans
— the jacaranda is 3.9 million triangles and 280 MB at 4k, the pine 17
million — so nothing draws them without a build-time compiler, and the
"proper map" runs through it. `examples/scripts/fetchPolyHaven.mjs`
pulls the set from the API with checksums into a gitignored source
directory (1.5 GB for 33 assets); `examples/scripts/compileModel.mjs`
(gltf-transform + meshoptimizer + sharp) welds, decimates to a budget
per kind (300k for a tree, 80k for a prop) and to 30%, 8% and 2% of that
for three more levels, folds the levels into one `.glb` under root nodes
`LOD0`..`LOD3` with the coverage thresholds in `asset.extras.m2d`, and
re-encodes textures as WebP at a 2k cap. The engine reads the level roots
into `model.lods`, picks the level in the cull shader by the sphere's
screen coverage (a group now carries a coverage range; a prop is in
every level's group and the cull keeps it in one), and for an entity's
model on the CPU by the same measure. Along the way the glTF reader
gained what the scans need and R2 had left: normal maps (tangents from
the file or made at load), occlusion, `alphaMode` with alpha-tested
shadows, `doubleSided` pipelines, `KHR_texture_transform` and
`EXT_texture_webp`. *Decided late, as planned:* a naming convention
rather than `MSFT_lod`, since the compiler writes the file and a node
name needs no extension machinery; and `BLEND` drawn as a mask at the
cutoff until transparency is its own phase. The lot is rebuilt from the
scans: 7,400 instances across 35 props.

**Slice 3 — textures and streaming.** KTX2/Basis Universal through a
transcoder to whatever compressed format the adapter has (`texture-
compression-bc`, `-etc2`, `-astc`); this is what lifts the 2k texture cap
to the 4k and 8k Poly Haven ships, since a 4k RGBA8 texture with mips is
85 MB of GPU memory and BC7 is a quarter of that. Mesh and texture
loading by distance from the camera, with a budget. Clustered light
culling lifts `MAX_LIGHTS`. A proper transparency pass for `BLEND`.

*The KTX2 half landed 9 Nov 2026.* The compiler encodes textures as KTX2
(`ktx2-encoder`, the Basis encoder as wasm, so a fresh checkout needs no
system tool): UASTC+zstd for normal, metallic-roughness and occlusion
maps (ETC1S's shared codebook smears correlated channels), ETC1S q192
for colour and emissive, mip chains in the file, and the cap at 4096. The
engine transcodes at load with Binomial's transcoder, vendored at
`webgpu/basis/` from the build three.js ships (Apache-2.0, checksums in
the directory README, lazily imported so a scene without models pays
nothing) to the best of ASTC/BC7/ETC2/RGBA8 the device granted;
`TextureCache3D` uploads the pre-mipped payload directly, and
`gltf.js` resolves `KHR_texture_basisu` through a `setKTX2Decoder`
registry the renderer fills — headless stays decoder-free and skips
images as before. A `.format` stamp in the models directory makes
`buildModels.mjs --missing` rebuild the WebP-era set once. *Still open
in this slice:* streaming by distance.

*The transparency pass landed 9 Nov 2026.* A BLEND material no longer
alpha-tests at its cutoff; it draws in a second walk of the camera's
groups at the end of the main pass, alpha-blended, depth-tested but not
depth-written. It rides inside the main pass rather than after the
resolve, because the main pass is MSAA and discards its depth: a
post-resolve pass would need a resolved depth buffer that does not
exist. The two light targets blend and the normal-depth and velocity
are write-masked off, which keeps the resolve exact through the blend —
the occlusion is one value at the pixel and multiplies out of both
sides — at the cost of the geometry buffers describing the surface
*behind* the glass, so AO, depth of field and motion blur read through
it and the fog is the background's. A blended instance also stops
casting a shadow (the flag `writeInstance` already had), since the
shadow pass has no blending and glass would cast its whole pane; MASK
still casts its cut-out, which is what foliage wants. *Known limit,
recorded rather than fixed:* groups sort back to front, instances
within a group do not — the cull appends them atomically and no CPU
pass can see that order. Right for separate lamps and windows, wrong
for two overlapping panes of one material; a GPU sort of the remap list
is the fix when a scene needs it.

*Clustered lights landed 9 Nov 2026.* The view frustum is divided into a
16x9x24 grid — tiles across the screen, 24 depth slices spaced
exponentially so the near ones are thin — and a compute pass, dispatched
beside the instance cull in the same encoder pass, builds each cluster's
view-space box and keeps every light whose sphere reaches it, up to 32.
The mesh fragment finds its cluster from its framebuffer position and
view depth and loops over that list instead of the whole frame's.
`MAX_LIGHTS` is 1024, up from 256: the cap now bounds the clustering
pass and the buffer rather than the cost of a pixel, which is the 32 a
cluster holds. The grid is rebuilt every frame rather than cached
against the projection — one dispatch over 3,456 invocations is cheaper
than tracking every change to the lens, the surface size and the light
set. Learned: the clustering writes two buffers the scene bind group
holds read-only, so like the cull it needs its own two-group binding;
and a cluster test has to be written against *gross* errors, since a
one-tile shift is invisible by construction — lights are spatially
coherent, so a neighbouring cluster holds the same ones.

**Storage, decided.** The owner, seeing the fetcher, chose it over
committing anything heavy: *"we don't have to commit any big
mesh/texture; follow this approach for any 3D stuff in the repo."*
So neither the sources nor the compiled models are in git; the dev
server runs `scripts/buildModels.mjs --missing` at start, which fetches
and compiles what is absent (1.5 GB and a few minutes, once per
checkout). The rule from here: a 3D asset enters the repository as a
fetch-and-compile recipe, never as bytes. The Khronos truck and fox,
half a megabyte between them, predate the rule and stay.

**The lot's first desktop run, 7 Nov 2026.** The owner's notes and
what followed: the slabs under each lot read as "an extra ground layer"
and the walls floated on them — slabs removed, everything on the yard's
floor; nothing collided — props gained a `collider` (`bounds`, a shape,
or none), trees as trunks; trees looked shiny — Poly Haven's
`KHR_materials_specular` factor of 0.6 and `ior` 1.45 were being
ignored, so leaves had glTF's default 4% reflectance instead of 2.2%,
now read; fences had no transparency — Poly Haven's glTF textures are
JPEGs, which carry no alpha, so every `BLEND`/`MASK` material was opaque
whatever the renderer did; the fetcher now takes the separate `_alpha`
PNG maps the API publishes and the compiler folds them into the colour
(a true `BLEND` material with no mask, the street lamp's glass, still
draws opaque until the transparency pass);
`r_shadows high` cut off the nearest shadows — the smallest cascade's
orthographic box only reached back twice its own radius, so anything
taller up-sun fell outside it, and it now reaches back by the shadow
distance; a blank page while 250 MB loaded — a loading plate driven by
a new `onLoadProgress` scene hook; and sound — a synthesized wind loop
and footsteps in `yard/ambience.js`, quiet, following the circuit's
precedent for generated audio.

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
