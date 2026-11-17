/**
 * The stock cast: gameplay actors that are compositions of the engine's
 * capabilities. The engine names what a thing does (`Collectable`,
 * `Chase`, `PathFollow`); the kit names what it is in a game. The demos
 * extend these — a Thug is a `Ghost` from a street sheet, an Ember a
 * glowing `Coin`, a Knight an `ObliquePlayer` — and a new game starts from
 * them or from the prefab templates below, which compose the same
 * capabilities over the engine's `Prop` with no class at all.
 */
export { Ghost, Bee } from './actors/ghost.js';
export { Coin } from './actors/coin.js';
export { MovingPlatform } from './actors/movingPlatform.js';
export { Player } from './actors/player.js';
export { TopDownPlayer } from './actors/topDownPlayer.js';
export { ObliquePlayer } from './actors/obliquePlayer.js';
export { Platform } from './actors/platform.js';
export { Turret } from './actors/turret.js';
export { Rocket } from './actors/rocket.js';
export { Npc } from './actors/npc.js';

import { Ghost, Bee } from './actors/ghost.js';
import { Coin } from './actors/coin.js';
import { MovingPlatform } from './actors/movingPlatform.js';
import { Player } from './actors/player.js';
import { TopDownPlayer } from './actors/topDownPlayer.js';
import { ObliquePlayer } from './actors/obliquePlayer.js';
import { Platform } from './actors/platform.js';
import { Turret } from './actors/turret.js';
import { Rocket } from './actors/rocket.js';
import { Npc } from './actors/npc.js';

/**
 * Prefab templates: ready-made `prefabs` entries the editor's component
 * library and an agent (through `list_components` and `edit_scene`) copy
 * into a scene. Art-free on purpose — each composes engine capabilities
 * over `Prop`, so it plays the moment it lands and a sheet or a light is
 * the scene author's next edit.
 */
export const PREFAB_TEMPLATES = {
  mob: {
    description: 'A walking enemy: chases in range, hurts on contact, flashes when hit, dies and is gone',
    dimensions: 2,
    prefab: {
      actor: 'Prop',
      physics: { bodyType: 'dynamic', lockRotation: true, frictionAir: 0.05, category: 'enemy' },
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
export function registerKitActors(game) {
  const kit = { origin: 'kit' };
  for (const [name, klass] of Object.entries({ Ghost, Bee, Coin, MovingPlatform, Player, TopDownPlayer, ObliquePlayer, Platform, Turret, Rocket, Npc })) {
    game.registerActor(name, klass, kit);
  }
  for (const [name, template] of Object.entries(PREFAB_TEMPLATES)) {
    game.registerPrefabTemplate(name, template, kit);
  }
}
