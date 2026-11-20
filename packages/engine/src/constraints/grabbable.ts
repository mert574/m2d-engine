import { s } from '../core/schema.ts';
import { Interactive } from './interactive.ts';
import type { InteractiveEvent, InteractiveOptions } from './interactive.ts';
import type { Entity } from '../core/entity.ts';

/**
 * Pick a dynamic body up with the pointer, carry it, and fling it.
 *
 * `Interactive` deliberately takes no view on what dragging a body means,
 * because teleporting a static prop, steering a kinematic one and pulling
 * a dynamic one are all correct in different games. This is the answer a
 * game with a physics world wants: the body is *steered* toward the hand
 * rather than placed there, so it still collides on the way and leaves
 * the hand with the speed it was swung at.
 *
 *   crate.addConstraint('grab', new Grabbable(crate, { removable: true }));
 *
 * Steering drives velocity at `stiffness` per second of the distance left,
 * which reaches the hand quickly without the body ever being teleported
 * through a wall. `maxSpeed` caps how fast it may be hauled, for a heavy
 * thing that should not be whipped across the level.
 *
 * `removable` makes a right-click (or a long press on a touch screen)
 * take the body out of the world, which is what a sandbox wants and a
 * game with a level in it usually does not; it is off by default.
 *
 * The body moves in `fixedUpdate`, not when the pointer event arrives, so
 * a grab is part of the simulation and lands on a tick like everything
 * else. Two-dimensional: the hand is where the pointer is on the plane.
 */
export class Grabbable extends Interactive {
  static override description = 'Pick a dynamic body up with the pointer, carry it and fling it';

  static override params: Record<string, import('../core/schema.ts').SchemaDescriptor> = {
    // Everything Interactive takes but `follow`, which this replaces (a
    // grabbed body is steered, never placed), and `draggable`, which is
    // what a grab is.
    ...(({ follow, draggable, ...rest }) => rest)(Interactive.params as Record<string, import('../core/schema.ts').SchemaDescriptor> & { follow: unknown; draggable: unknown }),
    cursor: s.string({ editor: 'cursor', initial: 'grab', description: 'CSS cursor while hovered' }),
    stiffness: s.number({
      initial: 18, positive: true, unit: '1/s',
      description: 'How hard the body is pulled toward the hand: higher is a stiffer grip'
    }),
    maxSpeed: s.number({
      min: 0, initial: 0, unit: 'px/s',
      description: 'The fastest it may be hauled; 0 for no limit'
    }),
    removable: s.boolean({
      initial: false,
      description: 'A right-click or long press takes the body out of the world'
    }),
    removeSound: s.string({
      editor: 'sound',
      description: 'Played when a right-click removes it: a key in assets.sounds'
    })
  };

  stiffness: number;
  maxSpeed: number;
  removable: boolean;
  removeSound: string | null;
  /** Where the hand holds the body, in world coordinates, or null while not held. */
  target: { x: number; y: number } | null;
  /** A right-click asked for this body to go; the next tick does it. */
  removing: boolean;

  /** `options` are `Interactive`'s, minus `follow`, plus the grip's own. */
  constructor(entity: Entity, options: Omit<InteractiveOptions, 'follow'> & { stiffness?: number; maxSpeed?: number; removable?: boolean; removeSound?: string } = {}) {
    super(entity, {
      cursor: 'grab',
      ...options,
      // A grab is a drag that steers: the drag events are wanted, the
      // placing that `follow` does is not.
      follow: false,
      draggable: true
    });

    this.stiffness = options.stiffness ?? 18;
    this.maxSpeed = options.maxSpeed ?? 0;
    this.removable = options.removable ?? false;
    this.removeSound = options.removeSound ?? null;
    this.target = null;
    this.removing = false;
  }

  /** Right-clicking a removable body is handled even with no handler of the game's own. */
  override handles(type: string): boolean {
    if (type === 'rightclick' && this.removable && this.active) return true;
    return super.handles(type);
  }

  override handleInput(event: InteractiveEvent): void {
    // First: a drag start measures `grabOffset` there, and this reads it.
    super.handleInput(event);
    if (!this.active) return;

    switch (event.type) {
      case 'dragstart':
      case 'drag':
        // The offset is measured from the press, so the body does not jump
        // to centre itself under the pointer on the first frame.
        this.target = { x: event.world.x + this.grabOffset.x, y: event.world.y + this.grabOffset.y };
        break;
      case 'dragend':
        // Let go: the last steered velocity is the fling.
        this.target = null;
        break;
      case 'rightclick':
        if (this.removable) this.removing = true;
        break;
    }
  }

  override fixedUpdate(dt: number): void {
    super.fixedUpdate(dt);
    if (this.removing) {
      this.#remove();
      return;
    }
    if (!this.target || this.entity.dead) return;

    const body = this.entity.body;
    let vx = (this.target.x - body.position.x) * this.stiffness;
    let vy = (this.target.y - body.position.y) * this.stiffness;
    if (this.maxSpeed) {
      const speed = Math.hypot(vx, vy);
      if (speed > this.maxSpeed) {
        const scale = this.maxSpeed / speed;
        vx *= scale;
        vy *= scale;
      }
    }
    body.setVelocity({ x: vx, y: vy });
  }

  /** Take the body out of the world, the way every actor's own death does. */
  #remove() {
    this.removing = false;
    const { game } = this.entity;
    if (this.entity.dead) return;
    if (this.removeSound) game.soundManager?.playSound(this.removeSound);
    // Unregisters this constraint from the input router with it.
    game.removeEntity(this.entity);
  }
}
