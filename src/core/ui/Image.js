import { UIElement } from './uiElement.js';

export class UIImage extends UIElement {
  constructor(x, y, image, options = {}) {
    super(x, y);
    this.image = image;
    this.width = options.width || image.width;
    this.height = options.height || image.height;
    this.scale = options.scale || 1;
  }

  draw() {
    if (!this.game) return;
    this.game.uiRenderer.drawImage(this.image, this.x, this.y, {
      width: this.width,
      height: this.height,
      scale: this.scale
    });
  }
} 