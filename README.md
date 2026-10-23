# M2D Engine

A lightweight 2D game engine built with Matter.js for physics and WebGL2 for rendering (Canvas 2D fallback). Features a component-based architecture, scene management, and UI system.

[Check Demos](https://mert574.github.io/m2d-engine)

For the next development priorities and acceptance criteria, see [ROADMAP.md](ROADMAP.md).
See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and contribution guidelines.

https://github.com/user-attachments/assets/1693e2b8-67f8-4b75-b6d7-31ce35f14397

## Features

- **Physics Engine**: Powered by Matter.js for accurate 2D physics simulation
- **Scene Management**: Easy scene transitions and level loading
- **Component System**: Flexible entity-component architecture
- **Input Handling**: Keyboard input with configurable controls
- **Camera System**: Smooth camera following with deadzone

### Renderer System
- Abstracted rendering interface for multiple backends
- Batched WebGL2 renderer with a Canvas 2D fallback, both validated by one conformance suite
- Separate world and UI rendering contexts
- Built-in performance monitoring
- Debug visualization system
- State change tracking for optimization
- FPS and render statistics

### UI System
- Simple UI framework with buttons and text elements
- Screen-space rendering with no camera transforms
- Event handling and hit testing
- Clipping support for scrollable areas
- Consistent styling system

### Asset & Debug Features
- Sprite loading and animation support
- Category-based collision filtering
- Built-in debug visualization for:
  - Physics bodies
  - Velocities and forces
  - Entity states
  - Performance metrics
- Sound system with music and effects
- JSON-based level definition format
  - Prefab system for reusable entity templates
  - Layered object organization
  - Flexible property system
  - Asset and animation configuration
  - Physics property customization


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
- `B`: Swap renderer backend
- `P`: Pause the camera pan
- `H`: Hide the overlay

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

### 2. Top-down Maze
A top-down maze game demonstrating:
- Top-down physics
- Collision detection
- Smooth movement

**Controls:**
- Arrow keys: Move in all directions

### 3. Physics Playground
An interactive physics sandbox featuring:
- Dynamic object spawning
- Different physics materials
- Object interactions

**Controls:**
- Space: Spawn random objects

### 4. Top-Down Game
A top-down game demonstrating:
- 8-directional movement
- Zero-gravity physics
- Enemies, turrets and projectiles

**Controls:**
- Arrow keys: Move
- X: Attack
- D: Toggle debug overlay

### 5. Doner
A rhythm-and-order game built mostly in screen space, showing the UI layer
driving a whole game rather than an overlay.

**Controls:**
- A / S / D / F: Rhythm keys, pressed in sequence
- Space: Serve order
- Backspace: Clear sandwich

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

```json
{
  "version": "1.0",
  "type": "level",
  "name": "level1",
  "title": "Level 1",
  "gameType": "platformer",
  "world": {
    "gravity": { "x": 0, "y": 1 }
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

- **version**: Level format version
- **type**: Scene type ("level" or "ui")
- **world**: Physics world configuration
- **assets**: Sprite and audio assets used in the level
- **prefabs**: Reusable entity definitions with physics and sprite properties
- **layers**: Groups of game objects with their positions and properties

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
- Can include lifecycle hooks like `onEnter`
- Supports lazy loading through dynamic imports
- Can load data from any async source (files, API, etc.)
- Is cached after first load for faster scene switching

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

1. Create a new scene file extending the base Scene class
2. Define your game actors extending the Entity class
3. Set up your scene configuration with sprites and entities
4. Register your actors and scenes with the engine

Example:
```javascript
// Create game instance
const game = new M2D(canvas, {
  width: 1280,
  height: 720,
  initialScene: 'mainMenu'
});

// Register actors
game.registerActor('player', Player);
game.registerActor('enemy', Enemy);

// Register scenes
game.sceneManager.addScene('mainMenu', {
  fetch: async () => (await import('./scenes/mainMenu.json')).default
});

game.sceneManager.addScene('level1', {
  fetch: async () => (await import('./scenes/level1.json')).default
});

// Start the game
game.start();
```

## License

MIT. See [LICENSE](LICENSE). Third-party dependencies retain their own licenses.
Examples use original synthesized sound effects and system fonts. Jazz music by Kevin MacLeod
is licensed under CC BY 4.0; see [music credits](THIRD_PARTY_NOTICES.md).
Existing demo artwork is retained;
missing Doner sprites are replaced with original SVG artwork generated by
`node scripts/generateDonerSprites.js`.
