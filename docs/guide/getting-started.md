# Getting Started

M2D is a lightweight 2D game engine with Rapier 2D physics (WASM), a batched
WebGL2 renderer with a Canvas 2D fallback, JSON scene definitions, and a
unified input API for keyboard, mouse, touch and pen.

::: info Not on npm yet
The engine currently lives in the [m2d-engine monorepo](https://github.com/mert574/m2d-engine)
as the `packages/engine` workspace and is not yet published to the npm
registry. Today the way to build a game with it is inside the monorepo, the
same way the [example games](./examples) do.
:::

## Working in the monorepo

```bash
git clone https://github.com/mert574/m2d-engine.git
cd m2d-engine
npm install              # installs all workspaces
npm run generate-sprites # generates the examples' placeholder sprites
npm run dev              # demo site on http://localhost:3000
```

Other useful commands:

```bash
npm test               # engine suites (Node + headless Chromium) + example scene validation
npm run test:node      # fast headless engine suite only
npm run test:browser   # WebGL2 conformance suite (needs: npx playwright install chromium)
npm run docs:dev       # this documentation site, locally
npm run build          # full deployable site: docs + demos
```

## A minimal game

A game is a handful of pieces: actors (your entity classes), scene JSON files
(levels and menus), and a few lines to wire them together.

1. Define your actors by extending `Entity` (or `Projectile`)
2. Describe levels and menus as [scene JSON](./scenes), using prefabs to place actors
3. `await initPhysics()` once, then construct the engine
4. Register the actors and scenes with the engine
5. Mount a settings overlay and start the loop

```javascript
import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';

// Compile Rapier's WASM module. Await this once, before the engine builds
// its physics world.
await initPhysics();

// Create the game instance
const game = new M2D(canvas, {
  width: 1280,            // design size: how much world is visible,
  height: 720,            // in world units
  initialScene: 'mainMenu'
});

// Register actors — the name here is what scene JSON's "actor" refers to,
// and the scene loader checks that the two match.
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

Give the canvas an explicit CSS size (`width: 100%; height: 100%`) and let the
engine letterbox inside it — the engine tracks the displayed size, device
pixel ratio and fullscreen transitions on its own. See
[Display & UI](./display) for how the resolutions relate.

## Where to go next

- [Scenes](./scenes) — the JSON scene format, prefabs, validation, loading and switching
- [Physics](./physics) — body types, units, and the solver-agnostic contract
- [Input](./input) — keyboard, pointer, hit detection and pointer lock
- [Display & UI](./display) — resolutions, anchored UI, the world overlay and the settings menu
- [Example Games](./examples) — six demos, each exercising a different part of the engine
