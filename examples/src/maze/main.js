import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { UIElement } from 'm2d-engine/core/ui/uiElement.js';
import { Platform } from 'm2d-engine/actors/platform.js';
import { KeyboardControl } from 'm2d-engine/constraints/keyboardControl.js';
import playerSprite from './assets/player.png';
import wallSprite from './assets/wall.png';
import floorSprite from './assets/floor.png';
import { registerMainMenu } from '../shared/mainMenu.js';
import { menuBackdrop } from './menuBackdrop.js';
import { generateMaze } from './generateMaze.js';

// The maze lives on a grid of 32px cells. Odd dimensions, as the carving
// algorithm needs walls between every pair of cells.
const TILE = 32;
const COLS = 39;
const ROWS = 29;
const WORLD = { width: COLS * TILE, height: ROWS * TILE };
const START = { x: 1.5 * TILE, y: 1.5 * TILE };

/**
 * Merge wall cells into as few rectangles as possible (horizontal runs
 * first, leftovers as vertical runs), so the physics world holds dozens of
 * static bodies instead of hundreds of 32px squares.
 */
function wallObjects(wall) {
  const rows = wall.length, cols = wall[0].length;
  const used = Array.from({ length: rows }, () => Array(cols).fill(false));
  const runs = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!wall[y][x] || used[y][x]) continue;
      let w = 0;
      while (x + w < cols && wall[y][x + w] && !used[y][x + w]) w++;
      if (w < 2) continue;
      for (let k = 0; k < w; k++) used[y][x + k] = true;
      runs.push({ x, y, w, h: 1 });
      x += w - 1;
    }
  }
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      if (!wall[y][x] || used[y][x]) continue;
      let h = 0;
      while (y + h < rows && wall[y + h][x] && !used[y + h][x]) h++;
      for (let k = 0; k < h; k++) used[y + k][x] = true;
      runs.push({ x, y, w: 1, h });
    }
  }

  return runs.map(r => ({
    prefab: 'wall',
    x: (r.x + r.w / 2) * TILE,
    y: (r.y + r.h / 2) * TILE,
    width: r.w * TILE,
    height: r.h * TILE
  }));
}

class MazePlayer extends Entity {
  name = 'Player';
  constructor(body, sprite, game) {
    super(body, sprite, game);
    // Direct-velocity movement (continuous: false): crisp stop-and-go suits a
    // maze better than building momentum against air friction.
    this.addConstraint('movement', new KeyboardControl(this, {
      verticalMovement: true, continuous: false, maxSpeed: 240
    }));
  }
}

/** When the maze is solved: shows the banner and sends the player back. */
let solvedAt = 0;

/** Screen-space "solved" banner, shown for a couple of seconds. */
class SolvedBanner extends UIElement {
  constructor() {
    super({ anchor: 'top', y: 60 });
  }

  draw() {
    if (!solvedAt || performance.now() - solvedAt > 2500) return;
    this.paint.drawText({
      text: 'Maze solved! Back to the start...',
      x: this.x, y: this.y,
      fillStyle: '$color.status.success',
      fontSize: '$font.size.heading',
      fontWeight: '$font.weight.bold',
      textAlign: 'center', textBaseline: 'middle',
      shadow: '$elevation.medium'
    });
  }
}

/** Sensor at the far corner; touching it solves the maze. */
class Goal extends Entity {
  name = 'Goal';

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (other.entity?.name !== 'Player') return;
    solvedAt = performance.now();
    this.game.player.body.setPosition({ x: START.x, y: START.y });
    this.game.player.body.setVelocity({ x: 0, y: 0 });
  }

  draw() {
    // A pulsing marker rather than a sprite, so it reads as "goal", not wall.
    const pulse = 10 + Math.sin(performance.now() / 250) * 3;
    const pos = this.body.position;
    this.game.renderer.drawRect({
      x: pos.x - pulse, y: pos.y - pulse, width: pulse * 2, height: pulse * 2,
      fillStyle: '#4CAF50'
    });
  }
}

// Compile Rapier's WASM module before anything builds a physics world.
await initPhysics();

const game = new M2D(document.getElementById('screen'), {
  pointerLock: false,
  initialScene: 'mainMenu', width: 640, height: 480,
  worldWidth: WORLD.width, worldHeight: WORLD.height,
  // 32px pixel-art tiles: upscale them blocky, not smeared, below native.
  worldFilter: 'nearest'
});
// The maze is larger than the view; the camera follows the player and these
// bounds keep it from showing the void past the outer wall.
game.camera.bounds = { left: 0, top: 0, right: WORLD.width, bottom: WORLD.height };
game.registerActor('MazePlayer', MazePlayer);
game.registerActor('Platform', Platform);
game.registerActor('Goal', Goal);
registerMainMenu(game, {
  title: 'Maze',
  subtitle: 'find the green goal',
  hint: 'Arrows move · O for settings',
  backdrop: menuBackdrop,
  items: () => [
    { text: 'Start Game', onSelect: () => game.sceneManager.switchTo('maze') },
    { text: 'Settings', onSelect: () => game.settings.open() }
  ]
});
game.sceneManager.addScene('maze', {
  fetch: async () => ({
    version: 1, name: 'maze', type: 'level', gameType: 'topDown',
    world: { width: WORLD.width, height: WORLD.height, gravity: { x: 0, y: 0 } },
    assets: { spritesheets: {
      player: { url: playerSprite, frameWidth: 32, frameHeight: 32 },
      wall: { url: wallSprite, frameWidth: 32, frameHeight: 32 },
      floor: { url: floorSprite, frameWidth: 32, frameHeight: 32 }
    } },
    background: { spritesheet: 'floor' },
    prefabs: {
      // A circle character in 32px corridors the player is also 32px wide:
      // the round shape plus the controller's slide is what lets a 90° turn
      // happen on the move instead of only when perfectly aligned.
      player: { actor: 'MazePlayer', spritesheet: 'player', physics: { bodyType: 'character', shape: 'circle', frictionAir: 0.2 } },
      wall: { actor: 'Platform', spritesheet: 'wall', physics: { bodyType: 'static' } },
      goal: { actor: 'Goal', physics: { bodyType: 'static', isSensor: true } }
    },
    layers: [{ name: 'maze', objects: [
      // 26px in 32px corridors: the character controller keeps an 0.5px gap
      // on each side, so a full-width 32px body physically cannot fit — it
      // jammed against both walls at once, even on straights.
      { prefab: 'player', x: START.x, y: START.y, width: 26, height: 26 },
      { prefab: 'goal', x: (COLS - 1.5) * TILE, y: (ROWS - 1.5) * TILE, width: 32, height: 32 },
      ...wallObjects(generateMaze(COLS, ROWS, 0x5EED))
    ] }]
  }),

  // Screen-space elements belong in the scene's UI container (onDraw would
  // run in the world pass, under the camera transform).
  onEnter() {
    game.sceneManager.getCurrentScene().ui.add(new SolvedBanner());
  }
});
// Settings overlay (O): resolution, fullscreen, aspect mode, debug, backend.
new SettingsMenu(game);

game.start();
