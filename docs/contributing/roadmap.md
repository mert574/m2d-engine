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
| The editor, with MCP as an equal client: author, play and ship any m2d game. Current: every example and docs demo on idiomatic m2d | `projects/editor` |
| Networking: 3D online, then datagrams | `projects/networking` |
| 3D places: terrain, decals, water, atmosphere | `projects/3d` |
| An asset library of open materials and models | `projects/3d` |

## Next

- **Visibility culling**: off-screen entities issue no draws, at every aspect mode and resolution.
- **Tile layers**: indices validated against the sheet; batched draws.
- **Gamepad**: a fourth input source alongside named actions.
- **Web Audio mixing**: master, music and effects gains, persisted volumes.
- **Extension guide**: adding an actor, a constraint, a scene and a renderer backend from a fresh checkout.

## Perspectives

| Perspective | Status |
| --- | --- |
| Side view, top-down, 3/4 oblique, isometric, belt scroller, auto-scroller, rotating top-down, single-screen rooms, 2.5D parallax | Shipped, each with a demo |
| Point-and-click adventure: walk-behind layers, depth scaling, polygon pathfinding | Later |
| Mode 7 pseudo-3D: a ground-plane shader | Stretch |

## Later

- **Types**: `checkJs` over the JSDoc, or the engine in TypeScript. The toolchain is in (`npm run typecheck`).
- Sprite sheets cached across scenes.
- Lockstep or rollback networking.
