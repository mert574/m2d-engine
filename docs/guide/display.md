# Display and resolution

The engine keeps three sizes separate.

| Size | Meaning | Set by |
| --- | --- | --- |
| View | How much world is visible, in world units | The `width` and `height` options |
| World render resolution | How many pixels the world is drawn with | The `resolution` option and `setResolution` |
| UI resolution | The display's pixel density, capped at a pixel ratio of 3 | The display |

Lowering the render resolution makes the world coarser. It does not show more or less of the world, and it does not affect the UI.

A number is a **fraction of native**, the way a game's resolution-scale slider reads: `0.5` is half the linear resolution this display would show, so it means 1920x1080 on a 4K panel and 640x360 on a 720p one. A `{ width, height }` preset is absolute: it names the surface, which is what pixel art wants. `1` and `'native'` are the same thing.

<Demo name="display">
The world starts at a quarter of the display resolution. The left drawing goes through the world renderer and is blurred with it. The right drawing goes through the world overlay and the HUD at the bottom-left is UI, both at display resolution. Click to cycle the world resolution. Right-click or long-press to switch between linear and nearest filtering.
</Demo>

```javascript
const game = new M2D(canvas, {
  width: 1280, height: 720,   // the view, in world units
  aspectMode: 'letterbox',    // or 'expand'
  resolution: 'native',       // or 0.5 (half of native), or { width: 640, height: 360 }
  worldFilter: 'linear'       // or 'nearest' for pixel art
});

game.setResolution(0.5);                        // half the linear resolution of native
game.setResolution({ width: 1280, height: 720 });   // only height sets the scale. width is a label
game.setResolution('native');
game.setWorldFilter('nearest');
game.setAspectMode('expand');
game.toggleFullscreen();                        // also requestFullscreen() and exitFullscreen()
game.isFullscreen;

const off = game.onResize((width, height, viewport) => { /* relayout */ });
```

## The viewport

`game.viewport` holds the sizes computed for the current display. It is plain data and is recomputed on every display change. `game.onResize` handlers receive it as their third argument.

| Field | Unit | Meaning |
| --- | --- | --- |
| `backingWidth`, `backingHeight` | device pixels | Size of the canvas drawing buffer |
| `pixelRatio` | | Device pixels per CSS pixel, capped at 3 |
| `viewWidth`, `viewHeight` | world units | How much world is visible |
| `worldWidth`, `worldHeight` | pixels | Size of the world render surface |
| `worldScale` | | World surface pixels per world unit |
| `contentX`, `contentY`, `contentWidth`, `contentHeight` | backing pixels | Where the world is presented inside the canvas. The rest is letterbox |
| `uiWidth`, `uiHeight` | UI units | Size of UI space |
| `uiScale` | | Backing pixels per UI unit |

## Sizing the canvas

Give the canvas a CSS size and let the engine fill it. The engine watches the element's displayed size, the device pixel ratio and fullscreen changes, applies changes between frames and letterboxes inside the element. Do not size the element from its own `width` and `height` attributes, and do not use `object-fit`.

```css
#screen { display: block; width: 100%; height: 100%; }
```

## Aspect mode

When the display's aspect ratio differs from the view's, `aspectMode` decides what happens.

| Mode | Behaviour |
| --- | --- |
| `letterbox` | The view keeps its aspect ratio and is centred with bars. Nothing beyond the designed view is shown. Default |
| `expand` | The view grows along the wide axis at the same scale, so more world becomes visible |

UI space covers the whole display in both modes. Games that use `expand` should set [camera bounds](./camera#bounds) so the wider view does not reveal space past the map.

## World filter

Below native resolution the world is drawn into a smaller surface and scaled up to the screen. `worldFilter` chooses the scaling. `nearest` keeps pixels blocky, which suits pixel art. `linear` smooths them. The setting has no effect at native resolution.

## UI anchors

UI space always covers the whole screen, and its width changes with the aspect ratio. Elements are positioned as an offset from an anchor so they track the real screen edges.

```javascript
new UIButton(-20, -20, 160, 40, 'Settings', onClick, { anchor: 'bottom-right' });
```

Anchors are `top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom` and `bottom-right`. The default is `top-left`, where the offset is an absolute position. Scene JSON elements take the same `anchor` field.

A full-screen background uses a rect with `fill: true` instead of a size, since no fixed-size rect can cover a space that widens with the display.

`game.worldToUI(x, y)` maps a world position into UI space, for pinning a screen-space label to a world object. Input events carry both spaces already.

## The world overlay

Annotations on the world, such as a detection ring, an aim line or a readout over an enemy, should not go through the world renderer. At a low render resolution a thin ring breaks into steps and a small dot disappears.

`game.worldOverlay` takes world coordinates and draws them in a later pass at display resolution. Its methods mirror the renderer's, so moving a call is a one-word change.

```javascript
draw() {
  const overlay = this.game.worldOverlay;
  const { x, y } = this.renderPosition;

  // Shapes keep their world size, so the ring stays on the 200 units it describes.
  overlay.drawArc({ x, y, radius: 200, strokeStyle: '#ff03' });

  // Text keeps a fixed UI size, so it is as readable at any resolution.
  overlay.drawText({ x, y, offsetY: -20, text: `hp ${hp}/${max}`, fillStyle: '#0f0', fontSize: '12px' });
}
```

Submissions are per frame. The overlay accepts `drawRect`, `drawArc`, `drawLine`, `drawPath`, `drawImage`, `drawSprite` and `drawText`. For `drawText`, `x` and `y` are world coordinates and `offsetX`, `offsetY` and `fontSize` are UI units. Other text options pass through. Shapes draw first and text on top. The overlay is clipped to the world's content area, so nothing spills onto the letterbox bars. Text anchored far outside the view is skipped.

The engine's debug drawing uses the overlay. An actor's own appearance stays in the world pass.

## Debug overlay

`game.renderer.setDebugEnabled(true)` turns on debug drawing. The `Debug` constraint and several built-in actors draw bounds, velocities, ranges and readouts when it is on. The settings menu has a row for it.

## The settings menu

`SettingsMenu` is a [screen](./ui#screens) with rows for resolution presets, fullscreen, aspect mode, the renderer backend, the debug overlay and pause, grouped under Display, Rendering and Game. A 3D game also gets a Shadows row and an Effects section with one switch per post-process stage. When a scene named `mainMenu` is registered, a Main menu row returns to it from anywhere else. It opens with O by default and closes with O, Escape, its Close row or a click outside the panel. Up, Down and Tab move between rows; Left and Right step the focused row's value; Enter or a click steps it forward. Each row draws a tick track showing where its value sits in its cycle, and the footer describes the focused row and lists the keys.

A mounted menu consumes the hotkey on `keydown` whatever is on screen (it listens in the debug layer, ahead of every screen, so it opens from a main menu as well as mid-game) and Escape while it is open.

```javascript
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';

new SettingsMenu(game);
new SettingsMenu(game, { hotkey: 'KeyP', resolutions: ['native', 0.5], pauseWhenOpen: true });
```

| Option | Default | Meaning |
| --- | --- | --- |
| `hotkey` | `'KeyO'` | Physical key code that toggles the menu |
| `resolutions` | `['native', 0.75, 0.5, 0.25]` | Choices offered. `'native'`, fractions of native (shown as a percentage and the surface they produce), or `{ width, height }` presets |
| `pauseWhenOpen` | `false` | Pause the game while the menu is open and restore the previous state on close |

While open, the menu receives every input event before the scene's UI and the world. It consumes what it receives. Key releases pass through so a key held when the menu opened still releases in the game.

A game adds its own rows with `addOption`:

```javascript
new SettingsMenu(game).addOption({
  section: 'Game',
  label: 'Music',
  value: () => (muted ? 'Off' : 'On'),
  step: () => toggleMusic(),
  choices: () => ({ index: muted ? 0 : 1, count: 2 }),
  description: 'Background music.'
});
```

`value` reads live state, `step(±1)` changes it (Left, Right, click and Enter all step), `choices` feeds the row's tick track, and `description` shows in the footer while the row is focused. Rows join a built-in section by name (`Display`, `Rendering`, `Effects`, `Game`) or group under their own caption; an action row passes `activate` instead of `step`. Every demo adds a shared Audio row this way.

The mounted menu is `game.settings`. A scene button with `"action": "settings"` opens it. Choosing the renderer backend reloads the page with `?renderer=canvas` or `?renderer=webgl`.

The menu is pushed onto `game.ui`, so it sits over a live, loaded game, and closing pops back to whatever was below. Every row is a view onto a [cvar](../reference/console), the same `r_aspect` the developer console sets, so resolution, aspect and the world filter persist across sessions, and a change made in either place shows up in the other. It draws through `game.drawOverlays()`, which the engine loop calls at the end of every frame; a game with its own loop must call that, and `game.ui.update(deltaTime)` before it.

## Demo source

<<< @/demos/display.js
