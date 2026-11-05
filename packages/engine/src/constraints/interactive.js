import { Constraint } from '../core/constraint.js';

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
  /**
   * @param {import('../core/entity.js').Entity} entity
   * @param {Object} [options]
   * @param {'body'|{width: number, height: number}|{radius: number}} [options.hitArea='body']
   * @param {boolean} [options.draggable=false] - Deliver drag events
   * @param {boolean} [options.follow=false] - Move the body with the pointer
   *   while dragging (implies `draggable`)
   * @param {number} [options.priority=0] - Higher wins when shapes overlap;
   *   ties go to the most recently created entity
   * @param {string} [options.cursor] - CSS cursor while hovered
   * @param {boolean} [options.consume=true] - Stop the event after handling,
   *   so entities underneath do not also react
   * @param {(event: object) => void} [options.onPointerDown]
   * @param {(event: object) => void} [options.onPointerUp]
   * @param {(event: object) => void} [options.onClick]
   * @param {(event: object) => void} [options.onDoubleClick]
   * @param {(event: object) => void} [options.onRightClick]
   * @param {(event: object) => void} [options.onHover]
   * @param {(event: object) => void} [options.onHoverEnd]
   * @param {(event: object) => void} [options.onDragStart]
   * @param {(event: object) => void} [options.onDrag]
   * @param {(event: object) => void} [options.onDragEnd]
   * @param {(event: object) => void} [options.onDrop]
   * @param {(event: object) => void} [options.onScroll]
   */
  constructor(entity, options = {}) {
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

    entity.game.input.addInteractive(this);
  }

  /** Event type -> option name. Also defines what `handles()` can report. */
  static EVENT_HANDLERS = Object.freeze([
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
  static DRAG_EVENTS = Object.freeze(['dragstart', 'drag', 'dragend', 'drop']);

  /** Whether the hit test needs a physics point query. */
  get usesBodyShape() {
    return this.hitArea === 'body';
  }

  /**
   * Whether this should be hit-tested at all. A dead entity is still in the
   * router until something tears it down, and clicking where it used to be
   * must not land on it.
   */
  get active() {
    return this.enabled && !this.entity.dead;
  }

  /**
   * Whether this entity would do anything with `type`. The router asks so
   * that lazily-recognized gestures (pinch, long press) stay switched off
   * when nothing wants them.
   */
  handles(type) {
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
  containsWorld(point) {
    const { x, y } = this.entity.position;
    if (this.hitArea.radius !== undefined) {
      return Math.hypot(point.x - x, point.y - y) <= this.hitArea.radius;
    }
    const halfWidth = this.hitArea.width / 2;
    const halfHeight = this.hitArea.height / 2;
    return Math.abs(point.x - x) <= halfWidth && Math.abs(point.y - y) <= halfHeight;
  }

  /** Receive a routed event. @param {object} event */
  handleInput(event) {
    if (!this.active) return;

    switch (event.type) {
      case 'hover':
        this.isHovered = true;
        if (this.cursor) this.entity.game.uiRenderer.setCursor(this.cursor);
        break;
      case 'hoverend':
        this.isHovered = false;
        if (this.cursor) this.entity.game.uiRenderer.setCursor('default');
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
  #holdAt(world) {
    this.heldAt = { x: world.x + this.grabOffset.x, y: world.y + this.grabOffset.y };
  }

  /** Hold a `follow` drag's body where the pointer last put it. */
  fixedUpdate(dt) {
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
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.isHovered = false;
      this.isDragging = false;
    }
  }

  destroy() {
    this.entity.game.input.removeInteractive(this);
  }
}
