/**
 * Draws a circuit: grass, shoulder, asphalt, lines, curbs, barriers,
 * lamps, trees, tribunes — everything that is scenery rather than an actor.
 *
 * The world is ~11000 px across and the view 1280, so everything culls
 * against the camera: road segments come from the track's sample buckets,
 * walls and decorations from distance checks. Barriers and trees near the
 * car also register as shadow casters, which is what puts real shadows
 * behind them when the headlights sweep past.
 *
 * Draw order is split across the scene's two hooks: `drawUnder` runs before
 * the entities (ground, road, skid marks), `drawOver` after them (barriers,
 * lamp posts, tree canopies — things a car slides under or behind).
 */
import { tileTexture } from '../shared/textures.js';
import { makeRng, range } from '../shared/rng.js';

/** How far outside the view still draws, px. Lights reach further than sprites. */
const MARGIN = 260;

/** Defaults a map's `theme` overrides: colours, ground and decoration mix. */
const DEFAULT_THEME = {
  ground: 'grass',
  asphalt: '#3d4254',
  worn: '#343a4b',
  shoulder: '#2e2823',
  edge: 'rgba(232, 236, 245, 0.85)',
  dash: 'rgba(255, 211, 77, 0.75)',
  lamp: '#ffd9a0',
  decor: { treeLarge: 90, treeSmall: 70, rock: 30, tent: 10, tribune: 5 },
  weather: null
};

export class TrackRenderer {
  /**
   * @param {import('m2d-engine/core/m2d.js').M2D} game
   * @param {import('./track.js').Track} track
   * @param {object} map - The map definition (seed, lampEvery)
   * @param {Record<string, HTMLImageElement>} images
   * @param {Array} marks - The shared skid-mark buffer
   */
  constructor(game, track, map, images, marks) {
    this.game = game;
    this.track = track;
    this.map = map;
    this.images = images;
    this.marks = marks;
    this.theme = { ...DEFAULT_THEME, ...(map.theme ?? {}) };
    /** The entity whose headlights the shadow casters serve. */
    this.focus = null;
    /** Rain drops in flight, world space, recycled. */
    this.rain = [];
    this.rainRng = makeRng(map.seed + 7);

    this.#precompute();
  }

  /** Curvature per sample, lamps, curb runs and scattered decorations. */
  #precompute() {
    const { track, map } = this;
    const samples = track.samples;
    const n = samples.length;

    // Curvature (1/R) per sample: what marks a corner for curbs and tyres.
    this.curvature = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = samples[(i - 2 + n) % n];
      const b = samples[i];
      const c = samples[(i + 2) % n];
      const a1 = Math.atan2(b.y - a.y, b.x - a.x);
      const a2 = Math.atan2(c.y - b.y, c.x - b.x);
      let d = a2 - a1;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this.curvature[i] = d / (Math.hypot(c.x - a.x, c.y - a.y) / 2 || 1);
    }

    // Lamps: alternating sides at a steady beat along the lap.
    this.lamps = [];
    for (let s = 0, i = 0; s < track.length - map.lampEvery / 2; s += map.lampEvery, i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const pose = track.pose(s / track.length, 0);
      const offset = (pose.width + 30) * side;
      this.lamps.push({
        x: pose.x + Math.cos(pose.angle + Math.PI / 2) * offset,
        y: pose.y + Math.sin(pose.angle + Math.PI / 2) * offset,
        // The head leans over the road: light points back across it.
        aim: pose.angle + Math.PI / 2 * -side
      });
    }

    // Decorations outside the track, seeded per map so every visit and
    // every machine sees the same scenery. game.rng is left alone: this is
    // load-time dressing, not simulation.
    const rng = makeRng(this.map.seed);
    this.decor = [];
    const place = (kind, count, min, max, scale) => {
      for (let i = 0; i < count; i++) {
        const t = rng();
        const side = rng() < 0.5 ? -1 : 1;
        const pose = this.track.pose(t, 0);
        const offset = (pose.width + range(rng, min, max)) * side;
        const x = pose.x + Math.cos(pose.angle + Math.PI / 2) * offset;
        const y = pose.y + Math.sin(pose.angle + Math.PI / 2) * offset;
        if (this.track.onRoad(x, y, 70)) continue;   // never on or beside the racing line
        this.decor.push({ kind, x, y, rotation: range(rng, 0, Math.PI * 2), scale: scale ?? 1 });
      }
    };
    const mix = this.theme.decor;
    place('treeLarge', mix.treeLarge, 120, 900, 1.15);
    place('treeSmall', mix.treeSmall, 90, 700, 1);
    place('rock', mix.rock, 70, 500, 1);
    place('tent', mix.tent, 150, 420, 1);

    // Tribunes face long, straight stretches; tyre stacks guard the apexes.
    const straightest = [];
    for (let i = 0; i < n; i += 24) {
      if (Math.abs(this.curvature[i]) < 0.0006) straightest.push(i);
    }
    for (let k = 0; k < Math.min(mix.tribune, straightest.length); k++) {
      const i = straightest[Math.floor(range(rng, 0, straightest.length))];
      const sample = samples[i];
      const side = rng() < 0.5 ? -1 : 1;
      this.decor.push({
        kind: 'tribune',
        x: sample.x + sample.nx * side * (sample.w + 95),
        y: sample.y + sample.ny * side * (sample.w + 95),
        rotation: Math.atan2(sample.ty, sample.tx) + (side > 0 ? Math.PI : 0),
        scale: 1
      });
    }
    this.tyres = [];
    for (let i = 0; i < n; i += 6) {
      if (Math.abs(this.curvature[i]) > 1 / 320) {
        const sample = samples[i];
        const outside = Math.sign(this.curvature[i]) * -1;
        this.tyres.push({
          x: sample.x + sample.nx * outside * (sample.w + 34),
          y: sample.y + sample.ny * outside * (sample.w + 34),
          red: (i % 12) === 0
        });
      }
    }
  }

  /** Sorted visible sample indices, grouped into contiguous runs. */
  #visibleRuns(area) {
    const camera = this.game.camera;
    const radius = Math.hypot(camera.width, camera.height) / 2 + MARGIN;
    const indices = [...this.track.samplesNear(camera.x, camera.y, radius)]
      .filter((i) => {
        const sample = this.track.samples[i];
        return sample.x > area.left - MARGIN && sample.x < area.right + MARGIN &&
               sample.y > area.top - MARGIN && sample.y < area.bottom + MARGIN;
      })
      .sort((a, b) => a - b);
    const runs = [];
    let run = null;
    for (const i of indices) {
      if (run && i === run[run.length - 1] + 1) run.push(i);
      else runs.push(run = [i]);
    }
    // The lap seam: the last sample continues into the first.
    if (runs.length > 1) {
      const first = runs[0];
      const last = runs[runs.length - 1];
      if (first[0] === 0 && last[last.length - 1] === this.track.samples.length - 1) {
        runs[runs.length - 1] = last.concat(first);
        runs.shift();
      }
    }
    return runs;
  }

  /** Ground, road and marks — everything beneath the cars. */
  drawUnder() {
    const renderer = this.game.renderer;
    const area = this.game.camera.getVisibleArea();

    // The ground at its natural tile size over the visible world.
    tileTexture(renderer, this.images[this.theme.ground] ?? this.images.grass, {
      x: area.left - 64, y: area.top - 64,
      width: area.right - area.left + 128, height: area.bottom - area.top + 128
    }, 128);

    const runs = this.#visibleRuns(area);
    const samples = this.track.samples;
    const quad = (a, b, widthA, widthB, fillStyle) => renderer.drawPath({
      points: [
        { x: a.x + a.nx * widthA, y: a.y + a.ny * widthA },
        { x: b.x + b.nx * widthB, y: b.y + b.ny * widthB },
        { x: b.x - b.nx * widthB, y: b.y - b.ny * widthB },
        { x: a.x - a.nx * widthA, y: a.y - a.ny * widthA }
      ],
      closed: true, fillStyle
    });

    for (const pass of ['shoulder', 'asphalt', 'wear', 'lines']) {
      for (const run of runs) {
        for (let k = 0; k < run.length - 1; k++) {
          const i = run[k];
          const a = samples[i];
          const b = samples[run[k + 1] % samples.length];
          if (pass === 'shoulder') quad(a, b, a.w + 24, b.w + 24, this.theme.shoulder);
          else if (pass === 'asphalt') quad(a, b, a.w + 2, b.w + 2, this.theme.asphalt);
          else if (pass === 'wear') quad(a, b, a.w * 0.52, b.w * 0.52, this.theme.worn);
          else {
            for (const side of [-1, 1]) {
              renderer.drawLine({
                x1: a.x + a.nx * side * (a.w - 6), y1: a.y + a.ny * side * (a.w - 6),
                x2: b.x + b.nx * side * (b.w - 6), y2: b.y + b.ny * side * (b.w - 6),
                strokeStyle: this.theme.edge, lineWidth: 3
              });
            }
            if ((i >> 2) % 2 === 0) {
              renderer.drawLine({
                x1: a.x, y1: a.y, x2: b.x, y2: b.y,
                strokeStyle: this.theme.dash, lineWidth: 3
              });
            }
            // Curbs on the corners: the red-and-white rumble strips.
            if (Math.abs(this.curvature[i]) > 1 / 420) {
              const inside = Math.sign(this.curvature[i]);
              const image = (i % 2 === 0) ? this.images.curbRed : this.images.curbWhite;
              const mx = (a.x + b.x) / 2 + a.nx * inside * (a.w - 1);
              const my = (a.y + b.y) / 2 + a.ny * inside * (a.w - 1);
              renderer.drawSprite({
                image, x: mx, y: my,
                tileWidth: image.width, tileHeight: image.height,
                width: 24, height: 10,
                rotation: Math.atan2(b.y - a.y, b.x - a.x)
              });
            }
          }
        }
      }
    }

    this.#drawStartLine();
    this.#drawMarks(area);
  }

  #drawStartLine() {
    const renderer = this.game.renderer;
    const pose = this.track.pose(0, 0);
    const cos = Math.cos(pose.angle + Math.PI / 2);
    const sin = Math.sin(pose.angle + Math.PI / 2);
    const cells = Math.floor((pose.width * 2 - 12) / 16);
    for (let row = 0; row < 2; row++) {
      for (let c = 0; c < cells; c++) {
        const across = -pose.width + 10 + (c + 0.5) * 16;
        const along = (row - 0.5) * 16;
        renderer.drawRect({
          x: pose.x + cos * across + Math.cos(pose.angle) * along - 8,
          y: pose.y + sin * across + Math.sin(pose.angle) * along - 8,
          width: 16, height: 16,
          fillStyle: (c + row) % 2 === 0 ? '#e8ecf2' : '#20242f'
        });
      }
    }
  }

  #drawMarks(area) {
    const renderer = this.game.renderer;
    const steps = this.game.time.steps;
    for (const mark of this.marks) {
      if (mark.x < area.left - 20 || mark.x > area.right + 20 ||
          mark.y < area.top - 20 || mark.y > area.bottom + 20) continue;
      const age = (steps - mark.step) / 60;
      const alpha = Math.max(0, 0.45 - age / 90);
      if (alpha <= 0) continue;
      renderer.pushTransform({ x: mark.x, y: mark.y, rotation: mark.angle });
      renderer.drawRect({ x: -4, y: -2, width: 8, height: 4, fillStyle: `rgba(16, 16, 22, ${alpha})` });
      renderer.popTransform();
    }
  }

  /** Barriers, lamps, trees, tribunes — above the cars. */
  drawOver() {
    const renderer = this.game.renderer;
    const camera = this.game.camera;
    const area = camera.getVisibleArea();
    const viewRadius = Math.hypot(camera.width, camera.height) / 2 + MARGIN;

    // The car's surroundings block its headlights. Walls further than the
    // beam cannot shadow anything, so only the near set registers.
    const focus = this.focus?.position;
    if (focus) {
      for (const wall of this.track.wallsNear(focus.x, focus.y, 460)) {
        renderer.drawShadowCaster({
          x: wall.x, y: wall.y, width: wall.length, height: 10, rotation: wall.angle, z: 0.3
        });
      }
    }

    // Barriers, alternating stripe colours so distance reads at speed.
    const walls = this.track.wallsNear(camera.x, camera.y, viewRadius);
    for (const wall of walls) {
      const image = ((wall.x + wall.y) & 64) ? this.images.barrierRed : this.images.barrierWhite;
      // No drop shadow here on purpose: every shadowed sprite is its own
      // offscreen blur pass, and there are dozens of wall pieces in view.
      renderer.drawSprite({
        image, x: wall.x, y: wall.y,
        tileWidth: image.width, tileHeight: image.height,
        width: wall.length, height: 13,
        rotation: wall.angle
      });
    }

    for (const stack of this.tyres) {
      if (stack.x < area.left - 40 || stack.x > area.right + 40 ||
          stack.y < area.top - 40 || stack.y > area.bottom + 40) continue;
      const image = stack.red ? this.images.tiresRed : this.images.tiresWhite;
      renderer.drawSprite({
        image, x: stack.x, y: stack.y,
        tileWidth: image.width, tileHeight: image.height,
        width: 22, height: 22
      });
    }

    this.#drawLamps(area, focus);
    this.#drawDecor(area, focus);
    if (this.theme.weather) this.#drawWeather(area);
  }

  /**
   * Rain and mist, in world space so they stream past at speed. The rain
   * is a pool of streaks recycled across the view; the mist is a few large,
   * soft discs drifting slowly, which the headlights light from inside.
   * Presentation only: nothing here touches the simulation.
   */
  #drawWeather(area) {
    const renderer = this.game.renderer;
    const weather = this.theme.weather;
    const dt = this.game.time.unscaledDelta;
    const width = area.right - area.left;
    const height = area.bottom - area.top;
    const additive = renderer.supports('blendModes') ? 'additive' : undefined;

    if (weather.rain) {
      const want = Math.round(140 * weather.rain);
      while (this.rain.length < want) {
        this.rain.push({
          x: area.left + this.rainRng() * width,
          y: area.top + this.rainRng() * height,
          length: 14 + this.rainRng() * 18,
          speed: 900 + this.rainRng() * 500
        });
      }
      const windX = 180;
      for (const drop of this.rain) {
        drop.x += windX * dt;
        drop.y += drop.speed * dt;
        // Fell out of view: respawn along the upwind edges.
        if (drop.y > area.bottom + 20 || drop.x > area.right + 20 ||
            drop.x < area.left - 40 || drop.y < area.top - 40) {
          if (this.rainRng() < 0.75) {
            drop.x = area.left + this.rainRng() * width;
            drop.y = area.top - 20 - this.rainRng() * 60;
          } else {
            drop.x = area.left - 20 - this.rainRng() * 40;
            drop.y = area.top + this.rainRng() * height;
          }
        }
        const dx = windX / drop.speed * drop.length;
        renderer.drawLine({
          x1: drop.x, y1: drop.y, x2: drop.x + dx, y2: drop.y + drop.length,
          strokeStyle: 'rgba(200, 220, 255, 0.35)', lineWidth: 1.2
        });
      }
    }

    if (weather.mist) {
      const t = this.game.time.unscaledElapsed;
      for (let i = 0; i < 6; i++) {
        // Anchored to the world grid so the mist stays put as the camera
        // passes, and drifts on its own slow wind.
        const cellX = Math.floor(area.left / 700) * 700;
        const cellY = Math.floor(area.top / 500) * 500;
        const x = cellX + ((i * 311) % 1400) + Math.sin(t * 0.13 + i) * 90;
        const y = cellY + ((i * 197) % 1000) + Math.cos(t * 0.11 + i * 2) * 60;
        const radius = 260 + (i % 3) * 90;
        renderer.drawArc({
          x, y, radius,
          fillStyle: {
            type: 'radial', x, y, r0: 0, r1: radius,
            stops: [
              { offset: 0, color: `rgba(190, 205, 235, ${0.16 * weather.mist})` },
              { offset: 1, color: 'rgba(190, 205, 235, 0)' }
            ]
          },
          blend: additive
        });
      }
    }
  }

  #drawLamps(area, focus) {
    const renderer = this.game.renderer;
    for (const lamp of this.lamps) {
      if (lamp.x < area.left - 500 || lamp.x > area.right + 500 ||
          lamp.y < area.top - 500 || lamp.y > area.bottom + 500) continue;
      // The pool on the road. Near the player it casts real shadows; far
      // pools skip the stencil work nobody would notice.
      const near = focus && Math.hypot(lamp.x - focus.x, lamp.y - focus.y) < 760;
      // Hung at z 1: a barrier at 0.3 does not shadow it, a tree at 1.5 does.
      renderer.drawLight({
        x: lamp.x, y: lamp.y, radius: 340, color: this.map.theme?.lamp ?? '#ffd9a0', intensity: 1.3,
        angle: lamp.aim, cone: 1.35, shadows: near, z: 1
      });
      renderer.drawSprite({
        image: this.images.lamp, x: lamp.x, y: lamp.y,
        tileWidth: this.images.lamp.width, tileHeight: this.images.lamp.height,
        width: 26, height: 26 * (this.images.lamp.height / this.images.lamp.width),
        rotation: lamp.aim + Math.PI / 2
      });
    }
  }

  #drawDecor(area, focus) {
    const renderer = this.game.renderer;
    const sprites = {
      treeLarge: { image: this.images.treeLarge, size: 90 },
      treeSmall: { image: this.images.treeSmall, size: 58 },
      rock: { image: this.images.rock, size: 34 },
      tent: { image: this.images.tent, size: 70 },
      tribune: { image: this.images.tribune, size: 150 }
    };
    for (const item of this.decor) {
      const spec = sprites[item.kind];
      const size = spec.size * item.scale;
      if (item.x < area.left - size || item.x > area.right + size ||
          item.y < area.top - size || item.y > area.bottom + size) continue;
      renderer.drawSprite({
        image: spec.image, x: item.x, y: item.y,
        tileWidth: spec.image.width, tileHeight: spec.image.height,
        width: size, height: size * (spec.image.height / spec.image.width),
        rotation: item.kind === 'tribune' ? item.rotation : item.rotation,
        shadow: { color: 'rgba(8, 8, 16, 0.4)', blur: 7, offsetX: 5, offsetY: 6 }
      });
      // Trunks block headlights; canopies and stands block them wholesale.
      if (focus && Math.hypot(item.x - focus.x, item.y - focus.y) < 480) {
        if (item.kind === 'treeLarge' || item.kind === 'treeSmall') {
          renderer.drawShadowCaster({ x: item.x, y: item.y, radius: 7, z: 1.5 });
        } else if (item.kind === 'tribune') {
          renderer.drawShadowCaster({
            x: item.x, y: item.y, width: size, height: size * 0.4, rotation: item.rotation, z: 1.2
          });
        }
      }
    }
  }
}
