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

- Comparison and proof of concept, 17 Nov 2026. Surveyed the JavaScript and WebAssembly navigation libraries. Grid-only (`pathfinding`, `easystarjs`), graph-only (`ngraph.path`) and bake-less (`three-pathfinding`, `yuka`) ones are out; Babylon's `recast-detour` is superseded by its own plugin wrapping recast-navigation-js; the Rust navmesh crates (`polyanya`, `landmass`, `navmesh-rs`) have no JavaScript bindings. Three were baked and queried on Cinder Keep (590 wall boxes over 1,494 floor cells, at 32 px to the metre) and the lot (1,878 static boxes; model props' own bounds left out), 60 seeded queries each, in Node 22, headless Chromium and Firefox:

| Library | Keep bake | Lot bake | Query | Paths found | Mesh | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| recast-navigation-js 0.44 (Recast/Detour, WebAssembly, MIT; 111k weekly downloads) | 1.3 s | 0.8 s | 0.07 to 0.13 ms | 60/60 both | 165 KB binary export, 1,076 polys | Bake, agent radius, funnel, DetourCrowd, tile cache, off-mesh links. ~1 MB payload with the WebAssembly inlined, so `init()` works in Node unchanged |
| navcat 0.4 (same author, pure JavaScript, MIT; 10k weekly) | 3.3 s | 3.2 s | 0.3 to 0.6 ms | lot 60/60; keep 38 of 60 reported `success` but ended far from the goal (partial paths: its bake left the keep fragmented where Recast's did not, with the same parameters) | 1 MB JSON, 1,547 polys | JSON-serialisable mesh, crowd in `navcat/blocks`, tiled rebuilds. API at 0.x |
| navmesh 2.3 + navmesh-generator 1.0 (2D, MIT) | 0.06 s | — | 0.04 ms | 21/60: its polygons cover only part of the floor | 13 KB, 157 polys | Unmaintained since 2021; no agent radius or crowd. Unfit beyond a baseline |

Determinism: every library gave bit-identical paths across two Node processes, twice in one process, headless Chromium (V8) and Firefox (SpiderMonkey); WebKit could not launch on this machine without system libraries. **Pick: recast-navigation-js.** It is the only one that bakes the keep whole, and the only one with crowd and dynamic obstacles today; its WebAssembly also makes the cross-engine match a property of the binary rather than of each browser's `Math`. navcat is worth re-checking when it reaches 1.0, for the JSON mesh and the smaller payload. The harness, geometry extraction and bundle live outside the repository (a scratch folder) and are rebuilt from the scenes when phase 1 needs them.

Related: [[npc-ai]], [[engine-surface]] (core or kit), [[networking]] (headless parity), [[editor]] (the bake)
