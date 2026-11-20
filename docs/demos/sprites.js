import { M2D, Entity } from 'm2d-engine';
import { initPhysics } from 'm2d-engine/physics';
import { s } from 'm2d-engine/schema';

const FRAME = 32;

/** Draws a four-frame walk cycle into a canvas and returns it as a data URL. */
function makeWalkerSheet() {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME * 4;
  canvas.height = FRAME;
  const ctx = canvas.getContext('2d');
  for (let frame = 0; frame < 4; frame++) {
    const x = frame * FRAME;
    const swing = [0, 6, 0, -6][frame];
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(x + 11 - swing / 2, 22, 4, 10);   // legs
    ctx.fillRect(x + 17 + swing / 2, 22, 4, 10);
    ctx.fillStyle = '#ff7043';
    ctx.fillRect(x + 8, 8, 16, 16);                // body
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 18, 12, 4, 4);                // eye, facing right
  }
  return canvas.toDataURL();
}

/** One ground tile. */
function makeTile() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = FRAME;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1e2a33';
  ctx.fillRect(0, 0, FRAME, FRAME);
  ctx.fillStyle = '#24323d';
  ctx.fillRect(0, 0, FRAME / 2, FRAME / 2);
  ctx.fillRect(FRAME / 2, FRAME / 2, FRAME / 2, FRAME / 2);
  return canvas.toDataURL();
}

/** Walks back and forth, stepping its frames and flipping to face the way it goes. */
class Walker extends Entity {
  static properties = {
    speed: s.number({ positive: true, initial: 80, unit: 'px/s' }),
    patrol: s.object({ left: s.number({ initial: 40 }), right: s.number({ initial: 600 }) }, { description: 'Where it turns back, in x' })
  };

  name = 'Walker';
  direction = 1;
  time = 0;

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.speed = options.speed ?? 80;
    this.patrol = { left: 40, right: 600, ...options.patrol };
    this.setAnimation('walk');
  }

  // Where to go is simulation: per tick.
  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    const { x } = this.position;
    if (x > this.patrol.right) this.direction = -1;
    if (x < this.patrol.left) this.direction = 1;
    this.body.setVelocity({ x: this.direction * this.speed, y: 0 });
  }

  // Which frame to show is presentation: per frame, on the game-time delta
  // so it slows down with the walker in slow motion.
  update(deltaTime) {
    super.update(deltaTime);
    // Advance the walk cycle at 8 frames per second.
    this.time += deltaTime * 8;
    this.sprite.currentFrame = Math.floor(this.time) % 4;
  }

  draw() {
    const { x, y } = this.renderPosition;
    this.sprite.draw(this.currentAnim, x, y, { width: this.size.x, height: this.size.y, flipX: this.direction < 0 });
  }
}

export default async function start(canvas) {
  await initPhysics();
  const game = new M2D(canvas, {
    width: 640, height: 360, initialScene: 'main', performanceStats: false,
    worldFilter: 'nearest'     // keep the pixels square when upscaled
  });
  game.registerActor('Walker', Walker);

  game.sceneManager.addScene('main', {
    fetch: async () => ({
      version: 7, type: 'level', name: 'main',
      // The world's size is what the background tiles across.
      world: { width: 640, height: 360, gravity: { x: 0, y: 0 }, camera: { bounds: 'world' } },
      assets: { spritesheets: {
        walker: { url: makeWalkerSheet(), frameWidth: FRAME, frameHeight: FRAME, animations: { walk: { frames: [[0, 0]] } } },
        ground: { url: makeTile(), frameWidth: FRAME, frameHeight: FRAME }
      } },
      background: { spritesheet: 'ground' },
      prefabs: { walker: { actor: 'Walker', spritesheet: 'walker', physics: { bodyType: 'kinematic' } } },
      layers: [{ name: 'main', objects: [
        { id: 'walker', prefab: 'walker', x: 100, y: 180, width: 96, height: 96, properties: { speed: 90 } }
      ] }]
    })
  });

  await game.start();
  return game;
}
