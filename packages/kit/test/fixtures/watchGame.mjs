// The shared half of the online behaviour test: what the match worker and
// the watching client both import. Plain JavaScript over the kit's built
// dist, because the match loads in Node with no bundler — exactly as a
// shipped game's match module would.
import { Entity } from 'm2d-engine/core/entity.js';
import { InputSchema } from 'm2d-engine/net/input.js';
import { Health } from 'm2d-engine/constraints/health.js';
import { Chase } from 'm2d-engine/constraints/chase.js';
import { Attack } from 'm2d-engine/constraints/attack.js';
import { Behavior } from 'm2d-kit/ai';

export const INPUT = new InputSchema({ keys: ['ArrowLeft', 'ArrowRight'] });

/** The avatar: health and nothing else — it stands where it spawns. */
export class Hero extends Entity {
  name = 'Hero';
  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.addConstraint('health', new Health(this, { maxHealth: 100, invulnerableDuration: 0 }));
  }
}

/** The watcher: the ladder over chase and a telegraphed attack. */
export class Watcher extends Entity {
  name = 'Watcher';
  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.addConstraint('chase', new Chase(this, { speed: 120, detectionRange: 500 }));
    this.addConstraint('attack', new Attack(this, { range: 40, windup: 20, cooldown: 90, damage: 10, knockback: 0, targets: ['player'] }));
    this.addConstraint('behavior', new Behavior(this, { sightRange: 500, patience: 5, speed: 100 }));
  }
}

export const SCENE = {
  version: 7, type: 'level', name: 'watch',
  world: { width: 800, height: 400, gravity: { x: 0, y: 0 } },
  prefabs: {
    watcher: { actor: 'Watcher', physics: { bodyType: 'dynamic', layer: 'mob' } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'npc', prefab: 'watcher', x: 120, y: 200, width: 20, height: 20 }
  ] }]
};

export const GAME_OPTIONS = { worldWidth: 800, worldHeight: 400, seed: 9, layers: ['world', 'player', 'mob'] };

/** Register everything, on the match's game or a watching client's. */
export function registerWatch(game) {
  game.registerActor('Hero', Hero);
  game.registerActor('Watcher', Watcher);
  game.sceneManager.addScene('watch', { fetch: async () => structuredClone(SCENE) });
}
