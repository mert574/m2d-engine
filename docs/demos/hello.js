import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { Entity } from 'm2d-engine/core/entity.js';

// Actors are entity classes. Each one owns a physics body and draws itself.
class Ball extends Entity {
  name = 'Ball';

  draw() {
    const { x, y } = this.renderPosition;
    this.game.renderer.drawArc({ x, y, radius: this.size.x / 2, fillStyle: '#ffa726' });
  }
}

class Floor extends Entity {
  name = 'Floor';

  draw() {
    const { x, y } = this.renderPosition;
    this.game.renderer.drawRect({
      x: x - this.size.x / 2, y: y - this.size.y / 2,
      width: this.size.x, height: this.size.y, fillStyle: '#78909c'
    });
  }
}

// A scene names the actors it uses as prefabs and places them in layers.
// Its world says how big it is and how it is seen: the camera stays
// inside the world's bounds, so a one-screen level opens centred on it.
const scene = {
  version: 4, type: 'level', name: 'main',
  world: { width: 640, height: 360, gravity: { x: 0, y: 1000 }, camera: { bounds: 'world' } },
  prefabs: {
    floor: { actor: 'Floor', physics: { bodyType: 'static' } },
    // A behaviour attached from data: the engine's Grabbable, so a ball
    // can be dragged and flung with no code written for it.
    ball: {
      actor: 'Ball', physics: { bodyType: 'dynamic', shape: 'circle', restitution: 0.7 },
      constraints: { grab: { type: 'Grabbable' } }
    }
  },
  // Every object carries an id that is unique in the scene and stays the
  // same when the file is reordered or saved again.
  layers: [{ name: 'main', objects: [
    { id: 'floor', prefab: 'floor', x: 320, y: 350, width: 640, height: 20 },
    { id: 'ball-1', prefab: 'ball', x: 200, y: 60, width: 32, height: 32 },
    { id: 'ball-2', prefab: 'ball', x: 320, y: 140, width: 48, height: 48 },
    { id: 'ball-3', prefab: 'ball', x: 440, y: 20, width: 24, height: 24 }
  ] }]
};

export default async function start(canvas) {
  // Compiles the physics WASM module. Once, before the engine is created.
  await initPhysics();

  const game = new M2D(canvas, {
    width: 640, height: 360,          // how much world is visible
    initialScene: 'main',
    performanceStats: false
  });

  game.registerActor('Ball', Ball);
  game.registerActor('Floor', Floor);
  game.sceneManager.addScene('main', { fetch: async () => scene });

  await game.start();
  return game;
}
