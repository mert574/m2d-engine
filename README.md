# M2D Engine

A lightweight 2D game engine with pluggable physics (Rapier by default, Matter.js fallback) and WebGL2 rendering (Canvas 2D fallback). Features a component-based architecture, scene management, and UI system.

[Check Demos](https://mert574.github.io/m2d-engine)

For the next development priorities and acceptance criteria, see [ROADMAP.md](ROADMAP.md).
See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and contribution guidelines.

https://github.com/user-attachments/assets/1693e2b8-67f8-4b75-b6d7-31ce35f14397

## Features

- **Physics Engine**: Fixed-timestep 2D simulation behind a swappable backend contract (Rapier default, Matter.js fallback, `?physics=` to switch)
- **Scene Management**: JSON scene definitions, validated on load
- **Component System**: Flexible entity-component architecture
- **Input Handling**: Keyboard input with configurable controls
- **Camera System**: Smooth following with optional world bounds

### Renderer System
- Abstracted rendering interface for multiple backends
- Batched WebGL2 renderer with a Canvas 2D fallback, both validated by one conformance suite
- Separate world and UI rendering contexts
- Built-in performance monitoring: FPS, primitives, draw calls and state changes

### Display System
- Independent view, world-render and UI resolutions — lower the render
  resolution for performance without changing how much world is visible or
  blurring the HUD
- Letterbox or expand on a differing display aspect; fullscreen and DPR
  tracked automatically
- `nearest` or `linear` upscaling for pixel art
- A ready-made settings overlay (resolution, aspect, fullscreen, debug
  overlay, renderer backend, pause)

### UI System
- Simple UI framework with buttons, text, images and rects
- Screen-space rendering, anchored to real screen edges at any aspect ratio
- Event handling and hit testing that account for letterboxing and pixel ratio
- Clipping support for scrollable areas
- World-anchored annotations drawn at display resolution

### Asset & Debug Features
- Sprite loading and animation support
- Category-based collision filtering
- Sound system with music and effects
- Debug overlay (**D**): physics bodies, velocities, entity state and
  performance metrics
- JSON level format with prefabs, layered objects, per-object properties and
  animation/physics configuration — validated on load


## Setup

1. Install dependencies:
```bash
npm install
```

2. Generate sprite assets:
```bash
npm run generate-sprites
```

3. Start development server:
```bash
npm run dev
```

## Demo deployment

The [Pages workflow](.github/workflows/pages.yml) installs dependencies, runs
the Node and Chromium tests, builds the demo, and deploys `docs/` on every
push to `master`. It can also be started from Actions → Deploy demo to GitHub
Pages → Run workflow (select `master`). A failed test or build prevents deployment.

To enable it, set Settings → Pages → Build and deployment → Source to
**GitHub Actions**. If the `github-pages` environment has branch restrictions,
allow `master` to deploy. No personal access token is needed. The `docs` branch
is retained as deployment history; this workflow publishes build artifacts
directly and does not update that branch.

## Examples

### Renderer Showcase
A batching stress test that doubles as the renderer comparison harness:
- Thousands of batched sprites, a flowering reed bank, and a text storm
- A lighthouse whose beam sweeps in perspective, built from stacked clips in world space
- Rain as a single packed particle buffer, thousands of drops per draw call
- A harbour chart that nests clips in screen space and plots the same beam
- Additive firefly glow and per-sprite depth tinting on the reed bank
- A harbour at night: horizon, rippling water, reed bank and lantern-lit shore
- Flickering lantern lights over a dark harbour, with bloom and a vignette
- A live overlay reporting FPS, primitives, draw calls and state changes
- The same deterministic scene on either backend, for a like-for-like comparison

On the WebGL2 backend the field collapses into a handful of draw calls; on
Canvas it costs one call per primitive. The overlay prints that ratio, and
lists which optional renderer capabilities the active backend supports — on
Canvas the reed tinting drops out, the rain is capped and the harbour stays
evenly lit, because that backend declines `tint`, `particles`, `lights` and
`postEffects`.

**Controls:**
- `[` / `]`: Decrease / increase load
- `1`-`7`: Toggle layers (drift, reeds, labels, chart, rain, lights, bloom)
- `P`: Pause the camera pan
- `H`: Hide the overlay
- `O`: Settings (resolution, fullscreen, aspect, debug, backend swap)

Any example also accepts `?renderer=canvas` or `?renderer=webgl` in the URL.

### 1. Platformer Game
A side-scrolling platformer showcasing:
- Physics-based movement
- Moving platforms
- Enemy AI
- Collectibles
- Trigger zones

**Controls:**
- Arrow keys: Move left/right
- Space: Jump
- X: Attack
- O: Settings

### 2. Top-down Maze
A top-down maze game demonstrating:
- A deterministic, procedurally carved maze (wall cells merged into few static bodies)
- A camera following the player through a world larger than the view
- A sensor goal: touching it shows a banner and resets the run
- Top-down physics with direct-velocity movement

**Controls:**
- Arrow keys: Move in all directions
- O: Settings

### 3. Physics Playground
An interactive physics sandbox featuring:
- Dynamic object spawning
- Rotated static geometry: a funnel, a splitter and a peg field
- Different physics materials and object interactions

**Controls:**
- Space: Spawn random objects
- O: Settings

### 4. Top-Down Game
A top-down game demonstrating:
- 8-directional movement
- Zero-gravity physics
- Enemies, turrets and projectiles

**Controls:**
- Arrow keys: Move
- X: Attack
- O: Settings

### 5. Doner
A rhythm-and-order game built mostly in screen space, showing the UI layer
driving a whole game rather than an overlay.

**Controls:**
- A / S / D / F: Rhythm keys, pressed in sequence
- Space: Serve order
- Backspace: Clear sandwich
- O: Settings

## Project Structure

```
m2d-engine/
├── src/
│   ├── core/           # Engine core components
│   │   ├── m2d.js        # Main engine class
│   │   ├── scene.js      # Scene management
│   │   ├── entity.js     # Base entity class
│   │   ├── camera.js     # Camera system
│   │   ├── renderers/    # Backend contract and backends
│   │   │   ├── baseRenderer.js   # The contract every backend implements
│   │   │   ├── canvasRenderer.js # Canvas 2D backend
│   │   │   ├── webglRenderer.js  # WebGL2 backend (default)
│   │   │   ├── geometry/         # API-neutral tessellation and matrices
│   │   │   └── webgl/            # Batching, shaders, shadow and effect passes
│   │   └── ui/           # UI components
│   ├── actors/         # Game-specific actors
│   ├── constraints/    # Entity constraints/components
│   └── examples/       # Example implementations
├── scripts/           # Build and utility scripts
├── test/              # Renderer conformance and engine tests
└── docs/              # Build output (GitHub Pages)
```

## Level File Structure

Levels are defined in JSON format with the following structure:

Scene files are **validated strictly** when they load: a wrong version, an
unknown field, a prefab naming an unregistered actor, a button pointing at a
scene nobody registered — each throws a `SceneValidationError` naming the
scene and the exact path to the offending field, rather than half-building
the scene and logging as it goes. Anything not in the schema below is an
error, including misspellings like `"anchour"`.

```json
{
  "version": 1,
  "type": "level",
  "name": "level1",
  "title": "Level 1",
  "gameType": "platformer",
  "world": {
    "gravity": { "x": 0, "y": 1000 }
  },
  "assets": {
    "spritesheets": {
      "player": {
        "url": "path/to/sprite.png",
        "frameWidth": 32,
        "frameHeight": 32,
        "animations": {
          "idle": { "frames": [[0, 0]] },
          "run": { "frames": [[1, 0], [2, 0]] }
        }
      }
    }
  },
  "prefabs": {
    "player": {
      "actor": "Player",
      "spritesheet": "player",
      "physics": {
        "bodyType": "dynamic",
        "friction": 0.1,
        "frictionStatic": 0.5
      }
    },
    "movingPlatform": {
      "actor": "MovingPlatform",
      "spritesheet": "platform",
      "physics": {
        "bodyType": "kinematic",
        "friction": 1
      }
    }
  },
  "layers": [
    {
      "name": "main",
      "objects": [
        {
          "prefab": "player",
          "x": 100,
          "y": 100,
          "width": 32,
          "height": 32,
          "properties": {}
        },
        {
          "prefab": "movingPlatform",
          "x": 200,
          "y": 200,
          "width": 96,
          "height": 32,
          "properties": {
            "path": {
              "points": [
                {"x": 200, "y": 200},
                {"x": 400, "y": 200}
              ],
              "speed": 3,
              "waitTime": 1000
            }
          }
        }
      ]
    }
  ]
}
```

### Key Components:

- **version**: Scene format version — currently `1` (a number)
- **type**: Scene type ("level" or "ui")
- **world**: Physics world configuration
- **assets**: Sprite and audio assets used in the level
- **prefabs**: Reusable entity definitions with physics and sprite properties
- **layers**: Groups of game objects with their positions and properties
- **background** *(optional)*: `{ "spritesheet": "tiles", "tileX": 0, "tileY": 0 }`
  — tiles one frame across the whole world behind everything else

Objects default to 32x32 when they give no `width`/`height`. Every
cross-reference is checked at load: `object.prefab` against `prefabs`,
`prefab.spritesheet` and `background.spritesheet` against
`assets.spritesheets`, `prefab.defaultAnimation` against that sheet's
animations, and `prefab.actor` against the actors registered with
`game.registerActor`.

### UI scenes

A `"type": "ui"` scene holds `elements` instead of layers. Each element has a
`type` (`button`, `text`, `image`, `rect`), a position, an optional `anchor`,
and a `properties` block whose allowed keys depend on the type:

```json
{
  "version": 1,
  "type": "ui",
  "name": "mainMenu",
  "elements": [
    { "type": "rect", "id": "background", "fill": true, "color": "#298ccc" },
    {
      "type": "button", "id": "start", "anchor": "center", "x": 0, "y": -80,
      "properties": { "text": "Start Game", "onClick": "level1", "width": 200, "height": 50 }
    },
    {
      "type": "button", "id": "settings", "anchor": "center", "x": 0, "y": -10,
      "properties": { "text": "Settings", "action": "settings", "width": 200, "height": 50 }
    }
  ]
}
```

A button must have exactly one of `onClick` (switch to that scene, which must
be registered) or `action` (a named behaviour — `settings` opens the settings
overlay, anything else reaches the scene config's `onAction` hook). A button
with neither, or with both, is a load error.

### Common Properties:

- **bodyType**: Physics body type ("static", "dynamic", or "kinematic")
- **friction/frictionStatic**: Surface friction properties
- **isSensor**: Whether the object triggers collisions without physical response
- **path**: Movement path for platforms (points, speed, waitTime)
- **triggers**: Actions or events triggered by collision

## Scene Loading

All scenes in M2D Engine must be registered with a `fetch` method that returns the scene configuration. The scene manager uses this method to load scene data asynchronously.

### Scene Registration

Register a scene using `addScene`:

```javascript
// Loading a level scene from a JSON file
game.sceneManager.addScene('level1', {
  fetch: async () => (await import('./scenes/level1.json')).default,
  onEnter() {
    game.soundManager.playMusic('game');
  }
});

// Loading a UI scene from a JSON file
game.sceneManager.addScene('mainMenu', {
  fetch: async () => (await import('./scenes/mainMenu.json')).default,
  onEnter() {
    game.soundManager.playMusic('menu');
  }
});
```

The scene configuration:
- Must include a `fetch` method that returns the scene data
- Can include lifecycle hooks: `onEnter`, `onExit`, `onUpdate(deltaTime)`,
  `onDraw(deltaTime)`, `onResize(width, height, viewport)` and
  `onAction(name)` for button actions
- Supports lazy loading through dynamic imports
- Can load data from any async source (files, API, etc.)
- Is cached after first load for faster scene switching

Fetched data is validated before the scene is built, so a malformed scene
fails with a message naming the field rather than loading half-built.

### Scene Switching

Switch between scenes using:

```javascript
await game.sceneManager.switchTo('sceneName');
```

This will:
1. Unload the current scene if one exists
2. Load the new scene using its `fetch` method
3. Initialize the scene with assets and entities
4. Call the scene's `onEnter` hook if defined

## Creating a New Game

1. Define your actors by extending `Entity` (or `Projectile`)
2. Describe levels and menus as scene JSON, using prefabs to place actors
3. Register the actors and scenes with the engine
4. Mount a settings overlay and start the loop

The name an actor is registered under is the name prefabs reference in
`"actor"`, and the loader checks the two match.

Example:
```javascript
// Create game instance
const game = new M2D(canvas, {
  width: 1280,
  height: 720,
  initialScene: 'mainMenu'
});

// Register actors — the name here is what scene JSON's "actor" refers to
game.registerActor('Player', Player);
game.registerActor('Enemy', Enemy);

// Register scenes
game.sceneManager.addScene('mainMenu', {
  fetch: async () => (await import('./scenes/mainMenu.json')).default
});

game.sceneManager.addScene('level1', {
  fetch: async () => (await import('./scenes/level1.json')).default
});

// Resolution, aspect, fullscreen and pause, toggled with O
new SettingsMenu(game);

// Start the game
game.start();
```

## Display, resolution and fullscreen

`width` and `height` are the **design size**: how much world is visible, in
world units. The engine tracks the canvas's displayed size, the device pixel
ratio and fullscreen transitions on its own, and keeps three resolutions
independent so each can be set for the right reason.

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
engine letterbox inside it — `object-fit: contain` is not needed and sizing the
element from its own `width`/`height` attributes fights the engine's resize
tracking.

UI is drawn at the display's full pixel density regardless of the world
resolution, and UI space always covers the whole screen. Position UI against an
anchor so it tracks the real screen edges at any aspect ratio:

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

For pointer input use `game.getMousePosition(event)` (world coordinates) and
`game.getUIPosition(event)` (UI coordinates); both account for letterboxing and
pixel ratio. The opposite direction is `game.worldToUI(x, y)`: where a world
point lands in UI space.

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

A ready-made settings overlay ships with the engine and is mounted in every
example — resolution presets, fullscreen, aspect mode, debug overlay,
renderer backend and pause, toggled with **O** (Escape closes it too):

```javascript
import { SettingsMenu } from 'm2d/core/ui/settingsMenu.js';
new SettingsMenu(game);                      // that's all
new SettingsMenu(game, { hotkey: 'p', resolutions: ['native', 0.5] });
new SettingsMenu(game, { pauseWhenOpen: true });  // pause while the menu is up
```

While open it captures mouse *and keyboard*, so clicks and movement keys never
leak into the game underneath. Opening does not pause unless you pass
`pauseWhenOpen: true`; either way the menu's Paused row toggles `game.paused`,
a flag the engine loop honours by freezing the simulation while continuing to
draw.

The mounted menu is reachable as `game.settings`, and a scene-JSON button can
open it directly — this is how the example main menus wire their Settings
button:

```json
{ "type": "button", "properties": { "text": "Settings", "action": "settings" } }
```

(`"action"` names a behaviour — unknown names are handed to the scene config's
`onAction(action)` hook — while `"onClick"` still switches scenes.)

It draws above every scene via the engine's overlay pass (`game.overlays`,
rendered by `game.drawOverlays()`); a game that replaces the engine loop calls
`drawOverlays()` at the end of its own frame.

## License

MIT. See [LICENSE](LICENSE). Third-party dependencies retain their own licenses.
Examples use original synthesized sound effects and system fonts. Jazz music by Kevin MacLeod
is licensed under CC BY 4.0; see [music credits](THIRD_PARTY_NOTICES.md).
Existing demo artwork is retained;
missing Doner sprites are replaced with original SVG artwork generated by
`node scripts/generateDonerSprites.js`.
