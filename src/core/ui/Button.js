import { UIElement } from './uiElement.js';

export class Button extends UIElement {
  constructor(x, y, width, height, text, onClick) {
    super(x, y, width, height);
    this.text = text;
    this.onClick = onClick;
    this.backgroundColor = '#333';
    this.hoverColor = '#555';
    this.textColor = '#fff';
    this.fontSize = '32px';
    this.fontFamily = 'system-ui';
  }

  draw(ctx) {
    if (!this.visible) return;

    ctx.fillStyle = this.isHovered ? this.hoverColor : this.backgroundColor;
    ctx.fillRect(this.x, this.y, this.width, this.height);

    ctx.fillStyle = this.textColor;
    ctx.font = `${this.fontSize} ${this.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.text, this.x + this.width / 2, this.y + this.height / 2);
  }

  onMouseEnter() {
    document.body.style.cursor = 'pointer';
  }

  onMouseLeave() {
    document.body.style.cursor = 'default';
  }

  destroy() {
    if (this.isHovered) {
      document.body.style.cursor = 'default';
    }
  }
} 