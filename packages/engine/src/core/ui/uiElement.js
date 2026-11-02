import { UIPainter } from './painter.js';
import { resolveStateStyle } from './theme.js';

/**
 * Fraction of a box each named point sits at: [x, y], 0 = left/top,
 * 1 = right/bottom. Used for both anchors (where in the *parent* an element
 * is measured from) and pivots (which point of the *element* lands there).
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

/** Nothing-at-all box, for an element with neither a parent nor a game yet. */
const EMPTY_BOX = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });

/**
 * Base class for screen-space UI.
 *
 * ## The box
 *
 * UI space always covers the whole display, so its width changes with the
 * aspect ratio (see `viewport.js`). Positions are therefore stored as an
 * **offset from an anchor** rather than as absolute coordinates, and
 * resolved against the current size every time they are read.
 *
 * Two named points describe where an element lands:
 *
 * - **anchor** — the point *in the parent's content box* the offset is
 *   measured from. `'bottom-right'` with an offset of `(-20, -20)` stays 20
 *   units in from the real bottom-right corner at any aspect ratio.
 * - **pivot** — the point *of this element* that lands there. The default is
 *   `'center'`, so an element sits centred on its position; a label sets
 *   `'top-left'` so its position is the corner text starts at.
 *
 * Before this was explicit, every component simply hardcoded one or the
 * other — buttons and rectangles centred, text top-left — and there was no
 * way to tell which without reading its `draw`.
 *
 * `padding` shrinks the **content box** children are laid out in, without
 * changing the element's own frame. A panel with 16 units of padding is the
 * same size on screen; its children just start 16 units in.
 *
 * ## The tree
 *
 * Elements nest. A child's anchor resolves against its parent's content box
 * rather than the screen, which is what makes a panel a real container: move
 * the panel and everything in it moves, resize the display and a child
 * anchored to the panel's right edge stays on the panel's right edge.
 *
 * Children draw after their parent and hit-test before it — the parent is
 * behind them in both senses.
 *
 * ## Visual state
 *
 * `opacity`, `scale` and `rotation` are applied by the traversal in
 * `drawTree`, not by each component. A component that knows nothing about
 * animation can still be faded, scaled and spun, which is the whole reason
 * the motion system can stay out of the components.
 *
 * Opacity compounds down the tree: `alpha` is this element's own `opacity`
 * times every ancestor's. The painter folds it into each draw call.
 *
 * ## Input
 *
 * Elements do not listen for anything. The input router resolves one target
 * per event and calls `handleInput`, which forwards to the `on*` method for
 * that event type (see `UI_HANDLERS`). An element that handles an event
 * consumes it by default, so whatever sits underneath — including the game
 * world — does not also react; pass `{ consume: false }` to let events fall
 * through.
 *
 * A **disabled** element is still a hit target: it swallows the click rather
 * than letting it reach whatever is behind it, which is what a greyed-out
 * button in a dialog has to do. It just does not run handlers or track
 * hover and press states.
 */
export class UIElement {
  /**
   * @param {Object} [options]
   * @param {number} [options.x=0] - Offset from the anchor along x, in UI units
   * @param {number} [options.y=0] - Offset from the anchor along y, in UI units
   * @param {number} [options.width] - Width in UI units
   * @param {number} [options.height] - Height in UI units
   * @param {keyof ANCHOR_ORIGINS} [options.anchor='top-left'] - Point in the
   *   parent's content box the offset is measured from
   * @param {keyof ANCHOR_ORIGINS} [options.pivot='center'] - Point of this
   *   element that lands on the resolved position
   * @param {number|number[]|Object} [options.padding=0] - Content inset: a
   *   number, `[vertical, horizontal]`, `[top, right, bottom, left]`, or
   *   `{top, right, bottom, left}`
   * @param {boolean} [options.visible=true]
   * @param {boolean} [options.enabled=true]
   * @param {number} [options.opacity=1]
   * @param {number} [options.scale=1] - Uniform scale about the pivot
   * @param {number} [options.scaleX] - Overrides `scale` on one axis
   * @param {number} [options.scaleY] - Overrides `scale` on one axis
   * @param {number} [options.rotation=0] - Radians about the pivot
   * @param {boolean} [options.clipChildren=false] - Clip descendants to this
   *   element's frame, and stop hit testing outside it
   * @param {boolean} [options.consume=true] - Stop handled events from
   *   reaching the world underneath
   * @param {import('./theme.js').Theme} [options.theme] - Override the theme
   *   for this element and its descendants
   */
  constructor(options = {}) {
    /** Offset from the anchor, in UI units. */
    this.offsetX = options.x ?? 0;
    this.offsetY = options.y ?? 0;
    /** @type {keyof ANCHOR_ORIGINS} */
    this.anchor = options.anchor ?? 'top-left';
    /** @type {keyof ANCHOR_ORIGINS} */
    this.pivot = options.pivot ?? 'center';
    this.width = options.width;
    this.height = options.height;
    this.padding = normalizePadding(options.padding);

    /** @type {UIElement|null} */
    this.parent = null;
    /** Draw order: later children draw on top. @type {UIElement[]} */
    this.children = [];
    /** @type {import('../m2d.js').M2D|null} */
    this.game = null;
    /** Whether this element is attached to a live tree. */
    this.mounted = false;

    this.visible = options.visible ?? true;
    this.enabled = options.enabled ?? true;
    this.opacity = options.opacity ?? 1;
    this.scaleX = options.scaleX ?? options.scale ?? 1;
    this.scaleY = options.scaleY ?? options.scale ?? 1;
    this.rotation = options.rotation ?? 0;
    this.clipChildren = options.clipChildren ?? false;

    this.isHovered = false;
    this.isPressed = false;
    this.isFocused = false;
    /** Whether focus navigation can land here. */
    this.focusable = options.focusable ?? false;

    this.consume = options.consume ?? true;
    /** Event types this element wants. @type {Set<string>} */
    this.interests = new Set(BASE_INTERESTS);

    /** Theme override for this subtree, if any. @type {?import('./theme.js').Theme} */
    this.ownTheme = options.theme ?? null;
    /** @type {UIPainter|null} */
    this.painter = null;
  }

  // === Theme and painting ===

  /**
   * The theme in force here: this element's override, else the nearest
   * ancestor's, else the game's. Walked rather than cached so a theme
   * swapped at runtime applies on the next frame.
   * @type {import('./theme.js').Theme|null}
   */
  get theme() {
    return this.ownTheme ?? this.parent?.theme ?? this.game?.theme ?? null;
  }

  /**
   * Draw through this. Resolves theme tokens and folds in inherited opacity;
   * see `painter.js`.
   * @type {UIPainter}
   */
  get paint() {
    if (!this.painter) this.painter = new UIPainter(this);
    return this.painter;
  }

  /**
   * Flatten a style declaration against the current interaction state.
   * @param {Object} style - Declaration with optional per-state deltas
   * @returns {Object}
   */
  styleFor(style) {
    return resolveStateStyle(style, this.state);
  }

  /**
   * Which visual state this element is in.
   *
   * **Focus renders as hover.** A keyboard-selected control and a
   * pointer-hovered one are the same thing to a player — "this is the one
   * that will happen" — so they get one appearance rather than a highlight
   * plus a separate ring floating around it. There is deliberately no
   * `focused` state to style.
   *
   * Pressed outranks both, because a held control should look held.
   * @type {'normal'|'hovered'|'pressed'|'disabled'}
   */
  get state() {
    if (!this.enabled) return 'disabled';
    if (this.isPressed) return 'pressed';
    if (this.isHovered || this.isFocused) return 'hovered';
    return 'normal';
  }

  // === Geometry ===

  /** The box this element's anchor resolves against. */
  get parentBox() {
    if (this.parent) return this.parent.contentBox;
    const ui = this.game?.uiRenderer;
    if (!ui) return EMPTY_BOX;
    return { x: 0, y: 0, width: ui.width, height: ui.height };
  }

  /** Where this element's pivot sits, in UI space. @type {number} */
  get x() {
    const box = this.parentBox;
    return box.x + originOf(this.anchor)[0] * box.width + this.offsetX;
  }

  set x(value) {
    const box = this.parentBox;
    this.offsetX = value - (box.x + originOf(this.anchor)[0] * box.width);
  }

  /** Where this element's pivot sits, in UI space. @type {number} */
  get y() {
    const box = this.parentBox;
    return box.y + originOf(this.anchor)[1] * box.height + this.offsetY;
  }

  set y(value) {
    const box = this.parentBox;
    this.offsetY = value - (box.y + originOf(this.anchor)[1] * box.height);
  }

  /**
   * The element's own box in UI space, top-left anchored. Derived from the
   * position and the pivot, so a centred element reports the rectangle it
   * actually covers.
   * @type {{x: number, y: number, width: number, height: number}}
   */
  get frame() {
    const width = this.width ?? 0;
    const height = this.height ?? 0;
    const [px, py] = originOf(this.pivot);
    return {
      x: this.x - px * width,
      y: this.y - py * height,
      width,
      height
    };
  }

  /**
   * The frame minus padding: where children are laid out.
   * @type {{x: number, y: number, width: number, height: number}}
   */
  get contentBox() {
    const frame = this.frame;
    const pad = this.padding;
    return {
      x: frame.x + pad.left,
      y: frame.y + pad.top,
      width: Math.max(0, frame.width - pad.left - pad.right),
      height: Math.max(0, frame.height - pad.top - pad.bottom)
    };
  }

  /**
   * This element's opacity combined with every ancestor's.
   * @type {number}
   */
  get alpha() {
    return this.parent ? this.opacity * this.parent.alpha : this.opacity;
  }

  // === Tree ===

  /**
   * Append a child. Re-parents it if it already had a parent.
   * @template {UIElement} T
   * @param {T} child
   * @returns {T} The child, so calls can be chained or captured
   */
  add(child) {
    if (child === this) throw new Error('UIElement: cannot add an element to itself');
    if (child.parent) child.parent.remove(child);
    child.parent = this;
    this.children.push(child);
    if (this.game) child.setGame(this.game);
    if (this.mounted) child.#mount();
    return child;
  }

  /**
   * Remove a child. Does nothing if it is not one.
   * @param {UIElement} child
   */
  remove(child) {
    const index = this.children.indexOf(child);
    if (index < 0) return;
    this.children.splice(index, 1);
    if (child.mounted) child.#unmount();
    child.parent = null;
  }

  /** Remove every child. */
  clear() {
    for (const child of [...this.children]) this.remove(child);
  }

  /** Detach from the parent, if any. */
  removeFromParent() {
    this.parent?.remove(this);
  }

  /**
   * Set the game reference on this element and everything under it.
   * @param {import('../m2d.js').M2D|null} game
   */
  setGame(game) {
    this.game = game;
    for (const child of this.children) child.setGame(game);
  }

  #mount() {
    if (this.mounted) return;
    this.mounted = true;
    this.onMount?.();
    for (const child of this.children) child.#mount();
  }

  #unmount() {
    if (!this.mounted) return;
    // Children first, so a parent's onUnmount can still see a live subtree.
    for (const child of this.children) child.#unmount();
    this.mounted = false;
    this.onUnmount?.();
  }

  /**
   * Called when the element becomes part of a live tree, and again if it is
   * removed and re-added. The place to subscribe to anything; the matching
   * `onUnmount` is where it comes back off.
   */
  onMount() {}

  /** Called when the element leaves a live tree, children first. */
  onUnmount() {}

  // === Per-frame ===

  /**
   * Update this element and its descendants.
   *
   * Runs regardless of `visible`, so an element animating itself out is not
   * frozen halfway by the frame that hides it.
   * @param {number} deltaTime - Seconds since the last frame
   */
  updateTree(deltaTime) {
    this.update(deltaTime);
    for (const child of this.children) child.updateTree(deltaTime);
    // After the children, never before: a label measures itself in `update`,
    // so a layout that ran first would place everything against stale sizes.
    // Running last also means nested layouts resolve innermost-first, which
    // is the only order in which an outer stack can see a true inner size.
    this.layout();
  }

  /**
   * Place this element's children. A no-op unless the element is a layout
   * container; see `layout/stack.js`.
   */
  layout() {}

  /**
   * Draw this element and its descendants, applying opacity, scale,
   * rotation and clipping.
   * @param {number} deltaTime - Seconds since the last frame
   */
  drawTree(deltaTime) {
    if (!this.visible || this.alpha <= 0) return;

    const transformed = this.rotation !== 0 || this.scaleX !== 1 || this.scaleY !== 1;
    if (transformed) {
      // Two pushes, because the contract's transform is `T(x,y)·R·S` and we
      // want rotation and scale about the *pivot* while children keep
      // drawing in absolute UI coordinates. Composing T(p)·R·S then T(-p)
      // gives `p + R·S·(point - p)`, which is exactly that. One push would
      // force every component to draw in local space instead.
      const px = this.x;
      const py = this.y;
      this.paint.pushTransform({
        x: px, y: py, rotation: this.rotation, scaleX: this.scaleX, scaleY: this.scaleY
      });
      this.paint.pushTransform({ x: -px, y: -py });
    }

    this.draw(deltaTime);

    if (this.clipChildren) this.paint.pushClip(this.frame);
    for (const child of this.children) child.drawTree(deltaTime);
    if (this.clipChildren) this.paint.popClip();

    if (transformed) {
      this.paint.popTransform();
      this.paint.popTransform();
    }
  }

  /** Per-frame logic. Override in a component. */
  update(deltaTime) {}

  /** Draw just this element, not its children. Override in a component. */
  draw(deltaTime) {}

  // === Input ===

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

  /** Whether this element or anything under it wants `type`. */
  treeHandles(type) {
    if (this.visible && this.handles(type)) return true;
    for (const child of this.children) {
      if (child.treeHandles(type)) return true;
    }
    return false;
  }

  /**
   * Whether a UI-space point is inside this element's own box.
   *
   * Elements with no size — a bare container, a label that has not measured
   * itself — are not hit targets. Without this they would hit-test against
   * NaN bounds and, worse, could swallow events meant for the world behind
   * them.
   */
  contains(x, y) {
    if (!this.game || !(this.width > 0) || !(this.height > 0)) return false;
    return this.game.uiRenderer.hitTest(x, y, { type: 'rect', ...this.frame });
  }

  /**
   * The topmost element at a UI-space point, searching this subtree.
   *
   * Children are searched last-first because later children draw on top, and
   * before this element because a child is in front of its parent.
   *
   * @param {number} x - UI-space X
   * @param {number} y - UI-space Y
   * @param {UIElement} [exclude] - Element to skip (the subject of a drop)
   * @returns {UIElement|null}
   */
  hitTest(x, y, exclude = null) {
    if (!this.visible) return null;
    // A clipping element hides whatever its frame does not show, so nothing
    // inside it can be hit outside it.
    if (this.clipChildren && !this.contains(x, y)) return null;

    for (let i = this.children.length - 1; i >= 0; i--) {
      const hit = this.children[i].hitTest(x, y, exclude);
      if (hit) return hit;
    }

    if (this === exclude) return null;
    return this.contains(x, y) ? this : null;
  }

  /**
   * Receive a routed event. Tracks the states every element shares, then
   * forwards to the matching `on*` method.
   * @param {object} event
   */
  handleInput(event) {
    // Disabled still consumes: a greyed-out control blocks what is behind
    // it rather than letting the click fall through to the game.
    if (!this.enabled) {
      if (this.consume && this.handles(event.type)) event.consume();
      return;
    }

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

  /** Release this element and everything under it. */
  destroy() {
    // A tween holding a reference would keep writing to a dead element.
    this.game?.motion?.cancel(this);
    for (const child of [...this.children]) child.destroy();
    this.children.length = 0;
    if (this.mounted) this.#unmount();
    this.parent?.remove(this);
    this.visible = false;
    this.isHovered = false;
    this.isPressed = false;
    this.isFocused = false;
    this.painter = null;
  }
}

/** Anchor/pivot fractions, defaulting to the top-left for an unknown name. */
function originOf(name) {
  return ANCHOR_ORIGINS[name] || ANCHOR_ORIGINS['top-left'];
}

/**
 * Accept padding the way CSS does, since that is the shorthand everyone
 * already knows: one value for all sides, two for vertical and horizontal,
 * four clockwise from the top, or an explicit object.
 * @returns {{top: number, right: number, bottom: number, left: number}}
 */
export function normalizePadding(padding) {
  if (padding == null) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof padding === 'number') {
    return { top: padding, right: padding, bottom: padding, left: padding };
  }
  if (Array.isArray(padding)) {
    const [a = 0, b = a, c = a, d = b] = padding;
    return { top: a, right: b, bottom: c, left: d };
  }
  return {
    top: padding.top ?? 0,
    right: padding.right ?? 0,
    bottom: padding.bottom ?? 0,
    left: padding.left ?? 0
  };
}
