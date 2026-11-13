import { Entity } from 'm2d-engine/core/entity.js';
import { s } from 'm2d-engine/core/schema.js';
import { makeRng, range } from '../shared/rng.js';
import { seedRidges, ridgeProfile } from './dusk.js';

/**
 * The level's world: the menu's valley, stood inside.
 *
 * The menu promises a valley at dusk, so the level is that valley. The same
 * sky grade, the same ridge relief and the same palette come from `dusk.js`;
 * what changes is the projection. The menu drifts its ridges on a timer —
 * here they answer the camera instead, each layer moving at its `parallax`
 * fraction of the camera's speed, so walking right slides the near treeline
 * past the far peaks and climbing the level lifts the player above the
 * skyline.
 *
 * It is scenery placed in the scene, twice: the `back` layer draws the
 * sky, stars, sun, clouds and ridges under everything, and the `front`
 * layer the valley mist over the entities. The fireflies and falling
 * leaves are the scene's `world.particles`, the player's own light its
 * prefab's `light`, and the ambient light and post pass `world.lighting`
 * and `world.post`; so the editor shows the valley as it plays.
 *
 * Everything is deterministic from the seed and animated from `time`, and
 * every optional capability is asked for when drawing: on Canvas the
 * lights and additive blends drop out and the painted colours carry the
 * scene. Nothing here touches the renderer until it draws, so a headless
 * game builds the scene without it.
 */

/** Sampling step along a ridge, in world units. */
const STEP = 8;

/**
 * The level's own hour. The menu holds the valley at dusk; the level is the
 * same valley an hour earlier, golden and still bright enough to play in.
 * The silhouettes come from `dusk.js` unchanged — only the light differs.
 */
const LEVEL_SKY = [
  { offset: 0, color: '#355e92' },
  { offset: 0.42, color: '#6f94bc' },
  { offset: 0.7, color: '#b8a98e' },
  { offset: 0.86, color: '#e8b36a' },
  { offset: 1, color: '#f6cf8e' }
];

/** Ridge colours for that hour, far to near: hazier, never black. */
const LEVEL_RIDGES = ['#88a0bc', '#68829f', '#4d6482', '#374a66'];

export class ValleyBackdrop extends Entity {
  static properties = {
    layer: s.enumOf(['back', 'front'], { initial: 'back', description: 'back: the sky and ridges under everything; front: the valley mist over it' }),
    seed: s.integer({ min: 0, initial: 11, description: 'Which valley: the menu\'s is 11' })
  };

  name = 'ValleyBackdrop';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    // Scenery: drawn, never touched.
    body.setCollisionFilter({ category: 0, mask: 0 });
    this.layer = options.layer ?? 'back';
    this.zIndex = this.layer === 'front' ? 1000 : -1000;
    this.time = 0;
    this.bounds = {
      width: game.options.worldWidth,
      height: game.options.worldHeight
    };

    const rng = makeRng(options.seed ?? 11);
    this.ridges = seedRidges(rng);

    // Far cousins of the level's own islands, hanging over the valley
    // between the ridge layers. They are what says the floating platforms
    // belong to this world rather than to a tile set.
    this.farIslands = Array.from({ length: 4 }, (_, i) => ({
      x: range(rng, 0.1 + i * 0.24, 0.26 + i * 0.24),
      y: range(rng, 0.46, 0.6),
      width: range(rng, 46, 110),
      bob: range(rng, 0, Math.PI * 2),
      streamers: Array.from({ length: 2 }, () => ({
        t: range(rng, 0.3, 0.7),
        length: range(rng, 6, 14)
      })),
      lit: rng() < 0.5
    }));

    // God rays, fanning up and left from the sun across the sky.
    this.rays = Array.from({ length: 4 }, (_, i) => ({
      angle: Math.PI * (1.02 + i * 0.09) + range(rng, -0.02, 0.02),
      spread: range(rng, 0.016, 0.034),
      rate: range(rng, 0.01, 0.03) * (i % 2 ? 1 : -1),
      alpha: range(rng, 0.05, 0.1)
    }));

    // The sun stands where the menu puts it when the camera rests at the
    // level's start: low, right of centre, about to drop behind the peaks.
    // Its at-rest position is derived from the view per frame (`#sunAt`),
    // so a resize cannot strand it.
    this.sun = { parallax: 0.05 };

    this.clouds = Array.from({ length: 5 }, (_, i) => ({
      y: range(rng, 0.3, 0.52) + i * 0.03,
      width: range(rng, 0.2, 0.38),
      x: rng(),
      speed: range(rng, 2.5, 5),
      alpha: range(rng, 0.35, 0.6),
      phase: range(rng, 0, Math.PI * 2)
    }));

    // Stars live near the zenith and only matter once the player climbs;
    // at the valley floor the warm band owns the sky and they stay faint.
    this.stars = Array.from({ length: 70 }, () => ({
      x: rng() * this.bounds.width * 1.2 - this.bounds.width * 0.1,
      y: rng(),
      size: range(rng, 1, 2.4),
      alpha: range(rng, 0.25, 0.8),
      rate: range(rng, 0.4, 1.6),
      phase: range(rng, 0, Math.PI * 2)
    }));

    this.flock = Array.from({ length: 7 }, () => ({
      dx: range(rng, 0, 0.09),
      dy: range(rng, -0.035, 0.035),
      flap: range(rng, 0, Math.PI * 2)
    }));

    // Mist lobes: wide, slow, barely-there. The gradient under them does the
    // work; these keep its top edge from reading as a straight line.
    this.mist = Array.from({ length: 6 }, () => ({
      x: rng() * this.bounds.width,
      y: this.bounds.height - range(rng, 30, 130),
      width: range(rng, 260, 520),
      height: range(rng, 26, 48),
      drift: range(rng, -7, 7),
      alpha: range(rng, 0.05, 0.12),
      rate: range(rng, 0.1, 0.3),
      phase: range(rng, 0, Math.PI * 2)
    }));
  }

  get renderer() {
    return this.game.renderer;
  }

  /** What this renderer can do, asked once it is drawing. */
  get features() {
    this.#features ??= {
      blendModes: this.renderer.supports('blendModes'),
      lights: this.renderer.supports('lights')
    };
    return this.#features;
  }

  #features = null;

  /** @param {number} deltaTime - Seconds since the last frame */
  update(deltaTime) {
    this.time += deltaTime;
  }

  draw() {
    if (this.layer === 'front') this.drawForeground();
    else this.drawBackground();
  }

  /** The camera's view rectangle, in world units. */
  #view() {
    const camera = this.game.camera;
    return {
      left: camera.x - camera.width / 2,
      top: camera.y - camera.height / 2,
      width: camera.width,
      height: camera.height,
      cx: camera.x,
      cy: camera.y
    };
  }

  /**
   * Pattern offset for a parallax layer: how far the layer has slid from
   * its at-rest place, which is the camera sitting at the level's start in
   * the world's bottom-left. There the offset is zero and the composition
   * is exactly the menu's; a camera move of `d` slides the layer `d` times
   * `1 - factor` with it, so it appears to pass at `factor` of world speed.
   */
  #offset(view, factor) {
    const restX = view.width / 2;
    const restY = this.bounds.height - view.height / 2;
    return {
      x: (view.cx - restX) * (1 - factor),
      y: (view.cy - restY) * (1 - factor)
    };
  }

  /** The sun's world position this frame. */
  #sunAt(view) {
    const off = this.#offset(view, this.sun.parallax);
    return {
      x: view.width * 0.7 + off.x,
      y: (this.bounds.height - view.height) + view.height * 0.555 + off.y
    };
  }

  /** World Y of the horizon — the far ridge's footing — for this frame. */
  #horizonY(view) {
    const H = view.height;
    const off = this.#offset(view, this.ridges[0].parallax);
    return (this.bounds.height - H) + 0.64 * H + off.y;
  }

  /** Sky, stars, sun, clouds, flock, ridges. Before the entities. */
  drawBackground() {
    const renderer = this.renderer;
    const view = this.#view();
    const H = view.height;
    const horizon = this.#horizonY(view);
    const pad = 4;

    // The sky gradient hangs from the horizon with the menu's proportions.
    // Climbing carries the view past its top stop, which clamps to the
    // zenith colour: the higher the player gets, the more night they see.
    renderer.drawRect({
      x: view.left - pad, y: view.top - pad,
      width: view.width + pad * 2, height: view.height + pad * 2,
      fillStyle: {
        type: 'linear',
        x0: 0, y0: horizon - 0.64 * H, x1: 0, y1: horizon,
        stops: LEVEL_SKY
      }
    });

    this.#drawStars(renderer, view, horizon);
    this.#drawSun(renderer, view, horizon);
    this.#drawRays(renderer, view);

    for (const cloud of this.clouds) this.#drawCloud(renderer, cloud, view);
    this.#drawFlock(renderer, view);

    // Ridges, far to near, each on its own parallax. The haze band between
    // the far two is the menu's depth cue, carried over, and the far
    // islands hang in front of the first ridge.
    this.ridges.forEach((ridge, index) => {
      if (index === 1) {
        this.#drawHaze(renderer, view, horizon);
        this.#drawFarIslands(renderer, view);
      }
      this.#drawRidge(renderer, ridge, view);
    });

    // The low sun warms everything on its side of the valley.
    if (this.features.lights) {
      const sun = this.#sunAt(view);
      renderer.drawLight({ x: sun.x, y: sun.y, radius: view.width * 1.4, color: '#ffb46a', intensity: 0.75 });
    }
  }

  /** Slowly turning shafts of late light. Additive or not at all. */
  #drawRays(renderer, view) {
    if (!this.features.blendModes) return;
    const sun = this.#sunAt(view);
    const reach = view.width * 0.9;
    for (const ray of this.rays) {
      const a = ray.angle + Math.sin(this.time * ray.rate * Math.PI * 2) * 0.05;
      renderer.drawPath({
        points: [
          { x: sun.x, y: sun.y },
          { x: sun.x + Math.cos(a - ray.spread) * reach, y: sun.y + Math.sin(a - ray.spread) * reach },
          { x: sun.x + Math.cos(a + ray.spread) * reach, y: sun.y + Math.sin(a + ray.spread) * reach }
        ],
        closed: true,
        fillStyle: {
          type: 'radial', x: sun.x, y: sun.y, r0: 40, r1: reach,
          stops: [
            { offset: 0, color: 'rgba(255, 190, 120, 0.5)' },
            { offset: 1, color: 'rgba(255, 190, 120, 0)' }
          ]
        },
        globalAlpha: ray.alpha * (0.75 + 0.25 * Math.sin(this.time * 0.7 + ray.angle * 5)),
        blend: 'additive'
      });
    }
  }

  /** Distant islands between the ridge layers, adrift over the valley. */
  #drawFarIslands(renderer, view) {
    const off = this.#offset(view, 0.3);
    for (const island of this.farIslands) {
      const w = island.width;
      const x = island.x * this.bounds.width * 0.5 + off.x;
      const y = (this.bounds.height - view.height) + island.y * view.height + off.y
        + Math.sin(this.time * 0.14 + island.bob) * 5;

      // A rounded hump with a shallower rounded keel — a pebble adrift, not
      // a cut gem. Sampled densely enough that no facet shows.
      const sag = w * 0.2;
      const crown = w * 0.09;
      const points = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        points.push({
          x: x - w / 2 + t * w,
          y: y - Math.sin(t * Math.PI) * crown
        });
      }
      for (let i = 9; i >= 1; i--) {
        const t = i / 10;
        points.push({
          x: x - w / 2 + t * w,
          y: y + Math.sin(t * Math.PI) * sag * (1 + 0.15 * Math.sin(t * 9 + island.bob))
        });
      }
      renderer.drawPath({ points, closed: true, fillStyle: '#5a7390' });
      // The sun grazes their backs too.
      renderer.drawPath({
        points: points.slice(2, 9),
        strokeStyle: 'rgba(233, 168, 101, 0.3)', lineWidth: 1
      });
      for (const streamer of island.streamers) {
        const sx = x - w / 2 + streamer.t * w;
        const sy = y + Math.sin(streamer.t * Math.PI) * sag;
        renderer.drawLine({
          x1: sx, y1: sy, x2: sx + Math.sin(this.time * 0.3 + streamer.t * 9) * 2, y2: sy + streamer.length,
          strokeStyle: 'rgba(52, 70, 92, 0.9)', lineWidth: 1
        });
      }
      if (island.lit) {
        renderer.drawArc({
          x: x + w * 0.12, y: y + sag * 0.35, radius: 1.6,
          fillStyle: '#ffd9a0',
          globalAlpha: 0.65 + 0.35 * Math.sin(this.time * 1.1 + island.bob * 3)
        });
      }
    }
  }

  /** Valley mist, after the entities: it pools over the low platforms' feet. */
  drawForeground() {
    this.#drawMist(this.renderer, this.#view());
  }

  #drawStars(renderer, view, horizon) {
    const nightTop = horizon - view.height * 0.64;
    const off = this.#offset(view, 0.05);
    for (const star of this.stars) {
      const y = nightTop + star.y * view.height * 0.5;
      if (y > horizon - view.height * 0.25) continue;
      if (y < view.top - 4 || y > view.top + view.height + 4) continue;

      const twinkle = 0.6 + 0.4 * Math.sin(this.time * star.rate + star.phase);
      // Fade in with altitude: at the valley floor the sky is still too
      // bright for stars, near the top of the level they own it.
      const depth = Math.min(1, Math.max(0, (horizon - view.height * 0.3 - y) / (view.height * 0.5)));
      renderer.drawRect({
        x: star.x + off.x, y,
        width: star.size, height: star.size,
        fillStyle: '#dfe8ff',
        globalAlpha: star.alpha * twinkle * depth * 0.8
      });
    }
  }

  #drawSun(renderer, view, horizon) {
    const { x, y } = this.#sunAt(view);
    const unit = Math.min(view.width, view.height);

    // The glow stops at the horizon so it reads as *behind* the far ridge.
    renderer.drawRect({
      x: view.left, y: view.top,
      width: view.width, height: Math.max(0, horizon + 2 - view.top),
      fillStyle: {
        type: 'radial', x, y, r0: 0, r1: unit * 0.46,
        stops: [
          { offset: 0, color: 'rgba(255, 178, 96, 0.5)' },
          { offset: 0.35, color: 'rgba(255, 150, 90, 0.16)' },
          { offset: 1, color: 'rgba(255, 140, 90, 0)' }
        ]
      }
    });
    renderer.drawArc({
      x, y, radius: unit * 0.048,
      fillStyle: {
        type: 'radial', x, y: y - unit * 0.01, r0: 0, r1: unit * 0.048,
        stops: [{ offset: 0, color: '#fff1cc' }, { offset: 1, color: '#ffc782' }]
      }
    });
  }

  /** The menu's dark dusk lens, in pattern space at the clouds' parallax. */
  #drawCloud(renderer, cloud, view) {
    const off = this.#offset(view, 0.12);
    const bandWidth = cloud.width * view.width;
    const span = view.width + bandWidth + 600;
    const pattern = ((cloud.x * span + this.time * cloud.speed) % span);
    const left = view.left - 300 - bandWidth + ((pattern + (off.x % span) + span) % span);
    const y = (this.bounds.height - view.height) + cloud.y * view.height + off.y;

    const thickness = view.height * 0.016;
    const points = [{ x: left, y }];
    for (let i = 1; i < 24; i++) {
      const t = i / 24;
      const lump = Math.sin(t * Math.PI) * (0.55 + 0.45 * Math.abs(Math.sin(t * 9.1 + cloud.phase)));
      points.push({ x: left + t * bandWidth, y: y - thickness * lump });
    }
    points.push({ x: left + bandWidth, y });
    renderer.drawPath({ points, closed: true, fillStyle: '#51688a', globalAlpha: cloud.alpha * 0.8 });
  }

  #drawHaze(renderer, view, horizon) {
    const hazeTop = horizon - view.height * 0.14;
    renderer.drawRect({
      x: view.left, y: hazeTop,
      width: view.width, height: view.height * 0.4,
      fillStyle: {
        type: 'linear', x0: 0, y0: hazeTop, x1: 0, y1: hazeTop + view.height * 0.4,
        stops: [
          { offset: 0, color: 'rgba(246, 207, 142, 0)' },
          { offset: 0.38, color: 'rgba(246, 207, 142, 0.3)' },
          { offset: 1, color: 'rgba(246, 207, 142, 0)' }
        ]
      }
    });
  }

  #drawRidge(renderer, ridge, view) {
    const H = view.height;
    const off = this.#offset(view, ridge.parallax);
    const baseShift = (this.bounds.height - H) + off.y;

    const points = [{ x: view.left - STEP, y: view.top + view.height + STEP }];
    for (let x = view.left - STEP; x <= view.left + view.width + STEP; x += STEP) {
      const u = (x - off.x) / H;
      points.push({ x, y: ridgeProfile(ridge, u, H) + baseShift });
    }
    points.push({ x: view.left + view.width + STEP, y: view.top + view.height + STEP });
    renderer.drawPath({ points, closed: true, fillStyle: LEVEL_RIDGES[this.ridges.indexOf(ridge)] ?? ridge.color });
  }

  /** A line of birds, right to left, once every eighty seconds or so. */
  #drawFlock(renderer, view) {
    const off = this.#offset(view, 0.3);
    const span = view.width + 200;
    const lead = view.left + view.width + 100 - ((this.time * 17) % span);
    const baseY = (this.bounds.height - view.height) + view.height * 0.4 + off.y;
    for (const bird of this.flock) {
      const x = lead + bird.dx * view.width;
      const y = baseY + bird.dy * view.height;
      const wing = Math.sin(this.time * 7 + bird.flap) * 3;
      renderer.drawPath({
        points: [{ x: x - 5, y: y - wing }, { x, y }, { x: x + 5, y: y - wing }],
        strokeStyle: '#2c3d58',
        lineWidth: 1.5,
        globalAlpha: 0.85
      });
    }
  }

  /**
   * The valley floor disappears into cool mist. World-anchored: it marks a
   * place, not a screen edge, and standing on the lowest platform puts the
   * player's feet in it.
   */
  #drawMist(renderer, view) {
    const top = this.bounds.height - 170;
    if (view.top + view.height < top) return;

    renderer.drawRect({
      x: view.left, y: top,
      width: view.width, height: this.bounds.height - top + 40,
      fillStyle: {
        type: 'linear', x0: 0, y0: top, x1: 0, y1: this.bounds.height + 40,
        stops: [
          { offset: 0, color: 'rgba(96, 112, 150, 0)' },
          { offset: 0.55, color: 'rgba(150, 164, 198, 0.2)' },
          { offset: 1, color: 'rgba(132, 146, 184, 0.42)' }
        ]
      }
    });

    for (const lobe of this.mist) {
      const x = lobe.x + Math.sin(this.time * lobe.rate + lobe.phase) * 30 + this.time * lobe.drift;
      const span = this.bounds.width + lobe.width * 2;
      const wrapped = ((x + lobe.width) % span + span) % span - lobe.width;
      renderer.drawRect({
        x: wrapped - lobe.width / 2, y: lobe.y - lobe.height / 2,
        width: lobe.width, height: lobe.height,
        fillStyle: 'rgba(130, 146, 188, 0.9)',
        globalAlpha: lobe.alpha * (0.7 + 0.3 * Math.sin(this.time * lobe.rate * 1.7 + lobe.phase)),
        cornerRadius: lobe.height / 2
      });
    }
  }
}
