/**
 * A scene's screen-space UI.
 *
 * The container holds elements and answers two questions for the input
 * router: what is under a point, and whether anything here cares about a
 * given event type. It does not dispatch or track hover itself — the router
 * owns that, because hover has to be resolved across the overlay, UI and
 * world bands together rather than one band at a time.
 */
export class Container {
  constructor(game) {
    this.game = game;
    this.elements = new Set();
  }

  clear() {
    this.elements.clear();
  }

  addElement(element) {
    element.setGame(this.game);
    this.elements.add(element);
    return element;
  }

  removeElement(element) {
    this.elements.delete(element);
  }

  /**
   * The topmost element at a UI-space point.
   *
   * Later elements draw over earlier ones, so the search runs backwards and
   * the first hit is the one the player sees on top.
   *
   * @param {number} x - UI-space X
   * @param {number} y - UI-space Y
   * @param {object} [exclude] - Element to skip (the subject of a drop)
   * @returns {object|null}
   */
  hitTest(x, y, exclude = null) {
    const elements = [...this.elements];
    for (let i = elements.length - 1; i >= 0; i--) {
      const element = elements[i];
      if (element === exclude || !element.visible) continue;
      if (element.contains(x, y)) return element;
    }
    return null;
  }

  /** Whether any element would do something with `type`. */
  handles(type) {
    for (const element of this.elements) {
      if (element.visible && element.handles(type)) return true;
    }
    return false;
  }

  update(deltaTime) {
    for (const element of this.elements) {
      element.update(deltaTime);
    }
  }

  draw(deltaTime) {
    for (const element of this.elements) {
      element.draw(deltaTime);
    }
  }
}
