import { UIElement } from './UIElement.js';

export class Text extends UIElement {
  constructor(x, y, text, options = {}) {
    super(x, y, 0, 0); // Width and height will be calculated
    this.text = text;
    this.color = options.color || '#fff';
    this.fontSize = options.fontSize || '16px';
    this.fontFamily = options.fontFamily || 'system-ui';
    this.align = options.align || 'left';
    this.baseline = options.baseline || 'top';
  }

  draw(ctx) {
    if (!this.visible) return;

    ctx.fillStyle = this.color;
    ctx.font = `${this.fontSize} ${this.fontFamily}`;
    ctx.textAlign = this.align;
    ctx.textBaseline = this.baseline;
    
    if (this.width === 0 || this.height === 0) {
      const metrics = ctx.measureText(this.text);
      this.width = metrics.width;
      this.height = parseInt(this.fontSize);
    }

    ctx.fillText(this.text, this.x, this.y);
  }

  setText(text) {
    this.text = text;
    this.width = 0;
    this.height = 0;
  }
} 