import { s } from 'm2d-engine/core/schema.js';
import { parseColor } from 'm2d-engine/core/renderers/geometry/color.js';
import { PARTICLE_KINDS } from 'm2d-engine/core/particles.js';
import type { M2D } from 'm2d-engine/core/m2d.js';
import type { BaseRenderer } from 'm2d-engine/core/renderers/baseRenderer.js';
import { Scenery, BACK, FRONT, hash, mod } from './scenery.ts';
import type { ActorBody, ActorSprite, VisibleArea } from '../engineTypes.ts';

/** The 2D kinds this module draws itself; the 3D ones are the renderer's. */
export type FieldKind2D = 'fireflies' | 'leaves' | 'rain' | 'sparks';

export interface ParticleFieldOptions {
  /**
   * 3D: motes drift on the wind, smoke rises. 2D: fireflies wander and
   * pulse, leaves and rain fall, sparks rise.
   */
  kind?: string;
  count?: number;
  /**
   * Half sizes, in metres (3D) or px (2D). Smoke: the column's spread,
   * and half its height.
   */
  extent?: { x: number; y: number; z?: number };
  /** Particle size: metres in 3D, px in 2D. */
  radius?: number;
  color?: string;
  opacity?: number;
  /** Self-illumination, as a multiple of the colour. */
  emissive?: number;
  /** m/s in 3D, px/s in 2D. */
  speed?: number;
  /** The box stays centred on the camera; otherwise on the entity. */
  follow?: boolean;
  /** 2D: which scatter of particles; the same seed is the same field. */
  seed?: number;
}

/** A 2D field with every key settled: what a drawer reads. */
interface Field2D {
  kind: FieldKind2D;
  count: number;
  extent: { x: number; y: number };
  radius: number;
  color: string;
  opacity: number;
  emissive: number;
  speed: number;
  follow: boolean;
  seed: number;
}

/** The world box a 2D field fills. */
interface FieldBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Whether `kind` is one this module draws itself. The loader refuses any other in a 2D level. */
function is2D(kind: string | undefined): kind is FieldKind2D {
  return kind !== undefined && Object.hasOwn(FIELD_DEFAULTS_2D, kind);
}

/** One drawer per 2D kind. */
type Drawer = (renderer: BaseRenderer, field: Field2D, box: FieldBox, time: number, glow: boolean) => void;

/** Particle kinds by the dimension that draws them: the renderer's in 3D, draw calls here in 2D. */
export const FIELD_KINDS: Record<2 | 3, readonly string[]> = {
  2: ['fireflies', 'leaves', 'rain', 'sparks'],
  3: PARTICLE_KINDS
};

/** What a 2D field is when it leaves a key out, per kind. Sizes and speeds in px. */
export const FIELD_DEFAULTS_2D: Readonly<Record<FieldKind2D, Field2D>> = Object.freeze({
  fireflies: Object.freeze({ kind: 'fireflies', count: 40, extent: { x: 400, y: 300 }, radius: 2.2, color: '#ffe48a', opacity: 0.9, emissive: 0.8, speed: 4, follow: true, seed: 1 }),
  leaves: Object.freeze({ kind: 'leaves', count: 30, extent: { x: 400, y: 300 }, radius: 6, color: '#d9883a', opacity: 0.85, emissive: 0, speed: 40, follow: true, seed: 1 }),
  rain: Object.freeze({ kind: 'rain', count: 160, extent: { x: 400, y: 300 }, radius: 2, color: '#b8c8e0', opacity: 0.45, emissive: 0, speed: 700, follow: true, seed: 1 }),
  sparks: Object.freeze({ kind: 'sparks', count: 50, extent: { x: 400, y: 300 }, radius: 2, color: '#ffb35a', opacity: 0.9, emissive: 0.6, speed: 60, follow: true, seed: 1 })
});

/** Where a 2D kind draws unless its object gives a `zIndex`: fireflies among the level, the weather over it. */
const BEHIND = new Set(['fireflies']);

/** Glow lights a firefly field may add per frame, at most: lights are not free. */
const MAX_GLOWS = 48;

const list = (items: readonly string[]): string => items.map((item) => `'${item}'`).join(', ');

/**
 * A field of particles. 3D: motes in the air around the camera, or smoke
 * rising from where the entity stands — declared as `entity.particles`,
 * which the scene collects into the frame as it collects a light, so the
 * renderer draws it (sixteen fields a frame at most). 2D: fireflies,
 * falling leaves, rain or sparks over the view, or over a box of the
 * world around the entity, drawn here.
 *
 * Stateless either way: each particle is a function of its index, the
 * seed and the time, so a field costs no simulation and looks the same on
 * every machine and in the editor, where the clock stands still.
 */
export class ParticleField extends Scenery {
  static override description = 'Motes and smoke in 3D; fireflies, leaves, rain and sparks in 2D';
  static override properties = {
    kind: s.enumOf([...FIELD_KINDS[2], ...FIELD_KINDS[3]], { description: '3D: motes drift on the wind, smoke rises. 2D: fireflies wander and pulse, leaves and rain fall, sparks rise' }),
    count: s.number({ min: 0 }),
    extent: s.object({ x: s.number({ positive: true }), y: s.number({ positive: true }), z: s.number({ positive: true }) }, { description: 'Half sizes, in metres (3D) or px (2D). Smoke: the column\'s spread, and half its height' }),
    radius: s.number({ positive: true, description: 'Particle size: metres in 3D, px in 2D' }),
    color: s.string({ editor: 'color', label: 'Colour' }),
    opacity: s.number({ min: 0, max: 1 }),
    emissive: s.number({ min: 0, description: 'Self-illumination, as a multiple of the colour: fireflies, embers. 2D: a lit level draws each as a small light' }),
    speed: s.number({ min: 0, description: 'm/s in 3D, px/s in 2D. Smoke: how fast it rises. Motes, fireflies: how far each wanders. Leaves, rain, sparks: how fast they travel' }),
    follow: s.boolean({ description: 'The box stays centred on the camera (the default for motes and every 2D kind); otherwise it is centred on the entity' }),
    seed: s.integer({ min: 0, description: '2D: which scatter of particles; the same seed is the same field' })
  };

  /** A kind is drawn in one dimension only: smoke in a 2D level is refused at load, not drawn as nothing. */
  static override refineProperties(
    properties: ParticleFieldOptions,
    { dimensions, fail }: { dimensions: 2 | 3; fail: (key: string, message: string) => never }
  ): void {
    const known = FIELD_KINDS[dimensions];
    if (properties.kind !== undefined && known.includes(properties.kind)) return;
    if (properties.kind === undefined) fail('kind', `a particle field names its kind (here: ${list(known)})`);
    else fail('kind', `'${properties.kind}' particles are drawn in ${dimensions === 2 ? 3 : 2}D, and this level is ${dimensions}D (known here: ${list(known)})`);
  }

  override name = 'ParticleField';

  /** 2D: the field this draws, with every key settled. Null in a 3D level. */
  field: Field2D | null = null;

  /**
   * 3D: what the scene collects into the frame for the renderer to draw,
   * as it collects a light. Undefined in a 2D level, which draws its own.
   */
  particles: Record<string, unknown> | undefined;

  constructor(body: ActorBody, sprite: ActorSprite, game: M2D, options: ParticleFieldOptions = {}) {
    const kind = options.kind ?? '';
    super(body, sprite, game, BEHIND.has(kind) ? BACK : FRONT);
    if (game.physics.dimensions === 3) {
      // Only what the scene set: the renderer's record fills the rest from its kind (particles.js).
      this.particles = Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'seed'));
    } else if (is2D(kind)) {
      this.field = { ...FIELD_DEFAULTS_2D[kind], ...options, kind };
    }
  }

  override paint(area: VisibleArea, time: number): void {
    const field = this.field;
    const draw = field && DRAWERS[field.kind];
    if (!field || !draw) return;
    const glow = field.emissive > 0 && !!this.game.renderer.supports?.('lights') && !!this.scene?.currentLighting?.ambient;
    draw(this.game.renderer, field, this.#box(area, field), time, glow);
  }

  /** The box a 2D field fills: the view, or its own box around the entity. */
  #box(area: VisibleArea, field: Field2D): FieldBox {
    if (field.follow !== false) {
      const margin = 40;
      return { left: area.left - margin, top: area.top - margin, width: area.right - area.left + margin * 2, height: area.bottom - area.top + margin * 2 };
    }
    const at = this.renderPosition;
    return { left: at.x - field.extent.x, top: at.y - field.extent.y, width: field.extent.x * 2, height: field.extent.y * 2 };
  }
}

/** One drawer per 2D kind. */
const DRAWERS: Record<FieldKind2D, Drawer> = {
  fireflies(renderer, field, box, time, glow) {
    const seed = field.seed ?? 1;
    const [r = 0, g = 0, b = 0] = parseColor(field.color).map((c) => Math.round(c * 255));
    const halo = { inner: `rgba(${r}, ${g}, ${b}, 0.5)`, outer: `rgba(${r}, ${g}, ${b}, 0)` };
    // The core is the colour run halfway to white: the hot centre of the glow.
    const core = `rgb(${(r + 255) >> 1}, ${(g + 255) >> 1}, ${(b + 255) >> 1})`;
    const reach = field.radius * 3.2;
    let lights = 0;
    for (let i = 0; i < field.count; i++) {
      const a = hash(seed, i, 1), c = hash(seed, i, 3), d = hash(seed, i, 2);
      const wander = field.speed * 6;
      const x = box.left + a * box.width + Math.sin(time * (0.3 + c * 0.4) + c * 50) * wander;
      const y = box.top + d * box.height + Math.cos(time * (0.25 + a * 0.3) + d * 50) * wander * 0.6;
      const pulse = 0.5 + 0.5 * Math.sin(time * (1.2 + c * 1.6) + a * 60);
      renderer.drawArc({
        x, y, radius: reach, globalAlpha: field.opacity * pulse, blend: 'additive',
        fillStyle: { type: 'radial', x, y, r0: 0, r1: reach, stops: [{ offset: 0, color: halo.inner }, { offset: 1, color: halo.outer }] }
      });
      renderer.drawArc({ x, y, radius: field.radius * 0.73, fillStyle: core, globalAlpha: field.opacity * (0.35 + 0.65 * pulse), blend: 'additive' });
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
