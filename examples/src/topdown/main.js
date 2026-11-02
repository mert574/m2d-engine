import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { TopDownPlayer } from 'm2d-engine/actors/topDownPlayer.js';
import { Ghost } from 'm2d-engine/actors/ghost.js';
import { Platform } from 'm2d-engine/actors/platform.js';
import { Coin } from 'm2d-engine/actors/coin.js';
import { Trigger } from 'm2d-engine/actors/trigger.js';
import { Turret } from 'm2d-engine/actors/turret.js';

const canvas = document.getElementById('screen');
// Compile Rapier's WASM module before anything builds a physics world.
await initPhysics();

const game = new M2D(canvas, {
  pointerLock: false,
  initialScene: 'mainMenu',
  width: 1280,
  height: 960,
  worldWidth: 3840,
  worldHeight: 2880,
  // 32px pixel-art tiles: upscale them blocky, not smeared, below native.
  worldFilter: 'nearest',
  // Where sprite URLs in scene JSON resolve. Vite's BASE_URL is '/' on the
  // dev server and '/m2d-engine/examples/' in the published build (set in
  // vite.config.js), so deriving the prefix from it keeps both in step with
  // however the site is actually served, instead of hardcoding each one.
  basePath: import.meta.env.BASE_URL + 'topdown/'
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
registerMainMenu(game, {
  title: 'Top-Down',
  subtitle: 'a demonstration',
  hint: 'Arrows move · X attacks · O for settings',
  backdrop: { gradient: { from: '#0b0714', to: '#2a1840', angle: 115 }, motes: 90 },
  items: () => [
    { text: 'Start Game', onSelect: () => game.sceneManager.switchTo('level1') },
    { text: 'Settings', onSelect: () => game.settings.open() }
  ]
});

game.sceneManager.addScene('level1', {
  fetch: async () => (await import('./scenes/level1.json')).default
});

// Settings overlay (O): resolution, fullscreen, aspect mode.
new SettingsMenu(game);

game.start();
