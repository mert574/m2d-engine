// The shared half of the test game: what a browser client and the match
// both import. A floor, a vendor with one charm, and side-view players.
import { Entity } from 'm2d-engine/core/entity.js';
import { Player } from 'm2d-engine/actors/player.js';
import { Platform } from 'm2d-engine/actors/platform.js';
import { InputSchema } from 'm2d-engine/net/input.js';
import { defineIntents, reject, entity } from 'm2d-engine/net/intents.js';

export const INPUT = new InputSchema({ keys: ['ArrowLeft', 'ArrowRight', 'Space'] });

export class Vendor extends Entity {
  name = 'Vendor';
  static replicated = ['stock'];
  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.stock = 1;
  }
}

export const intents = defineIntents({
  buy: {
    args: { vendor: entity({ actor: 'Vendor' }) },
    run(player, { vendor }) {
      if (vendor.stock <= 0) return reject('sold-out');
      vendor.stock -= 1;
      player.state.charms = (player.state.charms ?? 0) + 1;
      player.notify('bought', { left: vendor.stock });
    }
  }
});

export const SCENE = {
  version: 4, type: 'level', name: 'arena',
  world: { gravity: { x: 0, y: 900 } },
  prefabs: {
    floor: { actor: 'Platform', physics: { bodyType: 'static', friction: 0.6 } },
    vendor: { actor: 'Vendor', physics: { bodyType: 'static', isSensor: true } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'floor', prefab: 'floor', x: 640, y: 700, width: 1280, height: 40 },
    { id: 'vendor', prefab: 'vendor', x: 640, y: 600, width: 32, height: 32 }
  ] }]
};

export const GAME_OPTIONS = { worldWidth: 1280, worldHeight: 2000, seed: 3 };

/** Register everything, on the server's game or a client's. */
export function registerArena(game, hooks = {}) {
  for (const actor of [Player, Platform, Vendor]) game.registerActor(actor.name, actor);
  game.sceneManager.addScene('arena', { fetch: async () => SCENE, ...hooks });
  game.registerIntents(intents);
}
