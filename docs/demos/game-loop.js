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
  version: 4, type: 'level', name: 'main',
  world: { gravity: { x: 0, y: 900 } },
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
          game.togglePause();
          pauseButton.text = game.paused ? 'resume' : 'pause';
        },
        ...style,
        anchor: 'bottom'
      }));
      // One simulation tick while paused. Only a custom loop can offer this.
      ui.add(new UIButton({
        x: 0,
        y: -30,
        width: 100,
        height: 36,
        text: 'step',
        onClick: () => {
          if (!game.paused) return;
          game.time.stepOnce(tick);
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
          game.time.scale = game.time.scale === 1 ? 0.2 : 1;
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
          game.pause();
          pauseButton.text = 'resume';
        },
        ...style,
        anchor: 'bottom'
      }));
    },
    // A ball every half second, forty in total. Simulation, so it runs per
    // tick and draws its position from the seeded generator.
    onFixedUpdate(dt) {
      spawnIn -= dt;
      if (spawnIn > 0 || balls.length >= 40) return;
      spawnIn = 0.5;
      const ball = game.createEntity('Block', game.rng.range(120, 520), 20, 24, 24, null, {}, { shape: 'circle', restitution: 0.8 });
      game.entities.add(ball);
      game.physics.add(ball.body);
      balls.push(ball);
    }
  });

  // What start() does, without starting the engine loop.
  await game.sceneManager.switchTo('main');
  game.setupCollisionHandlers();
  game.running = true;

  let last = performance.now();

  // One simulation tick: exactly what the engine loop runs per fixed step
  // (input sample, fixedUpdate, physics step), plus the snapshot the rewind
  // needs. time.tick calls it as many times as a frame paid for; the step
  // button calls it once.
  function tick(dt) {
    const proceed = game.fixedUpdate(dt);
    record();
    return proceed;
  }

  function frame(now) {
    if (game.pendingResize) game.resize();
    game.input.beginFrame(now);

    // The clock clamps the delta (a tab returning from the background does
    // not arrive as one enormous catch-up), spends it in fixed ticks and
    // fires the timers that came due. Rewinding counts as paused: the
    // simulation must not advance while the history plays back.
    const rewinding = rewindLeft > 0;
    game.time.tick((now - last) / 1000, { paused: game.paused || rewinding, step: tick });
    last = now;
    const deltaTime = game.time.unscaledDelta;

    if (rewinding) {
      rewindLeft -= 1;
      if (!rewindStep()) rewindLeft = 0;
    }

    const scene = game.sceneManager.getCurrentScene();
    if (!game.paused && !rewinding) {
      game.camera.update(deltaTime);
      scene.update(game.time.delta);
    }
    game.renderer.clear('#000');
    scene.updateUI(deltaTime);
    game.drawWorld(scene, deltaTime);
    game.drawUI(scene, deltaTime);
    game.motion.update(deltaTime);
    game.ui.update(deltaTime);
    game.drawOverlays(deltaTime);
    readout.text = `frame ${game.time.frame} · tick ${game.time.steps} · time scale ${game.time.scale} · ${history.length} ticks recorded`;

    game.input.endFrame();
    // Kept on the game so destroy() can cancel this loop too.
    game.frameHandle = requestAnimationFrame(frame);
  }
  game.frameHandle = requestAnimationFrame(frame);
  return game;
}
