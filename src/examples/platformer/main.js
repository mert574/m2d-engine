import { M2D } from '../../core/m2d.js';
import { Player } from '../../actors/player.js';
import { Bee } from '../../actors/bee.js';
import { Platform } from '../../actors/platform.js';
import { MovingPlatform } from '../../actors/movingPlatform.js';
import { Coin } from '../../actors/coin.js';
import { Trigger } from '../../actors/trigger.js';
import { MenuScene } from './scenes/menuScene.js';
import gameScene from './scenes/levelScene.js';
import { Scene } from '../../core/scene.js';

import jumpSound from './assets/sounds/jump.wav';
import coinSound from './assets/sounds/coin.wav';
import gameOverSound from './assets/sounds/gameover.wav';
import levelCompleteSound from './assets/sounds/levelComplete.wav';
import attackSound from './assets/sounds/attack.wav';
import damageSound from './assets/sounds/damage.wav';

import menuMusic from './assets/music/menu.mp3';
import gameMusic from './assets/music/game.mp3';

const canvas = document.getElementById('screen');
const game = new M2D(canvas, {
  initialScene: 'mainMenu',
  width: 1280,
  height: 960,
  worldWidth: 1920,
  worldHeight: 1440,
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
game.registerActor('player', Player);
game.registerActor('bee', Bee);
game.registerActor('platform', Platform);
game.registerActor('movingPlatform', MovingPlatform);
game.registerActor('coin', Coin);
game.registerActor('trigger', Trigger);

game.sceneManager.scenes.set('mainMenu', new MenuScene(game, {
  name: 'mainMenu',
  type: 'menu',
  gameType: 'menu',
  sprites: [],
  onEnter: () => {
    game.soundManager.playMusic('menu');
  }
}));

game.sceneManager.scenes.set('game', new Scene(game, {
  name: 'game',
  type: 'level',
  levelData: gameScene,
  onEnter: () => {
    game.soundManager.playMusic('game');
  }
}));

game.start();
