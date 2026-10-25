import { M2D } from '../../core/m2d.js';
import { SettingsMenu } from '../../core/ui/settingsMenu.js';
import { Entity } from '../../core/entity.js';
import { Platform } from '../../actors/platform.js';
import { KeyboardControl } from '../../constraints/keyboardControl.js';
import playerSprite from './assets/player.png';
import wallSprite from './assets/wall.png';

class MazePlayer extends Entity {
  name = 'Player';
  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.addConstraint('movement', new KeyboardControl(this, { verticalMovement: true, maxSpeed: 3 }));
  }
}

const game = new M2D(document.getElementById('screen'), {
  initialScene: 'maze', width: 640, height: 480, worldWidth: 640, worldHeight: 480,
  // 32px pixel-art tiles: upscale them blocky, not smeared, below native.
  worldFilter: 'nearest'
});
// The board is exactly one view; in 'expand' mode the camera centres on it
// (bounds smaller than the view centre rather than pin — see Camera).
game.camera.bounds = { left: 0, top: 0, right: 640, bottom: 480 };
game.registerActor('MazePlayer', MazePlayer);
game.registerActor('Platform', Platform);
const walls = [
  [320, 16, 640, 32], [320, 464, 640, 32], [16, 240, 32, 480], [624, 240, 32, 480],
  [200, 150, 32, 200], [400, 300, 32, 200], [300, 200, 200, 32], [100, 350, 200, 32]
];
game.sceneManager.addScene('maze', {
  fetch: async () => ({
    version: 1, name: 'maze', type: 'level', gameType: 'topDown',
    world: { width: 640, height: 480, gravity: { x: 0, y: 0 } },
    assets: { spritesheets: {
      player: { url: playerSprite, frameWidth: 32, frameHeight: 32 },
      wall: { url: wallSprite, frameWidth: 32, frameHeight: 32 }
    } },
    prefabs: {
      player: { actor: 'MazePlayer', spritesheet: 'player', physics: { bodyType: 'dynamic', frictionAir: 0.2 } },
      wall: { actor: 'Platform', spritesheet: 'wall', physics: { bodyType: 'static' } }
    },
    layers: [{ name: 'maze', objects: [
      { prefab: 'player', x: 64, y: 64, width: 32, height: 32 },
      ...walls.map(([x, y, width, height]) => ({ prefab: 'wall', x, y, width, height }))
    ] }]
  })
});
// Settings overlay (O): resolution, fullscreen, aspect mode.
new SettingsMenu(game);

game.start();
