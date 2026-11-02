import { UIElement } from '../uiElement.js';

/**
 * Lay children out in a row or a column.
 *
 * ## Why a layout and not more offsets
 *
 * Before this, a menu was a list of hand-tuned offsets — `y: -280, -80, -10,
 * 80` in the platformer's main menu. Those numbers encode nothing: add a
 * button and every one below it has to be re-tuned, change a font size and
 * the spacing is wrong, and the gaps between items are whatever happened to
 * fit rather than a decision anyone made. A stack says what is actually
 * meant — *these items, in a column, this far apart* — and the numbers fall
 * out of it.
 *
 * ## How it positions
 *
 * A stack writes its children's `offsetX`/`offsetY` and pins their `anchor`
 * and `pivot` to `top-left`, so it fully owns where they sit. Setting a
 * child's `x` by hand inside a stack is therefore pointless: the next layout
 * pass overwrites it. Use `padding` on the stack, `gap`, or a `Spacer`.
 *
 * Layout runs in `layout()`, which `updateTree` calls *after* the children
 * have updated. That ordering matters: a label measures itself in `update`,
 * so by the time its parent lays out, its width is real. Nested stacks
 * therefore resolve innermost-first, which is the only order that works.
 *
 * ## Sizing
 *
 * Each axis is independent. An axis with no explicit size takes the size of
 * what is in it, plus padding, so a panel wrapping a stack is exactly as big
 * as its contents. Give it a `width` or a `height` and that axis is yours —
 * which is the usual shape of a menu: one fixed width so every row matches,
 * and a free height so the stack is as tall as however many rows there are.
 *
 * Invisible children are skipped entirely rather than left as holes, which
 * is what makes a conditionally hidden row collapse the way it should.
 */

/** Which axis each direction grows along. */
const AXES = Object.freeze({
  row: { main: 'x', cross: 'y', mainSize: 'width', crossSize: 'height' },
  column: { main: 'y', cross: 'x', mainSize: 'height', crossSize: 'width' }
});

export class Stack extends UIElement {
  /**
   * @param {Object} [options] - `UIElement` options, plus:
   * @param {'row'|'column'} [options.direction='column']
   * @param {number|string} [options.gap='$space.md'] - Space between children
   * @param {'start'|'center'|'end'|'stretch'} [options.align='stretch'] -
   *   Cross-axis placement of each child. `'stretch'` gives every child the
   *   stack's cross size, which is what makes a column of buttons share one
   *   width without anyone stating it
   * @param {'start'|'center'|'end'|'space-between'|'space-around'} [options.justify='start'] -
   *   Main-axis distribution. Only meaningful when the stack is larger than
   *   its contents, so it needs an explicit size on the main axis
   * @param {number} [options.width] - Fixed width; otherwise sized to content
   * @param {number} [options.height] - Fixed height; otherwise sized to content
   */
  constructor(options = {}) {
    super({ pivot: 'top-left', ...options });
    this.direction = options.direction ?? 'column';
    this.gap = options.gap ?? '$space.md';
    this.align = options.align ?? 'stretch';
    this.justify = options.justify ?? 'start';
    /**
     * Sizes are per-axis and remembered separately from `width`/`height`,
     * which `layout` *writes*. Without this a stack could not tell the 200
     * the author asked for from the 200 it computed last frame, so an
     * explicit width would survive exactly one frame.
     * @type {number|null}
     */
    this.fixedWidth = options.width ?? null;
    /** @type {number|null} */
    this.fixedHeight = options.height ?? null;
  }

  /** Give the stack a fixed size on one or both axes; `null` returns it to content. */
  setFixedSize({ width, height } = {}) {
    if (width !== undefined) this.fixedWidth = width;
    if (height !== undefined) this.fixedHeight = height;
    return this;
  }

  /** Children that take part in layout. */
  get laidOut() {
    return this.children.filter((child) => child.visible);
  }

  /** The resolved gap, in UI units. */
  get gapSize() {
    return this.theme?.resolve(this.gap) ?? (typeof this.gap === 'number' ? this.gap : 0);
  }

  /**
   * Natural size of the contents, before any explicit size is applied.
   * @returns {{width: number, height: number}}
   */
  measureContent() {
    const axis = AXES[this.direction] ?? AXES.column;
    const children = this.laidOut;
    const gap = this.gapSize;

    let main = 0;
    let cross = 0;
    for (const child of children) {
      main += sizeOf(child, axis.mainSize);
      cross = Math.max(cross, sizeOf(child, axis.crossSize));
    }
    if (children.length > 1) main += gap * (children.length - 1);

    const pad = this.padding;
    return this.direction === 'row'
      ? { width: main + pad.left + pad.right, height: cross + pad.top + pad.bottom }
      : { width: cross + pad.left + pad.right, height: main + pad.top + pad.bottom };
  }

  /**
   * Place the children. Called by `updateTree` after they have updated, so
   * anything that measures itself has already done so.
   */
  layout() {
    const axis = AXES[this.direction] ?? AXES.column;
    const children = this.laidOut;

    // Each axis is content-sized unless the author fixed it. A column with
    // a fixed width and free height is the common case — rows share one
    // width, and the stack is as tall as however many there are.
    const content = this.measureContent();
    this.width = this.fixedWidth ?? content.width;
    this.height = this.fixedHeight ?? content.height;

    const box = this.contentBox;
    const gap = this.gapSize;
    const mainSpace = this.direction === 'row' ? box.width : box.height;
    const crossSpace = this.direction === 'row' ? box.height : box.width;

    let contentMain = 0;
    for (const child of children) contentMain += sizeOf(child, axis.mainSize);
    if (children.length > 1) contentMain += gap * (children.length - 1);

    const free = Math.max(0, mainSpace - contentMain);
    let cursor = startOffset(this.justify, free, children.length);
    const extra = spread(this.justify, free, children.length);

    for (const child of children) {
      // The stack owns placement, so the child's own anchor and pivot would
      // only fight it. Pinning both to the top-left makes the offsets below
      // mean exactly what they say.
      child.anchor = 'top-left';
      child.pivot = 'top-left';

      if (this.align === 'stretch' && crossSpace > 0) {
        child[axis.crossSize] = crossSpace;
      }

      const childCross = sizeOf(child, axis.crossSize);
      const crossOffset = alignOffset(this.align, crossSpace, childCross);

      if (this.direction === 'row') {
        child.offsetX = cursor;
        child.offsetY = crossOffset;
      } else {
        child.offsetY = cursor;
        child.offsetX = crossOffset;
      }

      cursor += sizeOf(child, axis.mainSize) + gap + extra;
    }
  }
}

/**
 * Space that grows to fill what is left on the main axis.
 *
 * A spacer is how "these two at the top, that one at the bottom" is said
 * without giving the stack an explicit height and a `justify`. It has no
 * appearance and is never a hit target.
 */
export class Spacer extends UIElement {
  /**
   * @param {Object} [options]
   * @param {number|string} [options.size=0] - Fixed size, when a gap of a
   *   particular size is wanted rather than a flexible one
   */
  constructor(options = {}) {
    super({ pivot: 'top-left', width: 0, height: 0, ...options });
    this.size = options.size ?? 0;
  }

  update() {
    const resolved = this.theme?.resolve(this.size) ?? this.size;
    const value = typeof resolved === 'number' ? resolved : 0;
    this.width = value;
    this.height = value;
  }

  contains() {
    return false;
  }
}

/** A child's size on one axis, treating an unset size as zero. */
function sizeOf(child, key) {
  const value = child[key];
  return Number.isFinite(value) ? value : 0;
}

/** Where the first child starts, given the distribution. */
function startOffset(justify, free, count) {
  switch (justify) {
    case 'center': return free / 2;
    case 'end': return free;
    case 'space-around': return count > 0 ? free / count / 2 : 0;
    default: return 0;
  }
}

/** Extra space inserted after each child, for the distributing modes. */
function spread(justify, free, count) {
  if (justify === 'space-between') return count > 1 ? free / (count - 1) : 0;
  if (justify === 'space-around') return count > 0 ? free / count : 0;
  return 0;
}

/** Cross-axis offset for one child. */
function alignOffset(align, space, childSize) {
  switch (align) {
    case 'center': return (space - childSize) / 2;
    case 'end': return space - childSize;
    default: return 0;
  }
}
