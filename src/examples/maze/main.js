import { M2D } from '../../core/m2d.js';
import { initPhysics } from '../../core/physics/index.js';
import { SettingsMenu } from '../../core/ui/settingsMenu.js';
import { Entity } from '../../core/entity.js';
import { UIElement } from '../../core/ui/uiElement.js';
import { Platform } from '../../actors/platform.js';
import { KeyboardControl } from '../../constraints/keyboardControl.js';
import playerSprite from './assets/player.png';
import wallSprite from './assets/wall.png';
import floorSprite from './assets/floor.png';

// The maze lives on a grid of 32px cells. Odd dimensions, as the carving
// algorithm needs walls between every pair of cells.
const TILE = 32;
const COLS = 39;
const ROWS = 29;
const WORLD = { width: COLS * TILE, height: ROWS * TILE };
const START = { x: 1.5 * TILE, y: 1.5 * TILE };

/**
 * Carve a maze with an iterative backtracker over a fixed-seed PRNG, so the
 * layout is deterministic: every visitor (and every bug report) sees the same
 * maze. Returns a boolean grid, true = wall.
 */
function generateMaze(cols, rows, seed) {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const wall = Array.from({ length: rows }, () => Array(cols).fill(true));
  wall[1][1] = false;
  const stack = [[1, 1]];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const open = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx > 0 && ny > 0 && nx < cols - 1 && ny < rows - 1 && wall[ny][nx];
    });
    if (!open.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = open[Math.floor(rand() * open.length)];
    wall[y + dy / 2][x + dx / 2] = false;
    wall[y + dy][x + dx] = false;
    stack.push([x + dx, y + dy]);
  }
  return wall;
}

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
  constructor(game) {
    super(0, 0, 0, 0);
    this.game = game;
  }

  draw() {
    if (!solvedAt || performance.now() - solvedAt > 2500) return;
    const ui = this.game.uiRenderer;
    ui.drawText({
      text: 'Maze solved! Back to the start...',
      x: ui.width / 2, y: 60,
      fillStyle: '#4CAF50', fontSize: '28px', fontFamily: 'system-ui', fontWeight: 'bold',
      textAlign: 'center', textBaseline: 'middle',
      shadow: { color: 'rgba(0,0,0,0.8)', blur: 6 }
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

// Backend warm-up: a no-op today, the WASM compile for a future backend.
await initPhysics();

const game = new M2D(document.getElementById('screen'), {
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
game.sceneManager.addScene('mainMenu', {
  fetch: async () => ({
    version: 1, name: 'mainMenu', type: 'ui', title: 'Main Menu', assets: {},
    elements: [
      { type: 'rect', id: 'background', x: 0, y: 0, fill: true, color: '#333333' },
      { type: 'text', id: 'title', anchor: 'center', x: 0, y: -160,
        properties: { text: 'Maze Demo', fontSize: '48px', align: 'center', color: '#ffffff' } },
      { type: 'text', id: 'subtitle', anchor: 'center', x: 0, y: -100,
        properties: { text: 'Find the green goal', fontSize: '18px', align: 'center', color: '#999999' } },
      { type: 'button', id: 'startGame', anchor: 'center', x: 0, y: -30,
        properties: { text: 'Start Game', onClick: 'maze', width: 180, height: 44, fontSize: '18px',
          backgroundColor: '#2E7D32', hoverColor: '#4CAF50', textColor: '#ffffff' } },
      { type: 'button', id: 'settings', anchor: 'center', x: 0, y: 26,
        properties: { text: 'Settings', action: 'settings', width: 180, height: 44, fontSize: '18px',
          backgroundColor: '#2E7D32', hoverColor: '#4CAF50', textColor: '#ffffff' } },
      { type: 'text', id: 'controls', anchor: 'center', x: 0, y: 80,
        properties: { text: 'Arrow Keys: Move · O: Settings', fontSize: '16px', align: 'center', color: '#bbbbbb' } }
    ]
  })
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
      player: { actor: 'MazePlayer', spritesheet: 'player', physics: { bodyType: 'dynamic', frictionAir: 0.2 } },
      wall: { actor: 'Platform', spritesheet: 'wall', physics: { bodyType: 'static' } },
      goal: { actor: 'Goal', physics: { bodyType: 'static', isSensor: true } }
    },
    layers: [{ name: 'maze', objects: [
      { prefab: 'player', x: START.x, y: START.y, width: 32, height: 32 },
      { prefab: 'goal', x: (COLS - 1.5) * TILE, y: (ROWS - 1.5) * TILE, width: 32, height: 32 },
      ...wallObjects(generateMaze(COLS, ROWS, 0x5EED))
    ] }]
  }),

  // Screen-space elements belong in the scene's UI container (onDraw would
  // run in the world pass, under the camera transform).
  onEnter() {
    game.sceneManager.getCurrentScene().ui.addElement(new SolvedBanner(game));
  }
});
// Settings overlay (O): resolution, fullscreen, aspect mode, debug, backend.
new SettingsMenu(game);

game.start();
