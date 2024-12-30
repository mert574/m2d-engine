# M2D Engine

A lightweight 2D game engine built with Matter.js and Canvas, focusing on simplicity and performance.

## Core Features

- Physics: Matter.js integration
- Scene Management: JSON-based scene definition
- Component System: Constraint-based behaviors
- Input System: Keyboard and mouse handling
- Camera: Smooth following with deadzone
- UI Framework: Basic UI components
- Asset Management: Sprites and sounds
- Debug Tools: Physics visualization

## Architecture

```
src/
├── core/           # Engine core (renderer, physics, scene management)
├── actors/         # Game-specific entities
├── constraints/    # Reusable entity behaviors
├── examples/       # Demo implementations
└── assets/         # Game resources
```

## Technical Stack

- **Physics**: Matter.js
- **Rendering**: Canvas API
- **Sound**: Web Audio API
- **Asset Loading**: Dynamic imports using Vite
- **Scene Format**: JSON

## Key Concepts

- Entity-Component Architecture
- JSON-based Scene Definition
- Layer-based Rendering
- Prefab System
- Collision Categories
- Scene Lifecycle Hooks

## Getting Started

```bash
npm install
npm run generate-sprites
npm run dev
```

See examples directory for implementation samples. 

# Entity System

## Entity Instantiation Pattern
All game entities in M2D must be instantiated through the prefab system defined in scene configuration files. Direct entity creation in code is not allowed. This pattern ensures:

1. Consistent entity creation through SceneLoader
2. Data-driven approach to entity configuration
3. Proper initialization through Scene.createPrefabInstance
4. Maintainable and scalable entity management

Example:
```json
{
  "prefabs": {
    "movingPlatform": {
      "actor": "MovingPlatform",
      "spritesheet": "platformSprite",
      "physics": {
        "isStatic": true
      }
    }
  }
}
``` 