/**
 * The stock cast: gameplay actors that are compositions of the engine's
 * capabilities. The engine names what a thing does (`Collectable`,
 * `Chase`, `PathFollow`); the kit names what it is in a game. The demos
 * extend these — a Thug is a `Ghost` from a street sheet, an Ember a
 * glowing `Coin`, a Knight an `ObliquePlayer` — and a new game starts from
 * them or from the prefab templates below, which compose the same
 * capabilities over the engine's `Prop` with no class at all.
 */
export { Ghost, Bee } from './actors/ghost.ts';
export { Coin } from './actors/coin.ts';
export { MovingPlatform } from './actors/movingPlatform.ts';
export { Player } from './actors/player.ts';
export { TopDownPlayer } from './actors/topDownPlayer.ts';
export { ObliquePlayer } from './actors/obliquePlayer.ts';
export { Platform } from './actors/platform.ts';
export { Turret } from './actors/turret.ts';
export { Rocket } from './actors/rocket.ts';
export { Npc } from './actors/npc.ts';
export { GravityDial } from './actors/gravityDial.ts';
export type { MovingPlatformOptions } from './actors/movingPlatform.ts';
export type { PlayerOptions } from './actors/player.ts';
export type { ObliquePlayerOptions } from './actors/obliquePlayer.ts';
export type { TurretOptions } from './actors/turret.ts';
export type { RocketOptions } from './actors/rocket.ts';
export type { NpcOptions } from './actors/npc.ts';
export type { GravityDialOptions } from './actors/gravityDial.ts';
export { Clip } from './actors/clip.ts';

import { Ghost, Bee } from './actors/ghost.ts';
import { Coin } from './actors/coin.ts';
import { MovingPlatform } from './actors/movingPlatform.ts';
import { Player } from './actors/player.ts';
import { TopDownPlayer } from './actors/topDownPlayer.ts';
import { ObliquePlayer } from './actors/obliquePlayer.ts';
import { Platform } from './actors/platform.ts';
import { Turret } from './actors/turret.ts';
import { Rocket } from './actors/rocket.ts';
import { Npc } from './actors/npc.ts';
import { GravityDial } from './actors/gravityDial.ts';
import { Clip } from './actors/clip.ts';
import type { M2D } from 'm2d-engine/core/m2d.js';
import type { PrefabTemplate } from './templates.ts';

/**
 * Prefab templates: ready-made `prefabs` entries the editor's component
 * library and an agent (through `list_components` and `edit_scene`) copy
 * into a scene. Art-free on purpose — each composes engine capabilities
 * over `Prop`, so it plays the moment it lands and a sheet or a light is
 * the scene author's next edit.
 */
export const PREFAB_TEMPLATES: Record<string, PrefabTemplate> = {
  spawnPoint: {
    description: 'Where play starts: a level\'s player starts at the first free one, and each player joins at one online',
    prefab: { actor: 'SpawnPoint', physics: { bodyType: 'static', isSensor: true, layer: 'none' } }
  },
  mob: {
    description: 'A walking enemy: chases in range, hurts on contact, flashes when hit, dies and is gone',
    dimensions: 2,
    prefab: {
      actor: 'Prop',
      physics: { bodyType: 'dynamic', lockRotation: true, frictionAir: 0.05, layer: 'enemy' },
      properties: { color: '#b0455a' },
      constraints: {
        health: { type: 'Health', params: { maxHealth: 60, invulnerableDuration: 0.5, whenDead: 'remove' } },
        chase: { type: 'Chase', params: { speed: 60, idleSpeed: 36, detectionRange: 400 } },
        contactDamage: { type: 'ContactDamage', params: { damage: 25, knockbackStrength: 480 } },
        damageFlash: { type: 'DamageFlash' }
      }
    }
  },
  pickup: {
    description: 'A pickup: bobs, collects on touch, counts a counter and raises picked',
    dimensions: 2,
    prefab: {
      actor: 'Prop',
      physics: { bodyType: 'static', isSensor: true },
      properties: { color: '#ffd75e' },
      constraints: {
        hover: { type: 'Hover', params: { amplitude: 5, frequency: 2 } },
        collectable: { type: 'Collectable' }
      }
    }
  }
};

/**
 * Register the cast and the templates under the names scenes use, marked
 * as the kit's for the editor's catalog. Call it before the game's own
 * registrations, so a game's class under one of these names wins.
 */
export function registerKitActors(game: M2D): void {
  const kit = { origin: 'kit' } as const;
  for (const [name, klass] of Object.entries({ Ghost, Bee, Coin, MovingPlatform, Player, TopDownPlayer, ObliquePlayer, Platform, Turret, Rocket, Npc, GravityDial, Clip })) {
    game.registerActor(name, klass, kit);
  }
  for (const [name, template] of Object.entries(PREFAB_TEMPLATES)) {
    game.registerPrefabTemplate(name, template, kit);
  }
}
