import { UIElement } from './uiElement.js';

export class UIImage extends UIElement {
  constructor(x, y, image, options = {}) {
    super(x, y, undefined, undefined, options);
    this.image = image;
    this.width = options.width || image.width;
    this.height = options.height || image.height;
    this.scale = options.scale || 1;
  }

  draw() {
    if (!this.game) return;
    const width = this.width * this.scale;
    const height = this.height * this.scale;
    this.game.uiRenderer.drawImage({
      image: this.image,
      x: this.x - width / 2,
      y: this.y - height / 2,
      width,
      height
    });
  }
} 