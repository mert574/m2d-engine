# Determinism

The simulation is a function of three inputs: its fixed ticks, the input snapshot each tick reads, and the seed. Nothing else. Run the same scene with the same inputs and the same seed and every body ends in a bit-identical place, whether the display drew 30, 60 or 144 frames along the way. `packages/engine/test/determinism.test.js` pins this and must keep passing.

This is not pedantry. It is what makes Night Circuit's replay and ghost a few kilobytes of input instead of a video, what makes a restarted level play the same, and it is the prerequisite for networking: a server-authoritative model, lockstep and rollback all assume that the same ticks produce the same world everywhere. Every nondeterminism shipped now is a desync bug waiting in that future.

## The contract

Simulation code — `fixedUpdate(dt)` on entities and constraints, `onFixedUpdate(dt)` on scenes, `game.time` timers, collision handlers — may read:

- `game.input.snapshot`: the tick's input, captured once per tick.
- `game.rng`: the seeded generator, reseeded on every load and reset.
- Simulation state: `position`, `velocity`, `angle`, physics queries, other entities' fixed-tick fields.
- `game.time`'s game clock and `dt`, which is always `fixedTimestep`.

It may never read:

- **The camera.** `camera.x`, `getVisibleArea()`, `isVisible()`, zoom, rotation — all of it moves per frame, on wall time, and differs between a 30 Hz and a 144 Hz run of the same ticks.
- **Render state.** `renderPosition`, `renderAnchor`, `renderAngle`, `elevation`'s blended counterpart `renderElevation` — these are interpolated for the frame being drawn. Draw with them; decide with `position` and `angle`.
- **Wall time.** `performance.now()`, `Date.now()`, `setTimeout`, `requestAnimationFrame`, `game.time`'s wall clock.
- **`Math.random()`**, for anything the simulation sees.
- **Frame events.** Anything computed in `update(deltaTime)`, `onUpdate`, `draw` or a UI handler. Those run per frame and are presentation only; a frame hook that wants to change the world sets a flag the next `fixedUpdate` acts on, or routes through input.

The inverse also holds: presentation never writes simulation state. `update(deltaTime)` may spin a sprite's visual flourish, not nudge a body.

Pointer events and UI handlers count as presentation. A handler that wants to change the world queues the change for the next tick, as the physics playground does with its spawns, flings and gravity. A UI component whose state decides what the simulation does takes a game-time clock: `UIDialogue` with `clock: () => game.time.elapsed` types on game time, so whether a press finishes a line or closes the conversation does not depend on the frame rate.

The engine gives every scene load a fresh physics world, and a scene switch requested inside a tick runs after it. A game that rebuilds its world inside a scene, as Night Circuit does every round, calls `game.physics.reset()` and adds its static bodies again. Removing and re-adding bodies in the same world does not reproduce a first run.

## The worked example: an auto-scroller

`camera.mode = 'scroll'` moves the camera at `scrollVelocity` per frame, on wall time. An auto-scroller's rules — spawn ahead of the view, despawn behind it, push the player along, crush them against the trailing edge — are simulation, so they cannot ask the camera where the view is: at 144 fps the camera has moved through slightly different positions than at 30 fps whenever either clock stutters, and the moment a spawn depends on it, the runs diverge.

The pattern is a **scroll front**: a simulation-side marker advanced by the same velocity in `fixedUpdate`.

```javascript
class ScrollFront extends Entity {
  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    this.edge = (this.edge ?? 0) + SCROLL_SPEED * dt;   // simulation truth
  }
}
```

Every rule reads `front.edge` (plus or minus half the view width, a constant): activation, despawn, the crush. The camera runs in `'scroll'` mode at the same `scrollVelocity` from the same start, so the view and the front stay aligned at any frame rate — the camera is a presentation of the front, not the authority. Two consequences:

- Do not scale time in such a scene. The camera deliberately ignores `timeScale` (slow motion should not slow the view), so under it the front and the camera part ways.
- Lay the level out ahead of time — objects placed in the scene, woken as the front reaches them — rather than rolling spawns per frame. The build scripts under `examples/scripts/` are this.

## When adding engine features

A feature that lives on the presentation side but that gameplay will predictably want to ask about — a camera mode, a transition, an effect's progress — ships with either a simulation-side counterpart (as `elevation` is to `renderElevation`) or a documented pattern for one (as the scroll front is to scroll mode). If the honest answer is "games will read this from `fixedUpdate`", the feature is not done until they can do so deterministically.

A quick review checklist for any change touching gameplay or the engine:

1. Does anything in a `fixedUpdate` path read the camera, a `render*` field, a wall clock or `Math.random()`?
2. Does anything per-frame write a body, a velocity, health, or any state a `fixedUpdate` reads?
3. Does a new feature tempt game code to break 1 or 2? Give it a deterministic door.
4. Would it run headless? A presentation read in simulation code throws in a [headless game](../guide/headless), so `test/headless.test.js` and a game's own headless run catch what this checklist misses.
5. `npm run test:node`. `determinism.test.js` is the backstop. It runs every engine actor and constraint from a scripted input stream at several frame rates and through a pause and slow motion. It only covers the scenes it runs and will not catch a nondeterministic demo on its own.
