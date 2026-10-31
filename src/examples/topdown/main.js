import { M2D } from '../../core/m2d.js';
import { initPhysics } from '../../core/physics/index.js';
import { SettingsMenu } from '../../core/ui/settingsMenu.js';
import { TopDownPlayer } from '../../actors/topDownPlayer.js';
import { Ghost } from '../../actors/ghost.js';
import { Platform } from '../../actors/platform.js';
import { Coin } from '../../actors/coin.js';
import { Trigger } from '../../actors/trigger.js';
import { Turret } from '../../actors/turret.js';

const canvas = document.getElementById('screen');
// Compile Rapier's WASM module before anything builds a physics world.
await initPhysics();

const game = new M2D(canvas, {
  initialScene: 'mainMenu',
  width: 1280,
  height: 960,
  worldWidth: 3840,
  worldHeight: 2880,
  // 32px pixel-art tiles: upscale them blocky, not smeared, below native.
  worldFilter: 'nearest',
  basePath: import.meta.env.DEV ? '/examples/topdown/' : '/m2d-engine/examples/topdown/'
});

// Keep the camera inside the level: without bounds, following the player (or
// an 'expand' aspect mode widening the view) reveals the void past the map.
game.camera.bounds = {
  left: 0, top: 0,
  right: game.options.worldWidth, bottom: game.options.worldHeight
};

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

// Settings overlay (O): resolution, fullscreen, aspect mode.
new SettingsMenu(game);

game.start();
