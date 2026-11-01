/**
 * Fraction of UI space each anchor sits at: [x, y], 0 = left/top,
 * 1 = right/bottom.
 */
export const ANCHOR_ORIGINS = Object.freeze({
  'top-left': [0, 0],
  'top': [0.5, 0],
  'top-right': [1, 0],
  'left': [0, 0.5],
  'center': [0.5, 0.5],
  'right': [1, 0.5],
  'bottom-left': [0, 1],
  'bottom': [0.5, 1],
  'bottom-right': [1, 1]
});

/** Event type -> the method an element implements to receive it. */
export const UI_HANDLERS = Object.freeze({
  pointerdown: 'onPointerDown',
  pointerup: 'onPointerUp',
  pointermove: 'onPointerMove',
  click: 'onClick',
  doubleclick: 'onDoubleClick',
  rightclick: 'onRightClick',
  hover: 'onHover',
  hoverend: 'onHoverEnd',
  dragstart: 'onDragStart',
  drag: 'onDrag',
  dragend: 'onDragEnd',
  drop: 'onDrop',
  scroll: 'onScroll'
});

/**
 * What every UI element reacts to. Anything beyond this — dragging,
 * scrolling — is declared by the element that wants it, because the input
 * router uses these sets to decide whether a gesture is worth recognizing
 * at all.
 */
const BASE_INTERESTS = ['pointerdown', 'pointerup', 'click', 'hover', 'hoverend'];

/**
 * Base class for screen-space UI.
 *
 * ## Positioning
 *
 * UI space always covers the whole display, so its width changes with the
 * aspect ratio (see `viewport.js`). Positions are therefore stored as an
 * **offset from an anchor** rather than as absolute coordinates, and `x`/`y`
 * resolve that offset against the current UI size every time they are read.
 *
 * The default anchor is `'top-left'`, where the offset *is* the absolute
 * position. Give an element `{ anchor: 'bottom-right' }` and an offset of
 * `(-20, -20)` and it stays 20 units in from the real bottom-right corner at
 * any aspect ratio.
 *
 * Writing to `x`/`y` writes the offset, so `element.x += 5` still nudges the
 * element by 5 units.
 *
 * ## Input
 *
 * Elements do not listen for anything. The input router resolves one target
 * per event and calls `handleInput`, which forwards to the `on*` method for
 * that event type (see `UI_HANDLERS`). An element that handles an event
 * consumes it by default, so whatever sits underneath — including the game
 * world — does not also react; pass `{ consume: false }` to let events fall
 * through.
 */
export class UIElement {
  /**
   * @param {number} x - Offset from the anchor along x, in UI units
   * @param {number} y - Offset from the anchor along y, in UI units
   * @param {number} [width] - Width in UI units
   * @param {number} [height] - Height in UI units
   * @param {Object} [options]
   * @param {keyof ANCHOR_ORIGINS} [options.anchor='top-left'] - Corner/edge the offset is measured from
   * @param {boolean} [options.consume=true] - Stop handled events from
   *   reaching the world underneath
   */
  constructor(x, y, width, height, options = {}) {
    /** Offset from the anchor, in UI units. */
    this.offsetX = x;
    this.offsetY = y;
    /** @type {keyof ANCHOR_ORIGINS} */
    this.anchor = options.anchor || 'top-left';
    this.width = width;
    this.height = height;
    this.visible = true;
    this.isHovered = false;
    this.isPressed = false;
    this.isFocused = false;
    this.game = null;
    this.consume = options.consume ?? true;
    /** Event types this element wants. @type {Set<string>} */
    this.interests = new Set(BASE_INTERESTS);
  }

  /** The anchor's origin in UI units, or [0, 0] before the element has a game. */
  #origin() {
    const ui = this.game?.uiRenderer;
    if (!ui) return [0, 0];
    const [fx, fy] = ANCHOR_ORIGINS[this.anchor] || ANCHOR_ORIGINS['top-left'];
    return [fx * ui.width, fy * ui.height];
  }

  /** Resolved position in UI space. @type {number} */
  get x() { return this.offsetX + this.#origin()[0]; }
  set x(value) { this.offsetX = value - this.#origin()[0]; }

  /** Resolved position in UI space. @type {number} */
  get y() { return this.offsetY + this.#origin()[1]; }
  set y(value) { this.offsetY = value - this.#origin()[1]; }

  setGame(game) {
    this.game = game;
  }

  update(deltaTime) {}

  draw(deltaTime) {}

  /**
   * Declare interest in extra event types, so gestures that are only
   * recognized on demand (drag, scroll) switch on for this element.
   * @param {...string} types
   */
  wants(...types) {
    for (const type of types) this.interests.add(type);
    return this;
  }

  /** Whether this element would do anything with `type`. */
  handles(type) {
    return this.interests.has(type);
  }

  contains(x, y) {
    // Elements with no size — a text label, a bare container — are not hit
    // targets. Without this they would hit-test against NaN bounds and,
    // worse, could swallow events meant for the world behind them.
    if (!this.game || !(this.width > 0) || !(this.height > 0)) return false;
    return this.game.uiRenderer.hitTest(x, y, {
      type: 'rect',
      x: this.x - this.width / 2,
      y: this.y - this.height / 2,
      width: this.width,
      height: this.height
    });
  }

  /**
   * Receive a routed event. Tracks the states every element shares, then
   * forwards to the matching `on*` method.
   * @param {object} event
   */
  handleInput(event) {
    switch (event.type) {
      case 'hover':
        this.isHovered = true;
        break;
      case 'hoverend':
        this.isHovered = false;
        // A press that ends outside the element is a cancelled press, not a
        // click — and the router already declines to fire one.
        this.isPressed = false;
        break;
      case 'pointerdown':
        this.isPressed = true;
        break;
      case 'pointerup':
        this.isPressed = false;
        break;
    }

    const method = UI_HANDLERS[event.type];
    if (method) this[method]?.(event);

    if (this.consume && this.handles(event.type)) event.consume();
  }

  onFocus() {
    this.isFocused = true;
  }

  onBlur() {
    this.isFocused = false;
  }

  destroy() {
    this.visible = false;
    this.isHovered = false;
    this.isPressed = false;
    this.isFocused = false;
  }
}
