import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { s } from 'm2d-engine/core/schema.js';
import { PathFollow } from 'm2d-engine/constraints/pathFollow.js';

/** Patrols the world on a kinematic body. */
class Mover extends Entity {
  static properties = {
    path: s.object(PathFollow.params, { label: 'Path' })
  };

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

/** Scenery: a grid over the world so camera motion is visible. It collides with nothing. */
class Grid extends Entity {
  static properties = {
    step: s.number({ positive: true, initial: 100, unit: 'px' })
  };

  name = 'Grid';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.step = options.step ?? 100;
  }

  draw() {
    const renderer = this.game.renderer;
    const { x, y } = this.renderPosition;
    const left = x - this.size.x / 2;
    const top = y - this.size.y / 2;
    for (let gx = left; gx <= left + this.size.x; gx += this.step) {
      renderer.drawLine({ x1: gx, y1: top, x2: gx, y2: top + this.size.y, strokeStyle: '#2a3a4a' });
    }
    for (let gy = top; gy <= top + this.size.y; gy += this.step) {
      renderer.drawLine({ x1: left, y1: gy, x2: left + this.size.x, y2: gy, strokeStyle: '#2a3a4a' });
    }
    renderer.drawRect({ x: left, y: top, width: this.size.x, height: this.size.y, strokeStyle: '#90a4ae', lineWidth: 4 });
  }
}

const label = (bounds) => (bounds ? 'bounds on. turn off' : 'bounds off. turn on');

// The world is larger than the 640 by 360 view. Its camera follows the
// mover, eases toward it, and stays inside the world's bounds.
const scene = {
  version: 7, type: 'level', name: 'main',
  world: {
    width: 1600, height: 900, gravity: { x: 0, y: 0 },
    camera: { follow: 'mover', lerp: 0.08, bounds: 'world' }
  },
  prefabs: {
    mover: { actor: 'Mover', physics: { bodyType: 'kinematic' } },
    grid: { actor: 'Grid', physics: { bodyType: 'static', isSensor: true } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'grid', prefab: 'grid', x: 800, y: 450, width: 1600, height: 900, zIndex: -1 },
    { id: 'mover', prefab: 'mover', x: 100, y: 100, width: 32, height: 32, properties: {
      path: { points: [{ x: 100, y: 100 }, { x: 1500, y: 150 }, { x: 1450, y: 800 }, { x: 150, y: 780 }], speed: 260, waitTime: 400 }
    } }
  ] }],
  hud: [
    { type: 'button', id: 'bounds', anchor: 'top', x: 0, y: 28,
      properties: { text: label(true), action: 'bounds', width: 200, height: 32, variant: 'secondary', fontSize: '14px' } }
  ]
};

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, { width: 640, height: 360, initialScene: 'main', performanceStats: false });
  game.registerActor('Mover', Mover);
  game.registerActor('Grid', Grid);

  game.sceneManager.addScene('main', {
    fetch: async () => scene,
    // The scene set the bounds; the button takes them away and puts them
    // back through the camera API. Without them the view shows the space
    // past the world's edge.
    onAction(name) {
      if (name !== 'bounds') return;
      game.camera.bounds = game.camera.bounds ? null : { left: 0, top: 0, right: 1600, bottom: 900 };
      game.sceneManager.getCurrentScene().hud.elements.get('bounds').text = label(game.camera.bounds);
    }
  });

  await game.start();
  return game;
}
