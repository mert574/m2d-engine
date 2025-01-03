import { M2D } from '../../core/m2d.js';
import { Player } from '../../actors/player.js';
import { Bee } from '../../actors/bee.js';
import { Platform } from '../../actors/platform.js';
import { MovingPlatform } from '../../actors/movingPlatform.js';
import { Coin } from '../../actors/coin.js';
import { Trigger } from '../../actors/trigger.js';

import jumpSound from './assets/sounds/jump.wav';
import coinSound from './assets/sounds/coin.wav';
import gameOverSound from './assets/sounds/gameover.wav';
import levelCompleteSound from './assets/sounds/levelComplete.wav';
import attackSound from './assets/sounds/attack.wav';
import damageSound from './assets/sounds/damage.wav';
import menuMusic from './assets/music/menu.mp3';
import gameMusic from './assets/music/game.mp3';

const container = document.getElementById('game');
const game = new M2D(container, {
  initialScene: 'mainMenu',
  width: 1280,
  height: 960,
  worldWidth: 1920,
  worldHeight: 1440,
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

game.start();
