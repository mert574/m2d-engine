import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { defineMatch } from 'm2d-server';
import { KEEP_INPUT, KEEP_GAME, registerKeep } from '../../src/iso/game.js';

/**
 * The keep arranged for the online pathfinding test: the first spawn point
 * moved to the hall at the keep's east end, and a pack of skeletons in the
 * vault next door — one long wall between them, so a hunt that cannot
 * route never arrives. Everything else is keepMatch.js's pattern, the
 * baked navmesh included; the added skeletons are dynamic bodies, so the
 * bake's stamp still holds.
 */

const SCENE = new URL('../../src/iso/scenes/keep.json', import.meta.url);
const PROJECT = JSON.parse(readFileSync(new URL('../../src/iso/m2d.project.json', import.meta.url), 'utf8'));

export async function scene() {
  const keep = JSON.parse(await readFile(SCENE, 'utf8'));
  const spawn = keep.layers.flatMap((layer) => layer.objects).find((object) => keep.prefabs[object.prefab]?.actor === 'SpawnPoint');
  spawn.x = 3944;
  spawn.y = 1480;
  const spots = [[3400, 1440], [3440, 1440], [3400, 1500], [3440, 1500]];
  for (const [i, [x, y]] of spots.entries()) {
    keep.layers[0].objects.push({ id: `vault-goblin-${i}`, prefab: 'skeleton', x, y, width: 28, height: 28 });
  }
  return keep;
}

export default defineMatch({
  input: KEEP_INPUT,
  game: { ...KEEP_GAME, navAgents: PROJECT.navAgents, navAreas: PROJECT.navAreas, basePath: new URL('../../src/iso/', import.meta.url).href },
  maxPlayers: 2,
  interest: { radius: 1400 },

  async setup(game) {
    registerKeep(game);
    game.sceneManager.addScene('keep', { fetch: scene });
    await game.sceneManager.switchTo('keep');
    // The vault pack hunts from the next room over, past the shipped range.
    for (const entity of game.entities) {
      if (entity.sceneId?.startsWith('vault-goblin')) entity.getConstraint('chase').detectionRange = 1400;
    }
  }
});
