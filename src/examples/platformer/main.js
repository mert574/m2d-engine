import { M2D } from '../../core/m2d.js';
import { Player } from '../../actors/player.js';
import { Bee } from '../../actors/bee.js';
import { Platform } from '../../actors/platform.js';
import { MovingPlatform } from '../../actors/MovingPlatform.js';
import { Coin } from '../../actors/Coin.js';
import { Trigger } from '../../actors/Trigger.js';
import { MenuScene } from './scenes/MenuScene.js';
import gameScene from './scenes/LevelScene.js';

const canvas = document.getElementById('screen');
const game = new M2D(canvas, {
  initialScene: 'mainMenu',
  width: 1280,
  height: 960,
  worldWidth: 1920,
  worldHeight: 1440
});

// Register actors
game.registerActor('player', Player);
game.registerActor('bee', Bee);
game.registerActor('platform', Platform);
game.registerActor('movingPlatform', MovingPlatform);
game.registerActor('coin', Coin);
game.registerActor('trigger', Trigger);

// Create and register menu scene
game.sceneManager.scenes.set('mainMenu', new MenuScene(game, {
  name: 'mainMenu',
  type: 'menu',
  gameType: 'menu',
  sprites: []
}));

// Register the level scene
game.sceneManager.setLevelData('game', gameScene);

game.start();