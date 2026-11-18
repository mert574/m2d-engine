import { s } from 'm2d-engine/core/schema.js';
import { parseColor } from 'm2d-engine/core/renderers/geometry/color.js';
import type { M2D } from 'm2d-engine/core/m2d.js';
import { Scenery, BACK, hash, mod } from './scenery.ts';
import type { ActorBody, ActorSprite, VisibleArea } from '../engineTypes.ts';

/** The three layers a scatter can be. */
export type ScatterKind = 'stars' | 'clouds' | 'motes';

export interface ScatterOptions {
  /** stars twinkle, clouds drift, motes rise. */
  kind?: ScatterKind;
  count?: number;
  /** Which scatter; the same seed is the same layer. */
  seed?: number;
  color?: string;
  /** The largest one; the rest are smaller, px. */
  size?: number;
  opacity?: number;
  /** 0 is fixed to the view, 1 moves with the world. */
  parallax?: number;
  /** Clouds and motes: drift across the view, px/s. */
  speed?: number;
  /** Stars: how much each flickers, 0..1. */
  twinkle?: number;
  /** The part of the view it fills, top to bottom, as fractions. */
  band?: { top?: number; bottom?: number };
}

export const SCATTER_KINDS: ScatterKind[] = ['stars', 'clouds', 'motes'];

/**
 * A seeded layer of small things behind a 2D level: stars that twinkle,
 * clouds that drift, motes in the air. Laid out from the seed across the
 * view and moved at `parallax`, so it needs no world size and never shows
 * an edge. Stateless: every star is a function of its index, the seed and
 * the time, so two machines draw the same frame.
 */
export class Scatter extends Scenery {
  static override description = 'Seeded stars, clouds or motes across the view, behind the level';
  static override dimensions = 2 as const;
  static override properties = {
    kind: s.enumOf(SCATTER_KINDS, { initial: 'stars', description: 'stars twinkle, clouds drift, motes rise' }),
    count: s.integer({ min: 0, initial: 120 }),
    seed: s.integer({ min: 0, initial: 1, description: 'Which scatter; the same seed is the same layer' }),
    color: s.string({ editor: 'color', label: 'Colour' }),
    size: s.number({ positive: true, unit: 'px', description: 'The largest one; the rest are smaller' }),
    opacity: s.number({ min: 0, max: 1 }),
    parallax: s.number({ min: 0, description: '0 is fixed to the view, 1 moves with the world' }),
    speed: s.number({ unit: 'px/s', description: 'Clouds and motes: drift across the view' }),
    twinkle: s.number({ min: 0, max: 1, description: 'Stars: how much each flickers' }),
    band: s.object({ top: s.number({ min: 0, max: 1 }), bottom: s.number({ min: 0, max: 1 }) }, { description: 'The part of the view it fills, top to bottom, as fractions' })
  };

  override name = 'Scatter';

  /** What to lay out, as the object declared it over the defaults. */
  layer: ScatterOptions & { kind: ScatterKind; count: number };

  constructor(body: ActorBody, sprite: ActorSprite, game: M2D, options: ScatterOptions = {}) {
    super(body, sprite, game, BACK);
    this.layer = { kind: 'stars', count: 120, ...options };
  }

  override paint(area: VisibleArea, time: number): void {
    const layer = this.layer;
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
  #cloud(x: number, y: number, r: number, colour: string, opacity: number, seed: number, index: number): void {
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
}
