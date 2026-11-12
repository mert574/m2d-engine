import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { Entity } from 'm2d-engine/core/entity.js';

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
  name = 'Walker';
  direction = 1;
  time = 0;

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.speed = options.speed ?? 80;
    this.setAnimation('walk');
  }

  // Where to go is simulation: per tick.
  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    const { x } = this.position;
    if (x > 600) this.direction = -1;
    if (x < 40) this.direction = 1;
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
    width: 640, height: 360, worldWidth: 640, worldHeight: 360,
    initialScene: 'main', performanceStats: false,
    worldFilter: 'nearest'     // keep the pixels square when upscaled
  });
  game.camera.x = 320;
  game.camera.y = 180;
  game.registerActor('Walker', Walker);

  game.sceneManager.addScene('main', {
    fetch: async () => ({
      version: 4, type: 'level', name: 'main',
      world: { gravity: { x: 0, y: 0 } },
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
