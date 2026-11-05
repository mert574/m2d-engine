# Game loop

<Demo name="game-loop">
A custom loop. Pause freezes the simulation while drawing continues, step runs exactly one simulation tick while paused, slow motion changes the time scale and rewind plays the last two seconds backwards. The readout counts frames and ticks.
</Demo>

`game.start()` loads sounds, switches to the initial scene and begins the frame loop. Each frame the engine applies pending display changes, delivers buffered input and ticks `game.time`, which runs as many simulation ticks as the frame paid for. Each tick samples the input, runs every `fixedUpdate` and steps physics once. The frame then updates the camera and the scene's per-frame presentation, draws the world, the UI and the overlays and retires per-frame input state. [Time, ticks and timers](./time) describes the tick.

## Starting

```javascript
const game = new M2D(canvas, { initialScene: 'mainMenu' });
await game.start();
```

`start` resolves once the initial scene is loaded. A loading screen is drawn while a scene fetches.

## Pausing

`game.pause()` stops the simulation ticks, and with them physics, entity updates, camera movement and game-time timers. Drawing continues, so the frozen frame stays visible under a menu, and the UI keeps ticking. A pause screen that froze along with the game could not animate itself in. `game.resume()` and `game.togglePause()` are the other two; all three set `game.paused`.

```javascript
game.pause();
```

The settings menu toggles the same flag from its Paused row, and pauses automatically when constructed with `pauseWhenOpen: true`. [Time, ticks and timers](./time) covers the clocks, the tick, the time scale and scheduling.

## Game over

`game.gameOver()` sets `game.isGameOver` and plays the `gameOver` sound. While the flag is set, the ticks skip the scene's `fixedUpdate` and the loop stops updating the camera and the scene, and draws a game-over screen over the world. Physics keeps stepping, so loose bodies keep moving under the screen. Set `game.paused` as well to freeze them. The engine calls `gameOver` when the entity named `Player` falls more than 50 px below `worldHeight`. The built-in `Player` actors call it when their health reaches zero.

On that screen R restarts the current scene and M switches to the scene named `mainMenu`.

## Resetting

`game.reset()` destroys each entity's constraints and clears the entities, the physics world and the background layers. It sets `game.player` to `null`, resets the camera entirely — position, target, mode, bounds, zoom, every tunable, through `camera.resetConfig()` — and stops the music. It also resets the loop clock and `game.time` (clocks, counters, accumulator and timers; the time scale is kept), reseeds `game.rng` and reinstalls the engine's collision handlers. The game-over screen calls it before `sceneManager.reload()`, whose `onEnter` sets the camera up again.

## Destroying

`game.destroy()` stops the loop and releases everything the instance registered: display and input listeners, audio, the screen stack, the physics world, the current scene and the renderer's GPU resources. Call it when removing a game from a page, for example when a demo is embedded in a document that the user navigates away from.

## Replacing the loop

A game can run its own `requestAnimationFrame` loop and call the engine's pieces itself. It must then handle the following.

```javascript
function frame(now) {
  if (game.pendingResize) game.resize();
  game.input.beginFrame(now);

  // Clamps the delta, advances the clocks, fires due timers and runs as
  // many simulation ticks as the frame paid for.
  game.time.tick((now - last) / 1000, { paused: game.paused, step: game.fixedUpdate });
  last = now;
  const dt = game.time.unscaledDelta;

  // A tick asked for a scene switch: the outgoing scene is done.
  if (game.sceneManager.loading) {
    game.input.endFrame();
    return requestAnimationFrame(frame);
  }

  if (!game.paused) {
    game.camera.update(dt);
    scene.update(game.time.delta);   // per-frame presentation, scaled game time
  }

  game.renderer.clear('#000');
  scene.updateUI(dt);
  game.drawWorld(scene, dt);
  game.drawUI(scene, dt);
  game.motion.update(dt);   // UI tweens
  game.ui.update(dt);       // screens and the debug layer
  game.drawOverlays(dt);    // world overlay, screens, virtual cursor

  game.input.endFrame();
  requestAnimationFrame(frame);
}
```

| Call | Why it is required |
| --- | --- |
| `input.beginFrame(now)` | Delivers buffered pointer moves and fires time-based gestures |
| `time.tick(rawDelta, { paused, step })` | Clamps the frame delta, advances the clocks, fires timers and calls `step(dt)` once per tick. `time.delta` and `time.unscaledDelta` are what the rest of the frame reads |
| `game.fixedUpdate(dt)` | One simulation tick: samples the input, runs the scene's and every entity's `fixedUpdate`, steps physics. Returns `false` once a scene switch is pending, which stops `time.tick`. Pass it as the `step`, or wrap it and return its result |
| `camera.update(dt)` | Moves the camera toward its target, corrected for the frame length |
| `drawWorld(scene)` | Clears the world overlay, applies the camera and draws the scene |
| `drawOverlays(dt)` | Draws world overlay annotations, then `game.ui` (screens and the debug layer), then the pointer-lock cursor |
| `input.endFrame()` | Retires `justPressed` and `justReleased` |

The demo at the top of this page is a loop like this one. It skips `start()` and does its three steps by hand, so the engine loop never runs. It stores its frame handle on `game.frameHandle`, which is what `destroy()` cancels.

The rewind shows what owning the loop allows. The demo's `step` wraps `game.fixedUpdate` and records each body's position, angle and velocity after every tick. Rewinding restores one snapshot per frame through `setPosition`, `setAngle` and `setVelocity`, and removes bodies that were created after the snapshot. The step button calls `game.time.stepOnce` with the same wrapper to run one tick while paused.

The engine loop does three more things. It draws a loading screen while `game.sceneManager.loading` is true, and does not tick `game.time` on those frames. It draws the game-over screen and handles its R and M keys when `game.isGameOver` is set. It skips simulation on the first frame to seed its clock. A custom loop that wants those does them itself.

## Snapshots

`game.snapshot()` captures the whole simulation between ticks. `game.restore(snapshot)` puts it back. Given the same input, the ticks after a restore are bit-identical to the ticks after the snapshot was taken. A snapshot can be restored any number of times.

```javascript
const before = game.snapshot();
game.step(30);            // a guess at what happens next
game.restore(before);     // the real input arrived
game.step(30);            // the real thing
```

A snapshot holds the physics world, every entity in set order with its fields and its constraints' fields, the game-time timers, the clock, the seeded generator, the network ids, each player's `state` and the player avatars. It lives in memory, and its entities, bodies, constraints and timers are the same objects after a restore. An entity spawned after the snapshot is removed and one removed after it comes back as itself. Restoring needs the scene the snapshot was taken in.

Fields are captured generically. Numbers, strings and booleans are copied. Plain objects, arrays, Sets and Maps are copied by content and restored in place, so an object a closure also holds stays the object the entity holds. Anything else, such as another entity, a class instance or a function, is kept by reference. A field that did not exist at the snapshot is deleted. An entity or constraint with `saveState()` and `loadState(state)` methods is saved through them instead.

State outside entities, such as a counter in a scene's closure, is invisible to a snapshot until the scene registers it. Registrations are dropped when the next scene loads, so register in `onEnter`:

```javascript
onEnter() {
  game.trackState('waves', { save: () => wave, load: (saved) => { wave = saved; } });
}
```

Not captured: the camera, UI and other presentation, wall-time timers, and players' intent queues, which hold input for ticks still to come. An input source that replays after a restore must be a function of the tick, like a recorded log, so it feeds the rewound ticks the same input again.

A snapshot of Cinder Keep's 615 entities takes about 4 ms to take and 4 ms to restore in Node, against 0.4 ms per tick.

## Demo source

<<< @/demos/game-loop.js
