# Editor

Goal: a Godot-like editor in which every m2d game is built, played and shipped, with MCP as an equal client. Roadmap line: "The editor".

## Decisions

- MCP is an equal client ([[working-style]]); the editor must reach everything [[idiomatic-m2d]] puts in scene data.
- A project is a plain folder with `m2d.project.json`, owned by the host ([[editor-host]]). DOM for the chrome, the engine canvas for viewports. Documents and their history live in the host.

## Active

- [[idiomatic-examples]]: every example and docs demo moved onto idiomatic m2d

## Backlog

Each item ships with MCP support.

- Test harness suites for scatter, tile paint, the animation editor and composition
- A sprite floor for the 2D prefab stage; prefab variants and inheritance; prefab cards in the component library
- Road strips along paths; following a path's tangent
- A curve per value across the day/night cycle
- A scene retune applying after an actor constructor's own retune
- Prefab `mass`; spawn points for online joins
- Presence: who has what open and selected
- Terrain brushes
- Export targets: an itch zip, a PWA manifest
- Hosting a session and a replica inspector, after headless server mode

## Record

The phase plans that built it, kept as written: [[editor-e0]] (enablement), [[editor-host]], [[editor-e1]] (viewer), [[editor-e2]] (edit and save), [[editor-e3-e5]] (assets, play, build), [[editor-e6-e9]] (structure, selection), [[editor-e7b-e8-e9]] (props, 2D authoring, UI scenes). After them: thumbnails, paths, the Look tab, playtests, search and audit, view helpers, the GUI harness and MCP screenshots (Nov 2026).
