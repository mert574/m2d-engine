import { Entity } from 'm2d-engine/core/entity.js';
import { s } from 'm2d-engine/core/schema.js';
import { makeRng, range } from '../shared/rng.js';
import { tileTexture } from '../shared/textures.js';

/**
 * The garden the courts stand in: a mown lawn in full morning sun.
 *
 * The menu shows the head gardener's plan of this place; the level is the
 * place itself. The backdrop lays the lawn, mows it in stripes, scatters
 * clover, sets flower beds at the maze's dead ends and stepping stones
 * through the gates, and sends cloud shadows and butterflies across the
 * whole thing. The hedges shade themselves (see `HedgeWall`).
 *
 * It is scenery placed in the court, twice: the `lawn` layer draws the
 * turf, its stripes, the clover and the fountain's plaza under everything,
 * and the `sky` layer the cloud shadows, butterflies and sun over it. The
 * court's warm grade and the morning light are `world.lighting` and
 * `world.post`, so the editor shows the garden as it plays.
 *
 * Everything here is presentation: it reads the clock and the camera and
 * writes nothing the simulation sees.
 */

const BUTTERFLIES = ['#fef6ef', '#f3d35a', '#eb9a54'];

export class GardenBackdrop extends Entity {
  static properties = {
    layer: s.enumOf(['lawn', 'sky'], { initial: 'lawn', description: 'lawn: the turf under everything; sky: the cloud shadows and sun over it' }),
    lawnTexture: s.ref('image', { description: 'The mown turf, tiled' }),
    plazaTexture: s.ref('image', { description: 'The travertine circle the fountain stands on' }),
    seed: s.integer({ min: 0, initial: 0xb100, description: 'Which scatter of clover and clouds' })
  };

  name = 'GardenBackdrop';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    // Scenery: drawn, never touched.
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.layer = options.layer ?? 'lawn';
    this.zIndex = this.layer === 'sky' ? 1000 : -1000;
    this.depth = this.layer === 'sky' ? Infinity : -Infinity;

    this.lawn = options.lawnTexture ?? null;
    this.plaza = options.plazaTexture ?? null;
    this.time = 0;
    const bounds = { width: game.options.worldWidth, height: game.options.worldHeight };
    this.bounds = bounds;

    const rng = makeRng(options.seed ?? 0xb100);
    this.clover = Array.from({ length: Math.round(bounds.width * bounds.height / 36000) }, () => ({
      x: range(rng, 0, bounds.width),
      y: range(rng, 0, bounds.height),
      radius: range(rng, 12, 30),
      alpha: range(rng, 0.08, 0.18)
    }));

    /** Butterflies, each tied to a flower bed; the beds are placed, so this waits for the first frame. */
    this.butterflies = null;

    // Two clouds crossing the garden, large and soft and slow.
    this.clouds = [
      { x: bounds.width * 0.2, y: bounds.height * 0.3, vx: 14, vy: 4, radius: 330 },
      { x: bounds.width * 0.75, y: bounds.height * 0.7, vx: 10, vy: -3, radius: 430 }
    ];
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.time += deltaTime;
  }

  draw() {
    if (this.dead || !this.visible) return;
    if (this.layer === 'lawn') this.drawLawn();
    else this.drawSky();
  }

  /** The beds this court placed, as the butterflies' anchors. */
  #anchors() {
    if (this.butterflies) return this.butterflies;
    const beds = [...this.game.entities].filter((entity) => entity.prefab === 'bed');
    const picks = beds.length ? beds.map((bed) => bed.position) : [{ x: this.bounds.width / 2, y: this.bounds.height / 2 }];
    this.butterflies = Array.from({ length: Math.min(6, 2 + Math.floor(picks.length / 4)) }, (_, i) => ({
      anchor: picks[(i * 7) % picks.length],
      color: BUTTERFLIES[i % BUTTERFLIES.length],
      fx: 0.21 + 0.04 * (i % 3),
      fy: 0.17 + 0.05 * ((i + 1) % 3),
      phase: i * 1.7,
      reach: 70 + 22 * (i % 4)
    }));
    return this.butterflies;
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

  /** The lawn and everything planted in it. Under the entities. */
  drawLawn() {
    const renderer = this.game.renderer;
    const view = this.#view();
    const rect = { x: view.left - 4, y: view.top - 4, width: view.width + 8, height: view.height + 8 };
    const onScreen = (x, y, margin) =>
      x > view.left - margin && x < view.left + view.width + margin &&
      y > view.top - margin && y < view.top + view.height + margin;

    tileTexture(renderer, this.lawn, rect, 192);

    // Mowing stripes: alternating 96px bands, barely there, which is all a
    // tended lawn needs to read as tended.
    const firstBand = Math.floor(rect.y / 192) * 192;
    for (let y = firstBand; y < rect.y + rect.height; y += 192) {
      renderer.drawRect({
        x: rect.x, y, width: rect.width, height: 96,
        fillStyle: 'rgba(255, 252, 220, 0.045)'
      });
    }

    // Flat fills: a gradient per patch was the single heaviest thing the
    // garden drew, and at this alpha the eye cannot tell.
    for (const clover of this.clover) {
      if (!onScreen(clover.x, clover.y, 40)) continue;
      renderer.drawArc({
        x: clover.x, y: clover.y, radius: clover.radius,
        fillStyle: 'rgb(120, 160, 70)',
        globalAlpha: clover.alpha * 0.6
      });
    }

    // The fountain's plaza: a worn travertine circle the hedges were
    // cleared for (baked in textures/plaza.png), laid under whichever
    // fountain this court placed.
    if (!this.plaza?.width) return;
    for (const entity of this.game.entities) {
      if (entity.prefab !== 'fountain') continue;
      const at = entity.position;
      if (!onScreen(at.x, at.y, 120)) continue;
      renderer.drawSprite({
        image: this.plaza, x: at.x, y: at.y,
        tileWidth: this.plaza.width, tileHeight: this.plaza.height,
        width: 94, height: 94
      });
    }
  }

  /** What the sky does to the garden. Over the entities. */
  drawSky() {
    const renderer = this.game.renderer;
    const view = this.#view();

    // Cloud shadows: the one thing that moves on the whole lawn, and the
    // thing that makes the sun read as sun. They loop around the map with a
    // margin so a loop never pops on screen.
    for (const cloud of this.clouds) {
      const marginW = this.bounds.width + 1600;
      const marginH = this.bounds.height + 1600;
      const cx = ((cloud.x + cloud.vx * this.time) % marginW + marginW) % marginW - 800;
      const cy = ((cloud.y + cloud.vy * this.time) % marginH + marginH) % marginH - 800;
      if (cx < view.left - cloud.radius || cx > view.left + view.width + cloud.radius) continue;
      if (cy < view.top - cloud.radius || cy > view.top + view.height + cloud.radius) continue;
      renderer.drawArc({
        x: cx, y: cy, radius: cloud.radius,
        fillStyle: {
          type: 'radial', x: cx, y: cy, r0: cloud.radius * 0.3, r1: cloud.radius,
          stops: [{ offset: 0, color: 'rgba(36, 56, 40, 0.1)' }, { offset: 1, color: 'rgba(36, 56, 40, 0)' }]
        }
      });
    }

    // Butterflies over everything, wings flicking as two dots that trade
    // widths.
    for (const b of this.#anchors()) {
      const t = this.time + b.phase;
      const x = b.anchor.x + Math.sin(t * b.fx * Math.PI * 2) * b.reach;
      const y = b.anchor.y + Math.sin(t * b.fy * Math.PI * 2 + 1.3) * b.reach * 0.8;
      if (x < view.left - 20 || x > view.left + view.width + 20) continue;
      if (y < view.top - 20 || y > view.top + view.height + 20) continue;
      const flap = Math.sin(t * 26);
      renderer.drawArc({ x: x + 2, y: y + 3, radius: 2.6, fillStyle: 'rgba(30, 48, 30, 0.25)' });
      renderer.drawArc({ x: x - 1.6 * (0.4 + 0.6 * Math.abs(flap)), y, radius: 2.2, fillStyle: b.color });
      renderer.drawArc({ x: x + 1.6 * (0.4 + 0.6 * Math.abs(-flap)), y, radius: 2.2, fillStyle: b.color });
    }

    if (!renderer.supports('lights')) return;

    // The sun: one broad warm light over the view. Morning, not noon — the
    // grade above does the colour, this adds the glow.
    renderer.drawLight({
      x: view.left + view.width / 2, y: view.top + view.height / 2,
      radius: view.width * 0.9,
      color: '#fff3d0',
      intensity: 0.5
    });
  }
}
