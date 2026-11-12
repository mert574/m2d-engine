// The shared half of a three-dimensional test game: a slab of ground, a
// crate that tumbles, and heroes that walk on both ground axes.
import { Entity } from 'm2d-engine/core/entity.js';
import { InputSchema } from 'm2d-engine/net/input.js';

export const INPUT = new InputSchema({ keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] });

export class Ground extends Entity { name = 'Ground'; }
export class Crate extends Entity { name = 'Crate'; }
export class Hero extends Entity {
  name = 'Hero';
  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    const input = this.input;
    this.body.setVelocity({
      x: input.isDown('ArrowRight') ? 1.5 : input.isDown('ArrowLeft') ? -1.5 : 0,
      y: this.body.velocity.y,
      z: input.isDown('ArrowDown') ? 1.5 : input.isDown('ArrowUp') ? -1.5 : 0
    });
  }
}

export const SCENE = {
  version: 4, type: 'level', name: 'yard',
  world: { dimensions: 3, gravity: { x: 0, y: -9.81, z: 0 } },
  prefabs: {
    ground: { actor: 'Ground', physics: { bodyType: 'static' } },
    crate: { actor: 'Crate', physics: { bodyType: 'dynamic', friction: 0.5 } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'floor', prefab: 'ground', x: 0, y: 0, z: 0, width: 20, height: 0.2, depth: 20 },
    // A step under one side of the crate, so it lands on an edge and topples.
    { id: 'step', prefab: 'ground', x: 0.6, y: 0.3, z: 0.2, width: 0.4, height: 0.4, depth: 0.4 },
    { id: 'crate-1', prefab: 'crate', x: 0.3, y: 3, z: 0.2, width: 0.4, height: 0.4, depth: 0.4 }
  ] }]
};

export const GAME_OPTIONS = { dimensions: 3, worldWidth: 20, worldHeight: 20, seed: 5 };

/** Register everything, on the server's game or a client's. */
export function registerYard(game, hooks = {}) {
  for (const actor of [Ground, Crate, Hero]) game.registerActor(actor.name, actor);
  game.sceneManager.addScene('yard', { fetch: async () => SCENE, ...hooks });
}
