# Scripting

Goal: write game logic, not wiring. Roadmap line: "Scripting".

## Decisions

Agreed with the owner on 17 Nov 2026.

- **Attach a script, as Unity and Godot do.** Double-click an object or an event in the editor: it writes the module (the class, its `static params`, empty handlers such as `onTouch`, `onDeath`, `onInteract`), wires it into the scene, and play hot-reloads it. MCP does the same.
- **Plain JavaScript modules of the project, no sandbox.** The server runs only the game's own code, and clients trust the server after the connection handshake.
- **Scripts are actors and constraints.** `static params` already put a class in the inspector, the tree and MCP; what is missing is the generated boilerplate, the event handlers and the loader resolving a scene's scripts on the page, in the editor and on the server.
- **Scripts follow the [determinism contract](../../../docs/contributing/determinism.md)** and keep state as fields, so snapshots carry it.
- Visual scripting later, as a rules graph compiling to the same modules.
- Starts when [[engine-surface]] is finished, so the API scripts call is stable.

## Plan

To be written when [[engine-surface]] finishes.

## Backlog

## Record

Related: [[engine-surface]], [[editor]], [[idiomatic-m2d]]
