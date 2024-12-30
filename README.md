# M2D Engine

A lightweight 2D game engine built with Matter.js for physics and Canvas for rendering. Features a component-based architecture, scene management, and UI system.

[Check Demos](https://mert.js.org/m2d-engine)

https://github.com/user-attachments/assets/6ae002af-22c0-4736-be9e-5ae3c7bb601d


## Features

- **Physics Engine**: Powered by Matter.js for accurate 2D physics simulation
- **Scene Management**: Easy scene transitions and level loading
- **Component System**: Flexible entity-component architecture
- **Input Handling**: Keyboard input with configurable controls
- **Camera System**: Smooth camera following with deadzone

### Renderer System
- Abstracted rendering interface for multiple backends
- Efficient Canvas renderer with double buffering
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

## Project Structure

```
m2d-engine/
├── src/
│   ├── core/           # Engine core components
│   │   ├── m2d.js        # Main engine class
│   │   ├── scene.js      # Scene management
│   │   ├── entity.js     # Base entity class
│   │   ├── Camera.js     # Camera system
│   │   └── ui/           # UI components
│   ├── actors/         # Game-specific actors
│   ├── constraints/    # Entity constraints/components
│   └── examples/       # Example implementations
├── scripts/           # Build and utility scripts
└── assets/           # Game assets and sprites
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

ISC
