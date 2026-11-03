# Time, ticks and timers

`game.time` holds the engine's clocks, runs the simulation tick and schedules timers on top of them.

<Demo name="time">
A ball drops every 0.6 s on a game-time interval. Pause freezes it and the clocks, slow motion stretches it. "Burst in 2 s" arms a one-shot on game time, so pausing before it fires makes it wait. The toast is on wall time and goes away while paused. The readout at the top shows both clocks, the frame count, the tick count and the time scale.
</Demo>

## Two clocks

Game time stops while the game is paused and stretches with the time scale. Wall time does neither. Cooldowns, spawn intervals and level timers count game time. Menus, transitions and anything the player should see move while the game is frozen count wall time.

| Property | Clock | Meaning |
| --- | --- | --- |
| `time.delta` | game | Seconds of game time this frame. `0` while paused |
| `time.elapsed` | game | Simulation time since start or the last `reset()`. Advances in whole ticks, so it is always `steps × fixedTimestep` |
| `time.unscaledDelta` | wall | Seconds this frame, after the 0.1 s frame clamp |
| `time.unscaledElapsed` | wall | Seconds since start or the last `reset()` |
| `time.scale` | | Multiplier on game time. `1` real time, `0.5` slow motion, `0` frozen. Default `1` |
| `time.frame` | | Frames drawn |
| `time.steps` | | Simulation ticks run. The simulation's own clock |
| `time.fixedTimestep`, `time.fixedDelta` | | Seconds per tick. Default `1 / 60` |
| `time.interpolation` | | How far the current frame sits between the last tick and the next, `0` to `1` |
| `time.paused` | | Whether the last frame was a paused one |

## The simulation tick

The game plays in ticks of a fixed length, 1/60 s by default. Each frame the engine adds the frame's game time to an accumulator and runs as many ticks as it paid for. A 144 Hz display and a 30 Hz one run the same ticks, in the same order, with the same `dt`. Only how often the result is drawn differs.

One tick, in order:

1. The input is sampled. Every tick sees one fixed state and a key press reaches exactly one tick, however many ticks a frame runs. See [Input](./input#input-in-the-tick).
2. Game-time timers due at this tick fire.
3. The scene's `onFixedUpdate(dt)` and every entity's `fixedUpdate(dt)` run.
4. Physics steps once.

Everything that changes the game belongs in a `fixedUpdate`: movement, cooldowns, damage, spawning, AI decisions. Everything that only changes what the player sees belongs in the per-frame `update(deltaTime)`: an animation cycle, a hit flash, an idle bob. See [Entities](./entities#lifecycle-methods).

```javascript
fixedUpdate(dt) {
  this.cooldown -= dt;                    // simulation, per tick
  if (this.cooldown <= 0) this.fire();
}

update(deltaTime) {
  this.glow = Math.sin(this.game.time.elapsed * 4);   // presentation, per frame
}
```

Slow motion runs fewer ticks per second. The tick length never changes, so a game that plays correctly at full speed plays correctly at any speed.

Because the simulation is a function of its ticks and its inputs, a game with the same seed and the same input ends in the same state at every frame rate. Random numbers come from `game.rng`, which is seeded. See [Random numbers](../reference/engine-options#random-numbers).

At most `maxSubSteps` ticks run per frame, 6 by default. When a frame owes more, the rest is dropped, so a stall cannot cascade into ever longer frames.

## Pausing

`game.pause()` and `game.resume()` set `game.paused`. `game.togglePause()` flips it and returns the new state. While paused no ticks run, so physics, entities, the camera and game-time timers all stop. Drawing, UI, motion and wall-time timers continue, so a menu can animate over the frozen frame. The settings menu, screens with `pauseGame` and the `g_paused` cvar use the same flag.

```javascript
game.input.on('keydown', (event) => {
  if (event.code === 'KeyP') game.togglePause();
});
```

No time is owed after a pause. The first live frame runs one frame's worth of ticks.

## Time scale

`time.scale` applies to the ticks, and so to physics, entity simulation and game-time timers. Per-frame `update` receives the scaled delta as well, so animation slows down with the thing it belongs to. The UI does not slow down. The physics world's `timeScale` is the same value. The `timeScale` engine option sets it at construction and the `g_timescale` cvar changes it from the console.

```javascript
game.time.scale = 0.25;   // slow motion
game.time.scale = 1;      // back to real time
```

## Timers

`after` runs a callback once. `every` runs it on an interval until cancelled. Both take seconds of game time and fire on the first tick at or past their deadline, so they freeze with the pause, stretch with the time scale and replay with the simulation. Both return a `Timer`.

```javascript
const spawner = game.time.every(0.6, () => spawnBall());
game.time.after(2, () => explode());

spawner.cancel();
```

Pass `{ unscaled: true }` for a timer on wall time. It runs through a pause, ignores the time scale and fires per frame.

```javascript
game.time.after(1.5, () => { banner.text = ''; }, { unscaled: true });
```

`wait` is `after` as a promise. It resolves `true` when the delay elapses and `false` if the timer is cancelled or cleared first, so a sequence stops cleanly on a scene switch.

```javascript
async function countdown() {
  for (const n of [3, 2, 1]) {
    label.text = String(n);
    if (!await game.time.wait(1)) return;
  }
  label.text = 'Go';
}
```

| Method | What it does |
| --- | --- |
| `after(seconds, fn, options)` | Run `fn` once after `seconds`. Returns a `Timer` |
| `every(seconds, fn, options)` | Run `fn` every `seconds`. The interval must be greater than 0. Returns a `Timer` |
| `wait(seconds, options)` | `after` as a promise. The `Timer` is on the promise's `timer` property |
| `clear()` | Cancel every timer |
| `activeCount` | Timers waiting to fire |
| `reset()` | Zero the clocks, the counters and the accumulator and cancel every timer. The scale and the tick settings are kept. `game.reset()` calls it |
| `tick(rawDelta, { paused, step })` | Advance one frame: clocks, then as many ticks as the frame paid for, calling `step(dt)` for each. Returns the number of ticks. The engine loop calls it with `game.fixedUpdate` as the step. See [Replacing the loop](./game-loop#replacing-the-loop) |
| `stepOnce(step)` | Run exactly one tick now, whatever the accumulator holds. For a step button or a loop that drives ticks itself |

`options.unscaled` is the only timer option. It defaults to `false`.

| Timer | Meaning |
| --- | --- |
| `cancel()` | Stop it. A cancelled timer never fires. Safe to call twice |
| `active` | `false` once cancelled or, for a one-shot, once fired |
| `remaining` | Seconds until it next fires on its clock |
| `fired` | How many times it has run |
| `interval` | Seconds between repeats, `0` for a one-shot |
| `unscaled` | Which clock it counts |

Game-time timers fire at the start of their tick, before `fixedUpdate` and physics, earliest deadline first, so whatever a timer spawns is simulated by that same tick. A timer armed inside a callback waits for the next tick. A zero delay fires on the next tick. An interval shorter than a tick fires once per tick.

Timers are cleared when a scene unloads, by `game.reset()` and by `game.destroy()`. A timer meant to span a scene switch is armed again by the next scene's `onEnter`.

A timer stores the clock reading it fires at, so its state is one number against the clock. Nothing counts down per frame.

## What not to use

`setTimeout`, `setInterval`, `performance.now()` and `Math.random()` do not know about the pause, the time scale, the tick or the seed. A banner timed with `performance.now()` keeps counting under the pause menu. A respawn scheduled with `setTimeout` fires into a frozen game. An enemy that picks a target with `Math.random()` picks a different one on every replay. Use the clocks, timers and `game.rng` for anything that belongs to the game.

## Demo source

<<< @/demos/time.js
