# UI

Screen-space UI is drawn through `game.uiRenderer` at the display's full resolution, independent of the world render resolution. A scene's UI lives in its container, `scene.ui`. A UI scene's `elements` populate it, and code can add elements to any scene.

The [UI components reference](../reference/ui) lists every component and option.

<Demo name="ui">
Text and a background from scene JSON. Buttons, a counter and a custom progress bar added from code. The buttons are anchored to the bottom corners and the bottom centre.
</Demo>

## Adding elements from code

Add elements in the scene's `onEnter` hook. The container sets the element's `game` reference and includes it in drawing and hit testing.

```javascript
import { UIButton } from 'm2d-engine/core/ui/button.js';
import { UIText } from 'm2d-engine/core/ui/text.js';

game.sceneManager.addScene('level1', {
  fetch: async () => (await import('./scenes/level1.json')).default,
  onEnter() {
    const ui = game.sceneManager.getCurrentScene().ui;
    ui.addElement(new UIText(20, 20, 'Score: 0', { fontSize: '20px', color: '#fff' }));
    ui.addElement(new UIButton(-20, -20, 140, 40, 'Menu',
      () => game.sceneManager.switchTo('mainMenu'), { anchor: 'bottom-right' }));
  }
});
```

The container is cleared when the scene unloads.

## Positions

An element stores an offset from its anchor. Reading `x` or `y` resolves the offset against the current UI size, and writing them writes the offset. See [UI anchors](./display#ui-anchors).

Buttons, rectangles and images are centred on their position. Text is drawn from its position according to its `align` option.

## Built-in components

| Component | Purpose |
| --- | --- |
| `UIButton` | A clickable button with hover and pressed colours |
| `UIText` | A line of text |
| `UIImage` | An image, optionally scaled |
| `UIRectangle` | A filled rectangle. `fill: true` covers the whole screen |
| `PerformanceStats` | Frame rate and draw statistics. Every scene adds one at the bottom-left unless the `performanceStats` engine option is `false` |

## Writing a component

Extend `UIElement`. Draw with `this.game.uiRenderer`, which accepts the drawing calls of the world renderer in screen space. Handle input by implementing `on*` methods.

```javascript
import { UIElement } from 'm2d-engine/core/ui/uiElement.js';

export class HealthBar extends UIElement {
  constructor(x, y, options = {}) {
    super(x, y, 200, 16, options);
    this.value = 1;
  }

  draw() {
    const ui = this.game.uiRenderer;
    const left = this.x - this.width / 2;
    const top = this.y - this.height / 2;
    ui.drawRect({ x: left, y: top, width: this.width, height: this.height, fillStyle: '#333' });
    ui.drawRect({ x: left, y: top, width: this.width * this.value, height: this.height, fillStyle: '#2ecc71' });
  }
}
```

| Method | Receives |
| --- | --- |
| `onPointerDown`, `onPointerUp`, `onPointerMove` | Raw pointer events over the element |
| `onClick` | A click |
| `onDoubleClick`, `onRightClick` | Call `this.wants('doubleclick')` or `this.wants('rightclick')` in the constructor. Without it a double click is two clicks and a long press is a click |
| `onHover`, `onHoverEnd` | Pointer entering and leaving |
| `onDragStart`, `onDrag`, `onDragEnd`, `onDrop` | Drag gestures. Call `this.wants('dragstart', 'drag', 'dragend', 'drop')` in the constructor, since drags are recognized only when something wants them |
| `onScroll`, `onPointerMove` | Wheel and pointer movement. Delivered without `wants()`. Call `this.wants('scroll')` to consume scrolls so the world does not also see them |

An element is a hit target only when it has a positive `width` and `height`. `isHovered` and `isPressed` are tracked for every element. A handled event is consumed by default, so nothing underneath reacts. Pass `{ consume: false }` to let events through.

The element's `update(deltaTime)` runs every frame before drawing, except while the game is paused.

## A game built on the UI layer

A game can run entirely in screen space. The doner example draws its whole board through `game.uiRenderer` and uses the world only for a physics-free scene shell. See [Example games](../examples/#doner).

## Demo source

<<< @/demos/ui.js
