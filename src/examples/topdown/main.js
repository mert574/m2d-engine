import { M2D } from '../../core/m2d.js';
import { TopDownPlayer } from '../../actors/topDownPlayer.js';
import { Ghost } from '../../actors/ghost.js';
import { Platform } from '../../actors/platform.js';
import { Coin } from '../../actors/coin.js';
import { Trigger } from '../../actors/trigger.js';
import { Turret } from '../../actors/turret.js';

const canvas = document.getElementById('screen');
const game = new M2D(canvas, {
  initialScene: 'mainMenu',
  width: 1280,
  height: 960,
  worldWidth: 3840,
  worldHeight: 2880,
  basePath: import.meta.env.DEV ? '/examples/topdown/' : '/m2d-engine/examples/topdown/'
});

// Register actors
[TopDownPlayer, Ghost, Platform, Coin, Trigger, Turret].forEach(actor => {
  game.registerActor(actor.name, actor);
});

// Register scenes
game.sceneManager.addScene('mainMenu', {
  fetch: async () => (await import('./scenes/mainMenu.json')).default
});

game.sceneManager.addScene('level1', {
  fetch: async () => (await import('./scenes/level1.json')).default
});

game.start();
