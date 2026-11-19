import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { s } from 'm2d-engine/core/schema.js';
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

/**
 * Drops one of the scene's prefabs across its own width on a cadence.
 * Simulation, so it runs per tick and draws its position from the seeded
 * generator; it spawns the prefab, so the ball's body comes from the scene.
 */
class Dropper extends Entity {
  /** Logic nobody sees: slate, in the editor and under r_showtools. */
  static tool = { color: '#94a3b8', label: 'dropper' };
  static properties = {
    prefab: s.ref('prefab', { required: true, description: 'What drops: a prefab of the scene' }),
    every: s.number({ positive: true, initial: 0.5, unit: 's', description: 'Seconds between drops' }),
    limit: s.integer({ min: 0, initial: 40, description: 'How many of them it keeps in the world' }),
    dropSize: s.number({ positive: true, initial: 24, unit: 'px', label: 'Drop size' })
  };

  name = 'Dropper';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.prefab = options.prefab;
    this.every = options.every ?? 0.5;
    this.limit = options.limit ?? 40;
    this.dropSize = options.dropSize ?? 24;
    this.nextIn = 0;
    this.visible = false;
  }

  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    this.nextIn -= dt;
    if (this.nextIn > 0) return;
    const inWorld = [...this.game.entities].filter((entity) => entity.prefab === this.prefab).length;
    if (inWorld >= this.limit) return;
    this.nextIn = this.every;
    const { x, y } = this.position;
    const half = this.size.x / 2;
    this.game.sceneManager.getCurrentScene().spawnPrefab(this.prefab, {
      x: this.game.rng.range(x - half, x + half), y, width: this.dropSize
    });
  }
}

/** The loop's counters, read every frame: UI ticks outside the pause gate. */
class LoopReadout extends UIText {
  constructor(game, recorded, options) {
    super({ ...options, text: '' });
    this.recorded = recorded;
  }

  update(deltaTime) {
    const { time } = this.game;
    this.text = `frame ${time.frame} · tick ${time.steps} · time scale ${time.scale} · ${this.recorded()} ticks recorded`;
    super.update(deltaTime);
  }
}

const BUTTON = { width: 100, height: 36, variant: 'secondary', fontSize: '15px' };

const scene = {
  version: 7, type: 'level', name: 'main',
  world: { width: 640, height: 360, gravity: { x: 0, y: 900 }, camera: { bounds: 'world' } },
  prefabs: {
    wall: { actor: 'Block', physics: { bodyType: 'static', friction: 0.3 } },
    ball: { actor: 'Block', physics: { bodyType: 'dynamic', shape: 'circle', restitution: 0.8 } },
    dropper: { actor: 'Dropper', physics: { bodyType: 'static', isSensor: true } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'floor', prefab: 'wall', x: 320, y: 350, width: 640, height: 20 },
    { id: 'wall-left', prefab: 'wall', x: 10, y: 180, width: 20, height: 360 },
    { id: 'wall-right', prefab: 'wall', x: 630, y: 180, width: 20, height: 360 },
    { id: 'ramp-lower', prefab: 'wall', x: 200, y: 200, width: 200, height: 14, angle: 0.3 },
    { id: 'ramp-upper', prefab: 'wall', x: 440, y: 120, width: 200, height: 14, angle: -0.3 },
    { id: 'dropper', prefab: 'dropper', x: 320, y: 20, width: 400, height: 8, properties: { prefab: 'ball' } }
  ] }],
  // The controls are HUD buttons; their actions land in the scene's onAction.
  hud: [
    { type: 'component', id: 'readout', component: 'loopReadout', anchor: 'top', x: 0, y: 12,
      properties: { align: 'center', fontSize: '14px', color: '#cfd8dc' } },
    { type: 'button', id: 'pause', anchor: 'bottom', x: -165, y: -30, properties: { text: 'pause', action: 'pause', ...BUTTON } },
    { type: 'button', id: 'step', anchor: 'bottom', x: -55, y: -30, properties: { text: 'step', action: 'step', ...BUTTON } },
    { type: 'button', id: 'slow', anchor: 'bottom', x: 55, y: -30, properties: { text: 'slow motion', action: 'slow', ...BUTTON } },
    { type: 'button', id: 'rewind', anchor: 'bottom', x: 165, y: -30, properties: { text: 'rewind 2 s', action: 'rewind', ...BUTTON } }
  ]
};

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, { width: 640, height: 360, initialScene: 'main', performanceStats: false });
  game.registerActor('Block', Block);
  game.registerActor('Dropper', Dropper);

  // Rewinding. After every frame that stepped physics, the position, angle
  // and velocity of each ball are recorded. Rewinding restores one snapshot
  // per frame, newest first, and removes balls that did not exist yet.
  const history = [];
  const HISTORY = 300;                       // five seconds at 60 frames per second
  let rewindLeft = 0;
  const balls = () => [...game.entities].filter((entity) => entity.body.bodyType === 'dynamic');
  function record() {
    history.push(balls().map((ball) => ({
      ball, position: ball.body.position, angle: ball.body.angle, velocity: ball.body.velocity
    })));
    if (history.length > HISTORY) history.shift();
  }
  function rewindStep() {
    const snapshot = history.pop();
    if (!snapshot) return false;
    const alive = new Set(snapshot.map((entry) => entry.ball));
    for (const ball of balls()) {
      if (alive.has(ball)) continue;
      game.removeEntity(ball);
    }
    for (const { ball, position, angle, velocity } of snapshot) {
      ball.body.setPosition(position);
      ball.body.setAngle(angle);
      ball.body.setVelocity(velocity);
    }
    return true;
  }

  game.registerUIComponent('loopReadout', (_scene, element) => new LoopReadout(game, () => history.length, { ...element, ...element.properties }));

  game.sceneManager.addScene('main', {
    fetch: async () => scene,
    onAction(name) {
      const buttons = game.sceneManager.getCurrentScene().hud.elements;
      if (name === 'pause') {
        game.togglePause();
        buttons.get('pause').text = game.paused ? 'resume' : 'pause';
      } else if (name === 'step') {
        // One simulation tick while paused. Only a custom loop can offer this.
        if (game.paused) game.time.stepOnce(tick);
      } else if (name === 'slow') {
        game.time.scale = game.time.scale === 1 ? 0.2 : 1;
      } else if (name === 'rewind') {
        // Play the last two seconds backwards, then stay paused.
        rewindLeft = 120;
        game.pause();
        buttons.get('pause').text = 'resume';
      }
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

    const current = game.sceneManager.getCurrentScene();
    if (!game.paused && !rewinding) {
      game.camera.update(deltaTime);
      current.update(game.time.delta);
    }
    game.renderer.clear('#000');
    current.updateUI(deltaTime);
    game.drawWorld(current, deltaTime);
    game.drawUI(current, deltaTime);
    game.motion.update(deltaTime);
    game.ui.update(deltaTime);
    game.drawOverlays(deltaTime);

    game.input.endFrame();
    // Kept on the game so destroy() can cancel this loop too.
    game.frameHandle = requestAnimationFrame(frame);
  }
  game.frameHandle = requestAnimationFrame(frame);
  return game;
}
