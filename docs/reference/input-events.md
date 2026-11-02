# Input events

`game.input` is the input system. This page lists its methods, the event types and the fields each event carries. See [Input](../guide/input) for how the pieces fit.

## Methods

| Method | Meaning |
| --- | --- |
| `on(type, handler, { band })` | Subscribe. Returns an unsubscribe function. `band` is `'overlay'`, `'ui'` or `'world'` and defaults to `'world'` |
| `makeSyntheticEvent(type, extra)` | Build an event that did not come from a device, carrying the cursor's current position. Keyboard and gamepad activation of a focused control uses it, so a control behaves the same however it was triggered. Built, not dispatched — the caller delivers it to the target it already resolved |
| `isDown(code)` | Whether a key is held |
| `justPressed(code)` | Whether a key went down this frame |
| `justReleased(code)` | Whether a key went up this frame |
| `axis(negativeCode, positiveCode)` | `-1`, `0` or `1` |
| `vector(upCode, downCode, leftCode, rightCode)` | Normalized `{ x, y }` |
| `keyLabel(code)` | The keycap label for a code on the player's layout |
| `pointer` | The current pointer. Fields below |
| `pointerLocked` | Whether the pointer is locked |
| `setPointerLock(enabled)` | Turn pointer lock on or off. Turning it on takes effect at the next press. Turning it off releases the lock at once |
| `unlockPointer()` | Release the lock now |
| `push(record)` | Queue a synthetic input record |
| `flush()` | Deliver everything queued |
| `beginFrame(now)`, `endFrame()` | Per-frame bookkeeping for games that run their own loop |

### `game.input.pointer`

| Field | Meaning |
| --- | --- |
| `ui`, `view`, `world` | Current position in each space. `world` is recomputed when the camera moves |
| `isDown` | Any button held |
| `buttons` | DOM button bitmask |
| `type` | `'mouse'`, `'touch'` or `'pen'` |
| `locked` | Whether the pointer is locked |

## Event types

| Type | When |
| --- | --- |
| `pointerdown`, `pointerup` | A button or touch goes down or up. `pointerup` carries `cancelled: true` when the browser cancelled the pointer or the window lost focus |
| `pointermove` | The pointer moves. Coalesced to one per pointer per frame |
| `click` | Press and release on the same target. With no target, a release within 100 ms of the press or within 16 UI units of it |
| `doubleclick` | A second click within 300 ms and 12 UI units of the first. Fires after the second `click`. Recognized only while something listens for it |
| `rightclick` | Secondary button, or a touch held for 500 ms |
| `hover`, `hoverend` | The pointer enters or leaves a target. Mouse and pen only |
| `dragstart`, `drag`, `dragend` | Movement past 16 UI units once a press is 100 ms old. Recognized only while something listens for a drag event. `dragend` carries `cancelled: true` when the drag was cut short |
| `drop` | At the end of a completed drag, delivered to the subject and to what it was dropped on. A cancelled drag, or one that turned into a pinch, fires no `drop` |
| `pinchstart`, `pinch`, `pinchend` | Two pointers, only while something listens for any pinch event |
| `scroll` | Wheel or trackpad |
| `keydown`, `keyup` | A key goes down or up. When the canvas or the window loses focus, held keys are cleared in `isDown` without a `keyup` event |
| `pointerlockchange` | The lock was acquired or released |

## Event fields

Every event carries these.

| Field | Meaning |
| --- | --- |
| `type` | The event type |
| `ui`, `view`, `world` | Position in UI units, view coordinates and world coordinates |
| `inContent` | Whether the position is inside the world's drawn area. `false` on a letterbox bar |
| `pointerId`, `pointerType`, `button`, `buttons` | As reported by the browser |
| `modifiers` | `{ shift, ctrl, alt, meta }` |
| `time` | Timestamp in ms |
| `target` | What the router delivered the event to, or `null` |
| `consume()` | Stop the event from reaching lower bands |
| `consumed` | Whether `consume()` was called |

Type-specific fields:

| Types | Fields |
| --- | --- |
| `dragstart`, `drag`, `dragend`, `drop` | `start`, `delta`, `total`, each with `ui` and `world`. `subject` is the dragged target |
| `drop` | `dropTarget`, the target under the pointer other than the subject. It is resolved before the subject's handler runs |
| `pinchstart`, `pinch`, `pinchend` | `scale`, `scaleDelta`, `rotation`, `rotationDelta`, `distance` and `centre` as `{ ui, world }`. The event's own `ui` and `world` are the pinch centre |
| `scroll` | `scroll`, `{ x, y }` in pixels |
| `keydown`, `keyup` | `code`, the physical key code, and `key`, the character the layout produced. `modifiers` is filled in, so Shift+Tab is distinguishable from Tab |
| `pointerlockchange` | `locked` |

## Delivery order

Each event is offered to the overlay band, then the UI band, then the world band. The topmost hit in the highest band becomes the single target and receives the event. Then every subscriber registered with `on` for that type runs, ordered by their `band` option. Calling `consume()` at any point stops everything after it, so a consumed target event never reaches subscribers.

The overlay band is the engine's own UI, [`game.ui`](./ui#screenstack): the debug layer first, then screens from the top of the stack down, stopping at the first `blocking` one. It is checked first for every event, including key events, which is what makes an open menu modal without any global capture listeners. Key *releases* still reach the game even through a blocking screen, so a key held when the menu opened comes back up in the game's state rather than leaving the player running.

A mounted settings menu consumes its hotkey on `keydown` even while closed, so game code never sees that key once a menu exists.

Presses, releases and key events are delivered inside the browser event handler, so fullscreen and pointer lock requests made from them are allowed. Moves and scrolls are buffered and delivered at the start of the next frame.

The canvas claims its surface. It sets `touch-action: none`, contains overscroll, disables text selection and the context menu and captures the pointer on every press so a drag that leaves the canvas keeps reporting.

## Browser defaults

Two rules decide whether a keypress also reaches the browser:

- Keys a game **polls** — `Space`, `Tab`, `Enter`, the arrows, `PageUp`, `PageDown`, `Home`, `End`, `Backspace` — are suppressed because nothing consumes them, so there is no other signal that they were wanted. Replace the list with the `preventDefaultKeys` engine option.
- Any other key is suppressed exactly when something **consumed** it. That is what keeps F3 from opening the find bar while it toggles the readout, and the settings hotkey from reaching the page, without a second list to maintain. It resolves synchronously inside the DOM handler, because key records drain immediately rather than waiting for a frame.

Either way a held `Ctrl`, `Alt` or `Meta` cancels the suppression: that is the player reaching for a browser shortcut rather than for the game. A consumed press is also never recorded as held, so the game does not see the key down.
