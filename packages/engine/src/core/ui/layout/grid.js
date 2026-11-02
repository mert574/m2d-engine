import { UIElement } from '../uiElement.js';

/**
 * Lay children out on a fixed column grid, wrapping to new rows.
 *
 * Where a `Stack` is one line of things, a grid is the inventory screen, the
 * level-select page, the key-rebinding table — anything where the *columns*
 * are the structure and the item count is whatever the game happens to have.
 *
 * Cells are uniform: every column is the same width and every row the same
 * height, taken from the widest and tallest child unless `cellWidth` and
 * `cellHeight` are given. Uniform cells are the point — a grid of differently
 * sized tiles is a `Flow`, not a grid.
 *
 * Like `Stack`, it owns its children's placement and runs in `layout()`,
 * after they have had a chance to measure themselves.
 */
export class Grid extends UIElement {
  /**
   * @param {Object} [options] - `UIElement` options, plus:
   * @param {number} [options.columns=2] - Cells per row
   * @param {number|string} [options.gap='$space.md'] - Space between cells,
   *   both directions unless `rowGap`/`columnGap` override it
   * @param {number|string} [options.rowGap]
   * @param {number|string} [options.columnGap]
   * @param {number} [options.cellWidth] - Fixed cell width; defaults to the
   *   widest child
   * @param {number} [options.cellHeight] - Fixed cell height; defaults to the
   *   tallest child
   * @param {'start'|'center'|'end'|'stretch'} [options.align='stretch'] -
   *   How a child sits inside its cell
   */
  constructor(options = {}) {
    super({ pivot: 'top-left', ...options });
    this.columns = Math.max(1, options.columns ?? 2);
    this.gap = options.gap ?? '$space.md';
    this.rowGap = options.rowGap ?? null;
    this.columnGap = options.columnGap ?? null;
    this.cellWidth = options.cellWidth ?? null;
    this.cellHeight = options.cellHeight ?? null;
    this.align = options.align ?? 'stretch';
  }

  /** Children that take part in layout. */
  get laidOut() {
    return this.children.filter((child) => child.visible);
  }

  #resolve(value, fallback) {
    const resolved = this.theme?.resolve(value ?? fallback) ?? (value ?? fallback);
    return typeof resolved === 'number' ? resolved : 0;
  }

  /** Resolved cell geometry and the gaps between cells. */
  metrics() {
    const children = this.laidOut;
    const columnGap = this.#resolve(this.columnGap ?? this.gap, 0);
    const rowGap = this.#resolve(this.rowGap ?? this.gap, 0);

    let width = this.cellWidth ?? 0;
    let height = this.cellHeight ?? 0;
    if (this.cellWidth == null || this.cellHeight == null) {
      for (const child of children) {
        if (this.cellWidth == null) width = Math.max(width, sizeOf(child, 'width'));
        if (this.cellHeight == null) height = Math.max(height, sizeOf(child, 'height'));
      }
    }

    const rows = Math.ceil(children.length / this.columns) || 0;
    return { width, height, columnGap, rowGap, rows, columns: this.columns };
  }

  layout() {
    const children = this.laidOut;
    const m = this.metrics();
    const pad = this.padding;

    const usedColumns = Math.min(this.columns, Math.max(children.length, 1));
    this.width = pad.left + pad.right +
      usedColumns * m.width + Math.max(0, usedColumns - 1) * m.columnGap;
    this.height = pad.top + pad.bottom +
      m.rows * m.height + Math.max(0, m.rows - 1) * m.rowGap;

    children.forEach((child, index) => {
      const column = index % this.columns;
      const row = Math.floor(index / this.columns);

      child.anchor = 'top-left';
      child.pivot = 'top-left';

      if (this.align === 'stretch') {
        child.width = m.width;
        child.height = m.height;
      }

      // Offsets are measured from the content box, which already excludes
      // padding, so the cell origin is purely the column and row stride.
      child.offsetX = column * (m.width + m.columnGap) +
        offsetIn(this.align, m.width, sizeOf(child, 'width'));
      child.offsetY = row * (m.height + m.rowGap) +
        offsetIn(this.align, m.height, sizeOf(child, 'height'));
    });
  }
}

function sizeOf(child, key) {
  const value = child[key];
  return Number.isFinite(value) ? value : 0;
}

function offsetIn(align, cell, child) {
  switch (align) {
    case 'center': return (cell - child) / 2;
    case 'end': return cell - child;
    default: return 0;
  }
}
