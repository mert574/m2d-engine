import { M2D } from '../../core/m2d.js';
import { initPhysics } from '../../core/physics/index.js';
import { SettingsMenu } from '../../core/ui/settingsMenu.js';
import { Player } from '../../actors/player.js';
import { Bee } from '../../actors/bee.js';
import { Platform } from '../../actors/platform.js';
import { MovingPlatform } from '../../actors/movingPlatform.js';
import { Coin } from '../../actors/coin.js';
import { Trigger } from '../../actors/trigger.js';

import {
  jumpSound, coinSound, gameOverSound, levelCompleteSound,
  attackSound, damageSound, menuMusic, gameMusic
} from '../shared/audio.js';

const canvas = document.getElementById('screen');
// Backend warm-up: a no-op today, the WASM compile for a future backend.
await initPhysics();

const game = new M2D(canvas, {
  initialScene: 'mainMenu',
  width: 1280,
  height: 960,
  worldWidth: 1920,
  worldHeight: 1440,
  // The tiles are 32px pixel art: upscale them blocky, not smeared, when the
  // render resolution drops below native.
  worldFilter: 'nearest',
  basePath: import.meta.env.DEV ? '/examples/platformer/' : '/m2d-engine/examples/platformer/',
  sounds: {
    jump: jumpSound,
    coin: coinSound,
    gameOver: gameOverSound,
    levelComplete: levelCompleteSound,
    attack: attackSound,
    damage: damageSound
  },
  music: {
    menu: menuMusic,
    game: gameMusic
  }
});

// Keep the camera inside the level: without bounds, following the player (or
// an 'expand' aspect mode widening the view) reveals the void past the map.
game.camera.bounds = {
  left: 0, top: 0,
  right: game.options.worldWidth, bottom: game.options.worldHeight
};

// Register actors
[Player, Bee, Platform, MovingPlatform, Coin, Trigger].forEach(actor => {
  game.registerActor(actor.name, actor);
});

// Register scenes
game.sceneManager.addScene('mainMenu', {
  fetch: async () => (await import('./scenes/mainMenu.json')).default,
  onEnter() {
    game.soundManager.playMusic('menu');
  }
});

game.sceneManager.addScene('level1', {
  fetch: async () => (await import('./scenes/level1.json')).default,
  onEnter() {
    game.soundManager.playMusic('game');
  }
});

// Settings overlay (O): resolution, fullscreen, aspect mode.
new SettingsMenu(game);

game.start();
