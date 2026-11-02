/**
 * Keyboard and gamepad navigation over a UI subtree.
 *
 * ## Why this is not optional
 *
 * A menu that can only be used with a pointer is not a game menu. Every
 * console release and every AAA PC release is fully navigable with a stick
 * or the arrow keys, and the engine's own menus were pointer-only — the
 * settings overlay tracked a `hoverIndex` and nothing else. Focus is also
 * what a text field needs to know that keystrokes belong to it, so the
 * developer console depends on this too.
 *
 * ## Two ways to move
 *
 * **Sequential** (`Tab`, `Shift+Tab`) walks the tree in draw order, which is
 * the order the author wrote the elements in and usually the order they read
 * in.
 *
 * **Directional** (arrows, d-pad) is geometric: from the focused element's
 * centre, find the nearest candidate that genuinely lies in that direction.
 * Geometry rather than tree order is what lets a two-column grid behave like
 * a grid — pressing right from the left column reaches the thing *beside*
 * it, not the next item in the list.
 *
 * The scoring prefers candidates that overlap the current element on the
 * perpendicular axis, then nearer ones. Without the overlap term, pressing
 * down from a button in a tall column can jump diagonally to a closer button
 * in the next column over, which feels broken even though it is nearer.
 */

/** Perpendicular misalignment counts this much more than distance along the axis. */
const MISALIGNMENT_WEIGHT = 2;

/** Direction vectors, as [axis, sign]. */
const DIRECTIONS = Object.freeze({
  up: ['y', -1],
  down: ['y', 1],
  left: ['x', -1],
  right: ['x', 1]
});

export class FocusManager {
  /**
   * @param {import('./uiElement.js').UIElement} root - Subtree focus is
   *   scoped to. A modal screen owns its own manager, so Tab cannot walk out
   *   of a dialog into the game behind it
   */
  constructor(root) {
    this.root = root;
    /** @type {import('./uiElement.js').UIElement|null} */
    this.focused = null;
    /**
     * Whether focus is being driven by the keyboard. Hovering with a mouse
     * should not paint focus rings everywhere, and tabbing should not be
     * invisible; this is the flag that tells them apart.
     */
    this.keyboardMode = false;
  }

  /**
   * Every focusable element under the root, in draw order.
   * @returns {import('./uiElement.js').UIElement[]}
   */
  candidates() {
    const out = [];
    collect(this.root, out);
    return out;
  }

  /**
   * Give focus to an element, or clear it with `null`.
   * @param {import('./uiElement.js').UIElement|null} element
   */
  focus(element) {
    if (element === this.focused) return element;
    if (this.focused) {
      this.focused.isFocused = false;
      this.focused.onBlur?.();
    }
    this.focused = element ?? null;
    if (this.focused) {
      this.focused.isFocused = true;
      this.focused.onFocus?.();
    }
    return this.focused;
  }

  /** Drop focus. */
  blur() {
    return this.focus(null);
  }

  /**
   * Focus the first candidate, for a screen that has just opened. A menu
   * that opens with nothing selected cannot be used without first pressing
   * a direction, which is a dead end on a controller.
   */
  focusFirst() {
    const [first] = this.candidates();
    return this.focus(first ?? null);
  }

  /**
   * Drop focus if the focused element has gone away — hidden, disabled or
   * removed from the tree. Called each frame by the owning screen, because
   * a focus ring left on a vanished element is a stuck highlight.
   */
  prune() {
    const element = this.focused;
    if (!element) return;
    if (!isFocusable(element) || !isUnder(this.root, element)) this.blur();
  }

  /**
   * Move to the next or previous candidate in draw order, wrapping.
   * @param {number} [step=1] - `-1` for Shift+Tab
   */
  advance(step = 1) {
    const items = this.candidates();
    if (items.length === 0) return this.blur();
    const current = items.indexOf(this.focused);
    // Nothing focused yet: Tab enters at the first item, Shift+Tab at the last.
    const next = current < 0
      ? (step > 0 ? 0 : items.length - 1)
      : (current + step + items.length) % items.length;
    this.keyboardMode = true;
    return this.focus(items[next]);
  }

  /**
   * Move geometrically.
   * @param {'up'|'down'|'left'|'right'} direction
   */
  move(direction) {
    const vector = DIRECTIONS[direction];
    if (!vector) return this.focused;

    const items = this.candidates();
    if (items.length === 0) return this.blur();
    if (!this.focused) {
      this.keyboardMode = true;
      return this.focus(items[0]);
    }

    const [axis, sign] = vector;
    const from = centreOf(this.focused);
    const cross = axis === 'y' ? 'x' : 'y';
    const crossSize = axis === 'y' ? 'width' : 'height';

    let best = null;
    let bestScore = Infinity;
    for (const item of items) {
      if (item === this.focused) continue;
      const to = centreOf(item);

      // Strictly in the chosen direction. A candidate level with the current
      // one is not "down" from it, however close it is.
      const along = (to[axis] - from[axis]) * sign;
      if (along <= 0) continue;

      // How far the two fail to overlap on the perpendicular axis. Boxes
      // that do overlap score zero here, which is what keeps a straight
      // press travelling straight down a column.
      const halfSpan = (sizeOf(this.focused, crossSize) + sizeOf(item, crossSize)) / 2;
      const offset = Math.abs(to[cross] - from[cross]);
      const misalignment = Math.max(0, offset - halfSpan);

      const score = along + misalignment * MISALIGNMENT_WEIGHT;
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    }

    if (!best) return this.focused;
    this.keyboardMode = true;
    return this.focus(best);
  }

  /**
   * Activate the focused element, as a press and release on it.
   *
   * Synthesized as real routed events rather than by calling `onClick`
   * directly, so a control that tracks `isPressed`, or that only implements
   * `onPointerUp`, behaves the same under the keyboard as under a pointer.
   *
   * @param {(type: string, extra?: object) => object} makeEvent - Builds an
   *   input event; supplied by the screen, which has the input manager
   * @returns {boolean} Whether anything was activated
   */
  activate(makeEvent) {
    const element = this.focused;
    if (!element || !isFocusable(element)) return false;
    for (const type of ['pointerdown', 'pointerup', 'click']) {
      element.handleInput(makeEvent(type, { target: element }));
    }
    return true;
  }
}

/** Depth-first in draw order, skipping hidden subtrees. */
function collect(element, out) {
  for (const child of element.children) {
    if (!child.visible) continue;
    if (isFocusable(child)) out.push(child);
    collect(child, out);
  }
}

function isFocusable(element) {
  return element.focusable && element.visible && element.enabled;
}

/** Whether `element` is still somewhere under `root`. */
function isUnder(root, element) {
  for (let node = element; node; node = node.parent) {
    if (node === root) return true;
  }
  return false;
}

function centreOf(element) {
  const frame = element.frame;
  return { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
}

function sizeOf(element, key) {
  const value = element[key];
  return Number.isFinite(value) ? value : 0;
}
