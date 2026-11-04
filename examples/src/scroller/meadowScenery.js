import { Entity } from 'm2d-engine/core/entity.js';
import { makeRng, range } from '../shared/rng.js';
import { LENGTH, HEIGHT } from './meadow.js';

/**
 * Beeline's meadow, in depth and in time.
 *
 * Six planes, each sliding at its own fraction of the camera's travel:
 *
 *   0.0   the sky        a gradient that keeps the run's time: golden hour
 *                        at the gate, violet dusk at the hive. The sun sets
 *                        over the length of the lane, with god rays while
 *                        it is high and a swollen red disc as it lands
 *   0.06  the treeline   hazed violet-grey crowns past the fields
 *   0.15  far verge      pale honey clumps, behind a band of aerial haze
 *   0.45  mid verge      olive-gold grasses and flower stands
 *   1.0   the verge      the green bank the flowers grow from
 *   1.3   foreground     deep blades sweeping past, fireflies once the
 *                        light goes, and the dusk itself as a scrim
 *
 * `Meadow` draws under every actor (zIndex 0, depth -Infinity);
 * `ForeMeadow` over them (zIndex 6). Both read the camera and the wall
 * clock freely: presentation only, nothing the simulation sees.
 */

/** Where the run is, 0 at the gate to 1 with the camera parked at the hive. */
export function progress(camera) {
  return Math.min(1, Math.max(0, (camera.x - 480) / (LENGTH - 960)));
}

/** Lerp two hex colours; cheap enough to run per frame. */
export function mixColor(a, b, t) {
  const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
  const channel = (shift) => Math.round(((ah >> shift) & 255) + (((bh >> shift) & 255) - ((ah >> shift) & 255)) * t);
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

/** The sky's three stops, by time of day. */
const SKY = {
  top: ['#8fc0d8', '#39355e'],
  mid: ['#ffe2a6', '#a35a84'],
  low: ['#ffd98f', '#ff9e5e']
};

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
    this.blend = game.renderer.supports('blendModes') ? 'additive' : undefined;

    const rng = makeRng(options.seed ?? 0x5eed5);
    this.treePeriod = 3000;
    this.trees = makeStrip(rng, this.treePeriod, ['tree-a', 'tree-b', 'tree-c'], 140, 240, 0.5, 1);
    this.farPeriod = 2400;
    this.far = makeStrip(rng, this.farPeriod, ['far-grass-a', 'far-grass-b', 'far-bush'], 80, 150);
    this.midPeriod = 1800;
    this.mid = makeStrip(rng, this.midPeriod, ['mid-grass-a', 'mid-grass-b', 'mid-flowers', 'mid-sprouts'], 90, 160, 0.6, 1.1);
    this.vergePeriod = 1400;
    this.verge = makeStrip(rng, this.vergePeriod, ['play-grass-a', 'play-grass-b', 'play-grass-c'], 56, 100, 0.55, 1);

    this.clouds = Array.from({ length: 3 }, (_, i) => ({
      y: 48 + i * 52 + range(rng, -14, 14),
      scale: range(rng, 0.8, 1.5),
      speed: range(rng, 5, 11),
      at: range(rng, 0, 1)
    }));
    this.seeds = Array.from({ length: 10 }, () => ({
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
    const t = progress(camera);

    // The sky keeps the run's time: gold at the gate, violet at the hive.
    renderer.drawRect({
      x: area.left, y: area.top, width, height: HEIGHT,
      fillStyle: {
        type: 'linear', x0: 0, y0: area.top, x1: 0, y1: HEIGHT,
        stops: [
          { offset: 0, color: mixColor(SKY.top[0], SKY.top[1], t) },
          { offset: 0.55, color: mixColor(SKY.mid[0], SKY.mid[1], t) },
          { offset: 1, color: mixColor(SKY.low[0], SKY.low[1], t) }
        ]
      }
    });

    // The sun goes down over the lane: higher, whiter and raying at the
    // start; swollen, red and half into the verge by the hive.
    const sunX = area.left + width * 0.74;
    const sunY = area.top + 104 + t * 300;
    const sunR = 34 + t * 26;
    const sunColor = mixColor('#fff8e2', '#ffac60', t);
    renderer.drawArc({
      x: sunX, y: sunY, radius: sunR * 4.2,
      fillStyle: {
        type: 'radial', x: sunX, y: sunY, r0: sunR * 0.8, r1: sunR * 4.2,
        stops: [
          { offset: 0, color: `rgba(255, ${210 - t * 60}, ${150 - t * 60}, 0.55)` },
          { offset: 1, color: 'rgba(255, 200, 140, 0)' }
        ]
      },
      blend: this.blend
    });
    // God rays while the sun is high, swinging slowly.
    const rayAlpha = 0.07 * (1 - t * 0.8);
    if (rayAlpha > 0.015) {
      for (let i = 0; i < 6; i++) {
        const angle = time * 0.03 + i * (Math.PI / 3);
        const reach = width * 0.9;
        renderer.drawPath({
          points: [
            { x: sunX, y: sunY },
            { x: sunX + Math.cos(angle) * reach, y: sunY + Math.sin(angle) * reach },
            { x: sunX + Math.cos(angle + 0.1) * reach, y: sunY + Math.sin(angle + 0.1) * reach }
          ],
          fillStyle: `rgba(255, 236, 190, ${rayAlpha})`,
          blend: this.blend
        });
      }
    }
    renderer.drawArc({ x: sunX, y: sunY, radius: sunR, fillStyle: sunColor });

    // Clouds, under-lit as the light lowers.
    for (const cloud of this.clouds) {
      const span = width + 500;
      const x = area.left - 250 + (((cloud.at * span) + time * cloud.speed) % span + span) % span;
      renderer.pushTransform({ x, y: area.top + cloud.y, scaleX: cloud.scale, scaleY: cloud.scale * 0.42 });
      const tone = mixColor('#fffcf0', '#f0a87e', t);
      for (const [dx, r, a] of [[0, 90, 0.75], [70, 60, 0.65], [-75, 55, 0.6]]) {
        renderer.drawArc({ x: dx, y: 0, radius: r, fillStyle: tone, globalAlpha: a * (1 - t * 0.25) });
      }
      renderer.popTransform();
    }

    const textures = this.textures;

    // The treeline past the fields, sunk in haze.
    drawStrip(renderer, textures, camera, area, time, {
      clumps: this.trees, period: this.treePeriod, parallax: 0.06, baseY: HEIGHT - 118, swayAmount: 0.008, alpha: 0.85
    });
    // Aerial perspective: the sky laid thinly back over the distance.
    renderer.drawRect({
      x: area.left, y: HEIGHT - 230, width, height: 230,
      fillStyle: {
        type: 'linear', x0: 0, y0: HEIGHT - 230, x1: 0, y1: HEIGHT - 40,
        stops: [
          { offset: 0, color: 'rgba(255, 220, 160, 0)' },
          { offset: 1, color: mixColor('#ffdfa2', '#b06a6e', t).replace('rgb', 'rgba').replace(')', ', 0.42)') }
        ]
      }
    });

    drawStrip(renderer, textures, camera, area, time, {
      clumps: this.far, period: this.farPeriod, parallax: 0.15, baseY: HEIGHT - 86, swayAmount: 0.015, alpha: 0.92
    });
    drawStrip(renderer, textures, camera, area, time, {
      clumps: this.mid, period: this.midPeriod, parallax: 0.45, baseY: HEIGHT - 38, swayAmount: 0.02
    });

    // The verge the flowers grow from.
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

    // Dandelion seeds on the air, backlit.
    for (const seed of this.seeds) {
      const span = width + 160;
      const x = area.left - 80 + ((seed.phase * 300 + time * seed.speed) % span + span) % span;
      const y = seed.y + Math.sin(time * 0.8 + seed.phase) * seed.wobble;
      renderer.drawArc({ x, y, radius: 2.2, fillStyle: 'rgba(255, 253, 244, 0.85)', blend: this.blend });
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
    this.lit = game.renderer.supports('lights');
    this.blend = game.renderer.supports('blendModes') ? 'additive' : undefined;
    const rng = makeRng(options.seed ?? 0x0f0e);
    this.period = 2600;
    this.clumps = makeStrip(rng, this.period, ['fore-grass-a', 'fore-grass-b', 'fore-bush'], 150, 260, 1.8, 3.2);
    this.fireflies = Array.from({ length: 14 }, (_, i) => ({
      at: range(rng, 0, 1),
      y: range(rng, 220, 480),
      fx: range(rng, 0.06, 0.14),
      fy: range(rng, 0.1, 0.2),
      phase: range(rng, 0, Math.PI * 2),
      blinkRate: range(rng, 0.6, 1.4)
    }));
  }

  draw() {
    const game = this.game;
    const renderer = game.renderer;
    const camera = game.camera;
    const area = camera.getVisibleArea();
    const time = game.time.elapsed;
    const width = area.right - area.left;
    const t = progress(camera);

    drawStrip(renderer, this.textures, camera, area, time, {
      clumps: this.clumps, period: this.period, parallax: 1.3, baseY: HEIGHT + 56, swayAmount: 0.04
    });

    // The dusk itself: a violet scrim rising with the run, under the HUD
    // and over the world, which is what carries the time of day on the
    // canvas backend too.
    if (t > 0.02) {
      renderer.drawRect({
        x: area.left, y: area.top, width, height: HEIGHT,
        fillStyle: `rgba(44, 34, 84, ${0.26 * t})`
      });
      renderer.drawRect({
        x: area.left, y: area.top, width, height: HEIGHT,
        fillStyle: `rgba(255, 120, 60, ${0.05 * t})`, blend: this.blend
      });
    }

    // Fireflies, out once the light goes, drifting over the verge.
    const glow = Math.max(0, (t - 0.55) / 0.45);
    if (glow > 0) {
      for (const fly of this.fireflies) {
        const x = area.left + ((fly.at + time * fly.fx * 0.05) % 1 + 1) % 1 * width;
        const y = fly.y + Math.sin(time * fly.fy * Math.PI * 2 + fly.phase) * 30;
        const blink = 0.4 + 0.6 * Math.max(0, Math.sin(time * fly.blinkRate + fly.phase));
        const alpha = glow * blink;
        renderer.drawArc({
          x, y, radius: 7,
          fillStyle: {
            type: 'radial', x, y, r0: 0, r1: 7,
            stops: [{ offset: 0, color: `rgba(200, 255, 140, ${0.5 * alpha})` }, { offset: 1, color: 'rgba(200, 255, 140, 0)' }]
          },
          blend: this.blend
        });
        renderer.drawArc({ x, y, radius: 1.6, fillStyle: `rgba(226, 255, 170, ${alpha})` });
        if (this.lit && blink > 0.7) {
          renderer.drawLight({ x, y, radius: 46, color: '#c8ff8c', intensity: 0.5 * alpha });
        }
      }
    }
  }
}
