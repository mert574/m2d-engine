import { Entity } from 'm2d-engine/core/entity.js';
import { Vec3 } from 'm2d-engine/core/math.js';

/**
 * The yard's cast, apart from the boot script so the editor (and any
 * headless host) can register the same classes; see game.js.
 */

// Twice Earth's gravity in the scene file, as most games run: real falls
// read as slow motion on a screen. The hero's numbers are tuned to it.
const WALK_SPEED = 5.5;
const JUMP_SPEED = 7.5;
const FLY_SPEED = 10;

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

  update(deltaTime) {
    super.update(deltaTime);
    const v = this.body.velocity;
    const speed = Math.hypot(v.x, v.z);
    this.footsteps?.update(deltaTime, speed, this.isOnGround() && !this.noclip);
    if (speed > 0.2) {
      // The fox's nose points down +z in its file; turn it to the velocity.
      const target = Math.atan2(v.x, v.z);
      let delta = target - this.heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.heading += delta * Math.min(1, deltaTime * 12);
    }
    const clip = speed > 4 ? 'Run' : speed > 0.2 ? 'Walk' : 'Survey';
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
      this.body.setVelocity({ x: dir.x * FLY_SPEED, y: climb * FLY_SPEED, z: dir.z * FLY_SPEED });
      return;
    }
    const v = this.body.velocity;
    const vy = (input.isDown('Space') && this.isOnGround()) ? JUMP_SPEED : v.y;
    this.body.setVelocity({ x: dir.x * WALK_SPEED, y: vy, z: dir.z * WALK_SPEED });
  }
}

class Ground extends Entity { name = 'Ground'; }
class Crate extends Entity { name = 'Crate'; }

export { Hero, Ground, Crate };
