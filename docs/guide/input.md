# Input

Keyboard, mouse, touch and pen all arrive through **`game.input`**. Pointer
Events are the only source, so a game written for the mouse already works on
a touchscreen.

## Keyboard

Keys are identified by **physical position**, not by the character they
produce, so WASD stays a diamond under the left hand on AZERTY and Dvorak:

```javascript
game.input.isDown('KeyW');
game.input.justPressed('Space');
game.input.justReleased('Escape');

// What movement code actually wants:
game.input.axis('KeyA', 'KeyD');                      // -1 .. 1
game.input.vector('KeyW', 'KeyS', 'KeyA', 'KeyD');    // normalized {x, y}

game.input.keyLabel('KeyZ');   // what the player's keycap says, for binding UI
```

## Pointer

Every event carries both coordinate spaces, so nothing has to map a position
by hand:

```javascript
game.input.on('click', (event) => {
  event.world;      // world coordinates, camera applied
  event.ui;         // UI coordinates, letterboxing and pixel ratio applied
  event.modifiers;  // { shift, ctrl, alt, meta }
  event.consume();  // stop it reaching anything further down
});

game.input.pointer.world;   // polled, and recomputed when the camera moves
```

Available types: `pointerdown`, `pointermove`, `pointerup`, `click`,
`doubleclick`, `rightclick`, `hover`, `hoverend`, `dragstart`, `drag`,
`dragend`, `drop`, `pinchstart`, `pinch`, `pinchend`, `scroll`, `keydown`,
`keyup`, `pointerlockchange`.

A few behaviours worth knowing:

- **Click fires on release**, and needs the press and release on the same
  target — so sliding off a button cancels it. `doubleclick` fires *in
  addition to* the second `click`, because delaying every click by the
  double-click interval to tell them apart is worse than the alternative.
- **Long-press stands in for right click on touch**, and a right click never
  opens the browser's context menu over the canvas.
- **Pinch only happens if you listen for it.** Otherwise two fingers are two
  independent drags, which is what twin-stick touch controls need.
- **Pinch and scroll hand you numbers and no policy** — `event.scaleDelta`,
  `event.scroll` — and the game decides what they mean.

## Hit detection

Events reach, in order: engine overlays (the settings menu), the scene's UI
elements, then the world. Each one may `consume()` the event. World hit
testing is opt-in per entity, so a game that never asks for it never pays
for it:

```javascript
import { Interactive } from 'm2d-engine/constraints/interactive.js';

crate.addConstraint('grab', new Interactive(crate, {
  hitArea: 'body',        // the physics collider; or {width, height} / {radius}
  draggable: true,
  cursor: 'grab',
  onClick(event)  { console.log('hit at', event.world); },
  onDrag(event)   { /* event.delta.world, event.total.world */ },
  onDrop(event)   { console.log('landed on', event.dropTarget?.entity); }
}));
```

`Interactive` delivers the drag events but does not move the body: steering a
dynamic body, driving a kinematic one and teleporting a static one are all
correct in different games, and guessing fights the solver. Pass
`follow: true` for the simple answer, or do it yourself — the physics
playground steers the body toward the pointer with velocity so grabbed
objects still collide and can be flung.

## Pointer lock

The pointer is **confined to the canvas by default**: the system cursor is
hidden and the engine draws a virtual one in its place. Hit testing and
coordinates are identical either way, so nothing in game code changes. The
browser only grants this inside a user gesture, so the engine asks on the
first press and asks again after the player presses Escape.

```javascript
new M2D(canvas, { pointerLock: false });   // opt out entirely
game.input.setPointerLock(false);          // or at runtime
game.input.unlockPointer();                // release; the next press re-acquires
game.input.on('pointerlockchange', (event) => { if (!event.locked) pause(); });
```
