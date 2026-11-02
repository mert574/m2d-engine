import { UIElement } from './uiElement.js';

/**
 * The root of a scene's screen-space UI.
 *
 * A container is a `UIElement` whose box is the whole of UI space, which is
 * what makes it the thing child anchors resolve against: an element anchored
 * `'bottom-right'` with an offset of `(-20, -20)` lands 20 units in from the
 * real corner of the display, at any aspect ratio.
 *
 * It is otherwise deliberately thin. Before the element tree existed this
 * class owned the flat element list, draw loop and hit test; all three now
 * belong to `UIElement`, and a container is just the element that has no
 * parent. A panel added to it is a container in every sense that matters.
 *
 * The container answers two questions for the input router — what is under a
 * point, and whether anything here cares about a given event type — both
 * inherited. It does not dispatch or track hover itself: the router owns
 * that, because hover has to be resolved across the overlay, UI and world
 * bands together rather than one band at a time.
 */
export class Container extends UIElement {
  /**
   * @param {import('../m2d.js').M2D} game
   * @param {Object} [options] - `padding` insets the whole UI from the
   *   display edge, which is how a game keeps clear of a TV's overscan
   */
  constructor(game, options = {}) {
    super(options);
    this.game = game;
    // The root is attached by definition, so children added to it mount
    // immediately rather than waiting for a parent that will never come.
    this.mounted = true;
  }

  /**
   * The whole of UI space. Overridden because the base implementation
   * derives a frame from `width`, `height` and the pivot, and the root has
   * no size of its own — it *is* the size of the display.
   */
  get frame() {
    const ui = this.game?.uiRenderer;
    if (!ui) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: 0, y: 0, width: ui.width, height: ui.height };
  }

  /**
   * Never a hit target. The root covers the entire screen, so letting it
   * answer a hit test would mean every click anywhere landed on the UI band
   * and nothing in the world could ever be clicked.
   */
  contains() {
    return false;
  }
}
