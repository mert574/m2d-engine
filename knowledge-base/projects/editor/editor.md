# Editor

Goal: a Godot-like editor in which every m2d game is built, played and shipped, with MCP as an equal client. Roadmap line: "The editor".

## Decisions

- MCP is an equal client ([[working-style]]); the editor must reach everything [[idiomatic-m2d]] puts in scene data.
- A project is a plain folder with `m2d.project.json`, owned by the host ([[editor-host]]). DOM for the chrome, the engine canvas for viewports. Documents and their history live in the host.

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

## Record

The phase plans that built it, kept as written: [[editor-e0]] (enablement), [[editor-host]], [[editor-e1]] (viewer), [[editor-e2]] (edit and save), [[editor-e3-e5]] (assets, play, build), [[editor-e6-e9]] (structure, selection), [[editor-e7b-e8-e9]] (props, 2D authoring, UI scenes). After them: thumbnails, paths, the Look tab, playtests, search and audit, view helpers, the GUI harness and MCP screenshots (Nov 2026). Then [[idiomatic-examples]] (13 to 16 Nov 2026): every example and docs demo on idiomatic m2d, and the engine features that took — project boot, named actions, choices, the UI scene and HUD elements, rules and counters, camera controls, ambience, 2D backdrops and particles.
