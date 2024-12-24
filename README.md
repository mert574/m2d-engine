# M2D Engine

A lightweight 2D game engine built with Matter.js for physics and Canvas for rendering. Features a component-based architecture, scene management, and UI system.

## Demo

https://github.com/mert574/m2d-engine/assets/platformer.mp4

[View on GitHub](https://github.com/mert574/m2d-engine)

## Features

- **Physics Engine**: Powered by Matter.js for accurate 2D physics simulation
- **Scene Management**: Easy scene transitions and level loading
- **Component System**: Flexible entity-component architecture
- **Input Handling**: Keyboard input with configurable controls
- **Camera System**: Smooth camera following with deadzone
- **UI System**: Simple UI framework with buttons and text elements
- **Asset Management**: Sprite loading and animation support
- **Collision System**: Category-based collision filtering
- **Debug Tools**: Built-in debug visualization for physics bodies

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
- Game over handling

**Controls:**
- Arrow keys: Move left/right
- Space: Jump
- B: Toggle debug view
- F: Toggle FPS display
- R: Restart on game over
- M: Return to menu

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

## Creating a New Game

1. Create a new scene file extending the base Scene class
2. Define your game actors extending the Entity class
3. Set up your scene configuration with sprites and entities
4. Register your actors and scene with the engine

Example:
```javascript
// Create game instance
const game = new M2D(canvas, {
  width: 1280,
  height: 720
});

// Register actors
game.registerActor('player', Player);
game.registerActor('enemy', Enemy);

// Register scene
game.sceneManager.setLevelData('game', levelData);

// Start the game
game.start();
```

## License

ISC