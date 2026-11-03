import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { UIElement } from 'm2d-engine/core/ui/uiElement.js';
import { Platform } from 'm2d-engine/actors/platform.js';
import { KeyboardControl } from 'm2d-engine/constraints/keyboardControl.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { menuBackdrop } from './menuBackdrop.js';
import { SurveyBackdrop } from './surveyBackdrop.js';
import { generateMaze } from './generateMaze.js';
import { tileTexture } from '../shared/textures.js';
import { solvedSound, symmetricalTree, redux, audioOption } from '../shared/audio.js';
import cobbleTexture from './textures/cobble.jpg';
import rockTexture from './textures/rock.jpg';

// The maze lives on a grid of 32px cells. Odd dimensions, as the carving
// algorithm needs walls between every pair of cells.
const TILE = 32;
const COLS = 39;
const ROWS = 29;
const WORLD = { width: COLS * TILE, height: ROWS * TILE };
const START = { x: 1.5 * TILE, y: 1.5 * TILE };

/**
 * The level's palette: a stone maze at night, seen by the lantern you carry.
 * The menu is the surveyor's plan of this place; the level is the place.
 * The route you walk is chalked on the cobbles behind you.
 */
const CHALK = 'rgba(186, 58, 44, 0.8)';
const LAMP = '#ffd9a0';

/** How long a chalk mark stays visible, in seconds. */
const TRAIL_LIFE = 14;

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

/**
 * A stone wall, in texture, lit by whatever is near it. The rock tiles at
 * its own scale (see `tileTexture`), a shadow sits off its foot, and the
 * face brightens as the lantern comes close — walls far from the player
 * sink into the dark, which is what makes a maze a maze.
 */
class StoneWall extends Platform {
  draw() {
    if (this.dead || !this.visible) return;

    const renderer = this.game.renderer;
    const pos = this.renderPosition;
    const w = this.size.x;
    const h = this.size.y;
    const left = pos.x - w / 2;
    const top = pos.y - h / 2;

    let near = 0;
    const player = this.game.player;
    if (player && !player.dead) {
      // Distance from the player to this rectangle, not its centre, so a
      // long wall lights where it is actually near.
      const p = player.renderPosition;
      const dx = Math.max(left - p.x, 0, p.x - (left + w));
      const dy = Math.max(top - p.y, 0, p.y - (top + h));
      near = Math.max(0, 1 - Math.hypot(dx, dy) / 210);
    }

    renderer.drawRect({
      x: left + 3, y: top + 4, width: w, height: h,
      fillStyle: 'rgba(0, 0, 0, 0.38)'
    });
    tileTexture(renderer, this.sprite?.image, { x: left, y: top, width: w, height: h }, 128);
    // Darken with distance from the lamp; warm the near faces.
    renderer.drawRect({
      x: left, y: top, width: w, height: h,
      fillStyle: `rgba(${near > 0.5 ? '60, 40, 20' : '4, 6, 10'}, ${(0.16 - near * 0.12).toFixed(3)})`
    });
    renderer.drawRect({
      x: left + 0.75, y: top + 0.75, width: w - 1.5, height: h - 1.5,
      strokeStyle: `rgba(28, 22, 16, 0.45)`,
      lineWidth: 1.5
    });
  }
}

/**
 * The explorer: a lantern carried through the stone, chalking the route it
 * has walked on the cobbles behind it. Movement is the stock keyboard
 * constraint; the look is a warm light and the line it leaves.
 */
class MazePlayer extends Entity {
  name = 'Player';

  constructor(body, sprite, game) {
    super(body, sprite, game);
    // Direct-velocity movement (continuous: false): crisp stop-and-go suits a
    // maze better than building momentum against air friction.
    this.addConstraint('movement', new KeyboardControl(this, {
      verticalMovement: true, continuous: false, maxSpeed: 240
    }));

    this.clock = 0;
    /** @type {Array<{x: number, y: number, t: number}>} */
    this.trail = [];
    this.blend = game.renderer.supports('blendModes') ? 'additive' : undefined;
  }

  resetTrail() {
    this.trail = [];
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.clock += deltaTime;

    const pos = this.position;
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(pos.x - last.x, pos.y - last.y) > 4) {
      this.trail.push({ x: pos.x, y: pos.y, t: this.clock });
    }
    while (this.trail.length && this.clock - this.trail[0].t > TRAIL_LIFE) {
      this.trail.shift();
    }
  }

  draw() {
    if (this.dead || !this.visible) return;

    const renderer = this.game.renderer;
    const pos = this.renderPosition;

    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      const fade = 1 - (this.clock - b.t) / TRAIL_LIFE;
      // Chalk: a dry, slightly broken line, drawn under the walker.
      renderer.drawLine({
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        strokeStyle: CHALK,
        lineWidth: 2.5,
        globalAlpha: 0.7 * fade * (0.75 + 0.25 * Math.sin(i * 7.3))
      });
    }
    const last = this.trail[this.trail.length - 1];
    if (last) {
      renderer.drawLine({
        x1: last.x, y1: last.y, x2: pos.x, y2: pos.y,
        strokeStyle: CHALK, lineWidth: 2.5, globalAlpha: 0.7
      });
    }

    // The lantern: a flame's flicker in a warm pool, and the hand that
    // carries it as a small dark shape under the light.
    const flicker = 0.9 + 0.1 * Math.sin(this.clock * 13) + 0.05 * Math.sin(this.clock * 31);
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 22 * flicker,
      fillStyle: {
        type: 'radial', x: pos.x, y: pos.y, r0: 0, r1: 22 * flicker,
        stops: [
          { offset: 0, color: 'rgba(255, 190, 110, 0.45)' },
          { offset: 1, color: 'rgba(255, 190, 110, 0)' }
        ]
      },
      blend: this.blend
    });
    renderer.drawArc({ x: pos.x, y: pos.y + 2, radius: 7, fillStyle: '#1a1410' });
    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 4.5,
      fillStyle: {
        type: 'radial', x: pos.x, y: pos.y - 1, r0: 0, r1: 4.5,
        stops: [{ offset: 0, color: '#fff6dc' }, { offset: 1, color: '#f0a84a' }]
      }
    });

    for (const constraint of this.constraints.values()) {
      constraint.draw();
    }
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
      text: 'Found the door. Back to the start...',
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

  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.clock = 0;
    this.lit = game.renderer.supports('lights');
    this.blend = game.renderer.supports('blendModes') ? 'additive' : undefined;
  }

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (other.entity?.name !== 'Player') return;
    solvedAt = performance.now();
    this.game.soundManager.playSound('solved');
    other.entity.resetTrail?.();
    this.game.player.body.setPosition({ x: START.x, y: START.y });
    this.game.player.body.setVelocity({ x: 0, y: 0 });
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.clock += deltaTime;
  }

  /** The exit: daylight under a door in the far corner. */
  draw() {
    const renderer = this.game.renderer;
    const pos = this.body.renderPosition;
    const breathe = 0.85 + 0.15 * Math.sin(this.clock * 1.4);

    renderer.drawArc({
      x: pos.x, y: pos.y, radius: 30 * breathe,
      fillStyle: {
        type: 'radial', x: pos.x, y: pos.y, r0: 0, r1: 30 * breathe,
        stops: [
          { offset: 0, color: 'rgba(200, 230, 255, 0.4)' },
          { offset: 1, color: 'rgba(200, 230, 255, 0)' }
        ]
      },
      blend: this.blend
    });
    // The sill of light under the door, and the door's dark slab.
    renderer.drawRect({
      x: pos.x - 13, y: pos.y - 14, width: 26, height: 28,
      fillStyle: '#141a22', cornerRadius: 2
    });
    renderer.drawRect({
      x: pos.x - 11, y: pos.y + 10, width: 22, height: 3,
      fillStyle: '#dff0ff', globalAlpha: 0.75 + 0.25 * breathe, cornerRadius: 1.5
    });
    renderer.drawRect({
      x: pos.x - 1, y: pos.y - 12, width: 2, height: 22,
      fillStyle: '#dff0ff', globalAlpha: 0.35 + 0.3 * breathe
    });
    renderer.drawArc({ x: pos.x + 6, y: pos.y + 1, radius: 1.3, fillStyle: '#c9a35c' });

    if (this.lit) {
      renderer.drawLight({
        x: pos.x, y: pos.y + 8, radius: 160, color: '#bfe0ff', intensity: 0.55 * breathe
      });
    }
  }
}

// Compile Rapier's WASM module before anything builds a physics world.
await initPhysics();

const game = new M2D(document.getElementById('screen'), {
  pointerLock: false,
  initialScene: 'mainMenu', width: 640, height: 480,
  worldWidth: WORLD.width, worldHeight: WORLD.height,
  sounds: { solved: solvedSound },
  music: { menu: symmetricalTree, game: redux }
});
// The maze is larger than the view; the camera follows the player and these
// bounds keep it from showing the void past the outer wall.
game.camera.bounds = { left: 0, top: 0, right: WORLD.width, bottom: WORLD.height };
game.registerActor('MazePlayer', MazePlayer);
game.registerActor('Platform', StoneWall);
game.registerActor('Goal', Goal);
registerMainMenu(game, {
  title: 'Maze',
  subtitle: 'find the green goal',
  hint: 'Arrows move · O for settings',
  backdrop: menuBackdrop,
  items: () => [
    { text: 'Start Game', onSelect: () => game.sceneManager.switchTo('maze') },
    { text: 'Settings', onSelect: () => game.settings.open() }
  ],
  onEnter: () => game.soundManager.playMusic('menu')
});

// The paper the maze is drawn on, built per entry and torn down on exit so
// its ambient light and post pass never leak into the menu.
let backdrop = null;

game.sceneManager.addScene('maze', {
  fetch: async () => ({
    version: 1, name: 'maze', type: 'level', gameType: 'topDown',
    world: { width: WORLD.width, height: WORLD.height, gravity: { x: 0, y: 0 } },
    assets: { spritesheets: {
      floor: { url: cobbleTexture, frameWidth: 256, frameHeight: 256 },
      wall: { url: rockTexture, frameWidth: 256, frameHeight: 256 }
    } },
    prefabs: {
      // A circle character in 32px corridors the player is also 32px wide:
      // the round shape plus the controller's slide is what lets a 90° turn
      // happen on the move instead of only when perfectly aligned.
      player: { actor: 'MazePlayer', physics: { bodyType: 'character', shape: 'circle', frictionAir: 0.2 } },
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
    game.soundManager.playMusic('game');
    const scene = game.sceneManager.getCurrentScene();
    scene.ui.add(new SolvedBanner());
    backdrop = new SurveyBackdrop(game, scene.spriteSheets.get('floor'));
    backdrop.applyAtmosphere();
  },
  onExit() {
    backdrop?.clearAtmosphere();
    backdrop = null;
  },
  onDrawBackground() {
    backdrop?.drawBackground();
  },
  onDraw() {
    backdrop?.drawForeground();
  }
});
// Settings overlay (O), with the demos' shared Audio row added on.
new SettingsMenu(game).addOption(audioOption(game));

game.start();
