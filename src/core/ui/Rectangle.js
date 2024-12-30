import { UIElement } from './uiElement.js';

export class UIRectangle extends UIElement {
  constructor(x, y, width, height, color, options = {}) {
    super(x, y);
    this.width = width;
    this.height = height;
    this.color = color;
    this.interactive = options.interactive || false;
  }

  draw() {
    if (!this.game) return;
    this.game.uiRenderer.drawRect({
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