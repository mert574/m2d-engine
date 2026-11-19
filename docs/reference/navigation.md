# Navigation

One navigation API for the player and NPCs, over a navmesh baked in the editor: `game.nav.findPath` answers with a viable route around the level's static colliders, in 2D and 3D alike, in the browser and headless on a server — the mesh is Recast and Detour through WebAssembly, so the path is the same bits everywhere.

## Declaring agents and areas

The project declares who navigates and what the ground can be, in `m2d.project.json`:

```json
{
  "navAgents": {
    "goblin": { "radius": 12 },
    "ogre": { "radius": 28, "height": 120, "step": 8, "slope": 40 }
  },
  "navAreas": {
    "mud": { "cost": 4 }
  }
}
```

- **`navAgents`** — agent profiles by name. `radius` (world units: px in 2D, metres in 3D) is required and keeps paths that far off the walls; `height` is the gap the agent fits through (four radii when unset), `step` the tallest ledge it walks up (half a radius), `slope` the steepest ground in degrees (45). Each scene that navigates gets one baked mesh per profile.
- **`navAreas`** — named ground kinds with a traversal cost: a metre of `mud` above costs four of plain ground, so a path crosses it only when the detour would cost more. `walkable` and `blocked` are the engine's own and are not declared.

An area is painted over the ground with the **`NavVolume`** actor: a tool box (violet in the editor, and under `r_showtools`) whose `area` property names a declared area, or `blocked` to keep the ground under it out of the mesh entirely — a flowerbed nothing walks through, an abyss the collider does not express. It stands on layer `none` and stops nothing at runtime; it is data for the bake.

## Baking

The mesh is baked in the editor — the scene's context menu's **Bake navmesh**, or the `bake_navmesh` MCP tool — from the level's static colliders and nav volumes, one run per declared agent. Each bake writes a `.navmesh` binary beside the scene and records it in the scene's assets, as one step of undo:

```json
"assets": {
  "navmeshes": {
    "goblin": { "url": "scenes/keep.goblin.navmesh", "stamp": "a1b2c3d4e5f60708" }
  }
}
```

The `stamp` is a hash of everything the bake saw: the static collider boxes, the nav volumes and their costs, the agent profile and the bake format. At load the engine recomputes it from the built level, so a mesh that no longer matches its level is **reported, not trusted**: a missing or stale bake warns on the console and lands in `game.nav.issues`, and the level plays on while you bake again.

A 2D level needs `world.width` and `world.height`: that rectangle is the floor the mesh is baked over, with every static collider standing on it as a wall. A 3D level's floors and walls are its static bodies as they are. A model prop with a `bounds` collider gets the model's measured bounds written into its asset entry by the bake (`assets.models.<key>.bounds`), so a headless game — the bake itself, a server — builds the same collider the browser does.

## Querying

```js
const route = game.nav.findPath(from, to, { agent: 'goblin', maxLength: 900 });
if (route) move(route.points); // [{x, y}, ...] in 2D; [{x, y, z}, ...] in 3D
```

`findPath` returns `{ points, length }` — the straightened path, weighed by the areas' costs — or `null`: the goal is off the mesh, unreachable, or the path is longer than `maxLength`. With one declared agent the `agent` option may be left out. `game.nav.nearestPoint(point)` snaps a point (a click beside a wall) onto the mesh, or answers `null` when nothing walkable is near. Queries are stateless reads of the baked mesh: they are deterministic, cost well under a millisecond, and belong in `fixedUpdate` like any other simulation read.

## Click to move

[`PointerMove`](./constraints#pointermove) routes over the mesh by itself when one is loaded: give it the `agent` to route as and, if the game wants one, a `maxPathLength` budget. A click behind a wall walks around it; a click on a wall, into a sealed room, or past the budget moves nothing. Online this runs on the server, which reads the same baked file from disk — the match's `game` options carry `basePath` and the project's `navAgents`, as Cinder Keep's match does.

## Agents that hunt

[`Chase`](./constraints#chase) routes the same way: give it the `agent`, and a mob's hunt goes around the walls, re-asking every `repath` seconds while the player moves; with `separation` set, a pack spreads around its target instead of stacking. All of its working state — the route's corners, the repath clock — is plain fields, so snapshots and replication carry a hunt mid-detour. Cinder Keep's skeletons and goblins hunt this way, online too.

## Dynamic obstacles

A profile with `"dynamic": true` is baked as a Detour **tile cache** instead of a solo mesh: the [`NavObstacle`](./constraints#navobstacle) constraint (or `game.nav.addObstacle`) then cuts the mesh around a moving body, tile by tile, and the cut heals when it moves on. The obstacle list is simulation state (`trackState`), so a snapshot restore converges the mesh to exactly what it rewinds to; the wasm side is always derived. Two refusals keep it honest: an obstacle on a scene with no dynamic mesh is reported once and ignored, and a dynamic bake over a *costly* nav area is refused at bake — the tile pipeline cannot mark areas, though `blocked` volumes are geometry and work as ever. Flipping `dynamic` changes the stamp, so every older bake reports stale until baked again.

A route already being walked can go stale when an obstacle rolls onto it. `game.nav.routeBlocked(points)` is the cheap test for that — the remaining corners (the walker's position first) clipped against the tracked boxes, no query into the wasm — and the built-in walkers use it: `PointerMove`, `Chase` and the kit's behaviour check their remaining route a few times a second and re-plan only when a segment actually crosses a box, so a cart rolling onto the line turns the walk long before anything presses against it, and a destination the cut has sealed off stops it.

## Seeing it

The editor always draws the baked polygons over the ground, so a bad bake is visible and fixable; in play the `r_shownav` cvar does — one colour per agent, translucent fills in 2D, a floating translucent surface in 3D. A hole where a doorway should be means the gap is narrower than twice the agent's radius; a missing room means its only entrance did not survive erosion. With `r_debug` on, a `PointerMove` walk draws its click — the route ahead and a ring on the destination — and a `Chase` its route, in 2D and 3D alike.

The Yard's **Court** scene is the 3D demonstration, authored entirely through the editor's tools: a walled court of primitives, a `blocked` pond, a patrolling cart cutting the mesh as it moves (`NavObstacle` on a dynamic agent), and a capsule that click-walks around it all. Open it in the editor to see the mesh, play it with `r_shownav` and `r_debug` to watch the cuts and the routes.
