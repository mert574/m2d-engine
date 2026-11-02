# UI components

Screen-space components from `m2d-engine/core/ui/`. All positions are offsets from the element's anchor in UI units. See [UI](../guide/ui) for usage.

## UIElement

`new UIElement(x, y, width, height, options)` from `uiElement.js`. The base class.

| Option | Default | Meaning |
| --- | --- | --- |
| `anchor` | `'top-left'` | Screen anchor the offset is measured from |
| `consume` | `true` | Consume handled events |

| Member | Meaning |
| --- | --- |
| `x`, `y` | Resolved position. Writing them writes the offset |
| `offsetX`, `offsetY` | The stored offset |
| `width`, `height` | Hit size. An element without both is never a hit target |
| `visible` | Skipped by hit testing when `false`. Drawing still runs, so a `draw` override checks it |
| `isHovered`, `isPressed` | State tracked by the router |
| `wants(...types)` | Declare interest in event types outside the default set of `pointerdown`, `pointerup`, `click`, `hover` and `hoverend`. Handlers run for every routed event. `wants()` switches on recognition of `doubleclick`, touch `rightclick` and the drag events, and makes the element consume the types it names |
| `update(deltaTime)`, `draw(deltaTime)` | Per-frame hooks |
| `contains(x, y)` | Hit test against the centred rectangle |
| `on*` methods | Event handlers. See [Writing a component](../guide/ui#writing-a-component) |

## UIButton

`new UIButton(x, y, width, height, text, onClick, style)` from `button.js`. Centred on its position. Fires `onClick(event)` on release.

| Style | Default |
| --- | --- |
| `backgroundColor` | `'#000'` |
| `hoverColor` | `'#333'` |
| `pressedColor` | `'#555'` |
| `textColor` | `'#fff'` |
| `fontSize` | `'16px'` |
| `fontFamily` | `'system-ui'` |
| `anchor` | `'top-left'` |

## UIText

`new UIText(x, y, text, options)` from `text.js`. Drawn with the top baseline at `y`, aligned by `align`.

| Option | Default |
| --- | --- |
| `fontSize` | `'16px'` |
| `color` | `'#000'` |
| `fontFamily` | Not an option. Always the renderer default, `system-ui` |
| `align` | `'left'` |
| `anchor` | `'top-left'` |

The `text` property can be changed at any time.

## UIImage

`new UIImage(x, y, image, options)` from `Image.js`. Centred on its position.

| Option | Default |
| --- | --- |
| `width`, `height` | The image size |
| `scale` | `1` |
| `anchor` | `'top-left'` |

## UIRectangle

`new UIRectangle(x, y, width, height, color, options)` from `Rectangle.js`. Centred on its position.

| Option | Default | Meaning |
| --- | --- | --- |
| `fill` | `false` | Cover the whole UI space every frame |
| `interactive` | `false` | Take part in hit testing |
| `anchor` | `'top-left'` | |

## PerformanceStats

`new PerformanceStats(game, x, y, options)` from `performanceStats.js`. One line of text with frame rate, primitives, draw calls, state changes, sprites, text and shapes.

| Option | Default |
| --- | --- |
| `show` | `false` |
| `textColor` | `'#00ff00'` |
| `fontSize` | `'14px'` |
| `fontFamily` | `'monospace'` |
| `anchor` | `'top-left'` |

Every scene adds one at the bottom-left with `show: true` unless the `performanceStats` engine option is `false`.

## Container

`scene.ui` from `container.js`. Holds a scene's elements.

| Method | Meaning |
| --- | --- |
| `addElement(element)` | Add and set the element's `game`. Returns the element |
| `removeElement(element)` | |
| `clear()` | |
| `hitTest(x, y, exclude)` | Topmost visible element containing the point |
| `elements` | The underlying `Set`, in insertion order. Later elements draw on top |
| `handles(type)` | Whether any visible element wants the event type |
| `update(deltaTime)`, `draw(deltaTime)` | Called by the scene each frame |

## SettingsMenu

`new SettingsMenu(game, options)` from `settingsMenu.js`. An overlay drawn above every scene. See [The settings menu](../guide/display#the-settings-menu).

| Member | Meaning |
| --- | --- |
| `open()`, `close()`, `toggle()` | |
| `isOpen` | |
| `hotkey`, `resolutions`, `pauseWhenOpen` | The options as given |
| `destroy()` | Remove from `game.overlays` |

## WorldOverlay

`game.worldOverlay` from `worldOverlay.js`. See [The world overlay](../guide/display#the-world-overlay).

| Method | Meaning |
| --- | --- |
| `drawRect`, `drawArc`, `drawLine`, `drawPath`, `drawImage`, `drawSprite` | Renderer options in world coordinates and world sizes |
| `drawText(options)` | `x`, `y` in world coordinates. `offsetX`, `offsetY` and `fontSize` in UI units |

Submissions are cleared at the start of each world pass. At most 2000 per frame are kept, and the first overflow logs a warning. Text anchored more than 200 UI units outside the content area is skipped. Shapes are never skipped, only clipped.
