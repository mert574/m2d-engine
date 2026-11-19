# Editor

Goal: a Godot-like editor in which every m2d game is built, played and shipped, with MCP as an equal client. Roadmap line: "The editor".

## Decisions

- MCP is an equal client ([[working-style]]); the editor must reach everything [[idiomatic-m2d]] puts in scene data.
- A project is a plain folder with `m2d.project.json`, owned by the host ([[editor-host]]). DOM for the chrome, the engine canvas for viewports. Documents and their history live in the host.
- **A project-file field the simulation reads reaches four games**: the page's (`projectOptions` in `bootProject`), the host's validator (`Project.config` in `serve.ts`), and the editor app's viewport (`projectGameOptions`) and in-browser validator (`buildValidator`). Each gets a test. `layers` reached only the page for a day and Salvage Run would not open in the editor, hidden by a cast in the host (18 Nov 2026).
- **The host serves and builds any project against the workspace's `m2d-engine` and `m2d-kit`** (`engineAlias` in `build.ts`), so a fresh project from a template, with nothing installed, loads. A new package the templates import joins the aliases.

## Active

Nothing at the moment; the next piece comes from the backlog.

## Backlog

Each item ships with MCP support. Reviewed against the code on 17 Nov 2026; the engine-side items it held moved to [[engine-surface]].

- Test harness suites for scatter, tile paint, the animation editor and composition (today: lot, platformer, paths, circuit road, playtest, look)
- A look for the 2D prefab stage's floor
- Presence: who has what open and selected, over the host's one history
- Terrain brushes, once terrain exists ([[3d]])
- Export targets: an itch zip, a PWA manifest
- Hosting a match from the editor on `m2d-server`, and a replica inspector
- **3D play can crash rapier3d at boot** (`RuntimeError: unreachable` / `memory access out of bounds` from the wasm, page errors at play start; the sim then ticks 0 steps or limps). Reproduced on the shipped yard as on new scenes, 19 Nov 2026, driving the editor headless on this machine; the same scenes play clean when a plain engine page boots them, so it is the editor's play path (likely the old viewport game's teardown racing the new game). Pre-existing — pathfinding's court demo only made it visible

## Record

The phase plans that built it, kept as written: [[editor-e0]] (enablement), [[editor-host]], [[editor-e1]] (viewer), [[editor-e2]] (edit and save), [[editor-e3-e5]] (assets, play, build), [[editor-e6-e9]] (structure, selection), [[editor-e7b-e8-e9]] (props, 2D authoring, UI scenes). After them: thumbnails, paths, the Look tab, playtests, search and audit, view helpers, the GUI harness and MCP screenshots (Nov 2026). Then [[idiomatic-examples]] (13 to 16 Nov 2026): every example and docs demo on idiomatic m2d, and the engine features that took — project boot, named actions, choices, the UI scene and HUD elements, rules and counters, camera controls, ambience, 2D backdrops and particles.
