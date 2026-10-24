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
 * position — so existing layouts keep behaving exactly as before. Give an
 * element `{ anchor: 'bottom-right' }` and an offset of `(-20, -20)` and it
 * stays 20 units in from the real bottom-right corner at any aspect ratio.
 *
 * Writing to `x`/`y` writes the offset, so `element.x += 5` still nudges the
 * element by 5 units.
 */
export class UIElement {
  /**
   * @param {number} x - Offset from the anchor along x, in UI units
   * @param {number} y - Offset from the anchor along y, in UI units
   * @param {number} [width] - Width in UI units
   * @param {number} [height] - Height in UI units
   * @param {Object} [options]
   * @param {keyof ANCHOR_ORIGINS} [options.anchor='top-left'] - Corner/edge the offset is measured from
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
    this.isFocused = false;
    this.game = null;
    this.stopPropagation = false;
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

  contains(x, y) {
    const hit = this.game.uiRenderer.hitTest(x, y, {
      type: 'rect',
      x: this.x - this.width/2,
      y: this.y - this.height/2,
      width: this.width,
      height: this.height
    });
    return hit;
  }

  onMouseMove(x, y) {
    const wasHovered = this.isHovered;
    this.isHovered = this.contains(x, y);
    if (wasHovered !== this.isHovered) {
      if (this.isHovered) this.onMouseEnter();
      else this.onMouseLeave();
    }
    return this.stopPropagation;
  }

  onMouseDown(x, y) {
    if (this.contains(x, y)) {
      this.onClick(x, y);
      return this.stopPropagation;
    }
    return false;
  }

  onMouseEnter() {}
  onMouseLeave() {}
  onClick(x, y) {}
  onFocus() {
    this.isFocused = true;
  }
  onBlur() {
    this.isFocused = false;
  }

  destroy() {
    this.visible = false;
    this.isHovered = false;
    this.isFocused = false;
  }
} 