import { withParticleDefaults } from './particles.js';
import { parseColor } from './renderers/geometry/color.js';

/**
 * What a 2D level draws behind and around its world from scene data: the
 * sky (`world.sky`), the scatter layers (`world.scatter`) and the particle
 * fields (`world.particles`). The things every 2D example drew in an
 * `onDrawBackground` hook — a wash under a rotating view, stars, clouds,
 * fireflies, falling leaves — as data the editor shows and edits.
 *
 * Presentation only, and stateless: every star and particle is a function
 * of its index, the seed and the time, so nothing is stepped, nothing is
 * stored, and two machines draw the same frame. Drawn in edit mode too
 * (frozen at time 0), so the editor shows the level as it looks.
 *
 * Sized against the camera's visible area each frame rather than the
 * world, so a layer covers the view at any zoom or rotation and never
 * shows an edge.
 */

/** A float in [0, 1) from two integers: the same pair, the same number. */
function hash(seed, index, salt = 0) {
  let h = (seed * 374761393 + index * 668265263 + salt * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

const mod = (value, size) => ((value % size) + size) % size;

/** Glow lights a firefly field may add per frame, at most: lights are not free. */
const MAX_GLOWS = 48;

export class SceneBackdrop {
  /** @param {import('./scene.js').Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.game = scene.game;
  }

  get #world() {
    return this.scene.config.world ?? {};
  }

  /** Whether the level has anything for this to draw. */
  get active() {
    const world = this.#world;
    return !!(world.sky || world.scatter?.length || world.particles?.length);
  }

  /** Under everything: the sky, the scatter layers, the back particles. */
  drawBack(time) {
    if (this.game.physics.dimensions === 3) return;
    const area = this.game.camera.getVisibleArea();
    const world = this.#world;
    if (world.sky) this.#sky(world.sky, area);
    for (const layer of world.scatter ?? []) this.#scatter(layer, area, time);
    for (const field of world.particles ?? []) if (!withParticleDefaults(field).front) this.#particles(field, area, time);
  }

  /** Over the entities: the front particle fields. */
  drawFront(time) {
    if (this.game.physics.dimensions === 3) return;
    const area = this.game.camera.getVisibleArea();
    for (const field of this.#world.particles ?? []) if (withParticleDefaults(field).front) this.#particles(field, area, time);
  }

  #sky(sky, area) {
    const stops = [{ offset: 0, color: sky.top }];
    if (sky.middle) stops.push({ offset: sky.horizon ?? 0.5, color: sky.middle });
    stops.push({ offset: 1, color: sky.bottom });
    this.game.renderer.drawRect({
      x: area.left, y: area.top, width: area.right - area.left, height: area.bottom - area.top,
      fillStyle: { type: 'linear', x0: area.left, y0: area.top, x1: area.left, y1: area.bottom, stops }
    });
  }

  #scatter(layer, area, time) {
    const renderer = this.game.renderer;
    const width = area.right - area.left;
    const height = area.bottom - area.top;
    const seed = layer.seed ?? 1;
    const parallax = layer.parallax ?? (layer.kind === 'clouds' ? 0.2 : 0.05);
    const band = layer.band ?? { top: 0, bottom: 1 };
    const top = band.top ?? 0;
    const span = (band.bottom ?? 1) - top;
    const size = layer.size ?? (layer.kind === 'clouds' ? 90 : layer.kind === 'motes' ? 2 : 1.8);
    const colour = layer.color ?? (layer.kind === 'clouds' ? '#ffffff' : '#fff8e8');
    const opacity = layer.opacity ?? (layer.kind === 'clouds' ? 0.18 : 0.85);
    const drift = (layer.speed ?? (layer.kind === 'stars' ? 0 : 6)) * time;
    for (let i = 0; i < layer.count; i++) {
      const u = hash(seed, i, 1);
      const v = hash(seed, i, 2);
      const k = hash(seed, i, 3);
      const x = area.left + mod(u * width + drift * (0.5 + k) - area.left * parallax, width);
      const y = area.top + (top + v * span) * height;
      if (layer.kind === 'stars') {
        const twinkle = (layer.twinkle ?? 0.4) * (0.5 + 0.5 * Math.sin(time * (1 + k * 3) + k * 40));
        renderer.drawArc({ x, y, radius: size * (0.3 + 0.7 * k * k), fillStyle: colour, globalAlpha: opacity * (1 - twinkle) });
      } else if (layer.kind === 'clouds') {
        this.#cloud(x, y, size * (0.5 + 0.5 * k), colour, opacity, seed, i);
      } else {
        const wobble = Math.sin(time * 0.7 + k * 30) * 6;
        renderer.drawArc({ x: x + wobble, y: y - mod(time * (4 + k * 6), height * span), radius: size * (0.4 + 0.6 * k), fillStyle: colour, globalAlpha: opacity * (0.4 + 0.6 * k) });
      }
    }
  }

  /**
   * A cloud: a few puffs along a flattened row, each a radial wash that
   * fades to nothing at its rim, so overlaps thicken the middle instead
   * of drawing edges.
   */
  #cloud(x, y, r, colour, opacity, seed, index) {
    const [red, green, blue] = parseColor(colour).map((c) => Math.round(c * 255));
    const solid = `rgba(${red}, ${green}, ${blue}, 1)`;
    const clear = `rgba(${red}, ${green}, ${blue}, 0)`;
    const puffs = 4 + Math.floor(hash(seed, index, 7) * 3);
    for (let p = 0; p < puffs; p++) {
      const t = puffs === 1 ? 0.5 : p / (puffs - 1);
      const px = x + (t - 0.5) * r * 2.6 + (hash(seed, index, 10 + p) - 0.5) * r * 0.4;
      const py = y - Math.sin(t * Math.PI) * r * 0.35 + (hash(seed, index, 20 + p) - 0.5) * r * 0.2;
      const pr = r * (0.55 + 0.45 * Math.sin(t * Math.PI)) * (0.8 + 0.4 * hash(seed, index, 30 + p));
      this.game.renderer.drawArc({
        x: px, y: py, radius: pr, globalAlpha: opacity,
        fillStyle: { type: 'radial', x: px, y: py, r0: 0, r1: pr, stops: [{ offset: 0, color: solid }, { offset: 0.55, color: solid }, { offset: 1, color: clear }] }
      });
    }
  }

  /** The box a 2D field fills: the view, or its own box in the world. */
  #box(field, area) {
    if (field.follow !== false) {
      const margin = 40;
      return { left: area.left - margin, top: area.top - margin, width: area.right - area.left + margin * 2, height: area.bottom - area.top + margin * 2 };
    }
    const at = field.at ?? { x: 0, y: 0 };
    const extent = field.extent ?? { x: 200, y: 200 };
    return { left: at.x - extent.x, top: at.y - extent.y, width: extent.x * 2, height: extent.y * 2 };
  }

  #particles(given, area, time) {
    if (!PARTICLE_DRAWERS[given.kind]) return;
    const field = withParticleDefaults(given);
    const box = this.#box(field, area);
    const glow = field.emissive > 0 && this.game.renderer.supports?.('lights') && this.#lit();
    PARTICLE_DRAWERS[field.kind](this.game.renderer, field, box, time, glow);
  }

  #lit() {
    return !!this.scene.currentLighting?.ambient;
  }
}

/** One drawer per 2D particle kind: `(renderer, field, box, time, glow)`. */
const PARTICLE_DRAWERS = {
  fireflies(renderer, field, box, time, glow) {
    const seed = field.seed ?? 1;
    const [r, g, b] = parseColor(field.color).map((c) => Math.round(c * 255));
    const halo = { inner: `rgba(${r}, ${g}, ${b}, 0.5)`, outer: `rgba(${r}, ${g}, ${b}, 0)` };
    // The core is the colour run halfway to white: the hot centre of the glow.
    const core = `rgb(${(r + 255) >> 1}, ${(g + 255) >> 1}, ${(b + 255) >> 1})`;
    const blend = renderer.supports?.('blendModes') ? 'additive' : undefined;
    const reach = field.radius * 3.2;
    let lights = 0;
    for (let i = 0; i < field.count; i++) {
      const a = hash(seed, i, 1), c = hash(seed, i, 3), d = hash(seed, i, 2);
      const wander = field.speed * 6;
      const x = box.left + a * box.width + Math.sin(time * (0.3 + c * 0.4) + c * 50) * wander;
      const y = box.top + d * box.height + Math.cos(time * (0.25 + a * 0.3) + d * 50) * wander * 0.6;
      const pulse = 0.5 + 0.5 * Math.sin(time * (1.2 + c * 1.6) + a * 60);
      renderer.drawArc({
        x, y, radius: reach, globalAlpha: field.opacity * pulse, blend,
        fillStyle: { type: 'radial', x, y, r0: 0, r1: reach, stops: [{ offset: 0, color: halo.inner }, { offset: 1, color: halo.outer }] }
      });
      renderer.drawArc({ x, y, radius: field.radius * 0.73, fillStyle: core, globalAlpha: field.opacity * (0.35 + 0.65 * pulse), blend });
      if (glow && lights < MAX_GLOWS && pulse > 0.5) {
        renderer.drawLight({ x, y, radius: field.radius * 14, color: field.color, intensity: field.emissive * pulse });
        lights++;
      }
    }
  },

  leaves(renderer, field, box, time) {
    const seed = field.seed ?? 1;
    for (let i = 0; i < field.count; i++) {
      const a = hash(seed, i, 1), b = hash(seed, i, 2), c = hash(seed, i, 3);
      const fall = field.speed * (0.6 + 0.4 * c);
      const y = box.top + mod(b * box.height + time * fall, box.height);
      const x = box.left + mod(a * box.width + Math.sin(time * 0.9 + c * 20) * 30 + time * fall * 0.3, box.width);
      const turn = time * (1 + c * 2) + a * 10;
      const r = field.radius * (0.7 + 0.6 * c);
      const along = { x: Math.cos(turn) * r, y: Math.sin(turn) * r * 0.45 };
      const across = { x: -Math.sin(turn) * r * 0.35, y: Math.cos(turn) * r * 0.35 };
      renderer.drawPath({
        points: [
          { x: x + along.x, y: y + along.y }, { x: x + across.x, y: y + across.y },
          { x: x - along.x, y: y - along.y }, { x: x - across.x, y: y - across.y }
        ],
        closed: true, fillStyle: field.color, globalAlpha: field.opacity
      });
    }
  },

  rain(renderer, field, box, time) {
    const seed = field.seed ?? 1;
    // Every drop falls along one slant: 0.08 across for each unit down.
    const slant = field.speed * 0.08;
    for (let i = 0; i < field.count; i++) {
      const a = hash(seed, i, 1), b = hash(seed, i, 2), c = hash(seed, i, 3);
      const speed = field.speed * (0.8 + 0.4 * c);
      const y = box.top + mod(b * box.height + time * speed, box.height);
      const x = box.left + mod(a * box.width + time * slant, box.width);
      const length = field.radius * 8 * (0.7 + 0.6 * c);
      renderer.drawLine({ x1: x, y1: y, x2: x + 0.08 * length, y2: y + length, strokeStyle: field.color, lineWidth: Math.max(1, field.radius * 0.5), globalAlpha: field.opacity * (0.5 + 0.5 * c) });
    }
  },

  sparks(renderer, field, box, time, glow) {
    const seed = field.seed ?? 1;
    let lights = 0;
    for (let i = 0; i < field.count; i++) {
      const a = hash(seed, i, 1), b = hash(seed, i, 2), c = hash(seed, i, 3);
      const rise = field.speed * (0.6 + 0.8 * c);
      const travelled = mod(b * box.height + time * rise, box.height);
      const life = 1 - travelled / box.height;
      const x = box.left + a * box.width + Math.sin(time * 3 + c * 30) * 8 * (1 - life);
      const y = box.top + box.height - travelled;
      const flicker = 0.7 + 0.3 * Math.sin(time * 18 + a * 90);
      renderer.drawArc({ x, y, radius: field.radius * (0.4 + 0.6 * life), fillStyle: field.color, globalAlpha: field.opacity * life * flicker });
      if (glow && lights < MAX_GLOWS && life > 0.6) {
        renderer.drawLight({ x, y, radius: field.radius * 10, color: field.color, intensity: field.emissive * life });
        lights++;
      }
    }
  }
};
