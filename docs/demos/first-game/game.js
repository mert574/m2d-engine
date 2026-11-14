import { Hero } from './hero.js';

/**
 * The game's definition: the cast, and nothing that shows it. The page
 * boots from it, the editor runs it, and a headless game could too.
 */
export function register(game) {
  game.registerActor('Hero', Hero);
}
