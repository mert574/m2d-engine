# UI

Screen-space UI is drawn through `game.uiRenderer` at the display's full resolution, independent of the world render resolution. A scene's UI lives in its container, `scene.ui`. A UI scene's `elements` populate it, and code can add elements to any scene.

The [UI components reference](../reference/ui) lists every component, option and theme token.

<Demo name="ui">
Text and a background from scene JSON. Buttons, a counter and a custom progress bar added from code. The buttons are anchored to the bottom corners and the bottom centre.
</Demo>

## Adding elements from code

Add elements in the scene's `onEnter` hook. Every component takes one options object, and `add` returns the element so it can be captured.

```javascript
import { UIButton } from 'm2d-engine/core/ui/button.js';
import { UIText } from 'm2d-engine/core/ui/text.js';

game.sceneManager.addScene('level1', {
  fetch: async () => (await import('./scenes/level1.json')).default,
  onEnter() {
    const ui = game.sceneManager.getCurrentScene().ui;
    ui.add(new UIText({ x: 20, y: 20, text: 'Score: 0', fontSize: '$font.size.subheading' }));
    ui.add(new UIButton({
      x: -20, y: -20, width: 140, height: 40, anchor: 'bottom-right',
      text: 'Menu', onClick: () => game.sceneManager.switchTo('mainMenu')
    }));
  }
});
```

The container is cleared when the scene unloads.

## Positions

An element stores an offset from its **anchor** — a named point in its parent's content box — and its **pivot** decides which point of the element lands there.

```javascript
// 20 units in from the real bottom-right corner, at any aspect ratio.
new UIButton({ x: -20, y: -20, anchor: 'bottom-right', pivot: 'bottom-right' })
```

Reading `x` or `y` resolves the offset against the current size, and writing them writes the offset, so `element.x += 5` still nudges by 5. `frame` is the box the element covers and `contentBox` is that box minus its `padding`. See [UI anchors](./display#ui-anchors).

The default pivot is `center`, so most components sit centred on their position. Text is the exception: its pivot follows its `align` and `baseline`, so a left-aligned label's position is where the text starts.

## Nesting

Elements form a tree. A child anchors against its parent's **content box** rather than the screen, so moving a panel moves everything in it, and a child anchored to the panel's right edge stays on the panel's right edge at any display size.

```javascript
import { UIPanel } from 'm2d-engine/core/ui/panel.js';

const card = ui.add(new UIPanel({
  anchor: 'center', width: 320, height: 180, padding: 20, elevation: 'medium'
}));
card.add(new UIText({ anchor: 'top-left', text: 'Paused', fontSize: '$font.size.heading' }));
card.add(new UIButton({ anchor: 'bottom', pivot: 'bottom', width: 200, text: 'Resume' }));
```

Later children draw on top of earlier ones and are hit-tested first. `opacity` compounds down the tree, and `scale`, `rotation` and `clipChildren` apply to the whole subtree — so a component that knows nothing about animation can still be faded, scaled and clipped by its parent.

## Layout

A `Stack` lays its children out in a row or a column, so a menu says what it means instead of carrying hand-tuned offsets:

```javascript
import { Stack } from 'm2d-engine/core/ui/layout/stack.js';

const column = ui.add(new Stack({
  anchor: 'center', pivot: 'center',
  direction: 'column', gap: '$space.sm', align: 'stretch', width: 240
}));
column.add(new UIButton({ height: 44, text: 'Continue', variant: 'primary' }));
column.add(new UIButton({ height: 44, text: 'Settings' }));
column.add(new UIButton({ height: 44, text: 'Quit', variant: 'danger' }));
```

Each axis is sized independently: the stack above has a fixed width, so `align: 'stretch'` gives every button that width, and a free height, so it is as tall as however many buttons there are. Add or remove one and nothing needs re-tuning. A hidden child collapses rather than leaving a hole.

`Grid` does the same on a fixed column count with uniform cells, for inventories and level-select pages. `Spacer` is blank space.

A layout owns its children's placement — it writes their offsets and pins their `anchor` and `pivot` — so setting a child's `x` inside one has no effect. Use the stack's `padding`, the `gap`, or a `Spacer`.

Layout runs after the children have updated, so a label that measures itself has already done so, and nested layouts resolve innermost-first.

## Theming

Components do not carry colours. They name **tokens**, and the theme decides what those are:

```javascript
new UIPanel({ background: '$color.surface.raised', cornerRadius: '$radius.lg' })
```

Any string beginning with `$` is a dotted path into the theme, resolved wherever a colour, size, family, weight, radius or shadow is accepted. Literals pass through, so `'#102030'` is always allowed.

Restyling a whole game — every button, panel, dialog and the debug readout — is one option:

```javascript
import { createTheme } from 'm2d-engine/core/ui/theme.js';

const game = new M2D(canvas, {
  theme: { color: { accent: { default: '#ff6600', hover: '#ff8833' } } }
});
```

Tokens can reference other tokens, which is how the semantic names (`$color.text.primary`) are written in terms of the raw ramp (`$color.palette.slate.50`). Overriding one palette entry therefore moves everything built on it. The full token list is in the [reference](../reference/ui#theme-tokens).

### Type

The engine ships [Exo](https://fonts.google.com/specimen/Exo) as a variable font, so weights are real rather than synthesized, and italic is a drawn face:

```javascript
new UIText({ text: 'Chapter One', fontSize: '$font.size.title', fontWeight: '$font.weight.bold' })
new UIText({ text: 'a whisper', fontStyle: 'italic', color: '$color.text.muted' })
new UIText({ text: 'NEW GAME', letterSpacing: '$font.tracking.widest' })
```

Tracked-out uppercase is half of why game UI reads as game UI rather than as a web page — the `$font.tracking.*` tokens cover it, and large display type takes `tight` rather than `wide`. Tracking is counted in the measured width, so a layout built on it is correct. Where a browser lacks `ctx.letterSpacing` the text draws untracked.

`M2D.start()` waits for the font before the first frame. The WebGL backend caches each rasterized label as a texture, so a label drawn before the font arrived would stay in the fallback face.

## Screens

A menu is not a scene. `sceneManager.switchTo` *unloads* the current scene — entities, bodies and sprite sheets all gone — and keeps no history, so a pause menu over a live level is impossible that way.

Screens are pushed onto `game.ui` over whatever is already running:

```javascript
import { UIScreen } from 'm2d-engine/core/ui/screen.js';

class PauseScreen extends UIScreen {
  constructor() {
    super({ name: 'pause', scrim: true, pauseGame: true });
    const column = this.add(new Stack({ anchor: 'center', pivot: 'center', width: 240 }));
    column.add(new UIButton({ height: 44, text: 'Resume', onClick: () => this.close() }));
    column.add(new UIButton({ height: 44, text: 'Settings', onClick: () => game.settings.open() }));
  }
}

game.ui.push(new PauseScreen());
```

The game stays loaded and visible underneath. `pop()` goes back, and Escape does it for you — so pause → settings → Escape → Escape walks back out to the game, one step at a time.

| Option | Effect |
| --- | --- |
| `blocking` | Consume input, so nothing behind reacts. This is the whole of "the menu blocks the game" |
| `scrim` | Dim what is behind |
| `pauseGame` | Freeze the simulation while the screen is up, restoring the previous pause state on the way out |

Tabs belong *inside* one screen, not on the stack: a tab bar swapping a content slot is one screen, because Escape should leave the whole dialog rather than the current tab.

`game.ui.debug` is a layer above every screen and outside the scene's container, for things that must survive a scene switch. The frame-rate readout lives there.

## Keyboard and controller navigation

Every screen owns a `FocusManager` scoped to itself, so Tab cannot walk out of a dialog into the game behind it. Mark a control `focusable: true` — `UIButton` and `UIOptionRow` already are — and the screen handles the rest:

| Key | Effect |
| --- | --- |
| Tab, Shift+Tab | Next or previous control in draw order, wrapping |
| Arrows | Geometric movement. Pressing right from the left column of a grid reaches the thing *beside* it, not the next item in the list. Does not wrap |
| Enter, Space | Activate the focused control, as a real press and release |
| Escape | Pop the screen |

A screen focuses its first control on entry, so it is usable from a controller without first pressing a direction.

**Selection is one appearance.** `state` reports `'hovered'` for a keyboard-selected control as well as a pointer-hovered one, because to a player they mean the same thing: *this is the one that will happen*. There is no separate focused state and nothing draws a ring. Moving the pointer onto a control also hands it focus, so the keyboard and the mouse never highlight two different things.

## Motion

`game.motion` interpolates numeric properties over wall-clock time. It is ticked outside the pause gate, so a menu over a frozen game still animates.

```javascript
game.motion.to(panel, { opacity: 1 }, { duration: '$motion.duration.slow' });
game.motion.from(card, { scaleX: 0.9, scaleY: 0.9 }, { easing: '$motion.easing.overshoot' });
game.motion.stagger(items, { opacity: 1 }, { from: { opacity: 0 }, stagger: 0.06 });
```

Durations and easings come from the theme, so changing the feel of every transition is one override. Starting a tween on a property that is already animating cancels the earlier one for that property only, so a fade and a slide do not fight.

**A layout owns its children's offsets** and rewrites them every frame. Inside a `Stack` or `Grid`, animate `opacity`, `scale` or `rotation` — never `offsetX`/`offsetY`. To move a laid-out group, animate the container, which is what the examples' main menu does: the column rises as one piece while the items fade in one after another.

## Screen transitions and backdrops

A screen arrives and leaves with its `transition` — `'fade'` (the default), `'slide-up'`, `'slide-down'`, `'scale'`, or `null` for instant. Transitions only touch the screen's own opacity, offset and scale, so it moves as one piece and the resting layout stays the truth: adding one can never change where a screen ends up.

A screen on its way out keeps drawing, beneath the live ones, until its exit finishes — and pushing it again mid-exit brings it back rather than letting it finish leaving.

`UIBackdrop` is the layered background a menu sits on: a graded wash, an optional drifting still, slow motes, scanlines and a vignette. A flat fill behind the type is the single thing that made the old demo menus read as a web page rather than a game.

```javascript
import { UIBackdrop } from 'm2d-engine/core/ui/backdrop.js';

screen.add(new UIBackdrop({
  gradient: { from: '#06121c', to: '#123a52', angle: 115 },
  motes: 80,
  vignette: 0.55
}));
```

The built-in layers give every menu the same depth. `layers` is where a menu becomes a place: anything the game draws itself goes between the gradient and the motes. A layer is an object with `draw(paint, frame)` and an optional `update(deltaTime, frame)`, where `frame` is `{ width, height, elapsed }`. It draws through the backdrop's painter, so theme tokens resolve and it fades with the screen. Each example game ships one in its `menuBackdrop.js`: a dusk skyline, a surveyed maze, a running simulation.

```javascript
const horizon = {
  draw(paint, { width, height, elapsed }) {
    const y = height * 0.6 + Math.sin(elapsed * 0.2) * 4;
    paint.drawRect({ x: 0, y, width, height: height - y, fillStyle: '$color.bg.base' });
  }
};

screen.add(new UIBackdrop({ gradient: null, layers: [horizon], vignette: 0.5 }));
```

### Blurring the game behind a menu

`blurBehind` on a screen defocuses the world beneath it. The post-effect pass runs between the world and screen passes, so the menu drawn over it stays sharp.

```javascript
new UIScreen({ name: 'pause', scrim: true, blurBehind: 10 })
```

It needs the `postEffects` capability. On the Canvas backend there is no blur and the `scrim` carries the separation alone — the usual [capability degradation](../reference/renderer), not an error.

## Built-in components

| Component | Purpose |
| --- | --- |
| `UIPanel` | A themed surface with border, radius and elevation. The box other chrome sits on |
| `UIButton` | A clickable button. Picks a `variant` — `primary`, `secondary`, `ghost`, `danger` — rather than colours |
| `UIText` | A line of text. Measures itself, so it has a real box |
| `UIImage` | An image, optionally scaled and tinted |
| `UIRectangle` | A flat rectangle. `fill: true` covers the whole screen |
| `UIMenuItem` | One line in a game menu: a tracked uppercase label with a selection bar, not a filled button |
| `UIOptionRow` | A settings row: label, current value, and a click that changes it |
| `Stack`, `Grid`, `Spacer` | Layout containers |
| `UIBackdrop` | A layered menu background: gradient, drifting still, custom layers, motes, scanlines, vignette |
| `PerformanceStats` | Frame rate and draw statistics, collapsed to a pill or expanded with **F3** to the full list and a frame-time trace. The engine adds one at the bottom-left unless the `performanceStats` engine option is `false` |

## Writing a component

Extend `UIElement` and draw with `this.paint`, which takes the same calls as the renderer but resolves theme tokens, folds in inherited opacity and supplies the UI font. Handle input by implementing `on*` methods.

```javascript
import { UIElement } from 'm2d-engine/core/ui/uiElement.js';

export class HealthBar extends UIElement {
  constructor(options = {}) {
    super({ width: 200, height: 16, ...options });
    this.value = 1;
  }

  draw() {
    const { x, y, width, height } = this.frame;
    this.paint.drawRect({
      x, y, width, height,
      fillStyle: '$color.surface.sunken', cornerRadius: '$radius.pill'
    });
    this.paint.drawRect({
      x, y, width: width * this.value, height,
      fillStyle: '$color.status.success', cornerRadius: '$radius.pill'
    });
  }
}
```

Override `draw` for this element only; children are drawn by the traversal around it. The same goes for `update(deltaTime)`, which runs every frame **including while the game is paused**, so a menu over a frozen game still animates.

| Method | Receives |
| --- | --- |
| `onPointerDown`, `onPointerUp`, `onPointerMove` | Raw pointer events over the element |
| `onClick` | A click |
| `onDoubleClick`, `onRightClick` | Call `this.wants('doubleclick')` or `this.wants('rightclick')` in the constructor. Without it a double click is two clicks and a long press is a click |
| `onHover`, `onHoverEnd` | Pointer entering and leaving |
| `onDragStart`, `onDrag`, `onDragEnd`, `onDrop` | Drag gestures. Call `this.wants('dragstart', 'drag', 'dragend', 'drop')` in the constructor, since drags are recognized only when something wants them |
| `onScroll`, `onPointerMove` | Wheel and pointer movement. Delivered without `wants()`. Call `this.wants('scroll')` to consume scrolls so the world does not also see them |
| `onMount`, `onUnmount` | The element joined or left a live tree. The place to subscribe and unsubscribe |
| `onFocus`, `onBlur` | Keyboard focus arrived or left |

An element is a hit target only when it has a positive `width` and `height`. A handled event is consumed by default, so nothing underneath reacts; pass `{ consume: false }` to let events through.

### Interaction states

`state` reports `'normal'`, `'hovered'`, `'pressed'`, `'focused'` or `'disabled'`. Declare the look once with per-state deltas and let `styleFor` flatten it, rather than branching in `draw`:

```javascript
this.styles = {
  background: '$color.surface.default',
  hovered: { background: '$color.surface.hover' },
  pressed: { background: '$color.surface.active' },
  disabled: { background: '$color.surface.sunken' }
};

draw() {
  const style = this.styleFor(this.styles);
  this.paint.drawRect({ ...this.frame, fillStyle: style.background });
}
```

A disabled element still consumes input — a greyed-out control that let the click through would fire whatever is behind it — but runs no handlers and tracks no hover or press state.

## A game built on the UI layer

A game can run entirely in screen space. Draw the whole board through `game.uiRenderer` and use the world only as a physics-free scene shell, so the scene manager and the settings menu still work.

## Demo source

<<< @/demos/ui.js
