# M2D Engine

A small 2D game engine built with Matter.js for physics and Canvas for rendering.

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

4. Build for production:
```bash
npm run build
```

5. Preview production build:
```bash
npm run preview
```

## Examples

### 1. Platformer Game
A simple platformer demonstrating side-scrolling physics, jumping mechanics, and basic character movement.
- **Controls:** Arrow keys to move, Space to jump

### 2. Top-down Maze
A top-down maze game showcasing smooth movement and collision detection in a maze environment.
- **Controls:** Arrow keys to move

### 3. Physics Playground
An interactive physics sandbox where you can spawn various objects and watch them interact.
- **Controls:** Space to spawn random objects

## Project Structure

```
m2d-engine/
├── src/
│   ├── core/           # Engine core files
│   ├── examples/       # Example games
│   │   ├── platformer/
│   │   ├── maze/
│   │   └── physics/
│   └── index.html     # Examples index
├── scripts/           # Build and utility scripts
├── package.json
└── vite.config.js
```

## Development

The project uses Vite for development and building. The development server includes:
- Hot Module Replacement (HMR)
- Source maps
- Automatic asset handling
- ES module support

## Building

The build process:
1. Bundles all JavaScript modules
2. Optimizes and copies assets
3. Generates production-ready files in `dist/`

## License

ISC