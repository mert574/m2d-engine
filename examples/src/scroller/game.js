import { InputSchema } from 'm2d-engine/net/input.js';
import { Meadow, ForeMeadow } from './meadowScenery.js';
import { ScrollFront, Bee, Flower, Pollen, Thistle, Wasp, Web, Hive } from './meadowActors.js';
import { LENGTH, HEIGHT, buildMeadow } from './meadow.js';
import { withIds } from '../shared/sceneIds.js';

/**
 * Beeline's simulation: the actors, the lane and the scene's rules, and
 * nothing that shows them. The browser imports this from main.js and adds
 * the camera, lights, HUD and menus on top. A server imports it as it is
 * and runs the lane headless (see simulate.mjs), so this module and
 * everything it imports must run in plain Node: no DOM, no Vite-only
 * imports, no renderer reads outside `draw`.
 */

const ACTORS = { Meadow, ForeMeadow, ScrollFront, Bee, Flower, Pollen, Thistle, Wasp, Web, Hive };

/** Every key the bee reads, as the alphabet a server's input gate accepts. */
export const BEELINE_INPUT = new InputSchema({
  keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX']
});

/** The lane is deterministic: built once, shared by the scene and the HUD. */
export const meadow = buildMeadow();
export const totalPollen = meadow.pollen.length;

/** Register the cast on a game, displayed or headless. */
export function registerBeeline(game) {
  for (const [name, actor] of Object.entries(ACTORS)) game.registerActor(name, actor);
}

/** Sensor prefabs never resolve collisions; they only report them. */
const sensor = { bodyType: 'static', isSensor: true };

const FOLIAGE = ['flowerballs', 'seedheads', 'flowerspikes', 'cattails', 'bramble-a', 'bramble-b'];

/**
 * The lane scene's definition: its JSON and its simulation hooks. The
 * caller adds presentation hooks (`onShow`, `onUpdate`, `onHide`) on top.
 *
 * @param {import('m2d-engine/core/m2d.js').M2D} game
 * @param {object} [options]
 * @param {(name: string) => string} [options.assetUrl] - Where a foliage
 *   sheet lives. A headless game never loads one, so it can leave this out.
 * @param {(bee: Bee) => void} [options.onReached] - The bee made the hive.
 *   Called from the tick that delivered it.
 */
export function laneScene(game, { assetUrl = () => '', onReached } = {}) {
  return {
    fetch: async () => ({
      version: 2, name: 'lane', type: 'level', gameType: 'autoScroller',
      world: { width: LENGTH, height: HEIGHT, gravity: { x: 0, y: 0 } },
      assets: { spritesheets: Object.fromEntries(
        FOLIAGE.map(name => [name, { url: assetUrl(name), frameWidth: 256, frameHeight: 256 }])
      ) },
      prefabs: {
        meadow: { actor: 'Meadow', physics: sensor },
        foreMeadow: { actor: 'ForeMeadow', physics: sensor },
        front: { actor: 'ScrollFront', physics: sensor },
        player: { actor: 'Bee', physics: { bodyType: 'dynamic', shape: 'circle', lockRotation: true, frictionAir: 0.05 } },
        flowerballs: { actor: 'Flower', spritesheet: 'flowerballs', physics: sensor },
        seedheads: { actor: 'Flower', spritesheet: 'seedheads', physics: sensor },
        flowerspikes: { actor: 'Flower', spritesheet: 'flowerspikes', physics: sensor },
        cattails: { actor: 'Flower', spritesheet: 'cattails', physics: sensor },
        pollen: { actor: 'Pollen', physics: sensor },
        'bramble-a': { actor: 'Thistle', spritesheet: 'bramble-a', physics: sensor },
        'bramble-b': { actor: 'Thistle', spritesheet: 'bramble-b', physics: sensor },
        wasp: { actor: 'Wasp', physics: sensor },
        web: { actor: 'Web', physics: sensor },
        hive: { actor: 'Hive', physics: sensor }
      },
      layers: [{ name: 'lane', objects: withIds([
        { prefab: 'meadow', x: LENGTH / 2, y: HEIGHT / 2, width: 16, height: 16 },
        { prefab: 'foreMeadow', x: LENGTH / 2, y: HEIGHT / 2, width: 16, height: 16 },
        { prefab: 'front', x: 480, y: HEIGHT / 2, width: 16, height: 16 },
        ...meadow.flowers.map(f => ({
          prefab: f.sprite, x: f.x, y: HEIGHT - f.h / 2, width: f.w, height: f.h,
          properties: { sway: f.sway }
        })),
        ...meadow.thistles.map(b => ({
          prefab: b.sprite, x: b.x, y: b.y, width: b.size * 0.58, height: b.size * 0.58,
          properties: { sway: b.sway }
        })),
        ...meadow.webs.map(w => ({
          prefab: 'web', x: w.x, y: w.y, width: w.w, height: w.h,
          properties: { sway: w.sway }
        })),
        ...meadow.pollen.map(p => ({ prefab: 'pollen', x: p.x, y: p.y, width: 26, height: 26 })),
        ...meadow.wasps.map(w => ({
          prefab: 'wasp', x: w.x, y: w.y, width: 32, height: 20,
          properties: { amp: w.amp, rate: w.rate, drift: w.drift, phase: w.phase }
        })),
        { prefab: 'hive', x: meadow.hive.x, y: meadow.hive.y, width: 70, height: 110 },
        { prefab: 'player', x: 220, y: HEIGHT / 2, width: 32, height: 24 }
      ]) }]
    }),

    onEnter() {
      for (const e of game.entities) {
        if (e instanceof Hive) e.onReached = (bee) => onReached?.(bee);
      }
    }
  };
}
