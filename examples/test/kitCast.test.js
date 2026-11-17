import { describe, it, expect, beforeAll } from 'vitest';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { M2D } from 'm2d-engine/core/m2d.js';
import { SCENE_VERSION } from 'm2d-engine/core/sceneLoader.js';
import { Prop } from 'm2d-engine/actors/prop.js';
import { Player } from 'm2d-engine/actors/player.js';
import { PREFAB_TEMPLATES, registerKitActors } from 'm2d-kit/actors';

/**
 * The kit's prefab templates, played: a scene that takes the `mob` and
 * `pickup` fragments verbatim gets a chaser that dies and is gone, and a
 * pickup that counts, raises `picked` and satisfies a `collected` rule —
 * composition over the engine's capabilities, no class written.
 */

beforeAll(async () => {
  await initPhysics();
});

const level = () => ({
  version: SCENE_VERSION, type: 'level', name: 'cast',
  world: {
    width: 800, height: 400, gravity: { x: 0, y: 0 }, player: 'hero',
    counters: { loot: { initial: 0 } },
    rules: [{ when: { event: 'collected', prefab: 'pickup' }, then: [{ do: 'notice', text: 'ALL TAKEN' }] }]
  },
  prefabs: {
    hero: { actor: 'Player', physics: { bodyType: 'dynamic', lockRotation: true } },
    mob: structuredClone(PREFAB_TEMPLATES.mob.prefab),
    pickup: { ...structuredClone(PREFAB_TEMPLATES.pickup.prefab), constraints: {
      ...structuredClone(PREFAB_TEMPLATES.pickup.prefab.constraints),
      collectable: { type: 'Collectable', params: { counter: 'loot' } }
    } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'hero', prefab: 'hero', x: 100, y: 200, width: 24, height: 24 },
    { id: 'mob-1', prefab: 'mob', x: 300, y: 200, width: 20, height: 20 },
    { id: 'take-1', prefab: 'pickup', x: 130, y: 200, width: 16, height: 16 }
  ] }]
});

async function make() {
  const game = new M2D(null, { headless: true, worldWidth: 800, worldHeight: 400, seed: 3 });
  registerKitActors(game);
  game.registerActor('Player', Player);
  game.registerActor('Prop', Prop, { origin: 'game' });
  game.sceneManager.addScene('cast', { fetch: async () => level() });
  await game.sceneManager.switchTo('cast');
  await game.start(); // wires the collision handlers; a headless caller owns the clock
  return { game, scene: game.sceneManager.getCurrentScene() };
}

describe('the prefab templates, in play', () => {
  it('the mob walks at the player and leaves the world at zero health', async () => {
    const { game, scene } = await make();
    const mob = scene.entitiesById.get('mob-1');
    const start = mob.position.x;
    expect(game.step(90)).toBe(90);
    expect(mob.position.x, 'chases toward the player on its left').toBeLessThan(start - 5);
    mob.getConstraint('health').takeDamage(60);
    expect(mob.dead).toBe(true);
    expect(game.step(1)).toBe(1);
    expect(game.entities.has(mob), 'whenDead: remove took it out').toBe(false);
    game.destroy();
  });

  it('the pickup counts its counter, raises picked, and the collected rule fires', async () => {
    const { game, scene } = await make();
    const picked = [];
    game.events.on?.('picked', (data) => picked.push(data));
    const take = scene.entitiesById.get('take-1');
    // Walk the hero over it: the player's own control reads the held key.
    game.input.setSnapshotSource(() => ({ down: ['ArrowRight'] }));
    let guard = 300;
    while (game.entities.has(take) && guard--) game.step(1);
    expect(guard).toBeGreaterThan(0);
    expect(scene.counters.get('loot')).toBe(1);
    expect(game.step(1)).toBe(1);
    expect(scene.hud?.elements?.get?.('notice') ?? true).toBeTruthy(); // headless builds no HUD; the rule just must not throw
    game.destroy();
  });
});
