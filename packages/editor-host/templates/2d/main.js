import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { GAME, register } from './game.js';
import { sceneHooks } from './hooks.js';
import level from './scenes/level.json';
import menu from './scenes/menu.json';

// The page: a canvas, the game's definition, its scenes with their hooks.
// The menu is scene data (scenes/menu.json), made in the editor; its Start
// button switches to the level.
await initPhysics();
const game = new M2D(document.getElementById('screen'), {
  ...GAME,
  width: 1280,
  height: 720,
  initialScene: 'menu',
  performanceStats: false
});
register(game);
const hooks = sceneHooks(game);
game.sceneManager.addScene('menu', { fetch: async () => menu, ...hooks.menu });
game.sceneManager.addScene('level', { fetch: async () => level, ...hooks.level });
await game.start();
