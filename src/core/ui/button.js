import { UIElement } from './uiElement.js';

export class UIButton extends UIElement {
  constructor(x, y, width, height, text, onClick, style = {}) {
    super(x, y);
    this.width = width;
    this.height = height;
    this.text = text;
    this.handleClick = onClick;
    this.backgroundColor = style.backgroundColor || '#000';
    this.hoverColor = style.hoverColor || '#333';
    this.textColor = style.textColor || '#fff';
    this.fontSize = style.fontSize || '16px';
    this.fontFamily = style.fontFamily || 'system-ui';
    this.isHovered = false;
  }

  draw() {
    if (!this.game) return;
    
    const fillStyle = this.isHovered ? this.hoverColor : this.backgroundColor;
    this.game.uiRenderer.drawRect({
      x: this.x - this.width/2,
      y: this.y - this.height/2,
      width: this.width,
      height: this.height,
      fillStyle
    });

    this.game.uiRenderer.drawText({
      text: this.text,
      x: this.x,
      y: this.y,
      fillStyle: this.textColor,
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      textAlign: 'center',
      textBaseline: 'middle'
    });
  }

  onMouseEnter() {
    this.isHovered = true;
    this.game.uiRenderer.setCursor('pointer');
  }

  onMouseLeave() {
    this.isHovered = false;
    this.game.uiRenderer.setCursor('default');
  }

  onClick() {
    if (this.handleClick) {
      this.handleClick();
    }
  }
} 