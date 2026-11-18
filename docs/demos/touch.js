import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { KeyboardControl } from 'm2d-engine/constraints/keyboardControl.js';
import { UIKeyButton } from 'm2d-engine/core/ui/keyButton.js';

class Ball extends Entity {
  name = 'Player';

  constructor(body, sprite, game) {
    super(body, sprite, game);
    this.addConstraint('control', new KeyboardControl(this, { verticalMovement: true, continuous: false, maxSpeed: 220 }));
  }

  draw() {
    const { x, y } = this.renderPosition;
    this.game.renderer.drawArc({ x, y, radius: this.size.x / 2, fillStyle: '#ffa726' });
  }
}

class Wall extends Entity {
  name = 'Wall';

  draw() {
    const { x, y } = this.renderPosition;
    this.game.renderer.drawRect({ x: x - this.size.x / 2, y: y - this.size.y / 2, width: this.size.x, height: this.size.y, fillStyle: '#78909c' });
  }
}

/**
 * The D-pad: one on-screen key per direction, anchored to the bottom-left
 * corner. Each pushes its key code into the input system, the seam the
 * real keyboard uses, so KeyboardControl cannot tell the two apart.
 */
const pad = (id, dx, dy, code, label) => ({
  type: 'component', id, component: 'pad', anchor: 'bottom-left', x: 96 + dx * 60, y: -96 + dy * 60, properties: { code, label }
});

const scene = {
  version: 6, type: 'level', name: 'main',
  // The camera follows the player and, bounded by a one-screen world, stays centred on it.
  world: { width: 640, height: 360, gravity: { x: 0, y: 0 }, player: 'ball', camera: { bounds: 'world' } },
  prefabs: {
    spawn: { actor: 'SpawnPoint', physics: { bodyType: 'static', isSensor: true, layer: 'none' } },
    wall: { actor: 'Wall', physics: { bodyType: 'static' } },
    ball: { actor: 'Ball', physics: { bodyType: 'character', shape: 'circle' } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'wall-top', prefab: 'wall', x: 320, y: 5, width: 640, height: 10 },
    { id: 'wall-bottom', prefab: 'wall', x: 320, y: 355, width: 640, height: 10 },
    { id: 'wall-left', prefab: 'wall', x: 5, y: 180, width: 10, height: 360 },
    { id: 'wall-right', prefab: 'wall', x: 635, y: 180, width: 10, height: 360 },
    { id: 'ball', prefab: 'ball', x: 400, y: 180, width: 28, height: 28 },
    { id: 'start', prefab: 'spawn', x: 400, y: 180, width: 56, height: 56 }
  ] }],
  hud: [
    { type: 'text', id: 'status', anchor: 'top-right', x: -16, y: 16,
      properties: { text: 'arrow keys or the pad move the ball', align: 'right', fontSize: '14px', color: '#cfd8dc' } },
    pad('pad-up', 0, -1, 'ArrowUp', '▲'),
    pad('pad-down', 0, 1, 'ArrowDown', '▼'),
    pad('pad-left', -1, 0, 'ArrowLeft', '◀'),
    pad('pad-right', 1, 0, 'ArrowRight', '▶')
  ]
};

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, { width: 640, height: 360, initialScene: 'main', performanceStats: false });
  game.registerActor('Ball', Ball);
  game.registerActor('Wall', Wall);
  game.registerUIComponent('pad', (_scene, element) => new UIKeyButton({
    ...element, ...element.properties, width: 56, height: 56, shape: 'rect', heldBackground: '#4dd0e1'
  }));

  game.sceneManager.addScene('main', { fetch: async () => scene });

  const status = (text) => game.sceneManager.getCurrentScene().hud.setText('status', text);

  // A long press on a touchscreen stands in for a right click.
  game.input.on('rightclick', (event) => {
    status(`${event.pointerType} ${event.type}: teleport`);
    game.player.body.setPosition(event.world);
  });
  game.input.on('pinch', (event) => {
    status(`pinch scale ${event.scale.toFixed(2)}, rotation ${(event.rotation * 180 / Math.PI).toFixed(0)}°`);
  });
  game.input.on('pointerdown', (event) => {
    status(`${event.pointerType} down at ${Math.round(event.world.x)}, ${Math.round(event.world.y)}`);
  });

  await game.start();
  return game;
}
