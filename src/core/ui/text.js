import { UIElement } from './uiElement.js';

export class UIText extends UIElement {
  constructor(x, y, text, options = {}) {
    super(x, y);
    this.text = text;
    this.fontSize = options.fontSize || '16px';
    this.color = options.color || '#000';
    this.align = options.align || 'left';
  }

  draw() {
    if (!this.game) return;
    this.game.uiRenderer.drawText({
      text: this.text,
      x: this.x,
      y: this.y,
      fillStyle: this.color,
      fontSize: this.fontSize,
      textAlign: this.align,
      textBaseline: 'top'
    });
  }
} 