import { Constraint } from '../core/constraint.js';

/**
 * Zeroes the body's surface friction while airborne, restoring it on the
 * ground.
 *
 * A high-friction player needs that friction on the floor — it is what
 * tumbling locomotion and stopping are made of — but against a wall it
 * turns into glue: holding a direction presses the body into the wall, the
 * normal force makes friction, and friction against a vertical surface
 * carries weight. Measured on a 32px box at friction 5: falling 9px/s while
 * pressed to a wall instead of free-falling. In the air nothing legitimate
 * is lost, because friction only ever acts through contacts.
 */
export class WallSlip extends Constraint {
  constructor(entity) {
    super(entity);
    /** The friction the body was configured with; what grounded restores. */
    this.groundFriction = entity.body.friction;
  }

  update() {
    const { body } = this.entity;
    const friction = this.entity.isOnGround() ? this.groundFriction : 0;
    if (body.friction !== friction) body.friction = friction;
  }
}
