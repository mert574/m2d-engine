import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { SettingsMenu } from 'm2d-engine/core/ui/settingsMenu.js';
import { registerMainMenu } from '../shared/mainMenu.js';
import { menuBackdrop } from './menuBackdrop.js';
import { Player } from 'm2d-engine/actors/player.js';
import { Bee } from 'm2d-engine/actors/bee.js';
import { Platform } from 'm2d-engine/actors/platform.js';
import { MovingPlatform } from 'm2d-engine/actors/movingPlatform.js';
import { Coin } from 'm2d-engine/actors/coin.js';
import { Trigger } from 'm2d-engine/actors/trigger.js';

import {
  jumpSound, coinSound, gameOverSound, levelCompleteSound,
  attackSound, damageSound, menuMusic, gameMusic
} from '../shared/audio.js';

const canvas = document.getElementById('screen');
// Compile Rapier's WASM module before anything builds a physics world.
await initPhysics();

const game = new M2D(canvas, {
  pointerLock: false,
  initialScene: 'mainMenu',
  width: 1280,
  height: 960,
  worldWidth: 1920,
  worldHeight: 1440,
  // The tiles are 32px pixel art: upscale them blocky, not smeared, when the
  // render resolution drops below native.
  worldFilter: 'nearest',
  // Where sprite URLs in scene JSON resolve. Vite's BASE_URL is '/' on the
  // dev server and '/m2d-engine/examples/' in the published build (set in
  // vite.config.js), so deriving the prefix from it keeps both in step with
  // however the site is actually served, instead of hardcoding each one.
  basePath: import.meta.env.BASE_URL + 'platformer/',
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
registerMainMenu(game, {
  title: 'Platformer',
  subtitle: 'a demonstration',
  hint: 'Arrows move · Space jumps · X attacks · O for settings',
  backdrop: menuBackdrop,
  items: () => [
    { text: 'Start Game', onSelect: () => game.sceneManager.switchTo('level1') },
    { text: 'Settings', onSelect: () => game.settings.open() }
  ],
  onEnter: () => game.soundManager.playMusic('menu')
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
