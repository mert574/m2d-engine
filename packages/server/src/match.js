import { InputSchema } from 'm2d-engine/net/input.js';

/**
 * A match definition: the server entry's half of a game. It lives in a
 * module of its own, which each match's worker imports, and it imports the
 * game's shared module (actors, scenes, intents) the browser plays too.
 *
 *   // keepMatch.js
 *   export default defineMatch({
 *     input: KEEP_INPUT,
 *     game: { worldWidth: 4096, worldHeight: 3072 },
 *     async setup(game) { registerKeep(game); await game.sceneManager.switchTo('keep'); },
 *     join(game, player) { player.avatar = game.spawn('ObliquePlayer', ...); },
 *     leave(game, player) { ... }
 *   });
 *
 * @param {object} definition
 * @param {InputSchema} definition.input - What a player's held input may be
 * @param {object} [definition.game] - `M2D` options for the headless game (`worldWidth`, `seed`, `fixedTimestep` ...)
 * @param {(game, context: {matchId: string}) => Promise<void>|void} definition.setup - Register everything and enter the first scene
 * @param {(game, player) => void} definition.join - A player arrived: give them an avatar (`player.avatar`) and any state
 * @param {(game, player) => void} [definition.leave] - A player is gone for good. By default their entities are removed
 * @param {number} [definition.maxPlayers=8]
 * @param {number} [definition.sendEvery=2] - Ticks between state messages
 * @param {number} [definition.reconnectSeconds=10] - How long a dropped player's avatar waits for them
 * @param {number} [definition.maxEntities=5000] - A match that grows past this is ended
 */
export function defineMatch(definition) {
  if (!definition || typeof definition !== 'object') throw new Error('m2d-server: defineMatch needs a definition object');
  const { input, setup, join } = definition;
  if (!(input instanceof InputSchema)) throw new Error('m2d-server: a match needs an InputSchema as `input`');
  if (typeof setup !== 'function') throw new Error('m2d-server: a match needs `setup(game)`');
  if (typeof join !== 'function') throw new Error('m2d-server: a match needs `join(game, player)`');
  const match = {
    game: {},
    maxPlayers: 8,
    sendEvery: 2,
    reconnectSeconds: 10,
    maxEntities: 5000,
    leave: removeEntitiesOf,
    ...definition
  };
  for (const key of ['maxPlayers', 'sendEvery', 'maxEntities']) {
    if (!Number.isInteger(match[key]) || match[key] < 1) throw new Error(`m2d-server: ${key} must be a whole number from 1 up`);
  }
  if (!(match.reconnectSeconds >= 0)) throw new Error('m2d-server: reconnectSeconds must be 0 or more');
  return Object.freeze(match);
}

/** The default `leave`: take the player's entities out of the world. */
export function removeEntitiesOf(game, player) {
  for (const entity of player.entities) {
    game.entities.delete(entity);
    game.physics.remove(entity.body);
    entity.destroy?.();
  }
}
