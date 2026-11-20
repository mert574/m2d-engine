import { Constraint, type Entity } from 'm2d-engine';

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
  static override description = 'No surface friction while airborne, so a body slides off walls instead of sticking';
  static override params = {};

  /**
   * The entity it is attached to. The engine's `Constraint` says nothing
   * of its type; every kit constraint narrows it to the entity it works
   * on, so the rest of the file is checked.
   */
  declare entity: Entity;

  /** The friction the body was configured with; what grounded restores. */
  groundFriction: number;

  constructor(entity: Entity) {
    super(entity);
    this.groundFriction = entity.body.friction;
  }

  override fixedUpdate(): void {
    const { body } = this.entity;
    const friction = this.entity.isOnGround() ? this.groundFriction : 0;
    if (body.friction !== friction) body.friction = friction;
  }
}
