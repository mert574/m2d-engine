# Engine surface

Goal: the engine keeps first-class only what an actor, a constraint or scene data cannot do as well; everything reusable but opinionated lives in one kit package games compose from. Roadmap line: "Engine surface".

## The test

A feature is engine data or an engine system when one of these holds. Otherwise it is a kit actor, constraint or prefab — or, if only one game would ever want it, that game's code.

- It exists before or apart from entities: the world's dimension, size and gravity, the camera, the frame's lighting and post, the music (a UI scene plays one too), the clear colour.
- It is simulation state the rules read and a snapshot carries: counters, the rules themselves.
- It needs a pass or a GPU structure of its own: terrain, water, the atmosphere. (A 3D particle field is *drawn* by the renderer but *declared* by an entity, as a light is.)
- Core code names it. `Health` (the meter and the rules bind to it), `PathFollow` (scene paths), `Trigger`, `Prop`, `Platform`, the player classes, and `Attack` and `WallSlip` because the players attach them.

An actor with `static properties` or a constraint with `static params` is already in the tree, the inspector, the gizmo, the component library and every MCP tool, so moving a feature out of core loses no reach and drops its bespoke panel and tool action. Every piece, kept or new, works in 2D and 3D (or declares its dimension), runs headless, replicates as a scene object, and ships with its test and its docs page in the same change ([[working-style]]).

## Decisions

Agreed with the owner on 17 Nov 2026: the backdrops leave the scene format, the kill plane goes, `Bee` and `Ghost` leave the engine, and the kit package is the destination for everything reusable but opinionated.

- **The kit** is `packages/kit`, published as `m2d-kit`: TypeScript (the rule for new packages), the engine a peer dependency, one entry per piece so a game imports what it uses, and no DOM touched at module load so a server can import a game that imports it. Admission is this project's test plus: two games or a template want it. The kit is where the next Bee is caught.
- **A gameplay actor that only composes constraints is a prefab, not a class.** `Bee`, `Ghost`, `MovingPlatform` and `Coin` become prefabs over `Prop` and `Platform`; the kit ships the constraints and the prefab fragments, the scenes declare their own copies. What stopped that until now: `Health` had no declared death behaviour and nothing generic picked things up.
- **A class moves to the kit only when nothing in core names it.** `Attack` and `WallSlip` stay core with the players that attach them; `Npc` moves with `ProximityPrompt`, `Turret` with `Rocket`. The editor shows every class's origin — engine, kit or the game — read from the registries, not from a hardcoded list.
- **A backdrop is a scenery actor**, as the idiom already says of a game's own painting. `Sky`, `Scatter` and `ParticleField` are kit actors placed at a `zIndex` instead of `world.sky`, `world.scatter` and `world.particles` with the Look tab's sliders and `edit_look`'s `addParticles`. The drawing code moves unchanged; a 3D field is an `entity.particles` record `Scene.frame3D` collects as it collects `entity.light`, the cap of sixteen kept.
- **A looping sound is a kit `AmbientSound` actor**, positional (attenuated in 2D and 3D; `radius: 0` fills the scene), faded in, stopped when the entity goes. `world.ambience` and `sceneAmbience.js` go. Music stays world data: a menu has no entities.
- **No implicit world behaviour.** `world.killPlane` and the `fall` event go: a level places a `Trigger` under itself and an `enter` rule ends the game — visible in the editor, the same in 3D, nothing the engine guesses. `world.gravityBind` goes: the playground's dial becomes its own actor whose `fixedUpdate` sets gravity from the `gravity` counter.
- **Kept first-class, and why.** `camera`, `lighting`, `post`, `cycle`, `clearColor`, `music`: frame and view state before entities. `counters`, `rules`, `choices`: simulation state. `postBind`: one data row makes any post field follow any meter reading. The HUD and its element kinds (the `say` action opens the dialogue, and the ability bar reads its slot by name, not by class). The settings menu: the view onto cvars and project settings, not a game menu. `Quest`: a code helper by the idiom's own ruling. `Debug`: a tool, attached by the developer and never by a built-in.
- **Removed fields are a format version bump and a migration of every shipped scene**, by script, in the same change. No shim.
- **What stays a game's own.** The twelve menu backdrops are each one game's art (a valley at dusk, a vault plan, a street front) over the engine's painted-layer seam, so none moves; Night Circuit's touch controls wait for a second touch game. The kit ships no scene data until phase 3's fragments.
- **The kit is private until it can be emitted.** Its source is TypeScript run by Node's type stripping and by Vite, as `editor-core` is; publishing `m2d-kit` needs the compile step both packages lack, so `private: true` holds the name until then. Templates and the docs demos may import the kit as the examples do.
- **Dropped from the earlier backlogs** as one game's wish: a curve per value across the cycle (more states do it), prefab variants (no second consumer yet), ambience on the editor's Sound tab (the actor replaces it).

## Plan

Phases are layers, not vertical slices: each item uses only what an earlier phase or its own built, checked item by item below. Order of same-layer phases follows what unblocks the most.

**1. Core seams.** Everything later phases stand on, all in core, nothing new user-facing.
- Registries carry an origin (engine, kit, the game); the editor's catalog and `list_components` read the registries instead of `catalog.ts`'s hardcoded class list, and show the origin.
- `Health` gains `whenDead` (`remove`, `keep`): the declared death that lets a mob be data.
- `Scene.frame3D` collects an `entity.particles` record as it collects `entity.light`.
- `PathFollow.face` turns its entity to its direction; Night Circuit's traffic car drops its own heading code, which proves the seam.
- Prefab `mass` beside `density`, both backends.
- An entity reaches its scene and its counters without going through the scene manager.
- The scene's dead `MovingPlatform` import goes.

*Done when:* every seam has a test that fails without it; the catalog shows what it showed before, now from the registries; the examples suite is green.

**2. The kit stands.** `packages/kit` scaffolded (TypeScript, peer dependency, per-piece entries, a test that imports every entry in Node and touches no DOM, its docs page). The example-shared helpers move in — the seeded random, the hit effects, the synthesized audio, the parameterized menu-backdrop painters, the touch control layout, shared constants — and the examples import them from the kit. Nothing in core moves yet.
*Done when:* `examples/src/shared` is gone, every example plays as before, and a fresh checkout builds the kit from `npm install`.

**3. Mobs and pickups as data.** The kit gains `Pickup` (collects on an avatar's touch: `counter` to add to, `sound`, the world event `picked`, removes its entity, so `collected` rules and tallies work unchanged). `Bee`, `Ghost`, `MovingPlatform` and `Coin` leave the engine; their scenes declare prefabs over `Prop` and `Platform` with kit and core constraints. The kit ships those prefabs as fragments, and the editor's component library and MCP insert a fragment into the open scene.
*Done when:* the engine registers no actor that is only a composition of constraints; every migrated scene's headless playthrough passes; a mob fragment inserted through MCP walks and dies in play.

**4. Gameplay classes move to the kit.** `Chase`, `Hover`, `ContactDamage`, `DamageFlash`, `Abilities`, `Footsteps`, `Interactive`, `Grabbable`, `CarControl`, `GlideControl`, `ThrustControl`, `Npc` with `ProximityPrompt`, `Turret` with `Rocket`. Possible now because phase 3 deleted the core actors that imported them. Games, templates and the docs demos that attach them import the kit; the catalog's origin column (phase 1) tells them apart.
*Done when:* core's `actors/` and `constraints/` hold only what the test's fourth line names; every example, template and docs demo plays; the idiom test is green.

**5. Backdrops and sounds as kit actors.** `Sky`, `Scatter`, `ParticleField` (3D fields through phase 1's record) and `AmbientSound`. `world.sky`, `scatter`, `particles` and `ambience` leave the schema, the Look panel keeps only the cycle, `edit_look` drops `addParticles`, the docs follow; format bump and scripted migration of every shipped scene.
*Done when:* before-and-after screenshots on the GPU browser match for Ember Valley, Hedgerow Court, Salvage Run, the yard and the lot; a 3D field placed through `edit_scene` draws.

**6. Nothing implicit.** `killPlane`, `fall` and `gravityBind` leave the schema; the platformer, the workshop, the first-game demo and the 2D template place a pit `Trigger` with a rule; the playground and the input demo get their gravity actor (phase 1's counters access); format bump and migration.
*Done when:* falling off each of those levels ends the game as before in a headless run, and a 3D level can lose its player the same way.

**7. Path strips and spawn points.** `PathStrip` in the kit: a sprite strip in 2D, in 3D a textured mesh built along the path at load (first item of the phase if `mesh` does not yet take code-built geometry), with `width` and `repeat` — the lot's kerbs and fences to come. `SpawnPoint` in core (the server reads it): a marker actor; a join spawns the `world.player` prefab at a free one, and Cinder Keep's literal spawn goes.
*Done when:* the lot's kerbs are strips on its paths; two clients join the keep at different spawn points with no spawn code in the match module.

**8. Culling, validation, volumes, caching.** Entities outside the view issue no draws, through `Camera.isVisible`, at every aspect mode and resolution; tile cells validated against their sheet once the image is known; music and effects volumes as cvars with settings rows, persisted like the display settings; sprite sheets kept across scenes. Independent of everything above, so last.
*Done when:* the showcase reports the saved draws and a test pins an off-screen entity to zero draws; a bad cell is refused with its layer and index; volumes survive a reload; re-entering a level decodes no image twice.

## Backlog

- `Chase`, `Hover`, `ContactDamage` and `Grabbable` read x and y only. They gain the third axis when a 3D game attaches them; the new pieces above are dimension-neutral from the start.

## Record

- Core seams, 17 Nov 2026: the registries record each name's origin (engine, kit, the game) and the editor's catalog, its Components chips and `list_components` read the registries and the engine's own `BUILTIN_*` maps instead of a hardcoded class list; `Health.whenDead`; `entity.particles` collected into the 3D frame as lights are; `PathFollow.face`, proven by Night Circuit's traffic cars dropping their heading code; `prefabs.*.physics.mass` (the physics layer took a `mass` spec all along — `materialSpec` was discarding it, which only the new scene-level test caught); `entity.scene`. Every seam's test was broken on purpose and watched fail.
- The kit stands, 17 Nov 2026: `packages/kit` (`m2d-kit`, TypeScript, the engine a peer, one entry per piece, a test that loads every entry in plain Node so a DOM touch at load fails it, `docs/reference/kit.md`). The examples' shared folder is gone: the combat effects (`registerEffects` marks them the kit's), the seeded random, texture tiling and the Audio settings row moved in, and the showcase's two tracks moved into its own folder. Every example registers and imports from the kit.

Related: [[idiomatic-m2d]] (the shape this project holds the engine to), [[editor]] (the Look panel, catalog and MCP tools that change), [[networking]] (spawn points), [[3d]] (path strips are its kerbs and fences), [[working-style]] (phases as layers)
