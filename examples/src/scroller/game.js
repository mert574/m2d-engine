import { InputSchema } from 'm2d-engine/net/input.js';
import { Meadow, ForeMeadow } from './meadowScenery.js';
import { ScrollFront, Bee, Flower, Pollen, Thistle, Wasp, Web, Hive } from './meadowActors.js';
import { BeeStatus } from './beeHud.js';
import { LENGTH, HEIGHT } from './meadow.js';

/**
 * Beeline's definition: the cast, the input a client may send, and
 * nothing that shows them. The lane itself is `scenes/lane.json`, which
 * the editor opens and a server reads as it is (see simulate.mjs), so
 * this module and everything it imports must run in plain Node: no DOM,
 * no Vite-only imports, no renderer reads outside `draw`.
 *
 * The hive tells the player it was reached with `player.notify('arrived')`,
 * which the lane's notify rule turns into the sound and the way back to
 * the menu.
 */

const ACTORS = { Meadow, ForeMeadow, ScrollFront, Bee, Flower, Pollen, Thistle, Wasp, Web, Hive };

/** Every key the bee reads, as the alphabet a server's input gate accepts. */
export const BEELINE_INPUT = new InputSchema({
  keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX']
});

/** M2D options Beeline's simulation depends on. */
export const GAME = { worldWidth: LENGTH, worldHeight: HEIGHT };

/** Register the cast on a game, displayed or headless. */
export function register(game) {
  for (const [name, actor] of Object.entries(ACTORS)) game.registerActor(name, actor);
  // The bee's readout, which the lane's hud places by name. Only ever
  // built where there is a screen to show it on.
  game.registerHudComponent('beeStatus', (scene, element) => new BeeStatus(scene, element));
}
