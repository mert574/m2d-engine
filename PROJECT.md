# M2D Engine

A lightweight 2D game engine built with Matter.js for physics and WebGL2 for
rendering, with a Canvas 2D fallback. Focused on simplicity and performance.

This file is the one-page overview. [README.md](README.md) is the user guide,
[AGENTS.md](AGENTS.md) the architecture detail, [ROADMAP.md](ROADMAP.md) the
work ahead.

## Core Features

- Physics: Matter.js integration
- Rendering: pluggable backends behind one contract (WebGL2 default, Canvas 2D fallback)
- Display: independent view, world-render and UI resolutions, with aspect
  modes, fullscreen and a reusable settings overlay
- Scene Management: JSON scene definition, validated on load
- Component System: constraint-based behaviours
- Input System: keyboard and pointer handling
- Camera: smooth lerped following with optional world bounds
- UI Framework: anchored screen-space components
- Asset Management: sprites and sounds
- Debug Tools: physics and state visualization, drawn at display resolution

## Architecture

```
src/
├── core/
│   ├── renderers/  # Backend contract, Canvas + WebGL2 backends, geometry
│   └── ui/         # Screen-space components, settings and world overlays
├── actors/         # Game-specific entities
├── constraints/    # Reusable entity behaviors
└── examples/       # Demo implementations, each owning its assets/
```

## Technical Stack

- **Physics**: Matter.js
- **Rendering**: WebGL2, falling back to the Canvas 2D API
- **Sound**: HTML5 `Audio` elements (a Web Audio mixer is on the roadmap)
- **Asset Loading**: Dynamic imports using Vite
- **Scene Format**: JSON

## Key Concepts

- Entity-Component Architecture
- JSON-based Scene Definition
- Renderer Abstraction with Optional Capabilities
- Layer-based Rendering
- Prefab System
- Collision Categories
- Scene Lifecycle Hooks (`onEnter`, `onExit`, `onUpdate`, `onDraw`, `onResize`, `onAction`)

## Getting Started

```bash
npm install
npm run generate-sprites
npm run dev
```

See the examples directory for implementation samples.

## Entity Instantiation

Entities are normally declared through the prefab system in scene JSON rather
than constructed in game code, so configuration stays data-driven and every
reference is validated at load:

```json
{
  "prefabs": {
    "movingPlatform": {
      "actor": "MovingPlatform",
      "spritesheet": "platform",
      "physics": { "bodyType": "kinematic" }
    }
  }
}
```

Entities that do not exist until runtime — projectiles, spawned pickups — are
created directly with `game.createEntity(...)` and added to `game.entities`
and the Matter world. See "Dynamic Entity Creation" in AGENTS.md.
