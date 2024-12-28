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

const canvas = document.getElementById('screen');
const game = new M2D(canvas, {
  initialScene: 'mainMenu',
  width: 1280,
  height: 960,
  worldWidth: 1920,
  worldHeight: 1440,
  sounds: {
    jump: 'assets/sounds/jump.wav',
    coin: 'assets/sounds/coin.wav',
    gameOver: 'assets/sounds/gameover.wav',
    levelComplete: 'assets/sounds/levelComplete.wav',
    attack: 'assets/sounds/attack.wav',
    damage: 'assets/sounds/damage.wav'
  },
  music: {
    menu: 'assets/music/menu.mp3',
    game: 'assets/music/game.mp3'
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
