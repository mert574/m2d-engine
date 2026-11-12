import { Entity } from 'm2d-engine/core/entity.js';
import { s } from 'm2d-engine/core/schema.js';
import { makeRng, range } from '../shared/rng.js';

const GRID = 'rgba(42, 50, 66, 0.1)';
const TILE = 96;

function inView(view, x, y, margin) {
  return x > view.left - margin && x < view.left + view.width + margin
    && y > view.top - margin && y < view.top + view.height + margin;
}

function viewOf(camera) {
  return { left: camera.x - camera.width / 2, top: camera.y - camera.height / 2, width: camera.width, height: camera.height };
}

/**
 * What the facility's floor carries over its concrete (the scene's
 * `background` layer): a cold wash, panels a shade off, the menu's grid,
 * stains and vents. Seeded, so it is the same place every time; drawn
 * just above the floor layer and under everything else. Its body is a
 * sensor nothing collides with.
 */
export class FloorMarks extends Entity {
  name = 'FloorMarks';

  static properties = {
    seed: s.number({ initial: 21, description: 'Fixes the scatter: the same default as the menu, the same place' }),
    panels: s.number({ initial: 90, min: 0, description: 'Patches a shade off the base, so the ground has rooms in it' }),
    stains: s.number({ initial: 70, min: 0 }),
    vents: s.number({ initial: 60, min: 0, description: 'Vents and drains on a loose grid' })
  };

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.zIndex = -1;
    this.depth = -Infinity;
    const rng = makeRng(options.seed ?? 21);
    const width = game.options.worldWidth;
    const height = game.options.worldHeight;
    this.panels = Array.from({ length: options.panels ?? 90 }, () => ({
      x: Math.floor(rng() * width / TILE) * TILE,
      y: Math.floor(rng() * height / TILE) * TILE,
      width: (1 + Math.floor(rng() * 3)) * TILE,
      height: (1 + Math.floor(rng() * 3)) * TILE,
      tone: rng() < 0.5 ? 'rgba(255, 255, 255, 0.2)' : 'rgba(30, 38, 54, 0.06)'
    }));
    this.stains = Array.from({ length: options.stains ?? 70 }, () => ({
      x: range(rng, 0, width), y: range(rng, 0, height), radius: range(rng, 14, 60), alpha: range(rng, 0.08, 0.2)
    }));
    this.vents = Array.from({ length: options.vents ?? 60 }, () => ({
      x: Math.floor(range(rng, 2, width / TILE - 2)) * TILE + TILE / 2,
      y: Math.floor(range(rng, 2, height / TILE - 2)) * TILE + TILE / 2,
      drain: rng() < 0.4
    }));
  }

  draw() {
    const renderer = this.game.renderer;
    const view = viewOf(this.game.camera);

    // The concrete gives the floor its grain; the wash gives the room its hour.
    renderer.drawRect({ x: view.left - 4, y: view.top - 4, width: view.width + 8, height: view.height + 8, fillStyle: 'rgba(22, 26, 38, 0.12)' });

    for (const panel of this.panels) {
      if (!inView(view, panel.x + panel.width / 2, panel.y + panel.height / 2, Math.max(panel.width, panel.height))) continue;
      renderer.drawRect({ x: panel.x, y: panel.y, width: panel.width, height: panel.height, fillStyle: panel.tone });
    }

    // The menu's grid, walked on. World-anchored, so it measures the place.
    for (let x = Math.floor(view.left / TILE) * TILE; x <= view.left + view.width; x += TILE) {
      renderer.drawLine({ x1: x, y1: view.top, x2: x, y2: view.top + view.height, strokeStyle: GRID, lineWidth: 1 });
    }
    for (let y = Math.floor(view.top / TILE) * TILE; y <= view.top + view.height; y += TILE) {
      renderer.drawLine({ x1: view.left, y1: y, x2: view.left + view.width, y2: y, strokeStyle: GRID, lineWidth: 1 });
    }

    for (const stain of this.stains) {
      if (!inView(view, stain.x, stain.y, stain.radius)) continue;
      renderer.drawArc({
        x: stain.x, y: stain.y, radius: stain.radius,
        fillStyle: { type: 'radial', x: stain.x, y: stain.y, r0: 0, r1: stain.radius, stops: [{ offset: 0, color: 'rgba(0, 0, 0, 0.55)' }, { offset: 1, color: 'rgba(0, 0, 0, 0)' }] },
        globalAlpha: stain.alpha
      });
    }

    for (const vent of this.vents) {
      if (!inView(view, vent.x, vent.y, 20)) continue;
      if (vent.drain) {
        renderer.drawArc({ x: vent.x, y: vent.y, radius: 7, strokeStyle: 'rgba(60, 70, 90, 0.3)', lineWidth: 2 });
        renderer.drawArc({ x: vent.x, y: vent.y, radius: 2.5, fillStyle: 'rgba(0, 0, 0, 0.5)' });
      } else {
        for (let i = -1; i <= 1; i++) {
          renderer.drawRect({ x: vent.x - 8, y: vent.y + i * 4 - 1, width: 16, height: 2, fillStyle: 'rgba(60, 70, 90, 0.3)', cornerRadius: 1 });
        }
      }
    }
  }
}

/**
 * A ceiling fixture: its light is the prefab's `light`, and this draws the
 * housing, which hangs nearest the eye. A dead one keeps its housing and
 * gives no light; a flickering one gutters. Where the renderer has no
 * light map, it paints its pool instead, faintly.
 */
export class CeilingLamp extends Entity {
  name = 'CeilingLamp';

  static properties = {
    live: s.boolean({ initial: true, description: 'Off, it keeps its housing and gives no light' }),
    flicker: s.boolean({ initial: false, description: 'Gutters instead of burning steady' })
  };

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.zIndex = 10;
    this.live = options.live ?? true;
    this.flicker = options.flicker ?? false;
    this.phase = (Math.round(body.position.x) * 7919 + Math.round(body.position.y) * 104729) % 6283 / 1000;
    this.time = 0;
    /** The prefab's intensity, kept before this lamp starts changing its own copy. */
    this.baseIntensity = null;
  }

  /** Steady, guttering or dark. */
  get level() {
    if (!this.live) return 0;
    if (!this.flicker) return 1;
    const gutter = Math.sin(this.time * 13 + this.phase) + Math.sin(this.time * 31 + this.phase * 2);
    return gutter > -0.4 ? 0.85 : 0.2;
  }

  update(deltaTime) {
    super.update(deltaTime);
    this.time += deltaTime;
    if (!this.light) return;
    // The light block is the prefab's, shared by every lamp; this one changes its own.
    if (this.baseIntensity === null) {
      this.baseIntensity = this.light.intensity ?? 1;
      this.light = { ...this.light };
    }
    this.light.intensity = this.baseIntensity * this.level;
  }

  draw() {
    const renderer = this.game.renderer;
    const { x, y } = this.renderPosition;
    const level = this.level;
    if (level > 0 && !renderer.supports('lights')) {
      renderer.drawArc({
        x, y, radius: 200,
        fillStyle: { type: 'radial', x, y, r0: 0, r1: 200, stops: [{ offset: 0, color: 'rgba(255, 255, 255, 0.14)' }, { offset: 0.5, color: 'rgba(255, 255, 255, 0.06)' }, { offset: 1, color: 'rgba(226, 232, 240, 0)' }] },
        globalAlpha: level
      });
    }
    renderer.drawRect({ x: x - 9, y: y - 9, width: 18, height: 18, fillStyle: '#0c0d12', strokeStyle: 'rgba(160, 170, 190, 0.35)', lineWidth: 1.5, cornerRadius: 3 });
    renderer.drawArc({ x, y, radius: 4, fillStyle: level > 0 ? '#f4f6ff' : '#2a2d36', globalAlpha: level > 0 ? 0.5 + 0.5 * level : 1 });
  }
}
