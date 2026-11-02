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

const scene = {
  version: 1, type: 'level', name: 'main',
  world: { gravity: { x: 0, y: 900 } },
  prefabs: {
    wall: { actor: 'Block', physics: { bodyType: 'static', friction: 0.3 } },
    ball: { actor: 'Block', physics: { bodyType: 'dynamic', shape: 'circle', restitution: 0.8 } }
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

  let readout = null;
  let pauseButton = null;
  let spawnIn = 0;
  const balls = [];

  // Rewinding. After every frame that stepped physics, the position, angle
  // and velocity of each ball are recorded. Rewinding restores one snapshot
  // per frame, newest first, and removes balls that did not exist yet.
  const history = [];
  const HISTORY = 300;                       // five seconds at 60 frames per second
  let rewindLeft = 0;
  function record() {
    history.push(balls.map((ball) => ({
      ball, position: ball.body.position, angle: ball.body.angle, velocity: ball.body.velocity
    })));
    if (history.length > HISTORY) history.shift();
  }
  function rewindStep() {
    const snapshot = history.pop();
    if (!snapshot) return false;
    const alive = new Set(snapshot.map((entry) => entry.ball));
    for (const ball of [...balls]) {
      if (alive.has(ball)) continue;
      game.entities.delete(ball);
      game.physics.remove(ball.body);
      balls.splice(balls.indexOf(ball), 1);
    }
    for (const { ball, position, angle, velocity } of snapshot) {
      ball.body.setPosition(position);
      ball.body.setAngle(angle);
      ball.body.setVelocity(velocity);
    }
    return true;
  }
  game.sceneManager.addScene('main', {
    fetch: async () => scene,
    onEnter() {
      const ui = game.sceneManager.getCurrentScene().ui;
      const style = { variant: 'secondary', fontSize: '15px' };
      readout = ui.add(new UIText({
        x: 0,
        y: 12,
        text: '',
        anchor: 'top',
        align: 'center',
        fontSize: '14px',
        color: '#cfd8dc'
      }));
      pauseButton = ui.add(new UIButton({
        x: -110,
        y: -30,
        width: 100,
        height: 36,
        text: 'pause',
        onClick: () => {
          game.paused = !game.paused;
          pauseButton.text = game.paused ? 'resume' : 'pause';
        },
        ...style,
        anchor: 'bottom'
      }));
      // One physics step while paused. Only a custom loop can offer this.
      ui.add(new UIButton({
        x: 0,
        y: -30,
        width: 100,
        height: 36,
        text: 'step',
        onClick: () => {
          if (!game.paused) return;
          simulate(game.physics.fixedTimestep, true);
        },
        ...style,
        anchor: 'bottom'
      }));
      ui.add(new UIButton({
        x: 110,
        y: -30,
        width: 100,
        height: 36,
        text: 'slow motion',
        onClick: () => {
          game.physics.timeScale = game.physics.timeScale === 1 ? 0.2 : 1;
        },
        ...style,
        anchor: 'bottom'
      }));
      // Play the last two seconds backwards, then stay paused.
      ui.add(new UIButton({
        x: 220,
        y: -30,
        width: 100,
        height: 36,
        text: 'rewind 2 s',
        onClick: () => {
          rewindLeft = 120;
          game.paused = true;
          pauseButton.text = 'resume';
        },
        ...style,
        anchor: 'bottom'
      }));
    },
    // A ball every half second, forty in total.
    onUpdate(deltaTime) {
      spawnIn -= deltaTime;
      if (spawnIn > 0 || balls.length >= 40) return;
      spawnIn = 0.5;
      const ball = game.createEntity('Block', 120 + Math.random() * 400, 20, 24, 24, null, {}, { shape: 'circle', restitution: 0.8 });
      game.entities.add(ball);
      game.physics.add(ball.body);
      balls.push(ball);
    }
  });

  // What start() does, without starting the engine loop.
  await game.sceneManager.switchTo('main');
  game.setupCollisionHandlers();
  game.running = true;

  let frames = 0;
  let stepsTaken = 0;
  let last = performance.now();

  function simulate(deltaTime, single = false) {
    const scene = game.sceneManager.getCurrentScene();
    // advance() spends real time in fixed steps. step() runs exactly one.
    if (single) { game.physics.step(deltaTime); stepsTaken += 1; record(); }
    else {
      // advance() may run several steps or none.
      const steps = game.physics.advance(deltaTime);
      stepsTaken += steps;
      if (steps > 0) record();
    }
    game.camera.update();
    scene.update(deltaTime);
  }

  function frame(now) {
    if (game.pendingResize) game.resize();
    game.input.beginFrame(now);

    const deltaTime = Math.min((now - last) / 1000, 0.1);
    last = now;
    frames += 1;

    if (rewindLeft > 0) {
      rewindLeft -= 1;
      if (!rewindStep()) rewindLeft = 0;
    } else if (!game.paused) {
      simulate(deltaTime);
    }

    const scene = game.sceneManager.getCurrentScene();
    game.renderer.clear('#000');
    game.drawWorld(scene);
    game.drawUI(scene);
    game.drawOverlays();
    readout.text = `frame ${frames} · physics steps ${stepsTaken} · time scale ${game.physics.timeScale} · ${history.length} frames recorded`;

    game.input.endFrame();
    // Kept on the game so destroy() can cancel this loop too.
    game.frameHandle = requestAnimationFrame(frame);
  }
  game.frameHandle = requestAnimationFrame(frame);
  return game;
}
