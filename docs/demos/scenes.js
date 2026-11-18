import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { s } from 'm2d-engine/core/schema.js';

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

/** A sensor that lights up once reached. A rule sets `reached`; the actor only draws it. */
class Goal extends Entity {
  static properties = {
    reached: s.boolean({ initial: false })
  };

  name = 'Goal';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.reached = options.reached ?? false;
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
  version: 5, type: 'ui', name: 'mainMenu',
  elements: [
    { type: 'rect', id: 'background', fill: true, color: '#1b2a38' },
    { type: 'text', id: 'title', anchor: 'center', x: 0, y: -90,
      properties: { text: 'Scenes', fontSize: '40px', align: 'center', color: '#ffffff' } },
    { type: 'button', id: 'start', anchor: 'center', x: 0, y: -10,
      properties: { text: 'Start level', onClick: 'level', width: 200, height: 44,
        fontSize: '18px', variant: 'primary' } },
    { type: 'button', id: 'about', anchor: 'center', x: 0, y: 46,
      properties: { text: 'About', action: 'about', width: 200, height: 44,
        fontSize: '18px', variant: 'secondary' } },
    // Code writes the last action here, through the scene's elements by id.
    { type: 'text', id: 'status', anchor: 'center', x: 0, y: 110,
      properties: { text: '', fontSize: '16px', align: 'center', color: '#9fb6d0' } }
  ]
};

// A level scene: prefabs placed in layers. The ball rolls down the ramp
// into the goal. What happens then is a rule, and the way back is a
// button in the HUD: the level needs no hooks at all.
const level = {
  version: 5, type: 'level', name: 'level',
  world: {
    width: 640, height: 360, gravity: { x: 0, y: 900 }, player: 'ball', camera: { bounds: 'world' },
    rules: [
      { when: { event: 'enter', object: 'goal' }, then: [
        { do: 'set', object: 'goal', property: 'reached', value: true },
        { do: 'switch', scene: 'mainMenu', after: 1.5 }
      ] }
    ]
  },
  prefabs: {
    wall: { actor: 'Block', physics: { bodyType: 'static', friction: 0.4 } },
    ball: { actor: 'Block', physics: { bodyType: 'dynamic', shape: 'circle', friction: 0.4 } },
    goal: { actor: 'Goal', physics: { bodyType: 'static', isSensor: true } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'floor', prefab: 'wall', x: 320, y: 350, width: 640, height: 20 },
    { id: 'wall-right', prefab: 'wall', x: 634, y: 180, width: 12, height: 360 },
    { id: 'ramp-upper', prefab: 'wall', x: 200, y: 160, width: 360, height: 16, angle: 0.35 },
    { id: 'ramp-lower', prefab: 'wall', x: 440, y: 290, width: 200, height: 16, angle: -0.25 },
    { id: 'ball', prefab: 'ball', x: 60, y: 80, width: 28, height: 28 },
    { id: 'goal', prefab: 'goal', x: 600, y: 324, width: 48, height: 32 }
  ] }],
  hud: [
    { type: 'button', id: 'menu', anchor: 'top-right', x: -76, y: 34,
      properties: { text: 'Menu', onClick: 'mainMenu', width: 120, height: 36, background: '#37474f' } }
  ]
};

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, {
    width: 640, height: 360, initialScene: 'mainMenu', performanceStats: false
  });
  game.registerActor('Block', Block);
  game.registerActor('Goal', Goal);

  game.sceneManager.addScene('mainMenu', {
    fetch: async () => menu,
    // A button with "action": "about" lands here. A mounted SettingsMenu would
    // take "settings" first; this demo has none.
    onAction(name) {
      game.sceneManager.getCurrentScene().uiById.get('status').text = `action "${name}" received by onAction`;
    }
  });
  game.sceneManager.addScene('level', { fetch: async () => level });

  await game.start();
  return game;
}
