import { Entity } from 'm2d-engine/core/entity.js';
import { makeRng, range } from '../shared/rng.js';
import { HEIGHT } from './meadow.js';

/**
 * Beeline's meadow, in depth.
 *
 * Four planes, each sliding at its own fraction of the camera's travel, so
 * the flight down the verge has a summer behind it and grass in front:
 *
 *   0.0   the sky        golden-hour gradient, the sun, drifting clouds
 *   0.15  far verge      pale honey clumps in the haze
 *   0.45  mid verge      olive-gold grasses and flower stands
 *   1.0   the verge      the green bank the flowers grow from (the flowers
 *                        themselves are entities, so the bee sorts with them)
 *   1.3   foreground     deep-green blades sweeping past, drawn last
 *
 * `Meadow` is one entity at zIndex 0 with a depth of -Infinity, so it draws
 * under every actor; `ForeMeadow` is a second at zIndex 6. Both are
 * deterministic from the seed; every clump is laid out once and culled
 * against the view each frame. Presentation only: nothing here is read by
 * the simulation.
 */

/** A parallax plane's world shift: where its point q lands, given the camera. */
function shift(camera, parallax) {
  return camera.x * (1 - parallax);
}

/** Lay a periodic strip of clumps: seeded sizes and spacing, one period. */
function makeStrip(rng, period, sprites, minSize, maxSize, spacingMin = 0.45, spacingMax = 0.8) {
  const clumps = [];
  for (let x = 0; x < period;) {
    const size = range(rng, minSize, maxSize);
    clumps.push({ x, size, sprite: sprites[Math.floor(range(rng, 0, sprites.length)) % sprites.length], sway: range(rng, 0, Math.PI * 2) });
    x += size * range(rng, spacingMin, spacingMax);
  }
  return clumps;
}

/** Draw one strip, repeated across the view at its parallax. */
function drawStrip(renderer, textures, camera, area, time, { clumps, period, parallax, baseY, swayAmount = 0.03, alpha = 1 }) {
  const offset = shift(camera, parallax);
  const left = area.left - offset;
  const first = Math.floor((left - 400) / period) * period;
  for (let px = first; px < left + (area.right - area.left) + 400; px += period) {
    for (const clump of clumps) {
      const x = px + clump.x + offset;
      if (x < area.left - clump.size || x > area.right + clump.size) continue;
      const image = textures[clump.sprite];
      if (!image) continue;
      const sway = Math.sin(time * 0.7 + clump.sway) * swayAmount;
      renderer.pushTransform({ x, y: baseY, rotation: sway });
      renderer.drawSprite({
        image, x: 0, y: -clump.size / 2,
        tileWidth: image.width, tileHeight: image.height,
        width: clump.size, height: clump.size,
        globalAlpha: alpha
      });
      renderer.popTransform();
    }
  }
}

export class Meadow extends Entity {
  name = 'Meadow';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.zIndex = 0;
    this.depth = -Infinity;
    this.textures = options.textures ?? {};

    const rng = makeRng(options.seed ?? 0x5eed5);
    this.farPeriod = 2400;
    this.far = makeStrip(rng, this.farPeriod, ['far-grass-a', 'far-grass-b', 'far-bush'], 80, 150);
    this.midPeriod = 1800;
    this.mid = makeStrip(rng, this.midPeriod, ['mid-grass-a', 'mid-grass-b', 'mid-flowers', 'mid-sprouts'], 90, 160, 0.6, 1.1);
    this.vergePeriod = 1400;
    this.verge = makeStrip(rng, this.vergePeriod, ['play-grass-a', 'play-grass-b', 'play-grass-c'], 56, 100, 0.55, 1);

    // Clouds and drifting seeds are screen furniture: placed in view space,
    // on their own slow clocks.
    this.clouds = Array.from({ length: 3 }, (_, i) => ({
      y: 50 + i * 55 + range(rng, -15, 15),
      scale: range(rng, 0.8, 1.5),
      speed: range(rng, 5, 11),
      at: range(rng, 0, 1)
    }));
    this.seeds = Array.from({ length: 9 }, (_, i) => ({
      phase: range(rng, 0, Math.PI * 2),
      speed: range(rng, 10, 22),
      y: range(rng, 90, 420),
      wobble: range(rng, 14, 30)
    }));
  }

  draw() {
    const game = this.game;
    const renderer = game.renderer;
    const camera = game.camera;
    const area = camera.getVisibleArea();
    const time = game.time.elapsed;
    const width = area.right - area.left;

    // The sky: golden hour, warm at the verge, paling upward.
    renderer.drawRect({
      x: area.left, y: area.top, width, height: HEIGHT,
      fillStyle: {
        type: 'linear', x0: 0, y0: area.top, x1: 0, y1: HEIGHT,
        stops: [
          { offset: 0, color: '#ffd98f' },
          { offset: 0.55, color: '#ffe9bb' },
          { offset: 1, color: '#fff4d6' }
        ]
      }
    });

    // The sun, pinned to the view like the sky it sits in.
    const sunX = area.left + width * 0.76;
    const sunY = area.top + 108;
    renderer.drawArc({
      x: sunX, y: sunY, radius: 130,
      fillStyle: {
        type: 'radial', x: sunX, y: sunY, r0: 30, r1: 130,
        stops: [{ offset: 0, color: 'rgba(255, 246, 214, 0.85)' }, { offset: 1, color: 'rgba(255, 246, 214, 0)' }]
      }
    });
    renderer.drawArc({ x: sunX, y: sunY, radius: 34, fillStyle: '#fff8e2' });

    // Clouds, a parallax of their own through their drift speed.
    for (const cloud of this.clouds) {
      const span = width + 500;
      const x = area.left - 250 + (((cloud.at * span) + time * cloud.speed) % span + span) % span;
      renderer.pushTransform({ x, y: area.top + cloud.y, scaleX: cloud.scale, scaleY: cloud.scale * 0.42 });
      for (const [dx, r, a] of [[0, 90, 0.75], [70, 60, 0.65], [-75, 55, 0.6]]) {
        renderer.drawArc({ x: dx, y: 0, radius: r, fillStyle: `rgba(255, 252, 240, ${a})` });
      }
      renderer.popTransform();
    }

    // The planes, far to near.
    const textures = this.textures;
    drawStrip(renderer, textures, camera, area, time, {
      clumps: this.far, period: this.farPeriod, parallax: 0.15, baseY: HEIGHT - 86, swayAmount: 0.015, alpha: 0.9
    });
    drawStrip(renderer, textures, camera, area, time, {
      clumps: this.mid, period: this.midPeriod, parallax: 0.45, baseY: HEIGHT - 38, swayAmount: 0.02, alpha: 0.95
    });

    // The verge the flowers grow from: a warm green bank along the bottom,
    // then its grass.
    renderer.drawRect({
      x: area.left, y: HEIGHT - 34, width, height: 34,
      fillStyle: {
        type: 'linear', x0: 0, y0: HEIGHT - 34, x1: 0, y1: HEIGHT,
        stops: [{ offset: 0, color: '#6aa14a' }, { offset: 1, color: '#4a8033' }]
      }
    });
    drawStrip(renderer, textures, camera, area, time, {
      clumps: this.verge, period: this.vergePeriod, parallax: 1, baseY: HEIGHT + 4
    });

    // Dandelion seeds on the air, the meadow's dust motes.
    for (const seed of this.seeds) {
      const span = width + 160;
      const x = area.left - 80 + ((seed.phase * 300 + time * seed.speed) % span + span) % span;
      const y = seed.y + Math.sin(time * 0.8 + seed.phase) * seed.wobble;
      renderer.drawArc({ x, y, radius: 2.2, fillStyle: 'rgba(255, 253, 244, 0.8)' });
      renderer.drawArc({ x, y: y + 3.4, radius: 1, fillStyle: 'rgba(120, 110, 80, 0.5)' });
    }
  }
}

export class ForeMeadow extends Entity {
  name = 'ForeMeadow';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.zIndex = 6;
    this.depth = Infinity;
    this.textures = options.textures ?? {};
    const rng = makeRng(options.seed ?? 0x0f0e);
    // Sparse: the odd blade sweeping past sells the parallax; a wall of
    // them buries the playfield.
    this.period = 2600;
    this.clumps = makeStrip(rng, this.period, ['fore-grass-a', 'fore-grass-b', 'fore-bush'], 150, 260, 1.8, 3.2);
  }

  draw() {
    const game = this.game;
    const camera = game.camera;
    const area = camera.getVisibleArea();
    drawStrip(game.renderer, this.textures, camera, area, game.time.elapsed, {
      clumps: this.clumps, period: this.period, parallax: 1.3, baseY: HEIGHT + 56, swayAmount: 0.04
    });
  }
}
