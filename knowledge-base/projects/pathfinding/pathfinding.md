# Pathfinding

Goal: the player and NPCs reach a destination by a viable route, in 2D and 3D, on the server as in the browser. Roadmap line: "Pathfinding".

## Decisions

Agreed with the owner on 17 Nov 2026.

- **A navmesh, as Unreal, Unity and Godot do.** Baked from static colliders per agent size (radius, height, step, slope); A* over polygons, then a funnel pass for the straight line. Grids are an RTS and strict-tile niche the navmesh covers anyway.
- **recast-navigation-js (Recast and Detour through WebAssembly)**, picked by the comparison in the record: the only candidate that bakes from geometry with an agent radius, has a crowd and dynamic obstacles today, and gives bit-identical paths in Node, Chromium and Firefox. 2D levels are flat 3D to it: the floor cells as quads, the static colliders as boxes.
- **Baked in the editor, saved as a scene asset**, shown in the viewport so a bad bake is visible and fixable.
- **Nav areas are declared like collision layers**: a project list (walkable, blocked, costly with a cost), painted as tile cells or placed as volumes.
- **One `findPath` for the player and NPCs.** Only the consumer differs: `PointerMove` routes and refuses a path over its length budget; an NPC steers along its path with avoidance.
- Comes before [[npc-ai]], which stands on it.

Architecture, 18 Nov 2026:

- **Detour for paths, JavaScript for agents.** DetourCrowd's state lives in the WebAssembly heap, which `game.snapshot()`, the `Predictor` and replication cannot carry. Path queries stay in the wasm (stateless, deterministic); agent movement and avoidance are constraints whose state is plain fields; dynamic obstacles go through Detour's tile cache but are driven from a tracked obstacle list, re-applied on restore, so the wasm mesh stays a derived structure.
- **Agent profiles are the project's**, as nav areas are: `navAgents`, named `{radius, height, step, slope}` records; one baked mesh per profile, per scene.
- **A bake stamp makes staleness visible**: the asset record carries a hash of the bake inputs (the static collider spec from the scene JSON, the nav areas, the agent profile, the recast version); the engine recomputes it from the scene at load and reports a missing or stale bake by name.
- **Two seams come first**: model bounds recorded in the asset manifest at import (headless scenes skip `bounds` colliders today, so a headless bake or server would miss those walls), and a binary asset load path that works in Node (its `fetch` cannot read files), which the server's match worker shares.
- The wasm loads as Rapier does — dynamic import, so a game without a navmesh never fetches it — and `game.nav` frees its meshes on scene unload (wasm memory is manual).

## Plan

**0. Comparison and proof of concept.** Survey the popular JavaScript and WebAssembly navmesh and pathfinding libraries; shortlist by licence, maintenance, 2D and 3D support and Node support; bake Cinder Keep's walls and the lot with the shortlist and query them in Chromium and headless Node.
*Done when:* a comparison table (determinism across browser, Node and repeat runs, bake time, query cost, size, licence, maintenance) and a pick are recorded here.

**1. Bake and query.** Nav areas in `m2d.project.json`, the bake in the editor and through MCP, the mesh as a scene asset, `game.nav.findPath(from, to, agent)` in core, a debug overlay.
*Done when:* a scene with a stale or missing bake is reported at load; the headless path test is green.

**2. Click to move.** `PointerMove` routes over the mesh within `maxPathLength`; Cinder Keep uses it.
*Done when:* clicking behind a wall walks around it; an unreachable or too-long click does nothing.

**3. Agents.** Path following with steering for NPCs, `Chase` routing when the straight line is blocked, crowd avoidance, moving obstacles cutting the mesh by tile, all in `fixedUpdate` and in the snapshot.
*Done when:* a crowd of keep goblins reaches the player around walls without stacking, online too.

## Backlog

- Off-mesh links (a jump, a ladder, a door).
- A navmesh over terrain, once terrain exists ([[3d]]).

## Record

- Click to move, 18 Nov 2026: `PointerMove` routes over the loaded navmesh by itself — `agent` names the profile, `maxPathLength` is the budget — and follows the route's corners as plain fields (`path`, `waypoint`), so a snapshot carries a walk mid-route; with no mesh it walks the straight line it always did. `findPath` grew strict about the goal: it must lie on the mesh within the agent's radius (a click on a wall is refused, not walked to the wall's foot), and a partial route is no route. Cinder Keep adopted it: the project declares the `knight` agent (radius 14), the keep is baked (2,012 polys, `scenes/keep.knight.navmesh`), the knight's walk routes with a 1500 px budget, and the match's `game` options carry `basePath` (a `file:` URL of the keep's folder) and the project's nav declarations, so the server routes from the same file — the pattern any match that navigates needs. Proven headless with the real keep (`examples/test/keepNav.test.js`): a click in the chamber behind the north wall walks around through the corridor and never stands inside a wall block; a click on a wall and a click past the budget move nothing. `m2d.project.json` declares `navAgents` (profiles: radius, height, step, slope; one baked mesh per profile per scene) and `navAreas` (named costs; `walkable` and `blocked` are the engine's own), reaching all four project-field consumers; `NavVolume` paints an area as a tool box on layer `none`. The bake (`core/nav/navBake.js`, upstream's solo pipeline plus `markBoxArea` for costly volumes, which upstream has no hook for) walks the built level's static bodies (`core/nav/navGeometry.js` — a 2D level is its world rectangle as the floor with every collider as a wall; blocked volumes become walls so erosion respects the radius), writes a `.navmesh` Detour binary beside the scene and records `assets.navmeshes.<agent> = { url, stamp }` as one undo step, through the editor's Bake navmesh and the `bake_navmesh` MCP tool alike. The stamp (FNV-1a over geometry, agent, areas, bake format) is recomputed from the built level at load; a missing, stale or undeclared mesh warns and lands in `game.nav.issues`, and the level plays on. `game.nav.findPath(from, to, { agent, maxLength })` funnels, weighs area costs, refuses a partial path and a budget overrun; `nearestPoint` snaps a click. The wasm loads only when a scene carries a mesh, and the mesh is freed on unload. `r_shownav` draws the polygons per agent (worldOverlay in 2D, a translucent lifted surface in 3D). The two seams: model asset entries carry `bounds` (written by the bake with gltf-transform; declared bounds win over the file's so browser and headless build identical colliders, which the stamp hashes) — this also gives a server the lot's prop walls it was missing; and `core/nav/fetchBinary.js` reads binaries from disk in Node where `fetch` cannot. Proven headless end to end in Node, 2D and 3D (`test/nav.test.js`, `test/nav3d.test.js`, the host's `nav.test.ts`): bake → write → load as asset → no issues → path routes through the one gap; identical bytes and stamp on a second bake; identical paths on a second query. Engine 1.10.0. Surveyed the JavaScript and WebAssembly navigation libraries. Grid-only (`pathfinding`, `easystarjs`), graph-only (`ngraph.path`) and bake-less (`three-pathfinding`, `yuka`) ones are out; Babylon's `recast-detour` is superseded by its own plugin wrapping recast-navigation-js; the Rust navmesh crates (`polyanya`, `landmass`, `navmesh-rs`) have no JavaScript bindings. Three were baked and queried on Cinder Keep (590 wall boxes over 1,494 floor cells, at 32 px to the metre) and the lot (1,878 static boxes; model props' own bounds left out), 60 seeded queries each, in Node 22, headless Chromium and Firefox:

| Library | Keep bake | Lot bake | Query | Paths found | Mesh | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| recast-navigation-js 0.44 (Recast/Detour, WebAssembly, MIT; 111k weekly downloads) | 1.3 s | 0.8 s | 0.07 to 0.13 ms | 60/60 both | 165 KB binary export, 1,076 polys | Bake, agent radius, funnel, DetourCrowd, tile cache, off-mesh links. ~1 MB payload with the WebAssembly inlined, so `init()` works in Node unchanged |
| navcat 0.4 (same author, pure JavaScript, MIT; 10k weekly) | 3.3 s | 3.2 s | 0.3 to 0.6 ms | lot 60/60; keep 38 of 60 reported `success` but ended far from the goal (partial paths: its bake left the keep fragmented where Recast's did not, with the same parameters) | 1 MB JSON, 1,547 polys | JSON-serialisable mesh, crowd in `navcat/blocks`, tiled rebuilds. API at 0.x |
| navmesh 2.3 + navmesh-generator 1.0 (2D, MIT) | 0.06 s | — | 0.04 ms | 21/60: its polygons cover only part of the floor | 13 KB, 157 polys | Unmaintained since 2021; no agent radius or crowd. Unfit beyond a baseline |

Determinism: every library gave bit-identical paths across two Node processes, twice in one process, headless Chromium (V8) and Firefox (SpiderMonkey); WebKit could not launch on this machine without system libraries. **Pick: recast-navigation-js.** It is the only one that bakes the keep whole, and the only one with crowd and dynamic obstacles today; its WebAssembly also makes the cross-engine match a property of the binary rather than of each browser's `Math`. navcat is worth re-checking when it reaches 1.0, for the JSON mesh and the smaller payload. The harness, geometry extraction and bundle live outside the repository (a scratch folder) and are rebuilt from the scenes when phase 1 needs them.

Related: [[npc-ai]], [[engine-surface]] (core or kit), [[networking]] (headless parity), [[editor]] (the bake)
