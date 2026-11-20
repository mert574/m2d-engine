/**
 * The bake stamp: a hash of everything a navmesh was baked from, written
 * into the scene's asset record by the bake and recomputed at load, so a
 * mesh that no longer matches its level is reported instead of trusted.
 * The inputs are the extracted geometry (the static colliders and nav
 * volumes, which already fold in the scene, its prefabs and the model
 * bounds), the agent profile, the nav areas, and the bake format — bump
 * `BAKE_FORMAT` when the pipeline or the recast build changes, and every
 * stamp goes stale at once, which is the point.
 */

/** The bake pipeline's own version: the recast build and our use of it. */
export const BAKE_FORMAT = 'm2d-nav-1/recast-navigation-0.44';

/** FNV-1a over a string, 64-bit via two 32-bit lanes, as a hex string. */
export function fnv1a64(text: string): string {
  let a = 0x811c9dc5, b = 0xcbf29ce4;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a ^= c & 0xff;
    a = Math.imul(a, 0x01000193) >>> 0;
    b ^= (c >> 8) ^ a;
    b = Math.imul(b, 0x01000193) >>> 0;
  }
  return b.toString(16).padStart(8, '0') + a.toString(16).padStart(8, '0');
}

import type { NavAreas } from './navAreas.ts';

/** The agent profile a bake is for. */
export interface NavAgent {
  radius: number;
  height?: number;
  step?: number;
  slope?: number;
  dynamic?: boolean;
}

/** What `navGeometryOf` extracts, as the stamp hashes it. */
export interface NavGeometry {
  positions: number[];
  indices: number[];
  volumes: unknown[];
}

/** The stamp for one agent's bake of one scene's geometry. */
export function bakeStamp(geometry: NavGeometry, agent: NavAgent, areas: NavAreas): string {
  return fnv1a64(JSON.stringify({
    format: BAKE_FORMAT,
    agent: [agent.radius, agent.height ?? null, agent.step ?? null, agent.slope ?? null, agent.dynamic ?? false],
    areas: areas.spec,
    positions: geometry.positions,
    indices: geometry.indices,
    volumes: geometry.volumes
  }));
}
