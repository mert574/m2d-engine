import Matter from 'matter-js';
import { M2D } from '../../core/m2d.js';
import { Entity } from '../../core/entity.js';
import ballSprite from './assets/ball.png';
import boxSprite from './assets/box.png';
import platformSprite from './assets/platform.png';

class BouncingBall extends Entity {
  constructor(body, sprite, game) {
    const circle = Matter.Bodies.circle(body.position.x, body.position.y, 16, {
      restitution: 0.8, friction: 0.005, frictionAir: 0.001
    });
    super(circle, sprite, game);
  }
}
class Ramp extends Entity {
  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    Matter.Body.setAngle(body, options.angle || 0);
  }
}

const game = new M2D(document.getElementById('screen'), {
  initialScene: 'physics', width: 640, height: 480, worldWidth: 640, worldHeight: 480
});
game.camera.x = 320;
game.camera.y = 240;
game.registerActor('Ball', BouncingBall);
game.registerActor('Box', Entity);
game.registerActor('Ramp', Ramp);
game.sceneManager.addScene('physics', {
  fetch: async () => ({
    version: 1, name: 'physics', type: 'level', gameType: 'sideScroll',
    world: { width: 640, height: 480, gravity: { x: 0, y: 1 } },
    assets: { spritesheets: {
      ball: { url: ballSprite, frameWidth: 32, frameHeight: 32 },
      box: { url: boxSprite, frameWidth: 32, frameHeight: 32 },
      platform: { url: platformSprite, frameWidth: 32, frameHeight: 32 }
    } },
    prefabs: {
      ball: { actor: 'Ball', spritesheet: 'ball', physics: { bodyType: 'dynamic' } },
      box: { actor: 'Box', spritesheet: 'box', physics: { bodyType: 'dynamic', restitution: 0.6 } },
      platform: { actor: 'Ramp', spritesheet: 'platform', physics: { bodyType: 'static' } }
    },
    layers: [{ name: 'playground', objects: [
      { prefab: 'platform', x: 320, y: 450, width: 640, height: 32 },
      { prefab: 'platform', x: 150, y: 350, width: 200, height: 20, properties: { angle: Math.PI * 0.15 } },
      { prefab: 'platform', x: 490, y: 350, width: 200, height: 20, properties: { angle: -Math.PI * 0.15 } },
      { prefab: 'platform', x: 16, y: 240, width: 32, height: 480 },
      { prefab: 'platform', x: 624, y: 240, width: 32, height: 480 },
      { prefab: 'ball', x: 100, y: 100, width: 32, height: 32 },
      { prefab: 'ball', x: 200, y: 150, width: 32, height: 32 },
      { prefab: 'box', x: 400, y: 100, width: 40, height: 40 },
      { prefab: 'box', x: 500, y: 150, width: 40, height: 40 }
    ] }]
  })
});

game.keys.addKey(' ', (pressed) => {
  const scene = game.sceneManager.getCurrentScene();
  if (!pressed || game.sceneManager.loading || !scene) return;
  const isBox = Math.random() > 0.5;
  const size = isBox ? 40 : 32;
  const sprite = scene.spriteSheets.get(isBox ? 'box' : 'ball');
  const entity = game.createEntity(isBox ? 'Box' : 'Ball', 120 + Math.random() * 400, 50,
    size, size, sprite, {}, { restitution: isBox ? 0.6 : 0.8 });
  entity.setAnimation('default');
  game.entities.add(entity);
  Matter.Composite.add(game.engine.world, entity.body);
});
game.start();
