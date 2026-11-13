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

Keys whose browser default interferes with a game, such as Space, Tab, the arrows and Backspace, have that default suppressed. That list covers keys a game *polls*; the `preventDefaultKeys` [engine option](../reference/engine-options) replaces it. Any other key is suppressed exactly when something consumed the press, which is how F3 toggles the frame-rate readout without also opening the browser's find bar, and how a menu hotkey stays out of the page. Either way a held Ctrl, Alt or Meta cancels the suppression, so the player can still reach browser shortcuts. See [Browser defaults](../reference/input-events#browser-defaults).

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

Each event is offered to three bands in order: the engine's own UI (`game.ui`: the debug layer, then screens from the top down), the current scene's UI elements, then the world. The topmost hit in the highest band that has one becomes the target. Any handler may call `event.consume()` to stop the event from descending further, which is how a blocking screen keeps input away from the game.

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

`Interactive` delivers drag events and leaves the body alone. Moving a dragged body is a physics decision. Teleporting a static prop, driving a kinematic one and steering a dynamic one are each right for different games. Pass `follow: true` to place the body under the pointer on every tick of the drag. For a dynamic body, [`Grabbable`](../reference/constraints#grabbable) is the answer a physics world wants: it steers the body toward the pointer with velocity, so a grabbed object still collides on the way and keeps the speed it was flung at. The physics playground attaches it from its scene file.

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

## Input in the tick

Simulation code reads a snapshot: a copy of the keyboard and pointer state taken at the start of every simulation tick. It has the same `isDown`, `justPressed`, `justReleased`, `axis` and `vector` methods and a `pointer` with `ui`, `world`, `isDown`, `buttons` and `type`. Every tick in a frame sees the same held keys, and a press or release edge reaches exactly one tick, so a frame that runs two ticks to catch up cannot fire a jump twice. Code outside the tick, such as a UI element or a scene `onUpdate`, keeps reading `game.input` directly.

An entity reads its snapshot through `entity.input`. In a single-player game that is `game.input.snapshot`. On a server it is the snapshot of the player who owns the entity (see [Players](./headless#players)), so one actor serves both. Every engine constraint reads it this way. Scene-level code with no entity, such as an `onFixedUpdate` hook, reads `game.input.snapshot`.

```javascript
fixedUpdate(dt) {
  const input = this.input;
  if (input.justPressed('Space')) this.jump();
  const move = input.vector('KeyW', 'KeyS', 'KeyA', 'KeyD');
}
```

While a blocking screen is up (a dialog, an inventory, the console), the snapshot carries no keys and no pointer buttons. Typing in it or holding an arrow over it does not move anything in the world. A press the UI takes never reaches a snapshot at all: a key a screen consumed, a click a screen consumed and a click on a scene UI element. A button pressed on the UI reads as up to the world until it is released, so closing a menu with a click does not also act on the world under the cursor.

Because every tick reads one snapshot, recording them (`snapshot.toJSON()`) and feeding them back through `game.input.setSnapshotSource(fn)` replays the simulation exactly: the recording drives the game through the same seam the keyboard does. The circuit example's lap replays are this and nothing more.

## Named actions

A named action is what a key means to the game: `menu`, `jump`, `interact`. A project declares its actions in `m2d.project.json`, each name with the physical key codes that perform it, and the game reads them as `game.actions`.

```json
"input": { "actions": { "menu": ["Escape"], "interact": ["KeyE", "Enter"] } }
```

A rule fires on one with `{ "event": "action", "action": "menu" }` (see [Rules](../reference/scene-format#rules)). Code reads one against a tick's snapshot, so a replay sees what the action did.

```javascript
if (game.actions.pressed('interact', this.input)) this.talk();
if (game.actions.down('boost', this.input)) this.burn(dt);
```

The settings menu lists every action under Controls. Enter on a row waits for the next key and binds the action to it; Escape keeps the old one, and Reset controls returns every action to the project's keys. A player's bindings persist in the browser, per game, and never change the project file. Code rebinds with `game.actions.rebind(name, codes)` and restores with `game.actions.reset()`. Without the `actions` option the game has none.

## Replacing the engine loop

A game that runs its own `requestAnimationFrame` loop must call `game.input.beginFrame(now)` at the start of each frame and `game.input.endFrame()` at the end. `beginFrame` delivers buffered pointer moves and fires time-based gestures. `endFrame` retires the `justPressed` and `justReleased` edges. `game.fixedUpdate` samples the snapshot; a loop that runs ticks some other way calls `game.input.sample()` itself at the start of each. See [Game loop](./game-loop).

## Demo source

<<< @/demos/input.js
