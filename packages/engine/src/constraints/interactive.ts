import { Constraint } from '../core/constraint.ts';
import type { Entity } from '../core/entity.ts';
import { s } from '../core/schema.ts';
import type { SchemaDescriptor } from '../core/schema.ts';

/** The hit shapes an interactive entity can declare. */
export type HitArea = 'body' | { width: number; height: number } | { radius: number };

/**
 * A routed pointer event as the input router delivers it; the full shape
 * is the input manager's (core/input, still JavaScript this phase).
 */
export interface InteractiveEvent {
  type: string;
  world: { x: number; y: number };
  start: { world: { x: number; y: number } };
  dropTarget?: { entity?: Entity } | null;
  consume(): void;
  [key: string]: unknown;
}

type Handler = (event: InteractiveEvent) => void;

/** The handler options, by event; see `EVENT_HANDLERS`. */
export interface InteractiveHandlers {
  onPointerDown?: Handler;
  onPointerUp?: Handler;
  onClick?: Handler;
  onDoubleClick?: Handler;
  onRightClick?: Handler;
  onHover?: Handler;
  onHoverEnd?: Handler;
  onDragStart?: Handler;
  onDrag?: Handler;
  onDragEnd?: Handler;
  onDrop?: Handler;
  onScroll?: Handler;
}

/** What `Interactive` takes beside the handlers. */
export interface InteractiveOptions extends InteractiveHandlers {
  hitArea?: HitArea;
  /** Deliver drag events. */
  draggable?: boolean;
  /** Move the body with the pointer while dragging (implies `draggable`). */
  follow?: boolean;
  /** Higher wins when shapes overlap; ties go to the most recently created entity. */
  priority?: number;
  /** CSS cursor while hovered. */
  cursor?: string;
  /** Stop the event after handling, so entities underneath do not also react. */
  consume?: boolean;
  enabled?: boolean;
}

/** The input-router members this constraint registers with. */
interface InteractiveRouter {
  addInteractive(interactive: Interactive): void;
  removeInteractive(interactive: Interactive): void;
}

/**
 * Makes an entity respond to the pointer.
 *
 * Hit testing an entity is opt-in, and that is a deliberate performance
 * boundary rather than an ergonomic one: a scene with no interactive
 * entities never asks physics what is under the cursor, so the cost of this
 * feature is exactly zero for the games that do not use it.
 *
 *   player.addConstraint('pick', new Interactive(player, {
 *     draggable: true,
 *     cursor: 'grab',
 *     onClick(event) { console.log(event.world); },
 *     onDrop(event)  { console.log('landed on', event.dropTarget?.entity); }
 *   }));
 *
 * Handlers are bound to the entity, like every other constraint's callbacks,
 * and receive the full input event (see input/inputManager.js).
 *
 * ## Hit area
 *
 * `hitArea: 'body'` (the default) uses the entity's physics collider, so the
 * clickable region is exactly the shape the simulation uses — the one the
 * player can see the consequences of. It costs one shared point query per
 * event no matter how many entities opt in.
 *
 * Passing `{width, height}` or `{radius}` instead tests a shape centred on
 * the entity without involving physics at all, which is what a decorative
 * entity with a sensor-less or oversized collider wants.
 *
 * ## Dragging
 *
 * `draggable: true` only arranges for the drag *events* to be delivered; it
 * deliberately does not move the body. What "dragging" means is a physics
 * decision the game has to make — teleporting a static prop, steering a
 * kinematic one, or applying a force to a dynamic one are all correct in
 * different games, and guessing wrong fights the solver. `follow: true` opts
 * into the simple answer (place the body under the pointer each frame).
 */
export class Interactive extends Constraint {
  static override description = 'Respond to the pointer: hover, click, drag';
  static override params: Record<string, SchemaDescriptor> = {
    hitArea: s.union([
      s.enumOf(['body'], { match: (value: unknown): boolean => typeof value === 'string' }),
      s.object({ width: s.number({ required: true }), height: s.number({ required: true }) },
        { match: (value: unknown): boolean => (value as { width?: number })?.width !== undefined }),
      s.object({ radius: s.number({ required: true }) }, { match: (value: unknown): boolean => (value as { radius?: number })?.radius !== undefined })
    ], { initial: 'body', message: "must be 'body', { width, height } or { radius }" }),
    follow: s.boolean({ initial: false }),
    draggable: s.boolean({ description: 'Defaults to follow' }),
    priority: s.number({ initial: 0 }),
    cursor: s.string({ editor: 'cursor', description: 'CSS cursor while hovered' }),
    consume: s.boolean({ initial: true }),
    enabled: s.boolean({ initial: true })
  };

  hitArea: HitArea;
  follow: boolean;
  draggable: boolean;
  priority: number;
  cursor: string | null;
  consume: boolean;
  enabled: boolean;
  isHovered: boolean;
  isDragging: boolean;
  grabOffset: { x: number; y: number };
  heldAt: { x: number; y: number } | null;
  handlers: Map<string, Handler>;

  constructor(entity: Entity, options: InteractiveOptions = {}) {
    super(entity);

    this.hitArea = options.hitArea ?? 'body';
    this.follow = options.follow ?? false;
    this.draggable = options.draggable ?? this.follow;
    this.priority = options.priority ?? 0;
    this.cursor = options.cursor ?? null;
    this.consume = options.consume ?? true;
    this.enabled = options.enabled ?? true;

    /** True while the pointer is over this entity. */
    this.isHovered = false;
    /** True between dragstart and dragend. */
    this.isDragging = false;
    /** Where the pointer sat inside the entity when the drag began. */
    this.grabOffset = { x: 0, y: 0 };
    /**
     * Where a `follow` drag holds the body, applied on the next tick. Pointer
     * events arrive per frame; the body moves only in `fixedUpdate`.
     */
    this.heldAt = null;

    this.handlers = new Map();
    for (const [type, name] of Interactive.EVENT_HANDLERS) {
      const handler = options[name];
      if (handler) this.handlers.set(type, handler.bind(entity));
    }

    (entity.game.input as unknown as InteractiveRouter).addInteractive(this);
  }

  /** Event type -> option name. Also defines what `handles()` can report. */
  static EVENT_HANDLERS: readonly [string, keyof InteractiveHandlers][] = Object.freeze([
    ['pointerdown', 'onPointerDown'],
    ['pointerup', 'onPointerUp'],
    ['click', 'onClick'],
    ['doubleclick', 'onDoubleClick'],
    ['rightclick', 'onRightClick'],
    ['hover', 'onHover'],
    ['hoverend', 'onHoverEnd'],
    ['dragstart', 'onDragStart'],
    ['drag', 'onDrag'],
    ['dragend', 'onDragEnd'],
    ['drop', 'onDrop'],
    ['scroll', 'onScroll']
  ]);

  /** Event types a drag produces, enabled as a group by `draggable`. */
  static DRAG_EVENTS: readonly string[] = Object.freeze(['dragstart', 'drag', 'dragend', 'drop']);

  /** Whether the hit test needs a physics point query. */
  get usesBodyShape(): boolean {
    return this.hitArea === 'body';
  }

  /**
   * Whether this should be hit-tested at all. A dead entity is still in the
   * router until something tears it down, and clicking where it used to be
   * must not land on it.
   */
  get active(): boolean {
    return this.enabled && !this.entity.dead;
  }

  /**
   * Whether this entity would do anything with `type`. The router asks so
   * that lazily-recognized gestures (pinch, long press) stay switched off
   * when nothing wants them.
   */
  handles(type: string): boolean {
    if (!this.active) return false;
    if (this.draggable && Interactive.DRAG_EVENTS.includes(type)) return true;
    // Hover drives the cursor style even with no handler attached.
    if (this.cursor && (type === 'hover' || type === 'hoverend')) return true;
    return this.handlers.has(type);
  }

  /**
   * Whether a world point is inside the hit area. Only called for explicit
   * shapes — a `'body'` hit area is resolved by the router's shared physics
   * query instead.
   */
  containsWorld(point: { x: number; y: number }): boolean {
    const { x, y } = this.entity.position;
    const area = this.hitArea as { radius?: number; width?: number; height?: number };
    if (area.radius !== undefined) {
      return Math.hypot(point.x - x, point.y - y) <= area.radius;
    }
    const halfWidth = area.width! / 2;
    const halfHeight = area.height! / 2;
    return Math.abs(point.x - x) <= halfWidth && Math.abs(point.y - y) <= halfHeight;
  }

  /** Receive a routed event. */
  handleInput(event: InteractiveEvent): void {
    if (!this.active) return;

    switch (event.type) {
      case 'hover':
        this.isHovered = true;
        if (this.cursor) this.entity.game.uiRenderer!.setCursor(this.cursor);
        break;
      case 'hoverend':
        this.isHovered = false;
        if (this.cursor) this.entity.game.uiRenderer!.setCursor('default');
        break;
      case 'dragstart':
        if (!this.draggable) return;
        this.isDragging = true;
        // Measured from where the pointer *pressed*, not from where it was
        // when the drag was recognized — by then it has already travelled
        // past the slop radius, and using that would jump the entity by
        // exactly that much on the first frame.
        this.grabOffset = {
          x: this.entity.position.x - event.start.world.x,
          y: this.entity.position.y - event.start.world.y
        };
        if (this.follow) this.#holdAt(event.world);
        break;
      case 'drag':
        if (!this.draggable) return;
        if (this.follow) this.#holdAt(event.world);
        break;
      case 'dragend':
        if (!this.draggable) return;
        this.isDragging = false;
        break;
      case 'drop':
        if (!this.draggable) return;
        break;
    }

    this.handlers.get(event.type)?.(event);

    // Consume after the handler so it can opt out by not being there at all
    // — an entity with no handler for this event should not silently swallow
    // it from whatever is underneath.
    if (this.consume && this.handles(event.type)) event.consume();
  }

  /** Aim the hold under the pointer, preserving where it was grabbed. */
  #holdAt(world: { x: number; y: number }): void {
    this.heldAt = { x: world.x + this.grabOffset.x, y: world.y + this.grabOffset.y };
  }

  /** Hold a `follow` drag's body where the pointer last put it. */
  override fixedUpdate(dt: number): void {
    if (!this.heldAt) return;
    const body = this.entity.body;
    // setPosition teleports and carries no riders, which is exactly right
    // for something being held: it is not moving under its own power.
    body.setPosition(this.heldAt);
    body.setVelocity({ x: 0, y: 0 });
    // Released: the last position still lands, once.
    if (!this.isDragging) this.heldAt = null;
  }

  /** Stop responding to the pointer without removing the constraint. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.isHovered = false;
      this.isDragging = false;
    }
  }

  override destroy(): void {
    (this.entity.game.input as unknown as InteractiveRouter).removeInteractive(this);
  }

  /** Back in the world after a snapshot restore: hit-tested again. */
  override revive(): void {
    (this.entity.game.input as unknown as InteractiveRouter).addInteractive(this);
  }
}
