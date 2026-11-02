# Game loop

<Demo name="game-loop">
A custom loop. Pause freezes the simulation while drawing continues, step runs exactly one physics step while paused, slow motion changes the physics time scale and rewind plays the last two seconds backwards. The readout counts frames and physics steps.
</Demo>

`game.start()` loads sounds, switches to the initial scene and begins the frame loop. Each frame the engine applies pending display changes, delivers buffered input and advances physics. It then updates the camera and the scene, draws the world, the UI and the overlays and retires per-frame input state.

## Starting

```javascript
const game = new M2D(canvas, { initialScene: 'mainMenu' });
await game.start();
```

`start` resolves once the initial scene is loaded. A loading screen is drawn while a scene fetches.

## Pausing

`game.paused` freezes physics, entity updates and camera movement. Drawing continues, so the frozen frame stays visible under overlays.

```javascript
game.paused = true;
```

The settings menu toggles the same flag from its Paused row, and pauses automatically when constructed with `pauseWhenOpen: true`.

## Game over

`game.gameOver()` sets `game.isGameOver` and plays the `gameOver` sound. While the flag is set, the engine loop stops updating the camera and the scene and draws a game-over screen over the world. Physics keeps running, so loose bodies keep moving under the screen. Set `game.paused` as well to freeze them. The engine calls `gameOver` when the entity named `Player` falls more than 50 px below `worldHeight`. The built-in `Player` actors call it when their health reaches zero.

On that screen R restarts the current scene and M switches to the scene named `mainMenu`.

## Resetting

`game.reset()` destroys each entity's constraints and clears the entities, the physics world and the background layers. It sets `game.player` to `null`, moves the camera to the origin with no target and stops the music. Camera bounds are kept. It also resets the loop clock and reinstalls the engine's collision handlers. The game-over screen calls it before reloading a scene.

## Destroying

`game.destroy()` stops the loop and releases everything the instance registered: display and input listeners, audio, overlays, the physics world, the current scene and the renderer's GPU resources. Call it when removing a game from a page, for example when a demo is embedded in a document that the user navigates away from.

## Replacing the loop

A game can run its own `requestAnimationFrame` loop and call the engine's pieces itself. It must then handle the following.

```javascript
function frame(now) {
  if (game.pendingResize) game.resize();
  game.input.beginFrame(now);

  const deltaTime = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (!game.paused) {
    game.physics.advance(deltaTime);
    game.camera.update();
    scene.update(deltaTime);
  }

  game.renderer.clear('#000');
  game.drawWorld(scene);
  game.drawUI(scene);
  game.drawOverlays();      // settings menu, world overlay, virtual cursor

  game.input.endFrame();
  requestAnimationFrame(frame);
}
```

| Call | Why it is required |
| --- | --- |
| `input.beginFrame(now)` | Delivers buffered pointer moves and fires time-based gestures |
| `physics.advance(deltaTime)` | Spends elapsed time in fixed steps |
| `drawWorld(scene)` | Clears the world overlay, applies the camera and draws the scene |
| `drawOverlays()` | Draws the settings menu, world overlay annotations and the pointer-lock cursor |
| `input.endFrame()` | Retires `justPressed` and `justReleased` |

The demo at the top of this page is a loop like this one. It skips `start()` and does its three steps by hand, so the engine loop never runs. It stores its frame handle on `game.frameHandle`, which is what `destroy()` cancels.

The rewind shows what owning the loop allows. After every frame that stepped physics the demo records each body's position, angle and velocity. Rewinding restores one snapshot per frame through `setPosition`, `setAngle` and `setVelocity`, and removes bodies that were created after the snapshot. The engine loop has no hook between stepping and drawing, so this needs a custom loop.

The engine loop does three more things. It draws a loading screen while `game.sceneManager.loading` is true. It draws the game-over screen and handles its R and M keys when `game.isGameOver` is set. It skips simulation on the first frame to seed its clock. A custom loop that wants those does them itself. The doner example replaces the loop this way.

## Demo source

<<< @/demos/game-loop.js
