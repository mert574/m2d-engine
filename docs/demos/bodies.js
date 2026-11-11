import { M2D } from 'm2d-engine/core/m2d.js';
import { initPhysics } from 'm2d-engine/core/physics/index.js';
import { Entity } from 'm2d-engine/core/entity.js';
import { PathFollow } from 'm2d-engine/constraints/pathFollow.js';

const COLORS = {
  static: '#78909c',
  dynamic: '#ffa726',
  kinematic: '#29b6f6',
  character: '#9ccc65'
};

/** Draws its body as a flat shape in the color of its body type. */
class Block extends Entity {
  name = 'Block';

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.label = options.label ?? '';
    this.labelBelow = options.labelBelow ?? false;
    if (options.path) {
      this.addConstraint('path', new PathFollow(this, options.path));
    }
  }

  draw() {
    const { x, y } = this.renderPosition;
    const renderer = this.game.renderer;
    const fillStyle = COLORS[this.body.bodyType];

    if (this.body.shape === 'circle') {
      renderer.drawArc({ x, y, radius: this.size.x / 2, fillStyle });
    } else {
      renderer.pushTransform({ x, y, rotation: this.renderAngle });
      renderer.drawRect({
        x: -this.size.x / 2, y: -this.size.y / 2,
        width: this.size.x, height: this.size.y,
        fillStyle, cornerRadius: this.body.shape === 'capsule' ? this.size.x / 2 : 2
      });
      renderer.popTransform();
    }

    if (this.label) {
      this.game.worldOverlay.drawText({
        x, y, offsetY: this.labelBelow ? this.size.y / 2 + 4 : -this.size.y / 2 - 16,
        text: this.label, fillStyle: '#eceff1',
        fontSize: '12px', textAlign: 'center'
      });
    }
  }
}

/** A character body that walks until something stops it, then turns around. */
class Walker extends Block {
  name = 'Walker';
  direction = 1;
  speed = 90;
  stuckFor = 0;

  // Movement decisions are simulation, so they run per tick with the
  // fixed dt and come out the same at every frame rate.
  fixedUpdate(dt) {
    super.fixedUpdate(dt);

    // Contact normals point from this body toward the other one, so a wall
    // ahead gives a normal pointing along the walk direction.
    const wall = this.game.physics
      .surfacesWith(this.body, (other) => other.bodyType === 'static')
      .some(({ normal }) => normal.x * this.direction > 0.5);
    // Dynamic boxes get shoved instead, until they pile up and stop it.
    const velocity = this.body.velocity;
    this.stuckFor = Math.abs(velocity.x) < this.speed / 3 ? this.stuckFor + dt : 0;

    // Turn at a wall, when pushing has stalled, or at the ends of the patrol.
    const { x } = this.position;
    const atEnd = (this.direction > 0 && x > 560) || (this.direction < 0 && x < 80);
    if (wall || atEnd || this.stuckFor > 0.4) {
      this.direction = -this.direction;
      this.stuckFor = 0;
    }
    this.body.setVelocity({ x: this.direction * this.speed, y: velocity.y });
  }
}

const SCENE = {
  version: 3, name: 'bodies', type: 'level',
  world: { gravity: { x: 0, y: 1000 } },
  prefabs: {
    wall: { actor: 'Block', physics: { bodyType: 'static', friction: 0.6 } },
    box: { actor: 'Block', physics: { bodyType: 'dynamic', friction: 0.6 } },
    ball: { actor: 'Block', physics: { bodyType: 'dynamic', shape: 'circle', restitution: 0.5 } },
    platform: { actor: 'Block', physics: { bodyType: 'kinematic', friction: 1 } },
    walker: { actor: 'Walker', physics: { bodyType: 'character', shape: 'capsule' } }
  },
  layers: [{ name: 'main', objects: [
    { id: 'floor', prefab: 'wall', x: 320, y: 350, width: 640, height: 20 },
    { id: 'wall-left', prefab: 'wall', x: 10, y: 180, width: 20, height: 360 },
    { id: 'wall-right', prefab: 'wall', x: 630, y: 180, width: 20, height: 360 },
    { id: 'ramp', prefab: 'wall', x: 110, y: 250, width: 150, height: 14, angle: 0.4, properties: { label: 'static' } },
    { id: 'ball', prefab: 'ball', x: 70, y: 180, width: 24, height: 24, properties: { label: 'dynamic' } },
    { id: 'stack-1', prefab: 'box', x: 330, y: 324, width: 32, height: 32 },
    { id: 'stack-2', prefab: 'box', x: 330, y: 292, width: 32, height: 32 },
    { id: 'stack-3', prefab: 'box', x: 330, y: 260, width: 32, height: 32, properties: { label: 'dynamic' } },
    { id: 'platform', prefab: 'platform', x: 450, y: 200, width: 120, height: 14, properties: {
      label: 'kinematic', labelBelow: true,
      path: { points: [{ x: 450, y: 200 }, { x: 540, y: 120 }], speed: 80, waitTime: 800 }
    } },
    { id: 'rider', prefab: 'box', x: 450, y: 176, width: 28, height: 28 },
    { id: 'walker', prefab: 'walker', x: 200, y: 318, width: 22, height: 44, properties: { label: 'character' } }
  ] }]
};

export default async function start(canvas) {
  await initPhysics();

  const game = new M2D(canvas, {
    width: 640, height: 360,
    worldWidth: 640, worldHeight: 360,
    initialScene: 'bodies',
    performanceStats: false
  });
  game.camera.x = 320;
  game.camera.y = 180;

  game.registerActor('Block', Block);
  game.registerActor('Walker', Walker);
  game.sceneManager.addScene('bodies', { fetch: async () => SCENE });

  // Click anywhere to drop a ball at the pointer's world position.
  const balls = [];
  game.input.on('click', (event) => {
    const ball = game.createEntity({
      type: 'Block', x: event.world.x, y: event.world.y, width: 20, height: 20,
      physics: { bodyType: 'dynamic', shape: 'circle', restitution: 0.5 }
    });
    game.entities.add(ball);
    game.physics.add(ball.body);
    balls.push(ball);
    if (balls.length > 150) {
      const oldest = balls.shift();
      game.entities.delete(oldest);
      game.physics.remove(oldest.body);
    }
  });

  await game.start();
  return game;
}
