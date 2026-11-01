import { UIElement } from './uiElement.js';

export class UIRectangle extends UIElement {
  /**
   * @param {Object} [options]
   * @param {boolean} [options.fill=false] - Stretch over the whole UI space
   *   every draw, ignoring position and size. For backgrounds: UI space grows
   *   with the display's aspect ratio, so no fixed design-sized rect can be
   *   relied on to cover it.
   * @param {boolean} [options.interactive=false] - Whether it takes part in hit testing
   */
  constructor(x, y, width, height, color, options = {}) {
    super(x, y, undefined, undefined, options);
    this.width = width;
    this.height = height;
    this.color = color;
    this.fill = options.fill || false;
    this.interactive = options.interactive || false;
  }

  draw() {
    if (!this.game) return;
    const ui = this.game.uiRenderer;
    if (this.fill) {
      ui.drawRect({ x: 0, y: 0, width: ui.width, height: ui.height, fillStyle: this.color });
      return;
    }
    ui.drawRect({
      x: this.x - this.width/2,
      y: this.y - this.height/2,
      width: this.width,
      height: this.height,
      fillStyle: this.color
    });
  }

  contains(x, y) {
    if (!this.interactive) return false;
    return super.contains(x, y);
  }
} 