# NPC AI

Goal: enemies and characters that patrol, notice, warn and strike, as data the editor edits. Roadmap line: "NPC AI".

## Decisions

- **A behaviour constraint over `Chase`, `PathFollow` and `Attack`**, with states patrol, alert, telegraph, attack, recover and return. Its state is plain fields, so snapshots and replication carry it with no code ([[networking]]).
- **Sight is a physics raycast** (`physics.raycast`, both backends) against the project's collision layers, inside a view cone, sensed on an interval rather than every tick. **Hearing is world events.**
- **Ash Row's windup, Hollow Grove's walkers and Cinder Keep's goblins adopt it**, replacing their hand-rolled versions.
- Starts after [[pathfinding]]: a hunt has to go around a wall. Landed 19 Nov 2026; `Chase` already routes over the mesh with `agent`, `repath` and `separation`.
- **Hearing needs a simulation-side event read.** `game.events` delivers after the tick, for presentation, and a replica never emits — so `on()`/`onWorldEvent` cannot feed a deterministic behaviour. The seam: the simulation reads the tick's events with their data (`at`, source) inside `fixedUpdate`, the way `rules.js` reads `events.since` today but carrying the payload, counted state in the snapshot.
- **The telegraph is `Attack`'s.** Ash Row hand-rolls windup timers and a shrinking ring around `startAttack`; `Attack` gains a declared windup (frames, replicated like its other swing fields) so the telegraph renders on clients and every adopter drops its timer code.
- **The behaviour is a kit constraint** (`m2d-kit`; confirmed by the owner, 19 Nov 2026): nothing in core names it, three games and the kit's `Ghost` want it ([[engine-surface]]'s test). The sensing and hearing seams it stands on are core. It drives `Chase`, `PathFollow` and `Attack` through `suspended` and keeps their slot names (`chase`'s separation finds peers by slot).
- **Industry check (19 Nov 2026):** a small FSM is the right size at six states — behaviour trees pay off past that, and hybrids put utility scoring *inside* a combat state, which `telegraph`/`attack`/`recover` doesn't need. Perception conventions adopted: detection on the first valid sighting, loss of sight smoothed briefly; a remembered last-seen position (plain fields) is what alert investigates; hearing is a position to investigate, not a target.

## Plan

**1. Core seams.** Sight: a sensing helper — view cone (`Angle.inArc`) plus `physics.raycast` line of sight against declared blocking layers, run on a deterministic interval, both backends, 2D and 3D (the third axis on `Chase` is already there via the navmesh; verify a 3D sense). Hearing: the simulation-side event read above; `Health`'s `damage` and footsteps' `step` already carry `at`. `Attack` gains the declared windup. Each seam its own test that fails without it.
*Done when:* a headless test senses through a gap and not through a wall, hears a tick's event inside `fixedUpdate` deterministically, and an `Attack` windup is visible in the replicated fields.

**2. The behaviour constraint.** The kit's `Behavior`: states patrol, alert, telegraph, attack, recover, return as plain fields (`state`, state timer, `lastSeen`), params for the patrol (a path ref or a wander radius), the cone, hearing, leash and attack cadence; it suspends and resumes `Chase`/`PathFollow`/`Attack` and never moves the body itself. Snapshot restore and a server match carry a mid-telegraph NPC; invariants (who owns `suspended`, what replicates, what happens with no navmesh) written down with one test each before it ships.
*Done when:* a fixture NPC patrols, spots through a cone, hunts around a wall, telegraphs, strikes, recovers and walks home, headless and on a real `m2d-server`, and a restore mid-state resumes identically.

**3. Adoption.** Ash Row's thugs drop the windup timers, Hollow Grove's wisps keep the ward-repelled flight as a param or a seam, Cinder Keep's goblins gain the full ladder over their navmesh; the kit `Ghost` offers the behaviour; each game's headless playthrough stays green and the hand-rolled versions are deleted.
*Done when:* no example carries ad-hoc AI state timers; the keep pack test passes with the behaviour, online too; a 3D NPC proves the behaviour in The Court (the yard's navmesh scene, owner, 19 Nov 2026) — patrol, spot, hunt, strike in three dimensions.

**4. Debug overlay.** The cone, the current state, the last-seen point and the route drawn under `r_debug`, in 2D (worldOverlay) and 3D (`static draws3D`), probed by removing the pass; editor and MCP already show the params from `static params` — verify with `list_components` and `validate_scene`.
*Done when:* a screenshot of a hunting goblin shows cone, state and path; the overlay test fails with the draw removed.

## Backlog

- Alert spreading between NPCs (a heard "alert" event is most of it once phase 1's hearing lands).
- Utility scoring inside the attack state, if a game ever wants attack variety.
- The third axis on `Hover`, `ContactDamage` and `Grabbable` for 3D (from [[pathfinding]]'s open list; not needed by the behaviour itself).

## Record

- Core seams, 19 Nov 2026: Sight is `core/senses.js` — `canSee(viewer, target, { range, cone, facing, blockers })` and `lineOfSight`, pure queries on the ground plane ((x, y) flat, (x, z) in 3D) with the ray cast through the world; unset `blockers` means every non-dynamic body, sensors never block, and neither party's own body hides its sight line. Hearing is `events.sinceData(after)` — `since` with the payload — and for it the raised count and the recent events joined the snapshot (registered from `events.clear()`, which runs just after a scene load clears tracked state), as did the rules' fired flags and event cursor, closing a pre-existing gap where a restore re-fired once-rules and replayed the abandoned timeline's events. `Attack` gained `windup` (frames, like `cooldown`): `startAttack` commits the direction and telegraphs; the swing — hits, animation, `onStart` — fires when it runs out; `cancelWindup()` drops it; `isWindingUp`/`windupTime` replicate and the debug overlay draws the committed arc closing in. Found and fixed on the way, both pre-existing: a scene retune of `Attack.cooldown` went through `configure` unconverted (frames assigned over seconds; `configure` now converts both frame-counted params), and the 3D backend's `raycast` missed bodies added or moved since the last step, violating the physics contract the 2D backend honours — it now asks unindexed bodies' shapes directly, exactly as 2D does (caught by the 3D sense test). Docs: sight on the gameplay reference, hearing in the headless guide's world-events table, windup under the Attack reference. Engine 1.11.0.

Related: [[pathfinding]], [[engine-surface]]
