import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { s } from 'm2d-engine/core/schema.js';
import { UIText } from 'm2d-engine/core/ui/text.js';

class Block extends Entity {
  static properties = {
    color: s.string({ editor: 'color', initial: '#ffa726', label: 'Colour' })
  };

  name = 'Block';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.color = options.color ?? '#ffa726';
  }

  draw() {
    const { x, y } = this.renderPosition;
    const renderer = this.game.renderer;
    if (this.body.shape === 'circle') {
      renderer.drawArc({ x, y, radius: this.size.x / 2, fillStyle: this.color });
      return;
    }
    renderer.pushTransform({ x, y, rotation: this.renderAngle });
    renderer.drawRect({ x: -this.size.x / 2, y: -this.size.y / 2, width: this.size.x, height: this.size.y, fillStyle: '#78909c' });
    renderer.popTransform();
  }
}

/** Reads the clocks every frame, paused or not: UI ticks outside the pause gate. */
class ClockReadout extends UIText {
  update(deltaTime) {
    const { time } = this.game;
    this.text = `game ${time.elapsed.toFixed(1)} s · wall ${time.unscaledElapsed.toFixed(1)} s`
      + ` · frame ${time.frame} · tick ${time.steps} · scale ${time.scale}`
      + (this.game.paused ? ' · paused' : '');
    super.update(deltaTime);
  }
}

const BUTTON = { width: 118, height: 36, variant: 'secondary', fontSize: '15px' };

const scene = {
  version: 6, type: 'level', name: 'main',
  world: { width: 640, height: 360, gravity: { x: 0, y: 900 }, camera: { bounds: 'world' } },
  prefabs: {
    wall: { actor: 'Block', physics: { bodyType: 'static', friction: 0.3 } },
    ball: { actor: 'Block', physics: { bodyType: 'dynamic', shape: 'circle', restitution: 0.8 } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'floor', prefab: 'wall', x: 320, y: 350, width: 640, height: 20 },
    { id: 'wall-left', prefab: 'wall', x: 10, y: 180, width: 20, height: 360 },
    { id: 'wall-right', prefab: 'wall', x: 630, y: 180, width: 20, height: 360 },
    { id: 'ramp-lower', prefab: 'wall', x: 200, y: 200, width: 200, height: 14, angle: 0.3 },
    { id: 'ramp-upper', prefab: 'wall', x: 440, y: 120, width: 200, height: 14, angle: -0.3 }
  ] }],
  hud: [
    { type: 'component', id: 'clocks', component: 'clockReadout', anchor: 'top', x: 0, y: 12,
      properties: { align: 'center', fontSize: '14px', color: '#cfd8dc' } },
    { type: 'text', id: 'banner', anchor: 'top', x: 0, y: 40, properties: { text: '', align: 'center', fontSize: '16px', color: '#ffd54f' } },
    { type: 'button', id: 'pause', anchor: 'bottom', x: -195, y: -30, properties: { text: 'pause', action: 'pause', ...BUTTON } },
    { type: 'button', id: 'slow', anchor: 'bottom', x: -65, y: -30, properties: { text: 'slow motion', action: 'slow', ...BUTTON } },
    { type: 'button', id: 'burst', anchor: 'bottom', x: 65, y: -30, properties: { text: 'burst in 2 s', action: 'burst', ...BUTTON } },
    { type: 'button', id: 'toast', anchor: 'bottom', x: 195, y: -30, properties: { text: 'toast', action: 'toast', ...BUTTON } }
  ]
};

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, { width: 640, height: 360, initialScene: 'main', performanceStats: false });
  game.registerActor('Block', Block);
  game.registerUIComponent('clockReadout', (_scene, element) => new ClockReadout({ ...element, ...element.properties, text: '' }));

  const balls = [];
  function drop(color) {
    const current = game.sceneManager.getCurrentScene();
    balls.push(current.spawnPrefab('ball', { x: game.rng.range(120, 520), y: 20, width: 24, properties: { color } }));
    if (balls.length > 60) {
      const oldest = balls.shift();
      game.removeEntity(oldest);
    }
  }

  let hide = null;
  game.sceneManager.addScene('main', {
    fetch: async () => scene,
    onEnter() {
      balls.length = 0;
      // Game time: a ball every 0.6 s. Freezes with pause, stretches in slow motion.
      game.time.every(0.6, () => drop('#ffa726'));
    },
    onAction(name) {
      const hud = game.sceneManager.getCurrentScene().hud;
      if (name === 'pause') {
        game.togglePause();
        hud.elements.get('pause').text = game.paused ? 'resume' : 'pause';
      } else if (name === 'slow') {
        game.time.scale = game.time.scale === 1 ? 0.25 : 1;
      } else if (name === 'burst') {
        // A one-shot on game time. Pause before it fires and it waits.
        game.time.after(2, () => { for (let i = 0; i < 8; i++) drop('#4fc3f7'); });
      } else if (name === 'toast') {
        // Wall time: a message that goes away after 1.5 s even while paused.
        hud.setText('banner', 'This toast runs on wall time');
        hide?.cancel();
        hide = game.time.after(1.5, () => hud.setText('banner', ''), { unscaled: true });
      }
    }
  });

  await game.start();
  return game;
}
