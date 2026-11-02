import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { PathFollow } from 'm2d-engine/constraints/pathFollow.js';
import { UIText } from 'm2d-engine/core/ui/text.js';

const WORLD = { width: 1600, height: 900 };
const VIEW = { width: 640, height: 360 };

/** Patrols the world on a kinematic body. */
class Mover extends Entity {
  name = 'Mover';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.addConstraint('path', new PathFollow(this, options.path));
  }

  draw() {
    const { x, y } = this.renderPosition;
    this.game.renderer.drawArc({ x, y, radius: 16, fillStyle: '#ffa726' });
  }
}

const scene = {
  version: 1, type: 'level', name: 'main',
  world: { gravity: { x: 0, y: 0 } },
  prefabs: { mover: { actor: 'Mover', physics: { bodyType: 'kinematic' } } },
  layers: [{ name: 'main', objects: [
    { prefab: 'mover', x: 100, y: 100, width: 32, height: 32, properties: {
      path: { points: [{ x: 100, y: 100 }, { x: 1500, y: 150 }, { x: 1450, y: 800 }, { x: 150, y: 780 }], speed: 260, waitTime: 400 }
    } }
  ] }]
};

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, {
    ...VIEW, worldWidth: WORLD.width, worldHeight: WORLD.height,
    initialScene: 'main', performanceStats: false
  });
  game.registerActor('Mover', Mover);

  const bounds = { left: 0, top: 0, right: WORLD.width, bottom: WORLD.height };
  let label = null;
  const describe = () => {
    label.text = game.camera.bounds ? 'bounds on. click to turn off' : 'bounds off. click to turn on';
  };

  game.sceneManager.addScene('main', {
    fetch: async () => scene,
    onEnter() {
      const mover = [...game.entities].find((entity) => entity.name === 'Mover');
      game.camera.follow(mover);
      game.camera.lerp = 0.08;
      game.camera.bounds = bounds;
      label = game.sceneManager.getCurrentScene().ui.add(
        new UIText({
          x: 0,
          y: 12,
          text: '',
          anchor: 'top',
          align: 'center',
          fontSize: '16px',
          color: '#cfd8dc'
        }));
      describe();
    },
    // World-space drawing that is not an entity: a grid, so camera motion is visible.
    onDraw() {
      const renderer = game.renderer;
      for (let x = 0; x <= WORLD.width; x += 100) {
        renderer.drawLine({ x1: x, y1: 0, x2: x, y2: WORLD.height, strokeStyle: '#2a3a4a' });
      }
      for (let y = 0; y <= WORLD.height; y += 100) {
        renderer.drawLine({ x1: 0, y1: y, x2: WORLD.width, y2: y, strokeStyle: '#2a3a4a' });
      }
      renderer.drawRect({ x: 0, y: 0, width: WORLD.width, height: WORLD.height, strokeStyle: '#90a4ae', lineWidth: 4 });
    }
  });

  game.input.on('click', () => {
    game.camera.bounds = game.camera.bounds ? null : bounds;
    describe();
  });

  await game.start();
  return game;
}
