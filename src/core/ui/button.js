import { UIElement } from './uiElement.js';

export class UIButton extends UIElement {
  constructor(x, y, width, height, text, onClick, style = {}) {
    super(x, y);
    this.width = width;
    this.height = height;
    this.text = text;
    this.handleClick = onClick;
    this.style = {
      backgroundColor: style.backgroundColor || '#000',
      hoverColor: style.hoverColor || '#333',
      textColor: style.textColor || '#fff',
      fontSize: style.fontSize || '16px',
      fontFamily: style.fontFamily || 'system-ui'
    };
  }

  draw() {
    if (!this.game) return;
    
    this.game.uiRenderer.drawButton({
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      text: this.text,
      style: this.style,
      onClick: () => this.onClick()
    });
  }

  onClick() {
    if (this.handleClick) {
      this.handleClick();
    }
  }
} 