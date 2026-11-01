# Display & UI

`width` and `height` are the **design size**: how much world is visible, in
world units. The engine tracks the canvas's displayed size, the device pixel
ratio and fullscreen transitions on its own, and keeps three resolutions
independent so each can be set for the right reason:

- **View** — how much world the camera shows (the design size)
- **World render** — how sharply the world is drawn
- **UI** — always the display's full pixel density

```javascript
const game = new M2D(canvas, {
  width: 1280, height: 720,   // design size = the camera's view, in world units
  aspectMode: 'letterbox',    // or 'expand' to widen the view on wider displays
  resolution: 'native',       // world render resolution; see setResolution
  worldFilter: 'linear'       // 'nearest' for pixel art
});

// A settings menu changes only how sharply the world is drawn. The same
// amount of world stays visible, and the UI stays at display resolution.
game.setResolution({ width: 1280, height: 720 });
game.setResolution('native');

game.setWorldFilter('nearest');  // how the world is upscaled below 'native'
game.toggleFullscreen();      // also requestFullscreen() / exitFullscreen()
game.onResize((width, height) => { /* relayout a custom HUD */ });
```

Below `'native'` the world is rendered into a surface of its own and scaled up
to the screen, so `worldFilter` decides what that scaling looks like:
`'nearest'` keeps pixel art blocky and crisp, `'linear'` smooths it. At
`'native'` there is nothing to upscale and the setting does not apply.

Give the canvas an explicit CSS size (`width: 100%; height: 100%`) and let the
engine letterbox inside it — `object-fit: contain` is not needed, and sizing
the element from its own `width`/`height` attributes fights the engine's
resize tracking.

## Anchored UI

UI is drawn at the display's full pixel density regardless of the world
resolution, and UI space always covers the whole screen. Position UI against
an anchor so it tracks the real screen edges at any aspect ratio:

```javascript
new UIButton(-20, -20, 160, 40, 'Settings', onClick, { anchor: 'bottom-right' });
```

Scene JSON elements take the same `"anchor"` field. The default is
`'top-left'`, where the offset is just an absolute position. For full-screen
backgrounds give a rect `"fill": true` instead of a size — UI space widens
with the display, so no fixed design-sized rect can be relied on to cover it:

```json
{ "type": "rect", "id": "background", "fill": true, "color": "#298ccc" }
```

Games that follow a player should also set camera bounds so neither the
follow nor an `'expand'` aspect mode reveals the void past the map; when the
view is larger than the bounded area, the camera centres on it:

```javascript
game.camera.bounds = { left: 0, top: 0, right: worldWidth, bottom: worldHeight };
```

Pointer events already carry both spaces (see [Input](./input)), so nothing
has to map a position by hand. The opposite direction is
`game.worldToUI(x, y)`: where a world point lands in UI space.

## The world overlay

Content drawn *on* the world rather than *in* it — an enemy's attention
radius, an attack range, a target dot, a readout over someone's head — should
not go through the world renderer, where it blurs with the render resolution.
Submit it to the **world overlay** instead: world coordinates in, rasterized
by the engine's overlay pass at full display sharpness. The API mirrors the
renderer's, so switching is a one-word change:

```javascript
// Inside any draw(): per-frame submissions, like ordinary draw calls.
const overlay = game.worldOverlay;

// Geometry keeps its world size, so it stays glued to what it describes.
overlay.drawArc({ x: enemy.x, y: enemy.y, radius: enemy.detectionRange,
                  startAngle: 0, endAngle: Math.PI * 2, strokeStyle: '#ff03' });

// Text keeps a fixed UI size, so it stays equally legible at any resolution.
overlay.drawText({ x: enemy.x, y: enemy.y,   // world anchor
                   offsetY: -20,             // UI units
                   text: `hp: ${hp}/${max}`, fillStyle: '#0f0', fontSize: '12px' });
```

The engine's own debug visuals — detection ranges, aim lines, facing vectors,
bounds boxes and every readout — already go through this, so the debug
overlay (toggled from the settings menu) stays readable at any resolution. An
actor's actual appearance stays in the world pass, where it is meant to share
the world's fidelity.

## The settings menu

A ready-made settings overlay ships with the engine and is mounted in every
example — resolution presets, fullscreen, aspect mode, debug overlay,
renderer backend and pause, toggled with **O** (Escape closes it too):

```javascript
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';

new SettingsMenu(game);                      // that's all
new SettingsMenu(game, { hotkey: 'KeyP', resolutions: ['native', 0.5] });
new SettingsMenu(game, { pauseWhenOpen: true });  // pause while the menu is up
```

While open it sits in the input router's overlay band, which sees every event
before scene UI or the game world, so clicks and movement keys never leak
into the game underneath. Opening does not pause unless you pass
`pauseWhenOpen: true`; either way the menu's Paused row toggles `game.paused`,
a flag the engine loop honours by freezing the simulation while continuing to
draw.

The mounted menu is reachable as `game.settings`, and a scene-JSON button can
open it directly:

```json
{ "type": "button", "properties": { "text": "Settings", "action": "settings" } }
```

It draws above every scene via the engine's overlay pass (`game.overlays`,
rendered by `game.drawOverlays()`); a game that replaces the engine loop
calls `drawOverlays()` at the end of its own frame.
