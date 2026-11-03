import { makeRng, range } from '../shared/rng.js';
import { tileTexture } from '../shared/textures.js';

/**
 * The ground the maze stands on: old cobbles under a night sky.
 *
 * The menu shows the surveyor's plan of this place; the level is the place
 * itself, seen by the lantern the player carries (see `MazePlayer`). The
 * backdrop lays the cobbles, drops them into the dark, and adds the odd
 * puddle and clump of moss so the floor has a history. The walls light
 * themselves as the lantern passes (see `StoneWall`).
 *
 * Two passes wired to the scene hooks, plus persistent atmosphere:
 *
 *   drawBackground   cobbles, wash, puddles, moss — before entities
 *   drawForeground   the frame's lights — after them
 */
export class SurveyBackdrop {
  /**
   * @param {import('m2d-engine/core/m2d.js').M2D} game
   * @param {Object} floorSheet - The scene's `floor` sheet: the cobbles
   * @param {number} [seed=0x5EED] - The level's own seed
   */
  constructor(game, floorSheet, seed = 0x5EED) {
    this.game = game;
    this.renderer = game.renderer;
    this.floor = floorSheet?.image ?? null;
    this.bounds = {
      width: game.options.worldWidth,
      height: game.options.worldHeight
    };
    this.time = 0;

    this.features = {
      lights: game.renderer.supports('lights'),
      blendModes: game.renderer.supports('blendModes')
    };

    const rng = makeRng(seed);
    this.puddles = Array.from({ length: 26 }, () => ({
      x: range(rng, 0, this.bounds.width),
      y: range(rng, 0, this.bounds.height),
      rx: range(rng, 14, 40),
      ry: range(rng, 8, 20),
      alpha: range(rng, 0.25, 0.5)
    }));
    this.moss = Array.from({ length: 40 }, () => ({
      x: range(rng, 0, this.bounds.width),
      y: range(rng, 0, this.bounds.height),
      radius: range(rng, 10, 34),
      alpha: range(rng, 0.08, 0.2)
    }));
  }

  applyAtmosphere() {
    // Night. The lantern and the door are the only real light; the ambient
    // keeps the texture legible, nothing more.
    this.renderer.setAmbientLight('#dcdfe4');
    this.renderer.setPostEffects({
      bloom: { threshold: 0.72, strength: 0.5, blur: 24 },
      vignette: { strength: 0.22, start: 0.55 },
      grade: { shadows: '#7e8694', highlights: '#fffaf0', amount: 0.42, saturation: 1.0, contrast: 1.03 },
      grain: { strength: 0.05 },
      distortion: { strength: 0.02 }
    });
  }

  clearAtmosphere() {
    this.renderer.setAmbientLight(null);
    this.renderer.setPostEffects(null);
  }

  update(deltaTime) {
    this.time += deltaTime;
  }

  #view() {
    const camera = this.game.camera;
    return {
      left: camera.x - camera.width / 2,
      top: camera.y - camera.height / 2,
      width: camera.width,
      height: camera.height
    };
  }

  /** The cobbles. Before the entities. */
  drawBackground() {
    const renderer = this.renderer;
    const view = this.#view();
    const rect = { x: view.left - 4, y: view.top - 4, width: view.width + 8, height: view.height + 8 };

    tileTexture(renderer, this.floor, rect, 192);
    renderer.drawRect({ ...rect, fillStyle: 'rgba(16, 20, 30, 0.1)' });

    for (const moss of this.moss) {
      if (moss.x < view.left - 40 || moss.x > view.left + view.width + 40) continue;
      if (moss.y < view.top - 40 || moss.y > view.top + view.height + 40) continue;
      renderer.drawArc({
        x: moss.x, y: moss.y, radius: moss.radius,
        fillStyle: {
          type: 'radial', x: moss.x, y: moss.y, r0: 0, r1: moss.radius,
          stops: [{ offset: 0, color: 'rgba(70, 96, 50, 0.6)' }, { offset: 1, color: 'rgba(70, 96, 50, 0)' }]
        },
        globalAlpha: moss.alpha
      });
    }
    for (const puddle of this.puddles) {
      if (puddle.x < view.left - 40 || puddle.x > view.left + view.width + 40) continue;
      if (puddle.y < view.top - 40 || puddle.y > view.top + view.height + 40) continue;
      // Standing water: darker than the stone, with the sky in it.
      renderer.drawRect({
        x: puddle.x - puddle.rx, y: puddle.y - puddle.ry, width: puddle.rx * 2, height: puddle.ry * 2,
        fillStyle: {
          type: 'linear', x0: 0, y0: puddle.y - puddle.ry, x1: 0, y1: puddle.y + puddle.ry,
          stops: [{ offset: 0, color: 'rgba(20, 28, 44, 0.9)' }, { offset: 1, color: 'rgba(40, 54, 80, 0.9)' }]
        },
        globalAlpha: puddle.alpha,
        cornerRadius: puddle.ry
      });
    }
  }

  /** The frame's lights. After the entities. */
  drawForeground() {
    if (!this.features.lights) return;
    const renderer = this.renderer;
    const view = this.#view();

    // Moonlight: a faint cool fill from above the whole plan.
    renderer.drawLight({
      x: view.left + view.width / 2, y: view.top + view.height / 2,
      radius: view.width,
      color: '#f4eede',
      intensity: 0.4
    });

    const player = this.game.player;
    if (player && !player.dead) {
      const pos = player.renderPosition;
      const flicker = 0.92 + 0.08 * Math.sin(this.time * 13);
      renderer.drawLight({
        x: pos.x, y: pos.y,
        radius: 230,
        color: '#ffd9a0',
        intensity: 0.9 * flicker
      });
    }
  }
}
