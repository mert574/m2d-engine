import { Constraint } from '../core/constraint.js';

/**
 * A purely visual idle motion: bob on a sine wave, spin at a constant rate,
 * or both. Writes the entity's render offsets and never the body, so a
 * pickup can breathe without the solver, the queries or the interpolation
 * baseline ever noticing — teleporting the body every frame for decoration
 * made it the one thing on screen that never interpolated.
 *
 * @param {object} options
 * @param {number} [options.amplitude] - Bob height, px. 0 disables the bob.
 * @param {number} [options.frequency] - Bob rate, rad/s of the sine phase.
 * @param {number} [options.spin] - Spin rate, rad/s. 0 disables the spin.
 */
export class Hover extends Constraint {
  constructor(entity, options = {}) {
    super(entity);
    this.amplitude = options.amplitude ?? 5;
    this.frequency = options.frequency ?? 2;
    this.spin = options.spin ?? 0;
    this.phase = 0;
    this.angle = 0;
  }

  update(deltaTime) {
    this.phase += this.frequency * deltaTime;
    this.angle += this.spin * deltaTime;
    this.entity.renderOffset.y = Math.sin(this.phase) * this.amplitude;
    this.entity.renderAngleOffset = this.angle;
  }
}
