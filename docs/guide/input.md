# Input

Keyboard, mouse, touch and pen all arrive through `game.input`. Pointer input comes from Pointer Events, so one code path serves mouse, finger and pen. The [input events reference](../reference/input-events) lists every event type and field.

<Demo name="input">
Drag a body to steer it and let go to throw it. Click empty space to add one. Right-click or long-press a body to remove it. Scroll or pinch to change gravity. The first line names the last event.
</Demo>

## Keyboard

Keys are identified by physical position with `KeyboardEvent.code` values such as `KeyW`, `Space` and `ArrowLeft`. The same binding lands on the same key on every keyboard layout.

```javascript
game.input.isDown('KeyW');          // held right now
game.input.justPressed('Space');    // went down this frame
game.input.justReleased('Escape');  // went up this frame

game.input.axis('KeyA', 'KeyD');                     // -1, 0 or 1
game.input.vector('KeyW', 'KeyS', 'KeyA', 'KeyD');   // normalized { x, y }

game.input.keyLabel('KeyZ');   // what the player's keycap says, for a bindings screen
```

Key events are also available as `keydown` and `keyup` through `game.input.on`.

Listeners sit on the canvas, which the engine makes focusable and focuses on construction and on every press.

Keys whose browser default interferes with a game, such as Space, Tab, the arrows and Backspace, have that default suppressed. That list covers keys a game *polls*; the `preventDefaultKeys` [engine option](../reference/engine-options) replaces it. Any other key is suppressed exactly when something consumed the press — which is how F3 toggles the frame-rate readout without also opening the browser's find bar, and how a menu hotkey stays out of the page. Either way a held Ctrl, Alt or Meta cancels the suppression, so the player can still reach browser shortcuts. See [Browser defaults](../reference/input-events#browser-defaults).

## Pointer

Subscribe to pointer events with `game.input.on`. Every event carries the position in UI, view and world coordinates, so a handler never converts between them.

```javascript
const off = game.input.on('click', (event) => {
  event.world;      // world coordinates, camera applied
  event.ui;         // UI coordinates, letterboxing and pixel ratio applied
  event.modifiers;  // { shift, ctrl, alt, meta }
  event.consume();  // stop the event from reaching anything further down
});

off();   // unsubscribe

game.input.pointer.world;   // current pointer position, polled
game.input.pointer.isDown;
```

Event types are `pointerdown`, `pointermove`, `pointerup`, `click`, `doubleclick`, `rightclick`, `hover`, `hoverend`, `dragstart`, `drag`, `dragend`, `drop`, `pinchstart`, `pinch`, `pinchend`, `scroll`, `keydown`, `keyup` and `pointerlockchange`.

### Gestures

- A `click` fires on release. When the press landed on a target, the release has to land on the same target, so sliding off a button cancels it. On empty space a quick release, or one within 16 UI units, counts.
- A `doubleclick` fires after the second `click`, in addition to it. Two clicks within 300 ms and 12 UI units count.
- A long press of 500 ms on a touchscreen fires `rightclick`. The browser's context menu never opens over the canvas.
- A `drag` starts when the pointer moves more than 16 UI units. Movement during the first 100 ms of a press does not count, so a quick flick is still a click. Drag events carry `start`, `delta` and `total`, each with `ui` and `world` coordinates. Whatever received `dragstart` receives the rest of the drag.
- Pinch events carry `scale`, `scaleDelta`, `rotation`, `rotationDelta`, `distance` and `centre`.
- Gestures are recognized only while something listens for them. Double clicks, drags, pinches and touch long-presses all need a subscriber, an `Interactive` handler or a UI element that wants them. Without a pinch listener two fingers are two independent pointers, which is what twin-stick touch controls need.
- `scroll` carries `scroll` in pixels, whatever unit the browser reported.

## Where events go

Each event is offered to three bands in order: the engine's own UI (`game.ui` — the debug layer, then screens from the top down), the current scene's UI elements, then the world. The topmost hit in the highest band that has one becomes the target. Any handler may call `event.consume()` to stop the event from descending further, which is how a blocking screen keeps input away from the game.

UI elements receive events through their `on*` methods and consume what they handle by default. See [UI](./ui).

### World hit testing

Entities take part in hit testing only when they carry the `Interactive` constraint. A scene without one never asks the physics world what is under the pointer.

```javascript
import { Interactive } from 'm2d-engine/constraints/interactive.js';

crate.addConstraint('grab', new Interactive(crate, {
  hitArea: 'body',        // the physics collider, or { width, height } or { radius }
  draggable: true,
  cursor: 'grab',
  onClick(event)  { console.log('hit at', event.world); },
  onDrag(event)   { /* event.delta.world, event.total.world */ },
  onDrop(event)   { console.log('landed on', event.dropTarget?.entity); }
}));
```

Handlers are bound to the entity. The full option list is in the [constraints reference](../reference/constraints#interactive).

`Interactive` delivers drag events and leaves the body alone. Moving a dragged body is a physics decision. Teleporting a static prop, driving a kinematic one and steering a dynamic one are each right for different games. Pass `follow: true` to place the body under the pointer each frame. The physics playground steers the body toward the pointer with velocity instead, so a grabbed object still collides and can be thrown.

## Pointer lock

A game can confine the pointer to the canvas. The engine then hides the system cursor and draws its own, and the pointer cannot leave the play area or click the page behind it. Coordinates and hit testing are the same in both modes. It is off by default.

```javascript
new M2D(canvas, { pointerLock: true });    // opt in
game.input.setPointerLock(true);           // or at runtime. Takes effect at the next press
game.input.unlockPointer();                // release now; the next press re-acquires
game.input.on('pointerlockchange', (event) => { if (!event.locked) pause(); });
```

The browser only grants the lock inside a user gesture, so the engine requests it on every press while the pointer is unlocked. Pressing Escape releases it until the next press. Suits a full-screen game. Leave it off for anything embedded in a page.

For what changes on a touchscreen and how to build on-screen controls, see [Touch](./touch).

## Synthetic input

`game.input.push(record)` queues an input record as if it came from the browser, and `game.input.flush()` delivers everything queued. On-screen touch controls, replays and tests use it. The record shape is documented in `packages/engine/src/core/input/pointerSource.js`.

## Replacing the engine loop

A game that runs its own `requestAnimationFrame` loop must call `game.input.beginFrame(now)` at the start of each frame and `game.input.endFrame()` at the end. `beginFrame` delivers buffered pointer moves and fires time-based gestures. `endFrame` retires the `justPressed` and `justReleased` edges. See [Game loop](./game-loop).

## Demo source

<<< @/demos/input.js
