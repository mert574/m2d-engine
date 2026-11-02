import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { KeyboardControl } from 'm2d-engine/constraints/keyboardControl.js';
import { UIElement } from 'm2d-engine/core/ui/uiElement.js';
import { UIText } from 'm2d-engine/core/ui/text.js';

/**
 * An on-screen button that acts as a key. Pressing it pushes a keydown
 * record into the input system, the same seam the real keyboard uses, so
 * KeyboardControl cannot tell the two apart.
 */
class PadButton extends UIElement {
  constructor(x, y, code, label, options = {}) {
    super({ ...options, x, y, width: 56, height: 56 });
    this.code = code;
    this.label = label;
    this.held = false;
  }

  press() {
    if (this.held) return;
    this.held = true;
    this.game.input.push({ kind: 'keydown', code: this.code, key: this.code, time: performance.now() });
    this.game.input.flush();
  }

  release() {
    if (!this.held) return;
    this.held = false;
    this.game.input.push({ kind: 'keyup', code: this.code, key: this.code, time: performance.now() });
    this.game.input.flush();
  }

  onPointerDown() { this.press(); }
  onPointerUp() { releaseAll(); }

  draw() {
    const ui = this.game.uiRenderer;
    ui.drawRect({
      x: this.x - 28, y: this.y - 28, width: 56, height: 56, cornerRadius: 10,
      fillStyle: this.held ? '#4dd0e1' : 'rgba(255, 255, 255, 0.15)'
    });
    ui.drawText({ text: this.label, x: this.x, y: this.y, fillStyle: '#fff', fontSize: '22px', textAlign: 'center', textBaseline: 'middle' });
  }
}

const pads = [];
function releaseAll() { for (const pad of pads) pad.release(); }

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

const scene = {
  version: 1, type: 'level', name: 'main',
  world: { gravity: { x: 0, y: 0 } },
  prefabs: {
    wall: { actor: 'Wall', physics: { bodyType: 'static' } },
    ball: { actor: 'Ball', physics: { bodyType: 'character', shape: 'circle' } }
  },
  layers: [{ name: 'main', objects: [
    { prefab: 'wall', x: 320, y: 5, width: 640, height: 10 },
    { prefab: 'wall', x: 320, y: 355, width: 640, height: 10 },
    { prefab: 'wall', x: 5, y: 180, width: 10, height: 360 },
    { prefab: 'wall', x: 635, y: 180, width: 10, height: 360 },
    { prefab: 'ball', x: 400, y: 180, width: 28, height: 28 }
  ] }]
};

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, {
    width: 640, height: 360, worldWidth: 640, worldHeight: 360,
    initialScene: 'main', performanceStats: false
  });
  // The camera follows the entity named Player. Bounds the size of the
  // view keep it centred on the one-screen world.
  game.camera.bounds = { left: 0, top: 0, right: 640, bottom: 360 };
  game.registerActor('Ball', Ball);
  game.registerActor('Wall', Wall);

  let status = null;
  game.sceneManager.addScene('main', {
    fetch: async () => scene,
    onEnter() {
      const ui = game.sceneManager.getCurrentScene().ui;
      status = ui.add(new UIText({
        x: -16,
        y: 16,
        text: 'arrow keys or the pad move the ball',
        anchor: 'top-right',
        align: 'right',
        fontSize: '14px',
        color: '#cfd8dc'
      }));
      // A D-pad anchored to the bottom-left corner.
      pads.length = 0;
      for (const [dx, dy, code, label] of [[0, -1, 'ArrowUp', '▲'], [0, 1, 'ArrowDown', '▼'], [-1, 0, 'ArrowLeft', '◀'], [1, 0, 'ArrowRight', '▶']]) {
        pads.push(ui.add(new PadButton(80 + dx * 60, -80 + dy * 60, code, label, { anchor: 'bottom-left' })));
      }
    }
  });

  // A finger that slides off a pad releases somewhere else. Releasing
  // anywhere lets go of every pad, including a cancelled pointer.
  game.input.on('pointerup', () => releaseAll());

  // A long press on a touchscreen stands in for a right click.
  game.input.on('rightclick', (event) => {
    status.text = `${event.pointerType} ${event.type}: teleport`;
    game.player.body.setPosition(event.world);
  });
  game.input.on('pinch', (event) => {
    status.text = `pinch scale ${event.scale.toFixed(2)}, rotation ${(event.rotation * 180 / Math.PI).toFixed(0)}°`;
  });
  game.input.on('pointerdown', (event) => {
    status.text = `${event.pointerType} down at ${Math.round(event.world.x)}, ${Math.round(event.world.y)}`;
  });

  await game.start();
  return game;
}
