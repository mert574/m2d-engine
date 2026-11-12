import { Entity } from 'm2d-engine/core/entity.js';
import { Vec3 } from 'm2d-engine/core/math.js';
import { s } from 'm2d-engine/core/schema.js';

/**
 * The yard's cast, apart from the boot script so the editor (and any
 * headless host) can register the same classes; see game.js.
 */

/**
 * The player: a capsule driven along the ground relative to where the
 * camera looks, wearing the Khronos fox, which turns to face where it goes
 * and surveys, walks or runs by how fast. With the console's `noclip` on,
 * it flies instead: Space climbs, Shift descends, and walls are not there.
 */
class Hero extends Entity {
  name = 'Hero';
  heading = 0;
  footsteps = null;

  // Tuned to twice Earth's gravity in the scene file, as most games run:
  // real falls read as slow motion on a screen.
  static properties = {
    walkSpeed: s.number({ initial: 5.5, positive: true, unit: 'm/s', label: 'Walk speed' }),
    jumpSpeed: s.number({ initial: 7.5, positive: true, unit: 'm/s', label: 'Jump speed' }),
    flySpeed: s.number({ initial: 10, positive: true, unit: 'm/s', label: 'Fly speed', description: 'With the console\'s noclip on' }),
    turnRate: s.number({ initial: 12, positive: true, unit: '1/s', label: 'Turn rate', description: 'How fast the fox turns to face where it goes' }),
    runAbove: s.number({ initial: 4, min: 0, unit: 'm/s', label: 'Runs above' }),
    walkAbove: s.number({ initial: 0.2, min: 0, unit: 'm/s', label: 'Walks above' }),
    clips: s.object({ run: s.string({ initial: 'Run' }), walk: s.string({ initial: 'Walk' }), idle: s.string({ initial: 'Survey' }) }, { description: 'The model\'s clips for each gait' })
  };

  constructor(body, sprite, game, options = {}) {
    super(body, sprite, game);
    this.walkSpeed = options.walkSpeed ?? 5.5;
    this.jumpSpeed = options.jumpSpeed ?? 7.5;
    this.flySpeed = options.flySpeed ?? 10;
    this.turnRate = options.turnRate ?? 12;
    this.runAbove = options.runAbove ?? 4;
    this.walkAbove = options.walkAbove ?? 0.2;
    this.clips = { run: 'Run', walk: 'Walk', idle: 'Survey', ...options.clips };
  }

  update(deltaTime) {
    super.update(deltaTime);
    const v = this.body.velocity;
    const speed = Math.hypot(v.x, v.z);
    this.footsteps?.update(deltaTime, speed, this.isOnGround() && !this.noclip);
    if (speed > this.walkAbove) {
      // The fox's nose points down +z in its file; turn it to the velocity.
      const target = Math.atan2(v.x, v.z);
      let delta = target - this.heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.heading += delta * Math.min(1, deltaTime * this.turnRate);
    }
    const clip = speed > this.runAbove ? this.clips.run : speed > this.walkAbove ? this.clips.walk : this.clips.idle;
    this.animator?.play(clip, { fade: 0.25 });
  }

  fixedUpdate(dt) {
    super.fixedUpdate(dt);
    const input = this.input;
    const camera = this.game.camera;
    const forward = camera.forward;
    const right = camera.right;
    const move = { x: 0, y: 0, z: 0 };
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) Object.assign(move, Vec3.add(move, forward));
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) Object.assign(move, Vec3.subtract(move, forward));
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) Object.assign(move, Vec3.add(move, right));
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) Object.assign(move, Vec3.subtract(move, right));
    const dir = Vec3.normalize(move);
    if (this.noclip) {
      const climb = (input.isDown('Space') ? 1 : 0) - (input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? 1 : 0);
      this.body.setVelocity({ x: dir.x * this.flySpeed, y: climb * this.flySpeed, z: dir.z * this.flySpeed });
      return;
    }
    const v = this.body.velocity;
    const vy = (input.isDown('Space') && this.isOnGround()) ? this.jumpSpeed : v.y;
    this.body.setVelocity({ x: dir.x * this.walkSpeed, y: vy, z: dir.z * this.walkSpeed });
  }
}

class Ground extends Entity { name = 'Ground'; }
class Crate extends Entity { name = 'Crate'; }

export { Hero, Ground, Crate };
