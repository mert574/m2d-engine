# Touch

Touch input arrives through the same `game.input` as the mouse. A finger is a pointer with `pointerType` set to `touch`. Clicks, drags and scrolls work without changes. This page covers what differs and how to add on-screen controls.

<Demo name="touch">
Move the ball with the arrow keys or the on-screen pad. The pad pushes key records into the input system. Right-click, or long-press on a touchscreen, to teleport the ball. Pinch with two fingers to see the pinch readout.
</Demo>

## What differs on a touchscreen

- There is no hover. `hover` and `hoverend` fire for mouse and pen only, so a button's hover colour never shows. Pressed state does, through `isPressed`.
- A long press of 500 ms fires `rightclick`. The browser's context menu never opens over the canvas.
- Two fingers are two independent pointers unless something listens for pinch events. With a pinch listener, the second finger starts a pinch and the first finger's drag ends without a `drop`.
- The canvas sets `touch-action: none`, so the page does not scroll or zoom from gestures that start on it.
- There is no keyboard. A game that needs keys on a phone draws its own controls.
- Pointer lock does not apply. A game that opted in has its lock request ignored by the browser for touch.

`event.pointerType` tells a handler which kind of pointer it is dealing with. `event.pointerId` tells fingers apart.

## On-screen controls

The input system has one entry point for synthetic input, `game.input.push(record)`. The real keyboard and pointer sources push through it, so a record pushed by game code is treated exactly like one from the browser. `game.input.flush()` delivers queued records at once.

A key record has a `kind` of `keydown` or `keyup`, a `code` and a `time`.

```javascript
game.input.push({ kind: 'keydown', code: 'ArrowLeft', key: 'ArrowLeft', time: performance.now() });
game.input.flush();
```

With that, an on-screen button is a UI element that pushes `keydown` on press and `keyup` on release. Any `KeyboardControl` bound to that code moves the entity, and `game.input.isDown('ArrowLeft')` reports it held. The demo's `PadButton` is the complete pattern.

Releasing is the part to get right. A finger that slides off a button lifts somewhere else, so the button's own `onPointerUp` never runs. The demo releases every pad on any `pointerup` through a subscriber. The same subscriber receives a `pointerup` with `cancelled` set when the browser cancels the touch.

Pointer records are pushed the same way. The fields are `kind` (`down`, `move`, `up`, `cancel` or `wheel`), `pointerId`, `pointerType`, `button`, `buttons`, `clientX`, `clientY`, `movementX`, `movementY`, `scrollX`, `scrollY`, `modifiers` and `time`. Positions are client coordinates, as the browser would report them. `packages/engine/test/helpers/input.js` shows how to build them from UI coordinates.

## Layout

Anchor controls to screen edges so they stay reachable at any aspect ratio. Make hit areas at least 44 UI units on a side. UI space is at least the design size and grows along the wide axis, so a pad anchored bottom-left and a button anchored bottom-right never overlap on a wider screen.

## Demo source

<<< @/demos/touch.js
