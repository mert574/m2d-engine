import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { UIButton } from 'm2d-engine/core/ui/button.js';
import { UIText } from 'm2d-engine/core/ui/text.js';

class Block extends Entity {
  name = 'Block';

  draw() {
    const { x, y } = this.renderPosition;
    const renderer = this.game.renderer;
    if (this.body.shape === 'circle') {
      renderer.drawArc({ x, y, radius: this.size.x / 2, fillStyle: '#ffa726' });
      return;
    }
    renderer.pushTransform({ x, y, rotation: this.renderAngle });
    renderer.drawRect({ x: -this.size.x / 2, y: -this.size.y / 2, width: this.size.x, height: this.size.y, fillStyle: '#78909c' });
    renderer.popTransform();
  }
}

/** A sensor. When the ball reaches it, the level reports success. */
class Goal extends Entity {
  name = 'Goal';
  reached = false;

  onCollisionStart(other) {
    super.onCollisionStart(other);
    if (other.entity?.name === 'Block') this.reached = true;
  }

  draw() {
    const { x, y } = this.renderPosition;
    this.game.renderer.drawRect({
      x: x - this.size.x / 2, y: y - this.size.y / 2, width: this.size.x, height: this.size.y,
      fillStyle: this.reached ? '#66bb6a' : '#2e7d32', cornerRadius: 4
    });
  }
}

// A UI scene: screen-space elements, positioned against anchors.
const menu = {
  version: 1, type: 'ui', name: 'mainMenu',
  elements: [
    { type: 'rect', id: 'background', fill: true, color: '#1b2a38' },
    { type: 'text', id: 'title', anchor: 'center', x: 0, y: -90,
      properties: { text: 'Scenes', fontSize: '40px', align: 'center', color: '#ffffff' } },
    { type: 'button', id: 'start', anchor: 'center', x: 0, y: -10,
      properties: { text: 'Start level', onClick: 'level', width: 200, height: 44,
        fontSize: '18px', variant: 'primary' } },
    { type: 'button', id: 'about', anchor: 'center', x: 0, y: 46,
      properties: { text: 'About', action: 'about', width: 200, height: 44,
        fontSize: '18px', variant: 'secondary' } }
  ]
};

// A level scene: prefabs placed in layers. The ball rolls down the ramp
// into the goal.
const level = {
  version: 1, type: 'level', name: 'level',
  world: { gravity: { x: 0, y: 900 } },
  prefabs: {
    wall: { actor: 'Block', physics: { bodyType: 'static', friction: 0.4 } },
    ball: { actor: 'Block', physics: { bodyType: 'dynamic', shape: 'circle', friction: 0.4 } },
    goal: { actor: 'Goal', physics: { bodyType: 'static', isSensor: true } }
  },
  layers: [{ name: 'main', objects: [
    { prefab: 'wall', x: 320, y: 350, width: 640, height: 20 },
    { prefab: 'wall', x: 200, y: 160, width: 360, height: 16, angle: 0.35 },
    { prefab: 'wall', x: 440, y: 290, width: 200, height: 16, angle: -0.25 },
    { prefab: 'ball', x: 60, y: 80, width: 28, height: 28 },
    { prefab: 'goal', x: 600, y: 324, width: 48, height: 32 }
  ] }]
};

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, {
    width: 640, height: 360, initialScene: 'mainMenu', performanceStats: false
  });
  game.camera.x = 320;
  game.camera.y = 180;
  game.registerActor('Block', Block);
  game.registerActor('Goal', Goal);

  let status = null;
  game.sceneManager.addScene('mainMenu', {
    fetch: async () => menu,
    onEnter() {
      // Elements can also be added from code. This one shows the last action.
      const ui = game.sceneManager.getCurrentScene().ui;
      status = ui.add(new UIText({
        x: 0,
        y: 110,
        text: '',
        anchor: 'center',
        align: 'center',
        fontSize: '16px',
        color: '#9fb6d0'
      }));
    },
    // A button with "action": "about" lands here. A mounted SettingsMenu would
    // take "settings" first; this demo has none.
    onAction(name) {
      status.text = `action "${name}" received by onAction`;
    }
  });

  let goal = null;
  let doneFor = 0;
  game.sceneManager.addScene('level', {
    fetch: async () => level,
    onEnter() {
      goal = [...game.entities].find((entity) => entity.name === 'Goal');
      doneFor = 0;
      const ui = game.sceneManager.getCurrentScene().ui;
      // Buttons are centred on their position, so offset by half the size.
      ui.add(new UIButton({
        x: -76,
        y: 34,
        width: 120,
        height: 36,
        text: 'Menu',
        onClick: () => game.sceneManager.switchTo('mainMenu'),
        anchor: 'top-right',
        background: '#37474f'
      }));
    },
    // Scene-level logic that is not an entity. Switch back once the goal is reached.
    onFixedUpdate(dt) {
      if (!goal?.reached) return;
      doneFor += dt;
      if (doneFor > 1.5) game.sceneManager.switchTo('mainMenu');
    }
  });

  await game.start();
  return game;
}
