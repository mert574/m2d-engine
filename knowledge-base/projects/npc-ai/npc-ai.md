# NPC AI

Goal: enemies and characters that patrol, notice, warn and strike, as data the editor edits. Roadmap line: "NPC AI".

## Decisions

- **A behaviour constraint over `Chase`, `PathFollow` and `Attack`**, with states patrol, alert, telegraph, attack, recover and return. Its state is plain fields, so snapshots and replication carry it with no code ([[networking]]).
- **Sight is a physics raycast** (`physics.raycast`, both backends) against the project's collision layers, inside a view cone, sensed on an interval rather than every tick. **Hearing is world events.**
- **Ash Row's windup, Hollow Grove's walkers and Cinder Keep's goblins adopt it**, replacing their hand-rolled versions.
- Starts after [[pathfinding]]: a hunt has to go around a wall.

## Plan

To be written when [[pathfinding]] phase 3 lands. Open at that point: kit or core ([[engine-surface]]'s test), and the third axis on `Chase`, `Hover`, `ContactDamage` and `Grabbable` for 3D.

## Backlog

- Alert spreading between NPCs; a debug overlay of the cone, the state and the path.

## Record

Related: [[pathfinding]], [[engine-surface]]
