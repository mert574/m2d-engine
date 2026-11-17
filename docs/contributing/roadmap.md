# Roadmap

The big picture, one line per item. Each large item's plan, backlog and record live in its project under `knowledge-base/projects/` in the repository; shipped behaviour is documented on its page here.

## Done

- **Renderer**: batched WebGL2 with a Canvas 2D fallback; WebGPU 3D with PBR, shadows, clustered lights, glTF, post and particles.
- **Core**: scenes, entities, constraints, camera, input, the fixed tick and the [determinism contract](./determinism).
- **UI**: themed element tree, layout, focus, the screen stack, motion, the console.
- **Perspectives**: every view in the table below marked shipped.
- **Networking, 2D**: headless simulation, the authoritative `m2d-server`, intents, replication, prediction, interpolation, interest.

## Underway

| Item | Project |
| --- | --- |
| The editor, with MCP as an equal client: author, play and ship any m2d game. Every example and docs demo is on idiomatic m2d (Nov 2026); next from the project's backlog | `projects/editor` |
| Networking: 3D online, then datagrams | `projects/networking` |
| 3D places: terrain, decals, water, reflections, GPU particles, atmosphere | `projects/3d` |
| An asset library of open materials and models | `projects/3d` |
| Engine surface: a lean core and the `m2d-kit` package of ready-to-use actors, constraints and prefabs; culling, volumes, path strips, spawn points | `projects/engine-surface` |

## Next

Scoped 17 Nov 2026; each item's project under `knowledge-base/projects/` holds its decisions and its investigation.

| Item | Shape | Before it starts |
| --- | --- | --- |
| **Pathfinding**: one navigation API for the player and NPCs over a navmesh baked in the editor from static colliders and authored nav areas (walkable, blocked, costly), per agent size, in 2D and 3D alike, on recast-navigation-js (Recast and Detour, WebAssembly); click-to-move within a path budget, then crowd avoidance and dynamic obstacles | Core system; the baked mesh is a scene asset | None: the comparison and proof of concept are done (`projects/pathfinding`). Nav areas are declared as collision layers are |
| **NPC AI**: a behaviour constraint over `Chase`, `PathFollow` and `Attack` with patrol, alert, telegraph, attack and recover states, sight by a physics raycast against the project's layers, hearing by world events; Ash Row, Hollow Grove and Cinder Keep adopt it | Constraint; its state is plain fields, so snapshots and replication carry it | Pathfinding, so a hunt goes around a wall; the third axis on `Chase` and friends for 3D |
| **Scripting**: attach a script as Unity and Godot do — double-click an object or an event in the editor and it writes the module, the class with `static params` and the empty handlers (`onTouch`, `onDeath`, `onInteract`), and wires it into the scene; hot reload in play. Plain JavaScript modules of the project, no sandbox: the server runs only the game's own code. Visual rules graph later | Editor tooling and the loader resolving scene-referenced scripts on the page, the editor and the server | Engine surface finished, so the API scripts call is stable |
| **3D surfaces**: screen-space and planar reflections, water with buoyancy, drag and swimming volumes (simulation, headless), decals and simulated GPU particles, on the renderer's existing normal, depth and velocity targets and compute passes. Fluid simulation stays out | `projects/3d` is the home | Terrain first. Our own code throughout, porting permissive shaders (Bevy, AMD, MIT FFT oceans); GPU screenshot checks in the harness for each |
| **Temporal upscaling**: render below the output size and upscale with the FSR 3 series, vendoring `@pmndrs/upscaler`'s WGSL passes (MIT) in place of the TAA stage. No frame generation: the browser gives no present-timing control | `projects/upscaling` | None |
| **Asset caching**: every asset under a content-hashed URL from the manifest, and a service worker serving them cache-first from Cache Storage, pruned when a build stops naming them | `projects/asset-caching` | None |
| **Asset import**: 3D models into glTF for the existing compiler (obj2gltf, assimp through WebAssembly, Blender when installed), and 2D art from Aseprite, PSD and packer JSON | `projects/asset-import` | Decide grid repacking or per-frame rectangles for sprite sheets |
| **iOS**: on the latest iPhone the main menu draws and every game is black, on every renderer | To be named by the investigation | Investigation |
| **Drop the Canvas 2D backend**: WebGL2 is the 2D floor; the capability flags that only Canvas lacks go with it | `projects/canvas-removal` | None |

## Perspectives

| Perspective | Status |
| --- | --- |
| Side view, top-down, 3/4 oblique, isometric, belt scroller, auto-scroller, rotating top-down, single-screen rooms, 2.5D parallax | Shipped, each with a demo |
| Point-and-click adventure: walk-behind layers, depth scaling, a navmesh (see Pathfinding under Next) | Later |
| Mode 7 pseudo-3D | Dropped: a flat ground in a 3D scene is the real thing |

## Later

- **Types**: `checkJs` over the JSDoc, or the engine in TypeScript. The toolchain is in (`npm run typecheck`).
- Lockstep or rollback networking, on `game.snapshot()`, Rapier's deterministic build and a deterministic math module.
- Renaming the package: the name, the npm listing and the README still say 2D.
