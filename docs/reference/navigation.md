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

## Seeing it

The `r_shownav` cvar draws the baked polygons over the ground, one colour per agent — translucent fills in 2D, a floating translucent surface in 3D. A hole where a doorway should be means the gap is narrower than twice the agent's radius; a missing room means its only entrance did not survive erosion.
