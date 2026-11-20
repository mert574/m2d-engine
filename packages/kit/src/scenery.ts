/**
 * Scenery any game could want: a 2D sky, seeded stars and clouds,
 * particle fields in both dimensions, looping ambient sound, and strips
 * laid along the scene's paths (kerbs, fence lines, road edges). Each is
 * an actor placed in the scene (colliding with nothing, drawn at a
 * `zIndex`), so the editor shows it, its inspector edits it, and an agent
 * adds one through `edit_scene` like any other object. A game's own
 * painting — a valley's ridges, a street's skyline — is the same idea
 * written for one game.
 */
export { Sky } from './scenery/sky.ts';
export { Scatter, SCATTER_KINDS } from './scenery/scatter.ts';
export { ParticleField, FIELD_KINDS, FIELD_DEFAULTS_2D } from './scenery/particleField.ts';
export { AmbientSound } from './scenery/ambientSound.ts';
export { PathStrip, stripGeometry } from './scenery/pathStrip.ts';
export { Scenery, BACK, FRONT } from './scenery/scenery.ts';
export type { SkyOptions } from './scenery/sky.ts';
export type { ScatterOptions, ScatterKind } from './scenery/scatter.ts';
export type { ParticleFieldOptions } from './scenery/particleField.ts';
export type { AmbientSoundOptions } from './scenery/ambientSound.ts';

import type { M2D } from 'm2d-engine';
import { Sky } from './scenery/sky.ts';
import { Scatter } from './scenery/scatter.ts';
import { ParticleField } from './scenery/particleField.ts';
import { AmbientSound } from './scenery/ambientSound.ts';
import { PathStrip } from './scenery/pathStrip.ts';
import type { PrefabTemplate, ScenePrefab } from './templates.ts';

/** Drawn, never touched: no collider stops anything at a backdrop. */
const SCENERY_PHYSICS = { bodyType: 'static', isSensor: true, layer: 'none' } as const;

/** A prefab of a scenery actor: drawn, colliding with nothing, with these properties. */
export const sceneryPrefab = (actor: string, properties: Record<string, unknown>): ScenePrefab =>
  ({ actor, physics: { ...SCENERY_PHYSICS }, properties });

/**
 * Ready-made `prefabs` entries for the component library and
 * `list_components`: a scene copies one, then places an object of it.
 * Where the object stands only matters to a field that does not follow
 * the camera, to smoke's source and to a sound with a radius.
 */
export const SCENERY_TEMPLATES: Record<string, PrefabTemplate> = {
  sky: {
    description: 'A dusk gradient behind the level',
    dimensions: 2,
    prefab: sceneryPrefab('Sky', { top: '#0b1026', middle: '#243a63', bottom: '#5c6f8a', horizon: 0.58 })
  },
  stars: {
    description: 'Twinkling stars across the top of the view',
    dimensions: 2,
    prefab: sceneryPrefab('Scatter', { kind: 'stars', count: 200, seed: 7, band: { top: 0, bottom: 0.55 } })
  },
  fireflies: {
    description: 'Fireflies wandering over the view; in a lit level the bright ones glow',
    dimensions: 2,
    prefab: sceneryPrefab('ParticleField', { kind: 'fireflies', count: 40 })
  },
  rain: {
    description: 'Slanted rain over everything',
    dimensions: 2,
    prefab: sceneryPrefab('ParticleField', { kind: 'rain', count: 160 })
  },
  motes: {
    description: 'Dust and pollen in the air around the camera, carried by the wind',
    dimensions: 3,
    prefab: sceneryPrefab('ParticleField', { kind: 'motes', count: 400 })
  },
  smoke: {
    description: 'Smoke rising from where the object stands, leaning downwind',
    dimensions: 3,
    prefab: sceneryPrefab('ParticleField', { kind: 'smoke', count: 120 })
  },
  ambience: {
    description: 'A looping sound under the level, faded in (set its sound; a radius makes it a place)',
    prefab: sceneryPrefab('AmbientSound', { fadeIn: 2 })
  }
};

/**
 * Register the scenery actors and their templates, marked as the kit's.
 * Call it before the game's own registrations, so a game's class under
 * one of these names wins.
 */
export function registerKitScenery(game: M2D): void {
  const kit = { origin: 'kit' } as const;
  for (const [name, klass] of Object.entries({ Sky, Scatter, ParticleField, AmbientSound, PathStrip })) game.registerActor(name, klass, kit);
  for (const [name, template] of Object.entries(SCENERY_TEMPLATES)) game.registerPrefabTemplate(name, template, kit);
}
