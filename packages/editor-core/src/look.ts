/**
 * The document side of a level's look: the lighting cycle's blend at any
 * phase (the engine's own `cycleLook`, so what the editor previews is what
 * the game draws), the colours a cycle strip shows, and the edits that add
 * and remove cycle states and particle fields.
 */

import { cycleLook } from 'm2d-engine/core/look.js';
import { PARTICLE_DEFAULTS, withParticleDefaults } from 'm2d-engine/core/particles.js';
import { isPlainObject, valueAt } from './descriptors.ts';
import type { Op } from './edits.ts';

export interface Look { lighting?: Record<string, unknown>; post?: Record<string, unknown> }

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function worldOf(data: unknown): Record<string, unknown> {
  return isPlainObject(data) && isPlainObject(data.world) ? data.world : {};
}

function statesOf(data: unknown): Record<string, unknown>[] {
  const cycle = worldOf(data).cycle;
  return isPlainObject(cycle) && Array.isArray(cycle.states) ? cycle.states as Record<string, unknown>[] : [];
}

/** Numbers to four places: a blend's float noise has no business in a scene file. */
function rounded<T>(value: T): T {
  if (typeof value === 'number') return (Math.round(value * 10000) / 10000) as T;
  if (Array.isArray(value)) return value.map(rounded) as T;
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rounded(item)])) as T;
  return value;
}

/** The look at `phase`: the cycle's blend over the resting look, or the resting look without a cycle. */
export function lookAt(data: unknown, phase: number): Look {
  const world = worldOf(data);
  const resting = { lighting: world.lighting as Record<string, unknown> | undefined, post: world.post as Record<string, unknown> | undefined };
  return statesOf(data).length ? rounded(cycleLook(world.cycle, phase, resting)) : resting;
}

/** The colours a strip of the cycle shows, by name, where the look sets them: one sample per step. */
export function cycleColours(data: unknown, samples: number): Array<{ phase: number; colours: Record<string, string> }> {
  const count = statesOf(data).length;
  if (count < 2) return [];
  return Array.from({ length: samples }, (_, i) => {
    const phase = (i / (samples - 1)) * count;
    const { lighting = {} } = lookAt(data, phase);
    const colours: Record<string, string> = {};
    for (const key of ['ambient', 'sky', 'ground']) if (typeof lighting[key] === 'string') colours[key] = lighting[key] as string;
    const sun = isPlainObject(lighting.sun) ? lighting.sun : {};
    if (typeof sun.color === 'string') colours.sun = sun.color;
    const fog = isPlainObject(lighting.fog) ? lighting.fog : {};
    if (typeof fog.color === 'string') colours.fog = fog.color;
    return { phase, colours };
  });
}

/** Start a cycle of two states, both the resting look, for the person to make different. */
export function startCycle(data: unknown): Op[] {
  if (statesOf(data).length) throw new Error('this level already has a cycle');
  const world = worldOf(data);
  const state = (name: string) => ({ name, ...(world.lighting !== undefined && { lighting: clone(world.lighting) }), ...(world.post !== undefined && { post: clone(world.post) }) });
  const cycle = { states: [state('day'), state('night')], phase: 0 };
  return [isPlainObject(valueAt(data, ['world'])) ? { op: 'set', path: ['world', 'cycle'], value: cycle } : { op: 'set', path: ['world'], value: { cycle } }];
}

/** Insert the look at `phase` as a new state right after the one it blends from. */
export function addStateAt(data: unknown, phase: number, name: string): Op[] {
  const count = statesOf(data).length;
  if (count < 2) throw new Error('this level has no cycle to add a state to');
  const { lighting, post } = lookAt(data, phase);
  const index = Math.floor(((phase % count) + count) % count) + 1;
  const state = { name, ...(lighting && { lighting: clone(lighting) }), ...(post && { post: clone(post) }) };
  return [{ op: 'insert', path: ['world', 'cycle', 'states'], index, value: state }];
}

/**
 * Remove state `index`, keeping two. The start phase stays on the state
 * it named: one removed before it moves it down, and a phase on the
 * removed state itself lands on the state that took its place.
 */
export function removeState(data: unknown, index: number): Op[] {
  const count = statesOf(data).length;
  if (count <= 2) throw new Error('a cycle keeps at least two states');
  const ops: Op[] = [{ op: 'remove', path: ['world', 'cycle', 'states'], index }];
  const cycle = worldOf(data).cycle as Record<string, unknown>;
  const phase = typeof cycle.phase === 'number' ? cycle.phase : 0;
  const moved = Math.floor(phase) > index ? phase - 1 : Math.min(phase, count - 2);
  if (moved !== phase) ops.push({ op: 'set', path: ['world', 'cycle', 'phase'], value: moved });
  return ops;
}

/** A particle field's every key: what it says, over its kind's defaults, as the scene draws it. */
export const particleField = (field: Record<string, unknown>): Record<string, unknown> => withParticleDefaults(field);

/** A new field of `kind`, written short: its kind, count and where it stands. */
export function addParticleField(data: unknown, kind: 'motes' | 'smoke', at: { x: number; y: number; z: number }): Op[] {
  const fields = worldOf(data).particles;
  const field = { kind, count: PARTICLE_DEFAULTS[kind].count, at };
  if (Array.isArray(fields)) return [{ op: 'insert', path: ['world', 'particles'], index: fields.length, value: field }];
  return [isPlainObject(valueAt(data, ['world'])) ? { op: 'set', path: ['world', 'particles'], value: [field] } : { op: 'set', path: ['world'], value: { particles: [field] } }];
}
