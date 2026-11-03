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
      renderer.drawArc({ x, y, radius: this.size.x / 2, fillStyle: this.color ?? '#ffa726' });
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

const scene = {
  version: 1, type: 'level', name: 'main',
  world: { gravity: { x: 0, y: 900 } },
  prefabs: {
    wall: { actor: 'Block', physics: { bodyType: 'static', friction: 0.3 } }
  },
  layers: [{ name: 'main', objects: [
    { prefab: 'wall', x: 320, y: 350, width: 640, height: 20 },
    { prefab: 'wall', x: 10, y: 180, width: 20, height: 360 },
    { prefab: 'wall', x: 630, y: 180, width: 20, height: 360 },
    { prefab: 'wall', x: 200, y: 200, width: 200, height: 14, angle: 0.3 },
    { prefab: 'wall', x: 440, y: 120, width: 200, height: 14, angle: -0.3 }
  ] }]
};

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, { width: 640, height: 360, initialScene: 'main', performanceStats: false });
  game.camera.x = 320;
  game.camera.y = 180;
  game.registerActor('Block', Block);

  const balls = [];
  function drop(color) {
    const ball = game.createEntity('Block', game.rng.range(120, 520), 20, 24, 24, null, {}, { shape: 'circle', restitution: 0.8 });
    ball.color = color;
    game.entities.add(ball);
    game.physics.add(ball.body);
    balls.push(ball);
    if (balls.length > 60) {
      const oldest = balls.shift();
      game.entities.delete(oldest);
      game.physics.remove(oldest.body);
    }
  }

  game.sceneManager.addScene('main', {
    fetch: async () => scene,
    onEnter() {
      const ui = game.sceneManager.getCurrentScene().ui;
      const style = { variant: 'secondary', fontSize: '15px', width: 118, height: 36, anchor: 'bottom', y: -30 };

      ui.add(new ClockReadout({ x: 0, y: 12, text: '', anchor: 'top', align: 'center', fontSize: '14px', color: '#cfd8dc' }));
      const banner = ui.add(new UIText({ x: 0, y: 40, text: '', anchor: 'top', align: 'center', fontSize: '16px', color: '#ffd54f' }));

      // Game time: a ball every 0.6 s. Freezes with pause, stretches in slow motion.
      game.time.every(0.6, () => drop('#ffa726'));

      const pauseButton = ui.add(new UIButton({
        x: -195, text: 'pause', ...style,
        onClick: () => {
          game.togglePause();
          pauseButton.text = game.paused ? 'resume' : 'pause';
        }
      }));

      ui.add(new UIButton({
        x: -65, text: 'slow motion', ...style,
        onClick: () => { game.time.scale = game.time.scale === 1 ? 0.25 : 1; }
      }));

      // A one-shot on game time. Pause before it fires and it waits.
      ui.add(new UIButton({
        x: 65, text: 'burst in 2 s', ...style,
        onClick: () => {
          game.time.after(2, () => { for (let i = 0; i < 8; i++) drop('#4fc3f7'); });
        }
      }));

      // Wall time: a message that goes away after 1.5 s even while paused.
      let hide = null;
      ui.add(new UIButton({
        x: 195, text: 'toast', ...style,
        onClick: () => {
          banner.text = 'This toast runs on wall time';
          hide?.cancel();
          hide = game.time.after(1.5, () => { banner.text = ''; }, { unscaled: true });
        }
      }));
    }
  });

  await game.start();
  return game;
}
